import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import Panels from './Panels'
import type { Compare } from './api'

function makeCompare(maxUpPb: number | null, maxDownPb: number | null): Compare {
  const d = (v: number | null, label: string) => ({
    vertex_label: label,
    maturity_date: '2027-01-01',
    rate: 0.13,
    previous_rate: v == null ? null : 0.13,
    delta_pb: v,
  })
  return {
    trade_date: '2026-08-21',
    previous_date: '2026-08-20',
    deltas: [],
    max_up: d(maxUpPb, 'DI1F27'),
    max_down: d(maxDownPb, 'DI1N30'),
  }
}

describe('Panels', () => {
  it('pinta pelo sinal: alta positiva laranja, queda negativa verde', () => {
    render(<Panels compare={makeCompare(25, -17.8)} />)
    const panels = screen.getByTestId('panels')
    expect(panels.querySelector('.delta-card-value.up')?.textContent).toContain('25')
    expect(panels.querySelector('.delta-card-value.down')?.textContent).toContain('17,8')
  })

  it('max_up negativo nao usa laranja (contrato do rodape)', () => {
    // Pregão de queda generalizada: "maior alta" é a menor queda — verde, não laranja.
    render(<Panels compare={makeCompare(-0.1, -17.8)} />)
    const panels = screen.getByTestId('panels')
    expect(panels.querySelector('.delta-card-value.up')).toBeNull()
    const downs = panels.querySelectorAll('.delta-card-value.down')
    expect(downs.length).toBe(2)
    expect(downs[0].textContent).toContain('0,1')
  })

  it('delta nulo fica neutro (sem cor)', () => {
    render(<Panels compare={makeCompare(null, -5)} />)
    const panels = screen.getByTestId('panels')
    expect(panels.querySelector('.delta-card-value.up')).toBeNull()
    expect(panels.querySelectorAll('.delta-card-value.down').length).toBe(1)
  })
})
