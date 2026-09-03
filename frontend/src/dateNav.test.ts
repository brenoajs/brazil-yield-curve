import { describe, expect, it } from 'vitest'
import { hasTradeDate, nextTradeDate, prevTradeDate, snapToTradeDate } from './dateNav'

// dates em ordem decrescente, como vem de /curves/dates.
const DATES = ['2026-08-26', '2026-08-25', '2026-08-24', '2026-08-21', '2026-08-20']

describe('hasTradeDate', () => {
  it('acha pregão existente em O(1) via Set', () => {
    expect(hasTradeDate(DATES, '2026-08-24')).toBe(true)
    expect(hasTradeDate(DATES, '2026-08-23')).toBe(false) // domingo, sem pregão
  })
})

describe('snapToTradeDate', () => {
  it('mantém data com pregão sem snap', () => {
    expect(snapToTradeDate(DATES, '2026-08-24')).toEqual({ date: '2026-08-24', snapped: false })
  })

  it('fim de semana cai no pregão anterior (sexta)', () => {
    // 23/08/2026 é domingo -> pregão anterior mais próximo é sexta 21/08
    expect(snapToTradeDate(DATES, '2026-08-23')).toEqual({ date: '2026-08-21', snapped: true })
  })

  it('data além do histórico cai no pregão mais antigo', () => {
    expect(snapToTradeDate(DATES, '2020-01-01')).toEqual({ date: '2026-08-20', snapped: true })
  })
})

describe('prevTradeDate / nextTradeDate', () => {
  it('◀ volta um pregão, ▶ avança um pregão', () => {
    expect(prevTradeDate(DATES, '2026-08-25')).toBe('2026-08-24')
    expect(nextTradeDate(DATES, '2026-08-25')).toBe('2026-08-26')
  })

  it('nas bordas retorna null (botão desabilita)', () => {
    expect(prevTradeDate(DATES, '2026-08-20')).toBeNull()
    expect(nextTradeDate(DATES, '2026-08-26')).toBeNull()
  })
})
