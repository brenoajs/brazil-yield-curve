"""Testes backend — Brazil Yield Curve."""
from __future__ import annotations

import datetime as dt
import json
import zipfile
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from api_main import create_app
from conventions import delta_pb, discount_factor, forward_rate, interpolate_linear, is_business_day, year_fraction
from ingestor import seed_history
from models import init_db, make_engine, make_session_factory


@pytest.fixture()
def client(tmp_path):
    db_url = f"sqlite:///{tmp_path}/byc.db"
    engine = make_engine(db_url)
    init_db(engine)
    with make_session_factory(engine)() as session:
        seed_history(session, days=5, source="mock")
    app = create_app(db_url)
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


def test_year_fraction_discounts_holiday():
    # 2026-04-21 é Tiradentes (terça); de seg 2026-04-20 a sex 2026-04-24 há só 3 dias úteis
    start = dt.date(2026, 4, 20)  # segunda
    end = dt.date(2026, 4, 24)    # sexta
    assert year_fraction(start, end) == pytest.approx(3 / 252)
    assert not is_business_day(dt.date(2026, 4, 21))


# ---------- mock determinístico ----------

def test_mock_b3_source_deterministic():
    from sources import MockB3Source
    d = dt.date(2026, 8, 21)
    c1 = MockB3Source().fetch_curve(d)
    c2 = MockB3Source().fetch_curve(d)
    assert c1 is not None and c2 is not None
    assert c1.points == c2.points


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
    mus = [d["delta_pb"] for d in body["deltas"]]
    assert body["max_up"]["delta_pb"] == max(mus)
    assert body["max_down"]["delta_pb"] == min(mus)


def test_macro(client):
    r = client.get("/api/v1/macro")
    assert r.status_code == 200
    ind = r.json()["indicators"]
    for code in ("432", "1178", "13522", "1"):
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


# ---------- re-ingest idempotente ----------

def test_reingest_same_date_no_duplicates(tmp_path):
    from models import CurvePoint, CurveSnapshot
    from sqlalchemy import func, select
    db_url = f"sqlite:///{tmp_path}/byc.db"
    engine = make_engine(db_url)
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        seed_history(session, days=3, source="mock")
        count1 = session.execute(select(func.count(CurvePoint.id))).scalar()
        snaps1 = session.execute(select(func.count(CurveSnapshot.id))).scalar()
        seed_history(session, days=3, source="mock")
        count2 = session.execute(select(func.count(CurvePoint.id))).scalar()
        snaps2 = session.execute(select(func.count(CurveSnapshot.id))).scalar()
    assert count1 == count2
    assert snaps1 == snaps2


# ---------- Fase 2: parser B3 SPRD (golden file offline) ----------

FIXTURES = Path(__file__).parent / "tests" / "fixtures"
GOLDEN_ZIP = FIXTURES / "ajustes_sprd_20260820.zip"


def test_b3_parser_golden_file():
    from sources import B3FuturesSource
    data = GOLDEN_ZIP.read_bytes()
    points = B3FuturesSource().parse(data, trade_date=dt.date(2026, 8, 20))
    assert len(points) >= 10
    for p in points:
        assert p.vertex_label.startswith("DI1")
        assert len(p.vertex_label) == 6
        assert 0 < p.rate < 0.50
    maturities = [p.maturity_date for p in points]
    assert maturities == sorted(maturities)


def test_b3_parser_ticker_maturity_coherence():
    from sources import MONTH_BY_LETTER, maturity_from_ticker, B3FuturesSource
    points = B3FuturesSource().parse(GOLDEN_ZIP.read_bytes(), trade_date=dt.date(2026, 8, 20))
    by_ticker = {p.vertex_label: p for p in points}
    p = by_ticker["DI1F27"]
    # F = janeiro; primeiro dia útil de jan/2027 (01/01 é feriado) = 04/01
    assert p.maturity_date == dt.date(2027, 1, 4)
    # AdjstdQtTax do golden file para DI1F27 = 13.727 (% a.a.) -> 0.13727 decimal
    assert p.rate == pytest.approx(0.13727)
    for ticker, point in by_ticker.items():
        letter, yy = ticker[3], int(ticker[4:])
        expected_month = MONTH_BY_LETTER[letter]
        assert point.maturity_date.year == 2000 + yy
        assert point.maturity_date.month == expected_month


def test_b3_parser_rate_fallback_from_pu():
    """Sem AdjstdQtTax mas com AdjstdQt -> taxa implícita via PU."""
    import io
    from sources import B3FuturesSource

    def rpt(ticker: str, tax: str | None) -> str:
        tax_xml = f"<AdjstdQtTax Ccy='BRL'>{tax}</AdjstdQtTax>" if tax is not None else ""
        return (
            f"<PricRpt><TradDt><Dt>2026-08-20</Dt></TradDt>"
            f"<SctyId><TckrSymb>{ticker}</TckrSymb></SctyId>"
            f"<FinInstrmAttrbts><OpnIntrst>1</OpnIntrst>"
            f"<AdjstdQt Ccy='BRL'>95461.23</AdjstdQt>{tax_xml}"
            f"</FinInstrmAttrbts></PricRpt>"
        )

    xml = f"""<?xml version='1.0' encoding='utf-8'?>
<Document xmlns='urn:bvmf.217.01.xsd'>{rpt('DI1F27', None)}{rpt('DI1F28', '13.5')}</Document>"""

    # constrói o aninhamento real: zip externo contendo zip interno contendo o XML
    inner_buf = io.BytesIO()
    with zipfile.ZipFile(inner_buf, "w") as zi:
        zi.writestr("BVBG.187.01_BV0001.xml", xml)
    outer_buf = io.BytesIO()
    with zipfile.ZipFile(outer_buf, "w") as zo:
        zo.writestr("SPRD260820.zip", inner_buf.getvalue())

    points = B3FuturesSource().parse(outer_buf.getvalue(), trade_date=dt.date(2026, 8, 20))
    assert len(points) == 2
    f27 = next(p for p in points if p.vertex_label == "DI1F27")
    f28 = next(p for p in points if p.vertex_label == "DI1F28")
    assert f28.rate == pytest.approx(0.135)
    # DI1F27 sem taxa: PU 95461.23 até 2027-01-04 a partir de 2026-08-20
    from conventions import _count_business_days
    du = _count_business_days(dt.date(2026, 8, 20), dt.date(2027, 1, 4))
    assert f27.rate == pytest.approx((100_000 / 95461.23) ** (252 / du) - 1.0)


def _nested_zip(xml: str, inner_name: str = "BVBG.187.01_BV0001.xml") -> bytes:
    """Monta o aninhamento real do SPRD: zip externo -> zip interno -> XML."""
    import io
    inner_buf = io.BytesIO()
    with zipfile.ZipFile(inner_buf, "w", zipfile.ZIP_DEFLATED) as zi:
        zi.writestr(inner_name, xml)
    outer_buf = io.BytesIO()
    with zipfile.ZipFile(outer_buf, "w", zipfile.ZIP_DEFLATED) as zo:
        zo.writestr("SPRD260820.zip", inner_buf.getvalue())
    return outer_buf.getvalue()


def test_b3_parser_recusa_membro_acima_do_teto(monkeypatch):
    """Zip bomb: o parser aceita ZIP aninhado de propósito, que é o formato de uma
    bomba. Um membro que se declara acima do teto tem que ser recusado ANTES de
    descomprimir, não depois de estourar a memória."""
    from sources import b3_futures
    from sources import B3FuturesSource

    payload = _nested_zip("<Document xmlns='urn:bvmf.217.01.xsd'></Document>")
    # teto abaixo do tamanho do membro interno, em vez de gerar centenas de MB no teste
    monkeypatch.setattr(b3_futures, "MAX_MEMBER_BYTES", 8)
    with pytest.raises(b3_futures.PayloadTooLarge):
        B3FuturesSource().parse(payload, trade_date=dt.date(2026, 8, 20))


def test_b3_parser_recusa_expansao_de_entidade():
    """Billion laughs: xml.etree expande entidade interna sem limite. defusedxml
    recusa a declaração antes de qualquer expansão."""
    from defusedxml.common import EntitiesForbidden
    from sources import B3FuturesSource

    bomba = """<?xml version='1.0'?>
<!DOCTYPE Document [
  <!ENTITY a "aaaaaaaaaa">
  <!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">
  <!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">
]>
<Document xmlns='urn:bvmf.217.01.xsd'><PricRpt>&c;</PricRpt></Document>"""

    with pytest.raises(EntitiesForbidden):
        B3FuturesSource().parse(_nested_zip(bomba), trade_date=dt.date(2026, 8, 20))


def test_maturity_from_ticker_rejects_options_and_bad_codes():
    from sources import maturity_from_ticker
    assert maturity_from_ticker("D12F27") is None      # opção sobre DI (prefixo errado)
    assert maturity_from_ticker("DI1ABC12345") is None  # ticker longo demais
    assert maturity_from_ticker("DI1A27") is None       # letra inválida / curto demais
    assert maturity_from_ticker("DI1F27").year == 2027


# ---------- Fase 2: SGS/BCB com httpx.MockTransport ----------

def _sgs_mock_client(payloads: dict[int, object]) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        url = request.url.path
        for sid, payload in payloads.items():
            if url.endswith(f"bcdata.sgs.{sid}/dados"):
                return httpx.Response(200, content=json.dumps(payload).encode())
        return httpx.Response(404)
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_sgs_comma_normalization_and_last_point():
    from sources import SgsSource
    payloads = {
        1178: [{"data": "18/08/2026", "valor": "10,38"}, {"data": "20/08/2026", "valor": "10,42"}],
        432: [{"data": "20/08/2026", "valor": "10,50"}],
    }
    sgs = SgsSource(client=_sgs_mock_client(payloads))
    out = sgs.fetch_macro(dt.date(2026, 8, 21))
    assert out["1178"] == pytest.approx(10.42)   # último ponto <= ref_date
    assert out["432"] == pytest.approx(10.50)
    assert "13522" not in out                    # série vazia/404 fica ausente
    assert "1" not in out


def test_sgs_ignores_points_after_ref_date():
    from sources import SgsSource
    payloads = {13522: [{"data": "20/08/2026", "valor": "4,51"},
                        {"data": "22/08/2026", "valor": "9,99"}]}
    sgs = SgsSource(client=_sgs_mock_client(payloads))
    out = sgs.fetch_macro(dt.date(2026, 8, 21))
    assert out["13522"] == pytest.approx(4.51)   # ponto futuro não vaza


def test_mock_usa_os_mesmos_codigos_da_fonte_oficial():
    """Mock e SGS precisam emitir o mesmo conjunto de códigos.

    Regressão: o mock emitia '12' (inexistente no SGS) e trocava os significados de
    432/13522/1. Como o frontend rotula por código, o KPI não ficava vazio — mostrava
    o número errado sob o rótulo certo (IPCA exibindo um valor de câmbio).
    """
    from sources import MockBCBSource, SgsSource

    assert set(MockBCBSource.CODES) == set(SgsSource.SERIES)

    out = MockBCBSource().fetch_macro(dt.date(2026, 8, 26))
    assert set(out) == set(SgsSource.SERIES)
    # faixas plausíveis por indicador — pega troca de significado entre códigos
    assert 8.0 <= out["432"] <= 20.0      # Selic meta % a.a.
    assert 8.0 <= out["1178"] <= 20.0     # Selic efetiva % a.a.
    assert 0.0 <= out["13522"] <= 12.0    # IPCA 12m %
    assert 3.0 <= out["1"] <= 10.0        # USD/BRL PTAX


def test_sgs_serie_mensal_alcancada_pela_janela_larga():
    """13522 é mensal (datada no dia 1º) e só aparece com lookback largo.

    Regressão: uma janela única de 7 dias para todas as séries nunca alcançava o
    ponto mensal, e o SGS devolve 404 nesse caso — o IPCA sumia do KPI.
    """
    from sources import SgsSource

    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        sid = request.url.path.split("bcdata.sgs.")[1].split("/")[0]
        inicial = request.url.params["dataInicial"]
        seen[sid] = inicial
        start = dt.datetime.strptime(inicial, "%d/%m/%Y").date()
        # ponto mensal do IPCA: 01/07/2026, 56 dias antes da data de referência
        if sid == "13522":
            if start <= dt.date(2026, 7, 1):
                return httpx.Response(200, content=json.dumps(
                    [{"data": "01/07/2026", "valor": "4.44"}]).encode())
            return httpx.Response(404)  # o SGS 404 quando a janela não pega nada
        return httpx.Response(404)

    sgs = SgsSource(client=httpx.Client(transport=httpx.MockTransport(handler)))
    out = sgs.fetch_macro(dt.date(2026, 8, 26))

    assert out["13522"] == pytest.approx(4.44)
    # a janela do IPCA precisa ser mais larga que a das séries diárias
    assert seen["13522"] != seen["432"]


def test_sgs_404_nao_derruba_as_demais_series():
    """404 em uma série é ausência registrada, não erro que aborta a coleta."""
    from sources import SgsSource

    def handler(request: httpx.Request) -> httpx.Response:
        sid = request.url.path.split("bcdata.sgs.")[1].split("/")[0]
        if sid == "432":
            return httpx.Response(200, content=json.dumps(
                [{"data": "26/08/2026", "valor": "14.00"}]).encode())
        return httpx.Response(404)

    sgs = SgsSource(client=httpx.Client(transport=httpx.MockTransport(handler)))
    out = sgs.fetch_macro(dt.date(2026, 8, 26))
    assert out == {"432": pytest.approx(14.00)}


def test_sgs_ponto_decimal_do_formato_json():
    """formato=json devolve ponto decimal ("4.44"), não vírgula."""
    from sources import SgsSource
    sgs = SgsSource(client=_sgs_mock_client({13522: [{"data": "01/07/2026", "valor": "4.44"}]}))
    out = sgs.fetch_macro(dt.date(2026, 8, 26))
    assert out["13522"] == pytest.approx(4.44)


def test_sgs_empty_series_missing():
    from sources import SgsSource
    payloads = {1: []}
    sgs = SgsSource(client=_sgs_mock_client(payloads))
    out = sgs.fetch_macro(dt.date(2026, 8, 21))
    assert out == {}


# ---------- Fase 2: integração real (rede) — skip por padrão ----------

@pytest.mark.network
def test_b3_official_integration_recent_session():
    from sources import B3FuturesSource
    d = dt.date.today() - dt.timedelta(days=1)
    while d.weekday() >= 5:
        d -= dt.timedelta(days=1)
    curve = B3FuturesSource().fetch_curve(d)
    if curve is None:  # feriado sem pregão
        pytest.skip(f"{d} sem pregão disponível")
    assert curve.curve_type == "DI_FUTURE"
    assert len(curve.points) >= 10
    for p in curve.points:
        assert 0 < p.rate < 0.50


# ---------- Fase 3: seed resiliente (retry + skip + commit por dia) ----------

def _flaky_db(tmp_path):
    from models import init_db, make_engine, make_session_factory
    db_url = f"sqlite:///{tmp_path}/byc.db"
    engine = make_engine(db_url)
    init_db(engine)
    return make_session_factory(engine)


def test_seed_history_retries_transient_b3_error(tmp_path, monkeypatch):
    """Timeout transitório na B3 não aborta a carga: retry e segue."""
    import ingestor
    from sources import MockB3Source, MockBCBSource

    monkeypatch.setattr(ingestor, "FETCH_BACKOFF_S", (0, 0, 0, 0))
    mock_b3 = MockB3Source()
    calls = {"n": 0}

    class FlakyB3:
        def fetch_curve(self, trade_date):
            calls["n"] += 1
            if calls["n"] <= 2:
                raise httpx.ReadTimeout("boom")
            return mock_b3.fetch_curve(trade_date)

    monkeypatch.setattr(ingestor, "_resolve_source",
                        lambda source: (FlakyB3(), MockBCBSource(), "test"))
    with _flaky_db(tmp_path)() as session:
        # 28/08/2026 = sexta; days=2 pega 28 + 27 (quinta)
        seeded = seed_history(session, days=2, end_date=dt.date(2026, 8, 28))
    assert seeded == [dt.date(2026, 8, 27), dt.date(2026, 8, 28)]
    assert calls["n"] >= 4  # 2 falhas + retentativas + sucessos


def test_seed_history_skips_day_after_retries_exhausted(tmp_path, monkeypatch):
    """Dia com falha persistente é pulado com log; os demais carregam."""
    import ingestor
    from sources import MockB3Source, MockBCBSource

    monkeypatch.setattr(ingestor, "FETCH_BACKOFF_S", (0, 0, 0, 0))
    mock_b3 = MockB3Source()
    bad = dt.date(2026, 8, 28)

    class Boom28:
        def fetch_curve(self, trade_date):
            if trade_date == bad:
                raise httpx.ConnectError("down")
            return mock_b3.fetch_curve(trade_date)

    monkeypatch.setattr(ingestor, "_resolve_source",
                        lambda source: (Boom28(), MockBCBSource(), "test"))
    with _flaky_db(tmp_path)() as session:
        seeded = seed_history(session, days=1, end_date=bad)
    assert seeded == [dt.date(2026, 8, 27)]


def test_ingest_macro_retries_transient_error(tmp_path, monkeypatch):
    """Timeout no SGS não perde a curva do dia: retry do fetch macro."""
    import ingestor
    from ingestor import ingest_macro
    from models import MacroIndicator
    from sources import MockBCBSource
    from sqlalchemy import select

    monkeypatch.setattr(ingestor, "FETCH_BACKOFF_S", (0, 0, 0, 0))
    real = MockBCBSource()
    calls = {"n": 0}

    class FlakyBCB:
        def fetch_macro(self, ref_date):
            calls["n"] += 1
            if calls["n"] == 1:
                raise httpx.ReadTimeout("boom")
            return real.fetch_macro(ref_date)

    with _flaky_db(tmp_path)() as session:
        ingest_macro(session, FlakyBCB(), dt.date(2026, 8, 28))
        rows = session.execute(select(MacroIndicator)).scalars().all()
    assert calls["n"] == 2
    assert {r.indicator_code for r in rows} == {"432", "1178", "13522", "1"}
