import { describe, expect, it } from 'vitest'
import { PCT } from './format'

// Regressão: com 2 casas, 0.13902 e 0.13903 exibiam o mesmo "13,90%"
// enquanto o Δ era +0,1 pb — a tela parecia dizer "preço estático,
// delta não-zero". O CSV já exporta com 3 casas; a tela tem que acompanhar.
describe('PCT', () => {
  it('distingue movimentos sub-1pb (3 casas, padrão B3/CSV)', () => {
    expect(PCT(0.13902)).toBe('13,902%')
    expect(PCT(0.13903)).toBe('13,903%')
    expect(PCT(0.13902)).not.toBe(PCT(0.13903))
  })
})
