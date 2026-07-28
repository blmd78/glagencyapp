'use server'

// Server Actions de SAISIE de la Compta : saisies hebdo/période = manager/sous-manager sur SES
// rattachés (`managerPageGuard` + RLS 0085) ; le lien MyPuls = admin seul (`adminGuard`). Les
// réglages de paie ont déménagé dans Membres (cf. plus bas).
//
// LES DEUX GESTES DE PAIEMENT VIVENT DANS `actions-pay.ts` — ce fichier avait atteint 342 lignes
// (plafond de 300, CLAUDE.md) et le paiement groupé en ajoutait autant. Frontière : ici ce qui
// se SAISIT, là ce qui se VERSE.

import { revalidatePath } from 'next/cache'
import { monthOf, periodsOfMonth, recentPeriods, todayParis } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { applyChatterLink } from '@/lib/chatter-link'
import { eur2 } from '@/lib/format'
import {
  runAction,
  managerPageGuard,
  adminGuard,
  BusinessError,
  type ActionResult,
} from '@/lib/actions'
import { weekEntryInput, periodEntryInput, chatterLinkInput } from './schema'

/**
 * Crée ou met à jour la saisie HEBDOMADAIRE d'un chatteur (bonus, malus, handoffs). Upsert sur
 * la clé métier `(chatter_id, week_start)`. La RLS refuse la ligne si la cible n'est pas un
 * rattaché direct — la garde applicative n'est que la défense en profondeur.
 *
 * `fixe_setter` N'EST PLUS ÉCRIT (2026-07-28, tâche 19) et c'est délibéré : la colonne existe
 * toujours et porte de l'historique, mais l'omettre du payload la laisse INTACTE sur une ligne
 * existante — là où l'écrire à 0 l'aurait effacée à la première ré-écriture. Sur une ligne
 * neuve, elle prend son défaut (`0`, migration 0084). Le fixe se règle désormais dans
 * `compta_settings.fixed_amount` (onglet Compta du dialog de Membres), seule source du montant.
 */
export async function saveWeekEntry(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: weekEntryInput,
    input: raw,
    guard: managerPageGuard('compta'),
    handler: async (v) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée')
      const supabase = await createClient()
      const { error } = await supabase.from('compta_week_entries').upsert(
        {
          chatter_id: v.chatterId,
          week_start: v.weekStart,
          bonus: v.bonus,
          malus: v.malus,
          handoffs: v.handoffs,
          note: v.note,
          updated_at: new Date().toISOString(),
          updated_by: profile.id,
        },
        { onConflict: 'chatter_id,week_start' },
      )
      // 42501 = violation RLS : la cible est hors périmètre. Message MÉTIER, pas Sentry.
      if (error?.code === '42501') throw new BusinessError("Ce chatteur n'est pas dans ton périmètre.")
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/compta')
    },
  })
}

/**
 * Saisie de la PÉRIODE : le report (`RESTE SEMAINE PASSEE`) et la prime du mois (`PRIME TOP3
 * MOIS`). Upsert sur la clé métier `(chatter_id, period_start)`, table `compta_period_entries`
 * (0090). MÊME GARDE que `saveWeekEntry` — c'est de la saisie d'encadrement, pas un réglage :
 * `managerPageGuard('compta')` en défense, la RLS `compta_period_entries_scope` en verrou réel.
 *
 * LA PÉRIODE EST VALIDÉE PAR APPARTENANCE à la fenêtre proposée, jamais par la seule regex ISO
 * du schéma — même contrôle que `payPeriod`. Sans lui, un `periodStart` bien formé mais décalé
 * (un mardi, un lundi à +7 jours) écrirait une ligne qu'AUCUNE période affichée ne ramasserait :
 * un report saisi, invisible, et jamais versé. La base a bien un `check` d'alignement (0090),
 * mais il rendrait un `23514` brut — ici le refus est un message français.
 *
 * LA PRIME DU MOIS EST BORNÉE À UNE PAR MOIS CIVIL (2026-07-28). Un mois contient 2 OU 3
 * périodes : sans garde, la même prime mensuelle se saisit deux fois et se verse deux fois. Le
 * verrou réel est l'index unique `compta_period_entries_one_top3_per_month` (0092) ; le
 * pré-contrôle ci-dessous n'existe que pour NOMMER la période fautive au lieu de rendre un
 * `23505` (que la traduction plus bas rattrape de toute façon en cas de course). Le second
 * verrou, contre un nouveau VERSEMENT après une remise à zéro de la saisie, lit l'instantané
 * figé `compta_payments.monthly_prime_amount` — même source de vérité que `coverage.primePaid`.
 */
export async function savePeriodEntry(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: periodEntryInput,
    input: raw,
    guard: managerPageGuard('compta'),
    handler: async (v) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée')
      if (!recentPeriods(todayParis(), 12).some((p) => p.start === v.periodStart)) {
        throw new BusinessError("Cette période n'est plus dans la fenêtre affichée — recharge la page.")
      }
      const supabase = await createClient()
      if (v.top3Prime > 0) await assertMonthlyPrimeFree(supabase, v.chatterId, v.periodStart)
      const { error } = await supabase.from('compta_period_entries').upsert(
        {
          chatter_id: v.chatterId,
          period_start: v.periodStart,
          carryover: v.carryover,
          top3_prime: v.top3Prime,
          // Posé à la main : aucun trigger ne rafraîchit `updated_at` sur ces tables, et le
          // défaut `now()` ne joue qu'à l'INSERT.
          updated_at: new Date().toISOString(),
          updated_by: profile.id,
        },
        { onConflict: 'chatter_id,period_start' },
      )
      if (error?.code === '42501') throw new BusinessError("Ce chatteur n'est pas dans ton périmètre.")
      // 23505 sur CETTE table ne peut venir que de l'index unique 0092 : la PK
      // `(chatter_id, period_start)` est absorbée par l'`on conflict` de l'upsert juste au-dessus.
      // C'est le filet de course — deux onglets qui saisissent la prime sur les deux périodes du
      // même mois en même temps passeraient tous les deux le pré-contrôle.
      if (error?.code === '23505') {
        throw new BusinessError(
          'Une prime du mois est déjà saisie sur une autre période de ce mois pour ce chatteur — recharge la page.',
        )
      }
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/compta')
    },
  })
}

/**
 * « Cette prime du mois peut-elle encore être saisie sur cette période ? » — DEUX refus, et deux
 * seulement. Lecture SOUS RLS (client de session) : un encadrant lit les lignes et les paiements
 * de ses rattachés (`compta_period_entries_scope`, `compta_payments_read`, 0085/0090), donc les
 * lignes qui le concernent. Sur une cible hors périmètre il ne verrait rien ici, mais l'upsert
 * échouerait en 42501 juste après — le droit n'est jamais arbitré par cette fonction.
 */
async function assertMonthlyPrimeFree(
  supabase: Awaited<ReturnType<typeof createClient>>,
  chatterId: string,
  periodStart: string,
): Promise<void> {
  // Le mois d'une période est celui de son LUNDI DE DÉPART — la même règle que l'index 0092 et
  // que `coverage.monthlyPrimePaid`. Une période à cheval (20/07 → 02/08) est donc entièrement de
  // juillet, et la suivante entièrement d'août : aucune prime ne tombe entre deux mois ni n'est
  // réclamée par les deux.
  const month = periodsOfMonth(monthOf(periodStart))
  const others = month.map((p) => p.start).filter((s) => s !== periodStart)
  if (others.length === 0) return

  const [{ data: entries, error: entriesErr }, { data: payments, error: payErr }] = await Promise.all([
    supabase
      .from('compta_period_entries')
      .select('period_start, top3_prime')
      .eq('chatter_id', chatterId)
      .in('period_start', others)
      .gt('top3_prime', 0),
    // ⚠️ TOUTES les périodes du mois, celle-ci COMPRISE : payer cette période puis remettre sa
    // saisie à 0 ne défait pas le virement. C'est l'instantané qui fait foi (spec §5.9).
    supabase
      .from('compta_payments')
      .select('period_start, monthly_prime_amount')
      .eq('chatter_id', chatterId)
      .in('period_start', [...others, periodStart])
      .gt('monthly_prime_amount', 0),
  ])
  if (entriesErr) throw new Error(entriesErr.message)
  if (payErr) throw new Error(payErr.message)

  if ((payments ?? []).length > 0) {
    throw new BusinessError(
      'La prime du mois a déjà été VERSÉE à ce chatteur pour ce mois — elle ne peut pas être saisie une seconde fois.',
    )
  }
  const clash = (entries ?? [])[0]
  if (clash) {
    // Le LIBELLÉ de la période, jamais son ISO : le message doit nommer la ligne telle qu'elle
    // s'affiche à l'écran (« du 6 au 19 juillet 2026 »), sinon il faut la traduire de tête.
    const label = month.find((p) => p.start === clash.period_start)?.label ?? clash.period_start
    throw new BusinessError(
      `La prime du mois est déjà saisie sur la période ${label} (${eur2(Number(clash.top3_prime))}) — c'est un montant MENSUEL, versé une seule fois. Remets-la à 0 là-bas avant de la déplacer ici.`,
    )
  }
}

// LES RÉGLAGES DE PAIE NE S'ÉCRIVENT PLUS D'ICI (2026-07-28). `saveComptaSettings` et
// `savePrime` sont devenues `saveMemberPaySettings` / `saveMemberPrime` dans
// `features/members/actions-pay.ts` : le taux, le fixe et la prime sont des attributs de la
// PERSONNE, pas de la période, et les avoir dans deux écrans était la même erreur que le fixe
// qui vivait en double (tâche 19). Le cœur des deux écritures — upsert, traduction du 42501 et
// le refus de réécrire une prime DÉJÀ VERSÉE — est partagé dans `lib/pay-settings.ts` (les
// imports inter-features sont interdits, cf. `lib/chatter-link.ts`). La Compta continue de les
// LIRE, et Membres revalide `/chatter/compta` à chaque écriture.

/**
 * Relie un membre à son chatteur MyPuls SANS quitter la compta (`profiles.chatter_id`). Sans
 * ce lien aucun CA n'est calculable, donc aucune fiche de paie : c'est le seul geste qui
 * débloque la ligne, et l'imposer via la page Membres coupait le flux de la paie.
 *
 * `adminGuard` : `applyChatterLink` est admin-seul et IGNORE SILENCIEUSEMENT un non-admin
 * (cf. lib/chatter-link.ts) — sans cette garde, un manager verrait « Membre relié » sans que
 * rien ne soit écrit. La garde est ici le seul rempart : `profiles.chatter_id` est écrit par
 * client SERVICE-ROLE (`auth.admin` est requis ailleurs dans le même helper), donc la RLS ne
 * tranche pas. L'UI ne monte le bouton que pour `canConfigure`, ce qui reste optimiste.
 *
 * La garde d'unicité et la traduction du `23505` viennent du helper partagé avec Membres —
 * une seule implémentation.
 */
export async function linkChatter(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: chatterLinkInput,
    input: raw,
    guard: adminGuard,
    handler: async (v) => {
      const caller = await getProfile()
      if (!caller) throw new Error('Session expirée')
      await applyChatterLink(createAdminClient(), caller, v.memberId, v.chatterId)
      revalidatePath('/chatter/compta')
      // Le lien est la MÊME colonne que celle affichée par Membres (badge « à relier »,
      // sélecteur de la fiche) : ne revalider que la compta y laisserait une vue périmée.
      revalidatePath('/chatter/members')
      revalidatePath('/marketing/members')
    },
  })
}
