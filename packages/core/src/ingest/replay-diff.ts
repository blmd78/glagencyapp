import type { IdentityIssueKind } from './identity-types'

/**
 * Recette de non-régression (spec § 8, D14) : un même jour rejoué avec l'ANCIEN puis le NOUVEAU
 * code, comparé jour par jour et fiche par fiche. Toute différence doit porter une raison tirée
 * des anomalies et des ids ; sinon `reason: null` = INEXPLIQUÉ, et pas de déploiement.
 */

/** Photo d'un jour : centimes par fiche (Σ chatter_daily, Σ chatter_creator_daily) + toutes les fiches. */
export interface ReplaySnapshot {
  day: string
  cd: Record<string, number>
  ccd: Record<string, number>
  fiches: Record<string, { name: string; mypulsUserId: string | null }>
}

export interface ReplayIssue {
  kind: IdentityIssueKind
  mypulsUserId: string | null
  chatterId: string | null
  otherChatterId: string | null
  day: string | null
  label: string | null
  amount: number | null
}

export interface ReplayMove {
  chatterId: string
  name: string
  mypulsUserId: string | null
  dCd: number
  dCcd: number
  reason: string | null
}

export interface ReplayDayDiff {
  day: string
  cdBefore: number
  cdAfter: number
  ccdBefore: number
  ccdAfter: number
  asideCents: number
  totalsOk: boolean
  moves: ReplayMove[]
  ok: boolean
}

const sum = (r: Record<string, number>): number => Object.values(r).reduce((s, v) => s + v, 0)

export function compareReplay(before: ReplaySnapshot, after: ReplaySnapshot, issues: ReplayIssue[]): ReplayDayDiff {
  const day = after.day
  const asideIssues = issues.filter((i) => i.kind === 'resume_mis_de_cote' && i.day === day)
  const asideCents = asideIssues.reduce((s, i) => s + Math.round((i.amount ?? 0) * 100), 0)
  const cdBefore = sum(before.cd)
  const cdAfter = sum(after.cd)
  const ccdBefore = sum(before.ccd)
  const ccdAfter = sum(after.ccd)
  // Le résumé mis de côté manque à chatter_daily après, à dessein ; les ventes, jamais.
  const totalsOk = cdAfter + asideCents === cdBefore && ccdAfter === ccdBefore

  const ids = [...new Set([...Object.keys(before.cd), ...Object.keys(after.cd), ...Object.keys(before.ccd), ...Object.keys(after.ccd)])].sort()
  const delta = new Map<string, { dCd: number; dCcd: number }>()
  for (const id of ids) {
    const dCd = (after.cd[id] ?? 0) - (before.cd[id] ?? 0)
    const dCcd = (after.ccd[id] ?? 0) - (before.ccd[id] ?? 0)
    if (dCd || dCcd) delta.set(id, { dCd, dCcd })
  }
  // Homonyme séparé : fiche créée pour un id dont le libellé désignait une autre fiche, ou fiche libre
  // que plusieurs comptes désignent — reliées par une anomalie OUVERTE, vue n'importe quel jour (upsert :
  // son `day` est le dernier jour vu, pas celui de la création). N'explique que le passage de l'une à
  // l'autre : les deux fiches bougent en sens opposés sur le résumé ou sur les ventes.
  const opposite = (a: { dCd: number; dCcd: number }, b: { dCd: number; dCcd: number }): boolean =>
    Math.sign(a.dCd) * Math.sign(b.dCd) < 0 || Math.sign(a.dCcd) * Math.sign(b.dCcd) < 0
  const splitFor = (id: string): ReplayIssue | undefined => {
    const mine = delta.get(id)
    return issues.find((i) => {
      if (i.kind !== 'fiche_creee' && i.kind !== 'homonyme') return false
      const other = i.chatterId === id ? i.otherChatterId : i.otherChatterId === id ? i.chatterId : null
      const theirs = other && other !== id ? delta.get(other) : undefined
      return !!mine && !!theirs && opposite(mine, theirs)
    })
  }

  const reasonFor = (id: string): string | null => {
    const pair = issues.find(
      (i) => (i.kind === 'doublon' || i.kind === 'membres_multiples') && (i.chatterId === id || i.otherChatterId === id),
    )
    if (pair) return pair.kind === 'doublon' ? `doublon résolu (id ${pair.mypulsUserId ?? '?'})` : 'deux membres reliés au même compte'
    const now = after.fiches[id]
    const was = before.fiches[id]
    if (!was && now?.mypulsUserId) return `fiche créée pour l'id ${now.mypulsUserId}`
    if (was && !was.mypulsUserId && now?.mypulsUserId) return `id ${now.mypulsUserId} posé`
    const split = splitFor(id)
    if (split) {
      return split.kind === 'fiche_creee'
        ? `homonyme séparé : fiche créée pour l'id ${split.mypulsUserId ?? '?'}`
        : `homonyme séparé (« ${split.label ?? '?'} »)`
    }
    const name = now?.name ?? was?.name
    if (name && asideIssues.some((i) => i.label === name)) return 'résumé mis de côté (libellé ambigu)'
    return null
  }

  const moves: ReplayMove[] = []
  for (const [id, { dCd, dCcd }] of delta) {
    const f = after.fiches[id] ?? before.fiches[id]
    moves.push({ chatterId: id, name: f?.name ?? id, mypulsUserId: f?.mypulsUserId ?? null, dCd, dCcd, reason: reasonFor(id) })
  }
  return {
    day,
    cdBefore,
    cdAfter,
    ccdBefore,
    ccdAfter,
    asideCents,
    totalsOk,
    moves,
    ok: totalsOk && moves.every((m) => m.reason !== null),
  }
}
