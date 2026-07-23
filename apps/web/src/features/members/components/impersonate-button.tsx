'use client'

import { useState, useTransition } from 'react'
import { Eye } from 'lucide-react'
import { toast } from 'sonner'
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
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { startImpersonation } from '@/lib/impersonation/actions'

/**
 * Déclencheur « consulter en tant que » (colonne Actions de Membres, admin uniquement — la
 * visibilité est gérée par l'appelant via `isImpersonatable(role brut)`).
 *
 * `startImpersonation` ne redirige PAS côté serveur (le swap de session casserait une
 * navigation RSC — « unexpected response »). Sur succès, on fait une **navigation DURE**
 * (`window.location`) : le navigateur recharge `/` avec la session de la cible (robuste,
 * comme un refresh). Sur échec, `ActionResult { success: false }` (jamais un throw) → toast.
 */
export function ImpersonateButton({
  memberId,
  memberName,
}: {
  memberId: string
  memberName: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const confirm = () => {
    startTransition(async () => {
      const res = await startImpersonation(memberId)
      if (res.success) {
        // Navigation DURE (pas router.push) : la session vient de changer → une soft-nav RSC
        // échoue. Le navigateur recharge `/` avec la session de la cible.
        window.location.href = '/'
      } else {
        toast.error(res.error)
        setOpen(false)
      }
    })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        setOpen(next)
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`Consulter en tant que ${memberName}`}
        >
          <Eye className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Consulter en tant que {memberName} ?</AlertDialogTitle>
          <AlertDialogDescription>
            Tu verras l&apos;application avec les accès de {memberName} pendant 30 minutes. Le
            bandeau affiché permet de revenir à ta session à tout moment.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault() // garder le dialog ouvert pendant l'action
              confirm()
            }}
            disabled={pending}
          >
            {pending && <Spinner data-icon="inline-start" />}
            Consulter
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
