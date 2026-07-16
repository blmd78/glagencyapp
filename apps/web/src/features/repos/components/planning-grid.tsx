'use client'

import { useMemo, useState, useTransition } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { saveReposCell, saveReposColumnMembers, setReposSent } from '../actions'
import { JOURS, REPOS_COLUMNS, type ReposCell, type ReposData } from '../types'
import { copyPlanningImage } from './planning-image'
import { PlanningGridHeader } from './planning-grid-header'
import { PlanningGridRows } from './planning-grid-rows'
import { EMPTY_CELL, normName, tokensOf, type CellChip } from './planning-grid-utils'

/**
 * Grille hebdo : 7 jours × colonnes de modèles. Cellule = chatteurs au repos (multi-select),
 * verte quand remplie, rouge si > 2 repos/semaine pour une même personne. En-tête modèles en
 * chips violets, éditable par l'admin (crayon → compo datée). Copie du planning en image.
 * Split > 300 lignes (docs/guidelines-standard-feature.md §1) : `planning-grid-header.tsx`
 * (thead), `planning-grid-rows.tsx` (tbody), `planning-grid-utils.ts` (tokens/couleurs, hors
 * composant) et `planning-image.ts` (export canvas/presse-papier, hors composant) — modèle
 * `chatters-columns.tsx`/`chatters-sub-rows.tsx`/`download-ranking.ts`. DOM inchangé.
 */
export function PlanningGrid({ data, isAdmin }: { data: ReposData; isAdmin: boolean }) {
  // Overrides locaux optimistes (une revalidation n'écrase pas une édition en cours).
  const [overrides, setOverrides] = useState<Record<string, ReposCell>>({})
  const [columnOverrides, setColumnOverrides] = useState<Record<string, string[]>>({})
  const [sent, setSent] = useState(data.sentTelegram)
  const [copied, setCopied] = useState(false)
  const [, startTransition] = useTransition()

  const cellValue = (day: number, col: string): ReposCell =>
    overrides[`${day}:${col}`] ?? data.cells[day]?.[col] ?? EMPTY_CELL

  // Colonnes résolues (compo modèles + override local) → libellé recalculé depuis creatorById.
  const columns = useMemo(
    () =>
      data.columns.map((c) => {
        const creatorIds = columnOverrides[c.key] ?? c.creatorIds
        const label = creatorIds.length
          ? creatorIds.map((id) => data.creatorById[id] ?? '?').join(' + ')
          : c.label
        return { ...c, creatorIds, label }
      }),
    [data.columns, data.creatorById, columnOverrides],
  )

  // ROUGE : une même personne cumule > 2 repos dans la semaine sur sa colonne. Comptage par
  // (colonne, chatter_id) pour les IDs, et par (colonne, nom normalisé) pour le texte libre.
  const overByCol = useMemo(() => {
    const res = new Map<string, { ids: Set<string>; txt: Set<string> }>()
    for (const col of REPOS_COLUMNS) {
      const idCounts = new Map<string, number>()
      const txtCounts = new Map<string, number>()
      for (let day = 0; day < JOURS.length; day++) {
        const c = cellValue(day, col.key)
        for (const id of c.chatterIds) idCounts.set(id, (idCounts.get(id) ?? 0) + 1)
        for (const t of tokensOf(c.names)) {
          const k = normName(t)
          txtCounts.set(k, (txtCounts.get(k) ?? 0) + 1)
        }
      }
      res.set(col.key, {
        ids: new Set([...idCounts.entries()].filter(([, n]) => n > 2).map(([k]) => k)),
        txt: new Set([...txtCounts.entries()].filter(([, n]) => n > 2).map(([k]) => k)),
      })
    }
    return res
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.cells, overrides])

  /** Chips d'une cellule : chatteurs (IDs résolus) puis texte libre (legacy), avec drapeau sur-repos. */
  function cellChips(day: number, col: string): CellChip[] {
    const c = cellValue(day, col)
    const over = overByCol.get(col) ?? { ids: new Set<string>(), txt: new Set<string>() }
    const chips: CellChip[] = []
    for (const id of c.chatterIds)
      chips.push({ key: id, label: data.chatterById[id] ?? '?', over: over.ids.has(id), id })
    for (const t of tokensOf(c.names))
      chips.push({ key: `txt:${t}`, label: t, over: over.txt.has(normName(t)), token: t })
    return chips
  }

  /** Retrait direct d'un chip de cellule (croix) — id chatteur ou token texte legacy. */
  function removeCellChip(day: number, col: string, chip: { id?: string; token?: string }) {
    const cur = cellValue(day, col)
    commitCell(day, col, {
      ids: chip.id ? cur.chatterIds.filter((x) => x !== chip.id) : cur.chatterIds,
      names: chip.token
        ? tokensOf(cur.names)
            .filter((t) => t !== chip.token)
            .join(', ')
        : cur.names,
    })
  }

  function commitCell(day: number, col: string, next: { ids: string[]; names: string }) {
    const cur = cellValue(day, col)
    const nextCell: ReposCell = { chatterIds: next.ids, names: next.names.trim() }
    if (
      cur.chatterIds.join(',') === nextCell.chatterIds.join(',') &&
      cur.names.trim() === nextCell.names
    )
      return
    setOverrides((prev) => ({ ...prev, [`${day}:${col}`]: nextCell }))
    startTransition(async () => {
      const res = await saveReposCell({
        weekStart: data.weekStart,
        day,
        col,
        chatterIds: nextCell.chatterIds,
        names: nextCell.names,
      })
      // Succès silencieux (sauvegarde immédiate à chaque ajout/retrait dans le combobox — un
      // toast par clic serait bruyant) ; l'échec, lui, était avalé avant ce refacto → surfacé.
      if (!res.success) toast.error(res.error)
    })
  }

  function commitColumn(col: string, ids: string[]) {
    setColumnOverrides((prev) => ({ ...prev, [col]: ids }))
    startTransition(async () => {
      const res = await saveReposColumnMembers({ col, effectiveFrom: data.weekStart, creatorIds: ids })
      if (!res.success) toast.error(res.error)
    })
  }

  function toggleSent(next: boolean) {
    setSent(next)
    startTransition(async () => {
      const res = await setReposSent({ weekStart: data.weekStart, sent: next })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success(next ? 'Planning marqué comme envoyé' : 'Planning marqué comme non envoyé')
    })
  }

  const countFor = (col: string) =>
    JOURS.reduce((s, _, day) => {
      const c = cellValue(day, col)
      return s + c.chatterIds.length + tokensOf(c.names).length
    }, 0)
  const total = columns.reduce((s, c) => s + countFor(c.key), 0)

  /** Image PNG du tableau (partage Telegram) — copiée dans le presse-papier, sinon téléchargée. */
  async function copyForTelegram() {
    await copyPlanningImage({
      weekLabel: data.weekLabel,
      weekStart: data.weekStart,
      columns,
      creatorById: data.creatorById,
      cellChips,
      countFor,
      total,
    })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[64rem] border-collapse text-sm">
          <PlanningGridHeader
            columns={columns}
            isAdmin={isAdmin}
            creatorOptions={data.creatorOptions}
            creatorById={data.creatorById}
            onCommitColumn={commitColumn}
          />
          <PlanningGridRows
            columns={columns}
            data={data}
            cellValue={cellValue}
            cellChips={cellChips}
            overByCol={overByCol}
            onCommitCell={commitCell}
            onRemoveCellChip={removeCellChip}
            countFor={countFor}
          />
        </table>
      </div>

      {/* Légende du code couleur. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="rounded bg-violet-100 px-1.5 py-0.5 font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-300">
            violet
          </span>
          modèle de la colonne
        </span>
        <span className="flex items-center gap-1.5">
          <span className="rounded bg-green-100 px-1.5 py-0.5 font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
            vert
          </span>
          repos posé
        </span>
        <span className="flex items-center gap-1.5">
          <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
            rouge
          </span>
          plus de 2 repos dans la semaine pour une même personne
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm">
          <span className="text-muted-foreground">Total repos semaine :</span>{' '}
          <span className="font-semibold tabular-nums">{total}</span>
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={sent} onCheckedChange={(v) => toggleSent(v === true)} />
          Planning envoyé sur Telegram
        </label>
        <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={copyForTelegram}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Image copiée !' : 'Copier l’image pour Telegram'}
        </Button>
      </div>
    </div>
  )
}
