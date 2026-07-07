'use client'

import { useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { addDays, frDayLong } from '@glagency/core'
import { modelColor } from '@/lib/model-color'
import { InsightCard } from './components/insight-card'
import { RankingTable, type RankMetric } from './components/ranking-table'
import type { InsightRow, InsightsData, InsightStatus, RankingData } from './types'

type StatusFilter = 'open' | InsightStatus | 'all'

/**
 * Template Insights : sélecteur des semaines (lundi→dimanche) du mois du datepicker,
 * recherche par chatteur, filtres statut/sévérité. Aucun fetch ici.
 */
export function InsightsTemplate({
  data,
  ranking,
  isAdmin,
  currentUserId,
}: {
  data: InsightsData
  ranking: RankingData
  isAdmin: boolean
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


  const critical = data.insights.filter((i) => i.severity === 'critical').length
  const open = data.insights.filter((i) => i.status === 'new' || i.status === 'in_progress').length

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <p className="text-sm text-muted-foreground">
          {data.weekStart
            ? `S-1 · semaine du ${frDayLong(data.weekStart)} au ${frDayLong(addDays(data.weekStart, 6))}, comparée à la semaine en cours · ${data.insights.length} carte(s) · ${critical} critique(s) · ${open} à traiter`
            : 'Analyses hebdomadaires des quotas par chatteur'}
        </p>
      </div>

      {(data.insights.length > 0 || needle) && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un chatteur…"
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
            ? 'Aucune analyse pour cette semaine — les cartes sont générées chaque nuit après l’ingestion.'
            : 'Rien avec ces filtres.'}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map(([model, items]) => {
            const crit = items.filter((i) => i.severity === 'critical').length
            const toDo = items.filter((i) => i.status === 'new' || i.status === 'in_progress').length
            return (
              // Fermé par défaut — la ligne d'en-tête résume (cartes, critiques, à traiter).
              // key inclut le filtre : filtrer sur un modèle rouvre sa section.
              <Collapsible key={`${model}:${modelFilter}`} defaultOpen={modelFilter !== 'all'} asChild>
                <section className="flex flex-col gap-2">
                  <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left">
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                    {model === 'Autres' ? (
                      <h2 className="text-sm font-medium text-muted-foreground">Autres</h2>
                    ) : (
                      <Badge className={modelColor(model)}>{model}</Badge>
                    )}
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {items.length} carte{items.length > 1 ? 's' : ''}
                      {crit > 0 ? ` · ${crit} critique${crit > 1 ? 's' : ''}` : ''}
                      {toDo > 0 ? ` · ${toDo} à traiter` : ''}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="flex flex-col gap-2">
                    {items.map((i) => (
                      <InsightCard
                        key={`${model}:${i.key}`}
                        insight={i}
                        isAdmin={isAdmin}
                        currentUserId={currentUserId}
                      />
                    ))}
                  </CollapsibleContent>
                </section>
              </Collapsible>
            )
          })}
        </div>
      )}
    </div>
  )
}
