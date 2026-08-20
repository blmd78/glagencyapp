// Briques communes aux Server Actions publiques du test (`actions.ts`, `actions-bot.ts`) — module
// SANS 'use server' : un fichier 'use server' ne peut exporter que des fonctions async, et rien
// d'ici n'est appelable depuis le client.
//
// Ce que ce module concentre, et pourquoi : le candidat de `/postuler` n'a AUCUNE session. Il n'y a
// donc ni RLS ni `requirePageProfile` pour l'arrêter — la seule frontière est ce qu'on revérifie
// nous-mêmes, à chaque appel, avec le client service-role. Trois de ces vérifications sont
// dupliquées dans plusieurs actions (identité réseau, config, état de la tentative) : les écrire
// une fois ici évite qu'une action en oublie une.

import { headers } from 'next/headers'
import { z } from 'zod'
import type { QiSlot, RecruitConfig } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { BusinessError } from '@/lib/actions'

export type Admin = ReturnType<typeof createAdminClient>

// Messages de refus — français, adressés au CANDIDAT (jamais un message Supabase brut, jamais un
// chiffre du barème : les seuils ne descendent pas au client, cf. spec §2).
export const CLOSED = 'Le recrutement est fermé pour le moment.'
export const BLOCKED = 'Tu as déjà passé le test.'
export const RATE_LIMITED = 'Trop de tentatives depuis ce réseau — réessaie plus tard.'
export const ATTEMPT_KO = 'Test introuvable — recommence depuis le début.'
export const ATTEMPT_OVER = 'Ce test est déjà terminé.'
export const STEPS_MISSING = 'Termine toutes les épreuves d’abord.'

/**
 * IP de l'appelant, pour la blocklist et le rate-limit. Vercel pose `x-forwarded-for` (liste
 * « client, proxy1, … » dont la PREMIÈRE valeur est le client) et `x-real-ip` sur chaque requête
 * entrante ; en local, sans proxy, aucun des deux n'existe → `null`, et les gardes qui dépendent de
 * l'IP se neutralisent d'elles-mêmes (on ne bloque personne sur une IP inconnue).
 * Ces en-têtes sont FORGEABLES par le client : ils bornent un abus opportuniste (le vrai plafond de
 * coût reste `bot_messages` + le test fermable), pas un attaquant déterminé.
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwarded) return forwarded
  return h.get('x-real-ip')?.trim() || null
}

// ---------------------------------------------------------------------------------------------
// Configuration (recruit_config, ligne unique)
// ---------------------------------------------------------------------------------------------

const CONFIG_KO = 'Configuration du test de recrutement invalide'

/**
 * Frontière jsonb ↔ TS de `recruit_config.qi_bank` (même parti pris que
 * `training-wheel/mappers.ts`) : la colonne est typée `Json`, un `as unknown as QiSlot[]` serait un
 * mensonge au compilateur — une banque éditée à la main en SQL ferait planter le tirage plus loin,
 * sans message. On valide la forme UNE FOIS, ici.
 * Les cardinalités sont des invariants, pas des préférences : 4 options (les réponses envoyées sont
 * bornées 0..3 par `saveQiInput`) et 5 emplacements (le verdict calcule `qi/5*30`, et la base
 * contraint `qi_score between 0 and 5`). Une banque d'une autre taille est une config CASSÉE →
 * erreur technique (Sentry + message générique), pas un refus métier adressé au candidat.
 */
const qiVariantRow = z.object({
  q: z.string().min(1),
  opts: z.array(z.string()).length(4),
  a: z.number().int().min(0).max(3),
})
const qiBankRows = z.array(z.object({ slot: z.string().min(1), variants: z.array(qiVariantRow).min(1) })).length(5)

export function toQiBank(json: unknown): QiSlot[] {
  const parsed = qiBankRows.safeParse(json)
  if (!parsed.success) throw new Error(`${CONFIG_KO} (banque QI)`)
  return parsed.data.map((s) => ({ slot: s.slot, variants: s.variants.map((v) => ({ q: v.q, opts: v.opts, a: v.a })) }))
}

/** Config du test telle que l'app la manipule : `RecruitConfig` (les seuils que lit `computeVerdict`) + ce qui ne sert qu'au parcours. */
export type RecruitTestConfig = RecruitConfig & {
  open: boolean
  discordLink: string
  typingText: string
  /**
   * Banque QI NON validée : seul `startAttempt` en a besoin (il appelle `toQiBank`). La valider
   * ici, à chaque lecture de config, ferait échouer une conversation en cours ou une soumission
   * pour une banque cassée par un admin entre-temps — alors qu'aucune des deux ne s'en sert.
   */
  qiBankRaw: unknown
}

/**
 * Lit la config à CHAQUE action qui en dépend (jamais mise en cache) : fermer le test ou changer
 * `bot_messages` doit prendre effet immédiatement, y compris sur les tentatives en cours.
 */
export async function readConfig(admin: Admin): Promise<RecruitTestConfig> {
  const { data, error } = await admin
    .from('recruit_config')
    .select('open, bot_messages, qi_timer, frappe_min, connexion_min, qi_min, global_threshold, discord_link, typing_text, qi_bank')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error(`${CONFIG_KO} (ligne 1 absente)`)
  return {
    open: data.open,
    botMessages: data.bot_messages,
    qiTimer: data.qi_timer,
    frappeMin: data.frappe_min,
    connexionMin: data.connexion_min,
    qiMin: data.qi_min,
    globalThreshold: data.global_threshold,
    discordLink: data.discord_link,
    typingText: data.typing_text,
    qiBankRaw: data.qi_bank,
  }
}

// ---------------------------------------------------------------------------------------------
// Tentative
// ---------------------------------------------------------------------------------------------

const ATTEMPT_COLS =
  'id, status, persona, device, ip, qi_score, qi_answers, typing, connection_mbps, bot_replies, input_tokens, output_tokens, orthographe, coherence, relance, vente, bot_total'

export type Attempt = {
  id: string
  status: string
  persona: string
  device: string
  ip: string | null
  qi_score: number | null
  qi_answers: unknown
  typing: unknown
  connection_mbps: number | null
  bot_replies: number
  input_tokens: number
  output_tokens: number
  orthographe: number | null
  coherence: number | null
  relance: number | null
  vente: number | null
  bot_total: number | null
}

/**
 * Charge la tentative (service-role) — l'`attemptId` est le SEUL laissez-passer du candidat : c'est
 * un UUID v4 non énumérable, tenu en `sessionStorage`. Une tentative inconnue est un refus métier
 * (« recommence »), pas une erreur technique : c'est le cas normal quand la base a été purgée ou
 * qu'un vieil onglet rejoue un identifiant.
 */
export async function loadAttempt(admin: Admin, attemptId: string): Promise<Attempt> {
  const { data, error } = await admin.from('recruit_attempts').select(ATTEMPT_COLS).eq('id', attemptId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new BusinessError(ATTEMPT_KO)
  return data as Attempt
}

/** Toute épreuve ne s'écrit que sur une tentative encore ouverte (notée ou soumise = plus rien ne bouge). */
export function requireInProgress(attempt: Attempt): void {
  if (attempt.status !== 'en_cours') throw new BusinessError(ATTEMPT_OVER)
}

/** Clé de correction QI posée au tirage (`pickQiQuestions`) — jsonb, jamais renvoyée au client. */
export function toAnswerKey(json: unknown): number[] {
  const parsed = z.array(z.number().int()).length(5).safeParse(json)
  if (!parsed.success) throw new Error('Clé de correction QI illisible sur cette tentative')
  return parsed.data
}

/** Mesure de frappe déclarée par le client (jsonb `recruit_attempts.typing`). */
export function toTyping(json: unknown): { wpm: number; accuracy: number; seconds: number } {
  const parsed = z.object({ wpm: z.number(), accuracy: z.number(), seconds: z.number() }).safeParse(json)
  if (!parsed.success) throw new Error('Mesure de frappe illisible sur cette tentative')
  return parsed.data
}

/** Transcription serveur complète, dans l'ordre — nourrit le bot ET la notation. */
export async function loadHistory(admin: Admin, attemptId: string): Promise<{ position: number; speaker: 'candidat' | 'client'; body: string }[]> {
  const { data, error } = await admin
    .from('recruit_messages')
    .select('position, speaker, body')
    .eq('attempt_id', attemptId)
    .order('position')
  if (error) throw new Error(error.message)
  return (data ?? []).map((m) => ({ position: m.position, speaker: m.speaker as 'candidat' | 'client', body: m.body }))
}

// ---------------------------------------------------------------------------------------------
// Gardes d'entrée (startAttempt)
// ---------------------------------------------------------------------------------------------

const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * « Un seul essai » (oneAttempt GLA), volet ENTRÉE : device ou IP déjà en liste de blocage.
 * Deux requêtes plutôt qu'un `.or()` : `ip` vient d'un en-tête forgeable et se retrouverait
 * concaténé dans la CHAÎNE de filtre PostgREST — un `.or()` construit ainsi est injectable. Les
 * deux colonnes sont indexées (0125), le coût du second aller-retour est négligeable.
 */
export async function isBlocked(admin: Admin, t: { device: string; ip: string | null }): Promise<boolean> {
  const { data: byDevice, error: dErr } = await admin.from('recruit_blocklist').select('id').eq('device', t.device).limit(1)
  if (dErr) throw new Error(dErr.message)
  if (byDevice.length > 0) return true
  if (!t.ip) return false
  const { data: byIp, error: iErr } = await admin.from('recruit_blocklist').select('id').eq('ip', t.ip).limit(1)
  if (iErr) throw new Error(iErr.message)
  return byIp.length > 0
}

/**
 * « Un seul essai », volet SOUMISSION : e-mail ou Discord déjà en liste de blocage. Mêmes deux
 * requêtes séparées que `isBlocked` — `discord` est une chaîne libre côté candidat, la
 * concaténer dans un `.or()` PostgREST serait injectable. (`email` est indexé par 0125 ; `discord`
 * ne l'est pas — la table reste petite, c'est un seq scan sans enjeu.)
 * Les deux valeurs arrivent déjà minusculées par `submitCandidateInput` : la base ne stocke que du
 * minuscule (checks de 0126), une comparaison sur une valeur non normalisée ne matcherait jamais.
 */
export async function isIdentityBlocked(admin: Admin, t: { email: string; discord: string | null }): Promise<boolean> {
  const { data: byEmail, error: eErr } = await admin.from('recruit_blocklist').select('id').eq('email', t.email).limit(1)
  if (eErr) throw new Error(eErr.message)
  if (byEmail.length > 0) return true
  if (!t.discord) return false
  const { data: byDiscord, error: dErr } = await admin.from('recruit_blocklist').select('id').eq('discord', t.discord).limit(1)
  if (dErr) throw new Error(dErr.message)
  return byDiscord.length > 0
}

/**
 * Plafond de coût : 5 tentatives par IP sur 24 h glissantes (index `(ip, created_at desc)`, 0125).
 * IP inconnue (dev local, en-tête absent) → pas de limite applicable : on ne veut pas bloquer tous
 * les candidats derrière un `null` commun.
 */
export async function enforceIpRateLimit(admin: Admin, ip: string | null): Promise<void> {
  if (!ip) return
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
  const { count, error } = await admin
    .from('recruit_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', since)
  if (error) throw new Error(error.message)
  if ((count ?? 0) >= RATE_LIMIT_MAX) throw new BusinessError(RATE_LIMITED)
}
