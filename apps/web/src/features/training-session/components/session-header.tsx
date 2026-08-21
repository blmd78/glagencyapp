'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { CASE_KIND_LABELS } from '@/lib/types/training'
import { abandonSession, endSession } from '../actions-lifecycle'
import type { SessionData, SessionThread } from '../types'

/**
 * En-tête de la session en cours : la consigne (contexte + objectif, repliable — ouverte en solo,
 * repliée en défi/boss où l'écran est déjà chargé) et les deux sorties : « Terminer » (→ notation)
 * et « Abandonner » (→ rien n'est noté). `ConfirmDialog` garde le dialog ouvert sur erreur serveur.
 */
export function SessionHeader({
  data,
  threads,
  onEnded,
}: {
  data: SessionData
  threads: SessionThread[]
  onEnded: () => void
}) {
  const router = useRouter()
  const s = data.snapshot
  const closed = threads.filter((t) => t.status !== 'open').length

  const end = async () => {
    const r = await endSession({ sessionId: data.id })
    if (!r.success) {
      toast.error(r.error)
      return r.error
    }
    onEnded()
  }
  const abandon = async () => {
    const r = await abandonSession({ sessionId: data.id })
    if (!r.success) {
      toast.error(r.error)
      return r.error
    }
    router.push('/formation/ma-formation')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{s.title}</h1>
          <p className="text-sm text-muted-foreground">
            {s.moduleTitle} · {CASE_KIND_LABELS[data.kind]} · difficulté {s.difficulty}/10
            {data.kind !== 'solo' && ` · ${closed}/${threads.length} conversations terminées`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm">
                Abandonner
              </Button>
            }
            title="Abandonner ?"
            description="Rien ne sera noté."
            confirmLabel="Abandonner"
            onConfirm={abandon}
          />
          <ConfirmDialog
            trigger={<Button size="sm">Terminer</Button>}
            title="Terminer la session ?"
            description="La notation démarre tout de suite."
            confirmLabel="Terminer"
            destructive={false}
            onConfirm={end}
          />
        </div>
      </div>
      <details open={data.kind === 'solo'} className="rounded-xl border p-4 text-sm">
        <summary className="cursor-pointer font-medium">La consigne</summary>
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Contexte</p>
            <p className="whitespace-pre-wrap">{s.context}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{s.objectiveLabel}</p>
            <p className="whitespace-pre-wrap">{s.objective}</p>
            {s.targetLine && <p className="mt-1 italic text-muted-foreground">{s.targetLine}</p>}
          </div>
        </div>
      </details>
    </div>
  )
}
