"""Fonte oficial B3 — Ajustes do Pregão via arquivo SPRD (Boletim Diário de Mercado).

Endpoint (GET, sem sessão/cookie):
    https://www.b3.com.br/pesquisapregao/download?filelist=SPRD{aammdd}.zip

Estrutura: ZIP externo -> ZIPs internos -> XML BVBG.187.01 (namespace
urn:bvmf.217.01.xsd). Cada contrato é um bloco <PricRpt> com <TckrSymb> e
<FinInstrmAttrbts> (AdjstdQt = PU de ajuste, AdjstdQtTax = taxa % a.a.).
"""
from __future__ import annotations

import datetime as dt
import io
import re
import zipfile
import xml.etree.ElementTree as ET

import httpx

from conventions import BUSINESS_DAYS_PER_YEAR, _count_business_days, is_business_day
from .base import SourceCurve, SourcePoint

# DI1 + letra do mês + 2 dígitos do ano = exatamente 6 chars (não pega opções DPL/D12 etc.)
TICKER_RE = re.compile(r"^DI1([FGHJKMNQUVXZ])(\d{2})$")

MONTH_BY_LETTER = {"F": 1, "G": 2, "H": 3, "J": 4, "K": 5, "M": 6,
                   "N": 7, "Q": 8, "U": 9, "V": 10, "X": 11, "Z": 12}

MIN_PAYLOAD_BYTES = 1024  # payload <1KB = sem pregão (feriado/fim de semana)


def maturity_from_ticker(ticker: str) -> dt.date | None:
    m = TICKER_RE.match(ticker)
    if not m:
        return None
    month = MONTH_BY_LETTER[m.group(1)]
    year = 2000 + int(m.group(2))
    day = 1
    while not is_business_day(dt.date(year, month, day)):
        day += 1
    return dt.date(year, month, day)


class B3FuturesSource:
    """Curva DI futuro (contratos reais DI1) a partir dos ajustes oficiais da B3."""

    def __init__(self, client: httpx.Client | None = None):
        self._client = client or httpx.Client(timeout=30.0)

    def fetch_curve(self, trade_date: dt.date) -> SourceCurve | None:
        url = f"https://www.b3.com.br/pesquisapregao/download?filelist=SPRD{trade_date:%y%m%d}.zip"
        resp = self._client.get(url, timeout=30.0)
        if resp.status_code != 200:
            return None
        data = resp.content
        # resposta pequena/não-zip = dia sem pregão, não é erro
        if len(data) < MIN_PAYLOAD_BYTES or not zipfile.is_zipfile(io.BytesIO(data)):
            return None
        points = self.parse(data, trade_date)
        if not points:
            return None
        return SourceCurve(
            trade_date=trade_date,
            curve_type="DI_FUTURE",
            points=tuple(sorted(points, key=lambda p: p.maturity_date)),
        )

    def parse(self, data: bytes, trade_date: dt.date | None = None) -> tuple[SourcePoint, ...]:
        """Parseia o SPRD zip (offline/testável) e retorna os pontos DI1 ordenados."""
        outer = zipfile.ZipFile(io.BytesIO(data))
        xml_bytes = self._latest_xml(outer)
        if xml_bytes is None:
            return ()
        root = ET.fromstring(xml_bytes)

        if trade_date is None:
            for el in root.iter():
                if self._local(el.tag) == "Dt" and el.text:
                    try:
                        trade_date = dt.date.fromisoformat(el.text.strip())
                        break
                    except ValueError:
                        continue
            if trade_date is None:
                return ()

        points: list[SourcePoint] = []
        for rpt in root.iter():
            if self._local(rpt.tag) != "PricRpt":
                continue
            fields = {self._local(ch.tag): ch for ch in rpt.iter()}

            ticker_el = fields.get("TckrSymb")
            ticker = ticker_el.text.strip() if ticker_el is not None and ticker_el.text else ""
            maturity = maturity_from_ticker(ticker) if ticker else None
            if maturity is None:
                continue

            rate = self._rate_from(fields, trade_date, maturity)
            if rate is None:
                continue
            points.append(SourcePoint(
                vertex_label=ticker,
                maturity_date=maturity,
                rate=rate,
                liquidity_note=None,
            ))
        return tuple(sorted(points, key=lambda p: p.maturity_date))

    @staticmethod
    def _local(tag: str) -> str:
        return tag.rsplit("}", 1)[-1]

    @staticmethod
    def _latest_xml(outer: zipfile.ZipFile) -> bytes | None:
        """ZIP aninhado 2 níveis; pega o ÚLTIMO XML pelo nome ordenado."""
        latest: tuple[str, bytes] | None = None
        for name in sorted(outer.namelist()):
            try:
                inner = zipfile.ZipFile(io.BytesIO(outer.read(name)))
            except zipfile.BadZipFile:
                continue
            xml_names = [n for n in inner.namelist() if n.lower().endswith(".xml")]
            if not xml_names:
                continue
            xml_name = sorted(xml_names)[-1]
            candidate = (xml_name, inner.read(xml_name))
            if latest is None or candidate[0] > latest[0]:
                latest = candidate
        return latest[1] if latest else None

    @staticmethod
    def _rate_from(fields: dict, trade_date: dt.date, maturity: dt.date) -> float | None:
        tax_el = fields.get("AdjstdQtTax")
        if tax_el is not None and tax_el.text and tax_el.text.strip():
            return float(tax_el.text.strip()) / 100.0
        pu_el = fields.get("AdjstdQt")
        if pu_el is not None and pu_el.text and pu_el.text.strip():
            pu = float(pu_el.text.strip())
            du = _count_business_days(trade_date, maturity)
            if pu > 0 and du > 0:
                return (100_000.0 / pu) ** (BUSINESS_DAYS_PER_YEAR / du) - 1.0
        return None
