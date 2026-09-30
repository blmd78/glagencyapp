'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { eur } from '@/lib/format'
import type { RankedChatter } from '../types'
import { initials, nameHue } from './podium-art'

/** Deux tableaux de 25 lignes côte à côte : 50 places par page. */
const PER_TABLE = 25
const PER_PAGE = PER_TABLE * 2

/**
 * Classement sous le podium (à partir de la 4e place) : deux tableaux shadcn côte à côte, une seule
 * pagination pour les deux — la page 1 montre les places 4 à 28 à gauche et 29 à 53 à droite. Rendu
 * sur la scène noire : le parent porte la classe `dark`, les primitives shadcn prennent donc leurs
 * couleurs sombres.
 */
export function StatRanking({ rows }: { rows: RankedChatter[] }) {
  const [page, setPage] = useState(0)
  if (rows.length === 0) return null

  const pageCount = Math.ceil(rows.length / PER_PAGE)
  // Une période plus courte peut compter moins de pages que celle qu'on regardait.
  const current = Math.min(page, pageCount - 1)
  const slice = rows.slice(current * PER_PAGE, (current + 1) * PER_PAGE)
  const tables = [slice.slice(0, PER_TABLE), slice.slice(PER_TABLE)].filter((t) => t.length > 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 lg:grid-cols-2">
        {tables.map((t) => (
          <RankTable key={t[0]?.id} rows={t} />
        ))}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Places {slice[0]?.rank}–{slice.at(-1)?.rank}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Page {current + 1} / {pageCount}
            </span>
            <Button variant="outline" size="sm" onClick={() => setPage(current - 1)} disabled={current === 0}>
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(current + 1)}
              disabled={current >= pageCount - 1}
            >
              Suivant
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function RankTable({ rows }: { rows: RankedChatter[] }) {
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-14">#</TableHead>
            <TableHead>Chatter</TableHead>
            <TableHead className="text-right">CA généré</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <RankRow key={r.id} row={r} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function RankRow({ row }: { row: RankedChatter }) {
  const hue = nameHue(row.name)
  const top10 = row.rank <= 10
  return (
    <TableRow>
      <TableCell>
        <span
          className={`grid h-6 w-9 place-items-center rounded-md text-xs font-bold tabular-nums ${
            top10 ? 'bg-amber-400/15 text-amber-300' : 'bg-white/[0.06] text-zinc-400'
          }`}
        >
          {row.rank}
        </span>
      </TableCell>
      {/* `w-full max-w-0` : la colonne du nom prend la place restante et tronque au lieu d'élargir le tableau. */}
      <TableCell className="w-full max-w-0">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold"
            style={{
              background: `hsl(${hue} 55% 14%)`,
              color: `hsl(${hue} 85% 72%)`,
              boxShadow: `inset 0 0 0 1.5px hsl(${hue} 70% 50% / 0.75)`,
            }}
          >
            {initials(row.name)}
          </span>
          <span className="truncate font-medium" title={row.name}>
            {row.name}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">{eur(row.ca)}</TableCell>
    </TableRow>
  )
}
