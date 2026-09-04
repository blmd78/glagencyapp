import type { MypulsSegmentModel, SlotKey } from '@glagency/core'

/** Un segment renvoyé par `mypuls_shift_segments_range` — instants ISO. */
export interface RangeSegment {
  mypulsUserId: string
  /** `chatters.id` — la clé du relevé depuis 0144, présente sans compte membre. */
  chatterId: string | null
  profileId: string | null
  day: string
  startedAt: string
  endedAt: string
  activeMinutes: number
  messages: number
  models: MypulsSegmentModel[]
}

/** Une vacation prête à afficher. */
export interface VacationRow {
  key: string
  mypulsUserId: string
  chatterId: string | null
  /** Présent seulement pour qui a un compte membre — conditionne le lien vers la fiche. */
  profileId: string | null
  /** Nom du compte membre, sinon celui du chatteur, sinon l'id MyPuls. */
  name: string
  day: string
  startedAtMs: number
  endedAtMs: number
  activeMinutes: number
  messages: number
  models: MypulsSegmentModel[]
  segments: number
  /**
   * Créneau de rattachement, déduit de l'heure de DÉBUT.
   *
   * Déduit et non lu : une vacation n'est pas une ligne de couverture, elle peut chevaucher deux
   * créneaux (une soirée qui déborde sur le matin). On la range là où elle commence, ce qui est
   * la lecture naturelle — et on ne s'en sert JAMAIS pour un verdict : le verdict est celui de
   * MyPuls, sur le Relevé.
   */
  slot: SlotKey
}

export interface VacationsFilters {
  from: string
  to: string
  /** `chatters.id` du filtre — jamais un `profiles.id` (0144). */
  chatterId: string | null
  model: string | null
  slot: SlotKey | 'all'
}

export interface VacationsPage extends VacationsFilters {
  rows: VacationRow[]
  /** Chatteurs (`chatters`) proposés au filtre — ceux du périmètre de l'appelant. */
  chatterOptions: { id: string; name: string }[]
  /** Modèles observés sur la période, pour le filtre. */
  modelOptions: string[]
  /** Totaux des lignes AFFICHÉES (après filtres). */
  totals: { vacations: number; activeMinutes: number; messages: number }
  /** Nombre de jours réellement lus, après plafonnement (cf. `maxDays`). */
  daysRead: number
  /** Plafond appliqué — 1 jour sans chatteur choisi, 31 avec. */
  maxDays: number
  /** La plage demandée a-t-elle été rognée ? */
  clamped: boolean
  /** Aucun run réussi ne couvre la plage → on ne montre pas des zéros. */
  available: boolean
}
