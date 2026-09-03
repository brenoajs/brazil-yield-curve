import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, Curve, Compare } from './api'
import { latestBefore, snapToTradeDate } from './dateNav'
import Header from './Header'
import Hero from './Hero'
import KpiStrip from './KpiStrip'
import CurveChart, { ChartReference } from './CurveChart'
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
  const [showRefs, setShowRefs] = useState({ week: false, month: false })
  const [snapNotice, setSnapNotice] = useState<string | null>(null)

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

  // Calendário aceita qualquer dia; sem pregão (fim de semana/feriado), o
  // snap cai no pregão anterior mais próximo e avisa em vez de dar 404.
  const handleDateChange = (raw: string) => {
    if (!raw) {
      setSelectedDate(null)
      setSnapNotice(null)
      return
    }
    const { date, snapped } = snapToTradeDate(dates, raw)
    setSelectedDate(date)
    setSnapNotice(snapped ? `Sem pregão em ${raw}; mostrando ${date}.` : null)
  }
  const handleLatest = () => {
    setSelectedDate(null)
    setSnapNotice(null)
  }

  // Referências sobrepostas ("semana/mês anterior") = pregão mais recente com
  // pelo menos N dias corridos de defasagem. Escolhidas da lista existente
  // (desc), nunca por aritmética de data: GET /curves/{date} dá 404 sem pregão.
  const weekDate = useMemo(
    () => (curve?.trade_date ? latestBefore(dates, curve.trade_date, 7) : null),
    [curve?.trade_date, dates],
  )
  const monthDate = useMemo(
    () => (curve?.trade_date ? latestBefore(dates, curve.trade_date, 30) : null),
    [curve?.trade_date, dates],
  )

  const weekCurveQ = useQuery({
    queryKey: ['curve-ref-week', weekDate],
    queryFn: () => api.byDate(weekDate as string),
    enabled: showRefs.week && !!weekDate,
    placeholderData: (prev) => prev,
  })
  const monthCurveQ = useQuery({
    queryKey: ['curve-ref-month', monthDate],
    queryFn: () => api.byDate(monthDate as string),
    enabled: showRefs.month && !!monthDate,
    placeholderData: (prev) => prev,
  })
  const toggleReference = (key: string, value: boolean) =>
    setShowRefs((s) => ({ ...s, [key]: value }))
  const references: ChartReference[] = [
    {
      key: 'week', label: 'Semana anterior', short: 'sem. ant.', against: 'a semana anterior',
      lagDays: 7, date: weekDate,
      curve: showRefs.week && weekDate ? weekCurveQ.data : undefined,
      enabled: showRefs.week,
    },
    {
      key: 'month', label: 'Mês anterior', short: 'mês ant.', against: 'o mês anterior',
      lagDays: 30, date: monthDate,
      curve: showRefs.month && monthDate ? monthCurveQ.data : undefined,
      enabled: showRefs.month,
    },
  ]

  if (curveQ.isLoading) return <Skeleton />

  if (curveQ.isError) {
    const env = (curveQ.error as { envelope?: { error?: string } }).envelope
    return (
      <div>
        <Header
          dates={datesQ.data?.dates ?? []}
          selectedDate={selectedDate ?? undefined}
          onDateChange={handleDateChange} onLatest={handleLatest}
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
          onDateChange={handleDateChange} onLatest={handleLatest}
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
        onDateChange={handleDateChange} onLatest={handleLatest}
        csvHref={api.exportCsvUrl(curve?.trade_date)}
      />

      <main className="page">
        {curve && compare && <Hero curve={curve} compare={compare} />}

        {curveQ.isFetching && !curveQ.isLoading && (
          <div className="stale-banner" data-testid="stale-banner">
            Atualizando. Os números na tela ainda são da carga anterior.
          </div>
        )}

        {snapNotice && (
          <div className="stale-banner" data-testid="snap-notice">
            {snapNotice}
          </div>
        )}

        <KpiStrip macro={macro} />

        {curve && (
          <div className="content-grid">
            <CurveChart
              curve={curve}
              references={references}
              onToggleReference={toggleReference}
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
