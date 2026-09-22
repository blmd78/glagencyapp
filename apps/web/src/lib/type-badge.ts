// Couleurs de badge par type de lien (recette shadcn docs, comme lib/status-color). Teintes
// proches de celles du graphe (SOURCES, rank.ts) sans être les mêmes valeurs : ici le fond est
// pâle et le texte foncé, là c'est un aplat — deux contraintes de contraste différentes.
export function typeBadge(type: string): string {
  switch (type) {
    case 'twitter':
      return 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
    case 'instagram':
      return 'bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300'
    case 'telegram':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
    case 'snapchat':
      return 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'
    case 'tiktok':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
    case 'tiktok_ads':
      return 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
    case 'fb_ads':
      return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
    case 'seo':
      return 'bg-lime-50 text-lime-700 dark:bg-lime-950 dark:text-lime-300'
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  }
}
