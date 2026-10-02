// Navegação entre pregões — helpers puros sobre o array de datas (ordem
// decrescente, como vem de /curves/dates). Comparação lexicográfica vale
// porque as datas são ISO YYYY-MM-DD.
export function hasTradeDate(dates: string[], raw: string): boolean {
  return new Set(dates).has(raw)
}

export function snapToTradeDate(dates: string[], raw: string): { date: string; snapped: boolean } {
  if (dates.length === 0) return { date: raw, snapped: false }
  if (hasTradeDate(dates, raw)) return { date: raw, snapped: false }
  // pregão anterior mais próximo (datas em ordem decrescente: o primeiro
  // d <= raw é o mais próximo para trás, cobrindo fins de semana/feriados)
  const prev = dates.find((d) => d <= raw)
  if (prev) return { date: prev, snapped: true }
  // raw é mais antigo que todo o histórico: mostra o pregão mais antigo
  return { date: dates[dates.length - 1], snapped: true }
}

// Pregão mais recente com pelo menos `lagDays` corridos de defasagem de
// `current` (regra dos toggles "semana/mês anterior"). Escolhido a partir da
// lista existente (desc), nunca por aritmética de data: dias sem pregão não
// existem como arquivo. null = sem histórico suficiente.
export function latestBefore(dates: string[], current: string, lagDays: number): string | null {
  if (dates.length === 0) return null
  const cutoff = new Date(Date.parse(current) - lagDays * 864e5).toISOString().slice(0, 10)
  return dates.find((d) => d <= cutoff) ?? null
}

// Pregão imediatamente anterior (mais antigo). null na borda.
export function prevTradeDate(dates: string[], current: string): string | null {
  const i = dates.indexOf(current)
  if (i === -1 || i + 1 >= dates.length) return null
  return dates[i + 1]
}

// Pregão imediatamente seguinte (mais recente). null na borda.
export function nextTradeDate(dates: string[], current: string): string | null {
  const i = dates.indexOf(current)
  if (i <= 0) return null
  return dates[i - 1]
}

// Data custom de comparação: sempre um pregão ESTRITAMENTE anterior ao atual.
// Snap só para trás; datas ≥ pregão atual caem no pregão imediatamente anterior
// (o `max` do input). null = não há pregão anterior para comparar.
export function snapCustomDate(
  dates: string[],
  raw: string,
  current: string,
): { date: string; snapped: boolean } | null {
  const max = prevTradeDate(dates, current)
  if (!max) return null
  if (raw >= current || raw > max) return { date: max, snapped: raw !== max }
  return snapToTradeDate(dates, raw)
}

// Base única de comparação da página: chips, gráfico, cards e tabela.
export type BaseKey = 'prev' | 'week' | 'month' | 'custom'

export const BASE_NAMES: Record<BaseKey, string> = {
  prev: 'pregão anterior',
  week: '1 semana',
  month: '1 mês',
  custom: 'data escolhida',
}

// Data de cada base para o pregão `trade`; null = indisponível. Sempre extraída
// da lista de pregões (nunca por aritmética de data), custom só se < pregão.
export function resolveBaseDates(
  dates: string[],
  trade: string | null,
  customDate: string,
): Record<BaseKey, string | null> {
  if (!trade) return { prev: null, week: null, month: null, custom: null }
  return {
    prev: prevTradeDate(dates, trade),
    week: latestBefore(dates, trade, 7),
    month: latestBefore(dates, trade, 30),
    custom: customDate && customDate < trade ? customDate : null,
  }
}
