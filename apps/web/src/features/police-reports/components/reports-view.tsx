'use client'

// Feuille client de la page Rapport — MIROIR de `police-view.tsx` (homogénéité de la section
// Police, audit 2026-08-06) : en-tête (titre + bascule Jour/Mois + sélecteur) avec GRISAGE de
// transition au changement de période, bouton de saisie à gauche, table en dessous. Coordonne
// aussi LA modal de saisie (une seule instance) entre le bouton « Ajouter un rapport » et les
// crayons de la table — « Modifier » ouvre la même modal, préchargée sur le modèle de la ligne
// (l'upsert étant keyé (auteur, modèle, jour), modifier = re-saisir SA fiche du soir).

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { UrlSelect } from '@/components/url-select'
import { PeriodToggle } from '@/components/period-toggle'
import { Button } from '@/components/ui/button'
import { ReportForm } from './report-form'
import { ReportTable } from './report-table'
import type { PoliceReport, ReportOption } from '../types'

export function ReportsView({
  models,
  reports,
  chattersByModel,
  canWrite,
  currentProfileId,
  vue,
  day,
  days,
  month,
  months,
}: {
  models: ReportOption[]
  reports: PoliceReport[]
  chattersByModel: Record<string, ReportOption[]>
  canWrite: boolean
  currentProfileId: string
  vue: 'jour' | 'mois'
  day: string
  days: { day: string; label: string }[]
  month: string
  months: { month: string; label: string }[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  // Sélecteurs pilotés par la vue (via `onSelect`) : elle pousse l'URL avec SA transition →
  // le grisage `pending` du bloc table, comme le Tracker. `replace` + `scroll: false`
  // (guidelines §6) : filtre d'URL, pas d'entrée d'historique.
  const selectPeriode = (param: 'day' | 'month') => (value: string) => {
    const next = new URLSearchParams(searchParams)
    next.set(param, value)
    startTransition(() => router.replace(`?${next.toString()}`, { scroll: false }))
  }

  const [formOpen, setFormOpen] = useState(false)
  // Modèle préchargé à l'ouverture : null = saisie vierge (bouton Ajouter), sinon le crayon
  // d'une ligne — le pré-remplissage de la fiche fait le reste dans le form.
  const [editCreatorId, setEditCreatorId] = useState<string | null>(null)
  // Saisie possible : écrivain ET vue jour (le mois = consultation pure, et l'upsert vise le
  // jour de l'en-tête — modifier un rapport d'un autre jour n'aurait pas de sens ici).
  const saisieJour = canWrite && vue === 'jour'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapport du soir</h1>
          <p className="text-sm text-muted-foreground">
            Chiffres du modèle et suivi individuel des chatters, un rapport par modèle et par soir.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <PeriodToggle vue={vue} />
          {vue === 'jour' ? (
            <UrlSelect
              param="day"
              value={day}
              options={days.map((d) => ({ value: d.day, label: d.label }))}
              onSelect={selectPeriode('day')}
              disabled={pending}
            />
          ) : (
            <UrlSelect
              param="month"
              value={month}
              options={months.map((m) => ({ value: m.month, label: m.label }))}
              onSelect={selectPeriode('month')}
              disabled={pending}
            />
          )}
        </div>
      </div>

      {saisieJour && (
        <div className="flex items-center">
          <Button
            type="button"
            className="gap-1.5"
            onClick={() => {
              setEditCreatorId(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" />
            Ajouter un rapport
          </Button>
          <ReportForm
            models={models}
            reports={reports}
            chattersByModel={chattersByModel}
            currentProfileId={currentProfileId}
            day={day}
            open={formOpen}
            onOpenChange={setFormOpen}
            initialCreatorId={editCreatorId}
          />
        </div>
      )}

      <div
        className={
          pending ? 'pointer-events-none opacity-40 transition-opacity' : 'transition-opacity'
        }
      >
        <ReportTable
          reports={reports}
          currentProfileId={currentProfileId}
          isMonth={vue === 'mois'}
          onEdit={
            saisieJour
              ? (creatorId) => {
                  setEditCreatorId(creatorId)
                  setFormOpen(true)
                }
              : undefined
          }
        />
      </div>
    </div>
  )
}
