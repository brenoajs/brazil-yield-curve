// Contratos da API — Brazil Yield Curve
export type CurveType = 'DI_FUTURE' | 'NOMINAL' | 'REAL' | 'IMPLICIT'

export interface CurvePoint {
  vertex_label: string
  maturity_date: string // ISO date
  rate: number // decimal anualizado base 252
  interpolated: boolean
  liquidity_note: string | null
}

export interface Curve {
  trade_date: string
  curve_type: CurveType
  points: CurvePoint[]
}

export interface CompareDelta {
  vertex_label: string
  maturity_date: string
  rate: number
  previous_rate: number | null
  delta_pb: number | null
}

export interface Compare {
  trade_date: string
  previous_date: string | null
  deltas: CompareDelta[]
  max_up: CompareDelta | null
  max_down: CompareDelta | null
}

export interface Macro {
  ref_date: string
  indicators: Record<string, number>
}

export const MACRO_LABELS: Record<string, string> = {
  '432': 'IPCA 12m (%)',
  '12': 'Selic (%)',
  '13522': 'USD/BRL (PTAX)',
  '1': 'Selic alvo (%)',
}

export class ApiError extends Error {
  status: number
  envelope: Record<string, unknown> | null
  constructor(status: number, envelope: Record<string, unknown> | null) {
    super(`API error ${status}`)
    this.status = status
    this.envelope = envelope
  }
}

async function request<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    let env: Record<string, unknown> | null = null
    try {
      env = await res.json()
    } catch {
      /* corpo não-JSON */
    }
    throw new ApiError(res.status, env)
  }
  return res.json() as Promise<T>
}

export const api = {
  latest: (curveType: string = 'DI_FUTURE') => request<Curve>(`/api/v1/curves/latest?curve_type=${curveType}`),
  dates: (curveType: string = 'DI_FUTURE') =>
    request<{ dates: string[] }>(`/api/v1/curves/dates?curve_type=${curveType}`),
  byDate: (date: string, curveType: string = 'DI_FUTURE') =>
    request<Curve>(`/api/v1/curves/${date}?curve_type=${curveType}`),
  compare: (date?: string, curveType: string = 'DI_FUTURE') =>
    request<Compare>(`/api/v1/curves/compare?curve_type=${curveType}${date ? `&trade_date=${date}` : ''}`),
  macro: () => request<Macro>('/api/v1/macro'),
  exportCsvUrl: (date?: string, curveType: string = 'DI_FUTURE') =>
    `/api/v1/export/curve.csv?curve_type=${curveType}${date ? `&trade_date=${date}` : ''}`,
}
