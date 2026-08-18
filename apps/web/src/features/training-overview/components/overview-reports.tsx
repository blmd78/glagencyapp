'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { frDateTimeParis } from '@glagency/core'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { rescoreSession, resolveReport } from '../actions'
import type { ReportRow } from '../types'

/**
 * Notes contestées par les chatters (`training_reports`) : les signalements EN ATTENTE d'abord —
 * c'est la file de travail de l'encadrant —, les traités repliés dans un `<details>`.
 * « Résolu » est ouvert à qui a le droit Suivi ; « Re-noter » (relance l'IA, coûte des tokens)
 * aux seuls admins, derrière une confirmation.
 */
export function OverviewReports({ reports, isAdmin }: { reports: ReportRow[]; isAdmin: boolean }) {
  const open = reports.filter((r) => !r.resolvedAt)
  const done = reports.filter((r) => r.resolvedAt)
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Signalements</h2>
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune note contestée en attente.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((r) => (
            <li key={r.id}>
              <ReportCard report={r} isAdmin={isAdmin} />
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <details className="rounded-xl border px-4 py-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">Traités ({done.length})</summary>
          <ul className="mt-3 flex flex-col gap-3">
            {done.map((r) => (
              <li key={r.id}>
                <ReportCard report={r} isAdmin={isAdmin} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function ReportCard({ report, isAdmin }: { report: ReportRow; isAdmin: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const markResolved = () =>
    startTransition(async () => {
      const res = await resolveReport({ reportId: report.id })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success('Signalement marqué résolu')
      router.refresh()
    })

  // ConfirmDialog : une string RENVOYÉE garde le dialog ouvert avec le message d'erreur.
  const rescore = async (): Promise<void | string> => {
    const res = await rescoreSession({ sessionId: report.sessionId })
    if (!res.success) return res.error
    toast.success(`Session re-notée : ${res.data.total}/100`)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {report.displayName} — {report.caseTitle}
          <span className="ml-2 tabular-nums text-muted-foreground">{report.total == null ? 'non notée' : `${report.total}/100`}</span>
        </p>
        <p className="text-sm tabular-nums text-muted-foreground">
          {frDateTimeParis(report.createdAt)}
          {report.resolvedAt && ` · traité le ${frDateTimeParis(report.resolvedAt)}`}
        </p>
      </div>
      <p className="whitespace-pre-line text-sm">{report.message}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          {/* `as Route` : typedRoutes n'accepte pas une chaîne interpolée sur un segment dynamique. */}
          <Link href={`/formation/session/${report.sessionId}` as Route}>Voir la session</Link>
        </Button>
        {!report.resolvedAt && (
          <ActionButton size="sm" pending={pending} onClick={markResolved}>
            Résolu
          </ActionButton>
        )}
        {isAdmin && (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm">
                Re-noter
              </Button>
            }
            title="Relancer la notation IA de cette session ?"
            description="La note sera recalculée par l’IA (appel facturé) et remplacera l’actuelle — records et statistiques du chatter suivront."
            confirmLabel="Re-noter"
            destructive={false}
            onConfirm={rescore}
          />
        )}
      </div>
    </div>
  )
}
