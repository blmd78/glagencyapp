'use client'

import { useTransition } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toggleModule } from '../actions'
import { CasesTable } from './cases-table'
import type { CatalogCase, CatalogModule } from '../types'

/**
 * Panneau du module sélectionné : en-tête (emoji, titre, description, n axes / n sections),
 * Éditer (dialog, Task 8), Activer/Désactiver, Nouveau cas (dialog, Task 9), puis la table des cas.
 */
export function ModulePanel({
  module,
  onEdit,
  onCreateCase,
  onEditCase,
}: {
  module: CatalogModule
  onEdit: () => void
  onCreateCase: () => void
  onEditCase: (c: CatalogCase) => void
}) {
  const [pending, startTransition] = useTransition()
  const toggle = () =>
    startTransition(async () => {
      const res = await toggleModule({ id: module.id, active: !module.active })
      if (!res.success) toast.error(res.error)
    })

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            {module.emoji && <span aria-hidden>{module.emoji}</span>}
            <span className="truncate">{module.title}</span>
            {!module.active && <Badge variant="outline">inactif</Badge>}
          </h2>
          {module.description && <p className="text-sm text-muted-foreground">{module.description}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {module.axes.length === 0 ? 'Aucun axe de notation' : `${module.axes.length} axe${module.axes.length > 1 ? 's' : ''} de notation`}
            {' · '}
            {module.sections.length} section{module.sections.length > 1 ? 's' : ''}
            {' · '}
            {module.courseMd ? 'cours rédigé' : 'pas de cours'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>Éditer le module</Button>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={toggle}>
            {module.active ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {module.active ? 'Désactiver' : 'Activer'}
          </Button>
          <Button type="button" size="sm" onClick={onCreateCase}>Nouveau cas</Button>
        </div>
      </div>
      <CasesTable module={module} onEdit={onEditCase} />
    </section>
  )
}
