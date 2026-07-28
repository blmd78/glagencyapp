import { recentPeriods, todayParis, type PayPeriod } from '@glagency/core'
import { getProfile } from '@/lib/auth'
import { loadComptaRows } from './compta-rows'
import { loadLinkableChatters } from './compta-sources'
import { overduePeriods } from './coverage'
import type { ComptaData } from '../types'

/**
 * Compta d'UNE période de paie — sélection de la période, puis LE calcul commun
 * (`loadComptaRows`, partagé avec le recalcul serveur de `payPeriod`) et le bandeau de
 * retard. Aucun calcul de fiche de paie ici : il n'en existe qu'une implémentation.
 */
export async function getCompta({ debut }: { debut?: string }): Promise<ComptaData> {
  const today = todayParis()
  const choices = recentPeriods(today, 12)

  // UN SEUL paramètre d'URL depuis que la période est identifiée par son lundi de départ
  // (`?debut=`, à la place de `?month=` + `?period=`) — et toujours validé PAR APPARTENANCE à
  // la fenêtre proposée, jamais par regex seule : une date bien formée mais non alignée sur le
  // découpage (un mardi, un lundi décalé de 7 jours) fabriquerait une période qui chevauche ses
  // voisines, et la couverture `covered_days` deviendrait incohérente.
  const period: PayPeriod = choices.find((p) => p.start === debut) ?? choices[0]

  // Options du dialog « Relier à MyPuls » — ADMIN SEUL (cf. `loadLinkableChatters`, même
  // motif que `get-members.ts` : liste agence-wide par client admin, geste admin-only).
  // `getProfile` est `cache()` : la page a déjà appelé `requireAccess('compta')` dans le
  // même rendu, donc pas de seconde requête.
  const isAdmin = (await getProfile())?.role === 'admin'
  const [{ rows, coverage, setterRanking, setterScale }, linkableChatters] = await Promise.all([
    loadComptaRows({ period, today }),
    isAdmin ? loadLinkableChatters() : Promise.resolve([]),
  ])

  // Bandeau de retard — définition et pièges dans `coverage.ts`. `rows` tient lieu de liste de
  // membres : chaque ligne porte déjà `id`, et c'est exactement la population que la RLS a
  // laissé passer.
  const overdue = overduePeriods({
    choices,
    today,
    current: period,
    members: rows,
    coverage,
  })

  // Même prédicat que `overduePeriods` et que le garde de `payPeriod` — une seule définition
  // de « période échue » dans toute la feature.
  return {
    period,
    periodElapsed: period.end < today,
    choices,
    rows,
    overdue,
    linkableChatters,
    setterRanking,
    setterScale,
  }
}
