'use client'

import { createContext, use, useId, useState, type ReactNode } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { callAction } from '@/lib/actions-client'
import { grantSelectedAttempts } from '../actions'
import { grantExtraInput, type GrantExtraValues } from '../schema'

/**
 * Sélection des niveaux à qui redonner des essais (demande Benoit, 2026-10-15 : « ouvrir un module
 * et, avec un switch, choisir ceux à qui on veut redonner, et aussi tout un module »). Un état
 * CLIENT partagé par la barre du haut du Parcours et les interrupteurs des lignes et des modules :
 * le Parcours reste rendu par le serveur, seuls les interrupteurs sont des îlots client qui lisent
 * ce contexte. La fiche est remontée à chaque chatteur (`key` dans `OverviewTemplate`) : la
 * sélection ne passe jamais d'un chatteur à l'autre.
 */
const Selection = createContext<{
  selected: ReadonlySet<string>
  setMany: (caseIds: readonly string[], on: boolean) => void
} | null>(null)

function useSelection() {
  const ctx = use(Selection)
  if (!ctx) throw new Error('GrantSelectionProvider manquant')
  return ctx
}

export function GrantSelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const setMany = (caseIds: readonly string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of caseIds) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  return <Selection value={{ selected, setMany }}>{children}</Selection>
}

/**
 * En tête du Parcours : « Sélectionner les bloqués » (raccourci), le nombre d'essais et « Redonner »
 * sur la sélection. Le `profileId` vient des props AU MOMENT de l'envoi, jamais d'un état de
 * formulaire : rien ne peut partir sur un autre chatteur.
 */
export function GrantSelectionBar({ profileId, lockedIds }: { profileId: string; lockedIds: string[] }) {
  'use no memo' // RHF : formState est un Proxy à abonnement, le React Compiler le figerait.
  const router = useRouter()
  const { selected, setMany } = useSelection()
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<GrantExtraValues>({ resolver: zodResolver(grantExtraInput), defaultValues: { extra: 1 } })

  const onSubmit = handleSubmit(async ({ extra }) => {
    const sent = [...selected]
    const r = await callAction(grantSelectedAttempts({ profileId, caseIds: sent, extra }))
    // Dans TOUS les cas : resynchroniser (en échec aussi, l'écriture a pu passer — réponse perdue) et
    // décocher ce qui est parti, pour qu'un second envoi soit un geste voulu, jamais un réflexe —
    // l'action n'est pas idempotente. Seulement ce qui est parti : ce qu'on a coché pendant l'envoi
    // reste coché.
    router.refresh()
    setMany(sent, false)
    if (!r.success) {
      toast.error(r.error)
      return
    }
    const n = Number(extra)
    const c = r.data.count
    toast.success(`${n} essai${n > 1 ? 's' : ''} redonné${n > 1 ? 's' : ''} sur ${c} niveau${c > 1 ? 'x' : ''}`)
    reset({ extra: 1 })
  })

  const count = selected.size
  return (
    <div className="flex flex-wrap items-center gap-2">
      {lockedIds.length > 0 && (
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setMany(lockedIds, true)}>
          Sélectionner les bloqués ({lockedIds.length})
        </Button>
      )}
      <form onSubmit={onSubmit} noValidate className="flex items-center gap-1">
        <Input
          type="number"
          min={1}
          max={20}
          aria-label="Essais à redonner sur chaque niveau sélectionné"
          title={errors.extra?.message}
          aria-invalid={!!errors.extra}
          disabled={isSubmitting}
          className="h-7 w-14 px-2 text-xs"
          {...register('extra', { valueAsNumber: true })}
        />
        <ActionButton
          type="submit"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          pending={isSubmitting}
          disabled={count === 0}
        >
          {count === 0
            ? 'Redonner à la sélection'
            : count === 1
              ? 'Redonner au niveau sélectionné'
              : `Redonner aux ${count} sélectionnés`}
        </ActionButton>
      </form>
    </div>
  )
}

/** L'interrupteur d'une ligne de niveau (seulement sur un niveau déjà joué — `CaseLine`). */
export function CaseSwitch({ caseId, title }: { caseId: string; title: string }) {
  const id = useId()
  const { selected, setMany } = useSelection()
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Sélectionner {title}
      </label>
      <Switch id={id} checked={selected.has(caseId)} onCheckedChange={(on) => setMany([caseId], on)} />
    </>
  )
}

/**
 * « Tout le module » / « Tout le chapitre » : allumé quand TOUS les niveaux déjà joués du bloc sont
 * sélectionnés ; le basculer les sélectionne ou les retire tous. En tête du contenu du bloc, pas
 * dans son titre : le titre est le bouton qui le déplie, un interrupteur ne peut pas s'y imbriquer.
 */
export function GroupSwitch({ caseIds, label, title }: { caseIds: string[]; label: string; title: string }) {
  const id = useId()
  const { selected, setMany } = useSelection()
  const all = caseIds.every((c) => selected.has(c))
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-2 text-xs text-muted-foreground">
      <label htmlFor={id}>
        {label}
        <span className="sr-only"> {title}</span>
      </label>
      <Switch id={id} checked={all} onCheckedChange={(on) => setMany(caseIds, on)} />
    </div>
  )
}
