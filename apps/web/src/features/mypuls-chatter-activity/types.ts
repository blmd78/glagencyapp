import type { ChatterActivity } from '@glagency/mypuls/shifts'
import type { SlotKey } from '@glagency/core'

export interface ChatterCoverageDay {
  day: string
  slot: SlotKey
  coveragePct: number
  activeMinutes: number
  messages: number
  firstAt: string | null
  lastAt: string | null
}

/** Ce que la RPC `mypuls_shift_chatter` renvoie — la partie INGÉRÉE, toujours disponible. */
export interface ChatterStoredRpc {
  coverage: ChatterCoverageDay[]
  daysWorked: number
  activeMinutes: number
  messages: number
  models: { label: string; messages: number }[]
  /** Null = personne non rattachée à un compte MyPuls : pas de détail possible. */
  mypulsUserId: string | null
}

/**
 * Le détail minute par minute, lu EN DIRECT chez MyPuls à l'ouverture de la fiche.
 *
 * `status` plutôt qu'un simple `null` : « pas rattaché », « MyPuls injoignable » et « rien ce
 * jour-là » appellent trois phrases différentes à l'écran. Les confondre, c'est laisser croire
 * à une absence de travail là où il n'y a qu'une absence de mesure.
 */
export type LiveDetail =
  | { status: 'ok'; activity: ChatterActivity }
  | { status: 'non-rattache' }
  | { status: 'indisponible'; reason: string }

export interface ChatterActivityData {
  /** Seuil « poste tenu » en vigueur — jamais 80 en dur, sinon les deux écrans divergent. */
  threshold: number
  profileId: string
  memberName: string
  memberShift: SlotKey | null
  /** Jour consulté pour le détail minute par minute. */
  day: string
  /** Fenêtre des agrégats (le mois glissant). */
  from: string
  to: string
  /** Libellé de la période du header, affiché tel quel (« Septembre 2026 », « 1 – 3 sept »). */
  periodLabel: string
  dayOptions: { value: string; label: string }[]
  stored: ChatterStoredRpc
  live: LiveDetail
}
