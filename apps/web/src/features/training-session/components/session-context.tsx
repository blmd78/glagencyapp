import type { CaseSnapshot } from '@/lib/types/training'

/**
 * La colonne de contexte d'une session — transposition de `render.train` (colonne `.traincol-ctx`)
 * de l'app Good Luck Agency : les pastilles phase / niveau, le décor du cas, puis « 💡 Ta piste »
 * qui donne l'objectif sans donner les mots.
 *
 * Elle est COLLANTE au défilement (`.gla-traincol-ctx`) : le chatteur relit sa consigne sans perdre
 * la conversation des yeux. Chez nous elle était repliée au-dessus du chat, donc fermée et oubliée
 * dès le premier message.
 *
 * Jamais la « ligne cible » : c'est la réponse attendue, RÉSERVÉE AU CORRECTEUR (elle n'entre que
 * dans le prompt de notation). L'afficher donnerait la correction avant l'exercice.
 */
export function SessionContext({ snapshot }: { snapshot: CaseSnapshot }) {
  return (
    <div className="gla-cardbox border-[var(--gla-accent)] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {snapshot.phase && <span className="gla-pill gla-pill-accent">{snapshot.phase}</span>}
        <span className="gla-pill gla-pill-warn">Niveau {snapshot.difficulty}</span>
      </div>
      <p className="mb-2.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--gla-muted)]">
        {snapshot.context}
      </p>
      <div className="rounded-[10px] bg-[var(--gla-surface2)] px-3 py-2.5">
        <p className="text-[11px] uppercase tracking-wide text-[var(--gla-faint)]">
          💡 {snapshot.objectiveLabel}{' '}
          <span className="font-normal normal-case">· à toi de trouver les mots</span>
        </p>
        <p className="mt-1 whitespace-pre-wrap font-semibold">{snapshot.objective}</p>
      </div>
    </div>
  )
}
