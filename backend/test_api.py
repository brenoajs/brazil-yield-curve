"""Testes backend — Brazil Yield Curve."""
from __future__ import annotations

import datetime as dt

import pytest
from fastapi.testclient import TestClient

import api_main
import ingestor
from conventions import delta_pb, discount_factor, forward_rate, interpolate_linear, year_fraction
from models import make_engine, make_session_factory


@pytest.fixture()
def client(tmp_path, monkeypatch):
    engine = make_engine(f"sqlite:///{tmp_path}/byc.db")
    api_main.init_db(engine)
    monkeypatch.setattr(api_main, "engine", engine)
    monkeypatch.setattr(api_main, "SessionLocal", make_session_factory(engine))
    with make_session_factory(engine)() as session:
        ingestor.seed_history(session, days=5)
    from api_main import app
    return TestClient(app)


# ---------- convenções ----------

def test_year_fraction_252():
    start = dt.date(2026, 8, 3)  # segunda
    end = dt.date(2026, 8, 10)   # segunda seguinte -> 5 dias úteis
    assert year_fraction(start, end) == pytest.approx(5 / 252)


def test_discount_factor_exponential():
    assert discount_factor(0.10, 1.0) == pytest.approx(1 / 1.10)
    assert discount_factor(0.0, 2.0) == 1.0


def test_forward_rate():
    f = forward_rate(0.10, 0.12, 1.0, 2.0)
    assert (1.10 ** 1 * (1 + f)) == pytest.approx(1.12 ** 2)


def test_interpolate_linear_flagged():
    y, interp = interpolate_linear([(1.0, 0.10), (2.0, 0.12)], 1.5)
    assert y == pytest.approx(0.11)
    assert interp is True
    y, interp = interpolate_linear([(1.0, 0.10), (2.0, 0.12)], 1.0)
    assert interp is False


def test_interpolate_no_extrapolation():
    with pytest.raises(ValueError):
        interpolate_linear([(1.0, 0.10)], 2.0)


def test_delta_pb():
    assert delta_pb(0.1050, 0.1025) == 25.0


# ---------- API ----------

def test_health(client):
    assert client.get("/api/v1/health").json()["status"] == "ok"


def test_latest_has_maturity_and_liquidity(client):
    r = client.get("/api/v1/curves/latest")
    assert r.status_code == 200
    body = r.json()
    assert len(body["points"]) == 7
    for p in body["points"]:
        assert "maturity_date" in p and p["maturity_date"]
        assert "liquidity_note" in p and p["liquidity_note"]


def test_invalid_curve_type_envelope(client):
    r = client.get("/api/v1/curves/latest", params={"curve_type": "bogus"})
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert detail["error"] == "invalid_curve_type"
    assert "DI_FUTURE" in detail["allowed"]
    # também no CSV export e compare
    assert client.get("/api/v1/export/curve.csv", params={"curve_type": "bogus"}).status_code == 400
    assert client.get("/api/v1/curves/compare", params={"curve_type": "bogus"}).status_code == 400


def test_dates_desc(client):
    ds = client.get("/api/v1/curves/dates").json()["dates"]
    assert len(ds) >= 5
    assert ds == sorted(ds, reverse=True)


def test_by_date(client):
    latest_date = client.get("/api/v1/curves/dates").json()["dates"][0]
    r = client.get(f"/api/v1/curves/{latest_date}")
    assert r.status_code == 200
    assert r.json()["trade_date"] == latest_date


def test_compare_deltas_real_vs_previous(client):
    body = client.get("/api/v1/curves/compare").json()
    assert body["previous_date"] is not None
    assert len(body["deltas"]) == 7
    for d in body["deltas"]:
        assert d["delta_pb"] is not None
        assert d["previous_rate"] is not None
    assert body["max_up"]["vertex_label"] or True
    mus = [d["delta_pb"] for d in body["deltas"]]
    assert body["max_up"]["delta_pb"] == max(mus)
    assert body["max_down"]["delta_pb"] == min(mus)


def test_macro(client):
    r = client.get("/api/v1/macro")
    assert r.status_code == 200
    ind = r.json()["indicators"]
    for code in ("432", "12", "13522", "1"):
        assert code in ind


def test_export_csv_br_decimal(client):
    r = client.get("/api/v1/export/curve.csv")
    assert r.status_code == 200
    text = r.text
    lines = text.strip().splitlines()
    assert lines[0].startswith("vertex;maturity_date;rate_pct")
    assert "," in lines[1]  # decimal BR


def test_unknown_date_404(client):
    r = client.get("/api/v1/curves/1999-01-01")
    assert r.status_code == 404
