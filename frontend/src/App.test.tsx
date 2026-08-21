import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByText('+1.5 pb')).toBeTruthy()
    expect(screen.getByText('-1 pb')).toBeTruthy()
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
