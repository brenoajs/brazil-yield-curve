import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, Curve, Compare } from './api'
import Header from './Header'
import Hero from './Hero'
import KpiStrip from './KpiStrip'
import CurveChart from './CurveChart'
import Panels from './Panels'
import VerticesTable from './VerticesTable'

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
  const [showRef, setShowRef] = useState(false)

  const datesQ = useQuery({ queryKey: ['dates'], queryFn: () => api.dates() })
  const curveQ = useQuery({
    queryKey: ['curve', selectedDate],
    queryFn: () => (selectedDate ? api.byDate(selectedDate) : api.latest()),
    placeholderData: (prev) => prev, // mantém a curva anterior na tela enquanto a nova carrega
  })
  const compareQ = useQuery({
    queryKey: ['compare', selectedDate],
    queryFn: () => api.compare(selectedDate ?? undefined),
    placeholderData: (prev) => prev,
  })
  const macroQ = useQuery({ queryKey: ['macro'], queryFn: () => api.macro() })

  const curve: Curve | undefined = curveQ.data
  const compare: Compare | undefined = compareQ.data
  const macro = macroQ.data
  const dates = useMemo(() => datesQ.data?.dates ?? [], [datesQ.data])

  // "Semana anterior" = pregão mais recente com pelo menos 7 dias corridos de defasagem.
  // Escolhido a partir da lista de datas existentes (desc), nunca por aritmética de data:
  // GET /curves/{date} responde 404 para um dia sem pregão.
  const refDate = useMemo(() => {
    if (!curve?.trade_date) return null
    const cutoff = new Date(Date.parse(curve.trade_date) - 7 * 864e5).toISOString().slice(0, 10)
    return dates.find((d) => d <= cutoff) ?? null
  }, [curve?.trade_date, dates])

  const refCurveQ = useQuery({
    queryKey: ['curve-ref', refDate],
    queryFn: () => api.byDate(refDate as string),
    enabled: showRef && !!refDate,
    placeholderData: (prev) => prev,
  })
  const refCurve = showRef && refDate ? refCurveQ.data : undefined

  if (curveQ.isLoading) return <Skeleton />

  if (curveQ.isError) {
    const env = (curveQ.error as { envelope?: { error?: string } }).envelope
    return (
      <div>
        <Header
          dates={datesQ.data?.dates ?? []}
          selectedDate={selectedDate ?? undefined}
          onDateChange={setSelectedDate}
          csvHref={api.exportCsvUrl(undefined)}
        />
        <div className="error-box" data-testid="error-state">
          <h1>Curva DI</h1>
          <p>
            {env?.error === 'no_data'
              ? 'Nenhum pregão disponível ainda.'
              : 'Não foi possível carregar a curva.'}
          </p>
          <button onClick={() => curveQ.refetch()}>Tentar novamente</button>
        </div>
      </div>
    )
  }

  if (curve && curve.points.length === 0) {
    return (
      <div>
        <Header
          dates={datesQ.data?.dates ?? []}
          selectedDate={selectedDate ?? curve.trade_date}
          onDateChange={setSelectedDate}
          csvHref={api.exportCsvUrl(curve.trade_date)}
        />
        <div className="empty-box" data-testid="empty-state">
          <h1>Curva DI</h1>
          <p>Sem pontos para este pregão.</p>
          <button onClick={() => setSelectedDate(null)}>Ver último pregão</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Header
        dates={datesQ.data?.dates ?? []}
        selectedDate={selectedDate ?? curve?.trade_date}
        onDateChange={setSelectedDate}
        csvHref={api.exportCsvUrl(curve?.trade_date)}
      />

      <main className="page">
        {curve && compare && <Hero curve={curve} compare={compare} />}

        {curveQ.isFetching && !curveQ.isLoading && (
          <div className="stale-banner" data-testid="stale-banner">
            Atualizando. Os números na tela ainda são da carga anterior.
          </div>
        )}

        <KpiStrip macro={macro} />

        {curve && (
          <div className="content-grid">
            <CurveChart
              curve={curve}
              refCurve={refCurve}
              refDate={refDate}
              showRef={showRef}
              onToggleRef={setShowRef}
            />
            <Panels compare={compare} />
          </div>
        )}

        {curve && <VerticesTable curve={curve} compare={compare} />}

        <p className="footnote">Taxas anualizadas em base 252 dias úteis. Alta de taxa em laranja, queda em verde.</p>
      </main>
    </div>
  )
}
