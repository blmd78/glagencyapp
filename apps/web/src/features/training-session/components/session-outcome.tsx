import Link from 'next/link'
import type { Route } from 'next'
import { PlayButton } from '@/components/training/play-button'
import { Button } from '@/components/ui/button'
import type { SessionData } from '../types'

const STATUS_LABELS: Record<string, string> = { scored: 'notée', failed: 'ratée', abandoned: 'abandonnée', active: 'en cours' }

/** PROVISOIRE (remplacé par l'écran de résultat de la Task 9) : issue de la session, en une ligne. */
export function SessionOutcome({ data }: { data: SessionData }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm">
        Session {STATUS_LABELS[data.status] ?? data.status} — note {data.total ?? '—'}/100
      </p>
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/formation/modules/${data.snapshot.moduleCode}?vue=cas` as Route}>Retour au module</Link>
        </Button>
        <PlayButton caseId={data.caseId} label="Rejouer" />
      </div>
    </div>
  )
}
