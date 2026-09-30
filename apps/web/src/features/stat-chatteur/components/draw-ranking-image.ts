import { eur } from '@/lib/format'
import type { Period } from '@/lib/period'
import type { RankedChatter } from '../types'
import {
  CROWN_PATH,
  GOLD_CONFETTI,
  LAUREL_LEAVES,
  LAUREL_STEMS,
  METAL,
  initials,
  nameHue,
  type Place,
} from './podium-art'

/**
 * Image partageable du classement (PNG 1080×1350, format portrait des messageries) : podium + places
 * 4 à 33. Au-delà, sur 1080 px de large, les noms deviennent illisibles — la page, elle, montre tout.
 *
 * Dessinée au canvas dans le navigateur, à partir des lignes déjà chargées : ni dépendance, ni
 * aller-retour serveur. Utilitaire DOM pur, hors composant (précédent : `download-ranking.ts` du
 * pilote Chatteurs). Les polices sont celles de la Formation (`--font-gla-*`), déjà auto-hébergées
 * par `next/font`.
 */
export const EXPORT_ROWS = 33

const W = 1080
const H = 1350
const BG = '#09090b'
/** Bas des marches du podium. */
const BASE_Y = 650
const LIST_TOP = 684
const ROW_H = 36.5
const ROWS_PER_COL = 15

interface Fonts {
  head: string
  body: string
}

export async function downloadRankingImage(rows: RankedChatter[], period: Period, total: number): Promise<void> {
  const canvas = await renderRankingImage(rows, period, total)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Image vide')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `classement-chatters-${period.from}_${period.to}.png`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Dessine l'image sans la télécharger (séparé pour pouvoir l'afficher ou la tester). `rows` peut
 * être tronqué à `EXPORT_ROWS` ; `total` = nombre de classés sur la période, pour le pied de page.
 */
export async function renderRankingImage(rows: RankedChatter[], period: Period, total: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponible')

  const fonts = await loadFonts()
  drawBackground(ctx)
  drawTitle(ctx, period, fonts)
  const top = rows.slice(0, 3)
  ;([2, 3, 1] as const).forEach((place) => {
    const row = top[place - 1]
    if (row) drawStep(ctx, row, place, fonts)
  })
  drawList(ctx, rows.slice(3, EXPORT_ROWS), fonts)
  drawFooter(ctx, period, total, fonts)
  return canvas
}

/** Familles `next/font` (noms hachés) lues sur `<html>` ; repli système si absentes. */
async function loadFonts(): Promise<Fonts> {
  const css = getComputedStyle(document.documentElement)
  const head = css.getPropertyValue('--font-gla-head').trim() || 'system-ui, sans-serif'
  const body = css.getPropertyValue('--font-gla-body').trim() || 'system-ui, sans-serif'
  // Une police jamais utilisée sur la page n'est pas téléchargée : on la force avant de dessiner,
  // sinon le canvas écrit en police système. Un échec garde simplement le repli.
  await Promise.all([
    document.fonts.load(`700 64px ${head}`),
    document.fonts.load(`500 20px ${body}`),
    document.fonts.load(`700 20px ${body}`),
  ]).catch(() => undefined)
  return { head, body }
}

// ─── Décor ───────────────────────────────────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  // Faisceaux du projecteur, depuis le haut vers le podium.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const [spread, alpha] of [
    [150, 0.09],
    [300, 0.05],
    [460, 0.03],
  ] as const) {
    const g = ctx.createLinearGradient(0, 0, 0, BASE_Y)
    g.addColorStop(0, `rgba(245, 197, 66, ${alpha})`)
    g.addColorStop(1, 'rgba(245, 197, 66, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(W / 2 - 40, 0)
    ctx.lineTo(W / 2 + 40, 0)
    ctx.lineTo(W / 2 + spread, BASE_Y)
    ctx.lineTo(W / 2 - spread, BASE_Y)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  // Halo doré en haut au centre.
  const halo = ctx.createRadialGradient(W / 2, 120, 0, W / 2, 120, 620)
  halo.addColorStop(0, 'rgba(245, 197, 66, 0.30)')
  halo.addColorStop(0.5, 'rgba(245, 197, 66, 0.07)')
  halo.addColorStop(1, 'rgba(245, 197, 66, 0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, W, BASE_Y + 80)

  // Reflet au sol sous le podium.
  const floor = ctx.createRadialGradient(W / 2, BASE_Y, 0, W / 2, BASE_Y, 480)
  floor.addColorStop(0, 'rgba(245, 197, 66, 0.18)')
  floor.addColorStop(1, 'rgba(245, 197, 66, 0)')
  ctx.save()
  ctx.translate(0, BASE_Y)
  ctx.scale(1, 0.12)
  ctx.translate(0, -BASE_Y)
  ctx.fillStyle = floor
  ctx.fillRect(0, BASE_Y - 480, W, 960)
  ctx.restore()

  // Confettis figés — graine fixe : deux exports d'une même période sont identiques. Jamais sur
  // le titre ni sur un avatar, un nom ou un montant du podium : ils décorent, ils ne masquent pas.
  const keepOut = [
    { x0: 110, x1: W - 110, y0: 20, y1: 132 },
    ...([1, 2, 3] as const).map((p) => ({
      x0: STEP[p].x + 10,
      x1: STEP[p].x + STEP_W - 10,
      y0: BASE_Y - STEP[p].h - 300,
      y1: BASE_Y,
    })),
  ]
  const rand = mulberry32(7)
  let drawn = 0
  for (let i = 0; i < 400 && drawn < 40; i++) {
    const x = rand() * W
    const y = 24 + rand() * (BASE_Y - 60)
    const angle = rand() * Math.PI
    const alpha = 0.45 + rand() * 0.5
    const w = 8 + rand() * 10
    const h = 4 + rand() * 4
    if (keepOut.some((z) => x > z.x0 - 12 && x < z.x1 + 12 && y > z.y0 - 12 && y < z.y1 + 12)) continue
    drawn++
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.globalAlpha = alpha
    ctx.fillStyle = GOLD_CONFETTI[i % GOLD_CONFETTI.length] ?? '#f5c542'
    ctx.fillRect(-w / 2, -h / 2, w, h)
    ctx.restore()
  }
}

function drawTitle(ctx: CanvasRenderingContext2D, period: Period, f: Fonts) {
  ctx.font = `700 60px ${f.head}`
  const a = 'CLASSEMENT '
  const b = 'DES CHATTERS'
  const wa = ctx.measureText(a).width
  const wb = ctx.measureText(b).width
  const x0 = (W - wa - wb) / 2
  const y = 82
  const silver = vGradient(ctx, y - 48, y, ['#ffffff', '#cfd6df', '#8b95a3'])
  const gold = vGradient(ctx, y - 48, y, [METAL[1].light, METAL[1].mid, METAL[1].dark])
  ctx.save()
  ctx.shadowColor = 'rgba(245, 197, 66, 0.35)'
  ctx.shadowBlur = 24
  skewText(ctx, a, x0, y, silver)
  skewText(ctx, b, x0 + wa, y, gold)
  ctx.restore()

  ctx.font = `600 20px ${f.body}`
  ctx.fillStyle = '#a1a1aa'
  ctx.textAlign = 'center'
  withSpacing(ctx, '5px', () => ctx.fillText(period.label.toUpperCase(), W / 2, 118))
  ctx.textAlign = 'left'
}

// ─── Podium ──────────────────────────────────────────────────────────────────────────────────

const STEP = {
  1: { x: 395, h: 190, r: 64, name: 34, ca: 36, num: 130 },
  2: { x: 87, h: 150, r: 54, name: 28, ca: 30, num: 104 },
  3: { x: 703, h: 120, r: 54, name: 28, ca: 30, num: 88 },
} as const satisfies Record<Place, { x: number; h: number; r: number; name: number; ca: number; num: number }>
const STEP_W = 290

function drawStep(ctx: CanvasRenderingContext2D, row: RankedChatter, place: Place, f: Fonts) {
  const s = STEP[place]
  const m = METAL[place]
  const cx = s.x + STEP_W / 2
  const topY = BASE_Y - s.h
  const caY = topY - 18
  const nameY = caY - s.ca - 10
  // 18 px d'air : les feuilles basses du laurier descendent sous l'avatar, pas sur le nom.
  const avY = nameY - s.name - s.r - 18

  // Marche : bloc sombre, liseré métal, halo.
  ctx.save()
  ctx.shadowColor = m.glow
  ctx.shadowBlur = 50
  ctx.shadowOffsetY = -6
  ctx.fillStyle = vGradient(ctx, topY, BASE_Y, ['#2a2a31', '#141418', '#0b0b0e'])
  roundTop(ctx, s.x, topY, STEP_W, s.h, 18)
  ctx.fill()
  ctx.restore()
  ctx.save()
  roundTop(ctx, s.x, topY, STEP_W, s.h, 18)
  ctx.clip()
  ctx.fillStyle = m.mid
  ctx.fillRect(s.x, topY, STEP_W, 4)
  ctx.restore()

  // Chiffre de la place, métal, légèrement penché.
  ctx.font = `700 ${s.num}px ${f.head}`
  ctx.textBaseline = 'middle'
  const nw = ctx.measureText(String(place)).width
  skewText(ctx, String(place), cx - nw / 2, topY + s.h / 2 + 6, vGradient(ctx, topY, BASE_Y, [m.light, m.mid, m.dark]))
  ctx.textBaseline = 'alphabetic'

  // Montant puis nom, au-dessus de la marche.
  ctx.textAlign = 'center'
  ctx.font = `700 ${s.ca}px ${f.head}`
  ctx.fillStyle = vGradient(ctx, caY - s.ca, caY, [m.light, m.mid])
  ctx.fillText(eur(row.ca), cx, caY)
  ctx.font = `700 ${s.name}px ${f.body}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(ellipsize(ctx, row.name, STEP_W - 16), cx, nameY)
  ctx.textAlign = 'left'

  drawLaurel(ctx, cx, avY, s.r, m.mid, m.dark)
  drawAvatar(ctx, cx, avY, s.r, row.name, place, f)
  if (place === 1) drawCrown(ctx, cx, avY - s.r - 8)
}

function drawAvatar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, name: string, place: Place, f: Fonts) {
  const m = METAL[place]
  ctx.save()
  ctx.shadowColor = m.glow
  ctx.shadowBlur = 36
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = vGradient(ctx, cy - r, cy + r, [m.light, m.mid, m.dark])
  ctx.fill()
  ctx.restore()
  ctx.beginPath()
  ctx.arc(cx, cy, r - 4, 0, Math.PI * 2)
  ctx.fillStyle = '#141417'
  ctx.fill()

  ctx.font = `700 ${Math.round(r * 0.72)}px ${f.head}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = vGradient(ctx, cy - r / 2, cy + r / 2, [m.light, m.mid, m.dark])
  ctx.fillText(initials(name), cx, cy + 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

/** Mêmes feuilles que le SVG de la page : repère 100×100 où l'avatar a un rayon de 30. */
function drawLaurel(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, leaf: string, stem: string) {
  const k = r / 30
  const X = (x: number) => cx + (x - 50) * k
  const Y = (y: number) => cy + (y - 50) * k
  const { from, to, r: sr } = LAUREL_STEMS
  const rad = (d: number) => (d * Math.PI) / 180

  ctx.save()
  ctx.strokeStyle = stem
  ctx.lineWidth = 1.2 * k
  ctx.beginPath()
  ctx.arc(cx, cy, sr * k, rad(from), rad(to))
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, sr * k, rad(180 - from), rad(180 - to), true)
  ctx.stroke()

  ctx.fillStyle = leaf
  for (const l of LAUREL_LEAVES) {
    ctx.beginPath()
    ctx.ellipse(X(l.x), Y(l.y), 7 * k, 3 * k, rad(l.rot), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawCrown(ctx: CanvasRenderingContext2D, cx: number, bottomY: number) {
  const scale = 2.6
  const w = 36 * scale
  const h = 26 * scale
  const m = METAL[1]
  ctx.save()
  ctx.translate(cx - w / 2, bottomY - h)
  ctx.scale(scale, scale)
  ctx.shadowColor = m.glow
  ctx.shadowBlur = 20
  ctx.fillStyle = vGradient(ctx, 0, 26, [m.light, m.mid, m.dark])
  ctx.fill(new Path2D(CROWN_PATH))
  ctx.restore()
}

// ─── Liste 4 → 33 ────────────────────────────────────────────────────────────────────────────

function drawList(ctx: CanvasRenderingContext2D, rows: RankedChatter[], f: Fonts) {
  if (rows.length === 0) return
  const cols = rows.length > ROWS_PER_COL ? 2 : 1
  const colW = cols === 2 ? 470 : 620
  const gap = 20
  const x0 = (W - cols * colW - (cols - 1) * gap) / 2
  const panelH = 40 + Math.min(rows.length, ROWS_PER_COL) * ROW_H + 10

  for (let c = 0; c < cols; c++) {
    const x = x0 + c * (colW + gap)
    const slice = rows.slice(c * ROWS_PER_COL, (c + 1) * ROWS_PER_COL)

    roundRect(ctx, x, LIST_TOP, colW, panelH, 18)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.font = `600 13px ${f.body}`
    ctx.fillStyle = '#71717a'
    withSpacing(ctx, '2px', () => {
      ctx.fillText('#', x + 30, LIST_TOP + 28)
      ctx.fillText('CHATTER', x + 76, LIST_TOP + 28)
      ctx.textAlign = 'right'
      ctx.fillText('CA GÉNÉRÉ', x + colW - 18, LIST_TOP + 28)
      ctx.textAlign = 'left'
    })

    slice.forEach((row, i) => drawRow(ctx, row, x, LIST_TOP + 40 + i * ROW_H, colW, f))
  }
}

function drawRow(ctx: CanvasRenderingContext2D, row: RankedChatter, x: number, y: number, colW: number, f: Fonts) {
  const mid = y + ROW_H / 2
  const top10 = row.rank <= 10

  roundRect(ctx, x + 14, mid - 13, 44, 26, 7)
  ctx.fillStyle = top10 ? 'rgba(245, 197, 66, 0.15)' : 'rgba(255, 255, 255, 0.06)'
  ctx.fill()
  ctx.font = `700 15px ${f.head}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = top10 ? '#fcd34d' : '#a1a1aa'
  ctx.fillText(String(row.rank), x + 36, mid + 1)

  const hue = nameHue(row.name)
  ctx.beginPath()
  ctx.arc(x + 84, mid, 13, 0, Math.PI * 2)
  ctx.fillStyle = `hsl(${hue} 55% 14%)`
  ctx.fill()
  ctx.strokeStyle = `hsla(${hue}, 70%, 50%, 0.75)`
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.font = `700 10px ${f.body}`
  ctx.fillStyle = `hsl(${hue} 85% 72%)`
  ctx.fillText(initials(row.name), x + 84, mid + 1)

  ctx.font = `600 17px ${f.body}`
  ctx.textAlign = 'right'
  ctx.fillStyle = '#d4d4d8'
  const ca = eur(row.ca)
  ctx.fillText(ca, x + colW - 18, mid + 1)
  const caW = ctx.measureText(ca).width

  ctx.font = `500 18px ${f.body}`
  ctx.textAlign = 'left'
  ctx.fillStyle = '#f4f4f5'
  ctx.fillText(ellipsize(ctx, row.name, colW - 108 - caW - 30), x + 106, mid + 1)
  ctx.textBaseline = 'alphabetic'
}

function drawFooter(ctx: CanvasRenderingContext2D, period: Period, total: number, f: Fonts) {
  ctx.font = `600 14px ${f.body}`
  ctx.fillStyle = '#52525b'
  ctx.textAlign = 'center'
  withSpacing(ctx, '3px', () =>
    ctx.fillText(
      `CLASSEMENT DES CHATTERS · ${period.label.toUpperCase()} · ${total} ${total > 1 ? 'CLASSÉS' : 'CLASSÉ'}`,
      W / 2,
      H - 22,
    ),
  )
  ctx.textAlign = 'left'
}

// ─── Outils ──────────────────────────────────────────────────────────────────────────────────

function vGradient(ctx: CanvasRenderingContext2D, y0: number, y1: number, stops: string[]): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1)
  stops.forEach((c, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c))
  return g
}

/** Texte penché comme une italique de titre (la police n'a pas d'italique). */
function skewText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: CanvasGradient | string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.transform(1, 0, -0.16, 1, 0, 0)
  ctx.fillStyle = fill
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

/** `letterSpacing` du canvas quand le navigateur le connaît ; sinon texte serré, sans casse. */
function withSpacing(ctx: CanvasRenderingContext2D, spacing: string, draw: () => void) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  const before = c.letterSpacing
  if (before !== undefined) c.letterSpacing = spacing
  draw()
  if (before !== undefined) c.letterSpacing = before
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function roundTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, [r, r, 0, 0])
}

/** PRNG déterministe (Mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
