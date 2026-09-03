import { nextTradeDate, prevTradeDate } from './dateNav'

export default function Header({
  dates,
  selectedDate,
  onDateChange,
  onLatest,
  csvHref,
}: {
  dates: string[]
  selectedDate?: string
  onDateChange: (rawDate: string) => void
  onLatest: () => void
  csvHref: string
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
        <div className="date-nav">
          <button
            type="button"
            className="date-step"
            aria-label="Pregão anterior"
            disabled={!prev}
            onClick={() => prev && onDateChange(prev)}
          >
            ◀
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
            ▶
          </button>
        </div>
        <button type="button" className="btn-ghost" disabled={isLatest || dates.length === 0} onClick={onLatest}>
          Último pregão
        </button>
        <a className="btn-dark" href={csvHref} download>
          Exportar CSV
        </a>
      </div>
    </header>
  )
}
