"""Convenções numéricas do projeto (base 252 dias úteis, capitalização exponencial)."""
from __future__ import annotations

from datetime import date

BUSINESS_DAYS_PER_YEAR = 252


def year_fraction(start: date, end: date, business_days: int | None = None) -> float:
    """Fração de ano em dias úteis (base 252). Fins de semana não contam."""
    if end < start:
        raise ValueError("end antes de start")
    if business_days is None:
        business_days = _count_business_days(start, end)
    return business_days / BUSINESS_DAYS_PER_YEAR


def _count_business_days(start: date, end: date) -> int:
    days = 0
    d = start
    step = 1
    # contagem inclusiva do fim, exclusiva do início (convenção DI)
    while d < end:
        d = date.fromordinal(d.toordinal() + step)
        if d.weekday() < 5:
            days += 1
    return days


def discount_factor(rate: float, t: float) -> float:
    """Fator de desconto exponencial (1+y)^(-t)."""
    return (1.0 + rate) ** (-t)


def forward_rate(r1: float, r2: float, t1: float, t2: float) -> float:
    """Forward exponencial entre t1 e t2 a partir de taxas spot."""
    if t2 <= t1:
        raise ValueError("t2 deve ser maior que t1")
    return ((1.0 + r2) ** t2 / (1.0 + r1) ** t1) ** (1.0 / (t2 - t1)) - 1.0


def interpolate_linear(points: list[tuple[float, float]], t: float) -> tuple[float, bool]:
    """Interpolação linear em y vs t. Retorna (taxa, interpolated).

    Sem extrapolação: fora do domínio levanta ValueError.
    """
    pts = sorted(points)
    if not pts:
        raise ValueError("sem pontos")
    if t < pts[0][0] or t > pts[-1][0]:
        raise ValueError(f"t={t} fora do domínio [{pts[0][0]}, {pts[-1][0]}]")
    for i in range(len(pts) - 1):
        t0, y0 = pts[i]
        t1, y1 = pts[i + 1]
        if t0 <= t <= t1:
            if t == t0:
                return y0, False
            if t == t1:
                return y1, False
            w = (t - t0) / (t1 - t0)
            return y0 + w * (y1 - y0), True
    return pts[-1][1], False


def delta_pb(new_rate: float, old_rate: float) -> float:
    """Variação em pontos-base."""
    return round((new_rate - old_rate) * 10000.0, 2)
