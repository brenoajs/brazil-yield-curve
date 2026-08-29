import { Macro, MACRO_LABELS } from './api'

const ORDER: { code: string; fmt: (v: number) => string }[] = [
  { code: '432', fmt: pct },
  { code: '1178', fmt: pct },
  { code: '13522', fmt: pct },
  { code: '1', fmt: fx },
]

function pct(v: number) {
  return `${v.toFixed(2)}%`.replace('.', ',')
}
function fx(v: number) {
  return v.toFixed(4).replace('.', ',')
}

// Faixa de KPIs: Selic meta/efetiva, IPCA 12m e PTAX.
export default function KpiStrip({ macro }: { macro?: Macro }) {
  const items = ORDER.map(({ code, fmt }) => ({
    key: code,
    label: MACRO_LABELS[code] ?? code,
    value: macro?.indicators[code] != null ? fmt(macro.indicators[code]) : '—',
  }))
  // indicadores fora da ordem fixa entram no fim
  for (const [code] of Object.entries(macro?.indicators ?? {})) {
    if (!ORDER.some((o) => o.code === code)) {
      items.push({ key: code, label: MACRO_LABELS[code] ?? code, value: pct(macro!.indicators[code]) })
    }
  }
  return (
    <div className="kpis" data-testid="kpi-strip">
      {items.map((it) => (
        <div className="kpi" key={it.key}>
          <div className="kpi-label">{it.label}</div>
          <div className="kpi-value">{it.value}</div>
        </div>
      ))}
    </div>
  )
}
