'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { type ButtonProps } from '@/components/ui/button'
import { addCandidateToCrm } from '../actions'

/**
 * « Intégrer » — crée le compte du candidat, en UN clic.
 *
 * Il y avait ici un dialog repris du CRM Good Luck Agency, où « Intégrer » présentait la liste des
 * modèles en boutons (`index.html:2313-2321`), le clic posant le rattachement ET la date du jour
 * (`serveur.py:1117-1123`). Il est retiré (0147) : la modèle n'est presque jamais décidée à la
 * seconde où l'on intègre, et sa sortie de secours « Créer le compte sans rattacher » était devenue
 * le geste courant. Elle est maintenant le geste unique.
 *
 * Le compte est posé avec ce qu'on veut à chaque fois — rôle CHATTEUR, droits Entraînement +
 * Formation, « nouvel arrivant » et « en formation » : rien à saisir, l'e-mail et le nom viennent
 * du dossier. Le rattachement à une modèle se fera depuis Membres ou le board Organisation, et
 * c'est lui qui fera basculer la personne de « En formation » à « En agence » sur l'Overview.
 *
 * SANS CONFIRMATION, décidé en connaissance de cause (spec §4.2) : le clic crée un compte Auth,
 * qu'il faut aller supprimer depuis Membres s'il est parti tout seul. C'est le prix du « on intègre
 * direct » ; le toast dit en toutes lettres ce qui vient d'être fait.
 *
 * Rendu à la fois en bout de ligne dans la file et sur la fiche : mêmes props, même action. Un
 * candidat déjà membre n'affiche pas ce bouton (les appelants le masquent) et l'action le
 * refuserait de toute façon.
 */
export function IntegrateButton({
  candidateId,
  candidateName,
  label = 'Intégrer',
  ...props
}: {
  candidateId: string
  candidateName: string
  label?: string
} & Omit<ButtonProps, 'onClick' | 'children'>) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const submit = () =>
    start(async () => {
      const r = await addCandidateToCrm({ id: candidateId })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(`${candidateName} intégré — chatteur, en formation`)
      router.refresh()
    })

  return (
    <ActionButton size="sm" variant="outline" pending={pending} onClick={submit} {...props}>
      <UserPlus className="size-3.5" /> {label}
    </ActionButton>
  )
}
