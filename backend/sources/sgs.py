"""Fonte oficial macro — SGS/BCB (api.bcb.gov.br).

Séries: 1178 Selic efetiva (% a.a.), 432 Selic meta, 13522 IPCA 12m, 1 PTAX venda.
Valores chegam como string; em formato=json o separador decimal é ponto ("4.44"),
mas _to_float também aceita a forma pt-BR com vírgula por segurança.

A busca é por janela de datas (não por /dados/ultimos/N) porque seed_history ingere
macro para cada pregão histórico: o valor precisa ser o vigente naquela data, não o
de hoje.
"""
from __future__ import annotations

import datetime as dt
import logging

import httpx

log = logging.getLogger(__name__)

# Janela de lookback por série, dimensionada pela cadência de publicação.
# 13522 é MENSAL e cada observação é datada no dia 1º do mês de referência, com
# atraso de publicação (o IPCA do mês M sai por volta do dia 10 de M+1). No pior
# caso — início de setembro, antes da divulgação — o ponto mais recente é 01/07,
# a 66 dias. 180 dias dão folga sem custo relevante de resposta.
# As demais são diárias: 30 dias cobrem fim de semana emendado com feriado longo
# (1178 e 1 não publicam em fim de semana).
LOOKBACK_DAYS = {"13522": 180}
DEFAULT_LOOKBACK_DAYS = 30


def _to_float(raw: str) -> float:
    """Converte '13,7' / '1.234,56' (pt-BR) para float."""
    s = raw.strip()
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    return float(s)


class SgsSource:
    SERIES = {
        "1178": "Selic efetiva (% a.a.)",
        "432": "Selic meta",
        "13522": "IPCA 12m",
        "1": "PTAX venda",
    }

    def __init__(self, client: httpx.Client | None = None):
        self._client = client or httpx.Client(timeout=30.0)

    def fetch_macro(self, ref_date: dt.date) -> dict[str, float]:
        out: dict[str, float] = {}
        for sid in self.SERIES:
            # A janela é montada por série: uma janela única para todas fazia a série
            # mensal 13522 nunca alcançar seu ponto (datado no dia 1º) e sumir do KPI.
            start = ref_date - dt.timedelta(days=LOOKBACK_DAYS.get(sid, DEFAULT_LOOKBACK_DAYS))
            params = {
                "formato": "json",
                "dataInicial": f"{start:%d/%m/%Y}",
                "dataFinal": f"{ref_date:%d/%m/%Y}",
            }
            url = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{sid}/dados"
            resp = self._client.get(url, params=params)
            if resp.status_code == 404:
                # O SGS responde 404 (não lista vazia) quando não há observação na
                # janela. Ausência legítima, mas registrada: silenciar isso foi
                # exatamente o que escondeu o IPCA ausente.
                log.warning("SGS série %s sem observação em %s..%s", sid,
                            f"{start:%d/%m/%Y}", f"{ref_date:%d/%m/%Y}")
                continue
            if resp.status_code != 200:
                log.warning("SGS série %s respondeu HTTP %s", sid, resp.status_code)
                continue
            rows = resp.json()
            best: tuple[dt.date, float] | None = None
            for row in rows:
                d = dt.datetime.strptime(row["data"], "%d/%m/%Y").date()
                if d <= ref_date and (best is None or d >= best[0]):
                    best = (d, _to_float(row["valor"]))
            if best is not None:
                out[sid] = best[1]
        return out
