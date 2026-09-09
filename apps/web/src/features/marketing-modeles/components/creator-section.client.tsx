'use client'

import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { typeBadge } from '@/lib/type-badge'
import { eur, num, pct } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { MktModeleRow } from '../types'

const VIA = '#8b5cf6'

const TYPE_LABEL: Record<MktModeleRow['links'][number]['type'], string> = {
  twitter: 'X',
  instagram: 'Insta',
  telegram: 'Telegram',
  other: 'Autre',
}

/** Une valeur, ou « — » si elle n'a pas de sens (pas de base de calcul). Jamais « 0 % ». */
const part = (v: number | null) => (v === null ? '—' : pct(v))

/**
 * Une bande par modèle : ses totaux, ce que les liens y apportent, et la barre de part.
 * Dépliée, la table de ses liens — triée par abonnés, l'ordre qui dit ce que le marketing
 * rapporte vraiment (le CA d'un lien est trois à cinq fois plus faible que sa contribution
 * en abonnés, cf. spec §0.2).
 *
 * La LISTE TRIÉE est le graphique de comparaison entre modèles : pas de second graphe pour
 * classer, et pas de couleur par modèle.
 */
export function MktCreatorSection({ m }: { m: MktModeleRow }) {
  const vide = m.links.length === 0

  const entete = (
    <div className="flex flex-col gap-2 p-4 text-left">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-base font-medium">{m.name}</span>
        <span className="text-lg font-semibold tabular-nums">{eur(m.caTotal)}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {num(m.newSubs)} nouveaux abonnés
        </span>
        {/* Ce que vaut un abonné chez elle — la lecture qui manque quand on ne compare que
            des totaux : deux modèles au même CA n'ont pas le même coût d'acquisition. */}
        {m.ltv !== null && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {eur(m.ltv)}/abonné
          </span>
        )}
        {!vide && (
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">
            {m.links.length} lien{m.links.length > 1 ? 's' : ''} · {num(m.clics)} clics
          </span>
        )}
      </div>

      {vide ? (
        <p className="text-sm text-muted-foreground">Aucun lien de tracking.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">
              liens : <span className="font-medium text-foreground tabular-nums">{eur(m.caLiens)}</span>{' '}
              ({part(m.partCa)} du CA)
            </span>
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{num(m.subsLiens)}</span>{' '}
              abonnés ({part(m.partSubs)})
            </span>
          </div>
          {/* La barre de part : la comparaison entre modèles se lit sur des longueurs
              alignées, pas sur des teintes. */}
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${part(m.partSubs)} des nouveaux abonnés de ${m.name} viennent d'un lien`}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(m.partSubs ?? 0, 100)}%`, background: VIA }}
            />
          </div>
        </>
      )}
    </div>
  )

  if (vide) {
    return <div className="rounded-lg border bg-card text-muted-foreground">{entete}</div>
  }

  return (
    <Collapsible className="rounded-lg border bg-card">
      <CollapsibleTrigger className="group flex w-full items-start gap-2 pr-4 text-left hover:bg-accent/40">
        <span className="min-w-0 flex-1">{entete}</span>
        <ChevronDown className="mt-5 size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t px-4 pb-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lien</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Abonnés</TableHead>
                <TableHead className="text-right">CA</TableHead>
                <TableHead className="text-right">Clics</TableHead>
                <TableHead className="text-right">Conv.</TableHead>
                <TableHead className="text-right">€/abonné</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {m.links.map((l) => (
                <TableRow key={l.id} className={cn(!l.active && 'text-muted-foreground')}>
                  <TableCell className="max-w-[220px] truncate font-medium" title={l.name}>
                    {l.name}
                  </TableCell>
                  <TableCell>
                    <Badge className={typeBadge(l.type)}>{TYPE_LABEL[l.type]}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="flex items-center justify-end gap-2">
                      {/* Micro-barre : le poids du lien DANS sa modèle, lisible d'un coup d'œil. */}
                      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${m.subsLiens > 0 ? Math.round((l.conversions / m.subsLiens) * 100) : 0}%`,
                            background: VIA,
                          }}
                        />
                      </span>
                      {num(l.conversions)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{eur(l.revenueEur)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(l.clicks)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.taux === null ? '—' : pct(l.taux)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.ltv === null ? '—' : eur(l.ltv)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
