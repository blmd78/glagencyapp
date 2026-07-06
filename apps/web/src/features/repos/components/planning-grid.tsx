'use client'

import { useMemo, useState, useTransition } from 'react'
import { Check, Copy, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { saveReposCell, setReposSent } from '../actions'
import { JOURS, REPOS_COLUMNS, type ReposData } from '../types'

/** Prénoms d'une cellule (séparés par virgules), vides filtrés. */
const namesOf = (s: string) =>
  s
    .split(/[,\n]/)
    .map((n) => n.trim())
    .filter(Boolean)

/** Clé de comparaison de prénom (casse/accents/espaces tolérés). */
const normName = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '')

/**
 * Éditeur d'une cellule : multi-select des chatteurs actifs (recherche + coches),
 * avec ajout libre pour l'encadrement (managers/policiers hors liste chatteurs).
 * Sauvegarde à la fermeture du popover.
 */
function CellEditor({
  value,
  options,
  overNames,
  onCommit,
}: {
  value: string
  options: string[]
  /** Noms (normalisés) en sur-repos : plus de 2 repos dans la semaine sur cette équipe → chip rouge. */
  overNames: Set<string>
  onCommit: (names: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>(() => namesOf(value))
  const [custom, setCustom] = useState('')

  // Options = chatteurs actifs ∪ noms déjà présents (legacy/encadrement) — décochables.
  const allOptions = useMemo(() => {
    const set = new Set([...selected, ...options])
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [options, selected])

  const needle = search.trim().toLowerCase()
  const shown = needle ? allOptions.filter((n) => n.toLowerCase().includes(needle)) : allOptions

  const toggle = (name: string) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]))

  const addCustom = () => {
    const name = custom.trim()
    if (!name) return
    if (!selected.includes(name)) setSelected((prev) => [...prev, name])
    setCustom('')
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setSelected(namesOf(value)) // re-sync à l'ouverture (source = serveur)
      setSearch('')
    } else {
      onCommit(selected) // sauvegarde à la fermeture
    }
  }

  const display = namesOf(value)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Cliquer pour choisir les chatteurs au repos"
          className={cn(
            'group flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border px-1.5 py-1 text-left transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            display.length
              ? 'border-transparent hover:bg-muted/50'
              : 'border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/40',
          )}
        >
          {display.length ? (
            <>
              {display.map((n) => {
                const over = overNames.has(normName(n))
                return (
                  <span
                    key={n}
                    title={over ? `${n} : plus de 2 repos cette semaine` : undefined}
                    className={cn(
                      'rounded px-1.5 py-0.5 text-xs font-medium',
                      over
                        ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                        : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
                    )}
                  >
                    {n}
                  </span>
                )
              })}
              <Plus className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-70" />
            </>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
              <Plus className="size-3" />
              Ajouter
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un chatteur…"
          className="mb-2 h-8 text-xs"
        />
        <div className="max-h-56 overflow-y-auto pr-1">
          {shown.length === 0 && (
            <p className="px-1 py-2 text-xs text-muted-foreground">Aucun résultat.</p>
          )}
          {shown.map((name) => (
            <label
              key={name}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/60"
            >
              <Checkbox checked={selected.includes(name)} onCheckedChange={() => toggle(name)} />
              <span className="truncate">{name}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5 border-t pt-2">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustom()
              }
            }}
            placeholder="Autre (manager, policier…)"
            className="h-8 text-xs"
          />
          <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={addCustom}>
            <Plus className="size-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Grille hebdo : 7 jours × colonnes d'équipes. Cellule = multi-select des chatteurs,
 * verte quand remplie (comme la sheet). Compteurs par équipe + total, case « envoyé
 * sur Telegram », copie du planning formaté pour le partage.
 */
export function PlanningGrid({ data }: { data: ReposData }) {
  // Overrides locaux uniquement (une revalidation n'écrase pas une édition en cours).
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [sent, setSent] = useState(data.sentTelegram)
  const [copied, setCopied] = useState(false)
  const [, startTransition] = useTransition()

  const cellValue = (day: number, col: string) =>
    overrides[`${day}:${col}`] ?? data.cells[day]?.[col] ?? ''

  // Règle de la sheet : ROUGE quand une MÊME PERSONNE cumule plus de 2 repos dans la
  // semaine sur sa colonne d'équipe (signal d'abus de repos — un chatteur = ~1 repos/sem).
  // Comptage par (colonne, prénom normalisé) : deux homonymes de colonnes différentes
  // ne se mélangent pas.
  const overNamesByCol = useMemo(() => {
    const res = new Map<string, Set<string>>()
    for (const c of REPOS_COLUMNS) {
      const counts = new Map<string, number>()
      for (let day = 0; day < JOURS.length; day++) {
        for (const n of namesOf(cellValue(day, c.key))) {
          const k = normName(n)
          counts.set(k, (counts.get(k) ?? 0) + 1)
        }
      }
      res.set(c.key, new Set([...counts.entries()].filter(([, n]) => n > 2).map(([k]) => k)))
    }
    return res
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.cells, overrides])

  function commitCell(day: number, col: string, names: string[]) {
    const value = names.join(', ')
    if (value === cellValue(day, col)) return
    setOverrides((prev) => ({ ...prev, [`${day}:${col}`]: value }))
    startTransition(async () => {
      await saveReposCell({ weekStart: data.weekStart, day, col, names: value })
    })
  }

  function toggleSent(next: boolean) {
    setSent(next)
    startTransition(async () => {
      await setReposSent({ weekStart: data.weekStart, sent: next })
    })
  }

  /** Image PNG du tableau (rendu partage : fond blanc, verts/rouges, compteurs) —
   *  copiée dans le presse-papier (collable telle quelle dans Telegram), sinon téléchargée. */
  async function copyForTelegram() {
    const SCALE = 2
    const DAY_W = 110
    const COL_W = 158
    const width = DAY_W + REPOS_COLUMNS.length * COL_W
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const font = (px: number, weight = 400) => `${weight} ${px}px Inter, system-ui, sans-serif`

    // Découpe les noms d'une cellule en lignes qui tiennent dans la colonne.
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

    // Pré-calcul des hauteurs de lignes (selon le wrapping le plus haut du jour).
    const PAD = 8
    const LINE_H = 16
    const cellLines = JOURS.map((_, day) =>
      REPOS_COLUMNS.map((c) => wrap(namesOf(cellValue(day, c.key)), COL_W - PAD * 2)),
    )
    const rowH = cellLines.map((cols) => Math.max(...cols.map((l) => l.length)) * LINE_H + PAD * 2)
    const HEADER_H = 64
    const THEAD_H = 34
    const COUNT_H = 34
    const height = HEADER_H + THEAD_H + rowH.reduce((a, b) => a + b, 0) + COUNT_H + 12

    canvas.width = width * SCALE
    canvas.height = height * SCALE
    ctx.scale(SCALE, SCALE)

    // Fond + titre
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#111111'
    ctx.font = font(17, 700)
    ctx.fillText(`Planning des repos — ${data.weekLabel}`, 16, 30)
    ctx.font = font(12)
    ctx.fillStyle = '#6b7280'
    ctx.fillText(`Total repos semaine : ${total}`, 16, 50)

    // En-têtes de colonnes
    let y = HEADER_H
    ctx.fillStyle = '#f4f4f5'
    ctx.fillRect(0, y, width, THEAD_H)
    ctx.fillStyle = '#374151'
    ctx.font = font(11, 600)
    ctx.fillText('JOUR', 16, y + 21)
    REPOS_COLUMNS.forEach((c, i) => {
      ctx.fillText(c.label.toUpperCase(), DAY_W + i * COL_W + PAD, y + 21)
    })
    y += THEAD_H

    // Lignes jours
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
      REPOS_COLUMNS.forEach((c, i) => {
        const x = DAY_W + i * COL_W
        const value = cellValue(day, c.key)
        const filled = namesOf(value).length > 0
        const alert = namesOf(value).some((n) => (overNamesByCol.get(c.key) ?? new Set()).has(normName(n)))
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

    // Ligne compteurs
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
    REPOS_COLUMNS.forEach((c, i) => {
      ctx.fillText(String(countFor(c.key)), DAY_W + i * COL_W + PAD, y + 21)
    })

    // Séparation verticale encadrement
    const encX = DAY_W + REPOS_COLUMNS.filter((c) => !c.encadrement).length * COL_W
    ctx.strokeStyle = '#d1d5db'
    ctx.beginPath()
    ctx.moveTo(encX, HEADER_H)
    ctx.lineTo(encX, y + COUNT_H)
    ctx.stroke()

    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'))
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } catch {
      // Presse-papier image indisponible (navigateur/permission) → téléchargement.
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

  const countFor = (col: string) =>
    JOURS.reduce((s, _, day) => s + namesOf(cellValue(day, col)).length, 0)
  const total = REPOS_COLUMNS.reduce((s, c) => s + countFor(c.key), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[64rem] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="w-24" />
              <th
                colSpan={REPOS_COLUMNS.filter((c) => !c.encadrement).length}
                className="px-2 pt-2 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Équipes chatters par modèle
              </th>
              <th
                colSpan={REPOS_COLUMNS.filter((c) => c.encadrement).length}
                className="border-l px-2 pt-2 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Encadrement
              </th>
            </tr>
            <tr className="bg-muted/50">
              <th className="w-24 px-3 pb-2 text-left text-xs font-medium text-muted-foreground">
                Jour
              </th>
              {REPOS_COLUMNS.map((c, i) => (
                <th
                  key={c.key}
                  className={cn(
                    'px-2 pb-2 text-left text-xs font-medium text-muted-foreground',
                    c.encadrement && REPOS_COLUMNS[i - 1] && !REPOS_COLUMNS[i - 1].encadrement && 'border-l',
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {JOURS.map((jour, day) => (
              <tr key={jour} className="border-t">
                <td className="px-3 py-1.5 font-medium">{jour}</td>
                {REPOS_COLUMNS.map((c, i) => (
                  <td
                    key={c.key}
                    className={cn(
                      'p-1 align-top',
                      c.encadrement && REPOS_COLUMNS[i - 1] && !REPOS_COLUMNS[i - 1].encadrement && 'border-l',
                    )}
                  >
                    <CellEditor
                      value={cellValue(day, c.key)}
                      options={data.chatterNames}
                      overNames={overNamesByCol.get(c.key) ?? new Set()}
                      onCommit={(names) => commitCell(day, c.key, names)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t bg-muted/30">
              <td className="px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Nb repos
              </td>
              {REPOS_COLUMNS.map((c, i) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-2 py-2 font-semibold tabular-nums',
                    c.encadrement && REPOS_COLUMNS[i - 1] && !REPOS_COLUMNS[i - 1].encadrement && 'border-l',
                  )}
                >
                  {countFor(c.key)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Légende du code couleur — pour que n'importe qui lise la grille sans explication. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
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
