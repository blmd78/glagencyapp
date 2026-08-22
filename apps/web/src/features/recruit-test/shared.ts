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
import { NO_ATTEMPT } from './types'

export type Admin = ReturnType<typeof createAdminClient>

// Messages de refus — français, adressés au CANDIDAT (jamais un message Supabase brut, jamais un
// chiffre du barème : les seuils ne descendent pas au client, cf. spec §2). Ceux que le CLIENT doit
// reconnaître (`NO_ATTEMPT`, `BOT_ALREADY_SENT`, `CHAT_OVER`) vivent dans `types.ts` — le seul
// module que les deux côtés importent.
export const CLOSED = 'Le recrutement est fermé pour le moment.'
// `BLOCKED` vit dans `types.ts` : le CLIENT doit le reconnaître pour basculer sur le cul-de-sac.
export { BLOCKED } from './types'
export const RATE_LIMITED = 'Trop de tentatives depuis ce réseau — réessaie plus tard.'
export const ATTEMPT_OVER = 'Ce test est déjà terminé.'
export const STEPS_MISSING = 'Termine toutes les épreuves d’abord.'

/**
 * IP de l'appelant, pour le rate-limit d'entrée (et la blocklist IP, qui reste une décision
 * d'admin). Vercel pose `x-real-ip` (valeur unique) et `x-forwarded-for` (liste) sur chaque requête
 * entrante ; en local, sans proxy, aucun des deux n'existe → `null`, et les gardes qui dépendent de
 * l'IP se neutralisent d'elles-mêmes (on ne bloque personne sur une IP inconnue).
 * Même avec l'en-tête le plus fiable, cette valeur reste indicative : elle borne un abus
 * opportuniste (le vrai plafond de coût reste `bot_messages` + le test fermable en un clic), pas un
 * attaquant déterminé.
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers()
  // Valeur unique posée par la plateforme d'abord (`x-real-ip`) : la liste `x-forwarded-for` peut
  // être concaténée avec des valeurs ENTRANTES forgées par le client, dont la première position.
  // XFF ne sert que de repli (autre proxy en amont), et on n'en garde que la première entrée.
  const real = h.get('x-real-ip')?.trim()
  if (real) return real
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || null
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
 * Les cardinalités sont des invariants, pas des préférences : 4 options par variante (les réponses
 * envoyées sont bornées 0..3 par `saveQiInput`) et 1 à 20 emplacements (le nombre d'emplacements
 * est LIBRE — le verdict pondère `qi/N*30` avec le N de la tentative — mais une banque vide ne
 * tirerait aucune question et la base contraint `qi_score between 0 and 20`, 0114). Une banque hors
 * de ces bornes est une config CASSÉE → erreur technique (Sentry + message générique), pas un refus
 * métier adressé au candidat.
 */
const qiVariantRow = z.object({
  q: z.string().min(1),
  opts: z.array(z.string()).length(4),
  a: z.number().int().min(0).max(3),
})
const qiBankRows = z
  .array(z.object({ slot: z.string().min(1), variants: z.array(qiVariantRow).min(1) }))
  .min(1)
  .max(20)

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

// `created_at` fait partie des colonnes chargées d'office : c'est l'ORIGINE DE TEMPS de la
// tentative, la seule dont le serveur dispose pour rendre le chrono du QI exécutoire (`saveQi`).
// Le client, lui, ne fournit aucune horodatation digne de confiance.
// `ip` n'y est PAS : la colonne existe (télémétrie + rate-limit à l'entrée, qui filtre dessus en
// base) mais aucune action ne la LIT sur la tentative chargée.
const ATTEMPT_COLS =
  'id, status, created_at, persona, device, qi_timer, bot_messages, qi_score, qi_answers, typing, connection_mbps, bot_replies, input_tokens, output_tokens, orthographe, coherence, relance, vente, bot_total'

export type Attempt = {
  id: string
  status: string
  /** Horodatage serveur de la création (timestamptz ISO) — origine du chrono QI. */
  created_at: string
  persona: string
  device: string
  /** Réglages FIGÉS au démarrage (0115) — la correction ne relit jamais la config du moment. */
  qi_timer: number
  bot_messages: number
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
  if (!data) throw new BusinessError(NO_ATTEMPT)
  return data as Attempt
}

/**
 * Toute épreuve ne s'écrit que sur une tentative encore ouverte (notée ou soumise = plus rien ne
 * bouge).
 *
 * ⚠️ Note pour la page Recrutement (T6) : le statut `abandonnee` existe en base (0113_formation) mais AUCUNE
 * action ne le pose aujourd'hui — un candidat qui ferme l'onglet laisse sa tentative en `en_cours`
 * pour toujours. Le compte des tentatives « en cours » n'est donc PAS un compte de candidats
 * actifs : côté admin, il faut soit filtrer sur `created_at` récent, soit un job de nettoyage qui
 * bascule les vieilles tentatives en `abandonnee`.
 */
export function requireInProgress(attempt: Attempt): void {
  if (attempt.status !== 'en_cours') throw new BusinessError(ATTEMPT_OVER)
}

/**
 * Clé de correction QI posée au tirage (`pickQiQuestions`) — jsonb, jamais renvoyée au client.
 *
 * Sa LONGUEUR est la source de vérité du nombre de questions de la tentative : la banque de config
 * peut changer pendant qu'un candidat joue, sa correction, son chrono et son verdict restent ceux
 * du questionnaire qu'on lui a réellement servi. D'où les bornes 1..20 ici (les mêmes que la
 * banque) et jamais une longueur figée.
 */
export function toAnswerKey(json: unknown): number[] {
  const parsed = z.array(z.number().int()).min(1).max(20).safeParse(json)
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
 * « Un seul essai » (oneAttempt GLA) : au moins une des paires colonne/valeur est déjà en liste de
 * blocage. Deux volets l'appellent — ENTRÉE (`device` + `ip`, `startAttempt`) et SOUMISSION
 * (`email` + `discord`, `submitCandidate`).
 *
 * Un `eq` SÉPARÉ par paire, jamais un `.or()` : `ip` vient d'un en-tête forgeable et `discord` est
 * une chaîne libre côté candidat — les concaténer dans la CHAÎNE de filtre PostgREST serait
 * injectable. Court-circuit au premier match, et une valeur nulle/vide est simplement sautée (on ne
 * bloque personne sur une IP inconnue ou un Discord non renseigné). `device` et `email` sont
 * indexés (0125) ; `ip` l'est aussi ; `discord` ne l'est pas — la table reste petite, c'est un seq
 * scan sans enjeu.
 *
 * Les valeurs d'identité arrivent déjà minusculées par `submitCandidateInput` : la base ne stocke
 * que du minuscule (checks de 0126), une comparaison sur une valeur non normalisée ne matcherait
 * jamais.
 */
export async function anyBlocklistMatch(
  admin: Admin,
  pairs: [column: 'device' | 'ip' | 'email' | 'discord', value: string | null][],
  opts?: { adminPosedOnly?: boolean },
): Promise<boolean> {
  for (const [column, value] of pairs) {
    if (!value) continue
    let q = admin.from('recruit_blocklist').select('id').eq(column, value)
    // `adminPosedOnly` : ne retenir que les décisions d'ADMIN (`source = 'admin'`, 0116).
    // POURQUOI : l'e-mail et le pseudo Discord d'un candidat ne sont JAMAIS vérifiés (aucune
    // confirmation dans le parcours). Une ligne posée par le TEST sur ces colonnes bloquerait donc
    // la VICTIME dont on a saisi l'adresse, pas le tricheur — et elle ne le découvrirait qu'après
    // avoir joué tout le test. Le `device`, lui, reste refusé quelle que soit l'origine : c'est
    // notre identifiant, pas une valeur déclarée.
    if (opts?.adminPosedOnly) q = q.eq('source', 'admin')
    const { data, error } = await q.limit(1)
    if (error) throw new Error(error.message)
    if (data.length > 0) return true
  }
  return false
}

/**
 * Démarre une tentative SOUS le plafond de coût (5 par IP sur 24 h glissantes) — plafond et
 * insertion dans la MÊME transaction, sérialisés par IP (`recruit_start_attempt`, 0115).
 *
 * L'ancienne version comptait ici puis laissait l'appelant insérer : un TOCTOU sur un endpoint
 * PUBLIC où chaque tentative ouvre jusqu'à `bot_messages` appels Haiku + un Sonnet — une rafale
 * concurrente depuis une IP passait donc à travers le plafond qui borne la facture.
 *
 * `qiTimer`/`botMessages` sont FIGÉS sur la ligne : la correction ne relira jamais la config du
 * moment (un réglage changé en cours de tentative rejetait ou enfermait le candidat).
 */
export async function startAttemptRow(
  admin: Admin,
  v: { device: string; ip: string | null; persona: string; qiAnswers: unknown; qiTimer: number; botMessages: number },
): Promise<string> {
  const { data, error } = await admin.rpc('recruit_start_attempt', {
    p_device: v.device,
    // `p_ip text` est NULLABLE côté SQL (la fonction teste `is not null` pour le cas « IP inconnue »),
    // mais les types générés ne portent pas la nullabilité des ARGUMENTS de fonction Postgres.
    p_ip: v.ip as string,
    p_persona: v.persona,
    p_qi_answers: v.qiAnswers as never,
    p_qi_timer: v.qiTimer,
    p_bot_messages: v.botMessages,
    p_max: RATE_LIMIT_MAX,
    p_window: `${RATE_LIMIT_WINDOW_MS} milliseconds`,
  })
  // Le plafond est rendu par la fonction en exception applicative : message stable, jamais montré
  // tel quel (on rend le refus métier français).
  if (error?.message.includes('RECRUIT_RATE_LIMITED')) throw new BusinessError(RATE_LIMITED)
  if (error) throw new Error(error.message)
  // `Returns: string | null` côté types générés (toute fonction SQL peut rendre NULL) ; la nôtre
  // rend toujours l'uuid inséré ou lève — d'où le refus explicite plutôt qu'un cast silencieux.
  if (typeof data !== 'string') throw new Error('recruit_start_attempt sans identifiant')
  return data
}
