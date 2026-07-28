import { mondaysIn, rankSetters, type PayPeriod, type SetterRank, type SetterScaleRow } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'

/**
 * LE CLASSEMENT SETTER d'une période — le barème (`compta_setter_scale`, 0090) et le rang de
 * chaque membre dans les handoffs de la période. Le calcul lui-même est pur et vit dans
 * `packages/core/src/compta/setter-rank.ts` ; ici il n'y a que les lectures et leur POURQUOI.
 *
 * ── POURQUOI LES HANDOFFS SONT LUS PAR CLIENT ADMIN, ET PAS SOUS RLS ─────────────────────────
 * C'est le point critique de ce fichier, et il porte de l'argent.
 *
 * `compta_day_entries` / `compta_week_entries` sont cloisonnées (0085) : `is_admin() or
 * (is_manager() and manages(chatter_id))`. Un manager n'y lit donc QUE ses rattachés directs —
 * 15 personnes sur ~96 (mesuré sur l'UAT le 2026-07-27 : Chérif 15, Marco 35). Classer sur cette
 * lecture-là donnerait à ses 15 rattachés les rangs 1 à 15, donc les 15 tranches du barème :
 * l'écran d'un manager annoncerait des primes de 200 € là où l'agence en verse 84 €, SANS AUCUNE
 * ERREUR. Et le paiement, lui, est exécuté par un admin qui voit tout : les deux écrans se
 * contrediraient sur un montant déjà annoncé.
 *
 * Un classement est par nature AGENCE-WIDE — c'est le sens même d'un TOP 15. La lecture est donc
 * faite par client admin, et le cadrage est applicatif, exactement comme le CA et
 * `chatter_first_seen()` dans `compta-sources.ts`.
 *
 * CE QUI EN SORT, ET CE QUI N'EN SORT PAS : cette fonction renvoie une Map indexée par
 * `profiles.id`. L'appelant (`compta-rows.ts`) n'y lit QUE les membres que la RLS `profiles` lui
 * a déjà rendus — voir l'ancre de sécurité de `compta-sources.ts`. Un manager n'apprend donc ni
 * les noms, ni les handoffs des autres : seulement le rang de SES rattachés, qui est la donnée
 * dont dépend leur paie. Ne jamais renvoyer les lignes brutes depuis ici.
 *
 * LE BARÈME, lui, est lu SOUS RLS (`compta_setter_scale_read` : admin ou encadrement, 0090). Il
 * ne désigne personne et doit être lisible par l'encadrement, sous peine d'afficher la prime à
 * 0 € sans erreur — le défaut que 0086 a corrigé sur les sanctions Police (spec §6).
 *
 * ⚠️ LE COMPTAGE QUI FAIT FOI N'EST PAS TRANCHÉ (spec §4, à signaler à Benoit) : l'onglet
 * CLASSEMENT SETTER de sa feuille et les handoffs de sa propre compta divergent (Godgive : 86
 * contre 111 en juin). On classe sur les handoffs SAISIS DANS L'APP — la seule donnée dont on
 * garantisse la provenance.
 */

export interface SetterRanking {
  /** Le barème tel qu'il est en base, rang croissant — l'écran l'affiche et l'admin l'édite. */
  scale: SetterScaleRow[]
  /** Rang, handoffs et prime par `profiles.id`. Les membres à 0 handoff n'y figurent pas
   *  (`rankSetters` ne les classe pas). */
  byMember: Map<string, SetterRank>
}

/** Une ligne de saisie réduite à ce dont le classement a besoin. */
interface HandoffRow {
  chatter_id: string
  handoffs: number
}

export async function loadSetterRanking(period: PayPeriod): Promise<SetterRanking> {
  const supabase = await createClient()
  const admin = createAdminClient()
  const mondays = mondaysIn(period)

  const [{ data: scale, error: scaleErr }, { data: dayRows, error: dayErr }, weekRes] =
    await Promise.all([
      // 15 lignes (amorce 0090) — très loin du plafond PostgREST. `order('rank')` : le barème
      // s'affiche et s'édite dans l'ordre des tranches.
      supabase.from('compta_setter_scale').select('rank, amount').order('rank'),
      // `fetchAll` : ~96 membres × 14 jours = 1 344 lignes possibles, au-delà du plafond de 1000
      // que PostgREST applique EN SILENCE (CLAUDE.md, guidelines-data-loading §2). Tronqué, le
      // classement perdrait des handoffs et redistribuerait les tranches sans une seule erreur.
      // `.order('chatter_id').order('date')` = la PK complète → pagination déterministe.
      fetchAll<HandoffRow>((f, t) =>
        admin
          .from('compta_day_entries')
          .select('chatter_id, handoffs')
          .gte('date', period.start)
          .lte('date', period.end)
          .order('chatter_id')
          .order('date')
          .range(f, t),
      ),
      // Pas de `fetchAll` : une période contient EXACTEMENT 2 lundis (`mondaysIn`), donc au plus
      // 2 lignes par membre — 192 pour 96 membres. Le plafond ne serait atteint qu'au-delà de
      // 500 membres. Même raisonnement, et même mesure, que dans `compta-sources.ts`.
      admin
        .from('compta_week_entries')
        .select('chatter_id, handoffs')
        .in('week_start', mondays.length ? mondays : ['1970-01-01']),
    ])
  if (scaleErr) throw new Error(scaleErr.message)
  if (dayErr) throw new Error(dayErr.message)
  if (weekRes.error) throw new Error(weekRes.error.message)

  // Handoffs JOUR + SEMAINE, comme dans le calcul de la fiche (`compta-rows.ts`) : les deux
  // sources s'additionnent, et n'en prendre qu'une classerait sur un total que la fiche ne montre
  // nulle part.
  const handoffsByMember: Record<string, number> = {}
  for (const r of [...dayRows, ...(weekRes.data ?? [])]) {
    handoffsByMember[r.chatter_id] = (handoffsByMember[r.chatter_id] ?? 0) + r.handoffs
  }

  const rows = rankSetters(
    handoffsByMember,
    (scale ?? []).map((s) => ({ rank: s.rank, amount: Number(s.amount) })),
  )

  return {
    scale: (scale ?? []).map((s) => ({ rank: s.rank, amount: Number(s.amount) })),
    byMember: new Map(rows.map((r) => [r.id, r])),
  }
}
