import type { ScoreMoment } from '@/lib/ai/schema'
import type { CaseKind, CaseSnapshot, MessageSpeaker, SessionStatus, ThreadStatus } from '@/lib/types/training'
import type { PublicBossFan } from '@/lib/types/training-public'

/**
 * Vue d'une session d'entraînement telle qu'elle traverse le réseau (Server Component → feuille
 * client, retours de Server Actions). AUCUN secret : ni `fan_brief`, ni la consigne de notation ;
 * `expected` n'est renseigné qu'APRÈS la notation d'un solo (révélation, cf. get-session).
 */

export interface SessionMessage {
  id: string
  threadId: string
  position: number
  speaker: MessageSpeaker
  body: string
  mediaPrice: number | null
  visibleAt: string
}

export interface AxisScore {
  key: string
  name: string
  score: number
}

export interface ThreadScore {
  total: number
  objectiveReached: boolean
  capped: boolean
  comment: string
  moments: ScoreMoment[]
  axes: AxisScore[]
}

/**
 * Le côté VISIBLE d'un fan du boss — exactement la projection publique du catalogue, sans son `id`
 * (dans une session, le fan est identifié par son thread ; l'id du fan de référence n'a rien à
 * faire côté client). Dérivé de `PublicBossFan` pour que l'ajout d'un champ visible ne se fasse
 * jamais d'un seul côté.
 */
export type BossFanPublic = Omit<PublicBossFan, 'id'>

export interface SessionThread {
  id: string
  position: number
  fanName: string
  status: ThreadStatus
  lostReason: string | null
  turnsUsed: number
  maxTurns: number
  nextDueAt: string | null
  bossFan: BossFanPublic | null
  /** Média payant autorisé sur CETTE conv ? Miroir du `is_sale` que `buildFanSystem` utilise pour
   *  injecter (ou non) les règles de média payant dans le prompt du fan (GLA : `vente`). */
  isSale: boolean
  messages: SessionMessage[]
  score: ThreadScore | null
}

export interface SessionData {
  id: string
  profileId: string
  kind: CaseKind
  status: SessionStatus
  caseId: string
  moduleId: string
  snapshot: CaseSnapshot
  total: number | null
  objectiveReached: boolean | null
  startedAt: string
  endedAt: string | null
  threads: SessionThread[]
  /** « Ce qui était attendu » — révélé APRÈS notation (solo), sinon null. */
  expected: string | null
  /** Meilleur total des AUTRES sessions notées du chatter sur ce cas (record à battre), null si première fois. */
  previousBest: number | null
  report: { id: string; resolvedAt: string | null } | null
  /** Horloge serveur (ISO) : les timers client se calent dessus (révélation, chrono). */
  serverNow: string
}

export interface SendResult {
  chatter: SessionMessage
  /** Le fan répond TOUJOURS quand `sendMessage` réussit (une panne IA annule le tour et lève). */
  fan: SessionMessage
  thread: { status: ThreadStatus; lostReason: string | null; turnsUsed: number; nextDueAt: string | null }
  sessionStatus: SessionStatus
  sessionEnded: boolean
  serverNow: string
}
