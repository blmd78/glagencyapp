'use client'

import { useState } from 'react'
import { frWeekdayDate } from '@glagency/core'
import { Input } from '@/components/ui/input'
import { ReportsMemberSelect } from './reports-member-select'
import { ReportForm } from './report-form'
import type { Report, ReportMember } from '../types'

/**
 * Vue interactive du Dashboard : header « Consulter [personne] · Jour [date] » + contenu du
 * jour sélectionné. Le jour est un état CLIENT (la fenêtre 30 j est déjà chargée → pas de
 * rechargement au changement de date). Le jour courant est éditable par son auteur ; tout
 * jour passé (ou consulté chez autrui) est en LECTURE SEULE.
 */
export function ReportsView({
  reports,
  members,
  target,
  today,
  minDay,
  canWrite,
  isSelf,
  targetName,
}: {
  reports: Report[]
  members: ReportMember[]
  target: string
  today: string
  /** Borne basse du sélecteur de date (fenêtre glissante, = aujourd'hui − 30 j). */
  minDay: string
  /** L'auteur peut rédiger SON CR du jour courant (vue « moi », hors superadmin). */
  canWrite: boolean
  isSelf: boolean
  targetName: string
}) {
  const [day, setDay] = useState(today)
  const current = reports.find((r) => r.day === day) ?? null
  const editable = canWrite && day === today

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {members.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Consulter :</span>
            <ReportsMemberSelect value={target} members={members} />
          </div>
        )}
        <div className="flex items-center gap-2">
          <label htmlFor="report-day" className="text-sm text-muted-foreground">
            Jour :
          </label>
          <Input
            id="report-day"
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
      </div>

      {!isSelf && (
        <p className="text-sm text-muted-foreground">
          Comptes rendus de <span className="font-medium text-foreground">{targetName}</span>
        </p>
      )}

      {editable ? (
        <ReportForm initialContent={current?.content ?? ''} />
      ) : current ? (
        <div className="rounded-xl border p-4 sm:p-5">
          <h2 className="mb-2 text-sm font-semibold capitalize text-muted-foreground">
            {frWeekdayDate(day)}
          </h2>
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
