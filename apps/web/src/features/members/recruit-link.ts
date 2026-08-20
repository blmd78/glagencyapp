import * as Sentry from '@sentry/nextjs'
import type { createAdminClient } from '@glagency/db'
import type { RecruitCheck } from './types'

/**
 * PONT Membres → Recrutement : retrouver le dossier du test public (`recruit_candidates`, 0125)
 * d'un candidat par son e-mail, et le rattacher au profil créé.
 *
 * Module NEUTRE (pas de `'use server'`) : `attachRecruitCandidate` prend un client service-role
 * en paramètre — l'exporter depuis un fichier `'use server'` en ferait un point d'entrée
 * appelable depuis le navigateur, ce qu'il ne doit jamais être. Même patron que
 * `lib/chatter-link.ts`. La Server Action exposée au client vit, elle, dans `actions-recruit.ts`.
 *
 * Service-role et pas le client RLS : la RLS de `recruit_candidates` n'ouvre la lecture qu'à
 * `is_admin()` et AUCUNE écriture — or `createMember` est aussi utilisable par un MANAGER dans
 * son périmètre, qui ne verrait donc rien. Le gate applicatif est celui de l'action appelante.
 */

type Admin = ReturnType<typeof createAdminClient>

/** Normalisation unique : la colonne `email` est stockée en minuscules (check `0126`). */
const normalize = (email: string) => email.trim().toLowerCase()

/**
 * Dossier de recrutement le PLUS RÉCENT porté par cet e-mail (`null` si aucun) — les trois
 * seules informations montrées à l'admin dans le dialog Membres. Volontairement pauvre : les
 * mesures détaillées, la transcription et le motif de refus restent sur la page Recrutement.
 */
export async function findRecruitByEmail(admin: Admin, email: string): Promise<RecruitCheck | null> {
  const { data, error } = await admin
    .from('recruit_candidates')
    .select('created_at, global, passed')
    .eq('email', normalize(email))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? { testedAt: data.created_at, global: data.global, passed: data.passed } : null
}

/**
 * Rattache le dossier de recrutement au profil fraîchement créé — le plus récent des dossiers
 * ENCORE LIBRES de cet e-mail (`profile_id is null` : on ne vole jamais le dossier déjà rattaché
 * à un autre membre). Le `.is('profile_id', null)` est répété sur l'UPDATE : entre la lecture et
 * l'écriture, une autre création pourrait l'avoir pris.
 *
 * NON BLOQUANT, c'est le point important : le membre est créé, son compte auth existe déjà, et un
 * rattachement raté n'est qu'une commodité d'affichage (« devenu membre » sur la fiche candidat).
 * Faire échouer `createMember` ici laisserait un compte auth orphelin pour rien. L'échec part donc
 * en Sentry et l'utilisateur ne voit rien.
 *
 * @returns `true` si un dossier a effectivement été rattaché (l'appelant en déduit s'il doit
 *          rafraîchir la page Recrutement).
 */
export async function attachRecruitCandidate(
  admin: Admin,
  email: string,
  profileId: string,
): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from('recruit_candidates')
      .select('id')
      .eq('email', normalize(email))
      .is('profile_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return false

    const { data: linked, error: uErr } = await admin
      .from('recruit_candidates')
      .update({ profile_id: profileId })
      .eq('id', data.id)
      .is('profile_id', null)
      .select('id')
      .maybeSingle()
    if (uErr) throw new Error(uErr.message)
    return !!linked
  } catch (err) {
    Sentry.captureException(err)
    return false
  }
}
