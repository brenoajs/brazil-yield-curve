"""Convenções numéricas do projeto (base 252 dias úteis, capitalização exponencial)."""
from __future__ import annotations

import datetime as dt
from datetime import date

BUSINESS_DAYS_PER_YEAR = 252


def _easter(year: int) -> date:
    """Páscoa (algoritmo anônimo/Gauss) para cálculo dos feriados móveis."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def _national_holidays(start_year: int, end_year: int) -> frozenset[date]:
    holidays: set[date] = set()
    for y in range(start_year, end_year + 1):
        easter = _easter(y)
        holidays.update({
            date(y, 1, 1),    # Confraternização Universal
            date(y, 4, 21),   # Tiradentes
            date(y, 5, 1),    # Dia do Trabalho
            date(y, 9, 7),    # Independência
            date(y, 10, 12),  # Nossa Senhora Aparecida
            date(y, 11, 2),   # Finados
            date(y, 11, 15),  # Proclamação da República
            date(y, 11, 20),  # Consciência Negra
            date(y, 12, 25),  # Natal
            easter - dt.timedelta(days=48),  # Carnaval (segunda)
            easter - dt.timedelta(days=47),  # Carnaval (terça)
            easter - dt.timedelta(days=2),   # Sexta-feira Santa
            easter + dt.timedelta(days=60),  # Corpus Christi
        })
    return frozenset(holidays)


HOLIDAYS: frozenset[date] = _national_holidays(2026, 2035)
# calendário nacional simples ≠ ANBIMA/B3 completo — suficiente para o MVP


def is_business_day(d: date) -> bool:
    return d.weekday() < 5 and d not in HOLIDAYS


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
        if is_business_day(d):
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
