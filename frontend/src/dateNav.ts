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
