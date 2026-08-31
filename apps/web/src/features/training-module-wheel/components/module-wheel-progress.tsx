import { Progress } from '@/components/ui/progress'
import type { ModuleWheelModule } from '../types'

/**
 * Les 7 modules et ce qui sépare le chatter du prochain tour. Sans ce panneau, la mécanique est
 * opaque : on gagne des tours sans savoir pourquoi ni comment en gagner un de plus.
 *
 * « Validé » veut dire ≥ 60 sur une session jouée ICI. Les exos repris de l'ancienne plateforme
 * comptent dans la progression et le classement, mais pas pour la roue — c'est dit explicitement
 * en bas du panneau, sinon un chatter qui a importé son historique ne comprendra pas ses chiffres.
 */
export function ModuleWheelProgress({ modules }: { modules: ModuleWheelModule[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Comment gagner un tour</h2>
      <p className="text-sm text-muted-foreground">
        Un tour de roue par module terminé — il faut au moins 60 à <span className="font-medium">tous</span> ses exos.
      </p>
      <ul className="flex flex-col gap-2">
        {modules.map((m) => {
          const restant = Math.max(0, m.total - m.valides)
          return (
            <li key={m.id} className="flex items-center gap-3 rounded-xl border px-4 py-3">
              <span aria-hidden className="text-xl leading-none">{m.emoji ?? '📘'}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{m.title}</span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {m.valides}/{m.total}
                  </span>
                </div>
                <Progress value={m.total ? (m.valides * 100) / m.total : 0} label={`Progression du module ${m.title}`} />
              </div>
              <span className="shrink-0 text-sm">
                {m.etat === 'joue' ? (
                  <span className="text-muted-foreground">Tour joué</span>
                ) : m.etat === 'gagne' ? (
                  <span className="font-medium text-gold">Tour à jouer 🎡</span>
                ) : m.total === 0 ? (
                  // Revue de la Task 3 : un module ACTIF sans aucun CAS actif ne rend aucune ligne
                  // de `training_module_wheel_state` (jointure INNER dans la RPC) → `total`/`valides`
                  // retombent à 0/0 côté web. `restant` vaudrait alors 0, ce qui se lirait comme
                  // « terminé, il ne manque rien » — or l'octroi (0136 §4, « un module VIDE n'est
                  // pas terminé, il n'a jamais été commencé ») refuse EXPLICITEMENT de payer ce cas.
                  // On distingue donc « rien à faire parce qu'il n'y a rien à faire » de « fini » :
                  // le module n'est ni joué, ni gagné, ni à un exo près — il n'a simplement aucun
                  // contenu actif pour l'instant.
                  <span className="text-muted-foreground">Aucun exercice actif</span>
                ) : (
                  <span className="text-muted-foreground">
                    {restant} exo{restant > 1 ? 's' : ''} restant{restant > 1 ? 's' : ''}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Seuls les exos joués ici comptent pour la roue. Ceux repris de l’ancienne plateforme comptent
        pour ta progression et le classement.
      </p>
    </section>
  )
}
