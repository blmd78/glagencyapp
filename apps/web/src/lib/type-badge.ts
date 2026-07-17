// Couleurs de badge par type de lien (recette shadcn docs, comme lib/status-color).
export function typeBadge(type: 'twitter' | 'instagram' | 'telegram' | 'other'): string {
  switch (type) {
    case 'twitter':
      return 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
    case 'instagram':
      return 'bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300'
    case 'telegram':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  }
}
