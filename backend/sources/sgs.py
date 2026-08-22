"""Fonte oficial macro — SGS/BCB (api.bcb.gov.br).

Séries: 1178 Selic efetiva (% a.a.), 432 Selic meta, 13522 IPCA 12m, 1 PTAX venda.
Valores chegam como string com vírgula decimal — normalizados para float.
"""
from __future__ import annotations

import datetime as dt

import httpx

WINDOW_DAYS = 7


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
        start = ref_date - dt.timedelta(days=WINDOW_DAYS)
        params = {
            "formato": "json",
            "dataInicial": f"{start:%d/%m/%Y}",
            "dataFinal": f"{ref_date:%d/%m/%Y}",
        }
        out: dict[str, float] = {}
        for sid in self.SERIES:
            url = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{sid}/dados"
            resp = self._client.get(url, params=params)
            if resp.status_code != 200:
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
