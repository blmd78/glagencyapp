import { InfosModelesView } from './components/infos-modeles-view'
import type { InfosModelesData } from './types'

/**
 * Infos modèles (porté de gla-workflow) : un accordéon par modèle — identité de base +
 * sections typées (liste = pastilles colorées, fiche = mini-cartes, recits = cartes
 * récit avec badge d'âge, texte = paragraphe encadré), même rendu que le legacy.
 * Lecture cloisonnée par la RLS (un membre ne voit que ses modèles) ; édition admin.
 * `h1` remonté dans `page.tsx` (kickoff sans await + Suspense, recette pilote) — sous-titre
 * en `-mt-4` pour compenser le double `gap-6` page/Template (docs/guidelines-standard-feature.md §2.5).
 */
export function InfosModelesTemplate({ data, isAdmin }: { data: InfosModelesData; isAdmin: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {data.modeles.length} modèle(s) visibles · clique pour déplier
      </p>

      <InfosModelesView data={data} isAdmin={isAdmin} />
    </div>
  )
}
