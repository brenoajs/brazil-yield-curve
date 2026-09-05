import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Curve } from './api'
import { PCT } from './format'

const W = 900
const H = 360
const L = 92
const R = 858
const T = 40
const B = 312

// Rótulo curto do eixo: ticker B3 (ex.: DI1F27) → "jan/27".
const MONTH_LETTER: Record<string, string> = {
  F: 'jan', G: 'fev', H: 'mar', J: 'abr', K: 'mai', M: 'jun',
  N: 'jul', Q: 'ago', U: 'set', V: 'out', X: 'nov', Z: 'dez',
}

function shortLabel(ticker: string): string {
  const m = /^DI1([A-Z])(\d{2})$/.exec(ticker)
  if (!m) return ticker
  const month = MONTH_LETTER[m[1]]
  return month ? `${month}/${m[2]}` : ticker
}

// Largura aproximada do rótulo em px (Geist Mono 11px ≈ 0.64em por caractere,
// com margem — subestimar aqui empilha "out/26 set/27" no eixo).
const labelWidth = (text: string) => text.length * 7.0

const ms = (iso: string) => new Date(iso).getTime()

// Uma série de referência sobreposta à curva atual (ex.: semana/mês anterior).
export interface ChartReference {
  key: string // 'week' | 'month' — sufixo dos data-testids ref-line-*/ref-legend-*
  label: string // 'Semana anterior' — texto do toggle e da legenda
  short: string // 'sem. ant.' — prefixo do Δ no tooltip
  against: string // 'a semana anterior' — frase da nota do gráfico
  lagDays: number // defasagem mínima em dias corridos
  date: string | null // pregão resolvido (null = sem histórico suficiente)
  curve?: Curve // dados carregados (ausente enquanto carrega/desligado)
  enabled: boolean // toggle ligado
}

// Traço por referência — cinzas neutros: laranja/verde já significam alta/queda.
const REF_STYLE: Record<string, { stroke: string; dash: string; swatch: string }> = {
  week: { stroke: '#a3a3a3', dash: '5 4', swatch: 'legend-dash' },
  month: { stroke: '#737373', dash: '2 3', swatch: 'legend-dots' },
  custom: { stroke: '#7c3aed', dash: '8 3', swatch: 'legend-custom' },
}
const refStyle = (key: string) => REF_STYLE[key] ?? REF_STYLE.week

// Toggle "Data específica": fluxo invertido — o checkbox nasce habilitado e o
// campo de data, apagado; marcar habilita o campo e entrega o foco para digitar.
function CustomReferenceToggle({ reference, customInput, customMin, customMax, onToggleReference, onCustomInputChange }: {
  reference: ChartReference
  customInput: string
  customMin: string
  customMax: string
  onToggleReference: (key: string, value: boolean) => void
  onCustomInputChange: (raw: string) => void
}) {
  const dateRef = useRef<HTMLInputElement>(null)
  const wasEnabled = useRef(reference.enabled)
  useEffect(() => {
    if (reference.enabled && !wasEnabled.current && !reference.date) dateRef.current?.focus()
    wasEnabled.current = reference.enabled
  }, [reference.enabled, reference.date])
  const title = reference.date
    ? `Compara com o pregão de ${reference.date}`
    : reference.enabled ? 'Escolha uma data para comparar' : 'Ativar comparação com data específica'
  return (
    <label className="toggle-field" title={title}>
      <input type="checkbox" checked={!!reference.enabled} onChange={(e) => onToggleReference('custom', e.target.checked)} aria-label="Data específica" />
      <span>Data específica</span>
      <input ref={dateRef} type="date" aria-label="Comparar com" value={customInput} min={customMin} max={customMax}
        disabled={!reference.enabled} onChange={(e) => onCustomInputChange(e.target.value)} />
    </label>
  )
}

// Eixo x por vencimento (maturity_date), não por índice do vértice.
export default function CurveChart({
  curve,
  references,
  onToggleReference,
  customInput,
  customMax,
  customMin,
  onCustomInputChange,
}: {
  curve: Curve
  references: ChartReference[]
  onToggleReference: (key: string, value: boolean) => void
  customInput: string
  customMax: string
  customMin: string
  onCustomInputChange: (raw: string) => void
}) {
  const points = curve.points
  // O SVG usa viewBox fixo (900u) mas renderiza na largura do card: no mobile
  // a mesma cena encolhe e os rótulos HTML (fonte fixa) passariam a colidir.
  // Mede a largura real e converte tudo para unidades do viewBox (metade do
  // rótulo E a folga escalam); sem ResizeObserver (ex.: jsdom) cai para
  // escala 1, o comportamento anterior. Layout effect para não piscar rótulos.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [wrapW, setWrapW] = useState(W)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setWrapW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const unitScale = W / (wrapW || W)
  // Cada referência só entra no domínio quando o toggle está ligado e os dados chegaram.
  const active = references.filter((r) => r.enabled && r.curve)
  const activeXs = active.flatMap((r) => r.curve!.points.map((p) => ms(p.maturity_date)))
  const activeYs = active.flatMap((r) => r.curve!.points.map((p) => p.rate * 100))

  const xs = points.map((p) => ms(p.maturity_date))
  const ys = points.map((p) => p.rate * 100)

  // Domínio sobre a união das séries: contratos rolam, então os vértices podem divergir
  // entre os pregões — usar só a curva atual cortaria as linhas de referência.
  const minX = Math.min(...xs, ...activeXs)
  const maxX = Math.max(...xs, ...activeXs)
  const minY = Math.min(...ys, ...activeYs) - 0.08
  const maxY = Math.max(...ys, ...activeYs) + 0.08
  const sx = (t: number) => L + ((t - minX) / (maxX - minX || 1)) * (R - L)
  const sy = (y: number) => B - ((y - minY) / (maxY - minY || 1)) * (B - T)

  // Join por vertex_label (nunca por índice) — mesma regra do /curves/compare no backend.
  // Um mapa por referência ativa: cada tooltip mostra o Δ contra cada uma.
  const refMaps = active.map((r) => ({
    ref: r,
    map: new Map(r.curve!.points.map((p) => [p.vertex_label, p.rate])),
  }))

  let lastRight = -999 // borda direita do último rótulo desenhado
  const pts = points.map((p, i) => {
    const x = +sx(xs[i]).toFixed(1)
    const y = +sy(ys[i]).toFixed(1)
    const label = shortLabel(p.vertex_label)
    // halfW em unidades do viewBox: a largura estimada é em px renderizados.
    const halfW = (labelWidth(label) / 2) * unitScale
    // anti-colisão: só rotula se o rótulo inteiro cabe desde a borda do anterior
    const showLabel = i === points.length - 1 || x - halfW > lastRight + 8 * unitScale
    if (showLabel) lastRight = x + halfW
    const deltas = refMaps.flatMap(({ ref, map }) => {
      const refRate = map.get(p.vertex_label)
      if (refRate === undefined) return []
      return [{
        ref,
        refRate,
        deltaPb: Math.round((p.rate - refRate) * 10000 * 10) / 10,
      }]
    })
    return {
      ticker: p.vertex_label,
      label,
      showLabel,
      maturity: p.maturity_date,
      rate: ys[i],
      deltas,
      x,
      y,
      left: ((x / W) * 100).toFixed(3) + '%',
      rateTop: (((y - 20) / H) * 100).toFixed(3) + '%',
      rateShort: PCT(p.rate),
    }
  })

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${B} L${pts[0].x},${B} Z`

  // Referências: só linhas tracejadas — sem área, sem marcadores e sem rótulos de eixo
  // (o eixo x pertence à curva atual).
  const refLines = active.map((r) => {
    const rpts = r.curve!.points.map((p) => ({
      x: +sx(ms(p.maturity_date)).toFixed(1),
      y: +sy(p.rate * 100).toFixed(1),
    }))
    return { ref: r, path: rpts.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x},${q.y}`).join(' '), count: rpts.length }
  })

  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = minY + f * (maxY - minY)
    const y = +sy(v).toFixed(1)
    return { y, top: ((y / H) * 100).toFixed(3) + '%', label: v.toFixed(2).replace('.', ',') + '%' }
  })

  return (
    <section className="chart-card" data-testid="curve-chart">
      <div className="card-head">
        <h2 className="card-title">Estrutura a termo</h2>
        <div className="card-head-actions">
          <div className="chart-legend">
            <span className="legend-item">
              <span className="legend-dot" /> taxa do contrato
            </span>
            {active.map(({ key, label, curve }) => (
              <span className="legend-item" key={key} data-testid={`ref-legend-${key}`}>
                <span className={refStyle(key).swatch} /> {label.toLowerCase()} · {curve!.trade_date}
              </span>
            ))}
          </div>
          {references.filter((r) => r.key !== 'custom').map((r) => (
            <label
              key={r.key}
              className="toggle-field"
              title={
                r.date
                  ? `Compara com o pregão de ${r.date}, o mais recente com ${r.lagDays}+ dias de defasagem`
                  : `Nenhum pregão ${r.lagDays} dias ou mais antes deste`
              }
            >
              <input
                type="checkbox"
                // A preferência sobrevive à troca de pregão, a data não: sem referência
                // disponível o toggle não pode aparecer marcado, senão parece quebrado.
                // A preferência continua guardada e a linha volta ao escolher um pregão com histórico.
                checked={r.enabled && !!r.date}
                disabled={!r.date}
                onChange={(e) => onToggleReference(r.key, e.target.checked)}
              />
              <span>{r.label}</span>
            </label>
          ))}
          {(() => {
            const customRef = references.find((r) => r.key === 'custom')
            if (!customRef) return null
            return (
              <CustomReferenceToggle reference={customRef}
                customInput={customInput} customMin={customMin} customMax={customMax}
                onToggleReference={onToggleReference} onCustomInputChange={onCustomInputChange} />
            )
          })()}
        </div>
      </div>
      <div className="chart-wrap" ref={wrapRef}>
        <svg
          className="chart-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={
            active.length > 0
              ? `Curva DI ${curve.trade_date} comparada com ${active.map((r) => r.curve!.trade_date).join(' e ')}`
              : `Curva DI ${curve.trade_date}`
          }
        >
          <defs>
            <linearGradient id="fadeBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
          </defs>
          {grid.map((g) => (
            <line key={g.y} x1={L} x2={R} y1={g.y} y2={g.y} stroke="#f0f0f0" />
          ))}
          <path d={areaPath} fill="url(#fadeBlue)" stroke="none" />
          {refLines.map(({ ref, path, count }) =>
            count > 1 ? (
              <path
                key={ref.key}
                d={path}
                data-testid={`ref-line-${ref.key}`}
                fill="none"
                stroke={refStyle(ref.key).stroke}
                strokeWidth={1.75}
                strokeDasharray={refStyle(ref.key).dash}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null,
          )}
          <path
            d={linePath}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {pts.map((p) => (
            <g key={p.ticker}>
              <line x1={p.x} x2={p.x} y1={p.y} y2={B} stroke="#e5e5e5" strokeDasharray="2 3" />
              <circle cx={p.x} cy={p.y} r={4.5} fill="#2563eb" stroke="#2563eb" strokeWidth={1.5} />
              <title>
                {`${p.ticker} · venc. ${p.maturity} · ${p.rate.toFixed(3)}%` +
                  p.deltas
                    .map(
                      (d) =>
                        ` · ${d.ref.short} ${(d.refRate * 100).toFixed(3)}% (${d.deltaPb >= 0 ? '+' : ''}${d.deltaPb} pb)`,
                    )
                    .join('')}
              </title>
            </g>
          ))}
          <line x1={L} x2={R} y1={B} y2={B} stroke="#e5e5e5" />
        </svg>
        <div className="chart-overlay">
          {grid.map((g) => (
            <div key={g.top} className="grid-label" style={{ top: g.top }}>
              {g.label}
            </div>
          ))}
          {pts.map((p, i) =>
            i === pts.length - 1 ? (
              <div key={`rate-${p.ticker}`} className="rate-label" style={{ left: p.left, top: p.rateTop }}>
                {p.rateShort}
              </div>
            ) : null,
          )}
          {pts.map(
            (p) =>
              p.showLabel && (
                <div key={`x-${p.ticker}`} className="x-label" style={{ left: p.left }}>
                  {p.label}
                </div>
              ),
          )}
        </div>
      </div>
      <p className="chart-note">
        Aponte um vértice para ver ticker, vencimento e taxa
        {active.length > 0 ? `, mais a variação em pb contra ${active.map((r) => r.against).join(' e ')}` : ''}.
      </p>
    </section>
  )
}
