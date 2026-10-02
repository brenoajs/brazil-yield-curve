import { nextTradeDate, prevTradeDate } from './dateNav'

const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'left' ? 'M7.5 2.5L4 6l3.5 3.5' : 'M4.5 2.5L8 6 4.5 9.5'} />
  </svg>
)

export default function Header({
  dates,
  selectedDate,
  onDateChange,
  onLatest,
  csvHref,
  updating = false,
  csvDisabled = false,
}: {
  dates: string[]
  selectedDate?: string
  onDateChange: (rawDate: string) => void
  onLatest: () => void
  csvHref: string
  updating?: boolean
  csvDisabled?: boolean
}) {
  // Sem selectedDate (ou lista vazia): mostra o último pregão.
  const current = selectedDate ?? dates[0] ?? ''
  const prev = prevTradeDate(dates, current)
  const next = nextTradeDate(dates, current)
  const isLatest = !selectedDate || selectedDate === dates[0]

  return (
    <header className="site-header">
      <div className="brand">
        <div className="brand-logo">DI</div>
        <span className="brand-name">Curva DI</span>
        <span className="brand-divider" />
        <span className="brand-sub">DI1 · futuro de juros</span>
      </div>
      <div className="header-controls">
        {updating && (
          <span className="updating" data-testid="updating" role="status">
            <span className="updating-dot" />
            Atualizando…
          </span>
        )}
        <div className="date-nav">
          <button
            type="button"
            className="date-step"
            aria-label="Pregão anterior"
            disabled={!prev}
            onClick={() => prev && onDateChange(prev)}
          >
            <Chevron dir="left" />
          </button>
          <label className="date-field">
            <span>Pregão</span>
            <input
              type="date"
              value={current}
              min={dates[dates.length - 1]}
              max={dates[0]}
              disabled={dates.length === 0}
              onChange={(e) => {
                if (e.target.value) onDateChange(e.target.value)
              }}
            />
          </label>
          <button
            type="button"
            className="date-step"
            aria-label="Próximo pregão"
            disabled={!next}
            onClick={() => next && onDateChange(next)}
          >
            <Chevron dir="right" />
          </button>
        </div>
        <button type="button" className="btn-ghost" disabled={isLatest || dates.length === 0} onClick={onLatest}>
          Último pregão
        </button>
        {csvDisabled ? (
          <span className="btn-dark is-disabled" role="link" aria-disabled="true">Exportar CSV</span>
        ) : (
          <a className="btn-dark" href={csvHref} download>
            Exportar CSV
          </a>
        )}
      </div>
    </header>
  )
}
