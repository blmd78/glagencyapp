'use client'

// Feuille client de la page Rapport — MIROIR de `police-view.tsx` (homogénéité de la section
// Police) : bouton de saisie à gauche, table en dessous. La PÉRIODE vient du datepicker global
// du header (2026-08-17, plus de bascule Jour/Mois — le h1 est immédiat dans `page.tsx`).
// Coordonne LA modal de saisie (une seule instance) entre le bouton « Ajouter un rapport » et
// les crayons de la table — « Modifier » ouvre la même modal, préchargée sur le (modèle, jour)
// de la ligne (l'upsert étant keyé (auteur, modèle, jour), modifier = re-saisir SA fiche).

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReportForm, type ReportTarget } from './report-form'
import { ReportTable } from './report-table'
import type { PoliceReport, ReportOption } from '../types'

export function ReportsView({
  models,
  reports,
  prefillReports,
  chattersByModel,
  canWrite,
  currentProfileId,
}: {
  models: ReportOption[]
  reports: PoliceReport[]
  prefillReports: PoliceReport[]
  chattersByModel: Record<string, ReportOption[]>
  canWrite: boolean
  currentProfileId: string
}) {
  const [formOpen, setFormOpen] = useState(false)
  // Cible préchargée à l'ouverture : null = saisie vierge (bouton Ajouter, jour = aujourd'hui),
  // sinon le (modèle, jour) du crayon d'une ligne — le pré-remplissage fait le reste dans le form.
  const [editTarget, setEditTarget] = useState<ReportTarget | null>(null)

  return (
    <div className="flex flex-col gap-6">
      {canWrite && (
        <div className="flex items-center">
          <Button
            type="button"
            className="gap-1.5"
            onClick={() => {
              setEditTarget(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" />
            Ajouter un rapport
          </Button>
          <ReportForm
            models={models}
            prefillReports={prefillReports}
            chattersByModel={chattersByModel}
            currentProfileId={currentProfileId}
            open={formOpen}
            onOpenChange={setFormOpen}
            initialTarget={editTarget}
          />
        </div>
      )}

      <ReportTable
        reports={reports}
        currentProfileId={currentProfileId}
        onEdit={
          canWrite
            ? (target) => {
                setEditTarget(target)
                setFormOpen(true)
              }
            : undefined
        }
      />
    </div>
  )
}
