import { useLayoutEffect, useRef, useState } from 'react'
import { Compare, Curve } from './api'
import { brDate, contractShort, deltaColor, fmtDelta, PCT } from './format'

// Plot em px reais: largura medida com ResizeObserver, sem viewBox escalado,
// para que rótulos HTML e geometria SVG nunca divirjam.
const H = 300
const L = 56
const T = 24
const B = 272
const BAR_H = 88
const BAR_MID = 44
const ms = (iso: string) => Date.parse(iso)

// Eixo x por vencimento (maturity_date), com ticks anuais — tickers como
// "jan/28" colidiam com 28–40 contratos.
export default function CurveChart({
  curve, baseCurve, baseDate, baseShort, compare, hoverTicker, onHover,
}: {
  curve: Curve
  baseCurve?: Curve
  baseDate: string | null
  baseShort: string
  compare?: Compare
  hoverTicker: string | null
  onHover: (ticker: string | null) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [wrapW, setWrapW] = useState(760)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0)
      if (w > 0) setWrapW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const W = Math.max(280, wrapW)
  const R = W - 10
  const points = curve.points
  const xs = points.map((p) => ms(p.maturity_date))
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const sx = (t: number) => L + ((t - minX) / (maxX - minX || 1)) * (R - L)

  // Base: só contratos dentro do domínio da curva atual (contratos rolam).
  const basePts = (baseCurve?.points ?? []).filter((p) => ms(p.maturity_date) >= minX && ms(p.maturity_date) <= maxX)
  const ys = points.map((p) => p.rate * 100)
  const all = [...ys, ...basePts.map((p) => p.rate * 100)]
  const minY = Math.min(...all) - 0.08
  const maxY = Math.max(...all) + 0.08
  const sy = (v: number) => B - ((v - minY) / (maxY - minY || 1)) * (B - T)

  const byLabel = new Map(compare?.deltas.map((d) => [d.vertex_label, d]))
  const pts = points.map((p, i) => ({
    p,
    x: +sx(xs[i]).toFixed(1),
    y: +sy(ys[i]).toFixed(1),
    d: byLabel.get(p.vertex_label),
  }))
  const linePath = pts.map((q, i) => `${i ? 'L' : 'M'}${q.x},${q.y}`).join(' ')
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${B} L${pts[0].x},${B} Z`
  const basePath = basePts
    .map((p, i) => `${i ? 'L' : 'M'}${sx(ms(p.maturity_date)).toFixed(1)},${sy(p.rate * 100).toFixed(1)}`)
    .join(' ')

  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = minY + 0.04 + f * (maxY - minY - 0.08)
    return { y: +sy(v).toFixed(1), label: `${v.toFixed(2).replace('.', ',')}%` }
  })

  // Ticks anuais (1º jan): a cada 2 anos < 720px, a cada 3 < 520px.
  const step = W < 520 ? 3 : W < 720 ? 2 : 1
  const xTicks: { x: number; label: string }[] = []
  for (let y = new Date(minX).getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= maxX; y += step) {
    xTicks.push({ x: +sx(Date.UTC(y, 0, 1)).toFixed(1), label: String(y) })
  }

  const hover = pts.find((q) => q.p.vertex_label === hoverTicker)
  const pointerHover = (e: React.PointerEvent<HTMLDivElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left
    let best = pts[0]
    for (const q of pts) if (Math.abs(q.x - x) < Math.abs(best.x - x)) best = q
    if (best.p.vertex_label !== hoverTicker) onHover(best.p.vertex_label)
  }

  // Faixa Δ: escala ±arredondada a 5 pb (mín. 5).
  const maxAbs = Math.max(5, ...pts.map((q) => Math.abs(q.d?.delta_pb ?? 0)))
  const nice = Math.ceil(maxAbs / 5) * 5
  const bw = Math.max(3, Math.min(8, (R - L) / points.length - 4))

  const flip = hover ? hover.x > W - 240 : false
  const tipLeft = hover ? (flip ? hover.x - 230 : hover.x + 14) : 0
  const tipTop = hover ? Math.max(0, Math.min(150, hover.y - 60)) : 0

  return (
    <section className="chart-card" data-testid="curve-chart">
      <div className="card-head">
        <h2 className="card-title">Estrutura a termo</h2>
        <div className="chart-legend">
          <span className="legend-item">
            <span className="legend-line" />
            <span className="mono">{brDate(curve.trade_date)}</span>
          </span>
          {baseCurve && baseDate && (
            <span className="legend-item" data-testid="legend-base">
              <span className="legend-dash" />
              <span className="mono">{brDate(baseDate)}</span>
            </span>
          )}
        </div>
      </div>

      <div
        className="chart-wrap"
        ref={wrapRef}
        onPointerMove={pointerHover}
        onPointerDown={pointerHover}
        onPointerLeave={() => onHover(null)}
      >
        <svg
          width={W}
          height={H}
          className="chart-svg"
          role="img"
          aria-label={baseDate ? `Curva DI ${curve.trade_date} comparada com ${baseDate}` : `Curva DI ${curve.trade_date}`}
        >
          <defs>
            <linearGradient id="fadeBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
          </defs>
          {grid.map((g) => <line key={g.y} x1={L} x2={R} y1={g.y} y2={g.y} stroke="#f0f0f0" />)}
          {xTicks.map((t) => <line key={t.label} x1={t.x} x2={t.x} y1={B} y2={B + 5} stroke="#d4d4d4" />)}
          <path d={areaPath} fill="url(#fadeBlue)" stroke="none" />
          {basePts.length > 1 && (
            <path d={basePath} data-testid="base-line" fill="none" stroke="#a3a3a3" strokeWidth={1.75}
              strokeDasharray="5 4" strokeLinejoin="round" />
          )}
          <path d={linePath} fill="none" stroke="#2563eb" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover && (
            <>
              <line x1={hover.x} x2={hover.x} y1={T} y2={B} stroke="#d4d4d4" />
              {hover.d?.previous_rate != null && (
                <circle cx={hover.x} cy={sy(hover.d.previous_rate * 100)} r={3.5} fill="#fff" stroke="#a3a3a3" strokeWidth={1.5} />
              )}
            </>
          )}
          {pts.map((q) => {
            const on = q.p.vertex_label === hoverTicker
            return <circle key={q.p.vertex_label} cx={q.x} cy={q.y} r={on ? 5 : 3} fill="#2563eb" stroke="#fff" strokeWidth={on ? 2 : 1} />
          })}
          <line x1={L} x2={R} y1={B} y2={B} stroke="#e5e5e5" />
        </svg>
        <div className="chart-overlay">
          {grid.map((g) => (
            <div key={g.y} className="grid-label" style={{ top: g.y }}>{g.label}</div>
          ))}
          {xTicks.map((t) => (
            <div key={t.label} className="x-label" style={{ left: t.x }}>{t.label}</div>
          ))}
          {hover && (
            <div className="chart-tip" data-testid="chart-tooltip" style={{ left: tipLeft, top: tipTop }}>
              <div className="tip-head">
                <span className="tip-title">{contractShort(hover.p.vertex_label)}</span>
                <span className="tip-ticker">{hover.p.vertex_label}</span>
              </div>
              <div className="tip-sub">Vencimento {brDate(hover.p.maturity_date)}</div>
              <div className="tip-rows">
                <div className="tip-row"><span>{brDate(curve.trade_date)}</span><span className="mono">{PCT(hover.p.rate)}</span></div>
                {baseDate && (
                  <div className="tip-row">
                    <span>{brDate(baseDate)}</span>
                    <span className="mono">{hover.d?.previous_rate == null ? '—' : PCT(hover.d.previous_rate)}</span>
                  </div>
                )}
                <div className="tip-row tip-delta">
                  <span>Δ</span>
                  <span className="mono" style={{ color: deltaColor(hover.d?.delta_pb) }}>
                    {hover.d?.delta_pb == null ? '—' : `${fmtDelta(hover.d.delta_pb)} pb`}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {baseDate && (
        <div className="delta-strip">
          <div className="delta-strip-head">
            <span className="delta-strip-title">Δ pb vs {baseShort}</span>
            <span className="delta-strip-sub">por contrato</span>
          </div>
          <div className="delta-strip-plot">
            <svg width={W} height={BAR_H} className="chart-svg" aria-hidden="true">
              <line x1={L} x2={R} y1={BAR_MID} y2={BAR_MID} stroke="#e5e5e5" />
              {hover && <line x1={hover.x} x2={hover.x} y1={0} y2={BAR_H} stroke="#d4d4d4" />}
              {pts.map((q) => {
                const d = q.d?.delta_pb
                if (d == null) return null
                const h = Math.max(1, (Math.abs(d) / nice) * 40)
                return (
                  <rect key={q.p.vertex_label} x={+(q.x - bw / 2).toFixed(1)} y={d >= 0 ? BAR_MID - h : BAR_MID}
                    width={+bw.toFixed(1)} height={+h.toFixed(1)} rx={1.5} fill={deltaColor(d)}
                    opacity={hover && q.p.vertex_label !== hoverTicker ? 0.35 : 1} />
                )
              })}
            </svg>
            <div className="strip-labels">
              <span style={{ top: 0 }}>+{nice}</span>
              <span style={{ top: 37 }}>0</span>
              <span style={{ bottom: 0 }}>{'−'}{nice}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
