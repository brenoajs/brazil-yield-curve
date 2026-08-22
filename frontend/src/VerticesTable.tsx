import { Compare, CompareDelta, Curve } from './api'
import { PCT } from './format'

function DeltaCell({ d }: { d?: CompareDelta }) {
  const v = d?.delta_pb
  if (v == null) return <td className="num cell-mono">—</td>
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : ''
  const text = `${v > 0 ? '+' : ''}${v}`
  return (
    <td className={`num cell-mono ${cls}`}>{text}</td>
  )
}

// Tabela de vértices: taxa, Δ em pb vs pregão anterior, origem e liquidez.
export default function VerticesTable({ curve, compare }: { curve: Curve; compare?: Compare }) {
  const byLabel = new Map(compare?.deltas.map((d) => [d.vertex_label, d]))
  return (
    <section className="vertices-section">
      <div className="vertices-head">
        <h2 className="card-title">Vértices</h2>
        <span className="mono" style={{ fontSize: 12, color: '#737373' }}>
          {curve.trade_date}
        </span>
      </div>
      <table className="points-table" data-testid="points-table">
        <thead>
          <tr>
            <th>Vértice</th>
            <th>Vencimento</th>
            <th className="num">Taxa</th>
            <th className="num">Δ pb</th>
            <th>Origem</th>
            <th>Liquidez</th>
          </tr>
        </thead>
        <tbody>
          {curve.points.map((p) => {
            const d = byLabel.get(p.vertex_label)
            return (
              <tr key={p.vertex_label}>
                <td className="cell-mono">{p.vertex_label}</td>
                <td className="cell-mono" style={{ color: '#525252', fontSize: 13 }}>
                  {p.maturity_date}
                </td>
                <td className="num cell-mono">{PCT(p.rate)}</td>
                <DeltaCell d={d} />
                <td>
                  <span className={`badge ${p.interpolated ? 'badge-interp' : 'badge-contract'}`}>
                    {p.interpolated ? 'interpolado' : 'contrato'}
                  </span>
                </td>
                <td>{p.liquidity_note ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
