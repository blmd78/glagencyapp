import { DebriefCard, LinksCard, WeekNotes } from './components/bottom-cards'
import { HabitsPanel } from './components/habits-panel'
import { WeekGrid } from './components/week-grid'
import type { TodoWeek } from './types'

/**
 * To-Do hebdomadaire — port de `/todo`.
 *
 * `.wrap.wide` : sept colonnes dans la colonne de lecture de 1080 px donnent des cases illisibles.
 * C'est leur propre commentaire, repris avec la règle.
 */
export function TodoTemplate({ week }: { week: TodoWeek }) {
  return (
    <div className="wrap wide">
      <WeekGrid week={week} />
      <div className="botrow">
        {/* Clé titulaire + semaine : le jour choisi dans la carte est un état client ; sans
            remontage, un changement de semaine (ou de compte) garderait un jour hors de la grille. */}
        <DebriefCard key={`${week.ownerId}:${week.weekStart}`} week={week} />
        <div className="botcol">
          {/* Même clé que la carte du bilan : Next ne remonte pas la page entre `?week=A` et
              `?week=B`, et React Hook Form fige ses valeurs au montage — sans clé, le bloc-notes
              gardait le texte de la semaine précédente sous le titre de la nouvelle. */}
          <WeekNotes key={`${week.ownerId}:${week.weekStart}`} week={week} />
          <LinksCard week={week} />
          {/* Les habitudes se gèrent au même endroit que le reste du contexte de la semaine. Chez
              eux c'était un onglet de la fenêtre d'ajout ; ici la semaine est déjà à l'écran, et un
              panneau évite d'enfermer un réglage durable dans une modale d'ajout ponctuel. */}
          <HabitsPanel
            ownerId={week.ownerId}
            habits={week.habits}
            sections={[...new Set(week.days.flatMap((d) => d.sections.map((s) => s.name)))].sort()}
            canWrite={week.canWrite}
          />
        </div>
      </div>
    </div>
  )
}
