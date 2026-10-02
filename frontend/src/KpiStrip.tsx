import { Macro, MACRO_LABELS } from './api'
import { brDate } from './format'

const ORDER: { code: string; fmt: (v: number) => string }[] = [
  { code: '432', fmt: pct },
  { code: '1178', fmt: pct },
  { code: '13522', fmt: pct },
  { code: '1', fmt: fx },
]

function pct(v: number) {
  return v.toFixed(2).replace('.', ',')
}
function fx(v: number) {
  return v.toFixed(4).replace('.', ',')
}

// Faixa de KPIs: Selic meta/efetiva, IPCA 12m e PTAX, do último ref_date <= pregão.
export default function KpiStrip({ macro }: { macro?: Macro }) {
  const meta = (code: string) => MACRO_LABELS[code] ?? { label: code, unit: '' }
  const items = ORDER.map(({ code, fmt }) => ({
    key: code,
    ...meta(code),
    value: macro?.indicators[code] != null ? fmt(macro.indicators[code]) : '—',
  }))
  // indicadores fora da ordem fixa entram no fim
  for (const code of Object.keys(macro?.indicators ?? {})) {
    if (!ORDER.some((o) => o.code === code)) {
      items.push({ key: code, ...meta(code), value: pct(macro!.indicators[code]) })
    }
  }
  return (
    <div className="kpis-block">
      <div className="kpis" data-testid="kpi-strip">
        {items.map((it) => (
          <div className="kpi" key={it.key}>
            <div className="kpi-head">
              <span className="kpi-label">{it.label}</span>
              <span className="kpi-unit">{it.unit}</span>
            </div>
            <div className="kpi-value">{it.value}</div>
          </div>
        ))}
      </div>
      {macro && (
        <div className="kpis-caption" data-testid="kpi-caption">
          Indicadores BCB/SGS em {brDate(macro.ref_date)} · último valor disponível até o pregão
        </div>
      )}
    </div>
  )
}
