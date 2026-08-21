# Design — Fixes do review + fontes oficiais (B3/BCB)

Data: 2026-08-21
Status: aprovado pelo usuário
Ciclos: **Fase 1** (fixes) → **Fase 2** (fontes oficiais), implementação nesta ordem.

## Contexto

O MVP consome apenas mocks (`MockB3Source`, `MockBCBSource`). O review do código
apontou problemas estruturais que precisam ser resolvidos antes de plugar fontes
reais. A pesquisa de ecossistema (PYield, rb3, pyettj, b3ajustes, python-bcb,
b3_cdi_curve) validou as fontes e os padrões técnicos abaixo.

## Decisões (acordadas com o usuário)

| Decisão | Escolha |
|---|---|
| Fonte da curva DI | B3/BM&F pública e gratuita — **Ajustes do Pregão** (contratos reais DI1) |
| Modelo de ingestão | Batch diário agendado (timer pós-fechamento); API só lê do SQLite |
| Dependências | Adaptador próprio com `httpx` (já é dep) — zero novas dependências |
| Vértices | Contratos reais DI1 (códigos DI1F29 etc.), não tênis sintéticos 3m/6m/1a |
| Escopo | Fase 1 = fixes do review; Fase 2 = fontes oficiais |

Nota: o usuário havia considerado inicialmente `TxRef1.asp` ("DI x Pré"), mas essa
página publica a curva interpolada em vértices padronizados de dias úteis, sem os
contratos individuais. Como a decisão de vértices foi "contratos reais", a fonte
primária passa a ser os Ajustes do Pregão (mesmo domínio `www2.bmf.com.br`,
mesma simplicidade de scraping). TxRef1 fica registrado como fonte alternativa
futura para curvas interpoladas oficiais da B3.

## Fase 1 — Fixes do review

### 1.1 Integridade referencial e política de re-ingestão

`backend/models.py`:

- `CurvePoint.snapshot_id` vira `Mapped[int] = mapped_column(ForeignKey("curve_snapshots.id", ondelete="CASCADE"), index=True)`.
- Mantém-se `UniqueConstraint("trade_date", "curve_type")` em `CurveSnapshot`.

Política de re-ingestão (`backend/ingestor.py`): upsert idempotente. Se já existe
snapshot para `(trade_date, curve_type)`, deleta seus pontos e reinsere dentro da
mesma transação (permite atualizar o pregão do dia quando o batch rodar mais de
uma vez). Remove-se o `order_by(ingested_at.desc())` redundante em
`_get_snapshot` (`api_main.py`) ou documenta-se que só existe 1 snapshot por
chave — escolha: remover o order-by e confiar na constraint.

### 1.2 Datetime UTC

`models.py`: `ingested_at` usa `default=lambda: dt.datetime.now(dt.UTC)`.

### 1.3 Engine sem side-effect no import

`api_main.py` passa a expor `create_app(db_url="sqlite:///./byc.db") -> FastAPI`
que cria engine/init_db/factory; `app = create_app()` no fim do módulo. Testes
chamam `create_app(f"sqlite:///{tmp}/byc.db")` — elimina o monkeypatch e o
`byc.db` criado no cwd durante imports/testes.

### 1.4 Mock determinístico por data

`sources.py`: `MockB3Source.fetch_curve` usa RNG semeado com
`trade_date.toordinal()`. Mesma data → mesma curva sempre (alinhado ao mock macro).

### 1.5 Calendário de feriados brasileiros

`conventions.py`: `_count_business_days` passa a descontar feriados nacionais.
Lista embutida (sem dep externa) dos feriados nacionais fixos/móveis 2026–2035
(inclui Carnaval, Sexta-feira Santa, Corpus Christi; exclui pontos facultativos).
Constante `HOLIDAYS: frozenset[date]` + função `is_business_day(d)`.
Documentar no README que o calendário nacional ≠ calendário ANBIMA/B3 completo,
suficiente para MVP.

### 1.6 Frontend — setState durante render

`App.tsx`: remove `staleNotice` como estado; banner vira derivação:
`{curveQ.isFetching && !curveQ.isLoading && <div data-testid="stale-banner">…</div>}`.
Teste existente do banner continua passando.

### 1.7 Testes

Remove o assert no-op (`assert body["max_up"]["vertex_label"] or True`) de
`test_api.py`; os demais testes da Fase 1 cobrem: upsert re-ingest (mesma data
não duplica pontos), feriado descontado em `year_fraction`, mock determinístico.

## Fase 2 — Fontes oficiais

### 2.1 Cliente B3 — Ajustes do Pregão (`backend/sources/b3_futures.py`)

- Reorganização: `sources.py` vira pacote `sources/` com `mock.py`,
  `b3_futures.py`, `sgs.py` e `__init__.py` reexportando os Protocol/dataclasses.
- Endpoint: página de ajustes diários da BM&F/B3
  (`www2.bmf.com.br`, família SistemaPregao/AjusteDiario), parametrizada por
  data `dd/mm/yyyy`. URL exata confirmada contra a página real na implementação
  (referência de comportamento: repos `cfassoni/b3ajustes` e `crdcj/PYield`).
- Parsing: `html.parser` stdlib; decode **ISO-8859-1**; rate-limit mínimo de 1s
  entre requests; timeout 30s.
- Filtra linhas `DI1`, extrai código do contrato (ex.: `DI1F29`) e preço de ajuste (PU).
- Derivações por contrato:
  - `maturity_date`: código de vencimento (letra do mês + dígito do ano) →
    primeiro **dia útil** do mês (calendário 1.5);
  - `rate`: taxa implícita anual base 252 = `(100000 / PU)^(252/DU) - 1`, com
    `DU = dias úteis(trade_date → maturity_date)`;
  - `vertex_label`: código do contrato;
  - `liquidity_note`: null (preenchido depois por heurística de volume, fora de escopo).
- Retorna `SourceCurve(curve_type="DI_FUTURE", points=(...))` ordenado por
  `maturity_date`. Sem contratos (feriado/futuro) → retorna `None`.

### 2.2 Cliente SGS/BCB (`backend/sources/sgs.py`)

- Base: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{id}/dados?formato=json`,
  params `dataInicial`/`dataFinal` (`dd/MM/yyyy`). Janela ≤ 10 anos por request.
- Séries corrigidas: **1178** Selic efetiva (% a.a. base 252), **432** Selic meta,
  **13522** IPCA 12m, **1** PTAX venda. Valores chegam como string com vírgula —
  normalizar para float.
- `fetch_macro(ref_date)` busca janela `[ref_date - 7d, ref_date]` e usa o último
  ponto ≤ ref_date por série (séries têm defasagens distintas).

### 2.3 Correção de labels no frontend

`api.ts`: `MACRO_LABELS` corrigido — `'432': 'Selic meta (%)'`,
`'1178': 'Selic efetiva (% a.a.)'`, `'13522': 'IPCA 12m (%)'`, `'1': 'USD/BRL (PTAX)'`.

### 2.4 Ingestor

- `seed_history(session, days, end_date, source="official")` escolhe
  `B3FuturesSource`/`SgsSource` ou mocks conforme flag (env `BYC_SOURCE`,
  default `official`; `mock` mantido para dev offline e testes).
- `ingest_macro` grava também séries ausentes na data sem abortar (fontes têm
  defasagem); idempotente por `(indicator_code, ref_date)` — adiciona
  UniqueConstraint correspondente.
- Frontend: tabela/gráfico continuam genéricos sobre `points[]`; nenhum layout
  muda além do label macro.

### 2.5 Agendamento

- `scripts/ingest_daily.sh`: roda seed incremental (últimos ~5 pregões, upsert
  idempotente cobre re-execução), loga saída, exit code ≠ 0 em falha.
- Documentar no README timer systemd (`OnCalendar=Mon..Fri 21:40 America/Sao_Paulo`)
  ou cron equivalente; retry simples (2 tentativas, backoff 60s) no shell script.

### 2.6 Erros e resiliência

- Falha de rede/parse no batch: loga, exit ≠ 0; API segue servindo último dado
  válido (frontend já preserva via `placeholderData`).
- Resposta vazia/anômala da B3 → erro explícito com trecho do HTML no log
  (facilita detectar mudança de layout).

### 2.7 Testes da Fase 2

- Golden files: amostras reais de HTML de ajustes salvas em
  `backend/tests/fixtures/` — parser testado offline (datas conhecidas → taxas
  conhecidas).
- SGS: `httpx.MockTransport` com payloads JSON de exemplo; teste de normalização
  vírgula→float e de janela >10 anos fatiada.

## Fora de escopo

- UP2DATA (pago), ANBIMA ETTJ, curvas NOMINAL/REAL/IMPLICIT (continuam 404 até
  haver ingestão específica), auth na API, endurecimento de CORS.

## Critérios de aceite

1. `pytest` verde nos dois ciclos; suíte frontend (`npm test`, `tsc --noEmit`,
   `lint`, `build`) verde.
2. Re-ingestão da mesma data não duplica pontos nem snapshots.
3. Com `BYC_SOURCE=official`, `/curves/latest` exibe ≥10 contratos DI1 reais com
   maturity_date coerente e taxas plausíveis (>0, <0.50) contra golden file.
4. `/macro` retorna as 4 séries corretas com labels corretos no UI.
5. Timer documentado reproduz ingestão do dia com um comando.
