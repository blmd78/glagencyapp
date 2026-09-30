/**
 * Primitives visuelles du podium, PARTAGÉES entre la page (SVG/CSS) et l'image exportée (canvas) :
 * les deux doivent montrer les mêmes métaux, la même couronne et les mêmes lauriers. Données pures,
 * aucun DOM.
 */

export type Place = 1 | 2 | 3

/** Or / argent / bronze — `light` → `dark` = dégradé vertical du métal, `glow` = halo. */
export const METAL: Record<Place, { light: string; mid: string; dark: string; glow: string }> = {
  1: { light: '#fff3b0', mid: '#f5c542', dark: '#9a6a00', glow: 'rgba(245, 197, 66, 0.55)' },
  2: { light: '#ffffff', mid: '#cfd6df', dark: '#6b7684', glow: 'rgba(207, 214, 223, 0.4)' },
  3: { light: '#ffd9b3', mid: '#e8894a', dark: '#8a3a12', glow: 'rgba(232, 137, 74, 0.45)' },
}

/** Palette des confettis (page et image) : l'or domine, un éclat d'argent et de bronze. */
export const GOLD_CONFETTI = ['#f5c542', '#fff3b0', '#e0a91b', '#ffffff', '#cfd6df', '#e8894a'] as const

/** Couronne, viewBox `0 0 36 26` — chaîne SVG que `Path2D` accepte telle quelle côté canvas. */
export const CROWN_PATH = 'M2 21 L4.5 6 L12 13 L18 2 L24 13 L31.5 6 L34 21 Z M2 22.5 H34 V26 H2 Z'

/**
 * Feuilles d'une couronne de laurier autour d'un avatar, viewBox `0 0 100 100` (avatar centré,
 * rayon 30). Branche gauche du bas vers « 10 h », branche droite en miroir. `rot` en degrés = axe
 * long de la feuille, penché vers l'extérieur.
 */
export const LAUREL_LEAVES: { x: number; y: number; rot: number }[] = (() => {
  const leaves: { x: number; y: number; rot: number }[] = []
  for (let i = 0; i < 7; i++) {
    const deg = 108 + i * 19
    const r = i % 2 === 0 ? 39 : 43
    const t = (deg * Math.PI) / 180
    const x = 50 + r * Math.cos(t)
    const y = 50 + r * Math.sin(t)
    leaves.push({ x, y, rot: deg + 62 }, { x: 100 - x, y, rot: 180 - (deg + 62) })
  }
  return leaves
})()

/** Tige des lauriers (arc gauche puis droit), même repère que `LAUREL_LEAVES`. */
export const LAUREL_STEMS: { from: number; to: number; r: number } = { from: 104, to: 222, r: 38 }

/**
 * Deux initiales max (« Saint Patrick » → « SP »), « ? » si rien d'exploitable. Première lettre ou
 * chiffre de chaque mot : les fiches MyPuls portent parfois « (accès révoqué) » ou un e-mail, dont
 * la parenthèse ne doit pas devenir une initiale.
 */
export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((p) => p.match(/[\p{L}\p{N}]/u)?.[0])
    .filter((c): c is string => !!c)
  return letters.slice(0, 2).join('').toUpperCase() || '?'
}

/** Teinte stable par nom : chaque chatteur garde « sa » couleur d'avatar d'une visite à l'autre. */
export function nameHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h % 360
}
