import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { fetchTeamMoney } from '@glagency/mypuls'
import { createAdminClient } from '@glagency/db'

/**
 * Pipeline quotidien : /team/money (par jour) → agrégation par modèle → upsert creator_daily.
 * Idempotent (upsert `creator_id,date`). Auto-cicatrisant : sans argument, rattrape les jours
 * complets manquants (max(date)+1 → hier) + capture aujourd'hui (partiel, complété demain).
 * Écrit aussi le brut dans apps/ingestion/raw/<date>.json (message_id inclus → attribution
 * chatteur ultérieure). Cf. spec §7.
 *
 * TODO (suite) : attribution par chatteur (join message_id → sender) → chatter_daily /
 * chatter_creator_daily ; new_subs/subs_active via /creators/{id}/stats ; runRules → insights.
 */

const PRIV: Record<string, string> = {
  alice_prvv: 'Alice (privé)',
  carlaprive: 'Carla (privé)',
  juliepvv: 'Julie (privé)',
}
const MAX_CATCHUP = 60
const round = (n: number) => Math.round(n * 100) / 100
const iso = (d: Date) => d.toISOString().slice(0, 10)
function addDays(day: string, n: number): string {
  const d = new Date(day + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

export async function runPipeline(explicitDay?: string): Promise<void> {
  const db = createAdminClient()
  const rawDir = resolve(dirname(fileURLToPath(import.meta.url)), '../raw')

  const { data: creators, error } = await db.from('creators').select('id, name, is_private')
  if (error) throw error
  const nameToId = new Map((creators ?? []).map((c) => [c.name as string, c.id as string]))
  const mains = (creators ?? []).filter((c) => !c.is_private).map((c) => c.name as string)
  const pseudoToName = (pseudo: string): string | null => {
    const p = (pseudo || '').toLowerCase()
    return PRIV[p] ?? mains.find((n) => p.includes(n.toLowerCase())) ?? null
  }

  const today = iso(new Date())
  const yesterday = addDays(today, -1)
  let days: string[]
  if (explicitDay) {
    days = [explicitDay]
  } else {
    const { data: mx } = await db
      .from('creator_daily')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
    const last = (mx?.[0]?.date as string | undefined) ?? undefined
    const start = last ? addDays(last, 1) : yesterday
    const missed: string[] = []
    for (let d = start; d <= yesterday; d = addDays(d, 1)) missed.push(d)
    days = [...missed.slice(-MAX_CATCHUP), today]
  }

  for (const day of days) {
    const tx = await fetchTeamMoney(day)
    mkdirSync(rawDir, { recursive: true })
    writeFileSync(
      resolve(rawDir, `${day}.json`),
      JSON.stringify({ date: day, count: tx.length, tx }, null, 1),
    )

    const agg = new Map<string, { ca: number; ppv: number; tips: number; renew: number }>()
    for (const t of tx) {
      const name = pseudoToName(t.creator)
      if (!name) continue
      const a = agg.get(name) ?? { ca: 0, ppv: 0, tips: 0, renew: 0 }
      const amt = Number(t.amount) || 0
      a.ca += amt
      if (t.type === 'Média privé') a.ppv += amt
      else if (t.type === 'Pourboires') a.tips += amt
      else if (t.type === 'Renouvellement abonnement') a.renew += amt
      agg.set(name, a)
    }
    const rows = [...agg]
      .filter(([n]) => nameToId.has(n))
      .map(([n, a]) => ({
        creator_id: nameToId.get(n)!,
        date: day,
        ca: round(a.ca),
        ca_ppv: round(a.ppv),
        ca_tips: round(a.tips),
        ca_renew: round(a.renew),
        subs_active: 0,
        new_subs: 0,
      }))
    if (rows.length) {
      const { error: upErr } = await db
        .from('creator_daily')
        .upsert(rows, { onConflict: 'creator_id,date' })
      if (upErr) throw upErr
    }
    console.log(`[ingestion] ${day}: ${tx.length} tx → ${rows.length} modèles`)
  }
}
