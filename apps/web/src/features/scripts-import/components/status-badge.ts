import { STATUS_COLORS } from '@/lib/status-color'
import type { ImportStatus } from '../rules'

/** Couleur du badge de statut d'un import — palette partagée de l'app (`lib/status-color`). */
export const STATUS_BADGE: Record<ImportStatus, string> = {
  prêt: STATUS_COLORS.info,
  'à corriger': STATUS_COLORS.warning,
  'envoi en cours': STATUS_COLORS.neutral,
  interrompu: STATUS_COLORS.danger,
  envoyé: STATUS_COLORS.positive,
  échec: STATUS_COLORS.danger,
}
