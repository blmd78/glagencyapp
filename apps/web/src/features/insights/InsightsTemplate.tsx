'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { InsightCard } from './components/insight-card'
import type { InsightsData, InsightStatus } from './types'

const frDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })

const weekEnd = (monday: string) => {
  const d = new Date(`${monday}T00:00:00`)
  d.setDate(d.getDate() + 6)
  return d.toISOString().slice(0, 10)
}

type StatusFilter = 'open' | InsightStatus | 'all'

/**
 * Template Insights : sélecteur des semaines (lundi→dimanche) du mois du datepicker,
 * recherche par chatteur, filtres statut/sévérité. Aucun fetch ici.
 */
export function InsightsTemplate({ data }: { data: InsightsData }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'ok'>('all')
  const [search, setSearch] = useState('')


  const critical = data.insights.filter((i) => i.severity === 'critical').length
  const open = data.insights.filter((i) => i.status === 'new' || i.status === 'in_progress').length

  const needle = search.trim().toLowerCase()
  const shown = data.insights.filter((i) => {
    if (needle && !i.title.toLowerCase().includes(needle)) return false
    if (severityFilter !== 'all' && i.severity !== severityFilter) return false
    if (statusFilter === 'all') return true
    if (statusFilter === 'open') return i.status === 'new' || i.status === 'in_progress'
    return i.status === statusFilter
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <p className="text-sm text-muted-foreground">
          {data.weekStart
            ? `S-1 · semaine du ${frDate(data.weekStart)} au ${frDate(weekEnd(data.weekStart))}, comparée à la semaine en cours · ${data.insights.length} carte(s) · ${critical} critique(s) · ${open} à traiter`
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
          <div className="ml-auto">
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
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {data.insights.length === 0
            ? 'Aucune analyse pour cette semaine — les cartes sont générées chaque nuit après l’ingestion.'
            : 'Rien avec ces filtres.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((i) => (
            <InsightCard key={i.key} insight={i} />
          ))}
        </div>
      )}
    </div>
  )
}
