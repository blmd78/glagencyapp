import { DebriefCard, LinksCard, WeekNotes } from './components/bottom-cards'
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
        <DebriefCard week={week} />
        <div className="botcol">
          <WeekNotes week={week} />
          <LinksCard week={week} />
        </div>
      </div>
    </div>
  )
}
