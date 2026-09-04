import type { SlotKey } from '@glagency/core'

/** La ligne unique `mypuls_shift_settings` (id = 1). */
export interface ShiftSettings {
  idleMinutes: number
  breakMinutes: number
  coverageThreshold: number
  updatedAt: string
  updatedBy: string | null
}

/**
 * Une fenêtre de créneau telle qu'elle a RÉELLEMENT servi, sur une période donnée.
 *
 * Deux lignes pour un même créneau = la fenêtre a bougé chez MyPuls. C'est la seule trace :
 * MyPuls laisse modifier ces bornes dans un formulaire, sans en garder de version.
 */
export interface SlotWindow {
  slot: SlotKey
  /** Heure murale Paris, `HH:MM`. */
  startsAt: string
  endsAt: string
  firstDay: string
  lastDay: string
  days: number
}

/** Une ligne du journal des runs. */
export interface ShiftRunRow {
  id: number
  ranAt: string
  dayFrom: string
  dayTo: string
  status: 'ok' | 'echec'
  segments: number
  coverageRows: number
  unmatchedCount: number
  error: string | null
  /** Les réglages qui ont servi À CE RUN — un changement d'`idle` doit rester lisible ici. */
  idleMinutes: number
  coverageThreshold: number
}

/**
 * Un libellé MyPuls INCONNU du CRM : ni fiche `chatters`, ni compte. Personne ne sait qui c'est,
 * et son travail n'est rattaché à rien. Le geste est de le créer.
 */
export interface OrphanLabel {
  mypulsUserId: string
  chatterLabel: string
  days: number
  lastDay: string
  activeMinutes: number
  messages: number
}

/**
 * Un chatteur CONNU du CRM mais SANS COMPTE membre.
 *
 * Depuis 0144 il a sa ligne et son nom sur le relevé — c'est réglé. Ce qui lui manque est une
 * fiche d'activité et la possibilité d'être signalé : les deux exigent un `profiles`
 * (`police_entries.chatter_id` pointe sur `profiles` depuis 0078). Le geste est de lui ouvrir
 * un compte, pas de le créer.
 */
export interface ChatterWithoutAccount {
  chatterId: string
  mypulsUserId: string
  chatterLabel: string
  days: number
  lastDay: string
  activeMinutes: number
  messages: number
}

/** Un membre actif du CRM sans créneau attendu — donc jamais comparable à quoi que ce soit. */
export interface MemberWithoutShift {
  profileId: string
  memberName: string
  /** Rattaché à une ligne `chatters` ? Sinon MyPuls ne pourra jamais le reconnaître. */
  linked: boolean
}

/** Réponse brute de `mypuls_shift_settings_page` — castée explicitement depuis `Json`. */
export interface SettingsPageRpc {
  settings: ShiftSettings | null
  windows: SlotWindow[]
  runs: ShiftRunRow[]
  orphans: OrphanLabel[]
  noAccount: ChatterWithoutAccount[]
}

export interface ShiftSettingsPage {
  settings: ShiftSettings
  windows: SlotWindow[]
  runs: ShiftRunRow[]
  orphans: OrphanLabel[]
  noAccount: ChatterWithoutAccount[]
  noShift: MemberWithoutShift[]
  /** Période observée par les fenêtres et le bac d'orphelins. */
  from: string
  to: string
  /** L'appelant peut-il ÉCRIRE les réglages ? (admin — miroir de la policy de 0138) */
  canEdit: boolean
  /** Jours de la période sans aucun run `ok` — les trous du relevé. */
  missingDays: string[]
}
