import { Curve } from './api'
import { PCT } from './format'

const W = 900
const H = 360
const L = 92
const R = 858
const T = 40
const B = 312

// Rótulo curto do eixo: ticker B3 (ex.: DI1F27) → "jan/27".
const MONTH_LETTER: Record<string, string> = {
  F: 'jan', G: 'fev', H: 'mar', J: 'abr', K: 'mai', M: 'jun',
  N: 'jul', Q: 'ago', U: 'set', V: 'out', X: 'nov', Z: 'dez',
}

function shortLabel(ticker: string): string {
  const m = /^DI1([A-Z])(\d{2})$/.exec(ticker)
  if (!m) return ticker
  const month = MONTH_LETTER[m[1]]
  return month ? `${month}/${m[2]}` : ticker
}

// Largura aproximada do rótulo em px (Geist Mono 11px ≈ 0.62em por caractere).
const labelWidth = (text: string) => text.length * 6.8

// Eixo x por vencimento (maturity_date), não por índice do vértice.
export default function CurveChart({ curve }: { curve: Curve }) {
  const points = curve.points
  const xs = points.map((p) => new Date(p.maturity_date).getTime())
  const ys = points.map((p) => p.rate * 100)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys) - 0.08
  const maxY = Math.max(...ys) + 0.08
  const sx = (t: number) => L + ((t - minX) / (maxX - minX || 1)) * (R - L)
  const sy = (y: number) => B - ((y - minY) / (maxY - minY || 1)) * (B - T)

  let lastRight = -999 // borda direita do último rótulo desenhado
  const pts = points.map((p, i) => {
    const x = +sx(xs[i]).toFixed(1)
    const y = +sy(ys[i]).toFixed(1)
    const label = shortLabel(p.vertex_label)
    const halfW = labelWidth(label) / 2
    // anti-colisão: só rotula se o rótulo inteiro cabe desde a borda do anterior
    const showLabel = i === points.length - 1 || x - halfW > lastRight + 6
    if (showLabel) lastRight = x + halfW
    return {
      ticker: p.vertex_label,
      label,
      showLabel,
      maturity: p.maturity_date,
      rate: ys[i],
      interp: p.interpolated,
      liq: p.liquidity_note,
      x,
      y,
      left: ((x / W) * 100).toFixed(3) + '%',
      rateTop: (((y - 20) / H) * 100).toFixed(3) + '%',
      rateShort: PCT(p.rate),
      fill: p.interpolated ? '#ffffff' : '#2563eb',
      stroke: p.interpolated ? '#a3a3a3' : '#2563eb',
    }
  })

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${B} L${pts[0].x},${B} Z`

  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = minY + f * (maxY - minY)
    const y = +sy(v).toFixed(1)
    return { y, top: ((y / H) * 100).toFixed(3) + '%', label: v.toFixed(2).replace('.', ',') + '%' }
  })

  return (
    <section className="chart-card" data-testid="curve-chart">
      <div className="card-head">
        <h2 className="card-title">Estrutura a termo</h2>
        <div className="chart-legend">
          <span className="legend-item">
            <span className="legend-dot" /> taxa do contrato
          </span>
          <span className="legend-item">
            <span className="legend-ring" /> interpolada
          </span>
        </div>
      </div>
      <div className="chart-wrap">
        <svg
          className="chart-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Curva DI ${curve.trade_date}`}
        >
          <defs>
            <linearGradient id="fadeBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
          </defs>
          {grid.map((g) => (
            <line key={g.y} x1={L} x2={R} y1={g.y} y2={g.y} stroke="#f0f0f0" />
          ))}
          <path d={areaPath} fill="url(#fadeBlue)" stroke="none" />
          <path
            d={linePath}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {pts.map((p) => (
            <g key={p.ticker}>
              <line x1={p.x} x2={p.x} y1={p.y} y2={B} stroke="#e5e5e5" strokeDasharray="2 3" />
              <circle cx={p.x} cy={p.y} r={4.5} fill={p.fill} stroke={p.stroke} strokeWidth={1.5} />
              <title>{`${p.ticker} · venc. ${p.maturity} · ${p.rate.toFixed(3)}% · ${p.interp ? 'interpolado' : 'contrato'}${p.liq ? ` · ${p.liq}` : ''}`}</title>
            </g>
          ))}
          <line x1={L} x2={R} y1={B} y2={B} stroke="#e5e5e5" />
        </svg>
        <div className="chart-overlay">
          {grid.map((g) => (
            <div key={g.top} className="grid-label" style={{ top: g.top }}>
              {g.label}
            </div>
          ))}
          {pts.map((p, i) =>
            i === pts.length - 1 ? (
              <div key={`rate-${p.ticker}`} className="rate-label" style={{ left: p.left, top: p.rateTop }}>
                {p.rateShort}
              </div>
            ) : null,
          )}
          {pts.map(
            (p) =>
              p.showLabel && (
                <div key={`x-${p.ticker}`} className="x-label" style={{ left: p.left }}>
                  {p.label}
                </div>
              ),
          )}
        </div>
      </div>
      <p className="chart-note">
        Eixo horizontal por data de vencimento. Passe o mouse sobre um ponto para vencimento e nota de liquidez.
      </p>
    </section>
  )
}
