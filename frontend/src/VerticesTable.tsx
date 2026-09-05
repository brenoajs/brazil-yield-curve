import type { Compare, Curve } from './api'
import { PCT } from './format'

export default function VerticesTable({ curve, compare, customCompare, customDate, mode, onModeChange }: {
  curve: Curve
  compare?: Compare
  customCompare?: Compare
  customDate: string | null
  mode: 'previous' | 'custom'
  onModeChange: (m: 'previous' | 'custom') => void
}) {
  const active = mode === 'custom' && customCompare ? customCompare : compare
  const byLabel = new Map(active?.deltas.map((d) => [d.vertex_label, d]))
  return (
    <section className="vertices-section">
      <div className="vertices-head">
        <h2 className="card-title">Vértices</h2>
        <span className="mono" style={{ fontSize: 12, color: '#737373' }}>{curve.trade_date}</span>
        {customDate && customCompare && (
          <div role="group" aria-label="Base de comparação">
            <button type="button" aria-pressed={mode === 'previous'} onClick={() => onModeChange('previous')}>vs anterior</button>
            <button type="button" aria-pressed={mode === 'custom'} onClick={() => onModeChange('custom')}>vs {customDate}</button>
          </div>
        )}
      </div>
      <div className="vertices-scroll">
        <table className="points-table" data-testid="points-table">
          <thead><tr><th>Vértice</th><th>Vencimento</th><th className="num">Taxa</th>
          <th className="num">{mode === 'custom' && customDate ? `Δ pb vs ${customDate}` : 'Δ pb'}</th><th>Origem</th></tr></thead>
          <tbody>{curve.points.map((p) => {
            const d = byLabel.get(p.vertex_label)
            const v = d?.delta_pb
            return (
              <tr key={p.vertex_label}>
                <td className="cell-mono">{p.vertex_label}</td>
                <td className="cell-mono" style={{ color: '#525252', fontSize: 13 }}>{p.maturity_date}</td>
                <td className="num cell-mono">{PCT(p.rate)}</td>
                {v == null ? <td className="num cell-mono">—</td>
                  : <td className={`num cell-mono ${v > 0 ? 'up' : v < 0 ? 'down' : ''}`}>{`${v > 0 ? '+' : ''}${String(v).replace('.', ',')}`}</td>}
                <td><span className={`badge ${p.interpolated ? 'badge-interp' : 'badge-contract'}`}>{p.interpolated ? 'interpolado' : 'contrato'}</span></td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
    </section>
  )
}
