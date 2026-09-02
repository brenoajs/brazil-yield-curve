import { Compare, Curve } from './api'

const MINUS = '\u2212' // sinal tipográfico, distinto do '-' dos cards

function chipText(bucket: string, deltaPb: number | null | undefined) {
  if (deltaPb == null) return null
  // 1 casa decimal: Math.round inteiro escondia movimentos sub-1pb
  // (ex.: +0,1 virava "0 pb" cinza, enquanto a tabela mostrava o Δ real).
  // Sinal/cor vêm do valor original para não neutralizar poeira direcional.
  const shown = Math.round(deltaPb * 10) / 10
  const sign = deltaPb > 0 ? '+' : deltaPb < 0 ? MINUS : ''
  const cls = deltaPb > 0 ? 'up' : deltaPb < 0 ? 'down' : ''
  const dot = deltaPb > 0 ? '#ea580c' : deltaPb < 0 ? '#16a34a' : '#a3a3a3'
  const num = Number.isInteger(shown) ? String(Math.abs(shown)) : String(Math.abs(shown)).replace('.', ',')
  return (
    <div className="chip" key={bucket}>
      <span className="chip-dot" style={{ background: dot }} />
      <span>
        {bucket} <span className={cls}>{`${sign}${num} pb`}</span>
      </span>
    </div>
  )
}

// Pregão atual contra o anterior, com chips de movimento no miolo e no longo.
export default function Hero({ curve, compare }: { curve: Curve; compare?: Compare }) {
  const deltas = new Map(compare?.deltas.map((d) => [d.vertex_label, d.delta_pb]))
  const mid = curve.points[Math.floor((curve.points.length - 1) / 2)]
  const last = curve.points[curve.points.length - 1]

  return (
    <div className="hero-head">
      <div style={{ maxWidth: 620 }}>
        <div className="hero-kicker">
          Pregão {curve.trade_date}
          {compare?.previous_date ? ` · anterior ${compare.previous_date}` : ''}
        </div>
        <h1 className="hero-title">Curva de juros nominal</h1>
        <p className="hero-sub">
          Vértices do DI futuro (DI1) posicionados pela data de vencimento
          {compare?.previous_date ? `, comparados com o pregão de ${compare.previous_date}` : ''}.
        </p>
      </div>
      <div className="delta-chips" data-testid="hero-chips">
        {mid && chipText('Miolo', deltas.get(mid.vertex_label))}
        {last && last !== mid && chipText('Longo', deltas.get(last.vertex_label))}
      </div>
    </div>
  )
}
