/** Types du domaine « tracker de présence ». Aucune logique ici. */

export type TrackerEventType =
  | 'shift_start'
  | 'shift_end'
  | 'pause'
  | 'resume'
  | 'idle_start'
  | 'idle_end'
  | 'model'
  | 'focus'
  | 'heartbeat'

/**
 * Un événement tel que le domaine le consomme : camelCase, `meta` DÉJÀ désérialisé.
 * Le tracker d'origine lisait du SQLite et faisait `JSON.parse(ev.meta)` partout ; nous lisons du
 * `jsonb`, donc l'objet arrive prêt. Le mapping colonne→domaine vit dans la couche service.
 */
export interface TrackerEvent {
  type: TrackerEventType
  /** Horodatage POSTE (ISO UTC). Peut être faux si l'horloge du PC dérive. */
  at: string
  /** Horodatage SERVEUR de réception (ISO UTC) — seule base fiable pour l'état « en ligne ». */
  receivedAt?: string | null
  sessionId?: string | null
  machineId?: string | null
  meta?: Record<string, unknown> | null
}

export type SegmentKind = 'active' | 'pause' | 'idle'

export interface Segment {
  kind: SegmentKind
  start: number
  end: number
  /** Heure du `shift_start` du shift courant — permet de rattacher un shift de nuit à son jour. */
  shiftStart: number | null
}

export interface BuiltSegments {
  segments: Segment[]
  firstStart: number | null
  lastStop: number | null
  /** Le shift n'a jamais été clos et plus rien n'arrive : PC éteint ou app tuée. */
  crashed: boolean
  /** App fermée puis rouverte : clôture propre mais anormale. */
  recovered: boolean
  openShift: boolean
  eventCount: number
  sessions: string[]
}

export type LiveState = 'active' | 'pause' | 'idle'

export interface LiveStatus {
  state: LiveState
  since: number
}
