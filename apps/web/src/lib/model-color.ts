// Couleur déterministe par modèle (même nom => même couleur), light + dark.
// Partagée entre l'onglet Chatteurs (badges) et l'onglet Modèles (cartes).
// Recette ET teintes des docs shadcn (badge custom colors, vérifié sur le HTML déployé) :
// fond 50 / texte 700 en light, fond 950 PLEIN / texte 300 en dark — sans bordure.
// Les 5 premières = l'exemple de la doc dans son ordre (blue, green, sky, purple, red).
export const MODEL_COLORS = [
  'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  'bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
  'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
]

/** Variante « barre pleine » (même teinte que le badge), pour les graphes. */
export const MODEL_BAR_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-sky-500',
  'bg-purple-500',
  'bg-red-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-amber-500',
]

function hash(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h
}

export function modelColor(name: string): string {
  return MODEL_COLORS[hash(name) % MODEL_COLORS.length]
}

export function modelBarColor(name: string): string {
  return MODEL_BAR_COLORS[hash(name) % MODEL_BAR_COLORS.length]
}
