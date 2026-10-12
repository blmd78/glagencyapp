'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { URGENCIES, URGENCY_LABEL, type Urgency } from '../urgency'

/**
 * Le choix de l'urgence (#160) — trois niveaux nommés, chacun avec la pastille de la couleur du
 * liseré de la carte (`.u-<niveau>` dans `tracker-theme.css`). Le `ToggleGroup` du kit, en choix
 * unique comme dans la fenêtre d'un événement Agence : il porte le clavier (flèches) et l'état
 * annoncé. Toujours un niveau : on ne peut pas tout désélectionner.
 */
export function UrgencyPicker({ value, onChange }: { value: Urgency; onChange: (u: Urgency) => void }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      className="urg justify-start"
      aria-label="Urgence"
      value={value}
      onValueChange={(v) => v && onChange(v as Urgency)}
    >
      {URGENCIES.map((u) => (
        <ToggleGroupItem key={u} value={u} className={`u-${u}`}>
          <span className="dot" aria-hidden />
          {URGENCY_LABEL[u]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
