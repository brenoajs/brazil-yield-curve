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
  '432': 'Selic meta (%)',
  '1178': 'Selic efetiva (% a.a.)',
  '13522': 'IPCA 12m (%)',
  '1': 'USD/BRL (PTAX)',
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

// Base do site: '/' em dev, '/brazil-yield-curve/' no GitHub Pages.
// Em build estático, a API vira arquivos: /api/v1/curves/DI_FUTURE/latest.json
const BASE = import.meta.env.BASE_URL

const curveBase = (curveType: string) => `${BASE}api/v1/curves/${curveType}`

export const api = {
  latest: (curveType: string = 'DI_FUTURE') => request<Curve>(`${curveBase(curveType)}/latest.json`),
  dates: (curveType: string = 'DI_FUTURE') =>
    request<{ dates: string[] }>(`${curveBase(curveType)}/dates.json`),
  byDate: (date: string, curveType: string = 'DI_FUTURE') =>
    request<Curve>(`${curveBase(curveType)}/${date}.json`),
  compare: (date?: string, curveType: string = 'DI_FUTURE') =>
    request<Compare>(`${curveBase(curveType)}/compare/${date ?? 'latest'}.json`),
  macro: () => request<Macro>(`${BASE}api/v1/macro.json`),
  exportCsvUrl: (date?: string, curveType: string = 'DI_FUTURE') =>
    `${BASE}api/v1/export/${curveType}/${date ?? 'latest'}.csv`,
}
