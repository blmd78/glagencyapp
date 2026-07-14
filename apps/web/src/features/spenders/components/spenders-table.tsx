'use client'

import { useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Combobox } from '@/components/ui/combobox'
import { Toggle } from '@/components/ui/toggle'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { HeaderInfo } from '@/components/data-table/header-info'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur } from '@/lib/format'
import { RelanceCounter } from './spender-actions'
import { RelanceCheck, R_STEPS } from './relance-checklist'
import { daysSince, parisDaysSince, type SpenderRow } from '../types'

/** « aujourd'hui » / « hier » / « il y a N j » — fraîcheur de la conversation. */
function daysLabel(iso: string | null): string {
  const days = daysSince(iso)
  if (days === null) return '—'
  if (days <= 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  return `il y a ${days} j`
}

/**
 * « 12/07 » — date de la dernière relance, ambre si au moins un jour calendaire Paris a
 * été sauté (la cadence 1/jour est calendaire Paris, pas en heures glissantes).
 * timeZone explicite : le SSR (Workers, UTC) et le navigateur doivent rendre LE MÊME
 * jour — sinon mismatch d'hydratation sur les relances de nuit.
 */
function LastRelance({ iso }: { iso: string | null }) {
  if (!iso) return null
  const late = (parisDaysSince(iso) ?? 0) >= 2
  return (
    <span
      className={cn(
        'shrink-0 text-xs tabular-nums',
        late ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
      )}
      title={`Dernière relance le ${new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}${late ? ' — en retard' : ''}`}
    >
      {new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' })}
    </span>
  )
}

const makeColumns = (isAdmin: boolean, tracker: boolean, readOnly: boolean): ColumnDef<SpenderRow>[] => [
  {
    accessorKey: 'username',
    header: ({ column }) => (
      <div className="flex items-center gap-1.5">
        <Sortable column={column} label="Fan" />
        <HeaderInfo text="Point bleu = message non lu dans la conversation MyPuls (quelqu'un doit aller lire/répondre)." />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="truncate font-medium">{row.original.username}</span>
        {row.original.hasUnread && (
          <span className="size-2 shrink-0 rounded-full bg-blue-500" title="Message non lu" />
        )}
        {/* Tracker : date de dernière relance à côté du pseudo (« en temps et en heure »). */}
        {tracker && <LastRelance iso={row.original.derniereRelanceAt} />}
        {tracker && row.original.grise && (
          <Badge className="shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            ✓ fait
          </Badge>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'model',
    header: 'Modèle',
    cell: ({ getValue }) => <Badge className={modelColor(getValue() as string)}>{getValue() as string}</Badge>,
  },
  {
    id: 'chatter',
    accessorFn: (r) => r.chatterName ?? r.assignedLabel ?? '',
    header: ({ column }) => <Sortable column={column} label="Chatteur" />,
    cell: ({ row }) => {
      const name = row.original.chatterName ?? row.original.assignedLabel
      if (!name) return <span className="text-xs italic text-muted-foreground">non assigné</span>
      return (
        <div className="flex items-center gap-1.5">
          <span className="truncate">{name}</span>
          {row.original.chatterTeam && (
            <Badge
              className={
                row.original.chatterTeam === 'rouge'
                  ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
              }
            >
              {row.original.chatterTeam === 'rouge' ? 'Rouge' : 'Bleue'}
            </Badge>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'ca',
    header: ({ column }) => (
      <div className="flex items-center justify-end gap-1.5">
        <Sortable column={column} label="CA total" className="justify-end" />
        <HeaderInfo text="CA net vie entière du fan, tel que MyPuls le connaît (tout son historique)." />
      </div>
    ),
    cell: ({ getValue }) => <span className="font-medium tabular-nums">{eur(getValue() as number)}</span>,
    meta: { align: 'right' },
  },
  // Tracker : une colonne par relance (R1→R10, cochage séquentiel) + compteur sans « + » ;
  // Liste (readOnly) : compteur seul, pure consultation ; Alertes/Archive : badge + actions.
  ...(tracker
    ? [
        ...R_STEPS.map(
          (n): ColumnDef<SpenderRow> => ({
            id: `r${n}`,
            header: `R${n}`,
            cell: ({ row }) => <RelanceCheck spender={row.original} n={n} />,
            // w-12 : colonnes serrées comme le tracker gla-workflow (l'espace va aux
            // colonnes texte, pas aux cases).
            meta: { align: 'center', className: 'w-12' },
          }),
        ),
        {
          accessorKey: 'compteurR',
          header: ({ column }) => (
            <div className="flex items-center justify-center gap-1.5">
              <Sortable column={column} label="R" className="justify-center" />
              <HeaderInfo text="Compteur de relances — la liste est triée par priorité : le moins relancé en haut. Coche la case suivante pour enregistrer la relance du jour (max 1/jour, garanti en base)." />
            </div>
          ),
          cell: ({ row }) => <RelanceCounter spender={row.original} isAdmin={isAdmin} withAdd={false} />,
          meta: { align: 'center' },
        } satisfies ColumnDef<SpenderRow>,
      ]
    : [
        {
          accessorKey: 'compteurR',
          header: () => (
            <div className="flex items-center justify-center gap-1.5">
              <span>Relances</span>
              <HeaderInfo
                text={
                  readOnly
                    ? 'Compteur de relances — consultation seule, le cochage se fait dans « À relancer ».'
                    : 'Compteur de relances. Le « + » enregistre une relance (max 1/jour, garanti en base). À R10 = fin de cycle (à archiver).'
                }
              />
            </div>
          ),
          cell: ({ row }) => (
            <RelanceCounter
              spender={row.original}
              isAdmin={isAdmin}
              withAdd={!readOnly}
              withEdit={!readOnly}
            />
          ),
          meta: { align: 'center' },
        } satisfies ColumnDef<SpenderRow>,
      ]),
  {
    id: 'lastMessage',
    accessorFn: (r) => r.lastMessageAt ?? '',
    header: ({ column }) => (
      <div className="flex items-center gap-1.5">
        <Sortable column={column} label="Dernier message" />
        <HeaderInfo text="Date du dernier message MyPuls, et qui l'a envoyé. « nous, sans réponse » = candidat relance." />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="tabular-nums text-muted-foreground">
          {daysLabel(row.original.lastMessageAt)}
        </span>
        {row.original.lastMessageIsMine !== null && (
          <span className="text-xs text-muted-foreground">
            {row.original.lastMessageIsMine ? '(nous)' : '(lui)'}
          </span>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ getValue }) => {
      const s = getValue() as string | null
      if (!s) return <span className="text-muted-foreground">—</span>
      return (
        <Badge className={cn('text-xs', s === 'Abonné' ? STATUS_COLORS.positive : STATUS_COLORS.neutral)}>
          {s}
        </Badge>
      )
    },
    meta: { align: 'center' },
  },
]

export function SpendersTable({
  spenders,
  extra = [],
  isAdmin = false,
  tracker = false,
  readOnlyRelances = false,
}: {
  spenders: SpenderRow[]
  /** Colonnes ajoutées en fin (ex. actions du tracker). */
  extra?: ColumnDef<SpenderRow>[]
  isAdmin?: boolean
  /** Vue « À relancer » : cases R1→R10, date de relance, tri par priorité. */
  tracker?: boolean
  /** Vue « Liste » : compteur en consultation seule (ni « + » ni crayon). */
  readOnlyRelances?: boolean
}) {
  const [model, setModel] = useState('all')
  // Tracker : par défaut on n'affiche QUE les non-relancés du jour (cocher = la ligne
  // sort de la file) ; le toggle bascule sur ceux déjà relancés aujourd'hui.
  const [showDone, setShowDone] = useState(false)

  const modelOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const s of spenders) byId.set(s.creatorId, s.model)
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [spenders])

  // Le filtre « relancés aujourd'hui » s'applique APRÈS le filtre modèle : le compteur
  // du toggle correspond exactement aux lignes qu'il affichera.
  const { filtered, doneToday } = useMemo(() => {
    const byModel = model === 'all' ? spenders : spenders.filter((s) => s.creatorId === model)
    if (!tracker) return { filtered: byModel, doneToday: 0 }
    const done = byModel.filter((s) => s.grise).length
    return { filtered: byModel.filter((s) => (showDone ? s.grise : !s.grise)), doneToday: done }
  }, [spenders, model, tracker, showDone])

  const columns = useMemo(() => [...makeColumns(isAdmin, tracker, readOnlyRelances), ...extra], [extra, isAdmin, tracker, readOnlyRelances])

  return (
    <DataTable
      data={filtered}
      columns={columns}
      filterColumnId="username"
      filterPlaceholder="Filtrer par fan…"
      initialSorting={
        tracker
          ? [
              { id: 'compteurR', desc: false },
              { id: 'ca', desc: true },
            ]
          : [{ id: 'ca', desc: true }]
      }
      getRowId={(s) => `${s.creatorId}:${s.fanId}`}
      countLabel={(n) => `${n} spender(s)`}
      toolbar={
        <>
          <Combobox
            value={model}
            onChange={setModel}
            className="w-44"
            searchPlaceholder="Rechercher un modèle…"
            options={[
              { value: 'all', label: 'Tous les modèles' },
              ...modelOptions.map(([id, name]) => ({ value: id, label: name })),
            ]}
          />
          {tracker && (
            <Toggle
              variant="outline"
              size="sm"
              pressed={showDone}
              onPressedChange={setShowDone}
              aria-label="Afficher les spenders déjà relancés aujourd'hui"
            >
              Relancés aujourd’hui ({doneToday})
            </Toggle>
          )}
        </>
      }
    />
  )
}
