'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import type { ButtonProps } from '@/components/ui/button'
import { addCandidateToCrm } from '../actions'

/**
 * « Ajouter au CRM » — crée le compte du candidat EN UN CLIC : e-mail du dossier, rôle chatteur,
 * droit Entraînement. Aucun formulaire : c'est justement la recopie manuelle qu'on supprime.
 *
 * Rendu à la fois en bout de ligne dans la liste et sur la fiche : mêmes props, même action.
 * Un candidat déjà membre n'affiche pas ce bouton (les appelants le masquent) et l'action le
 * refuserait de toute façon.
 */
export function AddToCrmButton({
  candidateId,
  label = 'Ajouter',
  ...props
}: { candidateId: string; label?: string } & Omit<ButtonProps, 'onClick' | 'children'>) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <ActionButton
      size="sm"
      variant="outline"
      pending={pending}
      {...props}
      onClick={() =>
        start(async () => {
          const r = await addCandidateToCrm({ id: candidateId })
          if (!r.success) {
            toast.error(r.error)
            return
          }
          toast.success('Compte créé — rôle chatteur, droit Entraînement')
          router.refresh()
        })
      }
    >
      <UserPlus className="size-3.5" /> {label}
    </ActionButton>
  )
}
