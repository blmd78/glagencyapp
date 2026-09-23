'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Combobox } from '@/components/ui/combobox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { eur, num, pct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { sourcesOf } from '../sources'
import { noteKey, type MktModeleRow, type SourceNotes } from '../types'
import type { MktGroup } from '@/lib/types/marketing'
import { SourceNoteDialog } from './source-note-dialog.client'

const TOUS = 'all'

/**
 * Onglet « Sources de trafic » : pour CHAQUE modèle, ses liens regroupés par réseau (demande
 * Benoit 2026-09-23), avec une note libre par réseau.
 *
 * Sélecteur = celui de toujours (`chatters/chatters-table.tsx` : Combobox « Tous les modèles »,
 * recherche, état local). Accordéons = les cartes de l'onglet Stats (`creator-section.client.tsx`),
 * repliées par défaut ; une modèle choisie au sélecteur s'ouvre d'elle-même — la `key` change
 * avec la sélection, la carte est remontée avec `defaultOpen`.
 */
export function MktSourcesView({
  modeles,
  groups,
  notes,
}: {
  modeles: MktModeleRow[]
  groups: MktGroup[]
  notes: SourceNotes
}) {
  const [modelId, setModelId] = useState(TOUS)
  const visibles = modelId === TOUS ? modeles : modeles.filter((m) => m.creatorId === modelId)

  return (
    <div className="flex flex-col gap-4">
      <Combobox
        value={modelId}
        onChange={(v) => setModelId(v || TOUS)}
        className="w-44"
        searchPlaceholder="Rechercher un modèle…"
        options={[
          { value: TOUS, label: 'Tous les modèles' },
          ...modeles.map((m) => ({ value: m.creatorId, label: m.name })),
        ]}
      />
      <div className="flex flex-col gap-2">
        {visibles.map((m) => (
          <ModelSources
            key={`${m.creatorId}:${modelId}`}
            m={m}
            groups={groups}
            notes={notes}
            defaultOpen={modelId !== TOUS}
          />
        ))}
        {modeles.length === 0 && <p className="text-sm text-muted-foreground">Aucune modèle sur cette période.</p>}
      </div>
    </div>
  )
}

function ModelSources({
  m,
  groups,
  notes,
  defaultOpen,
}: {
  m: MktModeleRow
  groups: MktGroup[]
  notes: SourceNotes
  defaultOpen: boolean
}) {
  const sources = sourcesOf(m.links, groups)
  const avecAbonnes = sources.filter((s) => s.conversions > 0)

  const entete = (
    <div className="flex flex-col gap-2 p-4 text-left">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-base font-medium">{m.name}</span>
        {sources.length > 0 && (
          <>
            <span className="text-lg font-semibold tabular-nums">{num(m.subsLiens)}</span>
            <span className="text-sm text-muted-foreground">abonnés via les liens</span>
            <span className="ml-auto text-sm text-muted-foreground tabular-nums">
              {sources.length} réseau{sources.length > 1 ? 'x' : ''} · {m.links.length} lien
              {m.links.length > 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>
      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun lien de tracking.</p>
      ) : (
        // La répartition des abonnés entre réseaux, à LEUR couleur de groupe : des longueurs, pas
        // seulement des teintes — chaque segment a sa ligne nommée dans le tableau. `flexGrow`
        // proportionnel pour que l'écart de 2 px entre segments ne fasse pas déborder la barre.
        <div
          className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`Abonnés de ${m.name} par réseau : ${avecAbonnes
            .map((s) => `${s.label} ${s.part === null ? '—' : pct(s.part)}`)
            .join(', ')}`}
        >
          {avecAbonnes.map((s) => (
            <span key={s.key} className="h-full" style={{ flexGrow: s.conversions, flexBasis: 0, background: s.color }} />
          ))}
        </div>
      )}
    </div>
  )

  if (sources.length === 0) {
    return <div className="rounded-lg border bg-card text-muted-foreground">{entete}</div>
  }

  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-lg border bg-card">
      <CollapsibleTrigger className="group flex w-full items-start gap-2 pr-4 text-left hover:bg-accent/40">
        <span className="min-w-0 flex-1">{entete}</span>
        <ChevronDown className="mt-5 size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t px-4 pb-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Réseau</TableHead>
                <TableHead className="text-right">Abonnés</TableHead>
                <TableHead className="text-right">Revenus</TableHead>
                <TableHead className="text-right">Clics</TableHead>
                <TableHead className="text-right">Conv.</TableHead>
                <TableHead className="text-right">Liens</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((s) => {
                const note = notes[noteKey(m.creatorId, s.key)]
                return (
                  <TableRow
                    key={s.key}
                    className={cn(s.conversions === 0 && s.revenueEur === 0 && 'text-muted-foreground')}
                  >
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                        {s.label}
                        {note && (
                          <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                            note
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="flex items-center justify-end gap-2">
                        {/* Micro-barre : le poids du réseau DANS la modèle (même geste que l'onglet Stats). */}
                        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${s.part ?? 0}%`, background: s.color }}
                          />
                        </span>
                        {num(s.conversions)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{eur(s.revenueEur)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(s.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.taux === null ? '—' : pct(s.taux)}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.liens}</TableCell>
                    <TableCell className="text-right">
                      <SourceNoteDialog
                        creatorId={m.creatorId}
                        modele={m.name}
                        groupKey={s.key}
                        reseau={s.label}
                        note={note}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
