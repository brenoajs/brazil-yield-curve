# Brazil Yield Curve

Página de análise da curva de juros brasileira (DI futuro — DI1/B3).

- **Backend**: FastAPI + SQLAlchemy (SQLite) — convenções base 252 dias úteis, capitalização exponencial `(1+y)^t`, variações em pb, interpolação linear marcada como `interpolated` (sem extrapolação).
- **Frontend**: React 18 + TypeScript + Vite + TanStack Query — gráfico em SVG próprio (`src/CurveChart.tsx`, sem dependência de biblioteca de charts em runtime) com **eixo por vencimento** (`maturity_date` por ponto), tooltip com vencimento/liquidez e toggle **"Semana anterior"**, que sobrepõe a curva do pregão mais recente com 7+ dias corridos de defasagem.
- **Fontes de dados**: adaptadores em `backend/sources/` — `official` (B3 SPRD para a curva DI e BCB SGS para macro; **requer internet**) e `mock` (dados sintéticos tipados, roda 100% offline).

## Bloqueios corrigidos preservados

1. `curve_type` inválido no CSV/API → **HTTP 400** com envelope `{"error": "invalid_curve_type", "allowed": [...]}`.
2. Cada ponto carrega `maturity_date` + `liquidity_note`; tooltip e eixo x do gráfico usam o vencimento real.
3. Cards "maior alta"/"maior queda" alimentados por **deltas reais em pb contra o pregão anterior** (`/api/v1/curves/compare`).

---

## Rodar localmente no Windows

### Pré-requisitos

| Ferramenta | Versão | Instalação |
|---|---|---|
| Python | 3.11–3.13 (validado em 3.11.15 e 3.13.1) | [python.org](https://www.python.org/downloads/windows/) ou `winget install Python.Python.3.11` |
| uv | qualquer | `winget install astral-sh.uv` (opcional, mas recomendado) |
| Node.js | 20+ | `winget install OpenJS.NodeJS.LTS` |

Todos os comandos abaixo são para **PowerShell**, a partir da raiz do repositório.

> **Windows PowerShell 5.1 não aceita `&&`.** Rode cada linha separadamente ou use `;` para encadear.

Verificação rápida:

```powershell
python --version
node --version
uv --version
```

Se `python` abrir a Microsoft Store em vez de rodar, use `py -3` no lugar de `python` em todos os comandos, ou desative os App Execution Aliases em *Configurações → Aplicativos → Apelidos de execução de aplicativo*.

### 1. Backend

```powershell
cd backend
uv venv .venv
uv pip install --python .venv\Scripts\python.exe -r requirements.txt
```

Atenção: `uv venv` pode escolher um Python **gerenciado pelo próprio uv** (ex.: 3.11) mesmo que o `python` do PATH seja mais novo. Para fixar o interpretador, use `uv venv .venv --python 3.13`.

Sem `uv`, use a stdlib:

```powershell
cd backend
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

O banco `backend/byc.db` **não é versionado**, então popule o histórico antes do primeiro start:

```powershell
.venv\Scripts\python.exe seed.py --days 10 --source official
```

Isso baixa dados reais da B3 (curva DI) e do BCB SGS (macro) — **precisa de internet**. Sem a flag, a fonte vem da variável `BYC_SOURCE` e, na ausência dela, o default já é `official`.

Para trabalhar offline, `--source mock` gera dados sintéticos com os mesmos códigos de série do SGS. Serve para desenvolver sem rede; os números não têm significado econômico.

Suba a API:

```powershell
.venv\Scripts\python.exe -m uvicorn api_main:app --host 127.0.0.1 --port 8021
```

O backend escuta **apenas em 127.0.0.1**. Confira em <http://127.0.0.1:8021/api/v1/health> (deve retornar `{"status":"ok"}`) ou nos docs interativos em <http://127.0.0.1:8021/docs>.

### 2. Frontend

Em **outro terminal PowerShell**, a partir da raiz do repositório:

```powershell
cd frontend
npm install
npm run dev
```

Vite sobe em <http://127.0.0.1:5173>.

O frontend **não fala com o backend em runtime**: ele consome a API como arquivos
estáticos em `frontend/public/api/v1/`, gerados pelo backend. Antes do primeiro
`npm run dev`, exporte o snapshot (a partir de `backend/`):

```powershell
.venv\Scripts\python.exe export_static.py --out ..\frontend\public
```

Repita esse comando sempre que reindexar dados. `frontend/public/api/` não é versionado.

O servidor FastAPI continua útil para inspecionar a API ao vivo em <http://127.0.0.1:8021/docs>,
mas não é necessário para rodar o frontend.

Build de produção:

```powershell
npm run build      # saída em dist/, com base /brazil-yield-curve/
npm run preview    # serve dist/ em 127.0.0.1:5173
```

### Encerrar

`Ctrl+C` em cada terminal. Se alguma porta ficar presa:

```powershell
Get-NetTCPConnection -LocalPort 8021,5173 -State Listen | Select-Object LocalPort,OwningProcess
Stop-Process -Id <PID> -Force
```

---

## Testes

**Backend** (a partir de `backend/`):

```powershell
.venv\Scripts\python.exe -m pytest
```

`pytest.ini` já aplica `-m "not network"`, então os testes que batem na B3/BCB de verdade ficam de fora por padrão. Para incluí-los (precisa de internet):

```powershell
.venv\Scripts\python.exe -m pytest -m network
```

**Frontend** (a partir de `frontend/`):

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Estado verificado nesta máquina (Windows 11, Node 22.13.0), em 2026-08-26:

- backend: 25 passed / 1 deselected — em Python 3.11.15 (`uv venv`) **e** 3.13.1 (`py -3 -m venv`)
- frontend: 9 passed, `tsc --noEmit` limpo, `npm run lint` limpo, build ok
- boot ponta a ponta: `/api/v1/health` responde `ok` em `:8021`, e o frontend em `:5173` lê o snapshot estático de `frontend/public/api/v1/`

---

## API (/api/v1)

| Endpoint | Descrição |
|---|---|
| `GET /health` | liveness (rota completa: `/api/v1/health`) |
| `GET /curves/latest?curve_type=DI_FUTURE` | último pregão |
| `GET /curves/dates` | datas disponíveis (desc) |
| `GET /curves/{date}` | curva por data |
| `GET /curves/compare?trade_date=` | deltas pb vs pregão anterior + maior alta/queda |
| `GET /macro` | IPCA 12m, Selic, PTAX, Selic alvo (BCB SGS) |
| `GET /export/curve.csv?trade_date=` | CSV com decimal BR |

`curve_type` válidos: `DI_FUTURE`, `NOMINAL`, `REAL`, `IMPLICIT` (MVP só popula DI_FUTURE).

---

## Scripts auxiliares

| Script | Plataforma | O que faz |
|---|---|---|
| `backend/seed.py` | qualquer | popula N pregões úteis no SQLite |
| `backend/export_static.py` | qualquer | congela a API em arquivos estáticos para o Pages |
| `scripts/dev.sh` | **Linux/macOS apenas** | sobe backend + frontend juntos |
| `scripts/ingest_daily.sh` | **Linux apenas** | ingestão diária da fonte oficial (systemd timer / cron) |

Os dois `.sh` assumem `.venv/bin/python`, caminho que não existe em venv de Windows (lá é `.venv\Scripts\`), então **não funcionam nem sob Git Bash**. No Windows, use o fluxo de dois terminais descrito acima.

---

## Deploy automático no GitHub Pages

O site é publicado em <https://brenoajs.github.io/brazil-yield-curve/> por
`.github/workflows/pages.yml`. Como o Pages só hospeda arquivos estáticos, o
workflow **não sobe o FastAPI**: ele roda a ingestão, congela a API em JSON/CSV
e publica esses arquivos junto com o bundle.

Etapas do job:

1. `seed.py --days 15 --source official` (3 tentativas, com 60s entre elas — se falhar, o job falha e o site anterior continua no ar)
2. `export_static.py --out ../frontend/public` — grava `api/v1/curves/<TIPO>/<data>.json`, `compare/`, `dates.json`, `latest.json`, `macro.json` e os CSVs em `api/v1/export/`
3. `npm ci && npm test && npm run build`
4. `upload-pages-artifact` + `deploy-pages`

Gatilhos: push em `main`, `workflow_dispatch` (botão *Run workflow*) e cron
`0 22 * * 1-5` (22:00 UTC ≈ 19:00 BRT, após o fechamento da B3).

### Habilitação (passo manual, uma vez)

Em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions**.
Sem isso o workflow roda e o deploy fica parado sem erro óbvio.

### Limitações conhecidas

- O site fica **público** — é uma inversão deliberada da postura atual do projeto (backend em `127.0.0.1` + túnel SSH). Os dados são públicos (B3 e BCB), então não há vazamento, mas a decisão é sua.
- O histórico é **reconstruído do zero a cada execução** (o runner é efêmero e `byc.db` não é versionado): sempre os últimos ~15 pregões. Para acumular meses, seria preciso persistir o banco (ex.: branch `data`).
- Cron do GitHub atrasa de 10 a 60 min no plano gratuito e é **desativado após 60 dias sem atividade no repositório**.
- `base` do Vite está fixo em `/brazil-yield-curve/` (`frontend/vite.config.ts`). Domínio próprio ou repo `<user>.github.io` → troque para `/`.

---

## Deploy na VPS (Linux)

```bash
cd ~/brazil-yield-curve/backend
uv venv .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python seed.py --days 10 --source official
.venv/bin/python -m uvicorn api_main:app --host 127.0.0.1 --port 8021
```

Frontend: `cd ~/brazil-yield-curve/frontend && npm install && npm run build`.

Ingestão diária: agende `scripts/ingest_daily.sh` via timer systemd ou cron.

Como nada é exposto publicamente, acesse a partir do seu PC por túnel SSH. No PowerShell do Windows:

```powershell
ssh -N -L 5173:127.0.0.1:5173 -L 8021:127.0.0.1:8021 usuario@SEU_VPS
```

Depois abra <http://localhost:5173> no navegador.

---

## Notas

- `backend/requirements.txt` está pinado por faixa de versão. Validado em instalação limpa com Python 3.11.
- Não versionados: `backend/.venv/`, `backend/*.db`, `frontend/node_modules/`, `frontend/dist/`.
