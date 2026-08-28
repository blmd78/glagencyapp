'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Link2, Lock, Trash2, Unlock, X } from 'lucide-react'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { blockCandidate, deleteCandidate, reviewCandidate, unblockCandidate } from '../actions'
import type { CandidateCommand } from '../types'

/**
 * Bouton « Copier le lien du test ». L'URL est construite au CLIC depuis `window.location.origin` :
 * jamais de domaine en dur (le lien doit être bon en prod, en préprod et en local, et un lien de
 * recrutement pointant sur la mauvaise instance est un dégât silencieux).
 */
export function CopyTestLink() {
  const copy = async () => {
    const url = `${window.location.origin}/postuler`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Lien copié', { description: url })
    } catch {
      // Presse-papiers refusé (permission, contexte non sécurisé) : on montre le lien à copier.
      toast.error('Copie impossible — copie le lien à la main', { description: url })
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
      <Link2 className="size-4" /> Copier le lien du test
    </Button>
  )
}

/**
 * Actions d'un dossier. Valider / Refuser sont RÉVERSIBLES (un clic, pas de confirmation) ; bloquer,
 * débloquer et supprimer passent par une confirmation — les deux premiers décident si quelqu'un
 * pourra repasser le test un jour, le troisième efface le dossier.
 *
 * Bloquer et Débloquer NE SONT PAS exclusifs, parce que la blocklist mélange deux choses : le
 * blocage AUTOMATIQUE posé à chaque soumission (anti-repasse, `created_by` null) et le blocage
 * ADMIN. Le cas nominal — un candidat qui vient de passer le test — affiche donc LES DEUX :
 * « Bloquer » (qui ajoute l'IP et marque la décision d'agence) et « Débloquer » (qui l'autorise à
 * repasser le test). Ne prend que les champs dont il se sert : le dossier entier ferait voyager la
 * transcription et l'IP une seconde fois dans le payload RSC.
 */
export function CandidateActions({
  candidate,
  isAdmin,
}: {
  candidate: CandidateCommand
  /**
   * Bloquer, débloquer et supprimer un dossier restent ADMIN. Un encadrant « Suivi » traite les
   * dossiers (valider, refuser, intégrer) mais n'écarte pas quelqu'un définitivement ni n'efface
   * une trace. Masquer ici n'est qu'une politesse : `requireAdminProfileLive()` refuse ces trois
   * actions de toute façon (actions.ts:90, :131, :176).
   */
  isAdmin: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const fullName = `${candidate.firstName} ${candidate.lastName}`

  const review = (status: 'valide' | 'refuse') =>
    startTransition(async () => {
      const res = await reviewCandidate({ id: candidate.id, status })
      if (!res.success) toast.error(res.error)
      else toast.success(status === 'valide' ? 'Candidat validé' : 'Candidat refusé')
    })

  /** ConfirmDialog : une string RETOURNÉE laisse le dialog ouvert avec le message d'erreur. */
  const confirmed = (run: () => Promise<{ success: boolean; error?: string }>, ok: string) => async () => {
    const res = await run()
    if (!res.success) return res.error ?? 'Erreur'
    toast.success(ok)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionButton
        type="button"
        size="sm"
        variant={candidate.status === 'valide' ? 'secondary' : 'default'}
        pending={pending}
        disabled={candidate.status === 'valide'}
        onClick={() => review('valide')}
      >
        <Check className="size-4" /> Valider
      </ActionButton>
      <ActionButton
        type="button"
        size="sm"
        variant="outline"
        pending={pending}
        disabled={candidate.status === 'refuse'}
        onClick={() => review('refuse')}
      >
        <X className="size-4" /> Refuser
      </ActionButton>

      {isAdmin && !candidate.blockedByAdmin && (
        <ConfirmDialog
          trigger={
            <Button type="button" size="sm" variant="outline">
              <Lock className="size-4" /> Bloquer
            </Button>
          }
          title={`Bloquer ${fullName} ?`}
          description="Ajoute son navigateur, son e-mail, son Discord et son IP à la liste de blocage — c’est la décision d’agence « celui-là, plus jamais ». L’IP peut être partagée (4G, box familiale) : d’autres candidats derrière la même connexion seront bloqués aussi."
          confirmLabel="Bloquer"
          destructive={false}
          onConfirm={confirmed(() => blockCandidate({ id: candidate.id }), 'Candidat bloqué')}
        />
      )}
      {isAdmin && candidate.hasBlocklistLines && (
        <ConfirmDialog
          trigger={
            <Button type="button" size="sm" variant="outline">
              <Unlock className="size-4" /> Autoriser à repasser
            </Button>
          }
          title={`Autoriser ${fullName} à repasser le test ?`}
          description="Retire les entrées de la liste de blocage qui le visent — celle posée automatiquement à sa soumission (un seul essai) comme un éventuel blocage manuel. Son prochain dossier sera marqué « 2ᵉ passage »."
          confirmLabel="Débloquer"
          destructive={false}
          onConfirm={confirmed(() => unblockCandidate({ id: candidate.id }), 'Candidat débloqué')}
        />
      )}

      {isAdmin && (
      <ConfirmDialog
        trigger={
          <Button type="button" size="sm" variant="ghost" className="text-muted-foreground">
            <Trash2 className="size-4" /> Supprimer
          </Button>
        }
        title={`Supprimer le dossier de ${fullName} ?`}
        description="Supprime le dossier candidat (identité, scores, verdict). La tentative et sa transcription sont conservées — elles portent le coût IA —, ainsi que l’éventuel blocage : autorise-le à repasser AVANT si c’est ce que tu veux."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          const res = await deleteCandidate({ id: candidate.id })
          if (!res.success) return res.error
          toast.success('Dossier supprimé')
          router.replace('/formation/recrutement')
        }}
      />
      )}
    </div>
  )
}

/** Copie une valeur technique (device, IP) dans le presse-papiers — pastille discrète de la fiche. */
export function CopyValue({ value, label }: { value: string; label: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copié`)
    } catch {
      toast.error('Copie impossible')
    }
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6 text-muted-foreground"
      aria-label={`Copier ${label}`}
      onClick={() => void copy()}
    >
      <Copy className="size-3" />
    </Button>
  )
}
