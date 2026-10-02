import { CompareDelta, Compare } from './api'
import { brDate, contractShort, deltaClass, PB, PCT } from './format'

const moveText = (d: CompareDelta) =>
  d.previous_rate == null ? `sem vértice na base · ${PCT(d.rate)}` : `${PCT(d.previous_rate)} → ${PCT(d.rate)}`

function Card({ title, d, onHover }: { title: string; d: CompareDelta | null; onHover: (t: string | null) => void }) {
  return (
    <section
      className="delta-card"
      onMouseEnter={() => d && onHover(d.vertex_label)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="delta-card-head">
        <span className="delta-card-title">{title}</span>
        <span className={`delta-card-value ${deltaClass(d?.delta_pb)}`}>{d ? PB(d.delta_pb) : '—'}</span>
      </div>
      {d ? (
        <>
          <div className="delta-card-name">
            {contractShort(d.vertex_label)}
            <span className="delta-card-ticker">{d.vertex_label}</span>
          </div>
          <div className="delta-card-move mono">{moveText(d)}</div>
          <div className="delta-card-foot">Vencimento {brDate(d.maturity_date)}</div>
        </>
      ) : (
        <div className="delta-card-move">sem base de comparação</div>
      )}
    </section>
  )
}

// Cards "Maior alta / Maior queda" — seguem a base única da página.
// Hover num card destaca o contrato no gráfico e na tabela.
export default function Panels({
  compare, baseLabel, onHover = () => {},
}: { compare?: Compare; baseLabel?: string; onHover?: (ticker: string | null) => void }) {
  return (
    <div className="side-cards" data-testid="panels">
      {baseLabel && <span className="base-label">{baseLabel}</span>}
      <Card title="Maior alta" d={compare?.max_up ?? null} onHover={onHover} />
      <Card title="Maior queda" d={compare?.max_down ?? null} onHover={onHover} />
    </div>
  )
}
