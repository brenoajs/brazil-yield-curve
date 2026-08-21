"""Ingestor: carrega curvas da fonte para o banco."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import CurvePoint, CurveSnapshot, MacroIndicator
from sources import MockBCBSource, MockB3Source


def ingest_curve(session: Session, source: MockB3Source, trade_date: dt.date) -> CurveSnapshot | None:
    curve = source.fetch_curve(trade_date)
    if curve is None:
        return None
    existing = session.execute(
        select(CurveSnapshot).where(CurveSnapshot.trade_date == trade_date, CurveSnapshot.curve_type == curve.curve_type)
    ).scalar_one_or_none()
    if existing:
        return existing
    snap = CurveSnapshot(trade_date=trade_date, curve_type=curve.curve_type, source="mock")
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


def ingest_macro(session: Session, bcb: MockBCBSource, ref_date: dt.date) -> None:
    existing = session.execute(
        select(MacroIndicator).where(MacroIndicator.ref_date == ref_date)
    ).scalars().first()
    if existing:
        return
    for code, value in bcb.fetch_macro(ref_date).items():
        session.add(MacroIndicator(indicator_code=code, ref_date=ref_date, value=value))


def seed_history(session: Session, days: int = 10, end_date: dt.date | None = None) -> list[dt.date]:
    """Popula histórico dos últimos N pregões (dias úteis)."""
    src = MockB3Source()
    bcb = MockBCBSource()
    d = end_date or dt.date.today()
    seeded = []
    while len(seeded) < days:
        if d.weekday() < 5:
            snap = ingest_curve(session, src, d)
            if snap is not None and d not in seeded:
                ingest_macro(session, bcb, d)
                seeded.append(d)
        d -= dt.timedelta(days=1)
    session.commit()
    return sorted(seeded)
