"""Adaptadores de fonte de dados (B3/BCB) — mock offline e fontes oficiais."""
from __future__ import annotations

from .base import CurveSource, SourceCurve, SourcePoint
from .b3_futures import B3FuturesSource, MONTH_BY_LETTER, maturity_from_ticker
from .mock import VERTEX_MONTHS, MockB3Source, MockBCBSource, maturity_for
from .sgs import SgsSource

__all__ = [
    "SourcePoint",
    "SourceCurve",
    "CurveSource",
    "VERTEX_MONTHS",
    "maturity_for",
    "MockB3Source",
    "MockBCBSource",
    "B3FuturesSource",
    "MONTH_BY_LETTER",
    "maturity_from_ticker",
    "SgsSource",
]
