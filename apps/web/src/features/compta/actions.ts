'use server'

// Server Actions de SAISIE de la Compta : saisie hebdo = manager/sous-manager sur SES
// rattachés (`managerPageGuard` + RLS 0085) ; le lien MyPuls = admin seul (`adminGuard`). Les
// réglages de paie ont déménagé dans Membres (cf. plus bas).
//
// LES DEUX GESTES DE PAIEMENT VIVENT DANS `actions-pay.ts` — ce fichier avait atteint 342 lignes
// (plafond de 300, CLAUDE.md) et le paiement groupé en ajoutait autant. Frontière : ici ce qui
// se SAISIT, là ce qui se VERSE.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { applyChatterLink } from '@/lib/chatter-link'
import {
  runAction,
  managerPageGuard,
  adminGuard,
  BusinessError,
  type ActionResult,
} from '@/lib/actions'
import { weekEntryInput, chatterLinkInput } from './schema'

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

// LA SAISIE DE LA PÉRIODE (`savePeriodEntry` — report « RESTE SEMAINE PASSEE » et prime du mois
// « PRIME TOP3 MOIS ») A ÉTÉ RETIRÉE le 2026-07-28, décision de Benoit : le report n'existera
// pas, et un montant mensuel saisi sur un écran de période n'avait pas de sens. La table
// `compta_period_entries` est droppée par la migration 0095.

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
