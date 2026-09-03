import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import * as apiMod from './api'

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const curve: apiMod.Curve = {
  trade_date: '2026-08-21',
  curve_type: 'DI_FUTURE',
  points: [
    { vertex_label: '3m', maturity_date: '2026-11-21', rate: 0.104, interpolated: false, liquidity_note: 'liquidez reduzida' },
    { vertex_label: '6m', maturity_date: '2027-02-21', rate: 0.1035, interpolated: true, liquidity_note: 'liquidez reduzida' },
  ],
}

const compare = {
  trade_date: '2026-08-21',
  previous_date: '2026-08-20',
  deltas: [
    { vertex_label: '3m', maturity_date: '2026-11-21', rate: 0.104, previous_rate: 0.1025, delta_pb: 1.5 },
    { vertex_label: '6m', maturity_date: '2027-02-21', rate: 0.1035, previous_rate: 0.1045, delta_pb: -1.0 },
  ],
  max_up: compare0()[0],
  max_down: compare0()[1],
}

function compare0() {
  return [
    { vertex_label: '3m', maturity_date: '2026-11-21', rate: 0.104, previous_rate: 0.1025, delta_pb: 1.5 },
    { vertex_label: '6m', maturity_date: '2027-02-21', rate: 0.1035, previous_rate: 0.1045, delta_pb: -1.0 },
  ]
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('mostra skeleton durante loading', async () => {
    vi.spyOn(apiMod.api, 'latest').mockImplementation(() => new Promise(() => {}))
    vi.spyOn(apiMod.api, 'dates').mockResolvedValue({ dates: [] })
    vi.spyOn(apiMod.api, 'compare').mockImplementation(() => new Promise(() => {}))
    vi.spyOn(apiMod.api, 'macro').mockImplementation(() => new Promise(() => {}))
    render(
      <QueryClientProvider client={makeClient()}>
        <App />
      </QueryClientProvider>,
    )
    expect(screen.getByTestId('skeleton')).toBeTruthy()
  })

  it('renderiza curva com eixo por vencimento (maturity_date por ponto)', async () => {
    vi.spyOn(apiMod.api, 'latest').mockResolvedValue(curve)
    vi.spyOn(apiMod.api, 'dates').mockResolvedValue({ dates: ['2026-08-21'] })
    vi.spyOn(apiMod.api, 'compare').mockResolvedValue(compare)
    vi.spyOn(apiMod.api, 'macro').mockResolvedValue({ ref_date: '2026-08-21', indicators: { '432': 4.5 } })
    render(
      <QueryClientProvider client={makeClient()}>
        <App />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('curve-chart')).toBeTruthy())
    // tooltip de cada ponto usa o maturity_date do ponto
    const titles = document.querySelectorAll('svg title')
    expect(titles.length).toBe(2)
    expect(titles[0].textContent).toContain('2026-11-21')
    expect(titles[1].textContent).toContain('2027-02-21')
    // tabela mostra vencimento
    expect(screen.getByText('2026-11-21')).toBeTruthy()
    expect(screen.getByText('interpolado')).toBeTruthy()
  })

  it('cards maior alta/queda alimentados por deltas reais vs pregão anterior', async () => {
    vi.spyOn(apiMod.api, 'latest').mockResolvedValue(curve)
    vi.spyOn(apiMod.api, 'dates').mockResolvedValue({ dates: ['2026-08-21'] })
    vi.spyOn(apiMod.api, 'compare').mockResolvedValue(compare)
    vi.spyOn(apiMod.api, 'macro').mockResolvedValue({ ref_date: '2026-08-21', indicators: {} })
    render(
      <QueryClientProvider client={makeClient()}>
        <App />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('panels')).toBeTruthy())
    // escopo em panels: os chips do Hero mostram os mesmos Δ (miolo/longo),
    // então getByText global ficaria ambíguo.
    const panels = screen.getByTestId('panels')
    expect(within(panels).getByText('+1,5 pb')).toBeTruthy()
    expect(within(panels).getByText('-1 pb')).toBeTruthy()
  })

  it('toggle "semana anterior" plota a curva de 7+ dias atrás', async () => {
    // 2026-08-14 é o pregão mais recente com 7+ dias corridos de defasagem de 2026-08-21.
    const weekAgo: apiMod.Curve = {
      trade_date: '2026-08-14',
      curve_type: 'DI_FUTURE',
      points: [
        { vertex_label: '3m', maturity_date: '2026-11-21', rate: 0.1015, interpolated: false, liquidity_note: null },
        { vertex_label: '6m', maturity_date: '2027-02-21', rate: 0.102, interpolated: false, liquidity_note: null },
      ],
    }
    vi.spyOn(apiMod.api, 'latest').mockResolvedValue(curve)
    vi.spyOn(apiMod.api, 'dates').mockResolvedValue({
      dates: ['2026-08-21', '2026-08-20', '2026-08-14', '2026-08-13'],
    })
    vi.spyOn(apiMod.api, 'compare').mockResolvedValue(compare)
    vi.spyOn(apiMod.api, 'macro').mockResolvedValue({ ref_date: '2026-08-21', indicators: {} })
    const byDate = vi.spyOn(apiMod.api, 'byDate').mockResolvedValue(weekAgo)

    render(
      <QueryClientProvider client={makeClient()}>
        <App />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('curve-chart')).toBeTruthy())

    // desligado por padrão: nenhuma série de referência
    expect(document.querySelector('[data-testid="ref-line"]')).toBeNull()

    fireEvent.click(screen.getByLabelText('Semana anterior'))

    await waitFor(() => expect(document.querySelector('[data-testid="ref-line"]')).toBeTruthy())
    expect(byDate).toHaveBeenCalledWith('2026-08-14')
    // a legenda mostra a data resolvida, não um "semana anterior" genérico
    expect(screen.getByTestId('ref-legend').textContent).toContain('2026-08-14')
    // tooltip do ponto atual ganha o delta em pb contra a referência
    const titles = document.querySelectorAll('svg title')
    expect(titles[0].textContent).toContain('+25 pb')
  })

  it('ao trocar para pregão sem referência, o toggle não fica marcado-e-desabilitado', async () => {
    const oldest: apiMod.Curve = { ...curve, trade_date: '2026-08-13' }
    vi.spyOn(apiMod.api, 'latest').mockResolvedValue(curve)
    vi.spyOn(apiMod.api, 'dates').mockResolvedValue({ dates: ['2026-08-21', '2026-08-14', '2026-08-13'] })
    vi.spyOn(apiMod.api, 'compare').mockResolvedValue(compare)
    vi.spyOn(apiMod.api, 'macro').mockResolvedValue({ ref_date: '2026-08-21', indicators: {} })
    vi.spyOn(apiMod.api, 'byDate').mockImplementation(async (d: string) =>
      d === '2026-08-13' ? oldest : { ...curve, trade_date: d },
    )

    render(
      <QueryClientProvider client={makeClient()}>
        <App />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('curve-chart')).toBeTruthy())

    fireEvent.click(screen.getByLabelText('Semana anterior'))
    await waitFor(() => expect(document.querySelector('[data-testid="ref-line"]')).toBeTruthy())

    // 2026-08-13 é o pregão mais antigo: não existe nenhum 7+ dias antes dele.
    fireEvent.change(screen.getByLabelText('Pregão'), { target: { value: '2026-08-13' } })

    await waitFor(() => {
      const t = screen.getByLabelText('Semana anterior') as HTMLInputElement
      expect(t.disabled).toBe(true)
      expect(t.checked).toBe(false)
    })
    expect(document.querySelector('[data-testid="ref-line"]')).toBeNull()
  })

  it('toggle desabilitado quando não há pregão 7+ dias antes', async () => {
    vi.spyOn(apiMod.api, 'latest').mockResolvedValue(curve)
    vi.spyOn(apiMod.api, 'dates').mockResolvedValue({ dates: ['2026-08-21', '2026-08-20'] })
    vi.spyOn(apiMod.api, 'compare').mockResolvedValue(compare)
    vi.spyOn(apiMod.api, 'macro').mockResolvedValue({ ref_date: '2026-08-21', indicators: {} })
    const byDate = vi.spyOn(apiMod.api, 'byDate').mockResolvedValue(curve)

    render(
      <QueryClientProvider client={makeClient()}>
        <App />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('curve-chart')).toBeTruthy())

    const toggle = screen.getByLabelText('Semana anterior') as HTMLInputElement
    expect(toggle.disabled).toBe(true)
    expect(byDate).not.toHaveBeenCalled()
  })

  it('coluna Δ pb marca alta e queda com as classes de cor', async () => {
    // Regressão de especificidade: .up/.down (0,1,0) perdiam para
    // .points-table .cell-mono (0,2,0) e a coluna saía sempre charcoal,
    // contrariando o rodapé "alta em laranja, queda em verde".
    vi.spyOn(apiMod.api, 'latest').mockResolvedValue(curve)
    vi.spyOn(apiMod.api, 'dates').mockResolvedValue({ dates: ['2026-08-21'] })
    vi.spyOn(apiMod.api, 'compare').mockResolvedValue(compare)
    vi.spyOn(apiMod.api, 'macro').mockResolvedValue({ ref_date: '2026-08-21', indicators: {} })
    render(
      <QueryClientProvider client={makeClient()}>
        <App />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('points-table')).toBeTruthy())

    const rows = document.querySelectorAll('[data-testid="points-table"] tbody tr')
    const deltaCell = (r: Element) => r.querySelectorAll('td')[3]
    // 3m: +1.5 pb (alta) · 6m: -1.0 pb (queda)
    expect(deltaCell(rows[0]).className).toContain('up')
    expect(deltaCell(rows[1]).className).toContain('down')
  })

  it('vértice sem pregão anterior não vira 0,000%', async () => {
    // previous_rate/delta_pb nulos = o vértice não existia ontem. Escrever 0,000%
    // aqui seria uma taxa medida na leitura de quem olha o card.
    const semAnterior = {
      ...compare,
      max_up: { vertex_label: '3m', maturity_date: '2026-11-21', rate: 0.104, previous_rate: null, delta_pb: null },
    }
    vi.spyOn(apiMod.api, 'latest').mockResolvedValue(curve)
    vi.spyOn(apiMod.api, 'dates').mockResolvedValue({ dates: ['2026-08-21'] })
    vi.spyOn(apiMod.api, 'compare').mockResolvedValue(semAnterior)
    vi.spyOn(apiMod.api, 'macro').mockResolvedValue({ ref_date: '2026-08-21', indicators: {} })
    render(
      <QueryClientProvider client={makeClient()}>
        <App />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('panels')).toBeTruthy())
    expect(screen.getByText(/sem vértice no pregão anterior/)).toBeTruthy()
    expect(screen.queryByText(/0,00%/)).toBeNull()
    expect(screen.queryByText(/0,000%/)).toBeNull()
  })

  it('data sem pregão faz snap para o anterior com aviso', async () => {
    // 2026-08-19 (quarta) não está no histórico -> cai no pregão mais
    // próximo para trás (2026-08-20) e avisa, em vez de 404.
    const curve20 = { ...curve, trade_date: '2026-08-20' }
    vi.spyOn(apiMod.api, 'latest').mockResolvedValue(curve)
    vi.spyOn(apiMod.api, 'dates').mockResolvedValue({ dates: ['2026-08-21', '2026-08-20'] })
    const byDate = vi.spyOn(apiMod.api, 'byDate').mockImplementation(async (d: string) =>
      d === '2026-08-20' ? curve20 : curve,
    )
    vi.spyOn(apiMod.api, 'compare').mockResolvedValue(compare)
    vi.spyOn(apiMod.api, 'macro').mockResolvedValue({ ref_date: '2026-08-21', indicators: {} })
    render(
      <QueryClientProvider client={makeClient()}>
        <App />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('curve-chart')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('Pregão'), { target: { value: '2026-08-19' } })

    await waitFor(() => expect(byDate).toHaveBeenCalledWith('2026-08-20'))
    expect(screen.getByTestId('snap-notice').textContent).toContain('2026-08-19')
    expect(screen.getByTestId('snap-notice').textContent).toContain('2026-08-20')
  })

  it('botões ◀ ▶ navegam entre pregões', async () => {
    const curve20 = { ...curve, trade_date: '2026-08-20' }
    vi.spyOn(apiMod.api, 'latest').mockResolvedValue(curve)
    vi.spyOn(apiMod.api, 'dates').mockResolvedValue({ dates: ['2026-08-21', '2026-08-20'] })
    const byDate = vi.spyOn(apiMod.api, 'byDate').mockImplementation(async (d: string) =>
      d === '2026-08-20' ? curve20 : curve,
    )
    vi.spyOn(apiMod.api, 'compare').mockResolvedValue(compare)
    vi.spyOn(apiMod.api, 'macro').mockResolvedValue({ ref_date: '2026-08-21', indicators: {} })
    render(
      <QueryClientProvider client={makeClient()}>
        <App />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('curve-chart')).toBeTruthy())

    fireEvent.click(screen.getByLabelText('Pregão anterior'))
    await waitFor(() => expect(byDate).toHaveBeenCalledWith('2026-08-20'))
    await waitFor(() =>
      expect(document.querySelector('.vertices-head .mono')?.textContent).toContain('2026-08-20'),
    )
  })

  it('Último pregão volta ao latest após navegar', async () => {
    const curve20 = { ...curve, trade_date: '2026-08-20' }
    vi.spyOn(apiMod.api, 'latest').mockResolvedValue(curve)
    vi.spyOn(apiMod.api, 'dates').mockResolvedValue({ dates: ['2026-08-21', '2026-08-20'] })
    vi.spyOn(apiMod.api, 'byDate').mockImplementation(async (d: string) =>
      d === '2026-08-20' ? curve20 : curve,
    )
    vi.spyOn(apiMod.api, 'compare').mockResolvedValue(compare)
    vi.spyOn(apiMod.api, 'macro').mockResolvedValue({ ref_date: '2026-08-21', indicators: {} })
    render(
      <QueryClientProvider client={makeClient()}>
        <App />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('curve-chart')).toBeTruthy())

    fireEvent.click(screen.getByLabelText('Pregão anterior'))
    await waitFor(() =>
      expect(document.querySelector('.vertices-head .mono')?.textContent).toContain('2026-08-20'),
    )
    fireEvent.click(screen.getByText('Último pregão'))
    await waitFor(() =>
      expect(document.querySelector('.vertices-head .mono')?.textContent).toContain('2026-08-21'),
    )
    expect(screen.getByText('Último pregão')).toBeDisabled()
  })

  it('estado de erro com retry', async () => {
    vi.spyOn(apiMod.api, 'latest').mockRejectedValue(new apiMod.ApiError(500, null))
    vi.spyOn(apiMod.api, 'dates').mockResolvedValue({ dates: [] })
    vi.spyOn(apiMod.api, 'compare').mockRejectedValue(new apiMod.ApiError(500, null))
    vi.spyOn(apiMod.api, 'macro').mockRejectedValue(new apiMod.ApiError(500, null))
    render(
      <QueryClientProvider client={makeClient()}>
        <App />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('error-state')).toBeTruthy())
    expect(screen.getByText(/Tentar novamente/)).toBeTruthy()
  })
})
