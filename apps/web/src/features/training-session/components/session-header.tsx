'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { CASE_KIND_LABELS } from '@/lib/types/training'
import { abandonSession, endSession } from '../actions-lifecycle'
import type { SessionData, SessionThread } from '../types'

/**
 * En-tête de la session : le retour vers le module, le titre du cas, et les deux sorties —
 * « Terminer » (→ notation) et « Abandonner » (→ rien n'est noté). `ConfirmDialog` garde le dialog
 * ouvert sur erreur serveur.
 *
 * La consigne N'EST PLUS ICI : elle vit dans la colonne collante de gauche (`SessionContext`,
 * structure GLA). Repliée au-dessus du chat, elle était fermée et oubliée dès le premier message.
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
      <Link href="/formation/modules" className="gla-back w-fit">
        ← Retour aux cas
      </Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-[-0.3px]">{s.title}</h1>
          <p className="text-sm text-[var(--gla-muted)]">
            {s.moduleTitle} · {CASE_KIND_LABELS[data.kind]}
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
    </div>
  )
}
