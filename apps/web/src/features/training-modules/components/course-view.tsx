import { MarkdownView } from '@/components/markdown-view'

/** Cours du module en typographie lisible (`max-w-prose`), ou un mot si le module n'en a pas (Boss). */
export function CourseView({ courseMd }: { courseMd: string | null }) {
  if (!courseMd?.trim()) {
    return <p className="text-sm text-muted-foreground">Pas de cours pour ce module — passe directement aux cas.</p>
  }
  return <MarkdownView source={courseMd} className="max-w-prose" />
}
