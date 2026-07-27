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
import { ComptaSettingsForm } from './compta-settings-form'
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
 * UN SEUL FORMULAIRE, UN SEUL BOUTON « Enregistrer » depuis la tâche 16 (demande du
 * propriétaire) : c'étaient deux blocs à deux boutons, et rien à l'écran ne disait lequel
 * enregistrait quoi. Les deux Server Actions restent distinctes côté serveur
 * (`compta_settings` / `compta_primes`) ; c'est `ComptaSettingsForm` qui les enchaîne et
 * NOMME celle qui a échoué — un seul bouton ne doit pas pouvoir laisser croire qu'une écriture
 * refusée est passée.
 *
 * Le dialog NE SE REFERME PAS sur un enregistrement : le résultat (succès ou échec détaillé)
 * s'affiche dans le formulaire. On sort par la croix ou Échap, comme partout.
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
            Commission, fixe par période et prime nouveau chatteur. Le fixe s&apos;ajoute à la
            commission — il ne la remplace pas.
          </DialogDescription>
        </DialogHeader>

        <ComptaSettingsForm row={row} />
      </DialogContent>
    </Dialog>
  )
}
