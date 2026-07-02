import { API_BASE } from '../client'

/** Transaction team/money (argent messagerie/média, horodatée). */
export interface MoneyTx {
  payment_id: number
  creator_id: number
  creator: string
  fan?: string
  amount: number
  net?: number
  currency?: string
  kind: string // 'ppv' | 'tip' | ...
  type: string // 'Média privé' | 'Pourboires' | 'Media On Demand' | 'Médias push' | 'Renouvellement abonnement'
  date: string
  attributed_user_id: number | null
  message_id: number | null
}

function nextDay(day: string): string {
  const d = new Date(day + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Transactions team/money d'un jour (start=jour, end=lendemain exclusif), paginé.
 * Token API v1 via X-API-TOKEN (défaut : env MYPULS_API_KEY).
 */
export async function fetchTeamMoney(
  day: string,
  token: string | undefined = process.env.MYPULS_API_KEY,
): Promise<MoneyTx[]> {
  if (!token) throw new Error('MYPULS_API_KEY manquant (cf. .env.example)')
  const end = nextDay(day)
  const out: MoneyTx[] = []
  let page = 1
  let pages = 1
  do {
    const url = `${API_BASE}/team/money?start=${day}&end=${end}&per_page=100&page=${page}`
    const res = await fetch(url, { headers: { 'X-API-TOKEN': token, Accept: 'application/json' } })
    if (!res.ok) throw new Error(`GET /team/money ${res.status} (${day})`)
    const json = (await res.json()) as {
      data?: MoneyTx[]
      pagination?: { total_pages?: number }
    }
    out.push(...(json.data ?? []))
    pages = json.pagination?.total_pages ?? 1
    page++
  } while (page <= pages)
  return out
}
