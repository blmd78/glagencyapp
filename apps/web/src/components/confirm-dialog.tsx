'use client'

import { useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/**
 * Confirmation obligatoire avant une action destructive (règle app : jamais de suppression
 * au clic direct). Reste ouvert avec un spinner pendant l'action.
 * `onConfirm` peut être asynchrone ; s'il **renvoie une string**, celle-ci est affichée comme
 * erreur et le dialog RESTE ouvert (échec serveur visible au lieu d'une fermeture silencieuse).
 * Renvoie `void` / rien → succès → fermeture.
 */
export function ConfirmDialog({
  trigger,
  open: openProp,
  onOpenChange,
  title = 'Confirmer la suppression ?',
  description = 'Cette action est définitive et ne peut pas être annulée.',
  confirmLabel = 'Supprimer',
  cancelLabel = 'Annuler',
  onConfirm,
  destructive = true,
}: {
  /** Déclencheur monté par le dialog. Omis quand l'ouverture est PILOTÉE par `open` — un item de
   *  menu déroulant ne peut pas servir de trigger : Radix démonte le menu à la sélection, et le
   *  dialog partirait avec lui. */
  trigger?: ReactNode
  /** Mode contrôlé : fourni, il pilote l'ouverture et `onOpenChange` doit l'accompagner. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title?: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | string | Promise<void | string>
  destructive?: boolean
}) {
  const [openState, setOpenState] = useState(false)
  // Contrôlé si `open` est fourni, autonome sinon — les deux usages coexistent dans l'app.
  const open = openProp ?? openState
  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setOpenState(v))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault() // garder le dialog ouvert pendant l'action
    setBusy(true)
    setError(null)
    try {
      const res = await onConfirm()
      if (typeof res === 'string') {
        setError(res) // échec → reste ouvert avec le message
        return
      }
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={busy}
            className={cn(destructive && 'bg-destructive text-white hover:bg-destructive/90')}
          >
            {busy && <Spinner data-icon="inline-start" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
