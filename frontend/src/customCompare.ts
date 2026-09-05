import type { Compare, Curve } from './api'

export function buildCustomCompare(curve: Curve, ref: Curve): Compare {
  const prevMap = new Map(ref.points.map((p) => [p.vertex_label, p]))
  const deltas = curve.points.map((p) => {
    const pp = prevMap.get(p.vertex_label)
    return {
      vertex_label: p.vertex_label,
      maturity_date: p.maturity_date,
      rate: p.rate,
      previous_rate: pp ? pp.rate : null,
      delta_pb: pp ? Math.round((p.rate - pp.rate) * 10000 * 100) / 100 : null,
    }
  })
  let max_up: Compare['max_up'] = null
  let max_down: Compare['max_down'] = null
  for (const d of deltas) {
    if (d.delta_pb === null) continue
    if (max_up === null || (d.delta_pb as number) > (max_up.delta_pb as number)) max_up = d
    if (max_down === null || (d.delta_pb as number) < (max_down.delta_pb as number)) max_down = d
  }
  return { trade_date: curve.trade_date, previous_date: ref.trade_date, deltas, max_up, max_down }
}
