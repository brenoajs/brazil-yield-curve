"""Adaptadores de fonte de dados (B3/BCB) com mock tipado offline."""
from __future__ import annotations

import datetime as dt
import random
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class SourcePoint:
    vertex_label: str
    maturity_date: dt.date
    rate: float  # decimal anualizado base 252
    liquidity_note: str | None = None


@dataclass(frozen=True)
class SourceCurve:
    trade_date: dt.date
    curve_type: str = "DI_FUTURE"
    points: tuple[SourcePoint, ...] = ()


class CurveSource(Protocol):
    def fetch_curve(self, trade_date: dt.date) -> SourceCurve | None: ...


# Vértices MVP: 3m, 6m, 1a, 2a, 3a, 5a, 10a
VERTEX_MONTHS = {"3m": 3, "6m": 6, "1a": 12, "2a": 24, "3a": 36, "5a": 60, "10a": 120}


def maturity_for(trade_date: dt.date, label: str) -> dt.date:
    months = VERTEX_MONTHS[label]
    y = trade_date.year + (trade_date.month - 1 + months) // 12
    m = (trade_date.month - 1 + months) % 12 + 1
    day = min(trade_date.day, [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])
    return dt.date(y, m, day)


class MockB3Source:
    """Fonte mock tipada — testes rodam offline e reproduzem os contratos."""

    BASE_RATES = {
        "3m": 0.1040, "6m": 0.1035, "1a": 0.1028,
        "2a": 0.1022, "3a": 0.1025, "5a": 0.1034, "10a": 0.1050,
    }

    def __init__(self, seed: int = 42):
        self._rng = random.Random(seed)

    def fetch_curve(self, trade_date: dt.date) -> SourceCurve | None:
        # fins de semana não têm pregão
        if trade_date.weekday() >= 5:
            return None
        day_shift = self._rng.uniform(-0.0015, 0.0015)
        points = []
        for label in VERTEX_MONTHS:
            jitter = self._rng.uniform(-0.0004, 0.0004)
            note = "contrato DI1 líquido" if label in ("1a", "2a", "3a") else "liquidez reduzida"
            points.append(SourcePoint(
                vertex_label=label,
                maturity_date=maturity_for(trade_date, label),
                rate=round(self.BASE_RATES[label] + day_shift + jitter, 6),
                liquidity_note=note,
            ))
        return SourceCurve(trade_date=trade_date, curve_type="DI_FUTURE", points=tuple(points))


class MockBCBSource:
    """Macro BCB SGS: 432 (IPCA 12m), 12 (Selic), 13522 (câmbio PTAX), 1 (Selic alvo)."""

    CODES = ("432", "12", "13522", "1")

    def fetch_macro(self, ref_date: dt.date) -> dict[str, float]:
        rng = random.Random(ref_date.toordinal())
        return {
            "432": round(rng.uniform(3.5, 6.5), 2),      # IPCA 12m %
            "12": round(rng.uniform(10.0, 15.0), 2),     # Selic %
            "13522": round(rng.uniform(4.8, 6.2), 4),    # USD/BRL
            "1": round(rng.uniform(10.0, 15.0), 2),      # Selic alvo %
        }
