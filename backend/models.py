"""Modelos SQLAlchemy — Brazil Yield Curve."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import Date, DateTime, Float, Integer, String, UniqueConstraint, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class CurveSnapshot(Base):
    __tablename__ = "curve_snapshots"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trade_date: Mapped[dt.date] = mapped_column(Date, index=True)
    curve_type: Mapped[str] = mapped_column(String(32), index=True)  # DI_FUTURE | NOMINAL | REAL | IMPLICIT
    source: Mapped[str] = mapped_column(String(64), default="mock")
    ingested_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)
    __table_args__ = (UniqueConstraint("trade_date", "curve_type", name="uq_date_curve"),)


class CurvePoint(Base):
    __tablename__ = "curve_points"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_id: Mapped[int] = mapped_column(Integer, index=True)
    vertex_label: Mapped[str] = mapped_column(String(8))  # 3m, 6m, 1a ...
    maturity_date: Mapped[dt.date] = mapped_column(Date)
    rate: Mapped[float] = mapped_column(Float)  # decimal anualizado base 252
    interpolated: Mapped[bool] = mapped_column(default=False)
    liquidity_note: Mapped[str | None] = mapped_column(String(128), nullable=True)


class MacroIndicator(Base):
    __tablename__ = "macro_indicators"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    indicator_code: Mapped[str] = mapped_column(String(16), index=True)  # SGS 432, 12, 13522, 1
    ref_date: Mapped[dt.date] = mapped_column(Date)
    value: Mapped[float] = mapped_column(Float)


def make_engine(db_url: str = "sqlite:///./byc.db"):
    return create_engine(db_url, connect_args={"check_same_thread": False} if db_url.startswith("sqlite") else {})


def init_db(engine) -> None:
    Base.metadata.create_all(engine)


def make_session_factory(engine):
    return sessionmaker(bind=engine, expire_on_commit=False)
