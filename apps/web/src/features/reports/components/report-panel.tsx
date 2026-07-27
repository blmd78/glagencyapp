'use client'

import { useState } from 'react'
import { addDays, frWeekdayDate } from '@glagency/core'
import { Input } from '@/components/ui/input'
import { ReportForm } from './report-form'
import { REPORT_WINDOW_DAYS, type Report } from '../types'

/**
 * Comptes rendus d'UNE personne : sélecteur de jour + contenu du jour choisi. Le jour est un
 * état CLIENT (la fenêtre 30 j est déjà chargée → pas de rechargement au changement de date).
 * Le jour courant est éditable par son auteur ; tout jour passé (ou consulté chez autrui) est
 * en LECTURE SEULE. Extrait de l'ancien `reports-view.tsx` pour servir aussi bien à plat
 * qu'à l'intérieur d'un accordéon (`reports-members.tsx`).
 */
export function ReportPanel({
  reports,
  today,
  canWrite,
  /** Suffixe des `id`/`htmlFor` : plusieurs panneaux peuvent coexister dans la page. */
  idSuffix,
  nested = false,
  onSaved,
}: {
  reports: Report[]
  /** Jour métier Paris — vient du SERVEUR (fuseau) ; `minDay` s'en dérive ici, pure fonction. */
  today: string
  /** L'auteur peut rédiger SON CR du jour courant (hors superadmin). */
  canWrite: boolean
  idSuffix: string
  /** Rendu à l'intérieur d'un accordéon, dont le nom est déjà un `h2` → la date passe en `h3`. */
  nested?: boolean
  /** Appelé après un enregistrement réussi — sert à recharger `reports` quand ils viennent
   *  d'un état client que `revalidatePath` ne touche pas (cf. `report-form.tsx`). */
  onSaved?: () => void
}) {
  const minDay = addDays(today, -REPORT_WINDOW_DAYS)
  const [day, setDay] = useState(today)
  const current = reports.find((r) => r.day === day) ?? null
  const editable = canWrite && day === today
  const inputId = `report-day-${idSuffix}`
  // Pas de niveau sauté : `h2` à plat sous le `h1` de la page, `h3` sous le nom du panneau.
  const DayTitle = nested ? 'h3' : 'h2'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="text-sm text-muted-foreground">
          Jour :
        </label>
        <Input
          id={inputId}
          type="date"
          value={day}
          min={minDay}
          max={today}
          onChange={(e) => {
            if (e.target.value) setDay(e.target.value)
          }}
          className="h-9 w-40"
        />
      </div>

      {editable ? (
        <ReportForm initialContent={current?.content ?? ''} onSaved={onSaved} />
      ) : current ? (
        <div className="rounded-xl border p-4 sm:p-5">
          <DayTitle className="mb-2 text-sm font-semibold capitalize text-muted-foreground">
            {frWeekdayDate(day)}
          </DayTitle>
          <p className="whitespace-pre-wrap text-sm">{current.content}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucun compte rendu {day === today ? "aujourd'hui" : 'ce jour-là'}.
        </div>
      )}
    </div>
  )
}
