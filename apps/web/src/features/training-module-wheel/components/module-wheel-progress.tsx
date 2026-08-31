import { ModuleCard } from '@/components/training/module-card'
import type { ModuleWheelModule } from '../types'

/**
 * Les 7 modules et ce qui sépare le chatter du prochain tour. Sans ce panneau, la mécanique est
 * opaque : on gagne des tours sans savoir pourquoi ni comment en gagner un de plus.
 *
 * La carte est celle de « Ma formation » (`components/training/module-card`), avec SES chiffres —
 * cas tentés, moyenne, points. C'est le correctif : les deux écrans montrent le même module, ils
 * doivent afficher la même chose. Avant, cet écran affichait sa PROPRE arithmétique (« 0/23 » là où
 * l'autre disait « 22/23 ») et se lisait comme un bug.
 *
 * À droite, là où « Ma formation » met le pourcentage d'avancement, on met la MOYENNE sur 100 : sur
 * cet écran, le seul chiffre actionnable est celui qui se compare au seuil de 60. Les états du tour
 * (joué, à jouer, non attribué) prennent cette place quand ils ont quelque chose à dire — ils
 * priment sur la note, parce qu'un tour qui attend est plus urgent qu'un score.
 */
export function ModuleWheelProgress({ modules }: { modules: ModuleWheelModule[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Comment gagner un tour</h2>
      <p className="text-sm text-muted-foreground">
        Un tour de roue par module terminé — il faut au moins 60 à <span className="font-medium">chaque</span> exo. La note à droite est ta moyenne sur le module.
      </p>
      <ul className="flex flex-col gap-[9px]">
        {modules.map((m) => (
          <ModuleCard
            key={m.id}
            code={m.code}
            title={m.title}
            emoji={m.emoji}
            progress={m.progress}
            // Sur CET écran, « terminé » = le tour est acquis, pas « tous les exos ont été
            // ouverts ». La carte le déduirait sinon des cas TENTÉS (la définition de « Ma
            // formation ») : un chatter à 23/23 tentés dont 12 seulement sont validés à 60 verrait
            // un ✅ sans « Tour à jouer », et irait réclamer un tour qui ne lui est pas dû.
            complete={m.etat === 'gagne' || m.etat === 'joue'}
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
                // LA MOYENNE, et pas un décompte (demande de Benoit du 2026-08-31). Sur cet écran,
                // le chiffre qui aide est celui qu'on peut comparer au seuil : « 56/100 » en face
                // d'un en-tête qui annonce « au moins 60 » se lit d'un coup — il manque 4 points.
                // Un « 0/23 validés à 60 » disait la même chose en négatif, sans dire de combien on
                // était loin, et se lisait comme un compteur cassé.
                //
                // `/100` explicite : sans lui, un « 56 » nu se confond avec le pourcentage
                // d'avancement que la MÊME place occupe dans « Ma formation ».
                //
                // TEINTE NEUTRE, volontairement. Une première version passait le nombre en vert
                // dès 60 de moyenne : sur un écran qui parle de tours à gagner, ça se lisait comme
                // « tu y es ». Or la moyenne n'est PAS la règle — il faut 60 à CHAQUE exo, sur des
                // sessions jouées ici. Un chatter dont tout l'historique est importé peut afficher
                // 85 de moyenne et ne rien avoir gagné : le vert lui aurait promis de l'argent.
                <span className="flex-none text-right text-[15px] font-extrabold tabular-nums text-[var(--gla-muted)]">
                  {m.progress.avg == null ? '—' : `${m.progress.avg}/100`}
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
