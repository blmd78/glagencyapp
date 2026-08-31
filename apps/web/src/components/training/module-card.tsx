import type { ModuleProgress } from '@glagency/core'
import Link from 'next/link'
import type { Route } from 'next'
import type { ReactNode } from 'react'

export interface ModuleCardProps {
  /** Code du module — cible du lien (`/formation/modules/{code}?vue=cas`). */
  code: string
  title: string
  emoji: string | null
  /** Progression du VISITEUR sur ce module, telle que la calcule `moduleProgress()` (@glagency/core). */
  progress: ModuleProgress
  /**
   * Colonne de droite. Absente = le pourcentage de progression (l'affichage historique de « Ma
   * formation »). Fournie = elle le REMPLACE : « Ma roue » y met l'état du tour, qui obéit à une
   * règle DIFFÉRENTE de la progression (validé à ≥ 60 sur une session jouée ici — D5). Sans cet
   * emplacement, chaque écran refaisait sa propre carte et les deux affichaient le même module
   * avec des chiffres qui semblaient se contredire.
   */
  right?: ReactNode
  /**
   * Force l'état « terminé » (le ✅) au lieu de le déduire des cas TENTÉS.
   *
   * Indispensable sur « Ma roue » : là-bas, « terminé » veut dire « un tour a été gagné » (≥ 60 à
   * CHAQUE exo, sur des sessions jouées ici), pas « tous les exos ont été ouverts ». Sans cette
   * porte de sortie, un chatter à 23/23 tentés avec 12 validés voyait un ✅ et une barre pleine sans
   * « Tour à jouer » — et allait réclamer à un encadrant un tour qui ne lui était pas dû.
   */
  complete?: boolean
}

/**
 * La carte de module de la face Formation — extraite de `features/training-me` pour que « Ma
 * formation » et « Ma roue » montrent EXACTEMENT le même objet, avec les mêmes chiffres. La
 * frontière ESLint (`no-restricted-paths`) interdit à une feature d'en importer une autre : le
 * partage passe donc obligatoirement par `components/`.
 *
 * Transposition du panneau GLA (`paintModules` / `.amcard`) : tuile emoji à gauche, compteurs et
 * barre dégradée au centre, valeur à droite. Toute la carte est le lien (affordance GLA : elle
 * glisse vers la droite au survol).
 */
export function ModuleCard({ code, title, emoji, progress, right, complete }: ModuleCardProps) {
  // Par défaut : « tous les cas tentés » — la définition de « Ma formation », inchangée.
  const done = complete ?? (progress.total > 0 && progress.done === progress.total)
  return (
    <li>
      <Link href={`/formation/modules/${code}?vue=cas` as Route} className="gla-card flex items-center gap-[13px] p-3">
        <span className="gla-tile grid size-11 flex-none place-items-center rounded-[13px] text-[21px]" aria-hidden>
          {emoji ?? '🎯'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">
            {title}
            {done && <span aria-hidden className="ml-1.5">✅</span>}
          </span>
          <span className="mt-px block text-[11.5px] tabular-nums text-[var(--gla-muted)]">
            {progress.done}/{progress.total} cas · moy. {progress.avg ?? '—'} · {progress.points} pts
          </span>
          <span className="gla-bar mt-1.5 block h-[5px]">
            <i style={{ width: `${Math.min(100, progress.pct)}%` }} />
          </span>
        </span>
        {right == null ? (
          <span
            className={`flex-none text-right text-[15px] font-extrabold tabular-nums ${
              progress.done > 0 ? 'text-[var(--gla-accent)]' : 'text-[var(--gla-muted)]'
            }`}
          >
            {progress.pct}%
          </span>
        ) : (
          // Le contenu fourni porte SA typographie ; ce conteneur ne fait que le placer. `max-w`
          // parce qu'un libellé long (« Tour non attribué — préviens un encadrant ») doit passer à
          // la ligne plutôt qu'écraser le titre du module.
          <span className="max-w-[40%] flex-none text-right">{right}</span>
        )}
      </Link>
    </li>
  )
}
