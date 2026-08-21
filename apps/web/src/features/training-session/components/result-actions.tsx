'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { Button } from '@/components/ui/button'
import { PlayButton } from '@/components/training/play-button'
import type { SessionData } from '../types'
import { ReportDialog } from './report-dialog'

/** Rejouer / Recommencer (propriétaire), Retour au module, Signaler (session notée, propriétaire, une fois). */
export function ResultActions({ data, viewerIsOwner }: { data: SessionData; viewerIsOwner: boolean }) {
  const back = `/formation/modules/${data.snapshot.moduleCode}?vue=cas`
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm"><Link href={back as Route}>Retour au module</Link></Button>
      {viewerIsOwner && data.status === 'scored' && <ReportDialog sessionId={data.id} reported={!!data.report} />}
      {viewerIsOwner && <PlayButton caseId={data.caseId} label={data.status === 'scored' ? 'Rejouer' : 'Recommencer'} />}
    </div>
  )
}
