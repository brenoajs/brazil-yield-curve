import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import Hero from './Hero'
import { Compare, Curve } from './api'
import { BaseKey } from './dateNav'

const pt = (vertex_label: string, maturity_date: string, rate: number) =>
  ({ vertex_label, maturity_date, rate, interpolated: false, liquidity_note: null })

// Pregão 2026-08-26: ~1a = DI1F28? não — 1 ano cai em set/27 (DI1U27), 3 anos em jan/30,
// 5 anos em jan/32, 10 anos em jan/37; os demais ficam mais longe de cada prazo.
const curve: Curve = {
  trade_date: '2026-08-26',
  curve_type: 'DI_FUTURE',
  points: [
    pt('DI1V26', '2026-10-01', 0.14),
    pt('DI1F27', '2027-01-04', 0.138),
    pt('DI1U27', '2027-09-01', 0.136),
    pt('DI1F30', '2030-01-02', 0.13),
    pt('DI1F32', '2032-01-02', 0.129),
    pt('DI1F37', '2037-01-02', 0.128),
  ],
}
const d = (label: string, delta: number | null) => ({
  vertex_label: label, maturity_date: '2027-01-01', rate: 0.13, previous_rate: delta == null ? null : 0.13, delta_pb: delta,
})
const compare: Compare = {
  trade_date: '2026-08-26',
  previous_date: '2026-08-25',
  deltas: [d('DI1U27', 4.24), d('DI1F30', -0.04), d('DI1F32', 0.1), d('DI1F37', null)],
  max_up: null,
  max_down: null,
}
const baseDates = { prev: '2026-08-25', week: '2026-08-19', month: null, custom: null } as Record<BaseKey, string | null>

function renderHero(over: Partial<React.ComponentProps<typeof Hero>> = {}) {
  const props = {
    curve, compare, baseKey: 'prev' as BaseKey, baseDate: '2026-08-25', baseDates,
    onBaseKeyChange: vi.fn(), customValue: '', customMax: '2026-08-25', onCustomChange: vi.fn(),
    ...over,
  }
  render(<Hero {...props} />)
  return props
}

describe('Hero', () => {
  it('título corrigido e kicker com dia da semana e contagem de contratos', () => {
    renderHero()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Curva DI futuro')
    expect(screen.getByText(/Pregão qua, 26\/08\/2026 · 6 contratos DI1/)).toBeTruthy()
  })

  it('chips por prazo: contrato com vencimento mais próximo de 1, 3, 5 e 10 anos', () => {
    renderHero()
    const chips = within(screen.getByTestId('hero-chips'))
    expect(chips.getByText('1 ano').parentElement?.textContent).toContain('set/27')
    expect(chips.getByText('3 anos').parentElement?.textContent).toContain('jan/30')
    expect(chips.getByText('5 anos').parentElement?.textContent).toContain('jan/32')
    expect(chips.getByText('10 anos').parentElement?.textContent).toContain('jan/37')
  })

  it('Δ com 1 casa, sinal tipográfico, zero neutro e sem base em travessão', () => {
    renderHero()
    const chips = within(screen.getByTestId('hero-chips'))
    expect(chips.getByText('+4,2 pb')).toBeTruthy()
    expect(chips.getByText('0,0 pb')).toBeTruthy() // −0,04 arredonda para zero: sem sinal
    expect(chips.getByText('+0,1 pb')).toBeTruthy()
    expect(chips.getByText('—')).toBeTruthy()
  })

  it('segmented: opção sem histórico fica desabilitada com title', () => {
    renderHero()
    const month = screen.getByRole('button', { name: '1 mês' })
    expect(month).toBeDisabled()
    expect(month.getAttribute('title')).toBe('Sem histórico suficiente')
    expect(screen.getByRole('button', { name: 'Pregão anterior' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('clicar numa base chama onBaseKeyChange', () => {
    const props = renderHero()
    fireEvent.click(screen.getByRole('button', { name: '1 semana' }))
    expect(props.onBaseKeyChange).toHaveBeenCalledWith('week')
  })

  it('base custom mostra campo de data limitado ao pregão anterior', () => {
    renderHero({ baseKey: 'custom', baseDate: null })
    const input = screen.getByLabelText('Data de comparação') as HTMLInputElement
    expect(input.max).toBe('2026-08-25')
    expect(screen.getByText('até 25/08/2026')).toBeTruthy()
    expect(screen.getByText(/Escolha uma data para comparar/)).toBeTruthy()
  })
})
