'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Link2, Lock, Trash2, Unlock, X } from 'lucide-react'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { blockCandidate, deleteCandidate, reviewCandidate, unblockCandidate } from '../actions'
import type { CandidateFileData } from '../types'

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
 * pourra repasser le test un jour, le troisième est définitif.
 */
export function CandidateActions({ candidate }: { candidate: CandidateFileData }) {
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

      {candidate.blocked ? (
        <ConfirmDialog
          trigger={
            <Button type="button" size="sm" variant="outline">
              <Unlock className="size-4" /> Débloquer
            </Button>
          }
          title={`Débloquer ${fullName} ?`}
          description="Retire toutes les entrées de la liste de blocage qui le visent (navigateur, e-mail, Discord, IP). Il pourra repasser le test."
          confirmLabel="Débloquer"
          destructive={false}
          onConfirm={confirmed(() => unblockCandidate({ id: candidate.id }), 'Candidat débloqué')}
        />
      ) : (
        <ConfirmDialog
          trigger={
            <Button type="button" size="sm" variant="outline">
              <Lock className="size-4" /> Bloquer
            </Button>
          }
          title={`Bloquer ${fullName} ?`}
          description="Ajoute son navigateur, son e-mail, son Discord et son IP à la liste de blocage. L’IP peut être partagée (4G, box familiale) : d’autres candidats derrière la même connexion seront bloqués aussi."
          confirmLabel="Bloquer"
          destructive={false}
          onConfirm={confirmed(() => blockCandidate({ id: candidate.id }), 'Candidat bloqué')}
        />
      )}

      <ConfirmDialog
        trigger={
          <Button type="button" size="sm" variant="ghost" className="text-muted-foreground">
            <Trash2 className="size-4" /> Supprimer
          </Button>
        }
        title={`Supprimer le dossier de ${fullName} ?`}
        description="Le dossier (identité, scores, verdict) est effacé définitivement. La conversation et le coût IA de la tentative restent, ainsi que la liste de blocage — débloque-le AVANT si tu veux qu’il repasse le test."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          const res = await deleteCandidate({ id: candidate.id })
          if (!res.success) return res.error
          toast.success('Dossier supprimé')
          router.replace('/formation/recrutement')
        }}
      />
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
