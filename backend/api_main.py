"""API FastAPI — Brazil Yield Curve (/api/v1)."""
from __future__ import annotations

import csv
import datetime as dt
import io
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from models import CurvePoint, CurveSnapshot, MacroIndicator, init_db, make_engine, make_session_factory

VALID_CURVE_TYPES = ("DI_FUTURE", "NOMINAL", "REAL", "IMPLICIT")


class PointOut(BaseModel):
    vertex_label: str
    maturity_date: dt.date
    rate: float
    interpolated: bool
    liquidity_note: str | None


class CurveOut(BaseModel):
    trade_date: dt.date
    curve_type: str
    points: list[PointOut]


class CompareDelta(BaseModel):
    vertex_label: str
    maturity_date: dt.date
    rate: float
    previous_rate: float | None
    delta_pb: float | None


class CompareOut(BaseModel):
    trade_date: dt.date
    previous_date: dt.date | None
    deltas: list[CompareDelta]
    max_up: CompareDelta | None = None
    max_down: CompareDelta | None = None


class MacroOut(BaseModel):
    ref_date: dt.date
    indicators: dict[str, float]


def _get_snapshot(session, curve_type: str, trade_date: dt.date) -> CurveSnapshot:
    snap = session.execute(
        select(CurveSnapshot)
        .where(CurveSnapshot.trade_date == trade_date, CurveSnapshot.curve_type == curve_type)
    ).scalars().first()
    if not snap:
        raise HTTPException(status_code=404, detail={"error": "curve_not_found", "trade_date": str(trade_date)})
    return snap


def _points(session, snap: CurveSnapshot) -> list[CurvePoint]:
    pts = session.execute(
        select(CurvePoint).where(CurvePoint.snapshot_id == snap.id).order_by(CurvePoint.maturity_date)
    ).scalars().all()
    return list(pts)


def _point_out(p: CurvePoint) -> PointOut:
    return PointOut(vertex_label=p.vertex_label, maturity_date=p.maturity_date, rate=p.rate,
                    interpolated=bool(p.interpolated), liquidity_note=p.liquidity_note)


def _latest_date(session, curve_type: str) -> dt.date | None:
    return session.execute(select(CurveSnapshot.trade_date).where(CurveSnapshot.curve_type == curve_type)
                           .order_by(CurveSnapshot.trade_date.desc())).scalars().first()


def create_app(db_url: str = "sqlite:///./byc.db") -> FastAPI:
    app = FastAPI(title="Brazil Yield Curve API", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # endurecer pós-MVP: restringir à origem do frontend
        allow_methods=["*"],
        allow_headers=["*"],
    )

    engine = make_engine(db_url)
    init_db(engine)
    SessionLocal = make_session_factory(engine)

    @app.get("/api/v1/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/v1/curves/latest")
    def latest(curve_type: str = Query(default="DI_FUTURE")) -> CurveOut:
        if curve_type not in VALID_CURVE_TYPES:
            raise HTTPException(status_code=400, detail={
                "error": "invalid_curve_type",
                "message": f"curve_type '{curve_type}' inválido",
                "allowed": list(VALID_CURVE_TYPES),
            })
        with SessionLocal() as session:
            d = _latest_date(session, curve_type)
            if d is None:
                raise HTTPException(status_code=404, detail={"error": "no_data"})
            snap = _get_snapshot(session, curve_type, d)
            return CurveOut(trade_date=snap.trade_date, curve_type=curve_type,
                            points=[_point_out(p) for p in _points(session, snap)])

    @app.get("/api/v1/curves/dates")
    def dates(curve_type: str = Query(default="DI_FUTURE")) -> dict[str, Any]:
        if curve_type not in VALID_CURVE_TYPES:
            raise HTTPException(status_code=400, detail={
                "error": "invalid_curve_type", "allowed": list(VALID_CURVE_TYPES)})
        with SessionLocal() as session:
            ds = session.execute(select(CurveSnapshot.trade_date).where(CurveSnapshot.curve_type == curve_type)
                                 .order_by(CurveSnapshot.trade_date.desc())).scalars().all()
            return {"dates": [str(d) for d in ds]}

    @app.get("/api/v1/curves/compare")
    def compare(trade_date: dt.date | None = Query(default=None), curve_type: str = Query(default="DI_FUTURE")) -> CompareOut:
        if curve_type not in VALID_CURVE_TYPES:
            raise HTTPException(status_code=400, detail={
                "error": "invalid_curve_type", "allowed": list(VALID_CURVE_TYPES)})
        with SessionLocal() as session:
            d = trade_date or _latest_date(session, curve_type)
            if d is None:
                raise HTTPException(status_code=404, detail={"error": "no_data"})
            prev_dates = session.execute(
                select(CurveSnapshot.trade_date).where(
                    CurveSnapshot.curve_type == curve_type, CurveSnapshot.trade_date < d)
                .order_by(CurveSnapshot.trade_date.desc()).limit(1)).scalars().first()
            cur_pts = _points(session, _get_snapshot(session, curve_type, d))
            prev_map: dict[str, CurvePoint] = {}
            if prev_dates:
                prev_map = {p.vertex_label: p for p in _points(session, _get_snapshot(session, curve_type, prev_dates))}
            deltas = []
            for p in cur_pts:
                pp = prev_map.get(p.vertex_label)
                deltas.append(CompareDelta(
                    vertex_label=p.vertex_label, maturity_date=p.maturity_date, rate=p.rate,
                    previous_rate=pp.rate if pp else None,
                    delta_pb=round((p.rate - pp.rate) * 10000, 2) if pp else None))
            with_delta = [x for x in deltas if x.delta_pb is not None]
            max_up = max(with_delta, key=lambda x: x.delta_pb) if with_delta else None
            max_down = min(with_delta, key=lambda x: x.delta_pb) if with_delta else None
            return CompareOut(trade_date=d, previous_date=prev_dates, deltas=deltas,
                              max_up=max_up, max_down=max_down)

    @app.get("/api/v1/curves/{trade_date}")
    def by_date(trade_date: dt.date, curve_type: str = Query(default="DI_FUTURE")) -> CurveOut:
        if curve_type not in VALID_CURVE_TYPES:
            raise HTTPException(status_code=400, detail={
                "error": "invalid_curve_type", "allowed": list(VALID_CURVE_TYPES)})
        with SessionLocal() as session:
            snap = _get_snapshot(session, curve_type, trade_date)
            return CurveOut(trade_date=snap.trade_date, curve_type=curve_type,
                            points=[_point_out(p) for p in _points(session, snap)])

    @app.get("/api/v1/macro")
    def macro(ref_date: dt.date | None = Query(default=None)) -> MacroOut:
        with SessionLocal() as session:
            q = select(MacroIndicator.ref_date).order_by(MacroIndicator.ref_date.desc()).limit(1)
            if ref_date:
                q = select(MacroIndicator.ref_date).where(MacroIndicator.ref_date <= ref_date)\
                    .order_by(MacroIndicator.ref_date.desc()).limit(1)
            d = session.execute(q).scalars().first()
            if d is None:
                raise HTTPException(status_code=404, detail={"error": "no_macro_data"})
            rows = session.execute(select(MacroIndicator).where(MacroIndicator.ref_date == d)).scalars().all()
            return MacroOut(ref_date=d, indicators={r.indicator_code: r.value for r in rows})

    @app.get("/api/v1/export/curve.csv")
    def export_csv(trade_date: dt.date | None = Query(default=None), curve_type: str = Query(default="DI_FUTURE")):
        if curve_type not in VALID_CURVE_TYPES:
            raise HTTPException(status_code=400, detail={
                "error": "invalid_curve_type", "allowed": list(VALID_CURVE_TYPES)})
        with SessionLocal() as session:
            d = trade_date or _latest_date(session, curve_type)
            if d is None:
                raise HTTPException(status_code=404, detail={"error": "no_data"})
            pts = _points(session, _get_snapshot(session, curve_type, d))
            buf = io.StringIO()
            w = csv.writer(buf, delimiter=";")
            w.writerow(["vertex", "maturity_date", "rate_pct", "interpolated", "liquidity_note"])
            for p in pts:
                rate_br = f"{p.rate * 100:.3f}".replace(".", ",")
                w.writerow([p.vertex_label, p.maturity_date.isoformat(), rate_br,
                            "sim" if p.interpolated else "nao", p.liquidity_note or ""])
            buf.seek(0)
            return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                                     headers={"Content-Disposition": f'attachment; filename="curve_{d}.csv"'})

    return app


app = create_app()
