import { Badge } from '@/components/ui/badge'
import { SHIFT_LABEL, type CrmShift } from '@/lib/types/chatters'

/**
 * Badge de shift (matin/aprem/soir) d'un chatteur — le shift PRINCIPAL, porté par le MEMBRE
 * depuis 0099 (`profiles.shift`) ; les placements du board vivent ailleurs (0110).
 * Jumeau de `RoleBadge`/`TeamBadge` : source unique du rendu, `null` → ne rend rien (l'appelant
 * gère le placeholder).
 *
 * Volontairement en `outline` : le shift est une information de CRÉNEAU, pas un rôle. Le code
 * couleur de l'app (bleu chatter, vert encadrement, orange police, violet modèles) reste réservé
 * aux badges d'identité — un badge plein de plus sur la même ligne les mettrait en concurrence.
 * Le board Organisation, lui, distingue ses colonnes par un lavis de fond, pas par le badge.
 */
export function ShiftBadge({ shift }: { shift: CrmShift | null | undefined }) {
  if (!shift) return null
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {SHIFT_LABEL[shift]}
    </Badge>
  )
}
