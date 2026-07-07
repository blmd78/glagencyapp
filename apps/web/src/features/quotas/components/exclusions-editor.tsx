'use client'

import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { ActionButton } from '@/components/action-button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { saveExclusions } from '../actions'
import type { ExclusionAccountRow } from '../types'

type Status = { kind: 'ok' | 'error'; message: string } | null

/**
 * Comptes inclus dans la LTV : checkbox par compte OF (creators.excluded, inversé).
 * COCHÉ = le compte est INCLUS dans le calcul LTV (page État de santé) ; décoché = exclu.
 * N'affecte QUE la LTV — CA global, totaux et pages Modèles/Chatteurs comptent tout.
 * Défaut (migration 0007) : tout coché sauf les comptes privés.
 */
export function ExclusionsEditor({ accounts }: { accounts: ExclusionAccountRow[] }) {
  const initial = React.useMemo(
    () => new Set(accounts.filter((a) => a.excluded).map((a) => a.creatorId)),
    [accounts],
  )
  // On ne stocke que le DIFF utilisateur (ids basculés vs serveur), pas une copie de
  // l'état serveur : une revalidation venue de l'autre éditeur de la page ne peut
  // donc pas écraser des cases modifiées mais non sauvegardées.
  const [toggled, setToggled] = React.useState<Set<string>>(new Set())
  const [status, setStatus] = React.useState<Status>(null)
  const [isPending, startTransition] = React.useTransition()

  const isExcludedNow = (id: string) =>
    toggled.has(id) ? !initial.has(id) : initial.has(id)

  const dirty = toggled.size > 0

  function toggle(id: string) {
    setToggled((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setStatus(null)
  }

  function handleSave() {
    const exclude = [...toggled].filter((id) => !initial.has(id)) // inclus → exclu
    const include = [...toggled].filter((id) => initial.has(id)) // exclu → inclus

    startTransition(async () => {
      const res = await saveExclusions({ exclude, include })
      if (res.success) setToggled(new Set()) // le serveur fait foi après un save réussi
      setStatus(
        res.success
          ? { kind: 'ok', message: 'Sauvegardé — la LTV se calcule sur les comptes cochés.' }
          : { kind: 'error', message: res.error },
      )
    })
  }

  const nExcluded = accounts.filter((a) => isExcludedNow(a.creatorId)).length

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-medium">Comptes inclus dans la LTV</h2>
        <p className="text-sm text-muted-foreground">
          Coché = le compte entre dans le calcul LTV (page État de santé). Décoche pour
          l&apos;exclure — le CA global et tous les autres chiffres comptent toujours tous les
          comptes. {nExcluded > 0 ? `${nExcluded} exclu(s).` : ''}
        </p>
      </div>

      <div className="rounded-xl border">
        {accounts.map((a) => {
          const isExcluded = isExcludedNow(a.creatorId)
          return (
            <label
              key={a.creatorId}
              className="flex cursor-pointer items-center justify-between gap-3 border-b px-4 py-2.5 last:border-b-0"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{a.name}</span>
                {a.isPrivate && (
                  <Badge variant="secondary" className="text-muted-foreground">
                    privé
                  </Badge>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    'text-xs',
                    isExcluded ? 'font-medium text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {isExcluded ? 'Exclu de la LTV' : 'Inclus'}
                </span>
                <Checkbox
                  checked={!isExcluded}
                  onCheckedChange={() => toggle(a.creatorId)}
                  disabled={isPending}
                />
              </span>
            </label>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <ActionButton variant="outline" onClick={handleSave} disabled={!dirty} pending={isPending}>
          Sauvegarder les exclusions
        </ActionButton>
        {status && (
          <p
            className={cn(
              'text-sm',
              status.kind === 'ok' ? 'text-muted-foreground' : 'text-destructive',
            )}
          >
            {status.message}
          </p>
        )}
      </div>
    </div>
  )
}
