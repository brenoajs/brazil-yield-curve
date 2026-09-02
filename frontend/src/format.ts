export const PCT = (r: number) => `${(r * 100).toFixed(3)}%`.replace('.', ',')

export const PB = (delta: number) => `${delta > 0 ? '+' : ''}${String(delta).replace('.', ',')} pb`
