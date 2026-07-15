import { InfosModelesView } from './components/infos-modeles-view'
import type { InfosModelesData } from './types'

/**
 * Infos modèles (porté de gla-workflow) : un accordéon par modèle — identité de base +
 * sections typées (liste = pastilles colorées, fiche = mini-cartes, recits = cartes
 * récit avec badge d'âge, texte = paragraphe encadré), même rendu que le legacy.
 * Lecture cloisonnée par la RLS (un membre ne voit que ses modèles) ; édition admin.
 */
export function InfosModelesTemplate({ data, isAdmin }: { data: InfosModelesData; isAdmin: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Infos modèles</h1>
        <p className="text-sm text-muted-foreground">
          {data.modeles.length} modèle(s) visibles · clique pour déplier
        </p>
      </div>

      <InfosModelesView data={data} isAdmin={isAdmin} />
    </div>
  )
}
