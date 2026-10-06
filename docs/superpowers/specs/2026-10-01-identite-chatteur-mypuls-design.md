# Identité chatteur par id MyPuls — design, version fiabilité (2026-10-01, révisé le 2026-10-05)

Tier **L** :
- identité des chiffres de CA, paie comprise (`compta-ca.ts` lit `chatter_creator_daily` par
  `profiles.chatter_id`) ;
- fusions de données en prod ;
- une migration ;
- un onglet admin.

## Objectif

Benoit, mot pour mot : « une version qui me promet la fiabilité sur les chiffres de l'app et plus
de soucis comme la dernière fois ».

Traduction :
- **un chiffre faux ne doit plus pouvoir passer inaperçu** ;
- on **prouve chaque nuit** que nos chiffres égalent ceux de MyPuls ;
- **un compte MyPuls = une fiche** `chatters`, résolue par l'id MyPuls et non plus par le libellé.

## Constat

### En prod (relevé en lecture seule le 2026-10-01, transmis avec la demande)

- **12 comptes sont coupés en plusieurs fiches, prouvés « même compte » par l'invariant :**
  11 paires, plus rayon/Rayson (id 9027). Exemples :
  - 1802 « Lionel »/« lioneldiv » ;
  - 5614 « Ornela »/« Ornella » (depuis le 2026-06-04) ;
  - 9550 « City of the gamer »/« Cité des gamers » ;
  - 296 « JORDAN »/« Jordan manager » ;
  - 11391 « Marek »/« Marek_17 » ;
  - 1163 « yann »/« yann30000 »/« djoucamel3@gmail.com (accès révoqué) ».

  La preuve est la même partout. Chaque jour où `chatter_daily` ≠ Σ `chatter_creator_daily` se
  rééquilibre au centime quand on réunit les fiches : écart résiduel 0, aucun jour en commun.
- **Lionel, septembre :** 1 794 € sur Chatteurs, 6 385 € sur Modèles, 7 010 € en réalité. Il a
  été corrigé à la main (CA + alias). Lionel était absent du classement Stat chatter : c'est le
  problème qui a déclenché tout le dossier.
- **Script de fusion prêt, hors dépôt : v2 de `/tmp/fusion/fusion.sh`.** Une seule transaction
  pour :
  - la sauvegarde CSV (`:24-34`) ;
  - les garde-fous (`:38-78`) : même fiche, membre relié, jours communs, ids MyPuls
    contradictoires ;
  - la garde sur **toutes les clés étrangères vers `chatters`** lues dans `pg_constraint`. Il y
    en a 13 en prod (`/tmp/fusion/fk_cols.txt`) : `chatter_alias`, `chatter_creator_daily`,
    `chatter_creators`, `chatter_daily`, `chatter_daily_reach`, `insights`,
    `mypuls_shift_coverage`, `mypuls_shift_segments`, `profiles`, `relances`,
    `spender_assignment_events.from_chatter_id`/`to_chatter_id`,
    `spender_conversations.assigned_chatter_id` ;
  - un filet sur les colonnes `chatter_id` sans clé ;
  - les déplacements (`:90-114`), `rest_planning_cells.chatter_ids` compris ;
  - les Spenders : conversations déplacées ; fausse « réassignation » du trigger `0034`
    supprimée ; événements KEEP→KEEP supprimés (133 en prod, dont 128 pour André) ;
  - l'id MyPuls (`:116-129`) ;
  - le contrôle final (`:131-155`) : mêmes lignes, même CA au centime, mêmes conversations.

  La fiche vidée est **gardée**.
- **Les 14 fusions** de `/tmp/fusion/toutes.sh` (Lionel compris, pour finir ses références) **n'ont
  pas été lancées.** Elles deviennent le premier lot validé de la PR 2 (D13).
- **≈ 150 fiches créées depuis le 2026-09-01**, dont **26** libellés corrompus du 2026-09-07
  (`Amed\n … Aucune vente sur la période`).
- **Pseudo-fiches « Indéterminé (<modèle>) ».** Exemples : « Indéterminé (Carla) » 5 583 € de
  juillet à septembre, « (Lena_dv) », « (Luciemns) », « (Juliebd) »…, soit ≈ 6,4 k€. Elles ne
  vivent que dans `chatter_creator_daily`.
- **Un membre ne se relie qu'à une fiche** : `profiles.chatter_id` est UNIQUE
  (`0079_profiles_chatter_id_link.sql:7`). La paie d'un membre relié à l'une des fiches perd
  donc le CA des autres (`compta-ca.ts:54-66`).

### Dans le code

- **Résolution par libellé.** `ingestChatterDay` (`apps/ingestion/src/pipeline.ts:141-284`)
  résout chaque chatteur par `alias ?? nom ?? e-mail` (`:170`). Un libellé inconnu crée une
  fiche (`:171-179`).
- **Une vente écartée a déjà créé sa fiche.** Les libellés des ventes entrent dans `rawNames`
  **avant** la résolution de la modèle (`:160-162`), puis la vente peut être écartée
  (`:243-251`).
- **Un jour n'est lu qu'une fois** (rattrapage depuis `max(date)+1`, `:430-436`). Une vente
  écartée (modèle inconnu) n'est signalée que dans `warnings`, et **aucun contrôle ne compare
  nos totaux à MyPuls**.
- **L'alerte « vérifier doublon » n'a jamais été vue.** Ce n'est qu'une ligne de `warnings`
  (`:488-494`), écrite dans `ingest_runs.summary` (`record-run.ts:18-25`). Elle n'atteint Sentry
  que si le run est `degraded` (`worker.ts:344-349`), ce qu'une création de fiche ne provoque
  pas (`run-summary.ts:46-61`). Aucun écran ne lit `ingest_runs`. Aucune alerte Telegram
  n'existe (`ARCHITECTURE.md:147`, `:176`).
- **Les shifts posent déjà `chatters.mypuls_user_id`** (`shifts-core.ts:163-178`, colonne
  `text unique`, `0001_schema.sql:42`). Mais le repli par nom (`:148-160`) rattache un id
  inconnu à une fiche qui porte déjà un autre id.
- **`/team/money` renvoie `attributed_user_id`** (`team-money.ts:17`) et `attributed_user` =
  e-mail du compte (capture du 11/09, 100/100). Le commentaire `pipeline.ts:44-45` est périmé.
- **Classement Stat chatter** : il ne garde que les fiches reliées à un membre au rôle
  `chatteur` (`get-stat-chatteur.ts`, `closing-by-chatter.ts` : `isChatter: m.role ===
  'chatteur'`). Le CA vient de `chatter_daily` (RPC `chatters_report`).
- **Page Membres** :
  - onglets « Comptes » / « Turnover » / « Activité » (`members-tabs.tsx:11,61-65`) ;
  - « Activité » réservé aux admins (`page.tsx:63-65`) ;
  - une lecture par onglet (`page.tsx:73-75`).

  Filtres « Doublons » (membres au même nom) et « À rattacher », de ce chantier, non commités
  (`member-link-hints.ts` + test, `members-table.tsx:123-146`, `members-columns.tsx`).

### Dans les captures MyPuls (`apps/ingestion/raw/pages/`)

Captures lues :
- page ventes du 06/09 ;
- fragment résumé du 06/09 ;
- page du 06/07 (ancien format) ;
- page capturée le 12/09 couvrant 16→31/08 (6 775 ventes).

1. **Chaque vente porte l'id MyPuls**, attribut `data-current-user-id` du bouton « Éditer »
   (`#sales-detail-table`, 06/09 l.5201). Taux : 482/482 le 06/09, 413/413 le 06/07, 6 775/6 775
   sur 16→31/08. Une vente indéterminée a un id vide et le libellé `Indéterminé (<modèle>)`
   (l.9397 et suivantes).
2. **Le libellé d'une vente dépend du couple (modèle, compte)** : 1802 = « Lionel » sur
   Claire_sps, « lioneldiv » sur Lolafps, les mêmes jours. `assignableUsersByCreator` (l.23234)
   est cette table : 0 écart sur 6 268 ventes.
3. **Le `<select name="chatter">` donne un libellé global par compte** (l.1198, 486 ids). Il
   contient de vrais homonymes : « Serge » 9332/10504, « Safidy » 203/6057, « yann (accès
   révoqué) » 243/1163.
4. **Le résumé n'a ni id ni total.** Pas d'attribut `data-*`, pas de ligne Total dans le fragment.
   Le 06/09 : 81 libellés résolus par le select, 2 par le seul JSON, 1 ambigu, 30 e-mails à 0 €.
5. **Invariant par id : CA du résumé = Σ ventes du même id, au centime.** Résultat : 84/84 le
   06/09, 89/89 le 06/07 (totaux 13 047,86 € et 10 720,76 €). Il départage les 3 homonymes vus.
6. **Mécanisme du dédoublement** : des libellés de résumé diffèrent des libellés de vente le même
   jour (3 comptes le 06/09, 6 le 06/07).
7. **Totaux INDÉPENDANTS des lignes : ils existent sur la page des ventes** (format actuel) :
   - carte KPI **« Ventes »** = nombre de ventes, indéterminées comprises (06/09 l.1713-1726) ;
   - carte(s) **« Montant net · <devise> »** = total net par devise (l.1744-1755) ;
   - **« Total net »** en tête du classement, par devise (l.1797-1801).

   Elles égalent la somme des lignes lues, au centime et à l'unité :
   - **482 ventes et 13 047,86 €** le 06/09 ;
   - **6 775 ventes et 168 345,52 €** sur 16→31/08.

   Le format du 06/07 n'avait pas la carte montant (« Ventes attribuées », « Temps actif »).
   C'est le format servi aujourd'hui qui compte : la capture du 12/09 rend le format actuel pour
   des dates d'août (déduction : MyPuls sert le format courant quelle que soit la date).
8. **Coût Worker** : scripts inline 50 Ko, select 65 Ko, cartes KPI négligeables, pour une page
   de 1,88 Mo. **À mesurer** (limite 10 ms CPU, `money-team-hr.ts:16`).

## Décisions

| # | Décision | Conséquence assumée |
|---|---|---|
| D1 | **L'id d'une vente se lit sur sa ligne.** | `chatter_creator_daily` ne dépend plus d'aucun libellé. |
| D2 | **L'id d'une ligne de résumé vient de l'annuaire du jour** (ventes, select, JSON) : exact d'abord, `normLabel` ensuite. | « yann » = 1163 ; « yann (accès révoqué) » normalisé reste ambigu. |
| D3 | **Libellé ambigu départagé par le montant** : seul candidat dont Σ ventes = CA au centime, CA > 0, candidat non déjà pris (validé par Benoit). Sinon mis de côté. | Le montant mis de côté fait échouer le contrôle b du jour : il est visible. |
| D4 | **`chatters.mypuls_user_id` est la clé ; l'alias n'est qu'un repli.** Une fiche par alias sans id reçoit l'id ; une fiche par alias portant un autre id est un homonyme (nouvelle fiche). | Toute fiche créée porte son id quand on le connaît. |
| D5 | **Trois contrôles par jour ingéré, résultat persisté** (§ 3) : (a) par id, résumé = ventes ; (b) totaux : rien de perdu ni en double, et égalité avec les totaux de la page MyPuls ; (c) une fiche = un compte. | Un contrôle en échec → jour **« à vérifier »**, run dégradé (Sentry en filet), visible dans l'app. |
| D6 | **Les anomalies d'identité sont persistées** (`chatter_identity_issues`) et lues dans Membres. Elles **ne dégradent pas** le run par elles-mêmes : seul un jour « à vérifier » le fait. | Un doublon historique (déjà résolu par id pour les jours neufs) se règle par une fusion, sans sonner chaque nuit. |
| D7 | **Rattrapage par fusion SQL**, pas par ré-ingestion. | Les attributions éditées après coup dans MyPuls ne changent pas les chiffres. |
| D8 | **La migration livre les outils**, les décisions de données passent par un script ops. | Rien qui dépende de la prod dans l'historique des migrations. |
| D9 | **Pseudo-fiches « Indéterminé » conservées**, note informative dans Membres, aucune relecture des jours passés (décision Benoit). | Une attribution corrigée après coup dans MyPuls ne redescend pas. |
| D10 | **Cible proposée par le rapport** : fiche reliée à un membre, sinon celle qui porte l'id, sinon la plus active (décision Benoit). | Deux fiches reliées → pas de fusion. |
| D11 | **Rapport sur tout l'historique** servi par MyPuls, arrêt signalé au premier jour non servi (décision Benoit). | — |
| D12 | **Totaux de page MyPuls** (cartes « Ventes » et « Montant net ») lus et comparés chaque jour. Absents → contrôle en échec. | Un changement de markup se voit dès la nuit suivante. |
| D13 | **PR 2 = rapport + fusions VALIDÉES.** Le rapport est en lecture seule. L'apply ne fusionne que les paires d'un **lot listé et validé par Benoit**, et chaque groupe doit porter la **double preuve** : même id MyPuls ET compensation au centime jour par jour, aucun jour en commun. Sinon, refus. Aucune pose d'id en masse. | Premier lot = les 14 fusions de `toutes.sh`. Les autres candidates apparaissent dans le rapport et dans l'onglet. |
| D14 | **Recette de non-régression avant tout déploiement du Worker** (§ 8) : plusieurs semaines rejouées sur l'UAT, ancien puis nouveau code, comparaison jour par jour et fiche par fiche. Toute différence doit être expliquée, sinon pas de déploiement. | Livrable : un rapport de diff, lu par Benoit. |

## Design

### 1. Lire les ids et les totaux de la page — `@glagency/mypuls` + parser Worker

- **Ventes.** `MoneyTeamTx.mypulsUserId: string | null`, lu dans `data-current-user-id`.
- **Annuaire.** `MoneyTeamDay.directory` : options du select (entier > 0) + JSON
  `assignableUsersByCreator` (absent → warning, pas d'échec).
- **Totaux de page.** `MoneyTeamDay.pageTotals = { salesCount: number | null, net: { currency,
  amount }[] }`, lus dans les cartes `.kpi-card` (libellé `h6`, valeur `h3`) :
  - « Ventes » → nombre ;
  - « Montant net · XXX » → montant.

  Une fonction pure `pageTotalsFromCards` est partagée par cheerio et HTMLRewriter.
- **Mêmes résultats en Node et dans le Worker.** Vérifié par `POST /__parse-moneyteam` sur la
  capture du 06/09. Attendu : 482 ventes, 482 ids, annuaire 731, `salesCount` 482,
  `net` [EUR 13 047,86].
- **Fixtures** réduites des captures réelles :
  - select ;
  - JSON ;
  - vente indéterminée ;
  - ligne « Aucune vente sur la période » ;
  - cartes KPI.

### 2. Résoudre — règle pure `resolveDayIdentity` (`@glagency/core`) + `ingestChatterDay`

Comme avant :
- l'id de chaque ligne vient de la vente, ou de l'annuaire pour le résumé (D2, D3) ;
- la fiche d'un id est :
  - celle qui porte l'id ;
  - sinon l'unique fiche sans id trouvée par alias ;
  - sinon, entre plusieurs, celle reliée à un membre, puis celle du résumé ;
  - deux fiches reliées → rien n'est posé ;
  - sinon une création avec l'id ;
- l'alias divergent donne une anomalie `doublon`, sans repointage ;
- sans id, chemin historique.

La règle rend aussi l'id déduit de chaque ligne de résumé (`summaryIds`) et le drapeau
« jour sans aucun id » (`noIds`), dont se servent les contrôles.

**Relevé des shifts** : le repli par nom ne rattache un id inconnu qu'à une fiche **sans id**.
Une fiche déjà identifiée devient `ambigu` (`shifts-core.ts:148-160`).

### 3. Fiabilité — trois contrôles par jour, persistés (D5)

Après l'écriture de `chatter_daily` et `chatter_creator_daily` d'un jour, **un seul appel** RPC
`finish_chatter_day` :
- pose les ids et enregistre les anomalies ;
- calcule **en base** Σ `chatter_daily` et Σ `chatter_creator_daily` du jour ;
- compare à ce qui a été lu ;
- écrit la ligne du jour dans **`ingest_day_checks`** (`day` PK, `status` ∈ `ok` /
  `a_verifier`, `checks` jsonb, `totals` jsonb, `checked_at`), en upsert, donc idempotent au
  rejeu.

| Contrôle | Calculé par | Règle (au centime) |
|---|---|---|
| **a — résumé = ventes, par compte** | `dayChecks` (core) | Pour chaque id du jour : CA du résumé = Σ ventes du même id. Jour sans aucun id → échec. |
| **b1 — résumé écrit** | SQL | Σ `chatter_daily` du jour **en base** = Σ (PPV + tips) des lignes du résumé lues. Un montant mis de côté (D3) fait échouer, à dessein. |
| **b2 — ventes écrites** | SQL | Σ `chatter_creator_daily` du jour **en base**, pseudo-fiches « Indéterminé » comprises = Σ des ventes lues. Une vente écartée (modèle inconnu) fait échouer. |
| **b3 — total de la page** | `dayChecks` | Σ des ventes lues = Σ des cartes « Montant net », et nombre de ventes lues = carte « Ventes ». Cartes absentes → échec (D12). |
| **c — une fiche = un compte** | `dayChecks` (+ SQL pour les liens refusés) | Aucune ligne d'id X vers une fiche qui porte un autre id ; aucune ligne d'id X vers une fiche sans id (donc aucune fiche créée sans id alors que l'id était connu) ; aucun id réparti sur deux fiches ; aucun lien refusé. Jour sans id → échec. |

- **Statut.** Un échec → jour `a_verifier` → `IngestDayResult.reliabilityAlerts` > 0 →
  `summarizeRun` passe `degraded` → Sentry.
- **Jour sans ligne.** Un jour ingéré mais sans ligne de contrôle (échec du pas chatteur) est
  affiché **« non vérifié »**. On le repère par les jours de `creator_daily` (RPC
  `reliability_days`).
- **Pourquoi en SQL pour b1/b2.** C'est l'état réel de la base qu'on prouve, pas ce que le code
  croit avoir écrit. Le fragment résumé n'ayant aucun total indépendant, b1 compare la base au
  résumé lu ligne à ligne. b3 apporte, côté ventes, la preuve contre la page MyPuls elle-même.

### 4. Anomalies d'identité (D6)

- **Table `chatter_identity_issues`** :
  - `issue_key` unique (idempotence) ;
  - `kind` ∈ `doublon`, `membres_multiples`, `homonyme`, `conflit_id`, `fiche_creee`,
    `resume_mis_de_cote`, `ecart_invariant` ;
  - fiches en clé étrangère `on delete cascade` ;
  - `resolved_at` / `resolved_by` (« Vu »).
- **Droits.** RLS en lecture et en « Vu » pour l'admin (comme `member_events`, `0108:12-13`).
  Écriture en service role.
- **Effacement.** Une fusion efface les anomalies de la fiche vidée.
- **Qui écrit :**
  - l'ingestion : `doublon`, `membres_multiples`, `fiche_creee`, `resume_mis_de_cote`,
    `ecart_invariant` ;
  - l'apply d'un lot : les anomalies du rapport (`homonyme`, `conflit_id`,
    `membres_multiples`) et les paires candidates **non validées**, en `doublon`.

### 5. Rattrapage — rapport, puis lots validés (D13)

CLI `pnpm --filter @glagency/ingestion identity-backfill`.

1. **Rapport (sans option, lecture seule).**
   - **Lecture** : remontée jour par jour depuis hier jusqu'au premier jour de
     `chatter_creator_daily`, arrêt au premier jour non servi (D11). Sources de l'annuaire :
     ventes, select, JSON, e-mails de `/team/money`, `mypuls_shift_coverage`.
   - **Classement** de chaque fiche : relier (information : l'ingestion le fera), doublons
     candidats (cible D10), homonyme, conflit, corrompue, indéterminée.
   - **Preuve de groupe** (`proveGroup`) pour chaque groupe candidat :
     - **même id MyPuls** : chaque fiche du groupe a un ensemble d'ids (porté ∪ votés) non vide,
       et l'union vaut un seul id ;
     - **aucun jour en commun** sur `chatter_daily (jour)` ni sur `chatter_creator_daily
       (modèle, jour)` ;
     - **compensation au centime** : chaque jour où une fiche à vider a des chiffres, Σ résumé
       du groupe = Σ ventes du groupe.
   - **Sortie** : `apps/ingestion/raw/identity/<jour>/plan.csv` (gitignoré).
2. **Lot.** Un fichier CSV versionné (`apps/ingestion/identity-lots/lot-N.csv`) : `action,slug,
   garder,vider,id_attendu`, avec `action` ∈ `fusionner` / `supprimer`. Benoit le valide en
   revue de PR.
   - **Lot 1** = les 14 lignes de `toutes.sh`, ordre conservé, `id_attendu` 1163 pour yann.
   - Les lignes qui partagent une même fiche gardée forment **un groupe** (yann + yann30000,
     rayson + rayson-mail), prouvé ensemble : une paire seule peut ne pas compenser.
3. **`--lot=<fichier>`** : le rapport évalue aussi chaque groupe du lot. Preuve OK ou raisons du
   refus, dans `lot-decisions.csv`.
4. **`--lot=<fichier> --apply`**, sur accord :
   - sauvegarde CSV ;
   - pour chaque groupe prouvé, `merge_chatters` par paire, chacune dans sa transaction ;
   - suppression des fiches `supprimer` classées « corrompue », via `delete_empty_chatter` ;
   - publication des anomalies du rapport.

   **Rien d'autre.** `--apply` sans `--lot` est refusé. Sur la prod, il faut en plus
   `IDENTITY_APPLY_PROD=oui`.

**`merge_chatters(p_keep, p_old, p_mypuls_id)`**, migration `0183`, `security invoker`,
`execute` réservé à `service_role`. Reprise **ligne à ligne de la v2 de `fusion.sh`** :
- garde-fous ;
- toutes les clés étrangères vers `chatters`, plus le filet `chatter_id` ;
- `chatter_creators` et `chatter_daily_reach` non traitées : une référence → arrêt ;
- déplacements, Spenders, id MyPuls, contrôle final ;
- en plus : effacement des anomalies de `p_old`.

`merge_chatters` garde la fiche vidée ; la CLI la supprime ensuite (insights sauvegardés puis
supprimés, `delete_empty_chatter`) — décision de Benoit du 2026-10-06, voir « Questions ».

**`delete_empty_chatter(p_id)`** : même recensement des références (hors alias et anomalies),
puis `delete` ou exception.

**Pourquoi un script ops et pas une migration pour la donnée :**
1. les paires dépendent de l'état de prod ;
2. il faut un rapport, une validation humaine et une sauvegarde ;
3. le plan se recalcule à chaque passage ;
4. l'historique des migrations reste du schéma (`AGENTS.md` § Migrations).

### 6. Les 26 fiches « … Aucune vente sur la période »

- **Cause (git).** Entre `2f60d563` et `a56f6d89` (2026-09-07), `parseMoneyTeamSales` lisait la
  `ranking-table`. Les lignes muettes y portent `Aucune vente sur la période` (06/09 l.4488).
  Le libellé créait une fiche avant que la vente ne soit écartée.
- **Parser : corrigé** (`money-team.ts:131-137`). Une fixture verrouille le cas.
- **Nettoyage** : lignes `supprimer` d'un lot, `delete_empty_chatter`. L'absence de faits sur ces
  fiches est **à vérifier** (le rapport le dit).

### 7. Onglet admin « Fiches MyPuls » (Membres, `?vue=fiches`)

- **Accès.** Admin seulement, comme « Activité » (`page.tsx:63-65`, `members-tabs.tsx:64`). Une
  lecture par onglet. Pas de `use cache`. Template sans fetch.
- **Contenu, dans l'ordre :**
  1. **Statut de fiabilité** du dernier relevé (dernier jour de `creator_daily`) : « Vérifié le
     <date> » ou « À vérifier ». Il donne le détail des contrôles en échec, et l'**historique**
     des 14 derniers jours (ok / à vérifier / non vérifié). Source : RPC `reliability_days(14)`.
  2. **« Fiches avec du CA sans membre — absentes du classement Stat chatter »** : fiches dont
     Σ `chatter_daily` > 0 sur la période choisie, sans membre au rôle `chatteur`, triées par CA.
     Source : RPC `unranked_chatters_ca(p_from, p_to)`, `security invoker`
     (`guidelines-data-loading` § 1).
  3. **Fiches MyPuls en double** (`doublon`, `membres_multiples`, `homonyme`, `conflit_id`).
  4. **Nouvelles fiches à vérifier** (`fiche_creee`).
  5. **Montants non attribués** (`resume_mis_de_cote`, `ecart_invariant`).
  6. **Note « Ventes sans chatteur »** (D9), informative : montant par modèle sur la période,
     « à attribuer dans MyPuls — ne se rattache pas à un membre ». Source : RPC
     `unattributed_sales`.
- **Actions.**
  - « Vu » sur une anomalie : Server Action admin.
  - En option, dans une PR ultérieure : « Fusionner » depuis une ligne `doublon`.
- **Cohabitation.** Les filtres « Doublons » / « À rattacher » de la liste portent sur des membres
  et restent tels quels.
- **UI.** Composants existants à l'identique : `Card`, `DataTable` + `Sortable`, `Badge` +
  `STATUS_COLORS` (`guidelines-standard-feature` § 9).

### 8. Recette de non-régression — avant tout déploiement du Worker (D14)

**Procédure exacte**, détaillée dans le plan (Task 14) :
- sur l'UAT (`0183` appliquée), pour chaque jour d'une fenêtre de **3 semaines réelles** (J-23 →
  J-2), dans l'ordre :
  1. rejeu du jour avec **l'ancien code** (worktree détaché sur `origin/develop`) ;
  2. photo du jour : Σ par fiche de `chatter_daily` et `chatter_creator_daily`, toutes les fiches
     (nom, id), anomalies ouvertes, ligne de contrôle ;
  3. rejeu avec **le nouveau code** ;
  4. nouvelle photo.
- puis comparaison, avec `compareReplay` (core, pur, testé), jour par jour :
  - **totaux** : Σ `chatter_daily` après = Σ avant − montants mis de côté du jour ;
    Σ `chatter_creator_daily` après = Σ avant ;
  - **fiche par fiche** : chaque fiche dont le montant change doit avoir une **raison** tirée des
    anomalies et des ids : doublon résolu (id X), deux membres reliés, fiche créée pour l'id X,
    id posé, résumé mis de côté. Sinon : **INEXPLIQUÉ**.

**Livrable** : `apps/ingestion/raw/recette/rapport.md`. Pour chaque jour :
- les totaux avant/après ;
- les mouvements par fiche avec leur raison ;
- le statut du contrôle de fiabilité (nouveau code).

En tête : le verdict, le nombre de jours, les mouvements inexpliqués.

**Règle** : aucun mouvement inexpliqué, aucun écart de total non expliqué. Chaque jour « à
vérifier » doit être listé avec sa cause et accepté par Benoit. Sinon, **pas de déploiement**.

## Cas limites

| Cas | Comportement |
|---|---|
| Renommage MyPuls | Même id, même fiche. Le nouveau libellé devient un alias. |
| Libellé différent par modèle (1802) | Ventes par id, résumé par l'annuaire. |
| Compte révoqué (1163) | Exact puis `normLabel`. |
| Libellé partagé (Serge…) | Ventes par id. Résumé départagé (D3), sinon mis de côté : b1 échoue, le jour est « à vérifier ». |
| Ventes indéterminées | Pseudo-fiche conservée, jamais d'id. Comptées dans b2 (elles sont dans `chatter_creator_daily`). |
| Vente d'une modèle inconnue du CRM | Écartée comme avant ; b2 échoue, le jour est « à vérifier ». |
| Jour sans aucun id (bouton disparu) | Repli libellé, contrôles a et c en échec, jour « à vérifier ». |
| Cartes KPI absentes ou renommées | b3 en échec, jour « à vérifier ». |
| Résumé vide alors que des ventes existent | a échoue pour chaque id, b1 échoue (base non réécrite). |
| Deux fiches reliées pour un même id | Rien d'automatique ; c échoue (lignes par libellé), anomalie `membres_multiples`. |
| Rejeu d'un jour | Idempotent : contrôle et anomalies en upsert. |
| Page MyPuls plus servie (rapport) | Arrêt signalé. |

## Contraintes

- **Worker** (`worker.ts:55-58`, ~13 appels fixes + ~8 par jour, `maxCatchup: 3`) :
  - aucune requête MyPuls de plus ;
  - +1 sous-requête par run (membres reliés) ;
  - +1 par jour, toujours (`finish_chatter_day`) ;
  - au pire ≈ 13 + 1 + 3 × 9 = 41 sur 50 ;
  - CPU à mesurer.
- **Non-régression** : recette § 8 obligatoire avant déploiement.
- **Qualité** :
  - Vitest (`mypuls`, `core`, `web`) ;
  - test SQL de la migration sur l'UAT, en transaction annulée ;
  - typecheck, lint, build ;
  - **relecture indépendante par tâche**.

## Non-objectifs

- Aucun changement de la règle du classement Stat chatter (seulement l'affichage de qui en est
  absent).
- Aucune liaison automatique `profiles.chatter_id`.
- Aucune ré-ingestion de l'historique.
- Aucune pose d'id en masse.
- Aucun découpage des homonymes historiques.
- Pas de Telegram, pas de relecture des jours passés.
- Pas de changement des résolveurs spenders.

## Découpage

1. **PR 1 — lire les ids, l'annuaire et les totaux de la page.** Aucun changement de
   comportement.
2. **PR 2 — rattrapage.**
   - Migration **`0183`** : tables `chatter_identity_issues` et `ingest_day_checks` ; fonctions
     `apply_chatter_identity`, `finish_chatter_day`, `merge_chatters`, `delete_empty_chatter`,
     `unattributed_sales`, `unranked_chatters_ca`, `reliability_days`.
   - CLI rapport + lots.
   - Lot 1.
   - Exécution : rapport UAT ; lot de répétition UAT ; `0183` en prod ; rapport prod ; lot 1
     évalué ; apply prod. Chaque étape distante sur accord explicite.
3. **PR 3 — résolution par id + contrôles nocturnes.**
   - Règle `core`, `dayChecks`, `run-summary`, pipeline, garde des shifts.
   - Outil de recette (`compareReplay` + CLI).
   - **Recette § 8**.
   - Déploiement du Worker (après l'apply prod de la PR 2 et une recette sans inexpliqué).
4. **PR 4 — onglet « Fiches MyPuls »** : statut de fiabilité, CA sans membre, anomalies, note.
5. *Option, plus tard* : « Fusionner » depuis l'onglet.

## Risques

- **Bouton d'attribution ou cartes KPI dépendants du markup et des droits** : contrôles en
  échec, jour « à vérifier », repli libellé pour l'identité.
- **Invariant a mesuré sur 2 jours seulement** : la recette § 8 le rejoue sur 3 semaines.
- **Ligne de contrôle périmée.** Si un rejeu échoue après l'écriture mais avant
  `finish_chatter_day`, la ligne du jour garde l'ancien verdict. Mitigation : le run est en
  échec (Sentry). Un jour jamais contrôlé s'affiche « non vérifié ».
- **Fusion définitive**, hors CSV. Mitigation : lot validé, double preuve, une transaction par
  paire, garde-fous de la v2.
- **`/tmp/fusion/fusion.sh` volatil** : sa logique passe dans `merge_chatters` dès la PR 2.
- **Jours « à vérifier » nombreux au début** (ventes de modèles inconnues, montants mis de côté)
  : c'est le but. Chaque cause se règle (modèle à créer, fusion) ou s'accepte en connaissance de
  cause.

## Décisions de Benoit (2026-10-01 → 2026-10-05)

- **Q1** : pseudo-fiches « Indéterminé » conservées, note informative. Une pseudo-fiche agrège
  tout un modèle : la relier à un membre lui créditerait tout. La correction se fait dans MyPuls.
- **Q2** : alertes dans l'app (onglet), Sentry en filet secondaire.
- **Q3** : départage par montant accepté.
- **Q4** : cible = fiche reliée, sinon porteuse de l'id, sinon plus de CA.
- **Q5** : garde des shifts dans la PR 3.
- **Q6** : tout l'historique servi par MyPuls.
- **Q-note → (a)** : note informative, pas de relecture.
- **Q-onglet → (B)** : onglet « Fiches MyPuls », les filtres restent dans la liste.
- **Version fiabilité (2026-10-05)** :
  - trois contrôles nocturnes persistés (D5) ;
  - statut de fiabilité et « CA sans membre » en tête de l'onglet ;
  - PR 2 limitée au rapport et aux lots validés à double preuve (D13), lot 1 = `toutes.sh` ;
  - recette de non-régression avant déploiement (D14) ;
  - relecture indépendante par tâche ;
  - accord explicite pour chaque étape prod.

## Questions encore ouvertes

Aucune. **Fiche vidée : supprimée** (décision de Benoit, 2026-10-06 — les sauvegardes de la base
font foi). `identity-backfill --apply` sauvegarde puis supprime les `insights` de la fiche vidée et
appelle `delete_empty_chatter` après chaque fusion ; un échec laisse la fusion faite, garde la fiche,
le signale et sort en code 2.

## Mise en prod

Chacune de ces étapes demande l'**accord explicite de Benoit** :
- `0183` en prod ;
- apply du lot 1 en prod ;
- déploiement du Worker (après la recette) ;
- release web.

À mettre à jour à chaque PR :
- `CHANGELOG.md` : une ligne par PR ;
- `ARCHITECTURE.md` :
  - § Relevé MyPuls (`:289`) : identité résolue par `mypuls_user_id` sur les deux flux, contrôles
    de fiabilité ;
  - `:145` : `ingest_runs` sans écran ;
- `docs/CARTE.md` : commandes `identity-backfill` et `recette-identite`, onglet de Membres.
