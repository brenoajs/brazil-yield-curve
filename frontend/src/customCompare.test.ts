import { describe, expect, it } from 'vitest'
import { buildCustomCompare } from './customCompare'
import type { Curve } from './api'

const curve: Curve = {
  trade_date: '2026-08-21',
  curve_type: 'DI_FUTURE',
  points: [
    { vertex_label: 'DI1F27', maturity_date: '2027-01-04', rate: 0.104, interpolated: false, liquidity_note: null },
    { vertex_label: 'DI1F28', maturity_date: '2028-01-03', rate: 0.1035, interpolated: false, liquidity_note: null },
    { vertex_label: 'DI1F30', maturity_date: '2030-01-02', rate: 0.11, interpolated: false, liquidity_note: null },
  ],
}

const ref: Curve = {
  trade_date: '2025-10-01',
  curve_type: 'DI_FUTURE',
  points: [
    { vertex_label: 'DI1F27', maturity_date: '2027-01-04', rate: 0.1025, interpolated: false, liquidity_note: null },
    { vertex_label: 'DI1F28', maturity_date: '2028-01-03', rate: 0.1045, interpolated: false, liquidity_note: null },
  ],
}

describe('buildCustomCompare', () => {
  it('calcula deltas round(*10000,2) e max_up/max_down', () => {
    const out = buildCustomCompare(curve, ref)
    expect(out.trade_date).toBe('2026-08-21')
    expect(out.previous_date).toBe('2025-10-01')
    expect(out.deltas[0]).toMatchObject({ vertex_label: 'DI1F27', previous_rate: 0.1025, delta_pb: 15 })
    expect(out.deltas[1]).toMatchObject({ vertex_label: 'DI1F28', previous_rate: 0.1045, delta_pb: -10 })
    expect(out.deltas[2]).toMatchObject({ vertex_label: 'DI1F30', previous_rate: null, delta_pb: null })
    expect(out.max_up?.vertex_label).toBe('DI1F27')
    expect(out.max_down?.vertex_label).toBe('DI1F28')
  })

  it('mesma data gera deltas zero', () => {
    const out = buildCustomCompare(curve, { ...curve })
    expect(out.deltas[0].delta_pb).toBe(0)
  })
})
