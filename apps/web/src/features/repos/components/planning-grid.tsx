'use client'

import { useMemo, useState, useTransition } from 'react'
import { Check, Copy, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { saveReposCell, saveReposColumnMembers, setReposSent } from '../actions'
import { EntityMultiSelect } from './entity-multiselect'
import { JOURS, REPOS_COLUMNS, type ReposCell, type ReposData } from '../types'

/** Tokens d'un texte libre (séparés par virgules), vides filtrés. */
const tokensOf = (s: string) =>
  s
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean)

/** Clé de comparaison de nom libre (casse/accents/espaces tolérés). */
const normName = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '')

const EMPTY_CELL: ReposCell = { chatterIds: [], names: '' }

/**
 * Grille hebdo : 7 jours × colonnes de modèles. Cellule = chatteurs au repos (multi-select),
 * verte quand remplie, rouge si > 2 repos/semaine pour une même personne. En-tête modèles en
 * chips violets, éditable par l'admin (crayon → compo datée). Copie du planning en image.
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

  /** Chips d'une cellule : chatteurs (IDs résolus) puis texte libre, avec drapeau sur-repos. */
  function cellChips(day: number, col: string) {
    const c = cellValue(day, col)
    const over = overByCol.get(col) ?? { ids: new Set<string>(), txt: new Set<string>() }
    const chips: { key: string; label: string; over: boolean }[] = []
    for (const id of c.chatterIds)
      chips.push({ key: id, label: data.chatterById[id] ?? '?', over: over.ids.has(id) })
    for (const t of tokensOf(c.names))
      chips.push({ key: `txt:${t}`, label: t, over: over.txt.has(normName(t)) })
    return chips
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
      await saveReposCell({
        weekStart: data.weekStart,
        day,
        col,
        chatterIds: nextCell.chatterIds,
        names: nextCell.names,
      })
    })
  }

  function commitColumn(col: string, ids: string[]) {
    setColumnOverrides((prev) => ({ ...prev, [col]: ids }))
    startTransition(async () => {
      await saveReposColumnMembers({ col, effectiveFrom: data.weekStart, creatorIds: ids })
    })
  }

  function toggleSent(next: boolean) {
    setSent(next)
    startTransition(async () => {
      await setReposSent({ weekStart: data.weekStart, sent: next })
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
    const SCALE = 2
    const DAY_W = 110
    const COL_W = 158
    const width = DAY_W + columns.length * COL_W
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const font = (px: number, weight = 400) => `${weight} ${px}px Inter, system-ui, sans-serif`

    const wrap = (names: string[], maxW: number): string[] => {
      ctx.font = font(12)
      const lines: string[] = []
      let cur = ''
      for (const n of names) {
        const next = cur ? `${cur}, ${n}` : n
        if (cur && ctx.measureText(next).width > maxW) {
          lines.push(cur + ',')
          cur = n
        } else cur = next
      }
      if (cur) lines.push(cur)
      return lines.length ? lines : ['—']
    }

    const PAD = 8
    const LINE_H = 16
    const cellLines = JOURS.map((_, day) =>
      columns.map((c) => wrap(cellChips(day, c.key).map((ch) => ch.label), COL_W - PAD * 2)),
    )
    const rowH = cellLines.map((cols) => Math.max(...cols.map((l) => l.length)) * LINE_H + PAD * 2)
    // En-têtes : modèles = noms wrappés (chips violets) ; encadrement = libellé de rôle.
    const headerLines = columns.map((c) =>
      c.encadrement || !c.creatorIds.length
        ? [c.label]
        : wrap(
            c.creatorIds.map((id) => data.creatorById[id] ?? '?'),
            COL_W - PAD * 2,
          ),
    )
    const HEADER_H = 64
    const THEAD_H = Math.max(2, ...headerLines.map((l) => l.length)) * LINE_H + PAD * 2
    const COUNT_H = 34
    const height = HEADER_H + THEAD_H + rowH.reduce((a, b) => a + b, 0) + COUNT_H + 12

    canvas.width = width * SCALE
    canvas.height = height * SCALE
    ctx.scale(SCALE, SCALE)

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#111111'
    ctx.font = font(17, 700)
    ctx.fillText(`Planning des repos — ${data.weekLabel}`, 16, 30)
    ctx.font = font(12)
    ctx.fillStyle = '#6b7280'
    ctx.fillText(`Total repos semaine : ${total}`, 16, 50)

    let y = HEADER_H
    ctx.fillStyle = '#f4f4f5'
    ctx.fillRect(0, y, width, THEAD_H)
    // Fond violet clair sous les colonnes modèles (chips à l'écran).
    columns.forEach((c, i) => {
      if (!c.encadrement && c.creatorIds.length) {
        ctx.fillStyle = '#ede9fe' // violet-100
        ctx.fillRect(DAY_W + i * COL_W, y, COL_W, THEAD_H)
      }
    })
    ctx.font = font(11, 600)
    ctx.fillStyle = '#374151'
    ctx.fillText('JOUR', 16, y + PAD + 9)
    columns.forEach((c, i) => {
      const isModel = !c.encadrement && c.creatorIds.length > 0
      ctx.fillStyle = isModel ? '#6d28d9' : '#374151' // violet-700 / gris
      headerLines[i].forEach((line, li) => {
        ctx.fillText(
          isModel ? line : line.toUpperCase(),
          DAY_W + i * COL_W + PAD,
          y + PAD + 9 + li * LINE_H,
        )
      })
    })
    y += THEAD_H

    JOURS.forEach((jour, day) => {
      const h = rowH[day]
      ctx.strokeStyle = '#e5e7eb'
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
      ctx.fillStyle = '#111111'
      ctx.font = font(12, 600)
      ctx.fillText(jour, 16, y + PAD + 12)
      columns.forEach((c, i) => {
        const x = DAY_W + i * COL_W
        const chips = cellChips(day, c.key)
        const filled = chips.length > 0
        const alert = chips.some((ch) => ch.over)
        if (filled) {
          ctx.fillStyle = alert ? '#fee2e2' : '#dcfce7'
          ctx.fillRect(x + 2, y + 2, COL_W - 4, h - 4)
        }
        ctx.fillStyle = filled ? (alert ? '#991b1b' : '#166534') : '#d1d5db'
        ctx.font = font(12)
        cellLines[day][i].forEach((line, li) => {
          ctx.fillText(line, x + PAD, y + PAD + 12 + li * LINE_H)
        })
      })
      y += h
    })

    ctx.strokeStyle = '#e5e7eb'
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
    ctx.fillStyle = '#f4f4f5'
    ctx.fillRect(0, y, width, COUNT_H)
    ctx.fillStyle = '#374151'
    ctx.font = font(11, 600)
    ctx.fillText('NB REPOS', 16, y + 21)
    columns.forEach((c, i) => {
      ctx.fillText(String(countFor(c.key)), DAY_W + i * COL_W + PAD, y + 21)
    })

    const encX = DAY_W + columns.filter((c) => !c.encadrement).length * COL_W
    ctx.strokeStyle = '#d1d5db'
    ctx.beginPath()
    ctx.moveTo(encX, HEADER_H)
    ctx.lineTo(encX, y + COUNT_H)
    ctx.stroke()

    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'))
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } catch {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `planning-repos-${data.weekStart}.png`
      a.click()
      URL.revokeObjectURL(url)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /** Chips violets des modèles d'une colonne (header). */
  const creatorChips = (creatorIds: string[]) =>
    creatorIds.map((id) => (
      <span
        key={id}
        className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-300"
      >
        {data.creatorById[id] ?? '?'}
      </span>
    ))

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[64rem] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="w-24" />
              <th
                colSpan={columns.filter((c) => !c.encadrement).length}
                className="px-2 pt-2 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Équipes chatters par modèle
              </th>
              <th
                colSpan={columns.filter((c) => c.encadrement).length}
                className="border-l px-2 pt-2 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Encadrement
              </th>
            </tr>
            <tr className="bg-muted/50 align-top">
              <th className="w-24 px-3 pb-2 text-left text-xs font-medium text-muted-foreground">
                Jour
              </th>
              {columns.map((c, i) => {
                const border =
                  c.encadrement && columns[i - 1] && !columns[i - 1].encadrement && 'border-l'
                // Colonnes encadrement : libellé de rôle fixe.
                if (c.encadrement) {
                  return (
                    <th
                      key={c.key}
                      className={cn(
                        'px-2 pb-2 text-left text-xs font-medium text-muted-foreground',
                        border,
                      )}
                    >
                      {c.label}
                    </th>
                  )
                }
                // Colonnes modèles : chips violets (+ crayon admin).
                const chips = c.creatorIds.length ? (
                  <span className="flex flex-wrap items-center gap-1">
                    {creatorChips(c.creatorIds)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">{c.label}</span>
                )
                return (
                  <th key={c.key} className={cn('px-2 pb-2 text-left', border)}>
                    {isAdmin ? (
                      <EntityMultiSelect
                        trigger={
                          <button
                            type="button"
                            title="Modifier les modèles de la colonne"
                            className="group flex w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                          >
                            {chips}
                            <Pencil className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-70" />
                          </button>
                        }
                        value={c.creatorIds}
                        options={data.creatorOptions}
                        nameById={data.creatorById}
                        searchPlaceholder="Rechercher un modèle…"
                        onCommit={({ ids }) => commitColumn(c.key, ids)}
                      />
                    ) : (
                      chips
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {JOURS.map((jour, day) => (
              <tr key={jour} className="border-t">
                <td className="px-3 py-1.5 font-medium">{jour}</td>
                {columns.map((c, i) => {
                  const border =
                    c.encadrement && columns[i - 1] && !columns[i - 1].encadrement && 'border-l'
                  const chips = cellChips(day, c.key)
                  const cell = cellValue(day, c.key)
                  return (
                    <td key={c.key} className={cn('p-1 align-top', border)}>
                      <EntityMultiSelect
                        trigger={
                          <button
                            type="button"
                            title="Cliquer pour choisir les chatteurs au repos"
                            className={cn(
                              'group flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border px-1.5 py-1 text-left transition-colors',
                              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                              chips.length
                                ? 'border-transparent hover:bg-muted/50'
                                : 'border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/40',
                            )}
                          >
                            {chips.length ? (
                              <>
                                {chips.map((ch) => (
                                  <span
                                    key={ch.key}
                                    title={
                                      ch.over ? `${ch.label} : plus de 2 repos cette semaine` : undefined
                                    }
                                    className={cn(
                                      'rounded px-1.5 py-0.5 text-xs font-medium',
                                      ch.over
                                        ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                        : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
                                    )}
                                  >
                                    {ch.label}
                                  </span>
                                ))}
                                <Plus className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-70" />
                              </>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                                <Plus className="size-3" />
                                Ajouter
                              </span>
                            )}
                          </button>
                        }
                        value={cell.chatterIds}
                        options={data.chatterOptions}
                        nameById={data.chatterById}
                        allowCustom={c.encadrement}
                        customValue={cell.names}
                        searchPlaceholder="Rechercher un chatteur…"
                        customPlaceholder="Autre (manager, policier…)"
                        onCommit={(next) => commitCell(day, c.key, next)}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className="border-t bg-muted/30">
              <td className="px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Nb repos
              </td>
              {columns.map((c, i) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-2 py-2 font-semibold tabular-nums',
                    c.encadrement && columns[i - 1] && !columns[i - 1].encadrement && 'border-l',
                  )}
                >
                  {countFor(c.key)}
                </td>
              ))}
            </tr>
          </tbody>
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
