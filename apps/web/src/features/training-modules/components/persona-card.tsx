import type { TrainingPersona } from '@/lib/types/training-public'

/**
 * « Ta fiche modèle — Alice » : le persona d'entraînement, replié, sur la page d'un module.
 *
 * Transposition du bloc de Good Luck Agency (`index.html:1080-1093` pour le contenu,
 * `index.html:1532` pour le volet) : une grille de champs en petites majuscules, puis des
 * paragraphes libres dont l'intitulé est en gras. Le contenu vient de `training_persona` (0130) et
 * non d'une constante en dur — c'est le seul écart assumé avec le legacy.
 *
 * Server Component : aucun état, que du rendu.
 */
export function PersonaCard({ persona }: { persona: TrainingPersona }) {
  return (
    <details className="gla-csec">
      <summary>Ta fiche modèle — {persona.name}</summary>
      <div className="mt-2.5 text-[13.5px] leading-relaxed">
        {persona.base.length > 0 && (
          <dl className="mb-3 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
            {persona.base.map((f) => (
              <div key={f.label}>
                <dt className="text-[11px] text-[var(--gla-faint)]">{f.label}</dt>
                <dd className="font-bold">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {persona.sections.map((s, i) => (
          // `i` en clé : les paragraphes n'ont pas d'identifiant propre et la liste est figée au
          // rendu (aucun tri, aucun ajout côté client).
          <p key={i} className="my-1.5">
            {s.titre && <span className="font-bold">{s.titre} : </span>}
            {s.contenu}
          </p>
        ))}
      </div>
    </details>
  )
}
