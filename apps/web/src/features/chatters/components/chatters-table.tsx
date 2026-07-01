'use client'

import { ChevronRight } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import type { ChatterRow } from '../types'

const eur = (n: number) =>
  `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`
const pct = (n: number) =>
  `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`

// Largeurs de colonnes partagées entre l'entête et les lignes (alignement).
const C = {
  name: 'flex-1 min-w-[150px]',
  team: 'w-24 shrink-0',
  ca: 'w-24 shrink-0 text-right tabular-nums',
  com: 'w-20 shrink-0 text-right tabular-nums',
  ppv: 'w-24 shrink-0 text-right tabular-nums',
  tips: 'w-24 shrink-0 text-right tabular-nums',
  pv: 'w-24 shrink-0 text-right tabular-nums',
  conv: 'w-16 shrink-0 text-right tabular-nums',
  pres: 'w-28 shrink-0 text-right tabular-nums',
  react: 'w-14 shrink-0 text-right tabular-nums',
  status: 'w-20 shrink-0 text-center',
}

export function ChattersTable({ chatters }: { chatters: ChatterRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <div className="min-w-[980px]">
        {/* Entête */}
        <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span className="w-4 shrink-0" />
          <span className={C.name}>Chatteur</span>
          <span className={C.team}>Équipe</span>
          <span className={C.ca}>CA</span>
          <span className={C.com}>Com.</span>
          <span className={C.ppv}>PPV</span>
          <span className={C.tips}>Tips</span>
          <span className={C.pv}>Prop./Vendu</span>
          <span className={C.conv}>Conv.</span>
          <span className={C.pres}>Présence</span>
          <span className={C.react}>Réact.</span>
          <span className={C.status}>Statut</span>
        </div>

        {chatters.map((c) => {
          const hasDetail = c.nbModels > 0 || c.caUnattributed > 0
          return (
            <Collapsible key={c.id} asChild>
              <div className="border-b last:border-b-0">
                <CollapsibleTrigger asChild disabled={!hasDetail}>
                  <button
                    type="button"
                    className="group flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40 disabled:cursor-default"
                  >
                    <ChevronRight
                      className={`w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90 ${
                        hasDetail ? '' : 'opacity-0'
                      }`}
                    />
                    <span className={`${C.name} min-w-0`}>
                      <span className="block truncate font-medium">{c.name}</span>
                      {c.nbModels > 1 && (
                        <span className="text-xs text-muted-foreground">
                          {c.nbModels} modèles
                        </span>
                      )}
                    </span>
                    <span className={`${C.team} truncate text-muted-foreground`}>
                      {c.team ?? '—'}
                    </span>
                    <span className={`${C.ca} font-medium`}>{eur(c.ca)}</span>
                    <span className={`${C.com} text-muted-foreground`}>
                      {eur(c.com)}
                    </span>
                    <span className={C.ppv}>{eur(c.ppv)}</span>
                    <span className={C.tips}>{eur(c.tips)}</span>
                    <span className={C.pv}>
                      {c.propose} / {c.vendu}
                    </span>
                    <span className={C.conv}>{pct(c.tauxConv)}</span>
                    <span className={`${C.pres} text-muted-foreground`}>
                      {Math.round(c.presenceActiveH)}h / {Math.round(c.presenceIdleH)}h
                    </span>
                    <span className={`${C.react} text-muted-foreground`}>
                      {c.reactiviteS != null ? `${c.reactiviteS}s` : '—'}
                    </span>
                    <span className={C.status}>
                      <Badge variant={c.active ? 'secondary' : 'outline'}>
                        {c.active ? 'Actif' : 'Fantôme'}
                      </Badge>
                    </span>
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="bg-muted/20">
                    {c.models.map((m) => (
                      <div
                        key={m.model}
                        className="flex items-center gap-3 border-t px-3 py-1.5 text-sm"
                      >
                        <span className="w-4 shrink-0" />
                        <span className={`${C.name} truncate pl-4 text-muted-foreground`}>
                          {m.model}
                        </span>
                        <span className={C.team}>—</span>
                        <span className={C.ca}>{eur(m.ca)}</span>
                        <span className={C.com}>—</span>
                        <span className={C.ppv}>{eur(m.ppv)}</span>
                        <span className={C.tips}>{eur(m.tips)}</span>
                        <span className={C.pv}>
                          {m.propose} / {m.vendu}
                        </span>
                        <span className={C.conv}>{pct(m.tauxConv)}</span>
                        <span className={C.pres}>—</span>
                        <span className={C.react}>—</span>
                        <span className={C.status}>—</span>
                      </div>
                    ))}
                    {c.caUnattributed > 0 && (
                      <div className="flex items-center gap-3 border-t px-3 py-1.5 text-sm">
                        <span className="w-4 shrink-0" />
                        <span className={`${C.name} pl-4 italic text-amber-600`}>
                          Non ventilé (identité à résoudre)
                        </span>
                        <span className={C.team}>—</span>
                        <span className={`${C.ca} italic text-amber-600`}>
                          {eur(c.caUnattributed)}
                        </span>
                        <span className={C.com}>—</span>
                        <span className={C.ppv}>—</span>
                        <span className={C.tips}>—</span>
                        <span className={C.pv}>—</span>
                        <span className={C.conv}>—</span>
                        <span className={C.pres}>—</span>
                        <span className={C.react}>—</span>
                        <span className={C.status}>—</span>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )
        })}
      </div>
    </div>
  )
}
