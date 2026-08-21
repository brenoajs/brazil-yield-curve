import { Curve } from './api'

// Eixo x por vencimento (maturity_date), não por índice do vértice.
export default function CurveChart({ curve }: { curve: Curve }) {
  const points = curve.points
  const xs = points.map((p) => new Date(p.maturity_date).getTime())
  const ys = points.map((p) => p.rate * 100)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys) - 0.1
  const maxY = Math.max(...ys) + 0.1
  const W = 800
  const H = 360
  const PAD = { l: 56, r: 16, t: 16, b: 40 }
  const sx = (t: number) => PAD.l + ((t - minX) / (maxX - minX || 1)) * (W - PAD.l - PAD.r)
  const sy = (y: number) => H - PAD.b - ((y - minY) / (maxY - minY || 1)) * (H - PAD.t - PAD.b)

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(xs[i]).toFixed(1)},${sy(ys[i]).toFixed(1)}`)
    .join(' ')

  return (
    <section className="panel" data-testid="curve-chart">
      <h2>
        Curva DI — pregão {curve.trade_date}{' '}
        <span className="muted">(eixo por vencimento)</span>
      </h2>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Curva DI ${curve.trade_date}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const yv = minY + f * (maxY - minY)
          return (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={sy(yv)} y2={sy(yv)} stroke="#e5e7eb" />
              <text x={8} y={sy(yv) + 4} fontSize="11" fill="#6b7280">
                {yv.toFixed(2)}%
              </text>
            </g>
          )
        })}
        {points.map((p, i) => (
          <g key={p.vertex_label}>
            <circle cx={sx(xs[i])} cy={sy(ys[i])} r={4} fill={p.interpolated ? '#9ca3af' : '#2563eb'} />
            <title>{`${p.vertex_label} · venc. ${p.maturity_date} · ${(ys[i]).toFixed(3)}% · ${p.interpolated ? 'interpolado' : 'real'}${p.liquidity_note ? ` · ${p.liquidity_note}` : ''}`}</title>
            <text x={sx(xs[i])} y={H - PAD.b + 16} fontSize="10" textAnchor="middle" fill="#374151">
              {p.vertex_label}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#2563eb" strokeWidth={2} />
      </svg>
      <p className="muted">
        Pontos azuis = taxa real do contrato; cinza = interpolada. Passe o mouse para vencimento e liquidez.
      </p>
    </section>
  )
}
