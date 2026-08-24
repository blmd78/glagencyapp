import { z } from 'zod'
import { LIMITS, LegacySourceError, clampInt } from './bounds'
import type { LegacyMessageRow } from './types'

/**
 * Lecture des objets bruts de Good Luck Agency : schémas Zod, conversion de date, et construction
 * des messages d'un fil. Séparé de `transform.ts` pour que chacun tienne sous 300 lignes.
 *
 * `.catch(undefined)` partout : une valeur mal typée vaut ABSENTE et ne fait pas échouer le lot —
 * c'est exactement le traitement attendu des 5 `plafond` mal typés (3 chaînes, 2 nulls JSON).
 * Les REJETS, eux, ne concernent que le volume : ils lèvent `LegacySourceError`.
 */

const glaMessageZod = z.object({
  who: z.string().catch(''),
  t: z.string().optional().catch(undefined),
  media: z.boolean().optional().catch(undefined),
  price: z.number().optional().catch(undefined),
})

/**
 * `plafond` n'est volontairement PAS lu : la preuve du plafonnement est `total < Σaxes`
 * (cf. le commentaire de `capped` dans `transform.ts`), pas la reconstruction d'une règle serveur
 * qui a changé en cours de route.
 */
export const glaScoreZod = z.object({
  total: z.number().optional().catch(undefined),
  objectif_atteint: z.boolean().optional().catch(undefined),
  commentaire: z.string().optional().catch(undefined),
})

export const glaBossDetailZod = z.object({
  fan: z.string().optional().catch(undefined),
  total: z.number().optional().catch(undefined),
  commentaire: z.string().optional().catch(undefined),
})

/** Objet JSON, ou `{}` — jamais `null`, jamais un tableau : le reste du code indexe librement. */
export const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/**
 * `created_ms` → ISO. TOUJOURS `to_timestamp(created_ms / 1000)`, JAMAIS `date_label` : ce dernier
 * est écrit avec `time.strftime` sur un serveur en UTC alors que nous calculons tout en
 * Europe/Paris. 774 sessions sur 17 260 changent de jour civil et 99 de semaine ISO — `active_days`
 * faux, `streak_days` faux, classement hebdo faux. Son format est propre (`JJ/MM/AAAA HH:MM` sur
 * 17 258/17 258) : c'est précisément ce qui le rend piégeux.
 */
export function isoFromCreatedMs(v: string | number | null): string | null {
  const ms = typeof v === 'string' ? Number(v) : v
  if (ms == null || !Number.isFinite(ms)) return null
  if (ms < LIMITS.minCreatedMs || ms > Date.now() + LIMITS.futureToleranceMs) return null
  return new Date(ms).toISOString()
}

/** `who = 'me'` → le CHATTEUR (il joue la créatrice) · `who = 'them'` → le FAN. Contre-intuitif. */
export function speakerOf(who: string): 'chatter' | 'fan' | null {
  if (who === 'me') return 'chatter'
  if (who === 'them') return 'fan'
  return null
}

export interface ThreadMessagesCtx {
  glaId: string
  sessionId: string
  threadId: string
  /** Position DU FIL — elle entre dans l'UUID v5 des messages. */
  position: number
  history: unknown
  /** L'instant de la session : GLA n'horodate aucun message, tous portent le même. */
  at: string
  messageId: (glaId: string, position: number, index: number) => string
  /** Compteur de poids cumulé de l'import — lève au-delà de la borne. */
  spend: (chars: number, glaId: string) => void
}

/**
 * Les messages d'un fil, plus le nombre de tours joués par le chatteur (`turns_used`, NOT NULL et
 * sans valeur source). Les messages « média » comptent : ils sont tous `who = 'me'`.
 */
export function buildThreadMessages(ctx: ThreadMessagesCtx): { rows: LegacyMessageRow[]; turns: number } {
  if (!Array.isArray(ctx.history)) return { rows: [], turns: 0 }
  if (ctx.history.length > LIMITS.messagesPerThread) {
    throw new LegacySourceError(`${ctx.history.length} messages dans un fil (plafond ${LIMITS.messagesPerThread})`, ctx.glaId)
  }
  const rows: LegacyMessageRow[] = []
  let turns = 0
  ctx.history.forEach((el, i) => {
    const parsed = glaMessageZod.safeParse(el)
    if (!parsed.success) return
    const speaker = speakerOf(parsed.data.who)
    if (!speaker) return
    const isMedia = parsed.data.media === true || (parsed.data.t === undefined && parsed.data.price !== undefined)
    let body: string
    let mediaPrice: number | null = null
    if (isMedia) {
      // 2 581 messages « média » n'ont PAS de champ `t` (0/2 581) → `length ≥ 1` violé. Corps
      // SYNTHÉTISÉ dans la forme EXACTE que l'application écrit nativement
      // (`features/training-session/actions.ts:109`) : une session importée et une session jouée
      // ici doivent être indiscernables à l'écran. 196 médias gratuits → « … — 0 € ».
      // Le seul prix non entier du corpus (8,5 €) est arrondi à 9 : la colonne est un `integer`.
      mediaPrice = clampInt(parsed.data.price, 0, LIMITS.mediaPriceMax, 0)
      body = `Média verrouillé — ${mediaPrice} €`
    } else {
      body = parsed.data.t ?? ''
      if (body.length === 0) return // 0 message texte vide côté GLA — garde défensive
      if (body.length > LIMITS.bodyChars) {
        throw new LegacySourceError(`corps de ${body.length} caractères (plafond ${LIMITS.bodyChars})`, ctx.glaId)
      }
    }
    ctx.spend(body.length, ctx.glaId)
    rows.push({
      id: ctx.messageId(ctx.glaId, ctx.position, i),
      session_id: ctx.sessionId,
      // NOT NULL même si redondant avec `thread_id` : dénormalisation voulue (RLS à un niveau).
      thread_id: ctx.threadId,
      // L'INDEX dans le tableau, seul porteur de la chronologie — GLA n'horodate aucun message.
      position: i,
      speaker,
      body,
      media_price: mediaPrice,
      // EXPLICITEMENT posé : le défaut `now()` viderait tous les corps à l'affichage
      // (`get-session.ts:138` rend `''` tant que `visible_at > revealNow`) — une transcription
      // entièrement blanche, sans la moindre erreur.
      visible_at: ctx.at,
      created_at: ctx.at,
    })
    if (speaker === 'chatter') turns += 1
  })
  return { rows, turns }
}
