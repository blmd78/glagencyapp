'use client'

import { useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CandidateRow } from '../types'

/**
 * « Ses réponses » — tout ce que le candidat a rempli au formulaire de fin du test : coordonnées,
 * âge, ville, shifts souhaités, et par qui il a connu l'agence.
 *
 * En MODALE depuis la liste : ces réponses ne servent qu'au moment où l'on décide quoi faire du
 * dossier, et ouvrir la fiche entière pour lire deux lignes coûtait une navigation. La fiche
 * continue de les afficher en clair, elle.
 *
 * `null` partout = dossier soumis AVANT l'ajout de ces questions (0127) : on l'écrit plutôt que
 * d'afficher cinq tirets qui ressembleraient à un bug.
 */
export function CandidateAnswers({ candidate }: { candidate: CandidateRow }) {
  const [open, setOpen] = useState(false)
  const vide =
    candidate.phone === null &&
    candidate.age === null &&
    candidate.location === null &&
    candidate.source === null &&
    !candidate.shifts?.length

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        title="Ce qu’il a rempli au formulaire de fin"
        aria-label={`Réponses de ${candidate.firstName} ${candidate.lastName}`}
      >
        <ClipboardList className="size-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>
              {candidate.firstName} {candidate.lastName}
            </DialogTitle>
            <DialogDescription>Ce qu’il a rempli à la fin du test</DialogDescription>
          </DialogHeader>

          {vide ? (
            <p className="text-sm text-muted-foreground">
              Ce dossier a été soumis avant l’ajout de ces questions au formulaire — aucune réponse
              n’a été enregistrée.
            </p>
          ) : (
            <dl className="flex flex-col gap-2.5 text-sm">
              <Row label="E-mail">{candidate.email}</Row>
              <Row label="Discord">{candidate.discord ?? '—'}</Row>
              <Row label="Téléphone">{candidate.phone ?? '—'}</Row>
              <Row label="Âge">{candidate.age !== null ? `${candidate.age} ans` : '—'}</Row>
              <Row label="Localisation">{candidate.location ?? '—'}</Row>
              <Row label="Shifts souhaités">{candidate.shifts?.length ? candidate.shifts.join(' · ') : '—'}</Row>
              <Row label="A connu l’agence via">{candidate.source ?? '—'}</Row>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3">
      <dt className="w-40 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium">{children}</dd>
    </div>
  )
}
