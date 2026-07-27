import { recentFortnights, todayParis, type Fortnight } from '@glagency/core'
import { getProfile } from '@/lib/auth'
import { loadComptaRows } from './compta-rows'
import { loadLinkableChatters } from './compta-sources'
import { overdueFortnights } from './coverage'
import type { ComptaData } from '../types'

/**
 * Compta d'UNE quinzaine — sélection de la période, puis LE calcul commun
 * (`loadComptaRows`, partagé avec le recalcul serveur de `payFortnight`) et le bandeau de
 * retard. Aucun calcul de fiche de paie ici : il n'en existe qu'une implémentation.
 */
export async function getCompta({
  month,
  period,
}: {
  month?: string
  period?: string
}): Promise<ComptaData> {
  const today = todayParis()
  const choices = recentFortnights(today, 12)

  // `?month=`/`?period=` validés PAR APPARTENANCE à la fenêtre proposée, jamais par regex seule.
  const wanted = choices.find((f) => f.month === month && f.period === Number(period))
  const fortnight: Fortnight = wanted ?? choices[0]

  // Options du dialog « Relier à MyPuls » — ADMIN SEUL (cf. `loadLinkableChatters`, même
  // motif que `get-members.ts` : liste agence-wide par client admin, geste admin-only).
  // `getProfile` est `cache()` : la page a déjà appelé `requireAccess('compta')` dans le
  // même rendu, donc pas de seconde requête.
  const isAdmin = (await getProfile())?.role === 'admin'
  const [{ rows, coverage }, linkableChatters] = await Promise.all([
    loadComptaRows({ fortnight, today }),
    isAdmin ? loadLinkableChatters() : Promise.resolve([]),
  ])

  // Bandeau de retard — définition et pièges dans `coverage.ts`. `rows` tient lieu de liste de
  // membres : chaque ligne porte déjà `id`, et c'est exactement la population que la RLS a
  // laissé passer.
  const overdue = overdueFortnights({
    choices,
    today,
    current: fortnight,
    members: rows,
    coverage,
  })

  // Même prédicat que `overdueFortnights` et que le garde de `payFortnight` — une seule
  // définition de « quinzaine échue » dans toute la feature.
  return {
    fortnight,
    fortnightElapsed: fortnight.to < today,
    choices,
    rows,
    overdue,
    linkableChatters,
  }
}
