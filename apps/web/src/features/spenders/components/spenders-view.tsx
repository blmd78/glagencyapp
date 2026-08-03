'use client'

import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState } from 'react'
import { type ColumnDef, type SortingState } from '@tanstack/react-table'
import { toast } from 'sonner'
import { KpiCard, type Kpi } from '@/components/kpi-card'
import { eur } from '@/lib/format'
import { SpendersTable } from './spenders-table'
import { ArchiveButton } from './spender-actions'
import { applyPatch, SpendersOptimisticCtx } from './spenders-optimistic-context'
import { isARelancer, R_ALERTE, type SpenderRow } from '../types'
import { loadSpendersPage } from '../actions'
import type { SpendersKpis } from '../services/get-spenders-page'

export type SpendersViewKind = 'liste' | 'tracker' | 'alertes' | 'archive'

// Relancer (cases R1→R10) et Reset vivent dans les colonnes du tracker — ici on
// n'ajoute que l'action de fin de cycle : archiver (alertes) ou réactiver (archive).

const alerteAction: ColumnDef<SpenderRow> = {
  id: 'action',
  header: '',
  cell: ({ row }) => (
    <div className="flex justify-end">
      <ArchiveButton target={row.original} archived={false} />
    </div>
  ),
  meta: { align: 'right' },
}

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

// Hoisté : une identité STABLE entre renders — un `[]` créé dans le useMemo changeait
// l'identité de `extra` à chaque patch optimiste/refresh → recalcul des colonnes en aval.
const NO_EXTRA: ColumnDef<SpenderRow>[] = []

/** Une vue de la sous-catégorie Spenders : filtre les spenders + action de fin de cycle. */
export function SpendersView({
  spenders,
  view,
  isAdmin,
  canWrite,
  threshold,
  freshness,
  total,
  serverKpis,
}: {
  spenders: SpenderRow[]
  view: SpendersViewKind
  isAdmin?: boolean
  /** admin ou manager/sous-manager : peut archiver/réactiver/reset. Le chatteur non. */
  canWrite?: boolean
  /** Seuil de tracking (CA net) — affiché dans la carte « Spenders trackés » (liste). */
  threshold?: number
  /** Fraîcheur du scrape déjà formatée (SSR, TZ Paris) — hint des KPIs (liste). */
  freshness?: string | null
  /**
   * MODE SERVEUR (0104) : total du périmètre. Défini = `spenders` n'est qu'une TRANCHE — tri,
   * recherche et filtre modèle repartent en base, et le scroll charge la suite. Absent = jeu
   * complet, comportement d'origine (vues `alertes`/`archive`, devenues minuscules).
   */
  total?: number
  /** Cartes de la Liste agrégées en base (mode serveur) — sinon calculées sur le jeu complet. */
  serverKpis?: SpendersKpis
}) {
  const serveur = total !== undefined
  // Optimistic UI : les lignes affichées = état serveur + patchs des actions en cours
  // (cocher une case sort la ligne de la file À L'INSTANT, comme le fera le serveur).
  // Si une action échoue, React revient tout seul à l'état serveur (revert automatique).
  // Tranches chargées au scroll, et remplacement complet quand un critère change (le serveur
  // renvoie alors une PREMIÈRE tranche, pas une suite). Les deux sont vidés dès que la prop
  // `spenders` change — c'est-à-dire à chaque revalidation d'action : sans ça, une ligne
  // archivée resterait affichée dans les tranches déjà en mémoire.
  const [suite, setSuite] = useState<SpenderRow[]>([])
  const [remplacement, setRemplacement] = useState<SpenderRow[] | null>(null)
  const [chargement, setChargement] = useState(false)
  const [sorting, setSorting] = useState<SortingState>(() =>
    view === 'tracker'
      ? [{ id: 'compteurR', desc: false }, { id: 'ca', desc: true }]
      : [{ id: 'ca', desc: true }],
  )
  const [search, setSearch] = useState('')
  // Filtre modèle : l'état vit ICI (pas dans la table) pour que les cartes KPI de la Liste
  // suivent la sélection. MULTIPLE (un chatteur/manager suit souvent plusieurs modèles) —
  // vide = tous. En mode serveur il repart en base, comme le tri et la recherche.
  const [models, setModels] = useState<string[]>([])
  // Total du périmètre : celui du serveur au premier rendu, puis celui de la dernière requête
  // (il change dès qu'on filtre ou qu'on cherche).
  const [totalCourant, setTotalCourant] = useState(total ?? 0)
  const [sourceTotal, setSourceTotal] = useState(total)
  if (sourceTotal !== total) {
    setSourceTotal(total)
    setTotalCourant(total ?? 0)
  }
  // Réinitialisation PENDANT LE RENDU, pas dans un effet : c'est le patron React pour ajuster
  // un état quand une prop change (un effet provoquerait un rendu de plus, avec entre-deux les
  // anciennes tranches à l'écran). Déclenché à chaque revalidation d'action — sans quoi une
  // ligne archivée resterait visible dans les tranches déjà en mémoire.
  const [sourceVue, setSourceVue] = useState(spenders)
  if (sourceVue !== spenders) {
    setSourceVue(spenders)
    setSuite([])
    setRemplacement(null)
  }

  const base = useMemo(
    () => (serveur ? [...(remplacement ?? spenders), ...suite] : spenders),
    [serveur, remplacement, spenders, suite],
  )
  const [optimistic, apply] = useOptimistic(base, applyPatch)
  // Chaque page (/liste, /tracker, /alertes, /archive) fait son propre fetch (standard) —
  // une action revalide le SEGMENT layout partagé (actions.ts) : la vue courante reçoit
  // la donnée fraîche dans la réponse du POST, les 3 autres refetchent à leur prochaine
  // navigation. Les erreurs d'action sont des `toast.error` posés au call site (survivent
  // au démontage du bouton cliqué si le patch optimiste sort la ligne de la vue).
  const ctx = useMemo(() => ({ apply }), [apply])

  // UN SEUL CHEMIN de chargement : `offset` à 0 remplace, sinon on ajoute. `enVol` empêche la
  // rafale — le virtualiseur rappelle `onLoadMore` à chaque ligne montée tant que le bas est
  // proche, et sans ce verrou la même tranche partirait dix fois.
  const enVol = useRef(false)
  const charger = useCallback(
    async (offset: number, critères: { sort: SortingState; search: string; models: string[] }) => {
      if (enVol.current) return
      enVol.current = true
      setChargement(true)
      const tri = critères.sort[0]
      const res = await loadSpendersPage({
        view,
        models: critères.models,
        search: critères.search,
        sort: tri?.id ?? 'ca',
        desc: tri?.desc ?? true,
        limit: 100,
        offset,
      })
      enVol.current = false
      setChargement(false)
      if (!res.success) {
        toast.error(res.error ?? 'Chargement impossible')
        return
      }
      if (offset === 0) {
        setRemplacement(res.data.rows)
        setSuite([])
      } else {
        setSuite((s) => [...s, ...res.data.rows])
      }
      setTotalCourant(res.data.total)
    },
    [view],
  )

  // Tri, recherche et modèles repartent EN BASE : on redemande une première tranche. La
  // recherche est temporisée — une requête par frappe saturerait la base qu'on vient de
  // soulager. Le premier rendu ne déclenche rien : sa tranche vient déjà du serveur (SSR).
  const monté = useRef(false)
  useEffect(() => {
    if (!serveur) return
    if (!monté.current) {
      monté.current = true
      return
    }
    const t = setTimeout(() => charger(0, { sort: sorting, search, models }), 300)
    return () => clearTimeout(t)
  }, [serveur, sorting, search, models, charger])


  const { rows, extra } = useMemo(() => {
    const actifs = optimistic.filter((s) => !s.archived)
    switch (view) {
      // Cycle en cours (R < 10) — le masquage « relancés aujourd'hui » vit dans
      // SpendersTable (après le filtre modèle). Un R10 sort naturellement (→ alertes).
      case 'tracker':
        return { rows: actifs.filter((s) => s.compteurR < R_ALERTE), extra: NO_EXTRA }
      // Colonne d'action (archiver / réactiver) réservée admin+manager : cachée au chatteur.
      case 'alertes':
        return { rows: actifs.filter((s) => s.compteurR >= R_ALERTE), extra: canWrite ? [alerteAction] : NO_EXTRA }
      case 'archive':
        return { rows: optimistic.filter((s) => s.archived), extra: canWrite ? [archiveAction] : NO_EXTRA }
      default:
        return { rows: actifs, extra: NO_EXTRA }
    }
  }, [optimistic, view, canWrite])

  // Cartes KPI (Liste uniquement) — recalculées sur les modèles sélectionnés, et sur
  // l'état optimiste (archiver un spender décrémente les cartes à l'instant).
  const kpis = useMemo(() => {
    if (view !== 'liste') return null
    // MODE SERVEUR : les cartes portent sur TOUT le périmètre. Les recalculer sur la tranche
    // chargée afficherait « 100 spenders » et un CA de 100 lignes — faux, et crédible.
    const wanted = new Set(models)
    const scope = wanted.size === 0 ? optimistic : optimistic.filter((s) => wanted.has(s.creatorId))
    const actifsLocaux = scope.filter((s) => !s.archived)
    const actifs = serverKpis ? { length: serverKpis.spenders } : actifsLocaux
    const caTotal = serverKpis ? serverKpis.caTotal : actifsLocaux.reduce((s, x) => s + x.ca, 0)
    const aRelancer = serverKpis ? serverKpis.aRelancer : actifsLocaux.filter(isARelancer).length
    const alertesR10 = serverKpis
      ? serverKpis.alertesR10
      : actifsLocaux.filter((s) => s.compteurR >= R_ALERTE).length
    const orphelins = serverKpis
      ? serverKpis.orphelins
      : actifsLocaux.filter((s) => !s.chatterName && !s.assignedLabel).length

    const cards: Array<Kpi & { accent?: string }> = [
      {
        key: 'spenders',
        label: 'Spenders trackés',
        value: String(actifs.length),
        deltaPct: null,
        trendLabel: `CA ≥ ${threshold} € net MyPuls`,
        hint: freshness ? `scrapé le ${freshness}` : '',
      },
      {
        key: 'ca',
        label: 'CA cumulé spenders',
        value: eur(caTotal),
        deltaPct: null,
        trendLabel: 'total vie de chaque fan',
        hint: 'somme des CA affichés',
        info: 'Somme des CA vie de tous les spenders actifs (chacun = tout son historique MyPuls). Repère de volume, pas un CA de période.',
      },
      {
        key: 'relancer',
        label: 'À relancer',
        value: String(aRelancer),
        deltaPct: null,
        trendLabel: 'non relancés aujourd’hui',
        hint: `cycle en cours (R < ${R_ALERTE})`,
        accent: 'border-t-amber-500',
      },
      {
        key: 'alertes',
        label: `Alertes R${R_ALERTE}`,
        value: String(alertesR10),
        deltaPct: null,
        trendLabel: 'fin de cycle — à archiver',
        hint: `${orphelins} non assigné(s)`,
        accent: 'border-t-red-500',
      },
    ]
    return cards
  }, [view, models, optimistic, threshold, freshness, serverKpis])

  return (
    <SpendersOptimisticCtx.Provider value={ctx}>
      <div className="flex flex-col gap-6">
        {kpis && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map(({ accent, ...k }) => (
              <KpiCard key={k.key} kpi={k} accent={accent} />
            ))}
          </div>
        )}
        <SpendersTable
          spenders={rows}
          extra={extra}
          isAdmin={isAdmin}
          canWrite={canWrite}
          tracker={view === 'tracker'}
          readOnlyRelances={view === 'liste'}
          models={models}
          onModelsChange={setModels}
          manual={serveur}
          sorting={sorting}
          onSortingChange={setSorting}
          search={search}
          onSearchChange={setSearch}
          totalCount={serveur ? totalCourant : undefined}
          hasMore={serveur && !chargement && base.length < totalCourant}
          onLoadMore={() => charger(base.length, { sort: sorting, search, models })}
        />
      </div>
    </SpendersOptimisticCtx.Provider>
  )
}
