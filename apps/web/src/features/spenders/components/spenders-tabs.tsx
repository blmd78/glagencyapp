'use client'

import { useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { TriangleAlert } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { STATUS_COLORS } from '@/lib/status-color'
import { SpendersTable } from './spenders-table'
import { RelanceButton, ResetButton, ArchiveButton } from './spender-actions'
import { isARelancer, R_ALERTE, type SpenderRow } from '../types'

/** Colonne d'action du tracker : Relancer (+ Reset proposé si le fan a reconverti). */
const relanceAction: ColumnDef<SpenderRow> = {
  id: 'action',
  header: '',
  cell: ({ row }) => (
    <div className="flex items-center justify-end gap-1">
      {row.original.conversionPending && <ResetButton target={row.original} />}
      <RelanceButton spender={row.original} />
    </div>
  ),
  meta: { align: 'right' },
}

/** Colonne d'action des alertes R10 : Reset (si reconverti) + Archiver. */
const alerteAction: ColumnDef<SpenderRow> = {
  id: 'action',
  header: '',
  cell: ({ row }) => (
    <div className="flex items-center justify-end gap-1">
      {row.original.conversionPending && <ResetButton target={row.original} />}
      <ArchiveButton target={row.original} archived={false} />
    </div>
  ),
  meta: { align: 'right' },
}

/** Colonne d'action de l'archive : Réactiver. */
const archiveAction: ColumnDef<SpenderRow> = {
  id: 'action',
  header: '',
  cell: ({ row }) => (
    <div className="flex justify-end">
      <ArchiveButton target={row.original} archived />
    </div>
  ),
  meta: { align: 'right' },
}

export function SpendersTabs({ spenders }: { spenders: SpenderRow[] }) {
  const [tab, setTab] = useState('liste')

  const groups = useMemo(() => {
    const actifs = spenders.filter((s) => !s.archived)
    return {
      liste: actifs,
      tracker: actifs.filter(isARelancer),
      alertes: actifs.filter((s) => s.compteurR >= R_ALERTE),
      archive: spenders.filter((s) => s.archived),
    }
  }, [spenders])

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-4">
      <TabsList>
        <TabsTrigger value="liste">Liste ({groups.liste.length})</TabsTrigger>
        <TabsTrigger value="tracker">À relancer ({groups.tracker.length})</TabsTrigger>
        <TabsTrigger value="alertes" className="gap-1.5">
          <TriangleAlert className="size-3.5" />
          Alertes R{R_ALERTE}
          {groups.alertes.length > 0 && (
            <Badge className={cn('ml-0.5 tabular-nums', STATUS_COLORS.danger)}>
              {groups.alertes.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="archive">Archive ({groups.archive.length})</TabsTrigger>
      </TabsList>

      {tab === 'liste' && <SpendersTable spenders={groups.liste} extra={[relanceAction]} />}
      {tab === 'tracker' && <SpendersTable spenders={groups.tracker} extra={[relanceAction]} />}
      {tab === 'alertes' && <SpendersTable spenders={groups.alertes} extra={[alerteAction]} />}
      {tab === 'archive' && <SpendersTable spenders={groups.archive} extra={[archiveAction]} />}
    </Tabs>
  )
}
