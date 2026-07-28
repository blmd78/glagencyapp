'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { Badge } from '@/components/ui/badge'
import { modelColor } from '@/lib/model-color'
import { CollapsibleSection } from '@/components/collapsible-section'
import { CountDot } from '@/components/count-dot'
import { InsightCard } from './insight-card'
import { RankingTable, type RankMetric } from './ranking-table'
import {
  isATraiter,
  type InsightRow,
  type InsightsData,
  type InsightStatus,
  type RankingData,
} from '../types'

type StatusFilter = 'open' | InsightStatus | 'all'

export function InsightsView({
  data,
  ranking,
  isAdmin,
  canWrite,
  currentUserId,
}: {
  data: InsightsData
  ranking: RankingData
  isAdmin: boolean
  canWrite: boolean
  currentUserId: string
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'ok'>('all')
  const [modelFilter, setModelFilter] = useState('all')
  const [rankBy, setRankBy] = useState<'none' | RankMetric>('none')
  const [search, setSearch] = useState('')

  // Options du filtre modèle : les modèles présents dans les cartes reçues
  // (déjà cloisonnées par la RLS pour un rôle user).
  const modelOptions = [...new Set(data.insights.flatMap((i) => i.models.map((m) => m.name)))].sort(
    (a, b) => a.localeCompare(b),
  )

  const needle = search.trim().toLowerCase()
  const shown = data.insights.filter((i) => {
    if (needle && !i.title.toLowerCase().includes(needle)) return false
    if (modelFilter !== 'all' && !i.models.some((m) => m.name === modelFilter)) return false
    if (severityFilter !== 'all' && i.severity !== severityFilter) return false
    if (statusFilter === 'all') return true
    if (statusFilter === 'open') return i.status === 'new' || i.status === 'in_progress'
    return i.status === statusFilter
  })

  // Rangement par modèle : une section par modèle (base du cloisonnement — un rôle
  // user ne reçoit que ses modèles, donc ne voit que ses sections). Une carte
  // multi-modèles apparaît dans chaque section concernée (cas minoritaire) ; son
  // statut de traitement est partagé. Sans modèle identifiable → « Autres ».
  const sections: [string, InsightRow[]][] = (() => {
    const by = new Map<string, InsightRow[]>()
    for (const i of shown) {
      let names = i.models.length ? [...new Set(i.models.map((m) => m.name))] : ['Autres']
      if (modelFilter !== 'all') names = names.filter((n) => n === modelFilter)
      for (const n of names) by.set(n, [...(by.get(n) ?? []), i])
    }
    return [...by.entries()].sort(([a], [b]) =>
      a === 'Autres' ? 1 : b === 'Autres' ? -1 : a.localeCompare(b),
    )
  })()

  // KPIs de la SEMAINE, pas de la sélection : ils décrivent ce qu'il y a à traiter, et ne
  // doivent pas sauter à chaque frappe dans la recherche (les filtres, eux, agissent sur la
  // liste dessous). `deltaPct: null` partout — aucune comparaison avec la semaine précédente
  // n'est chargée ici, et inventer une tendance serait pire que ne pas en montrer.
  const all = data.insights
  const nCrit = all.filter((i) => i.severity === 'critical').length
  const nToDo = all.filter((i) => isATraiter(i.status)).length
  const nDone = all.filter((i) => i.status === 'resolved').length
  const nModels = new Set(all.flatMap((i) => i.models.map((m) => m.name))).size
  const share = (n: number) => (all.length ? `${Math.round((n / all.length) * 100)} % des cartes` : '—')
  const kpis: Kpi[] = [
    {
      key: 'total',
      label: 'Cartes',
      value: String(all.length),
      deltaPct: null,
      trendLabel: 'Analyses de la semaine',
      // Pas la date : elle est déjà en toutes lettres dans le sous-titre juste au-dessus.
      // Le nombre de modèles couverts, lui, ne se lit nulle part ailleurs.
      hint: `${nModels} modèle${nModels > 1 ? 's' : ''} couvert${nModels > 1 ? 's' : ''}`,
    },
    {
      key: 'critical',
      label: 'Critiques',
      value: String(nCrit),
      deltaPct: null,
      trendLabel: 'Sévérité critique',
      hint: share(nCrit),
    },
    {
      key: 'todo',
      label: 'À traiter',
      value: String(nToDo),
      deltaPct: null,
      trendLabel: 'Ni résolu ni ignoré',
      hint: share(nToDo),
    },
    {
      key: 'resolved',
      label: 'Résolues',
      value: String(nDone),
      deltaPct: null,
      trendLabel: 'Clôturées avec bilan',
      hint: share(nDone),
    },
  ]

  return (
    <>
      {all.length > 0 && (
        // Liserés alignés sur le code couleur des points : vert = total, rouge = critique,
        // ambre = à traiter ; bleu pour « résolues » (information, pas alerte).
        <KpiGrid
          kpis={kpis}
          accents={[
            'border-t-green-500',
            'border-t-red-500',
            'border-t-amber-500',
            'border-t-blue-500',
          ]}
        />
      )}

      {(data.insights.length > 0 || needle) && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un chatter…"
              className="h-8 w-56 pl-8 text-xs"
            />
          </div>
          {(
            [
              ['open', 'À traiter'],
              ['resolved', 'Résolus'],
              ['ignored', 'Ignorés'],
              ['all', 'Tout'],
            ] as [StatusFilter, string][]
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={statusFilter === value ? 'default' : 'outline'}
              className="text-xs"
              onClick={() => setStatusFilter(value)}
            >
              {label}
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Combobox
              value={modelFilter}
              onChange={setModelFilter}
              className="h-8 w-44 text-xs"
              searchPlaceholder="Rechercher un modèle…"
              options={[
                { value: 'all', label: 'Tous les modèles' },
                ...modelOptions.map((n) => ({ value: n, label: n })),
              ]}
            />
            <Select
              value={severityFilter}
              onValueChange={(v) => setSeverityFilter(v as typeof severityFilter)}
            >
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Tout (critique, moyen, sain)</SelectItem>
                <SelectItem value="critical" className="text-xs">Critique</SelectItem>
                <SelectItem value="warning" className="text-xs">Moyen</SelectItem>
                <SelectItem value="ok" className="text-xs">Sain</SelectItem>
              </SelectContent>
            </Select>
            <Select value={rankBy} onValueChange={(v) => setRankBy(v as 'none' | RankMetric)}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Classement par…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">— Aucun (cartes)</SelectItem>
                <SelectItem value="general" className="text-xs">Général (5 critères)</SelectItem>
                <SelectItem value="ca" className="text-xs">CA</SelectItem>
                <SelectItem value="presence" className="text-xs">Présence</SelectItem>
                <SelectItem value="propose" className="text-xs">Média proposé</SelectItem>
                <SelectItem value="conv" className="text-xs">Taux de conversion</SelectItem>
                <SelectItem value="react" className="text-xs">Réactivité</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {rankBy !== 'none' ? (
        <RankingTable ranking={ranking} metric={rankBy} />
      ) : shown.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {data.insights.length === 0
            ? "Aucune analyse pour cette semaine — les cartes sont générées chaque nuit après l’ingestion."
            : 'Rien avec ces filtres.'}
        </p>
      ) : (
        // `gap-2` : même respiration entre accordéons que la pile de noms du Dashboard et du
        // Planning (`members-accordion.tsx`). C'était `gap-6`, hérité de l'époque où l'en-tête
        // était un intertitre nu sans cadre — avec un cadre, l'écart devient un trou.
        <div className="flex flex-col gap-2">
          {sections.map(([model, items]) => {
            const crit = items.filter((i) => i.severity === 'critical').length
            // Même prédicat que le point posé sur chaque carte (`isATraiter`, `../types`) :
            // le compteur et les points doivent toujours tomber d'accord.
            const toDo = items.filter((i) => isATraiter(i.status)).length
            return (
              // Même accordéon que partout ailleurs (`CollapsibleSection`) : cadre, chevron,
              // filet. Fermé par défaut — la ligne d'en-tête résume à elle seule. La `key`
              // inclut le filtre : filtrer sur un modèle rouvre sa section.
              <CollapsibleSection
                key={`${model}:${modelFilter}`}
                defaultOpen={modelFilter !== 'all'}
                contentClassName="flex flex-col gap-2 p-3"
                trigger={
                  <>
                    {/* Pas de `h2` ici : `CollapsibleSection` en pose déjà un autour du
                        trigger — en imbriquer un second serait invalide. */}
                    {model === 'Autres' ? (
                      <span className="text-muted-foreground">Autres</span>
                    ) : (
                      <Badge className={modelColor(model)}>{model}</Badge>
                    )}
                    {/* Compteurs alignés à DROITE, même code couleur que les points des
                        cartes : on lit d'un coup d'œil ce que la section contient sans la
                        déplier. */}
                    <span className="ml-auto flex items-center gap-2 text-xs font-normal tabular-nums text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CountDot tone="total" />
                        {items.length} carte{items.length > 1 ? 's' : ''}
                      </span>
                      {crit > 0 && (
                        <span className="flex items-center gap-1">
                          <CountDot tone="critique" />
                          {crit} critique{crit > 1 ? 's' : ''}
                        </span>
                      )}
                      {toDo > 0 && (
                        <span className="flex items-center gap-1">
                          <CountDot tone="a-traiter" />
                          {toDo} à traiter
                        </span>
                      )}
                    </span>
                  </>
                }
              >
                {items.map((i) => (
                  <InsightCard
                    key={`${model}:${i.key}`}
                    insight={i}
                    isAdmin={isAdmin}
                    canWrite={canWrite}
                    currentUserId={currentUserId}
                  />
                ))}
              </CollapsibleSection>
            )
          })}
        </div>
      )}
    </>
  )
}
