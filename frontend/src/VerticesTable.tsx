import { useState } from 'react'
import type { Compare, Curve } from './api'
import { brDate, brShort, contractShort, deltaClass, fmtDelta, PCT } from './format'

// Tabela agrupada por ano de vencimento, recolhível. Abertos por padrão: até 2
// anos à frente do pregão. Coluna Origem fica de fora enquanto nenhum ponto for
// `interpolated`.
export default function VerticesTable({ curve, compare, baseDate, hoverTicker, onHover }: {
  curve: Curve
  compare?: Compare
  baseDate: string | null
  hoverTicker: string | null
  onHover: (t: string | null) => void
}) {
  const [openYears, setOpenYears] = useState<Record<number, boolean> | null>(null)
  const byLabel = new Map(compare?.deltas.map((d) => [d.vertex_label, d]))
  const showOrigin = curve.points.some((p) => p.interpolated)
  const tradeYear = Number(curve.trade_date.slice(0, 4))

  const groups = new Map<number, Curve['points']>()
  for (const p of curve.points) {
    const y = Number(p.maturity_date.slice(0, 4))
    groups.set(y, [...(groups.get(y) ?? []), p])
  }
  const years = [...groups.keys()].sort((a, b) => a - b)
  const isOpen = (y: number) => (openYears ? !!openYears[y] : y <= tradeYear + 2)
  const setAll = (v: boolean) => setOpenYears(Object.fromEntries(years.map((y) => [y, v])))
  const cols = showOrigin ? 6 : 5

  return (
    <section className="vertices-section">
      <div className="vertices-head">
        <div className="vertices-title">
          <h2 className="card-title">Contratos</h2>
          <span className="mono vertices-count">{curve.points.length} vértices</span>
        </div>
        <div className="vertices-actions">
          <button type="button" className="btn-mini" onClick={() => setAll(true)}>Expandir</button>
          <button type="button" className="btn-mini" onClick={() => setAll(false)}>Recolher</button>
        </div>
      </div>
      <div className="vertices-scroll">
        <table className="points-table" data-testid="points-table">
          <thead>
            <tr>
              <th>Contrato</th>
              <th>Vencimento</th>
              <th className="num">Taxa {brShort(curve.trade_date)}</th>
              <th className="num">Taxa {baseDate ? brShort(baseDate) : 'base'}</th>
              <th className="num">Δ pb</th>
              {showOrigin && <th>Origem</th>}
            </tr>
          </thead>
          {years.map((y) => {
            const pts = groups.get(y)!
            const open = isOpen(y)
            return (
              <tbody key={y}>
                <tr className="group-row">
                  <td colSpan={cols}>
                    <button type="button" className="group-toggle" aria-expanded={open}
                      onClick={() => setOpenYears({ ...Object.fromEntries(years.map((k) => [k, isOpen(k)])), [y]: !open })}>
                      <svg className="group-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
                        strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                        style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                        <path d="M3.5 2l3 3-3 3" />
                      </svg>
                      <span className="group-year">{y}</span>
                      <span className="group-count">{pts.length} {pts.length === 1 ? 'contrato' : 'contratos'}</span>
                    </button>
                  </td>
                </tr>
                {open && pts.map((p) => {
                  const d = byLabel.get(p.vertex_label)
                  return (
                    <tr key={p.vertex_label} className={hoverTicker === p.vertex_label ? 'is-hover' : undefined}
                      onMouseEnter={() => onHover(p.vertex_label)} onMouseLeave={() => onHover(null)}>
                      <td className="cell-contract">
                        <span className="contract-short">{contractShort(p.vertex_label)}</span>
                        <span className="contract-ticker">{p.vertex_label}</span>
                      </td>
                      <td className="cell-mono cell-maturity">{brDate(p.maturity_date)}</td>
                      <td className="num cell-mono">{PCT(p.rate)}</td>
                      <td className="num cell-mono cell-base">{d?.previous_rate == null ? '—' : PCT(d.previous_rate)}</td>
                      <td className={`num cell-mono ${deltaClass(d?.delta_pb)}`}>{fmtDelta(d?.delta_pb)}</td>
                      {showOrigin && (
                        <td><span className={`badge ${p.interpolated ? 'badge-interp' : 'badge-contract'}`}>{p.interpolated ? 'interpolado' : 'contrato'}</span></td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            )
          })}
        </table>
      </div>
    </section>
  )
}
