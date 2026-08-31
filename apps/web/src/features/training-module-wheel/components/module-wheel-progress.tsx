import { ModuleCard } from '@/components/training/module-card'
import type { ModuleWheelModule } from '../types'

/**
 * Les 7 modules et ce qui sépare le chatter du prochain tour. Sans ce panneau, la mécanique est
 * opaque : on gagne des tours sans savoir pourquoi ni comment en gagner un de plus.
 *
 * La carte est celle de « Ma formation » (`components/training/module-card`), avec SES chiffres —
 * cas tentés, moyenne, points. C'est le correctif : les deux écrans montrent le même module, ils
 * doivent afficher la même chose. La règle de la roue (« validé » = ≥ 60 sur une session jouée ICI,
 * D5) ne remplace plus ces chiffres, elle s'affiche À CÔTÉ et se nomme — « 12/23 validés à 60 » en
 * regard d'un « 22/23 cas · moy. 56 » se lit tout seul, là où un « 0/23 » solitaire ne pouvait se
 * lire que comme un bug.
 */
export function ModuleWheelProgress({ modules }: { modules: ModuleWheelModule[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Comment gagner un tour</h2>
      <p className="text-sm text-muted-foreground">
        Un tour de roue par module terminé — il faut au moins 60 à <span className="font-medium">tous</span> ses exos.
      </p>
      <ul className="flex flex-col gap-[9px]">
        {modules.map((m) => (
          <ModuleCard
            key={m.id}
            code={m.code}
            title={m.title}
            emoji={m.emoji}
            progress={m.progress}
            right={
              m.etat === 'joue' ? (
                <span className="text-sm text-muted-foreground">Tour joué</span>
              ) : m.etat === 'gagne' ? (
                <span className="text-sm font-medium text-gold">Tour à jouer 🎡</span>
              ) : m.total === 0 ? (
                // Un module ACTIF sans aucun CAS actif ne rend aucune ligne de
                // `training_module_wheel_state` (jointure INNER dans la RPC) → `total`/`valides`
                // retombent à 0/0 côté web, ce qui se lirait comme « terminé, il ne manque rien » —
                // or l'octroi (0136 §4, « un module VIDE n'est pas terminé, il n'a jamais été
                // commencé ») refuse EXPLICITEMENT de payer ce cas. On distingue donc « rien à faire
                // parce qu'il n'y a rien à faire » de « fini ».
                <span className="text-sm text-muted-foreground">Aucun exercice actif</span>
              ) : m.valides === m.total ? (
                // `etat === 'a_gagner'` alors que tous les exos actifs sont validés : aucun ticket
                // n'existe pour ce module (cf. `getModuleWheel`, `etat: ticket ? … : 'a_gagner'`).
                // État ATTEIGNABLE ET DÉFINITIF — l'octroi n'a qu'un seul appelant, le trigger de
                // notation du dernier exo, et rien ne le rejoue ensuite (droits pas encore accordés
                // à cet instant, encadrant sans rôle chatteur que la base refuse sciemment de payer,
                // etc.). Sans cette branche on retombe sur « 23/23 validés à 60 », qui se lit comme
                // « c'est bon » et masque un chatter qui a perdu ~7 € en silence : il faut un
                // message qui pousse à agir.
                <span className="text-sm font-medium text-red-600 dark:text-red-400">
                  Tour non attribué — préviens un encadrant
                </span>
              ) : (
                // Le compteur de la ROUE, nommé pour ce qu'il est. « N exos restants » était un
                // reste à faire sans unité comparable au « x/y cas » de la carte : mis en regard, il
                // donnait l'impression que l'un des deux écrans mentait.
                <span className="text-sm tabular-nums text-muted-foreground">
                  {m.valides}/{m.total} validés à 60
                </span>
              )
            }
          />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Un exo compte pour la roue à deux conditions : l’avoir joué ICI (les exos repris de
        l’ancienne plateforme ne comptent pas) ET y avoir eu au moins 60. Les autres comptent quand
        même pour ta progression, ta moyenne et le classement — c’est ce qu’affiche chaque carte.
      </p>
    </section>
  )
}
