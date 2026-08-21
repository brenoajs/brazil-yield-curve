import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, Curve, Compare, Macro, MACRO_LABELS } from './api'
import CurveChart from './CurveChart'
import Panels from './Panels'

const PCT = (r: number) => `${(r * 100).toFixed(2)}%`.replace('.', ',')

function Skeleton() {
  return (
    <div data-testid="skeleton" className="skeleton">
      <div className="sk-line" style={{ width: '30%' }} />
      <div className="sk-chart" />
      <div className="sk-line" style={{ width: '70%' }} />
      <div className="sk-line" style={{ width: '60%' }} />
    </div>
  )
}

export default function App() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [staleNotice, setStaleNotice] = useState<string | null>(null)

  const datesQ = useQuery({ queryKey: ['dates'], queryFn: () => api.dates() })
  const curveQ = useQuery({
    queryKey: ['curve', selectedDate],
    queryFn: () => (selectedDate ? api.byDate(selectedDate) : api.latest()),
    placeholderData: (prev) => prev, // preserva último dado válido (staleness)
  })
  const compareQ = useQuery({
    queryKey: ['compare', selectedDate],
    queryFn: () => api.compare(selectedDate ?? undefined),
    placeholderData: (prev) => prev,
  })
  const macroQ = useQuery({ queryKey: ['macro'], queryFn: () => api.macro() })

  const curve: Curve | undefined = curveQ.data
  const compare: Compare | undefined = compareQ.data
  const macro: Macro | undefined = macroQ.data

  if (curveQ.isLoading) return <Skeleton />

  if (curveQ.isError) {
    const env = (curveQ.error as { envelope?: { error?: string } }).envelope
    return (
      <div className="container">
        <h1>Brazil Yield Curve</h1>
        <div className="error-box" data-testid="error-state">
          <p>
            Falha ao carregar a curva
            {env?.error === 'no_data' ? ' — nenhum pregão disponível ainda.' : '.'}
          </p>
          <button onClick={() => curveQ.refetch()}>Tentar novamente</button>
        </div>
      </div>
    )
  }

  if (curve && curve.points.length === 0) {
    return (
      <div className="container">
        <h1>Brazil Yield Curve</h1>
        <div className="empty-box" data-testid="empty-state">
          <p>Sem pontos para este pregão.</p>
          <button onClick={() => setSelectedDate(null)}>Ver último pregão</button>
        </div>
      </div>
    )
  }

  const isStale = curveQ.isFetching && !curveQ.isLoading
  if (isStale && !staleNotice) setStaleNotice('Atualizando… exibindo último dado válido.')

  return (
    <div className="container">
      <h1>Brazil Yield Curve — DI futuro (DI1)</h1>

      {staleNotice && (
        <div className="stale-banner" data-testid="stale-banner">
          {staleNotice}
        </div>
      )}

      <div className="controls">
        <label>
          Pregão:{' '}
          <select
            value={curve?.trade_date ?? ''}
            onChange={(e) => setSelectedDate(e.target.value)}
          >
            {(datesQ.data?.dates ?? []).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <a className="btn" href={api.exportCsvUrl(curve?.trade_date)} download>
          Exportar CSV
        </a>
      </div>

      {curve && <CurveChart curve={curve} />}

      <Panels compare={compare} curve={curve} />

      {macro && (
        <section className="panel">
          <h2>Contexto macro ({macro.ref_date})</h2>
          <ul className="macro-list">
            {Object.entries(macro.indicators).map(([code, value]) => (
              <li key={code}>
                {MACRO_LABELS[code] ?? code}: <strong>{String(value).replace('.', ',')}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {curve && (
        <table className="points-table" data-testid="points-table">
          <thead>
            <tr>
              <th>Vértice</th>
              <th>Vencimento</th>
              <th>Taxa</th>
              <th>Tipo</th>
              <th>Δ pb (vs pregão ant.)</th>
              <th>Liquidez</th>
            </tr>
          </thead>
          <tbody>
            {curve.points.map((p) => {
              const d = compare?.deltas.find((x) => x.vertex_label === p.vertex_label)
              return (
                <tr key={p.vertex_label}>
                  <td>{p.vertex_label}</td>
                  <td>{p.maturity_date}</td>
                  <td>{PCT(p.rate)}</td>
                  <td>{p.interpolated ? 'interpolado' : 'real'}</td>
                  <td className={(d?.delta_pb ?? 0) >= 0 ? 'up' : 'down'}>
                    {d?.delta_pb != null ? `${d.delta_pb > 0 ? '+' : ''}${d.delta_pb}` : '—'}
                  </td>
                  <td>{p.liquidity_note ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
