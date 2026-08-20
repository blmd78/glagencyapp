'use server'

// Server Actions des DOSSIERS candidats (page Recrutement, admin) : valider / refuser / bloquer /
// débloquer / supprimer. La config du test vit dans `actions-config.ts`.
//
// Modèle d'écriture de la face Formation depuis 0121, appliqué ici sans exception : la RLS des
// tables `recruit_*` n'accorde que la LECTURE (`is_admin()`), AUCUNE policy d'écriture — toutes
// les écritures passent donc par le service-role, APRÈS `requireRecruitAdmin()` (admin + refus
// impersonation). `recruit_config` est la seule à porter en plus une policy d'écriture admin, mais
// on garde UN seul chemin d'écriture pour toute la feature : deux clients dans un même fichier
// d'actions est exactement le genre de nuance qu'une relecture rapide rate.
//
// Patron §4 des guidelines : `noGuard` + vérification UNE SEULE FOIS en tête de handler, refus
// métier = `BusinessError` (message français affiché tel quel), erreur technique = `Error` nue.

import { createAdminClient } from '@glagency/db'
import { BusinessError, noGuard, runAction, type ActionResult } from '@/lib/actions'
import { requireRecruitAdmin, revalidateRecruit } from './actions-shared'
import { candidateIdInput, reviewInput } from './schema'

const NOT_FOUND = 'Dossier introuvable'

type Admin = ReturnType<typeof createAdminClient>

/** Cibles de blocage d'un dossier : l'identité (dossier) + l'empreinte réseau (tentative). */
type BlockTargets = { device: string | null; email: string; discord: string | null; ip: string | null }

/**
 * Charge les quatre cibles de blocage. `email`/`discord` sont RE-minusculés par précaution : la
 * base l'impose déjà (`check (email = lower(email))`, 0126) mais une comparaison sur une valeur
 * non normalisée ne matcherait JAMAIS — autant que la règle soit lisible ici aussi.
 */
async function loadBlockTargets(admin: Admin, id: string): Promise<BlockTargets> {
  const { data, error } = await admin
    .from('recruit_candidates')
    .select('email, discord, recruit_attempts(device, ip)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new BusinessError(NOT_FOUND)
  return {
    device: data.recruit_attempts?.device ?? null,
    email: data.email.toLowerCase(),
    discord: data.discord ? data.discord.toLowerCase() : null,
    ip: data.recruit_attempts?.ip ?? null,
  }
}

/**
 * Verdict de l'agence sur un dossier : `valide` ou `refuse` (`nouveau` est l'état initial, jamais
 * reposé). Trace QUI a tranché et QUAND — c'est la seule information d'audit de la page.
 */
export async function reviewCandidate(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: reviewInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id, status }) => {
      const profile = await requireRecruitAdmin()
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('recruit_candidates')
        .update({ status, reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new BusinessError(NOT_FOUND)
      revalidateRecruit()
    },
  })
}

/**
 * Blocage ADMIN : device + e-mail + Discord **+ IP**, en une ligne de `recruit_blocklist`.
 *
 * L'IP est la différence avec le blocage automatique posé à la soumission (`submitCandidate`), qui
 * l'exclut volontairement : derrière un CGNAT ou un partage de connexion mobile, une IP ne désigne
 * pas une personne et condamnerait des candidats innocents. En blocage MANUEL c'est un choix
 * assumé de l'admin (« celui-là, plus jamais »), pas un effet de bord du test.
 */
export async function blockCandidate(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: candidateIdInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id }) => {
      const profile = await requireRecruitAdmin()
      const admin = createAdminClient()
      const t = await loadBlockTargets(admin, id)
      const { error } = await admin.from('recruit_blocklist').insert({
        device: t.device,
        email: t.email,
        discord: t.discord,
        ip: t.ip,
        reason: 'bloqué depuis Recrutement',
        // `created_by` renseigné = blocage d'un admin (le test, lui, pose `null`).
        created_by: profile.id,
      })
      if (error) throw new Error(error.message)
      revalidateRecruit()
    },
  })
}

/**
 * Déblocage : retire les entrées de la liste qui visent ce candidat — celle posée
 * automatiquement à la soumission (device + e-mail + Discord, `created_by` null) comme celles
 * posées à la main par un admin. C'est le chemin documenté pour autoriser quelqu'un à REPASSER
 * le test : il suffit d'UNE entrée qui matche pour que l'entrée du test soit refusée.
 *
 * Des `delete` séparés, jamais un `.or()` : ces valeurs viennent du navigateur du candidat, les
 * concaténer dans la chaîne de filtre PostgREST serait injectable (cf. `recruit-test/shared.ts`).
 *
 * L'IP est traitée à part, et RESTREINTE aux lignes « IP seule ». Une ligne de blocage admin porte
 * device + e-mail + Discord + IP : la supprimer parce que son IP matche effacerait le blocage
 * ENTIER d'un tiers derrière la même IP publique (CGNAT, box familiale, 4G) — pas seulement son
 * volet réseau. La ligne admin du candidat qu'on débloque, elle, porte SON e-mail : elle part déjà
 * par le `delete` sur `email`. Ne restent visées ici que les lignes purement réseau.
 * Effet de bord qui subsiste, assumé : deux candidats qui partagent un device (poste commun) se
 * débloquent ensemble — c'est le pendant exact du blocage, qui les bloque déjà ensemble.
 */
export async function unblockCandidate(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: candidateIdInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id }) => {
      await requireRecruitAdmin()
      const admin = createAdminClient()
      const t = await loadBlockTargets(admin, id)
      const identity: ['device' | 'email' | 'discord', string | null][] = [
        ['device', t.device],
        ['email', t.email],
        ['discord', t.discord],
      ]
      try {
        for (const [column, value] of identity) {
          if (!value) continue
          const { error } = await admin.from('recruit_blocklist').delete().eq(column, value)
          if (error) throw new Error(error.message)
        }
        if (t.ip) {
          const { error } = await admin
            .from('recruit_blocklist')
            .delete()
            .eq('ip', t.ip)
            .is('email', null)
            .is('device', null)
            .is('discord', null)
          if (error) throw new Error(error.message)
        }
      } finally {
        // Suppression partielle possible (un `delete` qui échoue au milieu) : au moins l'état
        // réel est visible immédiatement, plutôt que masqué par une page servie du cache.
        revalidateRecruit()
      }
    },
  })
}

/**
 * Supprime le DOSSIER (l'identité). La tentative technique et sa transcription sont CONSERVÉES :
 * elles portent les compteurs de tokens qui font le coût IA du recrutement, et elles sont
 * anonymes une fois le dossier parti. La liste de blocage n'est pas touchée non plus — supprimer
 * un dossier n'est pas autoriser un nouvel essai (l'UI le dit dans la confirmation).
 */
export async function deleteCandidate(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: candidateIdInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id }) => {
      await requireRecruitAdmin()
      const admin = createAdminClient()
      const { data, error } = await admin.from('recruit_candidates').delete().eq('id', id).select('id').maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new BusinessError(NOT_FOUND)
      revalidateRecruit()
    },
  })
}
