export default function Header({
  dates,
  selectedDate,
  onDateChange,
  csvHref,
}: {
  dates: string[]
  selectedDate?: string
  onDateChange: (date: string) => void
  csvHref: string
}) {
  return (
    <header className="site-header">
      <div className="brand">
        <div className="brand-logo">DI</div>
        <span className="brand-name">Curva DI</span>
        <span className="brand-divider" />
        <span className="brand-sub">DI1 · futuro de juros</span>
      </div>
      <div className="header-controls">
        <div className="select-field">
          <span>Pregão</span>
          <select value={selectedDate ?? ''} onChange={(e) => onDateChange(e.target.value)}>
            {dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <a className="btn-dark" href={csvHref} download>
          Exportar CSV
        </a>
      </div>
    </header>
  )
}
