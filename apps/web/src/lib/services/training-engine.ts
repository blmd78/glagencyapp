import 'server-only'
import type { createAdminClient } from '@glagency/db'
import { bossFanSystemPrompt, fanSystemPrompt } from '@/lib/ai/prompts'
import { ARENA_REVEAL_MAX_S, ARENA_REVEAL_MIN_S, SOLO_REACTION_S, type CaseKind } from '@/lib/types/training'

type Admin = ReturnType<typeof createAdminClient>
export type FanThreadRef = {
  kind: CaseKind
  caseId: string
  refCaseId: string | null
  bossFanId: string | null
  fanName: string
  isSale: boolean
}

/**
 * Prompt système du fan pour un thread — lit les SECRETS (tables admin) avec le client service-role,
 * côté serveur uniquement. Solo : consigne du cas ; défi : consigne du solo rejoué ; boss : fan riche.
 */
export async function buildFanSystem(admin: Admin, t: FanThreadRef): Promise<string> {
  if (t.kind === 'boss') {
    if (!t.bossFanId) throw new Error('thread boss sans fan')
    const { data, error } = await admin
      .from('training_case_boss_fans')
      .select('name, age, job, city, persona, training_boss_fan_secrets(budget_cap, nego_where, meet_where, derails)')
      .eq('id', t.bossFanId)
      .single()
    if (error) throw new Error(error.message)
    const s = Array.isArray(data.training_boss_fan_secrets) ? data.training_boss_fan_secrets[0] : data.training_boss_fan_secrets
    return bossFanSystemPrompt({
      name: data.name,
      age: data.age,
      job: data.job,
      city: data.city,
      persona: data.persona,
      derails: s?.derails ?? null,
      budgetCap: s?.budget_cap ?? null,
      negoWhere: s?.nego_where ?? null,
      meetWhere: s?.meet_where ?? null,
    })
  }
  const briefCaseId = t.kind === 'arena' ? t.refCaseId : t.caseId
  if (!briefCaseId) throw new Error('thread défi sans cas de référence')
  // DÉFI : le brief vient du cas REJOUÉ — son `is_sale` aussi. L'appelant passe le `is_sale` du cas
  // d'arène (son snapshot) : un cas de vente rejoué dans une arène non-vente recevait un brief
  // « négocie ton média » SANS la section des règles de média payant, donc un fan incapable
  // d'interpréter les « [MEDIA VERROUILLE - X€] » que le composer autorise pourtant.
  const [{ data, error }, refCase] = await Promise.all([
    admin.from('training_case_secrets').select('fan_brief').eq('case_id', briefCaseId).maybeSingle(),
    t.kind === 'arena'
      ? admin.from('training_cases').select('is_sale').eq('id', briefCaseId).maybeSingle()
      : Promise.resolve(null),
  ])
  if (error) throw new Error(error.message)
  if (refCase?.error) throw new Error(refCase.error.message)
  const isSale = t.kind === 'arena' ? (refCase?.data?.is_sale ?? t.isSale) : t.isSale
  return fanSystemPrompt({ fanName: t.fanName, fanBrief: data?.fan_brief ?? '', isSale })
}

/** Délai de révélation de la réponse du fan : immédiat en solo, 30-120 s (aléatoire) en défi/boss (GLA). */
export function revealDelayMs(kind: CaseKind): number {
  if (kind === 'solo') return 0
  return (ARENA_REVEAL_MIN_S + Math.floor(Math.random() * (ARENA_REVEAL_MAX_S - ARENA_REVEAL_MIN_S + 1))) * 1000
}

/** Échéance du chrono : solo = 60 s après la révélation ; défi/boss = reaction_max_s du cas. */
export function dueAtFrom(visibleAt: Date, kind: CaseKind, reactionMaxS: number | null): Date {
  const s = kind === 'solo' ? SOLO_REACTION_S : (reactionMaxS ?? 120)
  return new Date(visibleAt.getTime() + s * 1000)
}
