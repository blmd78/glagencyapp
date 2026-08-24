'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import { resyncLegacyAccount } from '../actions'
import type { LegacyClaimState } from '../types'
import { LegacyClaimDialog } from './legacy-claim-dialog'

/**
 * L'encart « Ancienne plateforme » de Ma formation — le SEUL point d'entrée de la reprise dans
 * toute l'application (pas de doublon sur Modules ni dans le menu). Droit requis :
 * `frm-entrainement`, porté par la page.
 *
 * TROIS ÉTATS, pas deux, et le troisième est celui qu'on oublie :
 *  · aucun rattachement (ou rattachement détaché) → l'appel « Vous veniez de l'ancienne
 *    plateforme ? » ;
 *  · rattaché ET synchronisé → la date et le nombre de sessions, plus « Resynchroniser » ;
 *  · rattaché SANS `lastSyncAt` → « Récupération interrompue ». Tant que c'est le cas,
 *    `sessionsCount` N'EST PAS AFFICHÉ (il ne veut rien dire) et le bouton dit « Reprendre ».
 *    Sans cet état, un import coupé s'annoncerait « repris — 0 sessions », ce qui est un mensonge.
 *
 * Design : le panneau du thème Formation (`gla-panel`), aucun ornement — bordure fonctionnelle et
 * hiérarchie par la typo.
 */

/** Hoisté : un `toLocaleDateString` avec options reconstruit un Intl.DateTimeFormat à chaque appel. */
const FR_DAY = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' })
const FR_NUM = new Intl.NumberFormat('fr-FR')

export function LegacyClaimCard({ claim }: { claim: LegacyClaimState | null }) {
  const [pending, start] = useTransition()

  // Un rattachement détaché par un admin remet l'encart en appel : la personne peut re-réclamer son
  // propre login (c'est une réparation), mot de passe à l'appui.
  if (!claim || claim.detachedAt) {
    return (
      <section className="gla-panel flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[15px] font-bold">Vous veniez de l’ancienne plateforme ?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Récupérez votre historique d’entraînement : vos sessions, vos scores et vos conversations.
          </p>
        </div>
        <LegacyClaimDialog trigger={<Button className="gla-btn border-0">Récupérer mon historique</Button>} />
      </section>
    )
  }

  const resync = () =>
    start(async () => {
      try {
        const res = await resyncLegacyAccount({})
        if (res.success) toast.success(res.data.message)
        else toast.error(res.error)
      } catch {
        // Échec de transport (dépassement de `maxDuration` sur un gros historique) : l'état est
        // récupérable et la page le dira au rechargement — « Récupération interrompue ».
        toast.error('Récupération interrompue — relancez pour terminer.')
      }
    })

  const done = claim.lastSyncAt != null
  return (
    <section className="gla-panel flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[15px] font-bold">
          {done ? 'Historique repris de l’ancienne plateforme' : 'Récupération interrompue'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {done ? (
            <>
              Compte «&nbsp;{claim.loginDisplay}&nbsp;» — {FR_DAY.format(new Date(claim.lastSyncAt as string))},{' '}
              <span className="font-medium tabular-nums text-foreground">
                {FR_NUM.format(claim.sessionsCount)} session{claim.sessionsCount > 1 ? 's' : ''}
              </span>
              .
            </>
          ) : (
            <>Votre historique n’est repris qu’en partie. Relancez pour terminer.</>
          )}
        </p>
      </div>
      <ActionButton
        variant="outline"
        pending={pending}
        disabled={claim.syncing}
        onClick={resync}
        className="shrink-0"
      >
        {claim.syncing ? 'Récupération en cours…' : done ? 'Resynchroniser' : 'Reprendre la récupération'}
      </ActionButton>
    </section>
  )
}
