import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import * as apiMod from './api'

const DATES = ['2026-08-21', '2026-08-20', '2026-08-14', '2026-07-21']

// Duas contratos: jan/27 (grupo 2027, aberto) e jan/29 (grupo 2029, fechado por padrão).
const RATES: Record<string, [number, number]> = {
  '2026-08-21': [0.104, 0.1035],
  '2026-08-20': [0.1025, 0.1045],
  '2026-08-14': [0.1015, 0.102],
  '2026-08-13': [0.1012, 0.1018],
  '2026-07-21': [0.1, 0.101],
}
function curveOf(date: string): apiMod.Curve {
  const [a, b] = RATES[date]
  return {
    trade_date: date,
    curve_type: 'DI_FUTURE',
    points: [
      { vertex_label: 'DI1F27', maturity_date: '2027-01-04', rate: a, interpolated: false, liquidity_note: null },
      { vertex_label: 'DI1F29', maturity_date: '2029-01-02', rate: b, interpolated: false, liquidity_note: null },
    ],
  }
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}
function renderApp() {
  render(
    <QueryClientProvider client={makeClient()}>
      <App />
    </QueryClientProvider>,
  )
}
function mockApi(over: { dates?: string[] } = {}) {
  const dates = over.dates ?? DATES
  vi.spyOn(apiMod.api, 'latest').mockResolvedValue(curveOf(dates[0]))
  vi.spyOn(apiMod.api, 'dates').mockResolvedValue({ dates })
  const byDate = vi.spyOn(apiMod.api, 'byDate').mockImplementation(async (d) => curveOf(d))
  const macro = vi.spyOn(apiMod.api, 'macro').mockImplementation(async (d) => ({
    ref_date: d ?? dates[0],
    indicators: { '432': 15, '1178': 14.9, '13522': 4.52, '1': 5.3812 },
  }))
  return { byDate, macro }
}
async function ready() {
  await waitFor(() => expect(screen.getByTestId('curve-chart')).toBeTruthy())
  await waitFor(() => expect(screen.queryByTestId('updating')).toBeNull())
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('mostra skeleton durante loading', () => {
    vi.spyOn(apiMod.api, 'latest').mockImplementation(() => new Promise(() => {}))
    vi.spyOn(apiMod.api, 'dates').mockResolvedValue({ dates: [] })
    vi.spyOn(apiMod.api, 'macro').mockImplementation(() => new Promise(() => {}))
    renderApp()
    expect(screen.getByTestId('skeleton')).toBeTruthy()
  })

  it('renderiza gráfico, hero e tabela agrupada por ano (sem coluna Origem)', async () => {
    mockApi()
    renderApp()
    await ready()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Curva DI futuro')
    // tooltip é HTML real: nenhum <title> no SVG
    expect(document.querySelectorAll('svg title').length).toBe(0)
    const table = screen.getByTestId('points-table')
    expect(within(table).getByText('2027')).toBeTruthy()
    expect(within(table).getByText('04/01/2027')).toBeTruthy()
    // 2029 passa de pregão+2 anos: grupo fechado por padrão
    expect(within(table).queryByText('02/01/2029')).toBeNull()
    expect(within(table).queryByText('Origem')).toBeNull()
    fireEvent.click(within(table).getByRole('button', { name: /2029/ }))
    expect(within(table).getByText('02/01/2029')).toBeTruthy()
  })

  it('Expandir e Recolher controlam todos os grupos', async () => {
    mockApi()
    renderApp()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Expandir' }))
    expect(screen.getByText('02/01/2029')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Recolher' }))
    expect(screen.queryByText('04/01/2027')).toBeNull()
  })

  it('uma única base: cards, tabela e chips seguem o pregão anterior com Δ de 1 casa', async () => {
    mockApi()
    renderApp()
    await ready()
    const panels = screen.getByTestId('panels')
    // jan/27: 10,25% → 10,40% = +15,0 pb; jan/29: 10,45% → 10,35% = −10,0 pb
    expect(within(panels).getByText('+15,0 pb')).toBeTruthy()
    expect(within(panels).getByText('−10,0 pb')).toBeTruthy()
    expect(within(panels).getByText('vs 20/08 (anterior)')).toBeTruthy()
    const table = screen.getByTestId('points-table')
    expect(within(table).getByText('+15,0')).toBeTruthy()
    expect(within(table).getByText('10,250%')).toBeTruthy() // taxa da base
    expect(screen.getByTestId('legend-base').textContent).toBe('20/08/2026')
    // sem toggles legados nem mode-switch
    expect(screen.queryByLabelText('Semana anterior')).toBeNull()
    expect(document.querySelector('.mode-switch')).toBeNull()
  })

  it('trocar a base para 1 semana atualiza gráfico, cards e tabela de uma vez', async () => {
    const { byDate } = mockApi()
    renderApp()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: '1 semana' }))
    await waitFor(() => expect(byDate).toHaveBeenCalledWith('2026-08-14'))
    await waitFor(() => expect(screen.getByTestId('legend-base').textContent).toBe('14/08/2026'))
    // jan/27: 10,15% → 10,40% = +25,0 pb
    expect(within(screen.getByTestId('panels')).getByText('+25,0 pb')).toBeTruthy()
    expect(within(screen.getByTestId('points-table')).getByText('10,150%')).toBeTruthy()
    expect(screen.getByText(/comparadas com 1 semana \(14\/08\/2026\)/)).toBeTruthy()
  })

  it('base sem histórico fica desabilitada', async () => {
    mockApi({ dates: ['2026-08-21', '2026-08-20'] })
    renderApp()
    await ready()
    const group = within(screen.getByRole('group', { name: 'Base de comparação' }))
    expect(group.getByRole('button', { name: '1 semana' })).toBeDisabled()
    expect(group.getByRole('button', { name: '1 mês' })).toBeDisabled()
    expect(group.getByRole('button', { name: 'Pregão anterior' })).toBeEnabled()
  })

  it('macro acompanha o pregão selecionado e mostra o ref_date', async () => {
    const { macro } = mockApi()
    renderApp()
    await ready()
    await waitFor(() => expect(macro).toHaveBeenCalledWith('2026-08-21'))
    expect(screen.getByTestId('kpi-caption').textContent).toContain('21/08/2026')
    expect(screen.getByText('Selic meta')).toBeTruthy()
    expect(screen.getAllByText('% a.a.').length).toBe(2)
    fireEvent.click(screen.getByLabelText('Pregão anterior'))
    await waitFor(() => expect(macro).toHaveBeenCalledWith('2026-08-20'))
  })

  it('data específica: max = pregão anterior e snap nunca ≥ pregão atual', async () => {
    mockApi()
    renderApp()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Data…' }))
    const input = screen.getByLabelText('Data de comparação') as HTMLInputElement
    expect(input.max).toBe('2026-08-20')
    // data futura/igual ao pregão cai no pregão anterior, com aviso
    fireEvent.change(input, { target: { value: '2026-08-21' } })
    await waitFor(() => expect(screen.getByLabelText('Data de comparação')).toHaveValue('2026-08-20'))
    expect(screen.getByTestId('notice').textContent).toContain('Comparando com qui, 20/08/2026')
  })

  it('data específica sem pregão faz snap para trás', async () => {
    mockApi()
    renderApp()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Data…' }))
    // 16/08/2026 é domingo: pregão anterior mais próximo = 14/08
    fireEvent.change(screen.getByLabelText('Data de comparação'), { target: { value: '2026-08-16' } })
    await waitFor(() => expect(screen.getByLabelText('Data de comparação')).toHaveValue('2026-08-14'))
    await waitFor(() => expect(screen.getByTestId('legend-base').textContent).toBe('14/08/2026'))
    expect(within(screen.getByTestId('panels')).getByText('+25,0 pb')).toBeTruthy()
  })

  it('trocar para pregão anterior à data custom limpa a data', async () => {
    mockApi()
    renderApp()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Data…' }))
    fireEvent.change(screen.getByLabelText('Data de comparação'), { target: { value: '2026-08-20' } })
    await waitFor(() => expect(screen.getByTestId('legend-base')).toBeTruthy())
    // volta para 20/08: custom (20/08) ficaria ≥ pregão
    fireEvent.click(screen.getByLabelText('Pregão anterior'))
    await waitFor(() => expect(screen.getByLabelText('Data de comparação')).toHaveValue(''))
    await waitFor(() => expect(screen.queryByTestId('legend-base')).toBeNull())
  })

  it('base escolhida sem histórico no novo pregão cai para o pregão anterior', async () => {
    mockApi({ dates: ['2026-08-21', '2026-08-20', '2026-08-14', '2026-08-13', '2026-07-21'] })
    renderApp()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: '1 mês' }))
    await waitFor(() => expect(screen.getByTestId('legend-base').textContent).toBe('21/07/2026'))
    fireEvent.click(screen.getByLabelText('Pregão anterior')) // 20/08
    await waitFor(() => expect(screen.getByLabelText('Pregão')).toHaveValue('2026-08-20'))
    fireEvent.click(screen.getByLabelText('Pregão anterior')) // 14/08: sem pregão 30+ dias antes
    await waitFor(() => expect(screen.getByLabelText('Pregão')).toHaveValue('2026-08-14'))
    await waitFor(() => expect(screen.getByTestId('legend-base').textContent).toBe('13/08/2026'))
    const group = within(screen.getByRole('group', { name: 'Base de comparação' }))
    expect(group.getByRole('button', { name: 'Pregão anterior' }).getAttribute('aria-pressed')).toBe('true')
    expect(group.getByRole('button', { name: '1 mês' })).toBeDisabled()
  })

  it('data sem pregão faz snap para o anterior com aviso neutro e dispensável', async () => {
    mockApi()
    renderApp()
    await ready()
    // 15/08/2026 é sábado
    fireEvent.change(screen.getByLabelText('Pregão'), { target: { value: '2026-08-15' } })
    await waitFor(() => expect(screen.getByTestId('notice')).toBeTruthy())
    expect(screen.getByTestId('notice').textContent).toContain('Sem pregão em sáb, 15/08/2026. Mostrando sex, 14/08/2026.')
    await waitFor(() => expect(screen.getByLabelText('Pregão')).toHaveValue('2026-08-14'))
    fireEvent.click(screen.getByLabelText('Dispensar aviso'))
    expect(screen.queryByTestId('notice')).toBeNull()
  })

  it('só um aviso por vez', async () => {
    mockApi()
    renderApp()
    await ready()
    fireEvent.change(screen.getByLabelText('Pregão'), { target: { value: '2026-08-15' } })
    await waitFor(() => expect(screen.getAllByTestId('notice').length).toBe(1))
    fireEvent.click(screen.getByRole('button', { name: 'Data…' }))
    fireEvent.change(screen.getByLabelText('Data de comparação'), { target: { value: '2026-07-25' } })
    await waitFor(() => expect(screen.getAllByTestId('notice').length).toBe(1))
    expect(screen.getByTestId('notice').textContent).toContain('Comparando com')
  })

  it('chevrons e Último pregão navegam entre pregões', async () => {
    mockApi()
    renderApp()
    await ready()
    fireEvent.click(screen.getByLabelText('Pregão anterior'))
    await waitFor(() => expect(screen.getByLabelText('Pregão')).toHaveValue('2026-08-20'))
    fireEvent.click(screen.getByText('Último pregão'))
    await waitFor(() => expect(screen.getByLabelText('Pregão')).toHaveValue('2026-08-21'))
  })

  it('atualizando: indicador no header e conteúdo antigo esmaecido até curva e base chegarem', async () => {
    const { byDate } = mockApi()
    renderApp()
    await ready()
    const pending: (() => void)[] = []
    byDate.mockImplementation(
      (d) => new Promise((res) => { pending.push(() => res(curveOf(d))) }),
    )
    fireEvent.click(screen.getByLabelText('Pregão anterior'))
    await waitFor(() => expect(screen.getByTestId('updating')).toBeTruthy())
    expect(screen.getByTestId('content').className).toContain('is-updating')
    // kicker continua no pregão antigo: nunca data nova com anterior antiga
    expect(screen.getByText(/Pregão sex, 21\/08\/2026/)).toBeTruthy()
    await waitFor(() => expect(pending.length).toBe(2)) // curva do pregão + curva da base
    pending[0]()
    // só a curva chegou: continua atualizando até a base do mesmo pregão chegar
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByTestId('updating')).toBeTruthy()
    pending[1]()
    await waitFor(() => expect(screen.queryByTestId('updating')).toBeNull())
    expect(screen.getByText(/Pregão qui, 20\/08\/2026/)).toBeTruthy()
  })

  it('hover num card destaca o contrato: tooltip no gráfico e linha da tabela', async () => {
    mockApi()
    renderApp()
    await ready()
    const card = screen.getByText('Maior alta').closest('section')!
    fireEvent.mouseEnter(card)
    const tip = await screen.findByTestId('chart-tooltip')
    expect(tip.textContent).toContain('jan/27')
    expect(tip.textContent).toContain('Vencimento 04/01/2027')
    expect(tip.textContent).toContain('+15,0 pb')
    expect(document.querySelector('.points-table tr.is-hover')).toBeTruthy()
    fireEvent.mouseLeave(card)
    expect(screen.queryByTestId('chart-tooltip')).toBeNull()
  })

  it('estado de erro fica no bloco do pregão: header e macro continuam, CSV desabilitado', async () => {
    mockApi()
    vi.spyOn(apiMod.api, 'latest').mockRejectedValue(new apiMod.ApiError(500, null))
    renderApp()
    await waitFor(() => expect(screen.getByTestId('error-state')).toBeTruthy())
    expect(screen.getByText('Curva DI')).toBeTruthy() // header
    expect(screen.getByTestId('kpi-strip')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ir para o último pregão' })).toBeTruthy()
    expect(screen.getByText('Exportar CSV')).toHaveAttribute('aria-disabled', 'true')
  })
})
