# Brazil Yield Curve

Página de análise da curva de juros brasileira (DI futuro — DI1/B3), MVP aprovado em revisão.

- **Backend**: FastAPI + SQLAlchemy (SQLite) — convenções base 252 dias úteis, capitalização exponencial `(1+y)^t`, variações em pb, interpolação linear marcada como `interpolated` (sem extrapolação).
- **Frontend**: React 18 + TypeScript + Vite + TanStack Query + ECharts-style SVG — gráfico com **eixo por vencimento** (`maturity_date` por ponto) e tooltip com vencimento/liquidez.
- **Fonte de dados**: adaptador mock tipado (B3/BCB) — tudo roda offline.

## Bloqueios corrigidos preservados

1. `curve_type` inválido no CSV/API → **HTTP 400** com envelope `{"error": "invalid_curve_type", "allowed": [...]}`.
2. Cada ponto carrega `maturity_date` + `liquidity_note`; tooltip e eixo x do gráfico usam o vencimento real.
3. Cards "maior alta"/"maior queda" alimentados por **deltas reais em pb contra o pregão anterior** (`/api/v1/curves/compare`).

## Pré-requisitos (VPS)

- Python 3.11+ e [`uv`](https://docs.astral.sh/uv/) (ou pip)
- Node.js 20+ e npm
- SSH acessível a partir do seu PC

## Rodar localmente na VPS

### Backend

```bash
cd ~/brazil-yield-curve/backend
uv venv .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python seed.py --days 10          # popula histórico mockado
.venv/bin/python -m uvicorn api_main:app --host 127.0.0.1 --port 8021
```

O backend escuta **apenas em 127.0.0.1** (nada é exposto publicamente).

### Frontend (desenvolvimento)

Em outro terminal:

```bash
cd ~/brazil-yield-curve/frontend
npm install
npm run dev        # vite em 127.0.0.1:5173, proxy /api -> 127.0.0.1:8021
```

Build de produção: `npm run build` (saída em `dist/`, sirva com `npm run preview`).

## Acesso seguro a partir do PC (SSH tunnel)

No **seu PC**, rode:

```bash
ssh -N -L 5173:127.0.0.1:5173 usuario@SEU_VPS
```

Depois abra `http://localhost:5173` no navegador do PC. As portas nunca ficam expostas à internet.

## Testes

```bash
# backend
cd backend && .venv/bin/python -m pytest test_api.py

# frontend
cd frontend && npm test && npx tsc --noEmit && npm run lint && npm run build
```

## API (/api/v1)

| Endpoint | Descrição |
|---|---|
| `GET /health` | liveness |
| `GET /curves/latest?curve_type=DI_FUTURE` | último pregão |
| `GET /curves/dates` | datas disponíveis (desc) |
| `GET /curves/{date}` | curva por data |
| `GET /curves/compare?trade_date=` | deltas pb vs pregão anterior + maior alta/queda |
| `GET /macro` | IPCA 12m, Selic, PTAX, Selic alvo (mock BCB SGS) |
| `GET /export/curve.csv?trade_date=` | CSV com decimal BR |

`curve_type` válidos: `DI_FUTURE`, `NOMINAL`, `REAL`, `IMPLICIT` (MVP só popula DI_FUTURE).

## Scripts auxiliares

- `backend/seed.py` — popula N pregões úteis mockados.
- `scripts/dev.sh` — sobe backend + frontend juntos (dev).
