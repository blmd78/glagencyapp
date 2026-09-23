import { SourcesTraficView } from './components/sources-trafic-view.client'
import type { SourcesTraficData } from './types'

/**
 * Équipe › Sources de trafic : ce que le pôle marketing sait de chaque source (Instagram,
 * Snapchat…) de chaque modèle, pour que les chatteurs sachent d'où viennent les fans à qui ils
 * parlent. Lecture seule — l'écriture vit dans Marketing › Modèles › Sources de trafic.
 */
export function SourcesTraficTemplate({ data }: { data: SourcesTraficData }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {data.modeles.length} modèle(s) · {data.notes} note(s) · clique pour déplier
      </p>
      <SourcesTraficView data={data} />
    </div>
  )
}
