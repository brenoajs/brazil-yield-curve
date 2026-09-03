"""Ingestor: carrega curvas da fonte para o banco."""
from __future__ import annotations

import datetime as dt
import logging
import os
import time

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import CurvePoint, CurveSnapshot, MacroIndicator
from sources import B3FuturesSource, CurveSource, MockB3Source, MockBCBSource, SgsSource

log = logging.getLogger(__name__)

# Retry contra instabilidade transitória da B3/SGS (um ReadTimeout no meio de
# uma carga de centenas de dias não pode abortar tudo). Backoff em constante
# de módulo para os testes zerarem sem espera real.
FETCH_ATTEMPTS = 4
FETCH_BACKOFF_S = (1.0, 2.0, 4.0)


def _with_retry(desc: str, fn):
    """Executa fn() com retry só para erro de transporte HTTP."""
    last: Exception | None = None
    for attempt in range(1, FETCH_ATTEMPTS + 1):
        try:
            return fn()
        except httpx.HTTPError as e:
            last = e
            log.warning("seed: %s tentativa %s/%s falhou (%s: %s)",
                        desc, attempt, FETCH_ATTEMPTS, type(e).__name__, e)
            if attempt < FETCH_ATTEMPTS:
                time.sleep(FETCH_BACKOFF_S[attempt - 1])
    raise last  # type: ignore[misc]


def _resolve_source(source: str | None) -> tuple[CurveSource, MockBCBSource | SgsSource, str]:
    """Parâmetro explícito > env BYC_SOURCE > default 'official'."""
    name = source or os.environ.get("BYC_SOURCE", "official")
    if name == "official":
        return B3FuturesSource(), SgsSource(), "b3_sprd"
    if name == "mock":
        return MockB3Source(), MockBCBSource(), "mock"
    raise ValueError(f"fonte desconhecida: {name!r} (use 'official' ou 'mock')")


def ingest_curve(session: Session, source: CurveSource, trade_date: dt.date, source_name: str = "mock") -> CurveSnapshot | None:
    curve = _with_retry(f"curva {trade_date}", lambda: source.fetch_curve(trade_date))
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
    for code, value in _with_retry(f"macro {ref_date}", lambda: bcb.fetch_macro(ref_date)).items():
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
    Commit por dia + skip com log em falha persistente: a função é idempotente,
    então uma nova execução retoma de onde parou e preenche as lacunas.
    """
    src, bcb, source_name = _resolve_source(source)
    d = end_date or dt.date.today()
    seeded = []
    while len(seeded) < days and d >= dt.date(2000, 1, 1):
        if d.weekday() < 5:
            try:
                snap = ingest_curve(session, src, d, source_name=source_name)
            except Exception:
                log.exception("seed: dia %s falhou após retries, pulando", d)
                snap = None
            if snap is not None and d not in seeded:
                try:
                    ingest_macro(session, bcb, d)
                except Exception:
                    log.exception("seed: macro %s falhou, mantendo a curva", d)
                session.commit()
                seeded.append(d)
        d -= dt.timedelta(days=1)
    return sorted(seeded)
