import { Compare, Curve } from './api'

const PCT = (r: number) => `${(r * 100).toFixed(2)}%`.replace('.', ',')

export default function Panels({ compare, curve }: { compare?: Compare; curve?: Curve }) {
  if (!compare) return null
  const { max_up, max_down, previous_date } = compare
  return (
    <div className="panels-row" data-testid="panels">
      <section className="panel card">
        <h2>Maior alta</h2>
        {max_up ? (
          <p>
            <strong>{max_up.vertex_label}</strong> (venc. {max_up.maturity_date})<br />
            {PCT(max_up.previous_rate ?? 0)} → {PCT(max_up.rate)}{' '}
            <span className="up">+{max_up.delta_pb} pb</span>
          </p>
        ) : (
          <p className="muted">sem dados</p>
        )}
      </section>
      <section className="panel card">
        <h2>Maior queda</h2>
        {max_down ? (
          <p>
            <strong>{max_down.vertex_label}</strong> (venc. {max_down.maturity_date})<br />
            {PCT(max_down.previous_rate ?? 0)} → {PCT(max_down.rate)}{' '}
            <span className="down">{max_down.delta_pb} pb</span>
          </p>
        ) : (
          <p className="muted">sem dados</p>
        )}
      </section>
      <section className="panel card">
        <h2>Resumo</h2>
        <p>
          Pregão <strong>{compare.trade_date}</strong>
          <br />
          Anterior: {previous_date ?? '—'}
          <br />
          Vértices: {curve?.points.length ?? compare.deltas.length}
        </p>
      </section>
    </div>
  )
}
