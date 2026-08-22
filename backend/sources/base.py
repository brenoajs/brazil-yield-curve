"""Tipos compartilhados dos adaptadores de fonte (Protocol + dataclasses)."""
from __future__ import annotations

import datetime as dt
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
