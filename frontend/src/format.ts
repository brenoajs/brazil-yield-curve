export const PCT = (r: number) => `${(r * 100).toFixed(3)}%`.replace('.', ',')

const MINUS = '−' // sinal tipográfico, distinto do '-' ASCII

// Único formatter de Δ da página: 1 casa decimal, sinal tipográfico, "0,0" para zero.
// null/undefined = sem base de comparação para o vértice.
export const fmtDelta = (v: number | null | undefined): string => {
  if (v == null) return '—'
  const r = Math.round(v * 10) / 10
  if (r === 0) return '0,0'
  return `${r > 0 ? '+' : MINUS}${Math.abs(r).toFixed(1).replace('.', ',')}`
}
export const PB = (v: number | null | undefined) => (v == null ? '—' : `${fmtDelta(v)} pb`)

// Cor/classe pelo valor exibido (já arredondado): "0,0" nunca vira laranja/verde.
export const deltaSign = (v: number | null | undefined): 1 | -1 | 0 => {
  if (v == null) return 0
  const r = Math.round(v * 10) / 10
  return r > 0 ? 1 : r < 0 ? -1 : 0
}
export const deltaClass = (v: number | null | undefined) => {
  const s = deltaSign(v)
  return s > 0 ? 'up' : s < 0 ? 'down' : ''
}
export const deltaColor = (v: number | null | undefined) => {
  if (v == null) return '#a3a3a3'
  const s = deltaSign(v)
  return s > 0 ? '#ea580c' : s < 0 ? '#16a34a' : '#737373'
}

// ISO YYYY-MM-DD → dd/mm/aaaa e dd/mm
export const brDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
export const brShort = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]
export const brDateWeekday = (iso: string) => `${weekday(iso)}, ${brDate(iso)}`

// Ticker B3 (DI1F27) → "jan/27"; outros rótulos passam intactos.
const MONTH_LETTER: Record<string, string> = {
  F: 'jan', G: 'fev', H: 'mar', J: 'abr', K: 'mai', M: 'jun',
  N: 'jul', Q: 'ago', U: 'set', V: 'out', X: 'nov', Z: 'dez',
}
export function contractShort(ticker: string): string {
  const m = /^DI1([A-Z])(\d{2})$/.exec(ticker)
  const month = m ? MONTH_LETTER[m[1]] : undefined
  return m && month ? `${month}/${m[2]}` : ticker
}
