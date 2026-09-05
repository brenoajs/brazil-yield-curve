# Comparar duas datas específicas — Design

Data: 2026-09-05
Status: aprovado pelo usuário (opção A)
Escopo: frontend-only, sem mudança de backend/export estático.

## 1. Objetivo

Permitir comparar a data principal (Header, default latest) com uma data
arbitrária escolhida em calendário, ex.: 01/out/2025 vs hoje/ontem.
Resultado visível nos dois lugares: linha sobreposta no gráfico + deltas
na tabela.

Decisões validadas:
- Onde: nos dois (gráfico + tabela).
- Seleção: campo `type=date` "Comparar com:" com snap para pregão anterior.
- Persistência: data custom fixa ao trocar a principal (modelo principal + referência).

## 2. Arquitetura

Nenhuma mudança em `backend/api_main.py` ou `backend/export_static.py`.
Motivo: `GET /curves/{date}` já é exportado como JSON estático por data,
então `api.byDate(custom)` funciona no GitHub Pages sem re-export.
Deltas custom são join client-side por `vertex_label` (mesma regra do
`/curves/compare`), com `delta_pb = round((rate - prev) * 10000, 2)`.

`Hero` continua vs pregão anterior (fora de escopo mudar KPIs/macro/CSV).
`Panels` (Maior alta/queda) segue o mesmo modo da tabela para não divergir.

## 3. Componentes

### App.tsx
- Novo estado: `customDate: string | null`, `customInput: string`,
  `showCustom: boolean`, `customSnapNotice: string | null`,
  `compareMode: 'previous' | 'custom'`.
- `handleCustomDateChange(raw: string)`: reusa `snapToTradeDate(dates, raw)`,
  seta `customDate`, `customInput`, notice `Sem pregão em X; comparando com Y.`
  Limpar input desliga `showCustom` e volta `compareMode` para `previous`.
- Novo query `customCurveQ` no padrão `weekCurveQ/monthCurveQ`:
  `queryKey: ['curve-ref-custom', customDate]`, `enabled: showCustom && !!customDate`.
- `references: ChartReference[]` ganha 3ª entrada:
  `key 'custom', label 'Data específica', short 'esp.', against 'a data específica', lagDays 0`.
- `customCompare: Compare | undefined` via `useMemo`: join `curve.points`
  com `customCurve.points` por `vertex_label`, `max_up/max_down` por min/max
  de `delta_pb` (ignora null). Se `customDate === curve.trade_date`, deltas zero.

### CurveChart.tsx
- `REF_STYLE.custom = { stroke: '#7c3aed', dash: '8 3', swatch: 'legend-custom' }`.
  Violeta: cinzas ocupados por sem/mês, azul é principal, laranja/verde são alta/queda.
  Requer classe CSS nova `legend-custom` (mesmo padrão de `legend-dash` com
  `border-top-color: #7c3aed`), pois as swatches atuais têm cor cinza fixa —
  reusar `legend-dash` deixaria a legenda cinza divergindo da linha violeta.
- `card-head-actions`: `[checkbox] Data específica [input type=date]`.
  Checkbox `checked = enabled && !!date`, `disabled = !date`.
  `title` explica snap: `Compara com o pregão de {date}` ou `Nenhum pregão disponível`.
  Input `min = dates[last]`, `max = dates[0]`, `value = customInput`.
- Tooltip/legenda/aria-label reusam `active` existente (filtro `enabled && curve`).

### VerticesTable.tsx + Panels.tsx
- Props novas: `customCompare?: Compare`, `mode`, `onModeChange`, `customDate`.
- `vertices-head`: segmented control `[vs anterior | vs {customDate}]`,
  desabilita opção custom sem dado. Header da coluna Δ: `Δ pb` → `Δ pb vs {date}`.
- `DeltaCell` inalterado (— para null, + para positivo, vírgula decimal).
- `Panels` recebe o `Compare` efetivo (previous ou custom) + subtítulo da base.

## 4. Data flow

1. Usuário digita 2025-10-01 no "Comparar com:" → snap → ex. 2025-09-30.
2. `api.byDate('2025-09-30')` → linha violeta + legenda `data específica · 2025-09-30`.
3. `customCompare` memo → tabela/legenda/tooltip mostram Δ vs 2025-09-30.
4. Troca da principal (Header) mantém `customDate` fixa; domínio do gráfico
   recalcula união das séries (lógica existente).

## 5. Error handling

- `dates` vazio: toggle + input desabilitados.
- `customDate` sem fetch (404/erro): linha some, tabela força `previous` + aviso
  `Não foi possível carregar {date}. Mostrando vs pregão anterior.`
- `custom == principal`: permite, aviso `Mesma data — Δ zerado.`
- `vértice sem par`: `previous_rate/delta_pb = null` → célula `—` (regra atual).
- Acessibilidade: `aria-label` do svg inclui data custom quando ativa.

## 6. Testes

- Vitest (`frontend/`): toggle custom renderiza; snap de fim de semana gera notice;
  `ref-line-custom` aparece; header Δ muda para `vs {date}`; deltas seguem
  `round(*10000,2)` e formatação `+12,5` com vírgula; fallback em erro de fetch.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Backend: sem mudança, sem pytest novo. Smoke: `export_static.py` inalterado.

## 7. Fora de escopo (YAGNI)

- Modo A-vs-B simétrico, dois calendários no Header, Hero custom, CSV A-vs-B,
  `GET /curves/compare?base_date=`, macro por data custom, múltiplas datas custom.
