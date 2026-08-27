import type { AppItem, LiveState, ShiftKey } from '@glagency/core'

/** Une pastille de la barre « en ligne maintenant ». */
export interface BoardLiveChip {
  profileId: string
  name: string
  state: LiveState
  /** Depuis quand, en ms epoch — `null` si l'instant est inconnu. */
  sinceMs: number | null
}

/** Une ligne de chatteur, repliée. Le contenu déplié est chargé à part (`getRowDetail`). */
export interface BoardRow {
  profileId: string
  name: string
  /** `off` = pas de shift en cours (le point est éteint). */
  state: LiveState | 'off'
  /** Minutes sur l'outil principal (`mypuls.app`) — LA métrique du board. */
  toolMinutes: number
  /** Minimum attendu sur le créneau (`tracker_rules.tool_min_minutes`). */
  toolMinMinutes: number
  activeMinutes: number
  /** Retard au premier pointage, en minutes ; `null` si dans les clous ou jamais lancé. */
  latenessMinutes: number | null
  /** Sous le minimum d'outil principal — c'est ce que le board appelle « à sanctionner ». */
  under: boolean
  crashed: boolean
  openShift: boolean
  launched: boolean
}

export interface BoardGroup {
  /** Nom du modèle travaillé, ou « Sans modèle ». */
  model: string
  rows: BoardRow[]
  underCount: number
}

export interface BoardData {
  /** Date Paris de FIN du créneau — la clé d'URL. */
  date: string
  shiftKey: ShiftKey
  shiftLabel: string
  shiftRange: string
  /** Modèles présents dans la fenêtre, pour le filtre. */
  models: string[]
  groups: BoardGroup[]
  live: BoardLiveChip[]
  /** Filtre modèle actif, tel que reçu de l'URL. */
  modelFilter: string | null
  /**
   * Instant du calcul. Lu UNE fois dans le service et transporté jusqu'au rendu : lire l'horloge
   * pendant le rendu est interdit (règle du React Compiler — un composant doit être idempotent),
   * et deux lectures donneraient deux « depuis quand » incohérents sur le même écran.
   */
  computedAtMs: number
}

/** Contenu déplié d'une ligne — chargé au premier `toggle`, jamais avec la page. */
export interface RowDetail {
  sites: AppItem[]
  /** Minutes non attribuées faute de focus — « non identifié » chez eux. */
  untrackedMinutes: number
  stats: {
    activeMinutes: number
    pauseMinutes: number
    idleMinutes: number
    toolMinutes: number
    startedAtMs: number | null
  }
  timeline: TimelineRow[]
}

export interface TimelineRow {
  kind: 'active' | 'pause' | 'idle'
  startMs: number
  endMs: number
  minutes: number
  /** Sites vus pendant la plage, dans l'ordre, avec leurs minutes. */
  sites: { label: string; minutes: number }[]
}
