'use client'

import { useState, useTransition } from 'react'
import { Plus, RotateCcw, Archive, ArchiveRestore } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ActionButton } from '@/components/action-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { cn } from '@/lib/utils'
import { STATUS_COLORS } from '@/lib/status-color'
import { addRelance, resetCompteur, setArchived } from '../actions'
import { R_ALERTE, type SpenderRow } from '../types'

type Target = Pick<SpenderRow, 'creatorId' | 'fanId'>

/**
 * Compteur R{n} + bouton « + » pour incrémenter (1 relance/jour). Le « + » est désactivé
 * après la relance du jour (grisé). La sécurité RÉELLE contre le double-comptage est la
 * contrainte unique DB (spender, jour Paris) : un clic forcé/rejoué est rejeté par Postgres,
 * l'action renvoie « Déjà relancé aujourd'hui ». Caché à R10 (cycle fini) ou si archivé.
 */
export function RelanceCounter({ spender }: { spender: SpenderRow }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const r = spender.compteurR
  const canRelance = !spender.archived && r < R_ALERTE
  const color = r >= R_ALERTE ? STATUS_COLORS.danger : r > 0 ? STATUS_COLORS.warning : STATUS_COLORS.neutral

  return (
    <div className="flex items-center justify-center gap-1.5">
      <Badge className={cn('tabular-nums', color)}>R{r}</Badge>
      {canRelance && (
        <Button
          size="icon"
          variant="outline"
          className="size-6"
          disabled={spender.grise || pending}
          title={spender.grise ? 'Déjà relancé aujourd’hui' : `Enregistrer une relance (R${r + 1})`}
          onClick={() =>
            startTransition(async () => {
              const res = await addRelance({
                creatorId: spender.creatorId,
                fanId: spender.fanId,
                chatterId: spender.chatterId,
              })
              setError(res.success ? null : res.error)
            })
          }
        >
          <Plus className="size-3.5" />
        </Button>
      )}
      {spender.conversionPending && !spender.archived && (
        <ResetButton target={spender} title="Le fan a reconverti — remettre le compteur à zéro" />
      )}
      {error && <span className="text-[10px] text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}

/** Bouton « Reset compteur » — proposé quand le fan a reconverti. */
export function ResetButton({ target, title }: { target: Target; title?: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <ActionButton
      size="icon"
      variant="ghost"
      pending={pending}
      className="size-6 text-muted-foreground"
      title={title ?? 'Remettre le compteur R à zéro'}
      onClick={() =>
        startTransition(async () => {
          await resetCompteur({ creatorId: target.creatorId, fanId: target.fanId })
        })
      }
    >
      <RotateCcw className="size-3.5" />
    </ActionButton>
  )
}

/** Bouton archiver (avec confirmation) / désarchiver. */
export function ArchiveButton({ target, archived }: { target: Target; archived: boolean }) {
  const [pending, startTransition] = useTransition()
  const toggle = () =>
    startTransition(async () => {
      await setArchived({ creatorId: target.creatorId, fanId: target.fanId }, !archived)
    })

  if (archived) {
    return (
      <ActionButton size="sm" variant="ghost" pending={pending} onClick={toggle} className="gap-1.5">
        <ArchiveRestore className="size-3.5" />
        Réactiver
      </ActionButton>
    )
  }
  return (
    <ConfirmDialog
      title="Archiver ce spender ?"
      description="Il sortira de la file de relance. Tu pourras le réactiver depuis l’onglet Archive."
      confirmLabel="Archiver"
      destructive={false}
      onConfirm={toggle}
      trigger={
        <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" disabled={pending}>
          <Archive className="size-3.5" />
          Archiver
        </Button>
      }
    />
  )
}
