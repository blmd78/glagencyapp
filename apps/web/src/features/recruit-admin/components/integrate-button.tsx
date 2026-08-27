'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { Button, type ButtonProps } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { modelColor } from '@/lib/model-color'
import { cn } from '@/lib/utils'
import { addCandidateToCrm } from '../actions'
import type { CreatorChoice } from '../types'

/**
 * « Intégrer » — crée le compte du candidat ET le rattache à la modèle choisie, en un dialog.
 *
 * Reprise du CRM Good Luck Agency, où le bouton « Intégrer » d'un chatteur en formation ouvrait une
 * modale « Intégrer <login> à l'agence » présentant la liste des modèles en boutons
 * (`index.html:2313-2321`), le clic posant le rattachement ET la date du jour
 * (`serveur.py:1117-1123`). Même geste ici, à ceci près que la liste vient de `creators` et non
 * d'un tableau codé en dur.
 *
 * Le compte reste posé avec ce qu'on veut à chaque fois — rôle CHATTEUR, droits Entraînement +
 * Formation : rien à saisir, l'e-mail et le nom viennent du dossier.
 *
 * Pas de RHF ici (donc pas de `'use no memo'` à prévoir) : un choix unique dans une liste tient
 * dans un `useState`, et le formulaire n'a ni validation ni champ libre.
 *
 * Rendu à la fois en bout de ligne dans la file et sur la fiche : mêmes props, même action. Un
 * candidat déjà membre n'affiche pas ce bouton (les appelants le masquent) et l'action le
 * refuserait de toute façon.
 */
export function IntegrateButton({
  candidateId,
  candidateName,
  creators,
  label = 'Intégrer',
  ...props
}: {
  candidateId: string
  candidateName: string
  creators: CreatorChoice[]
  label?: string
} & Omit<ButtonProps, 'onClick' | 'children'>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [creatorId, setCreatorId] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // `creatorId` absent = création du compte SANS rattachement — l'ancien comportement du bouton
  // « Ajouter », conservé pour les cas où la modèle n'est pas encore décidée. L'action ne pose
  // alors pas de date : la personne entre au CRM mais reste en formation.
  const submit = (withCreator: string | null) =>
    start(async () => {
      const r = await addCandidateToCrm({ id: candidateId, ...(withCreator ? { creatorId: withCreator } : {}) })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      const on = withCreator ? creators.find((c) => c.id === withCreator)?.name : null
      toast.success(on ? `Intégré à l’agence sur ${on}` : 'Compte créé — rôle chatteur, droit Entraînement')
      setOpen(false)
      setCreatorId(null)
      router.refresh()
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setCreatorId(null)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" {...props}>
          <UserPlus className="size-3.5" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Intégrer {candidateName} à l’agence</DialogTitle>
          {/* Texte repris du legacy (`index.html:2321`), au mot près sur le fond. */}
          <DialogDescription>
            Choisis la modèle à laquelle rattacher ce chatter. Il passe en agence, avec la date d’aujourd’hui.
          </DialogDescription>
        </DialogHeader>

        {creators.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune modèle enregistrée — ajoute-la d’abord depuis Modèles.
          </p>
        ) : (
          <div className="flex max-h-72 flex-wrap gap-2 overflow-y-auto">
            {creators.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={pending}
                onClick={() => setCreatorId(c.id)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50',
                  creatorId === c.id ? 'border-foreground bg-accent font-medium' : 'hover:bg-accent',
                )}
              >
                <span aria-hidden className={cn('mr-2 inline-block size-2 rounded-full', modelColor(c.name))} />
                {c.name}
              </button>
            ))}
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          {/* Sortie de secours : le compte sans rattachement, l'ancien « Ajouter ». */}
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => submit(null)}>
            Créer le compte sans rattacher
          </Button>
          <ActionButton size="sm" pending={pending} disabled={!creatorId} onClick={() => submit(creatorId)}>
            Intégrer
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
