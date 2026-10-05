import type { ModelRanking, RankedChatter } from './types'

/** Ce que le classement lit d'un chatteur de `getChatters()`. */
export interface RankableChatter {
  id: string
  name: string
  ca: number
  /** Fiche MyPuls liée à un membre « chatteur » : seules celles-là sont classées. */
  isChatter: boolean
  /** CA par compte de modèle (un compte = un `creatorId`). */
  models: { creatorId: string; model: string; ca: number }[]
}

/** Rang = position dans la liste triée par CA décroissant (pas d'ex æquo, départage par nom). */
function rank(entries: { id: string; name: string; ca: number }[]): RankedChatter[] {
  return entries
    .filter((e) => e.ca > 0)
    .sort((a, b) => b.ca - a.ca || a.name.localeCompare(b.name, 'fr'))
    .map((e, i) => ({ id: e.id, name: e.name, ca: e.ca, rank: i + 1 }))
}

/** Classement global : les chatteurs à CA positif sur la période. */
export function rankChatters(chatters: RankableChatter[]): RankedChatter[] {
  return rank(chatters.filter((c) => c.isChatter))
}

/**
 * Un classement par compte de modèle, sur le seul CA fait SUR elle — « qui sont les meilleurs
 * chatteurs sur Carla ». Les modèles vont de la plus rentable (CA des chatteurs classés) à la moins
 * rentable ; deux comptes d'une même modèle (« Carla », « Carla (privé) ») restent deux entrées.
 */
export function rankByModel(chatters: RankableChatter[]): ModelRanking[] {
  const byModel = new Map<string, { model: string; entries: { id: string; name: string; ca: number }[] }>()
  for (const c of chatters) {
    if (!c.isChatter) continue
    for (const m of c.models) {
      const slot = byModel.get(m.creatorId) ?? { model: m.model, entries: [] }
      slot.entries.push({ id: c.id, name: c.name, ca: m.ca })
      byModel.set(m.creatorId, slot)
    }
  }
  return [...byModel]
    .map(([creatorId, { model, entries }]) => {
      const rows = rank(entries)
      return { creatorId, model, total: rows.reduce((s, r) => s + r.ca, 0), rows }
    })
    .filter((m) => m.rows.length > 0)
    .sort((a, b) => b.total - a.total || a.model.localeCompare(b.model, 'fr'))
}
