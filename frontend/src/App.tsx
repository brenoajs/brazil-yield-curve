import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, Curve } from './api'
import { BaseKey, prevTradeDate, resolveBaseDates, snapCustomDate, snapToTradeDate } from './dateNav'
import { buildCustomCompare } from './customCompare'
import { brDateWeekday, brDate, brShort } from './format'
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

// Aviso informativo, neutro e dispensável. Âmbar fica reservado para problemas.
function Notice({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div className="notice" data-testid="notice" role="status">
      <span className="notice-text">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#737373" strokeWidth="1.3" aria-hidden="true">
          <circle cx="7" cy="7" r="5.75" />
          <path d="M7 6.2v3.6M7 4.2v.1" strokeLinecap="round" />
        </svg>
        <span>{text}</span>
      </span>
      <button type="button" className="notice-close" aria-label="Dispensar aviso" onClick={onDismiss}>
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
          <path d="M2 2l6 6M8 2l-6 6" />
        </svg>
      </button>
    </div>
  )
}

interface View {
  curve: Curve
  baseCurve?: Curve
  baseKey: BaseKey
  baseDate: string | null
}

export default function App() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [baseKey, setBaseKey] = useState<BaseKey>('prev')
  const [customDate, setCustomDate] = useState('')
  const [hoverTicker, setHoverTicker] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [view, setView] = useState<View | null>(null)

  const datesQ = useQuery({ queryKey: ['dates'], queryFn: () => api.dates() })
  const dates = useMemo(() => datesQ.data?.dates ?? [], [datesQ.data])
  const curveQ = useQuery({
    queryKey: ['curve', selectedDate],
    queryFn: () => (selectedDate ? api.byDate(selectedDate) : api.latest()),
    placeholderData: (prev) => prev, // mantém a curva anterior na tela enquanto a nova carrega
  })
  const curveData = curveQ.data

  // Pregão alvo (o que o usuário pediu), independente do que já está na tela.
  const target = selectedDate ?? dates[0] ?? curveData?.trade_date ?? null

  // Uma única base controla chips, gráfico, cards e tabela. Opções sem histórico
  // caem para "pregão anterior".
  const baseDates = useMemo(() => resolveBaseDates(dates, target, customDate), [dates, target, customDate])
  const effKey: BaseKey = baseKey === 'custom' || baseDates[baseKey] ? baseKey : 'prev'
  const baseDate = baseDates[effKey]

  const baseQ = useQuery({
    queryKey: ['curve-base', baseDate],
    queryFn: () => api.byDate(baseDate as string),
    enabled: !!baseDate,
    placeholderData: (prev) => prev,
  })
  const macroQ = useQuery({
    queryKey: ['macro', target],
    queryFn: () => api.macro(target ?? undefined),
    enabled: !!target,
    placeholderData: (prev) => prev,
    retry: false, // pregão anterior ao primeiro dado macro = 404 esperado
  })

  // Só troca o conteúdo quando curva E base do mesmo pregão chegaram: evita
  // kicker com data nova e comparação com a base antiga.
  const curveFresh = !!curveData && (!target || curveData.trade_date === target)
  const baseMatches = !baseDate || baseQ.data?.trade_date === baseDate
  const baseFresh = baseMatches || baseQ.isError
  const live: View | null = curveFresh && baseFresh
    ? { curve: curveData, baseCurve: baseDate && baseMatches ? baseQ.data : undefined, baseKey: effKey, baseDate }
    : null
  if (live && (!view || view.curve !== live.curve || view.baseCurve !== live.baseCurve
    || view.baseKey !== live.baseKey || view.baseDate !== live.baseDate)) {
    setView(live)
  }
  const shown = live ?? view
  const updating = !live && !curveQ.isError

  const compare = useMemo(
    () => (shown?.baseCurve ? buildCustomCompare(shown.curve, shown.baseCurve) : undefined),
    [shown?.curve, shown?.baseCurve], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const changeTrade = (next: string | null, text: string | null) => {
    const nextTarget = next ?? dates[0] ?? null
    setSelectedDate(next)
    setHoverTicker(null)
    setNotice(text)
    // Data custom que ficou ≥ novo pregão (Δ com sinal invertido) é limpa.
    if (customDate && nextTarget && customDate >= nextTarget) setCustomDate('')
  }
  // Calendário aceita qualquer dia; sem pregão (fim de semana/feriado), o snap
  // cai no pregão anterior mais próximo e avisa em vez de dar 404.
  const handleDateChange = (raw: string) => {
    if (!raw) return changeTrade(null, null)
    const { date, snapped } = snapToTradeDate(dates, raw)
    changeTrade(date, snapped ? `Sem pregão em ${brDateWeekday(raw)}. Mostrando ${brDateWeekday(date)}.` : null)
  }
  const handleLatest = () => changeTrade(null, null)

  const handleCustomChange = (raw: string) => {
    if (!raw) {
      setCustomDate('')
      return
    }
    const snap = target ? snapCustomDate(dates, raw, target) : null
    if (!snap) return
    setCustomDate(snap.date)
    setNotice(snap.snapped ? `Sem pregão em ${brDateWeekday(raw)}. Comparando com ${brDateWeekday(snap.date)}.` : null)
  }

  const headerDate = selectedDate ?? target ?? undefined
  const header = (csvDisabled = false) => (
    <Header
      dates={dates}
      selectedDate={headerDate}
      onDateChange={handleDateChange}
      onLatest={handleLatest}
      csvHref={api.exportCsvUrl(headerDate)}
      updating={updating}
      csvDisabled={csvDisabled}
    />
  )

  if (curveQ.isLoading || (!shown && !curveQ.isError)) return <Skeleton />

  const macroBlock = <KpiStrip macro={macroQ.data} />
  const noticeBlock = notice && <Notice text={notice} onDismiss={() => setNotice(null)} />

  // Erro fica restrito ao bloco do pregão: header e macro continuam.
  if (curveQ.isError) {
    const env = (curveQ.error as { envelope?: { error?: string } }).envelope
    const noData = env?.error === 'no_data'
    return (
      <div>
        {header(true)}
        <main className="page">
          {noticeBlock}
          {macroBlock}
          <section className="error-box" data-testid="error-state">
            <div className="error-kicker">{target ? `Pregão ${brDate(target)}` : 'Curva DI'}</div>
            <h2>{noData ? 'Nenhum pregão disponível ainda' : 'Não foi possível carregar este pregão'}</h2>
            <p>
              {noData
                ? 'Ainda não há curva publicada.'
                : `O arquivo${target ? ` de ${brDate(target)}` : ''} não respondeu. Os demais pregões continuam disponíveis.`}
            </p>
            <div className="error-actions">
              <button type="button" className="btn-dark" onClick={() => curveQ.refetch()}>Tentar de novo</button>
              <button type="button" className="btn-ghost" onClick={handleLatest}>Ir para o último pregão</button>
            </div>
          </section>
        </main>
      </div>
    )
  }

  const { curve, baseCurve, baseKey: shownKey, baseDate: shownBase } = shown!

  if (curve.points.length === 0) {
    return (
      <div>
        {header()}
        <div className="empty-box" data-testid="empty-state">
          <h1>Curva DI</h1>
          <p>Sem pontos para este pregão.</p>
          <button onClick={handleLatest}>Ver último pregão</button>
        </div>
      </div>
    )
  }

  // Base exibida na tela (pode estar uma troca atrás de `target` enquanto atualiza).
  const shownBaseDates = resolveBaseDates(dates, curve.trade_date, customDate)
  const baseShort = shownBase ? `${brShort(shownBase)}${shownKey === 'prev' ? ' (anterior)' : ''}` : '—'
  const customMax = prevTradeDate(dates, curve.trade_date)

  return (
    <div>
      {header()}

      <main className="page">
        {noticeBlock}
        <Hero
          curve={curve}
          compare={compare}
          baseKey={shownKey}
          baseDate={shownBase}
          baseDates={shownBaseDates}
          onBaseKeyChange={setBaseKey}
          customValue={customDate}
          customMax={customMax}
          customMin={dates[dates.length - 1]}
          onCustomChange={handleCustomChange}
        />

        {macroBlock}

        <div className={`fade${updating ? ' is-updating' : ''}`} data-testid="content" aria-busy={updating}>
          <div className="content-grid">
            <CurveChart
              curve={curve}
              baseCurve={baseCurve}
              baseDate={shownBase}
              baseShort={baseShort}
              compare={compare}
              hoverTicker={hoverTicker}
              onHover={setHoverTicker}
            />
            <Panels compare={compare} baseLabel={shownBase ? `vs ${baseShort}` : undefined} onHover={setHoverTicker} />
          </div>

          <VerticesTable curve={curve} compare={compare} baseDate={shownBase} hoverTicker={hoverTicker} onHover={setHoverTicker} />
        </div>

        <p className="footnote">Taxas de ajuste B3, anualizadas em base 252 dias úteis. Alta de taxa em laranja, queda em verde.</p>
      </main>
    </div>
  )
}
