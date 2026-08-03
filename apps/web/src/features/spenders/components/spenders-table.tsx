'use client'

import { useMemo, useState } from 'react'
import { ChevronsUpDown, ExternalLink } from 'lucide-react'
import { type ColumnDef, type SortingState } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TeamBadge } from '@/components/team-badge'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
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
// Formateurs hoistés (toLocaleDateString avec options = un Intl.DateTimeFormat neuf par
// appel, ~70× plus lent — × 2 par ligne × ~1 700 lignes possibles).
const FR_DATE_FULL = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' })
const FR_DAY_MONTH = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Europe/Paris',
})

function LastRelance({ iso }: { iso: string | null }) {
  if (!iso) return null
  const late = (parisDaysSince(iso) ?? 0) >= 2
  return (
    <span
      className={cn(
        'shrink-0 text-xs tabular-nums',
        late ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
      )}
      title={`Dernière relance le ${FR_DATE_FULL.format(new Date(iso))}${late ? ' — en retard' : ''}`}
    >
      {FR_DAY_MONTH.format(new Date(iso))}
    </span>
  )
}

const makeColumns = (isAdmin: boolean, canWrite: boolean, tracker: boolean, readOnly: boolean): ColumnDef<SpenderRow>[] => [
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
        {/* Bouton « Conv » à côté du pseudo (choix Benoit, plus intuitif qu'une icône seule)
            → ouvre la conversation MyPuls (switch-creator + focus, format de l'ancien
            gla-workflow) : évite le copier-coller à chaque relance. Présent sur les deux
            vues (liste et tracker), la colonne est commune. Sans id MyPuls (modèle hors
            assignation RLS, ou non mappé) : pas de bouton. */}
        {row.original.mypulsCreatorId && (
          <Button
            asChild
            size="sm"
            className="h-6 shrink-0 gap-1 px-2 text-[11px] font-medium"
          >
            <a
              href={`https://mypuls.app/switch-creator/${row.original.mypulsCreatorId}?fc=${row.original.fanId}`}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Ouvrir la conversation MyPuls de ${row.original.username}`}
            >
              Conv
              <ExternalLink className="size-3" />
            </a>
          </Button>
        )}
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
    header: ({ column }) => <Sortable column={column} label="Chatter" />,
    cell: ({ row }) => {
      const name = row.original.chatterName ?? row.original.assignedLabel
      if (!name) return <span className="text-xs italic text-muted-foreground">non assigné</span>
      // Équipe (rouge/bleue) lue depuis le MEMBRE lié au chatteur assigné (0077/0079).
      return (
        <div className="flex items-center gap-1.5">
          <span className="truncate">{name}</span>
          <TeamBadge team={row.original.chatterTeam} />
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
          cell: ({ row }) => <RelanceCounter spender={row.original} isAdmin={isAdmin} canWrite={canWrite} withAdd={false} />,
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
              canWrite={canWrite}
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
  canWrite = false,
  tracker = false,
  readOnlyRelances = false,
  models,
  onModelsChange,
  manual,
  sorting,
  onSortingChange,
  search,
  onSearchChange,
  totalCount,
  hasMore,
  onLoadMore,
}: {
  spenders: SpenderRow[]
  /** Colonnes ajoutées en fin (ex. actions du tracker). */
  extra?: ColumnDef<SpenderRow>[]
  isAdmin?: boolean
  /** admin ou manager/sous-manager : peut reset/archiver. Le chatteur non (0060). */
  canWrite?: boolean
  /** Vue « À relancer » : cases R1→R10, date de relance, tri par priorité. */
  tracker?: boolean
  /** Vue « Liste » : compteur en consultation seule (ni « + » ni crayon). */
  readOnlyRelances?: boolean
  /**
   * Filtre modèle CONTRÔLÉ par le parent (SpendersView) : l'état vit là-haut pour que
   * les cartes KPI de la Liste se recalculent sur la sélection. MULTIPLE (un chatteur/
   * manager suit souvent plusieurs modèles) — vide = tous les modèles.
   */
  models: string[]
  onModelsChange: (models: string[]) => void
  /** Mode serveur (0104) : tri, recherche et découpage vivent en base — cf. DataTable. */
  manual?: boolean
  sorting?: SortingState
  onSortingChange?: (next: SortingState) => void
  search?: string
  onSearchChange?: (next: string) => void
  totalCount?: number
  hasMore?: boolean
  onLoadMore?: () => void
}) {
  // Tracker : par défaut on n'affiche QUE les non-relancés du jour (cocher = la ligne
  // sort de la file) ; le toggle bascule sur ceux déjà relancés aujourd'hui.
  const [showDone, setShowDone] = useState(false)

  const modelOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const s of spenders) byId.set(s.creatorId, s.model)
    return [...byId.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [spenders])

  // Le filtre « relancés aujourd'hui » s'applique APRÈS le filtre modèle : le compteur
  // du toggle correspond exactement aux lignes qu'il affichera.
  const { filtered, doneToday } = useMemo(() => {
    const wanted = new Set(models)
    const byModel = wanted.size === 0 ? spenders : spenders.filter((s) => wanted.has(s.creatorId))
    if (!tracker) return { filtered: byModel, doneToday: 0 }
    const done = byModel.filter((s) => s.grise).length
    return { filtered: byModel.filter((s) => (showDone ? s.grise : !s.grise)), doneToday: done }
  }, [spenders, models, tracker, showDone])

  // Libellé du déclencheur : état de la sélection en un coup d'œil.
  const modelLabel =
    models.length === 0
      ? 'Tous les modèles'
      : models.length === 1
        ? (modelOptions.find((o) => o.value === models[0])?.label ?? '1 modèle')
        : `${models.length} modèles`

  const columns = useMemo(() => [...makeColumns(isAdmin, canWrite, tracker, readOnlyRelances), ...extra], [extra, isAdmin, canWrite, tracker, readOnlyRelances])

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
      paginated={false}
      manual={manual}
      sorting={sorting}
      onSortingChange={onSortingChange}
      search={search}
      onSearchChange={onSearchChange}
      totalCount={totalCount}
      hasMore={hasMore}
      onLoadMore={onLoadMore}
      countLabel={(n) => `${n} spender(s)`}
      toolbar={
        <>
          <ComboboxMultiple
            trigger={
              <Button
                type="button"
                variant="outline"
                role="combobox"
                className="h-9 w-44 justify-between font-normal"
              >
                <span className="truncate">{modelLabel}</span>
                <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
              </Button>
            }
            options={modelOptions}
            value={models}
            onChange={onModelsChange}
            placeholder="Rechercher un modèle…"
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
