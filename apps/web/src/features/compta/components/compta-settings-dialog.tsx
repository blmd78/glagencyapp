'use client'

import { useState } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ComptaSettingsForm, ComptaPrimeForm } from './compta-settings-form'
import type { ComptaRow } from '../types'

/**
 * Réglages de paie d'UN chatteur, derrière un engrenage — ADMIN seul (`canConfigure` côté
 * appelant ; les verrous réels restent `adminGuard` + RLS `*_admin_write` dans `actions.ts`).
 *
 * Sortis du panneau déplié le 2026-07-27 (demande du propriétaire : « je pense qu'on peut mettre
 * un engrenage pour gérer les paramètres de chaque chatter pour simplifier l'affichage »). Ils y
 * vivaient dans une `CollapsibleSection` « Réglages de paie », qui obligeait à déplier la ligne
 * pour changer un taux — deux gestes, dans un panneau qu'on venait justement d'alléger.
 *
 * DEUX FORMULAIRES, DEUX BOUTONS « Enregistrer » — pas une fusion : `saveComptaSettings` écrit
 * `compta_settings`, `savePrime` écrit `compta_primes`, et une prime déjà versée est figée alors
 * que le taux reste éditable. Un seul bouton pour les deux aurait à décider quoi faire quand la
 * moitié de l'écriture est refusée.
 *
 * Le dialog NE SE REFERME PAS sur un enregistrement : refermer après le premier bouton perdrait
 * la saisie en cours dans l'autre formulaire. On sort par la croix ou Échap, comme partout.
 */
export function ComptaSettingsDialog({ row }: { row: ComptaRow }) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* Icône SEULE : sans `aria-label`, la table alignerait ~100 boutons indiscernables
            au lecteur d'écran. Le nom du chatteur y figure donc, comme sur les actions de
            `va-columns.tsx` / `members-table.tsx`. */}
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`Réglages de paie — ${row.name}`}
        >
          <Settings className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Réglages de paie — {row.name}</DialogTitle>
          <DialogDescription>
            Mode de rémunération, taux (ou fixe hebdo) et statut de setter, puis la prime nouveau
            chatteur. Chaque bloc s&apos;enregistre séparément.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <ComptaSettingsForm row={row} />
          <ComptaPrimeForm row={row} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
