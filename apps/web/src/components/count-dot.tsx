import { cn } from '@/lib/utils'

const TONE = {
  total: 'bg-green-500',
  critique: 'bg-red-500',
  'a-traiter': 'bg-amber-500',
} as const

/**
 * Point de couleur — repère SCANNABLE posé à côté d'un compteur ou d'un statut : vert = total,
 * rouge = critique, ambre = à traiter. Né dans Insights (point de sévérité des cartes +
 * compteurs des en-têtes de modèle), promu ici quand la pile de noms de la To-do a eu besoin du
 * même « N à traiter » : deux features ne peuvent pas s'importer l'une l'autre (règle
 * d'imports), la brique commune monte dans `components/`.
 *
 * `size-2.5` et non `size-2` : les pastilles de quotas des cartes Insights (vert = atteint /
 * rouge = manqué) sont en `size-2` — deux repères de sens différent ne doivent pas se
 * confondre.
 *
 * `aria-hidden` : l'information est toujours portée en toutes lettres à côté du point (badge
 * « Critique », compteur « N à traiter ») — le point n'est qu'un raccourci pour l'œil.
 */
export function CountDot({ tone, title }: { tone: keyof typeof TONE; title?: string }) {
  return (
    <span
      aria-hidden
      title={title}
      className={cn('size-2.5 shrink-0 rounded-full', TONE[tone])}
    />
  )
}
