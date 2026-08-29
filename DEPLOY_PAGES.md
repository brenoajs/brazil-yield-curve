# Deploy automatizado no GitHub Pages

Passo a passo para publicar a Curva DI em `https://brenoajs.github.io/brazil-yield-curve/`, com ingestão diária automática e histórico persistente.

**Tempo total:** ~15 minutos, dos quais 1 clique é manual e não repetível.

---

## Como funciona (contexto antes de executar)

GitHub Pages hospeda **apenas arquivos estáticos**. O FastAPI não roda lá. A solução adotada é congelar a API: um workflow do GitHub Actions roda a ingestão, chama cada rota da API em memória, grava as respostas como arquivos `.json`/`.csv` e publica esses arquivos junto com o bundle do frontend.

```
cron (22:00 UTC, seg-sex)
  |
  +-- restaura byc.db do branch `data`
      +-- seed.py --source official      (ingere pregões novos, upsert)
          +-- export_static.py           (banco inteiro -> api/v1/**.json)
              +-- salva byc.db de volta no branch `data`
              +-- npm ci && npm test && npm run build
                  +-- deploy-pages       -> site público atualizado
```

O frontend não faz mais nenhuma chamada a `127.0.0.1:8021`: `frontend/src/api.ts` aponta para caminhos estáticos prefixados por `import.meta.env.BASE_URL`.

---

## Etapa 0 — Verificar o que já está no repositório

Estes arquivos já foram criados/alterados e estão prontos para commit:

| Arquivo | Estado | O que faz |
|---|---|---|
| `backend/export_static.py` | novo | Sobe o app FastAPI em memória (`TestClient`), chama cada rota e grava a resposta em disco. Garante que o arquivo estático tenha exatamente o mesmo contrato da API real. |
| `.github/workflows/pages.yml` | novo | Workflow de build + deploy. |
| `frontend/src/api.ts` | alterado | Query string virou caminho: `api/v1/curves/DI_FUTURE/latest.json`, `.../compare/{data}.json`, `api/v1/macro.json`, CSV em `api/v1/export/DI_FUTURE/{data}.csv`. Tudo prefixado com `BASE_URL`. |
| `frontend/vite.config.ts` | alterado | `base: '/brazil-yield-curve/'` no build, `/` em dev. Proxy `/api` removido. |
| `frontend/tsconfig.json` | alterado | `"types": ["vite/client"]`, necessário para `import.meta.env`. |
| `.gitignore` | alterado | Ignora `frontend/public/api/` (snapshot gerado, não versionado). |
| `README.md` | alterado | Documenta o fluxo novo de dev e o deploy. |

Confira com:

```powershell
git status
```

---

## Etapa 1 — Validar localmente antes de subir

A partir da raiz do repositório, em PowerShell. Rode cada linha separadamente (o PowerShell 5.1 não aceita `&&`).

```powershell
cd backend
.venv\Scripts\python.exe seed.py --days 15 --source official
.venv\Scripts\python.exe export_static.py --out ..\frontend\public
.venv\Scripts\python.exe -m pytest
```

Esperado: `export ok: NN arquivos ...` e `29 passed, 1 deselected`.

```powershell
cd ..\frontend
npm test
npm run build
npm run preview
```

Esperado: `8 passed`, build sem erro de `tsc`, e o preview abrindo em <http://127.0.0.1:5173>. Confira no navegador que o gráfico carrega, o seletor de datas lista pregões e o toggle "Semana anterior" funciona — se algo aparecer vazio, o problema é caminho de arquivo, não o deploy.

Encerre o preview com `Ctrl+C`.

---

## Etapa 2 — Adicionar persistência de dados (branch `data`)

Sem esta etapa, cada execução do workflow reconstrói o banco do zero e o site fica sempre com os últimos ~15 pregões. Com ela, o histórico cresce indefinidamente.

O runner do GitHub é efêmero e `backend/byc.db` não é versionado no `main`. A solução é usar um **branch órfão chamado `data`** como armazenamento: o job baixa o banco no início e o grava de volta no fim, com force-push (commit único, sem histórico — evita acumular centenas de versões do binário no repositório).

Por que não outras opções:

- `actions/cache`: evicção após 7 dias sem uso — exatamente o cenário de falha.
- Artifacts: expiram em 90 dias.
- Banco externo (Turso, Neon): funciona, mas exige conta e secret. Desnecessário para ~6 KB por pregão.

Um efeito colateral desejável: o commit diário no branch `data` conta como atividade no repositório, o que impede o GitHub de desativar o cron por inatividade.

### 2.1 — Ajustar as permissões do workflow

Em `.github/workflows/pages.yml`, troque o bloco `permissions`:

```yaml
permissions:
  contents: write   # era: read — necessário para gravar no branch `data`
  pages: write
  id-token: write
```

Não é preciso criar secret: o `GITHUB_TOKEN` já é injetado automaticamente.

### 2.2 — Restaurar o banco antes da ingestão

Insira este passo **logo depois** de `Install backend deps` e **antes** de `Ingest official data`:

```yaml
      - name: Restore database from data branch
        run: |
          if git ls-remote --exit-code --heads origin data >/dev/null 2>&1; then
            git fetch --depth 1 origin data
            git show FETCH_HEAD:byc.db > backend/byc.db
            echo "SEED_DAYS=5" >> "$GITHUB_ENV"
            echo "banco restaurado do branch data"
          else
            echo "branch data ausente - carga inicial"
            echo "SEED_DAYS=60" >> "$GITHUB_ENV"
          fi
```

Na primeira execução o branch não existe, então ele ingere 60 pregões de uma vez. Nas seguintes, só os 5 mais recentes — o `ingest_curve` faz upsert por `(trade_date, curve_type)`, então rerodar não duplica nem apaga o que já existe.

### 2.3 — Usar a variável na ingestão

No passo `Ingest official data`, troque `--days 15` por `--days "$SEED_DAYS"`:

```yaml
            if python seed.py --days "$SEED_DAYS" --source official; then
```

### 2.4 — Gravar o banco de volta

Insira este passo **logo depois** de `Export API as static files`:

```yaml
      - name: Persist database to data branch
        run: |
          rm -rf /tmp/dbstore
          mkdir -p /tmp/dbstore
          cp backend/byc.db /tmp/dbstore/byc.db
          cd /tmp/dbstore
          git init -q -b data
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git remote add origin "https://x-access-token:${{ secrets.GITHUB_TOKEN }}@github.com/${{ github.repository }}.git"
          git add byc.db
          git commit -q -m "data: snapshot $(date -u +%F)"
          git push -f origin data
```

Ele roda depois do export e antes do build do frontend: se o build quebrar, o dado já está salvo e a próxima execução não precisa reingerir.

O branch `data` contém **apenas** `byc.db`. Não faça merge dele no `main`.

---

## Etapa 3 — Commit e push

```powershell
cd C:\Users\breno\brazil-yield-curve
git add .
git commit -m "feat(deploy): publica curva DI no GitHub Pages com ingestao diaria"
git push origin main
```

O push já dispara o workflow, mas o deploy ainda vai falhar — falta a Etapa 4.

---

## Etapa 4 — Habilitar o Pages (ÚNICO passo manual)

Este é o passo que a Action não consegue executar sozinha. Sem ele, o workflow roda, fica verde no build e o deploy trava sem erro óbvio.

1. Abra <https://github.com/brenoajs/brazil-yield-curve/settings/pages>
2. Em **Build and deployment → Source**, selecione **GitHub Actions** (não "Deploy from a branch")
3. Salve

Feito uma vez, vale para sempre.

> **Atenção:** a partir daqui o site fica **público na internet**. É uma inversão deliberada da postura atual do projeto (backend em `127.0.0.1` + túnel SSH). Os dados vêm de fontes públicas (B3 e BCB), então não há vazamento de informação privada, mas a decisão de expor é sua. Se o repositório for privado, o Pages exige plano Pro/Team.

---

## Etapa 5 — Primeira execução e verificação

1. Vá em **Actions → Build and deploy to GitHub Pages → Run workflow → Run workflow** (branch `main`)
2. Acompanhe o job. A primeira execução demora mais: ingere 60 pregões da B3.
3. Ao terminar, o job `deploy` mostra a URL publicada.

Checklist de verificação no site:

- [ ] `https://brenoajs.github.io/brazil-yield-curve/` carrega o gráfico
- [ ] `.../api/v1/curves/DI_FUTURE/latest.json` devolve JSON no navegador
- [ ] `.../api/v1/macro.json` devolve os indicadores do SGS
- [ ] O seletor de datas lista os pregões
- [ ] O toggle "Semana anterior" desenha a segunda curva
- [ ] O botão de CSV baixa o arquivo
- [ ] O branch `data` existe e contém `byc.db`

Se o gráfico aparecer vazio e o console do navegador mostrar 404 em `/assets/index-*.js`, o `base` do Vite está errado — veja a seção de problemas.

---

## Operação contínua

| Item | Comportamento |
|---|---|
| Atualização | Automática, seg-sex, cron `0 22 * * 1-5` (22:00 UTC ≈ 19:00 BRT, após o fechamento da B3) |
| Disparo manual | Actions → Run workflow |
| Push em `main` | Também dispara build e deploy |
| Falha na ingestão | 3 tentativas com 60 s de intervalo; se todas falharem o job falha e o **site anterior continua no ar** |
| Notificação | GitHub envia email em falha de workflow |
| Custo | Zero em repositório público |

### Limitações conhecidas

- **Atraso do cron:** no plano gratuito o agendamento atrasa de 10 a 60 minutos. Não é bug.
- **Desativação por inatividade:** o GitHub desativa workflows agendados após 60 dias sem atividade no repositório. O commit diário no branch `data` (Etapa 2) evita isso. Sem a Etapa 2, você recebe um email de aviso e precisa reativar manualmente.
- **Fragilidade da fonte:** se a B3 mudar o layout do SPRD, a ingestão quebra. O site não fica desatualizado silenciosamente — o job falha e você é notificado.
- **Crescimento do export:** são 3 arquivos por pregão (curva, compare, CSV). Em 2 anos, ~1500 arquivos e poucos MB — bem dentro do limite do Pages (1 GB de site, 100 GB de banda/mês). Se quiser conter, limite o export aos últimos N pregões mantendo o banco completo.
- **Cache do navegador:** o `index.html` pode ficar em cache no CDN do GitHub por até 10 minutos após o deploy. Os assets têm hash no nome, então não sofrem disso.

---

## Problemas comuns

**Workflow verde mas o site não muda / 404 na URL do Pages**
Etapa 4 não foi feita, ou foi feita como "Deploy from a branch". Volte em Settings → Pages e selecione **GitHub Actions**.

**Página em branco, console com 404 em `/assets/index-*.js`**
O `base` do Vite não bate com a URL. Em `frontend/vite.config.ts`, `base` precisa ser `'/<nome-do-repo>/'`. Se você publicar em domínio próprio ou em um repositório chamado `brenoajs.github.io`, troque para `'/'`.

**Página carrega mas os dados não, com 404 em `api/v1/...json`**
O export não rodou ou saiu na pasta errada. Confirme que o passo `Export API as static files` usa `--out ../frontend/public` e que o log mostra `export ok: NN arquivos`.

**`Permission to ... denied to github-actions[bot]` no passo de persistência**
`permissions.contents` continua em `read`. Veja a Etapa 2.1.

**Ingestão falha com erro de rede**
Pode ser instabilidade da B3 ou feriado sem arquivo. O `seed_history` pula dias sem pregão automaticamente; se falharem as 3 tentativas, rode o workflow manualmente mais tarde.

**Quero apagar o histórico e recomeçar**
Delete o branch `data` (`git push origin --delete data`) e dispare o workflow: ele detecta a ausência e faz carga inicial de 60 pregões.

---

## Desenvolvimento local depois dessa mudança

O frontend não usa mais proxy para o backend. Ele lê o snapshot estático de `frontend/public/api/v1/`, que **não é versionado**. Antes do primeiro `npm run dev`:

```powershell
cd backend
.venv\Scripts\python.exe export_static.py --out ..\frontend\public
```

Repita sempre que reingerir dados. O servidor FastAPI continua útil para inspecionar a API ao vivo em <http://127.0.0.1:8021/docs>, mas não é mais necessário para rodar o frontend.
