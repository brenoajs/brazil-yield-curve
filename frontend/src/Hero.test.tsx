import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import Hero from './Hero'
import { Compare, Curve } from './api'

// Regressão: chips arredondavam com Math.round inteiro, então um Δ de
// +0,1 pb virava "0 pb" cinza enquanto a tabela mostrava o Δ real.
describe('Hero chips', () => {
  it('mostra poeira sub-1pb com 1 decimal e direção', () => {
    const curve = {
      trade_date: '2026-08-26',
      curve_type: 'DI_FUTURE',
      points: [
        { vertex_label: 'DI1U26', maturity_date: '2026-09-01', rate: 0.13903, interpolated: false, liquidity_note: null },
        { vertex_label: 'DI1V26', maturity_date: '2026-10-01', rate: 0.13816, interpolated: false, liquidity_note: null },
        { vertex_label: 'DI1X26', maturity_date: '2026-11-03', rate: 0.13751, interpolated: false, liquidity_note: null },
      ],
    } as Curve
    const compare = {
      trade_date: '2026-08-26',
      previous_date: '2026-08-25',
      deltas: [
        { vertex_label: 'DI1U26', maturity_date: '2026-09-01', rate: 0.13903, previous_rate: 0.13902, delta_pb: 0.3 },
        { vertex_label: 'DI1V26', maturity_date: '2026-10-01', rate: 0.13816, previous_rate: 0.13818, delta_pb: 0.1 },
        { vertex_label: 'DI1X26', maturity_date: '2026-11-03', rate: 0.13751, previous_rate: 0.13753, delta_pb: -0.2 },
      ],
      max_up: null,
      max_down: null,
    } as Compare
    render(<Hero curve={curve} compare={compare} />)
    // miolo = DI1V26 (+0,1), longo = DI1X26 (−0,2)
    expect(screen.getByText('+0,1 pb')).toBeTruthy()
    expect(screen.getByText(/0,2 pb/)).toBeTruthy()
    expect(screen.queryByText(/[^0-9,]0 pb/)).toBeNull()
  })
})
