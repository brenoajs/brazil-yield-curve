import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
    expect(panels.querySelector('.delta-card-value.up')?.textContent).toBe('+25,0 pb')
    expect(panels.querySelector('.delta-card-value.down')?.textContent).toBe('−17,8 pb')
  })

  it('max_up negativo nao usa laranja (contrato do rodape)', () => {
    render(<Panels compare={makeCompare(-0.1, -17.8)} />)
    const panels = screen.getByTestId('panels')
    expect(panels.querySelector('.delta-card-value.up')).toBeNull()
    expect(panels.querySelectorAll('.delta-card-value.down').length).toBe(2)
  })

  it('delta nulo ou que arredonda a zero fica neutro (sem cor)', () => {
    render(<Panels compare={makeCompare(0.04, -5)} />)
    const panels = screen.getByTestId('panels')
    expect(panels.querySelector('.delta-card-value.up')).toBeNull()
    expect(panels.querySelectorAll('.delta-card-value.down').length).toBe(1)
    expect(panels.textContent).toContain('0,0 pb')
  })

  it('rótulo da base e contrato com nome curto + ticker', () => {
    render(<Panels compare={makeCompare(25, -17.8)} baseLabel="vs 19/08 (anterior)" />)
    expect(screen.getByText('vs 19/08 (anterior)')).toBeTruthy()
    expect(screen.getByText('jan/27')).toBeTruthy()
    expect(screen.getByText('DI1F27')).toBeTruthy()
  })

  it('hover no card avisa o contrato; sair limpa', () => {
    const onHover = vi.fn()
    render(<Panels compare={makeCompare(25, -17.8)} onHover={onHover} />)
    const card = screen.getByText('Maior alta').closest('section')!
    fireEvent.mouseEnter(card)
    expect(onHover).toHaveBeenLastCalledWith('DI1F27')
    fireEvent.mouseLeave(card)
    expect(onHover).toHaveBeenLastCalledWith(null)
  })

  it('sem compare mostra os dois cards vazios', () => {
    render(<Panels />)
    expect(screen.getAllByText('sem base de comparação').length).toBe(2)
  })
})
