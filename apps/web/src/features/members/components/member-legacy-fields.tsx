'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
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
import type { MemberPanel } from '@/hooks/use-member-panel'
import { Skeleton } from '@/components/ui/skeleton'
import type { ActionResult } from '@/lib/actions'
import { releaseLegacyLogin, resyncLegacyAccount, unlinkLegacyAccount, unlockLegacyClaim } from '../actions-legacy'
import { MemberLegacySearch } from './member-legacy-search'
import type { LegacyAdminState } from '../legacy-link'

/**
 * Le bloc « Ancienne plateforme » du dialog Membre — le filet manuel (D7) : rattacher un ancien
 * login SANS mot de passe (pour les 36 comptes dont le mot de passe a été régénéré, et pour qui l'a
 * simplement oublié), resynchroniser, détacher, libérer, lever un verrou.
 *
 * ADMIN STRICT : le bloc n'est monté que pour un admin, et chaque action revérifie côté serveur
 * (`requireAdminProfileLive`). Le montage n'est pas la garde — il évite seulement de montrer à un
 * manager des boutons dont l'usage lui serait refusé, tard et mal.
 *
 * L'état arrive EN PROP, chargé par le dialog à l'ouverture de l'onglet (patron `MemberHistoryTab`
 * + `useMemberPanel`) : la fiche ne paie ni la lecture des tentatives ni celle du rattachement si
 * on ne la demande pas — et rien n'est déclenché pendant le rendu.
 */

const FR_DAY = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' })

export function MemberLegacyFields({
  profileId,
  panel,
  reload,
}: {
  profileId: string
  panel: MemberPanel<LegacyAdminState> | null
  /** Relance la lecture après une mutation — le même geste que l'ouverture. */
  reload: () => void
}) {
  if (!panel || panel.loading) return <Skeleton className="h-24 w-full" />
  if (panel.error) return <p className="text-sm text-red-600 dark:text-red-400">{panel.error}</p>
  const state = panel.data
  if (!state) return null

  return (
    <div className="flex flex-col gap-4">
      {state.locked && <LockedNotice profileId={profileId} attempts={state.failedAttempts} reload={reload} />}
      {state.claim == null || state.claim.detachedAt != null ? (
        <>
          {state.claim?.detachedAt && (
            <Detached
              profileId={profileId}
              loginDisplay={state.claim.loginDisplay}
              detachedAt={state.claim.detachedAt}
              reload={reload}
            />
          )}
          <MemberLegacySearch profileId={profileId} onDone={reload} />
        </>
      ) : (
        <Attached profileId={profileId} claim={state.claim} reload={reload} />
      )}
    </div>
  )
}

/** « Récupération bloquée » — la seule situation où quelqu'un de légitime reste coincé sans geste. */
function LockedNotice({ profileId, attempts, reload }: { profileId: string; attempts: number; reload: () => void }) {
  return (
    <Row
      title="Récupération bloquée"
      detail={`${attempts} tentatives échouées — le membre ne peut plus réclamer tant que le verrou tient.`}
    >
      <Act
        label="Débloquer"
        profileId={profileId}
        run={unlockLegacyClaim}
        reload={reload}
      />
    </Row>
  )
}

function Attached({
  profileId,
  claim,
  reload,
}: {
  profileId: string
  claim: NonNullable<LegacyAdminState['claim']>
  reload: () => void
}) {
  const done = claim.lastSyncAt != null
  return (
    <Row
      title={done ? `Rattaché à « ${claim.loginDisplay} »` : 'Récupération partielle'}
      detail={
        done
          ? `${FR_DAY.format(new Date(claim.lastSyncAt as string))} — ${claim.sessionsCount} sessions reprises.`
          : `« ${claim.loginDisplay} » — l’import n’a jamais été mené à son terme. Relancez « Resynchroniser » pour terminer.`
      }
    >
      <Act label="Resynchroniser" profileId={profileId} run={resyncLegacyAccount} reload={reload} />
      <Act
        label="Détacher"
        variant="outline"
        profileId={profileId}
        run={unlinkLegacyAccount}
        reload={reload}
        confirm={{
          title: `Détacher « ${claim.loginDisplay} » ?`,
          body: `Supprime les ${claim.sessionsCount} sessions reprises de l’ancienne plateforme. Les sessions jouées ici ne sont pas touchées. Le rattachement reste réservé à ce membre tant qu’il n’est pas libéré.`,
        }}
      />
    </Row>
  )
}

/** Détachement DOUX : l'identifiant reste réservé — le libérer est un geste séparé, et tracé. */
function Detached({
  profileId,
  loginDisplay,
  detachedAt,
  reload,
}: {
  profileId: string
  loginDisplay: string
  detachedAt: string
  reload: () => void
}) {
  return (
    <Row
      title={`Détaché le ${FR_DAY.format(new Date(detachedAt))}`}
      detail={`L’identifiant « ${loginDisplay} » reste réservé à ce membre : lui seul peut le re-réclamer. Le libérer le rend réclamable par n’importe qui.`}
    >
      <Act
        label="Libérer l’identifiant"
        variant="outline"
        profileId={profileId}
        run={releaseLegacyLogin}
        reload={reload}
        confirm={{
          title: `Libérer « ${loginDisplay} » ?`,
          body: 'N’importe quel membre pourra ensuite le réclamer. Le rattachement de ce membre disparaît du journal actif — la trace, elle, reste.',
        }}
      />
    </Row>
  )
}

function Row({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

/**
 * Un bouton = une Server Action `{ profileId }` → message. `confirm` ouvre un `AlertDialog` (patron
 * `impersonate-button`) : les deux gestes qui le portent sont destructifs et doivent DIRE ce qu'ils
 * détruisent, pas se contenter d'un « OK ? » de navigateur.
 */
function Act({
  label,
  profileId,
  run,
  reload,
  variant,
  confirm,
}: {
  label: string
  profileId: string
  run: (input: { profileId: string }) => Promise<ActionResult<string>>
  reload: () => void
  variant?: 'outline'
  confirm?: { title: string; body: string }
}) {
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)

  const fire = () =>
    start(async () => {
      try {
        const res = await run({ profileId })
        if (res.success) toast.success(res.data)
        else toast.error(res.error)
      } catch {
        // Échec de transport (dépassement de `maxDuration` sur un gros historique) : l'état est
        // lisible en base, et « Resynchroniser » le complète.
        toast.error('Opération interrompue — rechargez la fiche pour voir l’état réel.')
      }
      setOpen(false)
      reload()
    })

  const button = (
    <ActionButton type="button" size="sm" variant={variant} pending={pending} onClick={confirm ? undefined : fire}>
      {label}
    </ActionButton>
  )
  if (!confirm) return button

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirm.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Garder le dialog ouvert pendant l'action : un détachement dure quelques secondes.
              e.preventDefault()
              fire()
            }}
            disabled={pending}
          >
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
