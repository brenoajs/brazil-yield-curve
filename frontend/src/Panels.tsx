import { CompareDelta, Compare } from './api'
import { PCT, PB } from './format'

// previous_rate/delta_pb vêm nulos quando o vértice não existia no pregão anterior.
// Nesse caso a célula fica em "—": um 0,000% escrito seria lido como taxa medida.
const deltaText = (d: CompareDelta) => (d.delta_pb == null ? '—' : PB(d.delta_pb))
const moveText = (d: CompareDelta) =>
  d.previous_rate == null ? `sem vértice no pregão anterior · ${PCT(d.rate)}` : `${PCT(d.previous_rate)} → ${PCT(d.rate)}`

// Cards "Maior alta / Maior queda" (alimentados por compare).
export default function Panels({ compare }: { compare?: Compare }) {
  if (!compare) return null
  const { max_up, max_down } = compare

  return (
    <div className="side-cards" data-testid="panels">
      <section className="delta-card">
        <div className="delta-card-head">
          <span className="delta-card-title">Maior alta</span>
          <span className="delta-card-value up">{max_up ? deltaText(max_up) : '—'}</span>
        </div>
        {max_up ? (
          <>
            <div className="delta-card-name">{max_up.vertex_label}</div>
            <div className="delta-card-move mono">{moveText(max_up)}</div>
            <div className="delta-card-foot">Vencimento {max_up.maturity_date}</div>
          </>
        ) : (
          <div className="delta-card-move">sem dados</div>
        )}
      </section>

      <section className="delta-card">
        <div className="delta-card-head">
          <span className="delta-card-title">Maior queda</span>
          <span className="delta-card-value down">{max_down ? deltaText(max_down) : '—'}</span>
        </div>
        {max_down ? (
          <>
            <div className="delta-card-name">{max_down.vertex_label}</div>
            <div className="delta-card-move mono">{moveText(max_down)}</div>
            <div className="delta-card-foot">Vencimento {max_down.maturity_date}</div>
          </>
        ) : (
          <div className="delta-card-move">sem dados</div>
        )}
      </section>
    </div>
  )
}
