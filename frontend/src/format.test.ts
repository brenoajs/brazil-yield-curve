import { describe, expect, it } from 'vitest'
import { PCT, fmtDelta, PB, deltaClass, brDate, brShort, weekday, contractShort } from './format'

// Regressão: com 2 casas, 0.13902 e 0.13903 exibiam o mesmo "13,90%"
// enquanto o Δ era +0,1 pb. O CSV já exporta com 3 casas; a tela acompanha.
describe('PCT', () => {
  it('distingue movimentos sub-1pb (3 casas, padrão B3/CSV)', () => {
    expect(PCT(0.13902)).toBe('13,902%')
    expect(PCT(0.13903)).toBe('13,903%')
  })
})

describe('fmtDelta', () => {
  it('1 casa decimal sempre, sinal tipográfico', () => {
    expect(fmtDelta(1.5)).toBe('+1,5')
    expect(fmtDelta(-1)).toBe('−1,0')
    expect(fmtDelta(25)).toBe('+25,0')
    expect(fmtDelta(-17.84)).toBe('−17,8')
  })
  it('zero e poeira que arredonda para zero viram 0,0 sem sinal', () => {
    expect(fmtDelta(0)).toBe('0,0')
    expect(fmtDelta(0.04)).toBe('0,0')
    expect(fmtDelta(-0.04)).toBe('0,0')
  })
  it('null vira travessão', () => {
    expect(fmtDelta(null)).toBe('—')
    expect(PB(null)).toBe('—')
    expect(PB(0.3)).toBe('+0,3 pb')
  })
  it('classe de cor segue o valor exibido', () => {
    expect(deltaClass(0.04)).toBe('')
    expect(deltaClass(0.1)).toBe('up')
    expect(deltaClass(-0.1)).toBe('down')
    expect(deltaClass(null)).toBe('')
  })
})

describe('datas e contratos', () => {
  it('formata datas', () => {
    expect(brDate('2026-08-20')).toBe('20/08/2026')
    expect(brShort('2026-08-20')).toBe('20/08')
    expect(weekday('2026-08-20')).toBe('qui')
  })
  it('rótulo curto do contrato', () => {
    expect(contractShort('DI1F28')).toBe('jan/28')
    expect(contractShort('3m')).toBe('3m')
  })
})
