import { Compare } from './api'
import { PCT, PB } from './format'

// Cards "Maior alta / Maior queda" (alimentados por compare).
export default function Panels({ compare }: { compare?: Compare }) {
  if (!compare) return null
  const { max_up, max_down } = compare

  return (
    <div className="side-cards" data-testid="panels">
      <section className="delta-card">
        <div className="delta-card-head">
          <span className="delta-card-title">Maior alta</span>
          <span className="delta-card-value up">{max_up ? PB(max_up.delta_pb ?? 0) : '—'}</span>
        </div>
        {max_up ? (
          <>
            <div className="delta-card-name">{max_up.vertex_label}</div>
            <div className="delta-card-move mono">
              {PCT(max_up.previous_rate ?? 0)} → {PCT(max_up.rate)}
            </div>
            <div className="delta-card-foot">Vencimento {max_up.maturity_date}</div>
          </>
        ) : (
          <div className="delta-card-move">sem dados</div>
        )}
      </section>

      <section className="delta-card">
        <div className="delta-card-head">
          <span className="delta-card-title">Maior queda</span>
          <span className="delta-card-value down">{max_down ? PB(max_down.delta_pb ?? 0) : '—'}</span>
        </div>
        {max_down ? (
          <>
            <div className="delta-card-name">{max_down.vertex_label}</div>
            <div className="delta-card-move mono">
              {PCT(max_down.previous_rate ?? 0)} → {PCT(max_down.rate)}
            </div>
            <div className="delta-card-foot">Vencimento {max_down.maturity_date}</div>
          </>
        ) : (
          <div className="delta-card-move">sem dados</div>
        )}
      </section>
    </div>
  )
}
