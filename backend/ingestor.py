"""Ingestor: carrega curvas da fonte para o banco."""
from __future__ import annotations

import datetime as dt
import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import CurvePoint, CurveSnapshot, MacroIndicator
from sources import B3FuturesSource, CurveSource, MockB3Source, MockBCBSource, SgsSource


def _resolve_source(source: str | None) -> tuple[CurveSource, MockBCBSource | SgsSource, str]:
    """Parâmetro explícito > env BYC_SOURCE > default 'official'."""
    name = source or os.environ.get("BYC_SOURCE", "official")
    if name == "official":
        return B3FuturesSource(), SgsSource(), "b3_sprd"
    if name == "mock":
        return MockB3Source(), MockBCBSource(), "mock"
    raise ValueError(f"fonte desconhecida: {name!r} (use 'official' ou 'mock')")


def ingest_curve(session: Session, source: CurveSource, trade_date: dt.date, source_name: str = "mock") -> CurveSnapshot | None:
    curve = source.fetch_curve(trade_date)
    if curve is None:
        return None
    existing = session.execute(
        select(CurveSnapshot).where(CurveSnapshot.trade_date == trade_date, CurveSnapshot.curve_type == curve.curve_type)
    ).scalar_one_or_none()
    if existing:
        for old in session.execute(
            select(CurvePoint).where(CurvePoint.snapshot_id == existing.id)
        ).scalars().all():
            session.delete(old)
        session.flush()
        snap = existing
    else:
        snap = CurveSnapshot(trade_date=trade_date, curve_type=curve.curve_type, source=source_name)
        session.add(snap)
        session.flush()
    for p in curve.points:
        session.add(CurvePoint(
            snapshot_id=snap.id,
            vertex_label=p.vertex_label,
            maturity_date=p.maturity_date,
            rate=p.rate,
            interpolated=False,
            liquidity_note=p.liquidity_note,
        ))
    return snap


def ingest_macro(session: Session, bcb: MockBCBSource | SgsSource, ref_date: dt.date) -> None:
    for code, value in bcb.fetch_macro(ref_date).items():
        existing = session.execute(
            select(MacroIndicator).where(MacroIndicator.indicator_code == code, MacroIndicator.ref_date == ref_date)
        ).scalar_one_or_none()
        if existing:
            session.delete(existing)
            session.flush()
        session.add(MacroIndicator(indicator_code=code, ref_date=ref_date, value=value))


def seed_history(session: Session, days: int = 10, end_date: dt.date | None = None, source: str | None = None) -> list[dt.date]:
    """Popula histórico dos últimos N pregões (dias úteis).

    Fonte resolvida por: parâmetro > env BYC_SOURCE > 'official'.
    Dia sem arquivo na fonte oficial apenas avança o calendário.
    """
    src, bcb, source_name = _resolve_source(source)
    d = end_date or dt.date.today()
    seeded = []
    while len(seeded) < days and d >= dt.date(2000, 1, 1):
        if d.weekday() < 5:
            snap = ingest_curve(session, src, d, source_name=source_name)
            if snap is not None and d not in seeded:
                ingest_macro(session, bcb, d)
                seeded.append(d)
        d -= dt.timedelta(days=1)
    session.commit()
    return sorted(seeded)
