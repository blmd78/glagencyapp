'use client'

import Link from 'next/link'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { CASE_KIND_LABELS } from '@/lib/types/training'
import { callAction } from '@/lib/actions-client'
import { endSession } from '../actions-lifecycle'
import type { SessionData, SessionThread } from '../types'

/**
 * En-tête de la session : le retour vers le module, le titre du cas, et UNE sortie — « Terminer »
 * (→ notation). `ConfirmDialog` garde le dialog ouvert sur erreur serveur.
 *
 * PLUS D'« ABANDONNER » depuis la limite d'essais (0161, décision Benoit 2026-09-14 : « il ne peut
 * pas abandonner et relancer, l'exercice doit aller au bout ») : une session lancée se termine, et
 * quitter la page ne la perd pas — « Jouer » la reprend.
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
  const s = data.snapshot
  const closed = threads.filter((t) => t.status !== 'open').length

  const end = async () => {
    const r = await callAction(endSession({ sessionId: data.id }))
    if (!r.success) {
      toast.error(r.error)
      return r.error
    }
    onEnded()
  }

  // Snapshot d'avant l'ajout de `sectionId` (sessions déjà en base) → `undefined` → repli module.
  const backQuery = s.sectionId ? `?competence=${s.sectionId}` : ''

  return (
    <div className="flex flex-col gap-3">
      {/* GLA (`index.html:1703-1705`) : « ← Retour aux cas » renvoie sur la liste d'où l'on vient —
          la COMPÉTENCE quand le cas en a une (`sous_cat` → `go3`), le module sinon. Le lien pointait
          sur `/formation/modules` (la liste des modules) : deux crans trop haut.
          Le littéral doit rester INLINE dans `href` — un `const` intermédiaire s'élargit en `string`
          et casse le typage `Route` (TS2769). */}
      <Link href={`/formation/modules/${s.moduleCode}${backQuery}`} className="gla-back w-fit">
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
