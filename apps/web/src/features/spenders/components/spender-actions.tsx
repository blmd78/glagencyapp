'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, RotateCcw, Archive, ArchiveRestore, Pencil } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { ActionButton } from '@/components/action-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { cn } from '@/lib/utils'
import { STATUS_COLORS } from '@/lib/status-color'
import { addRelance, resetCompteur, setArchived, setCompteur } from '../actions'
import { useSpendersOptimistic } from './spenders-optimistic-context'
import { R_ALERTE, type SpenderRow } from '../types'

// username : sert aux messages d'erreur (toast) — le patch optimiste peut avoir sorti la
// ligne de la vue et démonté le composant cliqué avant la réponse serveur.
type Target = Pick<SpenderRow, 'creatorId' | 'fanId' | 'username'>

/** Crayon ADMIN : force la valeur du compteur R (correction / initialisation). */
function SetCompteurDialog({ spender }: { spender: SpenderRow }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(String(spender.compteurR))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const { apply } = useSpendersOptimistic()

  function submit() {
    const n = Number(value)
    if (!Number.isInteger(n) || n < 0 || n > 10) return setError('Entier entre 0 et 10')
    // Optimiste : badge à jour + dialog fermé immédiatement. L'erreur passe par un toast
    // (survit au démontage si la nouvelle valeur fait sortir la ligne de la vue).
    setError(null)
    setOpen(false)
    startTransition(async () => {
      apply({ type: 'set-compteur', creatorId: spender.creatorId, fanId: spender.fanId, value: n })
      try {
        const res = await setCompteur({ creatorId: spender.creatorId, fanId: spender.fanId, value: n })
        if (!res.success) toast.error(`${spender.username} : compteur non modifié — ${res.error}`)
      } catch {
        toast.error(`${spender.username} : erreur réseau — compteur non modifié`)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="size-6 text-muted-foreground" title="Forcer la valeur de R (admin)">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Compteur R — {spender.username}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            type="number"
            min={0}
            max={10}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Force R à cette valeur ; les prochaines relances reprennent à partir de là.
          </p>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <ActionButton pending={pending} onClick={submit} className="self-end">
            Enregistrer
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Compteur R{n} + bouton « + » pour incrémenter (1 relance/jour). Le « + » est désactivé
 * après la relance du jour (grisé). La sécurité RÉELLE contre le double-comptage est la
 * contrainte unique DB (spender, jour Paris) : un clic forcé/rejoué est rejeté par Postgres,
 * l'action renvoie « Déjà relancé aujourd'hui ». Caché à R10 (cycle fini) ou si archivé.
 */
export function RelanceCounter({
  spender,
  isAdmin,
  canWrite,
  withAdd = true,
  withEdit = true,
}: {
  spender: SpenderRow
  isAdmin?: boolean
  /** admin ou manager/sous-manager : peut remettre le compteur à zéro. Le chatteur non (0060). */
  canWrite?: boolean
  /** false = pas de bouton « + » (tracker : les cases R1→R10 font déjà le cochage). */
  withAdd?: boolean
  /** false = pas de crayon admin (Liste = pure consultation). */
  withEdit?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const { apply } = useSpendersOptimistic()
  const r = spender.compteurR
  const canRelance = !spender.archived && r < R_ALERTE
  const color = r >= R_ALERTE ? STATUS_COLORS.danger : r > 0 ? STATUS_COLORS.warning : STATUS_COLORS.neutral

  return (
    <div className="flex items-center justify-center gap-1.5">
      <Badge className={cn('tabular-nums', color)}>R{r}</Badge>
      {withEdit && isAdmin && <SetCompteurDialog spender={spender} />}
      {withAdd && canRelance && (
        <Button
          size="icon"
          variant="outline"
          className="size-6"
          disabled={spender.grise || pending}
          title={spender.grise ? 'Déjà relancé aujourd’hui' : `Enregistrer une relance (R${r + 1})`}
          onClick={() =>
            startTransition(async () => {
              // Optimiste : R+1 et grisé à l'instant du clic ; revert auto si refus,
              // erreur en toast (la ligne peut sortir de la vue au patch).
              apply({
                type: 'relance',
                creatorId: spender.creatorId,
                fanId: spender.fanId,
                at: new Date().toISOString(),
              })
              try {
                const res = await addRelance({
                  creatorId: spender.creatorId,
                  fanId: spender.fanId,
                  chatterId: spender.chatterId,
                })
                if (!res.success) toast.error(`${spender.username} : ${res.error}`)
              } catch {
                toast.error(`${spender.username} : erreur réseau — relance non enregistrée`)
              }
            })
          }
        >
          {pending ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />}
        </Button>
      )}
      {withEdit && canWrite && spender.conversionPending && !spender.archived && (
        <ResetButton target={spender} title="Le fan a reconverti — remettre le compteur à zéro" />
      )}
    </div>
  )
}

/** Bouton « Reset compteur » — proposé quand le fan a reconverti. */
export function ResetButton({ target, title }: { target: Target; title?: string }) {
  const [pending, startTransition] = useTransition()
  const { apply } = useSpendersOptimistic()
  return (
    <ActionButton
      size="icon"
      variant="ghost"
      pending={pending}
      className="size-6 text-muted-foreground"
      title={title ?? 'Remettre le compteur R à zéro'}
      onClick={() =>
        startTransition(async () => {
          // Optimiste : R0 immédiat ; revert auto si refus. Erreur en toast : le patch
          // (conversionPending:false) démonte CE bouton à l'instant du clic.
          apply({ type: 'reset', creatorId: target.creatorId, fanId: target.fanId })
          try {
            const res = await resetCompteur({ creatorId: target.creatorId, fanId: target.fanId })
            if (!res.success) toast.error(`${target.username} : compteur non remis à zéro — ${res.error}`)
          } catch {
            toast.error(`${target.username} : erreur réseau — compteur non remis à zéro`)
          }
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
  const { apply } = useSpendersOptimistic()
  const toggle = () =>
    startTransition(async () => {
      // Optimiste : la ligne change de vue immédiatement ; revert auto si refus. Erreur en
      // toast : ce bouton est démonté dès le patch (la ligne quitte la vue courante).
      apply({ type: 'archive', creatorId: target.creatorId, fanId: target.fanId, archived: !archived })
      try {
        const res = await setArchived({ creatorId: target.creatorId, fanId: target.fanId, archived: !archived })
        if (!res.success) {
          toast.error(`${target.username} : ${archived ? 'réactivation' : 'archivage'} refusé — ${res.error}`)
        }
      } catch {
        toast.error(`${target.username} : erreur réseau — ${archived ? 'réactivation' : 'archivage'} non enregistré`)
      }
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
