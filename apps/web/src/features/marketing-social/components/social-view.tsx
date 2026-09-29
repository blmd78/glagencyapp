'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { addDays, frDateNumeric } from '@glagency/core'
import { type ColumnDef } from '@tanstack/react-table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import { num } from '@/lib/format'
import { KpiGrid } from '@/components/kpi-card'
import { todayLocal } from '@/lib/dates-client'
import { LinksCard } from './links-card'
import { AddXAccountsDialog } from './add-x-accounts-dialog.client'
import { EditXHandleDialog } from './edit-x-handle-dialog.client'
import type { MktLinkRow } from '@/lib/types/marketing'
import type { MktSocialData, MktSocialRow } from '../types'

const signed = (v: number | null) =>
  v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('fr-FR')}`

/** Compte X que le dernier relevé n'a pas trouvé (statuts écrits par le job `marketing-x`). */
const isUnidentified = (status: string | null) => status === 'introuvable' || status === 'suspendu'

/** Un nombre, ou « — » quand il n'y a pas de relevé (jamais un faux zéro). */
const numOrDash = (v: number | null) => (v != null ? num(v) : '—')

const initials = (s: string) =>
  s
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim()
    .slice(0, 2)
    .toUpperCase() || '?'

/** Le domaine d'un lien de bio (« heyliiink.com ») ; l'URL brute si elle est mal formée. */
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Colonne chiffrée triable, alignée à droite — même rendu que Followers. */
function numberColumn(key: 'following' | 'postsPeriod' | 'listed', label: string): ColumnDef<MktSocialRow> {
  return {
    accessorKey: key,
    header: ({ column }) => <Sortable column={column} label={label} className="justify-end" />,
    cell: ({ getValue }) => <span className="tabular-nums">{numOrDash(getValue() as number | null)}</span>,
    meta: { align: 'right' },
  }
}

/**
 * X : le global du compte (demande Benoit 2026-09-29 — « on veut le global du compte », pas les
 * stats par tweet). Remplace Vues et Engagement, qu'un profil X ne rend pas, et la colonne VA.
 */
function xAccountColumns(): ColumnDef<MktSocialRow>[] {
  return [
    numberColumn('following', 'Abonnements'),
    numberColumn('postsPeriod', 'Tweets période'),
    numberColumn('listed', 'Listes'),
    {
      accessorKey: 'lastPostAt',
      header: ({ column }) => <Sortable column={column} label="Dernier tweet" className="justify-end" />,
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return <span className="tabular-nums text-muted-foreground">{v ? frDateNumeric(v.slice(0, 10)) : '—'}</span>
      },
      meta: { align: 'right' },
    },
    {
      accessorKey: 'bioUrl',
      header: 'Lien en bio',
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return v ? (
          <a
            href={v}
            target="_blank"
            rel="noreferrer"
            className="text-sm underline-offset-4 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {hostOf(v)}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    },
    {
      accessorKey: 'accountCreatedAt',
      header: ({ column }) => <Sortable column={column} label="Créé le" className="justify-end" />,
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return <span className="tabular-nums text-muted-foreground">{v ? frDateNumeric(v.slice(0, 10)) : '—'}</span>
      },
      meta: { align: 'right' },
    },
  ]
}

function makeColumns(
  platform: 'instagram' | 'twitter' | 'telegram',
  canManage: boolean,
): ColumnDef<MktSocialRow>[] {
  const x = platform === 'twitter'
  const cols: ColumnDef<MktSocialRow>[] = [
    {
      id: 'handle',
      accessorKey: 'handle',
      header: ({ column }) => (
        <Sortable column={column} label={platform === 'telegram' ? 'Canal' : 'Compte'} />
      ),
      cell: ({ row }) => {
        const a = row.original
        if (!x) return <span className="font-medium">@{a.handle}</span>
        // X : photo, nom affiché, @pseudo vers le profil ; la bio au survol. Même cellule que la
        // liste des Membres (members-columns.tsx).
        const certified = a.verifiedType && a.verifiedType !== 'none'
        return (
          <div className="flex items-center gap-2.5" title={a.bioText || undefined}>
            <Avatar className="size-8">
              {a.avatarUrl && <AvatarImage src={a.avatarUrl} alt="" />}
              <AvatarFallback className="text-xs font-medium">{initials(a.name ?? a.handle)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">{a.name ?? `@${a.handle}`}</span>
                {certified && <span className="shrink-0 text-xs text-muted-foreground">✓ {a.verifiedType}</span>}
              </div>
              <a
                href={`https://x.com/${a.handle}`}
                target="_blank"
                rel="noreferrer"
                className="truncate text-xs text-muted-foreground underline-offset-4 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                @{a.handle}
              </a>
            </div>
          </div>
        )
      },
    },
    {
      id: 'creator',
      accessorKey: 'creator',
      header: 'Créatrice',
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return v ? <Badge className={modelColor(v)}>{v}</Badge> : <span className="text-muted-foreground">—</span>
      },
    },
    ...(x
      ? []
      : [
          {
            id: 'staff',
            accessorKey: 'staff',
            header: 'VA',
            cell: ({ getValue }) => (
              <span className="text-muted-foreground">{(getValue() as string | null) ?? '—'}</span>
            ),
          } satisfies ColumnDef<MktSocialRow>,
        ]),
    {
      accessorKey: 'followers',
      header: ({ column }) => (
        <Sortable
          column={column}
          label={platform === 'telegram' ? 'Membres' : 'Followers'}
          className="justify-end"
        />
      ),
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        return <span className="font-medium tabular-nums">{v != null ? num(v) : '—'}</span>
      },
      meta: { align: 'right' },
    },
    {
      accessorKey: 'deltaFollowers',
      header: ({ column }) => <Sortable column={column} label="Δ période" className="justify-end" />,
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        return (
          <span
            className={cn(
              'tabular-nums',
              v != null && v > 0 && 'text-green-600 dark:text-green-400',
              v != null && v < 0 && 'text-red-600 dark:text-red-400',
            )}
          >
            {signed(v)}
          </span>
        )
      },
      meta: { align: 'right' },
    },
    ...(x
      ? xAccountColumns()
      : [
          {
            accessorKey: 'viewsPeriod',
            header: ({ column }) => <Sortable column={column} label="Vues période" className="justify-end" />,
            cell: ({ getValue }) => {
              const v = getValue() as number | null
              return <span className="tabular-nums">{v != null && v > 0 ? num(v) : '—'}</span>
            },
            meta: { align: 'right' },
          } satisfies ColumnDef<MktSocialRow>,
        ]),
  ]
  cols.push({
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ row }) => {
      const a = row.original
      // X non identifié : même mention que le « ⚠ non relié » de la Compta (compta-columns.tsx),
      // et le crayon pour corriger le pseudo. stopPropagation : le dialog est portalé mais reste
      // enfant de la cellule côté React (même motif que la Compta).
      if (platform === 'twitter' && isUnidentified(a.status)) {
        return (
          <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs text-amber-700 dark:text-amber-400">⚠ {a.status}</span>
            {canManage && <EditXHandleDialog accountId={a.id} handle={a.handle} status={a.status ?? ''} />}
          </div>
        )
      }
      const v = a.status ?? '—'
      const badge = <Badge className={v === 'ok' ? STATUS_COLORS.positive : STATUS_COLORS.neutral}>{v}</Badge>
      // Compte bridé par X dans certains pays : même mention jaune, les pays en clair.
      if (x && a.withheldCountries?.length) {
        return (
          <div className="flex flex-col items-center gap-0.5">
            {badge}
            <span className="text-xs text-amber-700 dark:text-amber-400">
              ⚠ bridé : {a.withheldCountries.join(', ')}
            </span>
          </div>
        )
      }
      return badge
    },
    meta: { align: 'center' },
  })
  return cols
}

export function SocialView({
  data,
  links,
  canManageAccounts = false,
}: {
  data: MktSocialData
  /** Absent = page sans onglet Liens (Twitter / X : que les comptes, demande Benoit 2026-09-29). */
  links?: MktLinkRow[]
  /** X, admin seul : « Ajouter des comptes » et correction du pseudo d'un compte non identifié
   *  (chaque compte relevé coûte). */
  canManageAccounts?: boolean
}) {
  const ig = data.platform === 'instagram'
  const tg = data.platform === 'telegram'
  const x = data.platform === 'twitter'
  const person = tg ? 'Membres' : 'Followers'
  const [tab, setTab] = useState<'comptes' | 'liens'>('comptes')
  // Filtre « ⚠ N non identifiés » — même bouton que « non reliés » de la Compta (compta-table.tsx).
  const [onlyUnidentified, setOnlyUnidentified] = useState(false)
  const unidentified = data.platform === 'twitter' ? data.accounts.filter((a) => isUnidentified(a.status)) : []
  const active = data.accounts.filter((a) => a.active)
  const ok = active.filter((a) => a.status === 'ok').length
  const deltaFollowers = active.reduce((s, a) => s + (a.deltaFollowers ?? 0), 0)
  const base = { deltaPct: null, trendLabel: '' }
  const kpis = [
    {
      ...base,
      key: 'followers',
      label: `${person} cumulés`,
      value: num(data.totals.followers),
      hint: `somme du dernier relevé de chaque ${tg ? 'canal' : 'compte'}`,
      info: x
        ? 'Photo prise chaque nuit par l’API officielle X (relevé de 23h05).'
        : ig
          ? 'Photo quotidienne prise par le scrape Apify de chaque nuit (23h35).'
          : 'Dernier relevé saisi par l’équipe (bouton « Saisie du jour »).',
    },
    {
      ...base,
      key: 'delta',
      label: `${person} gagnés`,
      value: signed(deltaFollowers),
      hint: 'sur la période affichée',
      info: 'Somme des variations de followers de chaque compte entre son premier et son dernier relevé de la période.',
    },
    // X : un profil ne rend pas de vues — la tuile montre les tweets publiés à la place.
    x
      ? {
          ...base,
          key: 'posts',
          label: 'Tweets publiés',
          value: num(active.reduce((s, a) => s + (a.postsPeriod ?? 0), 0)),
          hint: 'sur la période affichée',
          info: 'Différence du total de tweets de chaque compte entre son premier et son dernier relevé de la période (API X, chaque nuit).',
        }
      : {
          ...base,
          key: 'views',
          label: 'Vues (période)',
          value: num(data.totals.viewsPeriod),
          hint: 'somme des vues 24 h',
          info: ig
            ? 'Somme des « vues 24 h » quotidiennes : différence jour à jour du cumul de vues des ~12 derniers posts de chaque compte (Apify).'
            : 'Somme des « vues 24 h » saisies par l’équipe.',
        },
    {
      ...base,
      key: 'accounts',
      label: tg ? 'Canaux sains' : 'Comptes sains',
      value: `${ok} / ${active.length}`,
      hint: 'statut ok au dernier relevé',
      info: 'Comptes actifs dont le dernier relevé est « ok » — les autres sont privés, introuvables (bannis/renommés) ou sans relevé.',
    },
  ]
  return (
    <>
      <KpiGrid kpis={kpis} />

      {/* Relevé en retard. X : le relevé de 23h05 UTC porte la date UTC de la veille à Paris,
          d'où la tolérance d'un jour — au-delà, une nuit a sauté (clé ou crédits X). */}
      {data.lastDate && data.lastDate < (x ? addDays(todayLocal(), -1) : todayLocal()) && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Dernier relevé{x ? ' X' : ''} : {frDateNumeric(data.lastDate)} —{' '}
          {x
            ? 'le relevé tourne chaque nuit ; un retard signale un souci (clé ou crédits X).'
            : ig
              ? 'la collecte Apify tourne chaque nuit.'
              : 'pense à la saisie du jour.'}
        </p>
      )}

      {/* Onglets Comptes / Liens : évite l'empilement vertical des deux tables. Sans liens
          (Twitter / X), pas d'onglets : la liste des comptes seule. */}
      {links ? (
        <div className="flex items-center justify-between gap-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'comptes' | 'liens')}>
            <TabsList>
              <TabsTrigger value="comptes">
                {tg ? 'Canaux' : 'Comptes'}
                <span className="ml-1.5 tabular-nums opacity-60">{data.accounts.length}</span>
              </TabsTrigger>
              <TabsTrigger value="liens">
                Liens
                <span className="ml-1.5 tabular-nums opacity-60">{links.length}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {canManageAccounts && tab === 'comptes' && <AddXAccountsDialog />}
        </div>
      ) : (
        canManageAccounts && (
          <div className="flex justify-end">
            <AddXAccountsDialog />
          </div>
        )
      )}

      {!links || tab === 'comptes' ? (
        <DataTable
          data={onlyUnidentified && unidentified.length ? unidentified : data.accounts}
          columns={makeColumns(data.platform, canManageAccounts)}
          filterColumnId="handle"
          filterPlaceholder="Filtrer par compte…"
          initialSorting={[{ id: 'followers', desc: true }]}
          pageSize={15}
          getRowId={(a) => a.id}
          countLabel={(n) => (tg ? `${n} canal/aux` : `${n} compte(s)`)}
          toolbar={
            unidentified.length > 0 && (
              <Button
                type="button"
                variant={onlyUnidentified ? 'secondary' : 'outline'}
                size="sm"
                aria-pressed={onlyUnidentified}
                onClick={() => setOnlyUnidentified((v) => !v)}
                className="gap-1.5"
                title="Comptes que le dernier relevé X n'a pas trouvés — corrige leur pseudo avec le crayon"
              >
                <AlertTriangle className="size-3.5 text-amber-500" />
                {unidentified.length} non identifié{unidentified.length > 1 ? 's' : ''}
              </Button>
            )
          }
        />
      ) : (
        <LinksCard links={links} period={data.period} />
      )}
    </>
  )
}
