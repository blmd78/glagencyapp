// Export du planning en image PNG (partage Telegram) — util Blob/DOM/canvas, hors composant
// (split de `planning-grid.tsx`, docs/guidelines-standard-feature.md §1, modèle
// `download-ranking.ts`). Copié dans le presse-papier, sinon téléchargé (fallback navigateur).

import { JOURS, type ReposColumn } from '../types'
import type { CellChip } from './planning-grid-utils'

/** Rendu canvas + copie presse-papier (fallback téléchargement) du planning de la semaine. */
export async function copyPlanningImage(params: {
  weekLabel: string
  weekStart: string
  columns: ReposColumn[]
  creatorById: Record<string, string>
  cellChips: (day: number, col: string) => CellChip[]
  countFor: (col: string) => number
  total: number
}): Promise<void> {
  const { weekLabel, weekStart, columns, creatorById, cellChips, countFor, total } = params
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
          c.creatorIds.map((id) => creatorById[id] ?? '?'),
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
  ctx.fillText(`Planning des repos — ${weekLabel}`, 16, 30)
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
    a.download = `planning-repos-${weekStart}.png`
    a.click()
    URL.revokeObjectURL(url)
  }
}
