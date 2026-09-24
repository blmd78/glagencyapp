# L'audit de standardisation — « relance la commande d'audit » — glagencyapp

Quand Benoît dit « relance la commande d'audit » ou « refais comme l'énorme audit qui a duré 2 jours », il désigne le **chantier de standardisation des 16-17/07/2026** (~60 commits). Le brief qu'il a validé le 2026-07-28 :

> « Standardise toute l'app sur un composant pilote en vérifiant sur internet les bonnes pratiques du mois courant pour notre stack (Next.js, React, Zod, shadcn, Tailwind, Supabase, Sentry) — optimise le caching, le loading, la gestion d'erreur, le temps de chargement, les images et le refetch de données, réorganise les dossiers en séparant feature/composant/action/service/schéma/type pour qu'un humain s'y retrouve, recheck ton plan en ligne avant de coder, travaille sur une branche à part, pas d'overengineering ni de truc overkill, applique le standard à toutes les features par batchs, puis audite la branche contre la spec, supprime et simplifie ce qui est compliqué pour rien, et merge sur develop pour que je teste en préprod avant la PR. »

## La mécanique qui a marché

Auditer **une** feature pilote contre les normes du mois **vérifiées sur internet** → en tirer le socle transverse et les guidelines (`guidelines-*.md`, qui existent toujours : repartir d'elles, pas de zéro) → migrer les features une à une, un commit par feature. L'ingrédient décisif est la vérification en ligne des normes **datées** : c'est ce que la lecture du code seul ne voit pas (cold starts, CVE, patterns dépréciés).

Deux réflexes de Benoît à respecter : **couper l'inutile** dès qu'il apparaît (il a refusé la CI), et **re-contester toute complexité** (« compliqué pour rien ») avant de la garder.

## L'axe oublié — le runtime React

L'audit couvrait requêtes, normes, structure et sécurité, et ressortait « propre » alors que trois bugs d'UX bien réels vivaient dans la feature la plus récente. Aucun n'est vu par `tsc`, ESLint ou le build — seulement à l'usage. Les chercher explicitement :

1. **Composant déclaré DANS un composant** (grep `^  function [A-Z]`) → référence recréée à chaque rendu, React démonte le sous-arbre, tout état interne est perdu. Symptôme : un popover se referme après chaque sélection.
2. **Flag `useTransition` qui estompe un conteneur entier** (`pending && 'pointer-events-none`) → `revalidatePath` re-rend le RSC DANS la transition, le voile dure jusqu'au retour serveur, à chaque clic. Symptôme : « ça recharge ».
3. **Overrides optimistes vidés sur changement de props** → l'affichage rebascule sur des données encore en vol. Symptôme : la valeur apparaît, disparaît, réapparaît.

Référence de ce qui est correct : `features/repos/` (cellules au niveau module, flag de transition ignoré, overrides jamais vidés en masse). Comparer toute grille éditable à celle-là.
