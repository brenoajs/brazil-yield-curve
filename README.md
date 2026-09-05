# Brazil Yield Curve

Aplicação para visualização, monitoramento e análise da curva de juros brasileira (DI futuro — DI1/B3) e dos principais indicadores macroeconômicos (Banco Central do Brasil / SGS).

- **Backend**: FastAPI + SQLAlchemy (SQLite) — convenções de mercado base 252 dias úteis, capitalização exponencial $(1+y)^t$, variações em pontos-base (pb) e interpolação linear identificada como `interpolated` (sem extrapolação).
- **Frontend**: React 18 + TypeScript + Vite + TanStack Query — gráfico em SVG nativo (`src/CurveChart.tsx`, sem dependência de bibliotecas pesadas de charts em runtime) com **eixo por data de vencimento** (`maturity_date` por ponto), tooltip interativo com liquidez e comparações sobrepostas: **semana anterior**, **mês anterior** e **data específica** (linha violeta, com snap para o pregão anterior quando o dia escolhido cai em fim de semana/feriado).
- **Navegação entre pregões**: calendário com botões ◀ ▶ e atalho "Último pregão"; turma, tabela e cards acompanham a data selecionada.
- **Segurança da Ingestão**: O parser do arquivo SPRD (B3) trata estruturas de ZIP aninhado com verificação prévia de limites de tamanho antes da descompressão e download via streaming; o processamento de XML utiliza `defusedxml` para proteção contra ataques de expansão de entidades.
- **Fontes de Dados**: Adaptadores modulares em `backend/sources/` — `official` (coleta direta do SPRD da B3 para a curva DI e do SGS/BCB para séries macroeconômicas) e `mock` (gerador determinístico de dados sintéticos para desenvolvimento e testes 100% offline).

---

## Recursos e Validações

1. Validação de `curve_type` no CSV/API com resposta estruturada **HTTP 400** (`{"error": "invalid_curve_type", "allowed": [...]}`).
2. Cada vértice carrega `maturity_date` real e `liquidity_note`, refletidos na tabela, no tooltip e no eixo horizontal do gráfico.
3. Cards de "Maior alta" e "Maior queda" calculados via deltas reais em pontos-base contra o pregão anterior (`/api/v1/curves/compare`).
4. Comparação com data arbitrária: join client-side por `vertex_label` (`src/customCompare.ts`, mesma regra do `/curves/compare`), com alternância **vs anterior / vs data** na tabela e nos cards.
5. Persistência idempotente: re-ingestão da mesma data substitui registros anteriores sem duplicação de dados.

---

## Como Rodar Localmente

### Pré-requisitos

| Ferramenta | Versão Recomendada | Instalação |
|---|---|---|
| Python | 3.11 a 3.13 | [python.org](https://www.python.org/downloads/) ou `winget install Python.Python.3.11` |
| uv | Mais recente | [astral.sh/uv](https://astral.sh/uv) (opcional, recomendado para gerenciar ambientes virtuais) |
| Node.js | 20+ LTS | [nodejs.org](https://nodejs.org/) ou `winget install OpenJS.NodeJS.LTS` |

---

### 1. Configuração do Backend

#### No Windows (PowerShell):

```powershell
cd backend

# Criar ambiente virtual e instalar dependências
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# Popular o banco de dados inicial (SQLite local)
# Use --source official (requer internet) ou --source mock (offline)
.\.venv\Scripts\python.exe seed.py --days 10 --source official

# Iniciar o servidor da API
.\.venv\Scripts\python.exe -m uvicorn api_main:app --host 127.0.0.1 --port 8021
```

> Windows PowerShell 5.1 não aceita `&&`: rode cada linha separadamente ou use `;` para encadear. Se `python` abrir a Microsoft Store em vez de rodar, use `py -3` no lugar ou desative os App Execution Aliases em *Configurações → Aplicativos → Apelidos de execução de aplicativo*.

#### No Linux / macOS (Bash):

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Popular o banco de dados inicial
python seed.py --days 10 --source official

# Iniciar o servidor
python -m uvicorn api_main:app --host 127.0.0.1 --port 8021
```

> Sem a flag `--source`, a fonte vem da variável `BYC_SOURCE` e, na ausência dela, o padrão é `official`. Com `--source mock`, os dados são sintéticos (mesmos códigos de série do SGS) — servem para desenvolver sem rede, mas não têm significado econômico. O banco `backend/byc.db` não é versionado: popule o histórico antes do primeiro start.

> A API escuta em `http://127.0.0.1:8021`. Confira o status em `http://127.0.0.1:8021/api/v1/health` ou a documentação interativa OpenAPI/Swagger em `http://127.0.0.1:8021/docs`.

---

### 2. Configuração do Frontend

O frontend **não fala com o backend em runtime**: ele consome a API como arquivos estáticos em `frontend/public/api/v1/`, gerados pelo backend. Antes do primeiro `npm run dev`, exporte o snapshot (a partir de `backend/`):

#### Gerar o Snapshot da API para o Frontend:

```powershell
# Windows
cd backend
.\.venv\Scripts\python.exe export_static.py --out ..\frontend\public
```

```bash
# Linux/macOS
cd backend
python export_static.py --out ../frontend/public
```

#### Executar o Frontend em Modo de Desenvolvimento:

```bash
cd frontend
npm install
npm run dev
```

O Vite disponibilizará a aplicação em `http://127.0.0.1:5173`.

---

## Testes e Qualidade de Código

### Testes do Backend (Pytest)

A partir do diretório `backend/`:

```powershell
# Executar testes unitários e de integração (offline por padrão)
.\.venv\Scripts\python.exe -m pytest

# Para incluir testes que dependem de conexão com a rede (B3/BCB):
.\.venv\Scripts\python.exe -m pytest -m network
```

### Testes e Validação do Frontend

A partir do diretório `frontend/`:

```bash
npm test            # Executa a suíte de testes com Vitest
npx tsc --noEmit    # Verificação de tipagem estática TypeScript
npm run lint        # Verificação com ESLint
npm run build       # Build de produção
```

---

## Referência da API REST (`/api/v1`)

| Endpoint | Método | Descrição |
|---|---|---|
| `/health` | `GET` | Verificação de disponibilidade do serviço |
| `/curves/latest?curve_type=DI_FUTURE` | `GET` | Dados do pregão mais recente |
| `/curves/dates` | `GET` | Lista de datas disponíveis no histórico (ordem decrescente) |
| `/curves/{date}` | `GET` | Curva completa para a data especificada (`YYYY-MM-DD`) |
| `/curves/compare?trade_date=` | `GET` | Variações em pontos-base vs. pregão anterior, maior alta e maior queda |
| `/macro` | `GET` | Indicadores macroeconômicos (Selic Meta, Selic Efetiva, IPCA 12m, PTAX) |
| `/export/curve.csv?trade_date=` | `GET` | Exportação da curva em formato CSV com formatação numérica brasileira |

Tipos de curva suportados: `DI_FUTURE`, `NOMINAL`, `REAL`, `IMPLICIT` (*padrão atual: `DI_FUTURE`*).

> No GitHub Pages, as mesmas rotas existem como arquivos estáticos (`api/v1/curves/<TIPO>/<data>.json`, `compare/`, `dates.json`, `latest.json`, `macro.json` e CSVs em `api/v1/export/`), gerados por `export_static.py`.

---

## Scripts Auxiliares

| Script | Plataforma | Finalidade |
|---|---|---|
| `backend/seed.py` | Multiplataforma | Popula $N$ pregões no banco de dados SQLite local |
| `backend/export_static.py` | Multiplataforma | Exporta todas as rotas da API para arquivos JSON/CSV estáticos |
| `scripts/dev.sh` | Linux / macOS | Executa simultaneamente backend e frontend para desenvolvimento |
| `scripts/ingest_daily.sh` | Linux | Script de ingestão diária para agendamento via Cron ou Systemd Timer |

> Os dois `.sh` assumem `.venv/bin/python`, caminho que não existe em venv de Windows (lá é `.venv\Scripts\`), então **não funcionam nem sob Git Bash**. No Windows, use o fluxo de dois terminais descrito acima.

---

## Deploy Contínuo (GitHub Pages)

O site é publicado em <https://brenoajs.github.io/brazil-yield-curve/> por `.github/workflows/pages.yml`. Como o Pages só hospeda arquivos estáticos, o workflow **não sobe o FastAPI**: ele roda a ingestão, congela a API em JSON/CSV e publica esses arquivos junto com o bundle.

Etapas do job (`build`):

1. **Restaura o histórico**: busca `byc.db` da branch dedicada (`data`); se ela ainda não existir, faz carga inicial maior (`--days 60`, senão `--days 5`).
2. **Ingestão oficial**: `seed.py --source official` (3 tentativas, com 60s entre elas — se falhar, o job falha e o site anterior continua no ar).
3. **Exportação estática**: `export_static.py --out ../frontend/public`.
4. **Persiste o banco**: força o push do `byc.db` atualizado para a branch `data`.
5. `npm ci && npm test && npm run build`, depois `upload-pages-artifact` + `deploy-pages`.

Gatilhos: push em `main`, `workflow_dispatch` (botão *Run workflow*) e cron `0 22 * * 1-5` (22:00 UTC ≈ 19:00 BRT, após o fechamento da B3).

### Habilitação (passo manual, uma vez)

Em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions**. Sem isso o workflow roda e o deploy fica parado sem erro óbvio.

### Limitações conhecidas

- O site fica **público** — os dados são públicos (B3 e BCB), então não há vazamento, mas a decisão é sua.
- Cron do GitHub atrasa de 10 a 60 min no plano gratuito e é **desativado após 60 dias sem atividade no repositório**.
- `base` do Vite está fixo em `/brazil-yield-curve/` só para build (`frontend/vite.config.ts`). Domínio próprio ou repo `<user>.github.io` → troque para `/`.

---

## Deploy em Servidor Próprio / VPS (Linux)

Para hospedar a aplicação em servidor dedicado:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python seed.py --days 10 --source official
python -m uvicorn api_main:app --host 127.0.0.1 --port 8021
```

No frontend:

```bash
cd frontend
npm install
npm run build
```

A ingestão diária pode ser configurada agendando a execução periódica do script `scripts/ingest_daily.sh`. Como nada é exposto publicamente, acesse a partir do seu PC por túnel SSH (no PowerShell do Windows):

```powershell
ssh -N -L 5173:127.0.0.1:5173 -L 8021:127.0.0.1:8021 usuario@SEU_VPS
```

Depois abra <http://localhost:5173> no navegador.
