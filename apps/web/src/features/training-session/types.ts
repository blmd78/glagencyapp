import type { ScoreMoment } from '@/lib/ai/schema'
import type { CaseKind, CaseSnapshot, MessageSpeaker, SessionStatus, ThreadStatus } from '@/lib/types/training'

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

export interface BossFanPublic {
  name: string
  age: number | null
  job: string | null
  city: string | null
  color: string | null
  persona: string
}

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
  /** Meilleur total précédent du chatter sur ce cas (record ?), null si première fois. */
  previousBest: number | null
  report: { id: string; resolvedAt: string | null } | null
  /** Horloge serveur (ISO) : les timers client se calent dessus (révélation, chrono). */
  serverNow: string
}

export interface SendResult {
  chatter: SessionMessage
  fan: SessionMessage | null
  thread: { status: ThreadStatus; lostReason: string | null; turnsUsed: number; nextDueAt: string | null }
  sessionStatus: SessionStatus
  sessionEnded: boolean
  serverNow: string
}
