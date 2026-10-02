import { Compare, Curve } from './api'
import { BASE_NAMES, BaseKey } from './dateNav'
import { brDate, brDateWeekday, contractShort, deltaColor, fmtDelta, PCT, weekday } from './format'

const BASE_OPTIONS: { key: BaseKey; label: string }[] = [
  { key: 'prev', label: 'Pregão anterior' },
  { key: 'week', label: '1 semana' },
  { key: 'month', label: '1 mês' },
  { key: 'custom', label: 'Data…' },
]

const TENORS: [number, string][] = [[1, '1 ano'], [3, '3 anos'], [5, '5 anos'], [10, '10 anos']]
const YEAR_MS = 365.25 * 864e5

// Contrato com vencimento mais próximo de N anos a partir do pregão.
function nearestTenor(curve: Curve, years: number) {
  const t0 = Date.parse(curve.trade_date)
  let best: Curve['points'][number] | undefined
  let bestGap = Infinity
  for (const p of curve.points) {
    const gap = Math.abs((Date.parse(p.maturity_date) - t0) / YEAR_MS - years)
    if (gap < bestGap) { best = p; bestGap = gap }
  }
  return best
}

// Cabeçalho da página: título, seletor único de base de comparação e chips por prazo.
export default function Hero({
  curve, compare, baseKey, baseDate, baseDates, onBaseKeyChange,
  customValue, customMax, customMin, onCustomChange,
}: {
  curve: Curve
  compare?: Compare
  baseKey: BaseKey
  baseDate: string | null
  baseDates: Record<BaseKey, string | null>
  onBaseKeyChange: (k: BaseKey) => void
  customValue: string
  customMax: string | null
  customMin?: string
  onCustomChange: (raw: string) => void
}) {
  const deltas = new Map(compare?.deltas.map((d) => [d.vertex_label, d.delta_pb]))
  const chips = TENORS.map(([years, label]) => {
    const p = nearestTenor(curve, years)
    if (!p) return null
    const d = deltas.get(p.vertex_label)
    return (
      <div className="chip" key={label} title={`${p.vertex_label} · ${PCT(p.rate)}`}>
        <span className="chip-dot" style={{ background: deltaColor(d) }} />
        <span className="chip-label">{label}</span>
        <span className="chip-contract">{contractShort(p.vertex_label)}</span>
        <span className="chip-delta" style={{ color: deltaColor(d) }}>{d == null ? '—' : `${fmtDelta(d)} pb`}</span>
      </div>
    )
  })

  return (
    <>
      <div className="hero-head">
        <div className="hero-text">
          <div className="hero-kicker">
            Pregão {brDateWeekday(curve.trade_date)} · {curve.points.length} contratos DI1
          </div>
          <h1 className="hero-title">Curva DI futuro</h1>
          <p className="hero-sub">
            {baseDate
              ? `Taxas de ajuste dos contratos de DI futuro por data de vencimento, comparadas com ${BASE_NAMES[baseKey]} (${brDate(baseDate)}).`
              : 'Taxas de ajuste dos contratos de DI futuro por data de vencimento. Escolha uma data para comparar.'}
          </p>
        </div>
        <div className="hero-base">
          <span className="hero-base-label">Comparar com</span>
          <div className="segmented" role="group" aria-label="Base de comparação">
            {BASE_OPTIONS.map((o) => {
              const date = baseDates[o.key]
              const disabled = o.key === 'custom' ? !baseDates.prev : !date
              const title = o.key === 'custom'
                ? 'Escolher um pregão anterior'
                : date ? brDateWeekday(date) : 'Sem histórico suficiente'
              return (
                <button key={o.key} type="button" className="segmented-btn" aria-pressed={baseKey === o.key}
                  disabled={disabled} title={disabled && o.key === 'custom' ? 'Sem histórico suficiente' : title}
                  onClick={() => onBaseKeyChange(o.key)}>
                  {o.label}
                </button>
              )
            })}
          </div>
          <div className="hero-base-detail">
            {baseKey === 'custom' ? (
              <>
                <label className="custom-field">
                  <input type="date" aria-label="Data de comparação" value={customValue}
                    min={customMin} max={customMax ?? undefined} onChange={(e) => onCustomChange(e.target.value)} />
                </label>
                {customMax && <span className="hero-base-hint">até {brDate(customMax)}</span>}
              </>
            ) : (
              <span className="hero-base-date" data-testid="base-caption">
                {baseDate ? `${weekday(baseDate)}, ${brDate(baseDate)}` : 'sem histórico'}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="delta-chips" data-testid="hero-chips">{chips}</div>
    </>
  )
}
