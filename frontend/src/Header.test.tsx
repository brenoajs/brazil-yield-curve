import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Header from './Header'

const DATES = ['2026-08-26', '2026-08-25', '2026-08-24']

function renderHeader(selectedDate?: string) {
  const onDateChange = vi.fn()
  const onLatest = vi.fn()
  render(
    <Header
      dates={DATES}
      selectedDate={selectedDate}
      onDateChange={onDateChange}
      onLatest={onLatest}
      csvHref="/csv"
    />,
  )
  return { onDateChange, onLatest }
}

describe('Header', () => {
  it('calendário reflete o pregão atual com min/max do histórico', () => {
    renderHeader('2026-08-25')
    const input = screen.getByLabelText('Pregão') as HTMLInputElement
    expect(input.type).toBe('date')
    expect(input.value).toBe('2026-08-25')
    expect(input.min).toBe('2026-08-24')
    expect(input.max).toBe('2026-08-26')
  })

  it('sem selectedDate mostra o último pregão', () => {
    renderHeader(undefined)
    expect((screen.getByLabelText('Pregão') as HTMLInputElement).value).toBe('2026-08-26')
  })

  it('digitar data chama onDateChange com o valor cru (App faz o snap)', () => {
    const { onDateChange } = renderHeader('2026-08-26')
    fireEvent.change(screen.getByLabelText('Pregão'), { target: { value: '2026-08-23' } })
    expect(onDateChange).toHaveBeenCalledWith('2026-08-23')
  })

  it('◀ ▶ navegam um pregão por vez', () => {
    const { onDateChange } = renderHeader('2026-08-25')
    fireEvent.click(screen.getByLabelText('Pregão anterior'))
    expect(onDateChange).toHaveBeenCalledWith('2026-08-24')
    fireEvent.click(screen.getByLabelText('Próximo pregão'))
    expect(onDateChange).toHaveBeenCalledWith('2026-08-26')
  })

  it('no pregão mais antigo o ◀ desabilita', () => {
    renderHeader('2026-08-24')
    expect(screen.getByLabelText('Pregão anterior')).toBeDisabled()
    expect(screen.getByLabelText('Próximo pregão')).toBeEnabled()
  })

  it('no último pregão o ▶ desabilita', () => {
    renderHeader('2026-08-26')
    expect(screen.getByLabelText('Próximo pregão')).toBeDisabled()
    expect(screen.getByLabelText('Pregão anterior')).toBeEnabled()
  })

  it('botão Último pregão chama onLatest e desabilita já no último', () => {
    const { onLatest } = renderHeader('2026-08-25')
    const btn = screen.getByText('Último pregão')
    expect(btn).toBeEnabled()
    fireEvent.click(btn)
    expect(onLatest).toHaveBeenCalled()
  })

  it('no último pregão o botão Último pregão desabilita', () => {
    renderHeader(undefined)
    expect(screen.getByText('Último pregão')).toBeDisabled()
  })
})
