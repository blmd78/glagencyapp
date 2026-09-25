# Changelog — glagencyapp

Format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), en français. Une version = une mise en prod (`develop` → `main`), taguée `vX.Y`. Procédure : `docs/git-workflow.md`.

**À chaque merge sur `develop`** : une ligne sous « Non publié », dans la bonne rubrique (`### Ajouté`, `### Modifié`, `### Corrigé`, `### Supprimé`, `### Sécurité`).

> Versions 1.0 à 2.62 reconstituées le 2026-09-25 depuis les titres de merge (1.0 à 1.16, sans résumé dans le titre : corps du merge ou sujet de la branche mergée) : une ligne par release, sans rubrique. `1.1` et `2.13` n'ont jamais existé ; `2.38.1` n'est pas un correctif de 2.38 : c'est la seconde release numérotée 2.38 (09/09), placée à sa date ; `2.58` à `2.62` étaient parties sans numéro.

## Non publié

### Ajouté

- Carte des projets (`docs/CARTE.md`), changelog et commandes `pnpm release:prepare` / `pnpm release:tag`.
- Doc agents : `ARCHITECTURE.md` (description du système + règles métier par domaine), sorti d'`AGENTS.md` qui passe de 34 à 8 Ko.

## [2.62] — 2026-09-25

- Relevé : le placement Organisation compte (Juliette visible chez Rémi) (#120)

## [2.61] — 2026-09-25

- Relevé : 4 jours rattrapés, lecteur corrigé, « Invalid Date » corrigé (#119)

## [2.60] — 2026-09-24

- Doc : présence des Insights, idle du relevé à 10 min (#118)

## [2.59] — 2026-09-24

- Insights : la présence vient du relevé MyPuls (fini le « 0h » partout) (#117)

## [2.58] — 2026-09-24

- Formation : le fan passe sur Sonnet 5 le lundi 28/09 (−25 % sur son coût) (#116)

## [2.57] — 2026-09-21

- Uncove : suivi des abonnés et du CA par modèle

## [2.56] — 2026-09-17

- la Formation arrête de précharger en arrière-plan

## [2.55] — 2026-09-15

- le Récap compte les habitudes oubliées, les sections ne se déplacent plus

## [2.54] — 2026-09-15

- supprimer un membre qui a des modèles ne plante plus

## [2.53] — 2026-09-14

- 3 essais par exercice, graphique IA, notation plus courte

## [2.52] — 2026-09-14

- le manager lit les débriefs de ses sous-managers dans le Récap

## [2.51] — 2026-09-14

- recherche Membres par e-mail et Discord, « Signaler » sélectionne le chatteur

## [2.50] — 2026-09-14

- Analytics IA, détail journalier des liens, verrou du Boss lisible

## [2.49] — 2026-09-14

- le Récap affiche l'heure d'enregistrement de chaque débrief

## [2.48] — 2026-09-14

- la To-Do gagne un « + Tâche » sur chaque jour

## [2.47] — 2026-09-11

- « Invalid Date » corrigé et un « Voir » pour relire chaque cas

## [2.46] — 2026-09-11

- les conversations d'entraînement deviennent trouvables

## [2.45] — 2026-09-11

- le pseudo Discord devient le nom affiché dans la Formation

## [2.44] — 2026-09-10

- les canaux de liens se replient, la LTV passe en demi-cercle

## [2.43] — 2026-09-10

- la LTV des liens sur l'Overview marketing

## [2.42] — 2026-09-09

- le job marketing utilise la session partagée MyPuls

## [2.38.1] — 2026-09-09

- Marketing par modèle, liens par source, ingestion rebranchée

## [2.41] — 2026-09-08

- le bilan de la nuit se rattache à la journée qu'on vient de finir

## [2.40] — 2026-09-08

- un policier organise la semaine de tous les sous-managers

## [2.39] — 2026-09-07

- la formation arrête de payer des requêtes que personne ne lit

## [2.38] — 2026-09-07

- le CA par chatteur est réparé, et un manager organise la semaine de son sous-manager

## [2.37] — 2026-09-07

- les habitudes se déposent chez son sous-manager

## [2.36] — 2026-09-05

- le suivi chatters s'ouvre à toute l'agence, et la dernière réplique du fan réapparaît

## [2.35] — 2026-09-05

- une ligne illisible du jour suivant ne fait plus tomber la nuit

## [2.34] — 2026-09-05

- qui est en formation, et où il en est module par module

## [2.33] — 2026-09-04

- le jour se choisit dans la période, et la fiche parle du jour choisi

## [2.32] — 2026-09-04

- deux grains au choix : la période du header, ou un jour précis

## [2.31] — 2026-09-04

- le relevé suit la période du header, et ne juge plus le renfort

## [2.30] — 2026-09-04

- « Réglages » devient un vrai bouton

## [2.29] — 2026-09-04

- l'accès aux réglages passe en haut à droite du relevé

## [2.28] — 2026-09-04

- déclencher le relevé MyPuls par HTTP

## [2.27] — 2026-09-04

- les tuiles du relevé suivent ce qu'on regarde ; Vacations retiré

## [2.26] — 2026-09-04

- le relevé MyPuls : qui a tenu son poste

## [2.25] — 2026-09-03

- la page de connexion n'est plus traduite par Chrome

## [2.24] — 2026-09-03

- un manager modifie les identifiants Snap de ses modèles

## [2.23] — 2026-09-03

- le jour du débrief se choisit ; la file des candidats par session

## [2.22] — 2026-09-02

- le CA de l'agence dans l'Overview, deux droits fins

## [2.21] — 2026-09-02

- hotfix formation : envois sous saturation IA, coûts −12 %, roster

## [2.20] — 2026-09-01

- la To-Do et le Récap du tracker s'ouvrent à l'encadrement

## [2.19] — 2026-08-31

- la roue des modules : un tour par module terminé

## [2.18] — 2026-08-31

- header To-Do fidèle au tracker (sélecteur, bouton, semaine)

## [2.17] — 2026-08-30

- reprise du tracker : bouton d'import + correctifs de parité

## [2.16] — 2026-08-28

- messages d'erreur IA, latence du chrono, plafond du recrutement

## [2.15] — 2026-08-28

- le tracker recollé à l'ancien CRM : to-do, suivi 1:1, récap

## [2.14] — 2026-08-27

- tracker de présence, et la face Formation recollée à l'ancien CRM

## [2.12.3] — 2026-08-22

- tours de roue cumulables, octroi sur toute la face, derniers correctifs d'audit

## [2.12.2] — 2026-08-22

- correctifs de l'audit complémentaire (26 constats)

## [2.12.1] — 2026-08-21

- correctifs de l'audit complémentaire (notation publique réservée, transcription balisée, coût réel)

## [2.12] — 2026-08-21

- face Formation : catalogue, entraînement IA, roue des récompenses, test de recrutement public

## [2.11] — 2026-08-17

- board orga multi-shift, manager transverse masquable, héritage d'équipe, relances signées

## [2.10] — 2026-08-15

- ingestion résiliente au CAPTCHA MyPuls, messages d'erreur explicites

## [2.9] — 2026-08-06

- section Police : rapport refondu, périmètre en écriture, journal admin

## [2.8] — 2026-08-06

- tracker sanctions refondu : droits, cloisonnement par modèle, journal des suppressions

## [2.7] — 2026-08-05

- repos : 30 colonnes et rouge dès le 2e repos ; le scroll spenders survit aux coupures

## [2.6] — 2026-08-03

- grilles du calendrier splittées par mois, tri mort dans Membres

## [2.5] — 2026-08-03

- sélecteur de dates : plus de date peinte en double

## [2.4] — 2026-08-03

- découpage data-table et spenders-table

## [2.3] — 2026-08-03

- pagination Spenders, ménage et découpage org-table

## [2.2] — 2026-08-03

- spenders filtrés par vue, sélecteur de dates

## [2.1] — 2026-08-03

- verrou de départ, planning repos hiérarchique, sélecteur de dates

## [2.0] — 2026-08-03

- cycle de vie des membres

## [1.16] — 2026-07-29

- Bouton « Copier la semaine précédente » toujours visible (grisé si la semaine a du contenu).

## [1.15] — 2026-07-29

- Planning repos : colonnes modèles dynamiques (masquées si vides, ajoutables jusqu'à 12) + colonne Sous-managers dans l'encadrement (0096, déjà en prod).

## [1.14] — 2026-07-29

- Fin de l'assignation des chatteurs : tout encadrant a accès à tous les chatteurs selon ses pages (0095) — un manager garde ses sous-managers (planning/to-do inchangés). Drop de manager_id (0094). Migrations déjà en prod.

## [1.13] — 2026-07-29

- Multi-rattachement managers (0092 : manager_ids uuid[], règles par rôle, source unique ATTACHABLE_ROLES, sélecteur multiple) + copie de la semaine précédente sur le planning repos (0093). Migrations déjà en prod, types régénérés.

## [1.12] — 2026-07-29

- Hiérarchie transitive managers (0087) + repos posables par les managers avec périmètre SQL (0090/0091), spenders KPIs multi-modèles + tracker en 1 requête json, 2 audits multi-agents 100 % traités (anti-troncature rpc, perf RLS ×130, fixes Membres/compta). Migrations 0087→0091 déjà appliquées en prod, types régénérés — l'app rattrape la base.

## [1.11] — 2026-07-28

- To-do : dates de vie sur chaque ligne (ajout / depuis N j / debut → fin · N j, heures si fini le jour meme) + transitions a sens unique anti-triche (menu, action, trigger) + dates non falsifiables (antidatage done_at ferme). Migration 0086_todos_dates deja appliquee en prod (db push = up to date).

## [1.10] — 2026-07-28

- Planning/dashboard : pile de noms depliables + filtre + chargement a l'ouverture, chatteurs remis dans le selecteur. Bilan : delta S1/Hors S1 en % au lieu de pt. Securite : Next 16.2.12 (CVE-2026-64641 DoS, CVE-2026-64643). Spec et plan de la paie des chatteurs (feature pas encore livree). Migration 0084 deja appliquee en prod (db push = no-op).

## [1.9] — 2026-07-23

- Impersonation + Bilan S1 + Insights score/100 + Mes phrases + to-do peek. Migrations 0081/0082/0083 deja en prod (db push = no-op).

## [1.8] — 2026-07-22

- Lien membre-chatteur (0079, 72 liens) + Stat chatteur + badges closing. 0080 appliquee juste apres le deploiement.

## [1.7] — 2026-07-22

- Merge feature/membres-closing-role into develop (closing membre + Police/Repos → membres role chatteur)

## [1.6] — 2026-07-21

- Une seule évolution fonctionnelle : le **Planning des repos** passe en temps réel et devient consultable en entier par les managers, tout en réservant la pose des repos aux admins.

## [1.5] — 2026-07-21

- fix(police): borne les dates de saisie à la fenêtre + plafonne les chiffres (M2/M3 audit)

## [1.4] — 2026-07-20

- refactor: le pavé « getProfile ré-exécuté » (×6) renvoie aux guidelines

## [1.3] — 2026-07-18

- refactor(reports): retire le bouton supprimer (jour courant toujours éditable)

## [1.2] — 2026-07-18

- refactor(planning): durcit l'authz + resserre la RLS lecture + supprime code mort (revue)

## [1.0] — 2026-07-17

- merge: feat/roles-chatteur-sous-manager → develop (rôles chatteur/sous-manager + restriction écriture chatteur, migrations 0059-0060)
