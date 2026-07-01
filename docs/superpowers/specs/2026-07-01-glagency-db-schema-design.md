# glagency — Schéma base de données (design)

> Spec générée le 2026-07-01 à partir de l'analyse multi-agents des vraies sources MyPuls.
> Design détaillé exhaustif (toutes colonnes) : `packages/db/design/schema-design.json`.

## Contexte

Rebuild propre de la couche analytics de l'ancien « Chatters Performance Dashboard ». **MyPuls reste la source amont** ; on injecte désormais la donnée dans **Postgres/Supabase** (l'ancien projet n'avait pas de base — tout en JSON/CSV). Données **sensibles** servant à piloter le business : les calculs doivent être fiables et non-ambigus.

## Principe cardinal

Modèle en étoile, grain JOUR = source de vérité. 3 couches strictement séparées : (1) DIMENSIONS propres à clés stables — teams (unité de management/lead, porte les quotas), creators (modèle/compte OF, FK team_id + fusion secondaires + excluded), chatters (clé = mypuls_user_id/email, PAS le name instable), + chatter_alias (réconciliation d'identité sale) et chatter_creators (N-N multi-modèles). (2) FAITS QUOTIDIENS immuables, une table par fichier source : chatter_daily (argent+présence+réactivité+volume, tous modèles, depuis daily_ca.csv), chatter_daily_reach (messages/mots/fans/ppv_proposes depuis daily_fans_distincts.csv), creator_daily (ca+ppv/tips/renew+abonnés depuis dashboard/stats+subscriptions), chatter_creator_daily (ventilation CA par modèle pour le multi-modèles). (3) CONFIG MANUELLE jamais écrasée par le refresh (quotas, creator_transfers, insight_states, bilans/bilan_revisions, chatter_config fondu dans chatters, excluded fondu dans creators, payroll_config). Principe cardinal : TOUT agrégat période/semaine/mois et tout champ dérivé (com=ca*0.10, taux_conv=Σvendu/Σpropose, evolution, per, pres_pct, idle_pct, LTV, Pareto, badges) est calculé en SQL (RPC SECURITY INVOKER + vues), JAMAIS stocké — sauf period_snapshot_kpi (rollup) qui fige total_ca_prev/n_active/bornes non recalculables. Correction majeure vs l'hypothèse initiale : présence+réactivité passent au grain JOUR (le CSV les fournit au jour), ce qui débloque le calcul des quotas ok_days/7 ; et fans_distincts est réintégré (vide seulement dans data.json, réel dans le CSV). Choix d'architecture : chatter_daily reste au grain (chatter,jour) TOUS MODÈLES car le CSV source n'a pas de colonne modèle ; la ventilation par modèle vit dans chatter_creator_daily (invariant Σmodèles = chatter_daily) plutôt que de forcer creator_id dans la PK d'une source qui ne le porte pas. Montants en numeric précis, pourcentages non bornés à 100 (taux_conv monte à 600, evolution à +1270%), FK explicites avec ON DELETE, index sur date + toutes les FK, CHECK garantissant l'intégrité des calculs (ca=ppv+tips côté chatter, reactivite>0, PAS de vendu<=propose).

## ⚠️ Décisions à faire valider par le gérant de projet

_Bloquantes pour figer certaines policies/définitions, mais **pas** pour construire la couche de base (dimensions + faits-jour + config), qui en est indépendante._

### A. Définitions métier (les chiffres officiels)
1. **CA total officiel** : le chiffre affiché = Σ CA par **modèle** (source MyPuls `dashboard/stats`) ou Σ CA des **chatteurs actifs** ? Les deux divergent — lequel fait foi ?
2. **CA période précédente** : recalculé depuis l'historique, ou on garde le chiffre **figé** de MyPuls (même période N-1) ?
3. **Devise** : EUR ou USD ? (l'ancien dashboard affiche €)
4. **Commission chatteur** : toujours 10 % du CA (`com = ca * 0.10`) ? barème par rôle/équipe ?
5. **Actif / inactif** : quel seuil exact définit un chatteur actif (jours travaillés ? CA ? présence ?) et sur quelle fenêtre ?
6. **CA modèle & renouvellements** : le CA d'un modèle inclut-il les `renew` ? y a-t-il une composante « autres » (l'écart Carla ~1828 € le suggère) ?
7. **Taux de conversion** : basé sur `propose` (daily_ca) ou `ppv_proposes` (reach) ? lequel fait foi ?

### B. Structure organisationnelle
1. **Hiérarchie équipe ↔ modèle** : une équipe gère-t-elle plusieurs modèles ? Les transferts de modèles entre équipes sont-ils fréquents ? (aujourd'hui ~1:1)
2. **Multi-modèles** : un chatteur peut-il travailler sur plusieurs modèles en même temps ?
3. **Comptes secondaires (fusion) & comptes exclus** (privés/test) : qui décide de la liste ? les exclus comptent-ils dans le CA ?

### C. Accès & sécurité (RLS) — données sensibles
1. **Qui voit quoi** : un manager voit-il TOUTE son équipe, ou seulement les modèles auxquels il est rattaché ?
2. **Rôles applicatifs** : admin / manager / chatteur ? un chatteur voit-il ses propres chiffres uniquement ?
3. **RGPD / rétention** : emails perso des chatteurs + montants = données sensibles. Contraintes d'accès en clair, durée de conservation, droit à l'effacement ?

### D. Quotas / paie / RH
1. **Quotas** : définis par équipe ou par chatteur ? quels seuils (présence, réactivité, conversion, CA) et sur quelle base (`ok_days/7`) ?
2. **Shifts manqués (`missed_shifts`)** : existe-t-il un planning / une source des shifts assignés pour les calculer ? sinon on laisse à 0.
3. **Bilans (débriefs manager↔chatteur)** : saisie manuelle à conserver ? qui les édite ? historisation des versions ?

### E. Ingestion / opérations
1. **Accès API MyPuls pérenne** (clé + compte) garanti pour l'ingestion auto ? (creds actuellement en clair → à roter)
2. **Fréquence de refresh** souhaitée : temps réel / horaire / quotidien ?
3. **Profondeur de backfill** : on a ~95 jours (depuis 01/03). Remonter plus loin ?
4. **Insights** : historiser toutes les générations (audit) ou garder seulement la dernière ?

## Défauts adoptés (future-proof, pour ne pas bloquer)

- **Hiérarchie** : on **déconfle** équipe (lead) et modèle (compte OF) dès maintenant — c'est un sur-ensemble strict (le 1:1 reste un cas particulier), zéro coût, et ça évite un refactor le jour d'un transfert.
- **CA total** : les **deux** définitions restent calculables (RPC) ; on ne fige pas l'« officielle » — on la choisit à l'affichage quand le PM aura tranché, sans changer le schéma.
- **RLS** : le schéma supporte les **deux** portées (on garde `profile_creators` et on prévoit `profile_teams`). Par défaut au départ : **admin = tout**, autres = lecture selon `profile_creators`. Bascule équipe = ajout de policy, pas de refonte.
- **Devise** : EUR par défaut (l'ancien dashboard affiche €).
- **Identité chatteur** : clé canonique = `mypuls_user_id`, fallback `email`, sinon résolution via `chatter_alias` / mapping manuel.
- **Présence** : stockée en **heures** `numeric(5,2)` (fidèle au CSV 11.38h).
- **Insights** : historisés (PK `insight_key + generated_at`) pour l'audit/âge.
- **Commission** : `com = ca * 0.10` par défaut (à confirmer par le PM).
- **`chatter_creator_daily`** peuplé au grain **période** d'abord (pas de fetch money-team par jour tant que non requis).

## Catalogue des tables (21)

### Dimensions (le « qui »)

#### `teams`
- **Grain** : 1 ligne = 1 équipe de management (lead : Carla, Sarah, Mathilde...). ~13 lignes.
- **Rôle** : Unité de rattachement des chatteurs, porteuse des quotas, cible des transferts de modèles. SÉPARÉE de creators pour supporter N modèles par équipe et l'historique de transfert (Tagwalker/DIX/Kira changent d'équipe).
- **PK** : `id`
- **Index** : `unique(name)`

| colonne | type | contraintes |
|---|---|---|
| `id` | `uuid` | pk default gen_random_uuid() |
| `name` | `text` | not null unique |
| `lead_name` | `text` | null (nom du responsable, souvent = name) |
| `active` | `boolean` | not null default true |
| `created_at` | `timestamptz` | not null default now() |

#### `creators`
- **Grain** : 1 ligne = 1 modèle / compte OF (Taprofcarla, Tagwalker, Carlaprive...).
- **Rôle** : Dimension modèle/compte OF ; rattachement courant à une équipe, fusion des comptes secondaires, exclusion (fond excluded_accounts.json). CREATOR_TO_TEAM = creators.team_id ; SECONDARY_TO_PRIMARY = primary_creator_id.
- **PK** : `id`
- **FK** : `team_id -> teams(id) on delete set null`, `primary_creator_id -> creators(id) on delete set null`
- **Index** : `unique(mypuls_creator_id)`, `unique(name)`, `index(team_id)`, `index(primary_creator_id)`

| colonne | type | contraintes |
|---|---|---|
| `id` | `uuid` | pk default gen_random_uuid() |
| `name` | `text` | not null unique (pseudo modèle) |
| `mypuls_creator_id` | `text` | unique null (id créateur MyPuls) |
| `team_id` | `uuid` | null (équipe courante) |
| `is_secondary` | `boolean` | not null default false |
| `primary_creator_id` | `uuid` | null (fusion SECONDARY_TO_PRIMARY) |
| `excluded` | `boolean` | not null default false (comptes privés/test hors CA) |
| `excluded_reason` | `text` | null |
| `active` | `boolean` | not null default true |
| `created_at` | `timestamptz` | not null default now() |

#### `chatters`
- **Grain** : 1 ligne = 1 chatteur (agent). Clé canonique = mypuls_user_id / email, PAS le name.
- **Rôle** : Dimension chatteur. Remplace le fragile unique(name,email) (email a 1 NULL + 1 doublon, name instable) par une clé stable + statut access_revoked extrait de la dimension (pas de la clé).
- **PK** : `id`
- **FK** : `team_id -> teams(id) on delete set null`
- **Index** : `unique(mypuls_user_id)`, `unique index on lower(email) where email is not null`, `index(team_id)`

| colonne | type | contraintes |
|---|---|---|
| `id` | `uuid` | pk default gen_random_uuid() |
| `mypuls_user_id` | `text` | unique null (clé stable API) |
| `email` | `citext` | null (unique via index partiel après dédoublonnage) |
| `display_name` | `text` | not null (nettoyer la ligne name=email) |
| `team_id` | `uuid` | null (équipe courante, config manuelle chatter_config.json) |
| `role` | `chatter_role` | null (enum ; '' -> null) |
| `active` | `boolean` | not null default true |
| `access_revoked` | `boolean` | not null default false (suffixe '(acces revoque)') |
| `config_updated_at` | `timestamptz` | null (updated_at manuel) |
| `created_at` | `timestamptz` | not null default now() |

#### `chatter_alias`
- **Grain** : 1 ligne = 1 libellé brut observé (pseudo/email/casse/emoji/suffixe) -> chatteur canonique.
- **Rôle** : Réconciliation d'identité (les 457/369 'distincts' surestiment le réel). Indispensable à l'exactitude de tout agrégat par chatteur ; l'ingestion résout chaque libellé brut via cette table.
- **PK** : `id`
- **FK** : `chatter_id -> chatters(id) on delete cascade`
- **Index** : `unique(raw_label_norm)`, `index(chatter_id)`

| colonne | type | contraintes |
|---|---|---|
| `id` | `uuid` | pk default gen_random_uuid() |
| `chatter_id` | `uuid` | not null |
| `raw_label` | `text` | not null (valeur brute d'origine) |
| `raw_label_norm` | `text` | not null (lower, strip accents/emojis/'(acces revoque)'/digits finaux) |
| `source` | `text` | not null check in ('csv_money','csv_reach','scrape','api','manual') |
| `created_at` | `timestamptz` | not null default now() |

#### `chatter_creators`
- **Grain** : 1 ligne = (chatteur, modèle) — affectation N-N.
- **Rôle** : Multi-modèles (assigned[]>1). Grain réel de la perf = (chatter, modèle) ; permet planned=count(members) et la ventilation du CA d'un chatteur multi-modèles vers la bonne équipe.
- **PK** : `(chatter_id, creator_id)`
- **FK** : `chatter_id -> chatters(id) on delete cascade`, `creator_id -> creators(id) on delete cascade`
- **Index** : `index(creator_id)`, `index(chatter_id)`

| colonne | type | contraintes |
|---|---|---|
| `chatter_id` | `uuid` | not null |
| `creator_id` | `uuid` | not null |
| `role` | `chatter_role` | null |
| `active` | `boolean` | not null default true |
| `is_manual` | `boolean` | not null default false (chatter_teams.json vs API roles MESSAGING) |
| `updated_at` | `timestamptz` | not null default now() |

### Faits quotidiens (source de vérité)

#### `chatter_daily`
- **Grain** : 1 ligne = (chatteur, jour), TOUS MODÈLES agrégés. Source = daily_ca.csv. SOURCE DE VÉRITÉ.
- **Rôle** : Fait quotidien argent+présence+réactivité+volume. Base de TOUS les agrégats période, des quotas ok_days/7, de présence/idle et de la réactivité moyenne. Débloque le calcul des quotas au jour (contrairement à l'ancien chatter_period_stats). Dédupliquer/SOMMER les sessions multiples (Safidy 05-17/05-30) à l'ingestion avant upsert.
- **PK** : `(chatter_id, date)`
- **FK** : `chatter_id -> chatters(id) on delete cascade`
- **Index** : `index(date)`, `pk(chatter_id,date)`

| colonne | type | contraintes |
|---|---|---|
| `chatter_id` | `uuid` | not null |
| `date` | `date` | not null |
| `ca` | `numeric(12,2)` | not null default 0 check (ca = ca_ppv + ca_tips) |
| `ca_ppv` | `numeric(12,2)` | not null default 0 check (>=0) |
| `ca_tips` | `numeric(12,2)` | not null default 0 check (>=0) |
| `propose` | `integer` | not null default 0 check (>=0) |
| `vendu` | `integer` | not null default 0 check (>=0) — PAS de check vendu<=propose |
| `presence_active_h` | `numeric(5,2)` | not null default 0 check (>=0) — heures actives (heures_actif) |
| `presence_idle_h` | `numeric(5,2)` | not null default 0 check (>=0) — heures idle |
| `reactivite_sec` | `integer` | null check (reactivite_sec is null or reactivite_sec > 0) — '-' -> NULL |

#### `chatter_daily_reach`
- **Grain** : 1 ligne = (chatteur, jour). Source = daily_fans_distincts.csv.
- **Rôle** : Reach/charge : audience (fans_distincts), messages, mots, offres PPV. Réintègre fans_distincts (RÉEL dans le CSV 1->523 ; vide seulement dans data.json). Table séparée de chatter_daily car fichier/job distinct et couverture chatteurs différente (369 vs 457). Dédupliquer doublon Safidy 2026-05-29.
- **PK** : `(chatter_id, date)`
- **FK** : `chatter_id -> chatters(id) on delete cascade`
- **Index** : `index(date)`

| colonne | type | contraintes |
|---|---|---|
| `chatter_id` | `uuid` | not null |
| `date` | `date` | not null |
| `messages` | `integer` | not null default 0 check (>=0) |
| `mots` | `integer` | not null default 0 check (>=0) |
| `fans_distincts` | `integer` | not null default 0 check (>=0) |
| `ppv_proposes` | `integer` | not null default 0 check (>=0) |

#### `chatter_creator_daily`
- **Grain** : 1 ligne = (chatteur, modèle, jour) — CA/volume ventilé par modèle.
- **Rôle** : Attribution par équipe d'un chatteur multi-modèles (team_chatter_details). Invariant vérifié à l'ingestion : SUM sur creator_id = chatter_daily(argent) pour (chatter,jour). NÉCESSITE un fetch money-team par créateur/jour ; tant qu'indisponible, cette table est peuplée au grain période (voir questions ouvertes).
- **PK** : `(chatter_id, creator_id, date)`
- **FK** : `chatter_id -> chatters(id) on delete cascade`, `creator_id -> creators(id) on delete cascade`
- **Index** : `index(creator_id, date)`, `index(date)`

| colonne | type | contraintes |
|---|---|---|
| `chatter_id` | `uuid` | not null |
| `creator_id` | `uuid` | not null |
| `date` | `date` | not null |
| `ca` | `numeric(12,2)` | not null default 0 check (ca = ca_ppv + ca_tips) |
| `ca_ppv` | `numeric(12,2)` | not null default 0 check (>=0) |
| `ca_tips` | `numeric(12,2)` | not null default 0 check (>=0) |
| `propose` | `integer` | not null default 0 check (>=0) |
| `vendu` | `integer` | not null default 0 check (>=0) |

#### `creator_daily`
- **Grain** : 1 ligne = (modèle, jour). Source = dashboard/stats + subscriptions.
- **Rôle** : Fait quotidien modèle. Ajoute ppv/tips/renew (comble le gap breakdown) -> mix revenu équipe + team.renew calculables. ca (total) >= ppv+tips+renew (le delta ~1828€ chez Carla est 'autres', d'où pas de CHECK d'égalité stricte).
- **PK** : `(creator_id, date)`
- **FK** : `creator_id -> creators(id) on delete cascade`
- **Index** : `index(date)`

| colonne | type | contraintes |
|---|---|---|
| `creator_id` | `uuid` | not null |
| `date` | `date` | not null |
| `ca` | `numeric(12,2)` | not null default 0 check (>=0) — total, inclut 'autres' |
| `ca_ppv` | `numeric(12,2)` | not null default 0 check (>=0) |
| `ca_tips` | `numeric(12,2)` | not null default 0 check (>=0) |
| `ca_renew` | `numeric(12,2)` | not null default 0 check (>=0) — renouvellements abo |
| `subs_active` | `integer` | not null default 0 check (>=0) |
| `new_subs` | `integer` | not null default 0 check (>=0) |

### Faits période

#### `insights`
- **Grain** : 1 ligne = 1 carte insight (scope+période) à une génération. Historisé par (insight_key, generated_at).
- **Rôle** : Cartes générées HISTORISÉES (PK versionnée -> plus d'écrasement). scope/team_id/chatter_id matérialisés à l'ingestion (parse du slug) pour éviter le reparse à l'affichage. Enum period réduit à {month,week} (scope 'day' jamais produit).
- **PK** : `(insight_key, generated_at)`
- **FK** : `snapshot_id -> period_snapshot_kpi(last_update) on delete set null`, `team_id -> teams(id) on delete set null`, `creator_id -> creators(id) on delete set null`, `chatter_id -> chatters(id) on delete set null`
- **Index** : `index(insight_key)`, `index(chatter_id)`, `index(creator_id)`, `index(team_id)`, `index(scope, period)`, `index(generated_at)`

| colonne | type | contraintes |
|---|---|---|
| `insight_key` | `text` | not null (slug stable : pareto_concentration, inactive_<email>, week_plan_<date>_<team>_<chatter>...) |
| `generated_at` | `timestamptz` | not null default now() |
| `snapshot_id` | `timestamptz` | null |
| `period` | `insight_period` | not null (enum month\|week) |
| `scope` | `insight_scope` | not null (global\|team\|chatter) |
| `severity` | `insight_severity` | not null |
| `category` | `text` | not null (à mapper vers référentiel normalisé) |
| `team_id` | `uuid` | null ('all' -> null + scope=global) |
| `creator_id` | `uuid` | null |
| `chatter_id` | `uuid` | null (résolu du slug/titre à l'ingestion) |
| `chatter_email` | `citext` | null (clé de jointure alternative) |
| `title` | `text` | not null |
| `body` | `text` | null |
| `recommendation` | `text` | null |
| `icon` | `text` | null (décoratif, pas une clé) |
| `data_points` | `jsonb` | null |
| `period_start` | `date` | null |
| `period_end` | `date` | null |

### Rollup figé

#### `period_snapshot_kpi`
- **Grain** : 1 ligne = 1 snapshot global d'extraction (clé = last_update).
- **Rôle** : Ancre les bornes de fenêtres (mois/semaine/semaine en cours) et fige total_ca_prev + n_active/n_inactive + max_missed_shifts, non reconstituables depuis l'extrait courant. Rattache les insights par snapshot_id (évolution MoM/WoW fiable).
- **PK** : `last_update`
- **Index** : `unique(period_start, period_end)`

| colonne | type | contraintes |
|---|---|---|
| `last_update` | `timestamptz` | pk |
| `period_start` | `date` | not null |
| `period_end` | `date` | not null check (period_end >= period_start) |
| `period_prev_start` | `date` | not null |
| `period_prev_end` | `date` | not null |
| `week_start` | `date` | not null |
| `week_end` | `date` | not null |
| `current_week_start` | `date` | not null |
| `current_week_end` | `date` | not null |
| `current_week_days` | `smallint` | not null check (between 0 and 7) |
| `period_days` | `smallint` | not null |
| `total_ca` | `numeric(14,2)` | not null (figé pour cohérence d'affichage) |
| `total_ca_prev` | `numeric(14,2)` | not null (NON recalculable -> DOIT être stocké) |
| `n_active` | `integer` | not null |
| `n_inactive` | `integer` | not null |
| `max_missed_shifts` | `integer` | not null default 0 |
| `source` | `text` | not null |
| `sheet_used` | `text` | not null |

### Config manuelle (jamais écrasée par le refresh)

#### `quotas`
- **Grain** : 1 ligne = 1 équipe -> seuils journaliers. Config manuelle (quotas.json).
- **Rôle** : Seuils quotas PAR ÉQUIPE (re-clé depuis creator_id) ; jamais écrasés par le refresh. Comparés jour par jour à chatter_daily pour ok_days/7 et la sévérité des cartes.
- **PK** : `team_id`
- **FK** : `team_id -> teams(id) on delete cascade`, `updated_by -> profiles(id) on delete set null`
- **Index** : `pk(team_id)`

| colonne | type | contraintes |
|---|---|---|
| `team_id` | `uuid` | pk |
| `presence_h` | `numeric(4,1)` | not null check (>0) — h/j, higher-is-better |
| `reactivite_s` | `integer` | not null check (>0) — s/j, LOWER-is-better |
| `medias_proposes` | `integer` | not null check (>=0) — /j |
| `conv_pct` | `numeric(5,2)` | not null check (between 0 and 100) — %/j |
| `ca_eur` | `numeric(12,2)` | not null check (>=0) — €/j |
| `updated_at` | `timestamptz` | not null default now() |
| `updated_by` | `uuid` | null |

#### `creator_transfers`
- **Grain** : 1 ligne = (modèle, date) — déplacement d'un modèle entre équipes. Config manuelle (transfers.json).
- **Rôle** : Historise les réaffectations de MODÈLE (pas de chatter) -> réattribution du CA à la bonne équipe avant/après la date. Remplace transfers(chatter_id) PK unique qui interdisait tout historique.
- **PK** : `(creator_id, date)`
- **FK** : `creator_id -> creators(id) on delete cascade`, `from_team_id -> teams(id) on delete set null`, `to_team_id -> teams(id) on delete set null`, `created_by -> profiles(id) on delete set null`
- **Index** : `index(to_team_id)`, `index(from_team_id)`, `pk(creator_id,date)`

| colonne | type | contraintes |
|---|---|---|
| `creator_id` | `uuid` | not null (le MODÈLE déplacé : Tagwalker/DIX/Kira) |
| `date` | `date` | not null |
| `from_team_id` | `uuid` | null |
| `to_team_id` | `uuid` | null check (from_team_id is distinct from to_team_id) |
| `created_by` | `uuid` | null |
| `created_at` | `timestamptz` | not null default now() |

#### `insight_states`
- **Grain** : 1 ligne = (insight_key, période) — état UI éditable, survit aux régénérations.
- **Rôle** : Statut de traitement des cartes ancré sur le SLUG (pas le insight_pk versionné) pour survivre aux régénérations quotidiennes. Découplé volontairement d'insights (pas de FK stricte).
- **PK** : `(insight_key, period)`
- **FK** : `updated_by -> profiles(id) on delete set null`
- **Index** : `pk(insight_key,period)`, `index(status)`

| colonne | type | contraintes |
|---|---|---|
| `insight_key` | `text` | not null (slug stable, pas la version) |
| `period` | `insight_period` | not null |
| `status` | `insight_status` | not null default 'open' (resolved\|in_progress\|ignored\|kept) |
| `snoozed_until` | `timestamptz` | null |
| `note` | `text` | null (action manager) |
| `updated_at` | `timestamptz` | not null default now() |
| `updated_by` | `uuid` | null |

#### `bilans`
- **Grain** : 1 ligne = 1 débrief manager↔chatter (clé signal_key). Saisie manuelle (bilans.json).
- **Rôle** : Débriefs RH manuels (sensibles). signal_key = relation 1-1 logique avec insight_states (statut de la carte). Filtrer les données de test à l'import ; enums fermés duree/etat.
- **PK** : `id`
- **FK** : `chatter_id -> chatters(id) on delete set null`, `saved_by -> profiles(id) on delete set null`
- **Index** : `unique(signal_key)`, `index(chatter_id)`, `index(date)`, `index(week_start)`

| colonne | type | contraintes |
|---|---|---|
| `id` | `uuid` | pk default gen_random_uuid() |
| `signal_key` | `text` | not null unique (= même clé que insight_states) |
| `signal_type` | `text` | null (dérivé du préfixe) |
| `chatter_id` | `uuid` | null (matché via alias) |
| `week_start` | `date` | null (dérivé des clés week_plan_<date>) |
| `date` | `date` | null (date du débrief, manuel) |
| `duree` | `bilan_duree` | null (enum 5min\|15min\|30min\|1h+) |
| `etat` | `bilan_etat` | null (enum motive\|neutre\|fatigue) |
| `resume` | `text` | null |
| `actions` | `text` | null |
| `objectifs` | `text` | null |
| `sanction` | `text` | null |
| `next_check` | `date` | null ('' -> NULL) |
| `notes` | `text` | null |
| `saved_at` | `timestamptz` | not null default now() |
| `saved_by` | `uuid` | null |

#### `bilan_revisions`
- **Grain** : 1 ligne = 1 version historique d'un bilan (issu de history[]).
- **Rôle** : Historique REQUÊTABLE des versions d'un bilan (audit/édition). Alternative : garder history jsonb sur bilans si l'audit n'a pas besoin d'être requêté.
- **PK** : `(bilan_id, revision_no)`
- **FK** : `bilan_id -> bilans(id) on delete cascade`
- **Index** : `pk`

| colonne | type | contraintes |
|---|---|---|
| `bilan_id` | `uuid` | not null |
| `revision_no` | `smallint` | not null (rang chrono par saved_at) |
| `date` | `date` | null |
| `duree` | `bilan_duree` | null |
| `etat` | `bilan_etat` | null |
| `resume` | `text` | null |
| `actions` | `text` | null |
| `objectifs` | `text` | null |
| `sanction` | `text` | null |
| `next_check` | `date` | null |
| `notes` | `text` | null |
| `saved_at` | `timestamptz` | not null |

#### `profiles`
- **Grain** : 1 ligne = 1 utilisateur applicatif (auth).
- **Rôle** : RBAC ; base des politiques RLS. Inchangé.
- **PK** : `id`
- **FK** : `id -> auth.users(id) on delete cascade`
- **Index** : `pk`

| colonne | type | contraintes |
|---|---|---|
| `id` | `uuid` | pk (= auth.users.id) |
| `role` | `app_role` | not null default 'member' (admin\|manager\|member) |
| `display_name` | `text` | null |
| `created_at` | `timestamptz` | not null default now() |

#### `profile_creators`
- **Grain** : 1 ligne = (profil, modèle) — scope de visibilité.
- **Rôle** : Cloisonnement RLS par modèle (le plus fin). L'accès équipe se dérive (creators.team_id). Envisager profile_teams si le scope devient équipe (question ouverte).
- **PK** : `(profile_id, creator_id)`
- **FK** : `profile_id -> profiles(id) on delete cascade`, `creator_id -> creators(id) on delete cascade`
- **Index** : `pk`, `index(creator_id)`

| colonne | type | contraintes |
|---|---|---|
| `profile_id` | `uuid` | not null |
| `creator_id` | `uuid` | not null |

#### `payroll_config`
- **Grain** : 1 ligne = (scope, key) — paie clé/valeur admin-only.
- **Rôle** : Paramètres de paie sensibles (admin-only via RLS). Placeholder compta ; la seule paie calculée reste com=ca*0.10 (en RPC, pas stockée).
- **PK** : `(scope, key)`
- **Index** : `pk`

| colonne | type | contraintes |
|---|---|---|
| `scope` | `text` | not null |
| `key` | `text` | not null |
| `value` | `jsonb` | not null |
| `updated_at` | `timestamptz` | not null default now() |

### Dérivés / vues

#### `insight_data_points`
- **Grain** : 1 ligne = (insight, ord). Normalisation optionnelle du jsonb data_points.
- **Rôle** : Normalisation OPTIONNELLE des KPIs formatés pour requêter/trier (seuils, comparaison vs cible). Sinon le jsonb data_points sur insights suffit.
- **PK** : `(insight_key, generated_at, ord)`
- **FK** : `(insight_key, generated_at) -> insights(insight_key, generated_at) on delete cascade`
- **Index** : `pk`

| colonne | type | contraintes |
|---|---|---|
| `insight_key` | `text` | not null |
| `generated_at` | `timestamptz` | not null |
| `ord` | `smallint` | not null (0-based) |
| `label` | `text` | not null |
| `is_meta` | `boolean` | not null default false (label commence par '_') |
| `status` | `text` | null ('ko' si [KO], 'ok' si [OK]) |
| `value_raw` | `text` | not null (chaîne d'origine : 'moy. 209e/j (cible 286e/j)') |
| `value_num` | `numeric(14,2)` | null (extrait si parsable) |

#### `v_chatter_period`
- **Grain** : VUE : (chatteur, période paramétrée) — remplace la table chatter_period_stats.
- **Rôle** : Remplace chatter_period_stats (table supprimée) : 100% dérivé de chatter_daily maintenant que présence/réactivité sont au jour. Aucune duplication ; taux_conv jamais stocké/moyenné.
- **PK** : `n/a (vue ; paramétrée par bornes via RPC fn_chatters_period)`
- **Index** : `n/a (matérialiser + index(chatter_id) seulement si perf leaderboard l'exige)`

| colonne | type | contraintes |
|---|---|---|
| `chatter_id` | `uuid` | dérivé |
| `ca / ca_ppv / ca_tips` | `numeric` | Σ chatter_daily |
| `propose / vendu` | `bigint` | Σ chatter_daily |
| `taux_conv` | `numeric(6,2)` | 100*Σvendu/Σpropose (non borné 100, non moyenné) |
| `presence_active_h / presence_idle_h` | `numeric` | Σ chatter_daily |
| `idle_pct` | `numeric(5,1)` | idle/(active+idle)*100 |
| `reactivite_avg_sec` | `numeric` | avg(reactivite_sec) ignore NULL |
| `com` | `numeric(12,2)` | Σca*0.10 |
| `active` | `boolean` | Σca > 0 |

## Calculs métier → où ils vivent

| métrique | vit dans | sources | formule |
|---|---|---|---|
| total_ca (CA global période) | **rpc** | creator_daily.ca | Σ creator_daily.ca sur [p_start,p_end] (def. canonique = agrégat modèles) ; alternative Σ chatter_daily.ca des actifs — choisir UNE def. |
| total_ca_prev (CA période précédente) | **rpc** | period_snapshot_kpi.total_ca_prev, chatter_daily.ca | Lecture directe period_snapshot_kpi.total_ca_prev (figé, non recalculable) ; recomputable = Σ chatter_daily.ca sur la même plage J du mois-1 si l'historique jour existe. Surfacé via RPC. |
| evolution mensuelle (MoM) | **rpc** | creator_daily.ca, period_snapshot_kpi.total_ca_prev | (total_ca - total_ca_prev)/total_ca_prev*100, NULL si prev=0 ; numeric(7,2) borné -100 en bas, non borné en haut |
| evolution hebdo (WoW) | **rpc** | chatter_daily.ca, period_snapshot_kpi.current_week_days | ref_daily = ca_week/7 ; cw_daily = ca_current_week/current_week_days ; (cw_daily-ref_daily)/ref_daily*100 |
| perf_pct hebdo (vs moyenne mensuelle) | **rpc** | chatter_daily.ca | (ca_week - ca_mois/4)/(ca_mois/4)*100 ; seuils carte -40/-20/+25 |
| actif / inactif | **rpc** | chatter_daily.ca | active = (Σ chatter_daily.ca sur période) > 0 (strict, aucun seuil €) |
| n_active / n_inactive | **rpc** | period_snapshot_kpi.n_active, chatter_daily.ca | Lecture du snapshot (figé pour le header) ; recomputable = count(chatters où Σca>0) et total-n_active. Surfacé via RPC. |
| com (commission / paie) | **rpc** | chatter_daily.ca | round(Σ chatter_daily.ca * 0.10, 2) — JAMAIS stockée (dérivée). Seuil low_perf : com<200€ |
| taux_conv (taux de conversion) | **rpc** | chatter_daily.propose, chatter_daily.vendu | 100*Σvendu/Σpropose (recalcul pondéré) ; NE JAMAIS moyenner taux jour ; peut dépasser 100 (600 si propose=0) |
| présence active/idle + pres_pct + idle_pct | **vue** | chatter_daily.presence_active_h, chatter_daily.presence_idle_h | pres_pct = Σactive_h/42*100 ; idle_pct = Σidle_h/(Σactive_h+Σidle_h)*100 ; days_worked = round(Σactive_h/7) |
| réactivité moyenne (SLA) | **rpc** | chatter_daily.reactivite_sec | avg(reactivite_sec) en ignorant les NULL ('-') ; NE PAS convertir NULL en 0 |
| CA par heure active (productivité) | **rpc** | chatter_daily.ca, chatter_daily.presence_active_h | Σca/NULLIF(Σactive_h,0) (garde division par zéro) |
| quota compliance ok_days/7 + OK/KO + sévérité carte | **rpc** | chatter_daily, quotas, chatters.team_id | par jour et par métrique [presence_h, reactivite_s, medias_proposes, conv_pct, ca] : higher-is-better OK si v>=quota ; reactivite OK si 0<v<=quota ; ok_days = count(jours OK) ; sévérité selon nb KO (0->opportunity,1->notable,2->warning,>=3->critical) |
| team aggregates (total/ppv/tips/renew) | **rpc** | creator_daily, creators.team_id, creator_transfers | Σ creator_daily.{ca,ca_ppv,ca_tips,ca_renew} group by team, en rattachant chaque jour de creator_daily à l'équipe VALIDE à cette date (creator_transfers) |
| team active / planned / per | **rpc** | chatter_daily.ca, chatter_creators, creator_daily.ca | active = count(chatters de l'équipe avec Σca>0) ; planned = count(chatter_creators actifs) ; per = round(team.total/active,2) |
| abonnés (subs_active moyen / new_subs) | **rpc** | creator_daily.subs_active, creator_daily.new_subs | subs_by_model = round(avg(NULLIF(subs_active,0)),1) ; new_subs = Σ new_subs (mois et semaine selon bornes) |
| LTV par modèle | **rpc** | creator_daily.ca, creator_daily.new_subs | round(Σca/NULLIF(Σnew_subs,0),2) |
| Pareto concentration top 10% | **rpc** | chatter_daily.ca | n_top10 = max(1,round(n_actifs*0.10)) ; pct_top10 = Σca(n_top10 meilleurs)/total_ca*100 ; alerte >45 / >60 |
| badge hebdo (gamification) | **app** | chatter_daily.ca, period_snapshot_kpi.current_week_days | monthly_eq = round(ref_daily*30) ; >4000 Commandant / >=1900 Stratège / >=1000 Recrue / sinon Gobelin |
| reach (fans/messages/mots) + taux proposition PPV | **rpc** | chatter_daily_reach | Σ ou distinct fans_distincts ; messages/jour ; mots/message ; taux_proposition = Σppv_proposes/Σfans_distincts |
| mix revenu PPV vs Tips vs Renew | **vue** | chatter_daily, creator_daily | part_ppv = Σca_ppv/Σca ; part_tips = Σca_tips/Σca ; renew_share = Σca_renew/Σca (niveau modèle) |
| réattribution CA selon transfert de modèle | **vue** | creator_daily.ca, creator_transfers | pour chaque jour, équipe = to_team si date>=transfer.date sinon from_team (dernier transfert <= date) ; empêche de créditer la mauvaise équipe |
| insight scope/target/chatter_id + age_days | **app** | insights.insight_key, insights.generated_at | scope/team_id/chatter_id/chatter_email PARSÉS du slug+titre à l'ingestion (stockés) ; age_days = now()-generated_at (dérivé, non stocké) |
| leaderboard chatteurs (période) | **vue_materialisee** | chatter_daily | Σca group by chatter order by ca desc ; matérialiser si la charge de lecture l'exige, rafraîchir après ingestion |
| missed_shifts | **app** | period_snapshot_kpi.max_missed_shifts | NON dérivable (aucune source planning/shifts) ; placeholder 0 tant qu'un planning n'est pas fourni |

## Delta vs migrations actuelles

1. 0001 — Créer la dimension teams et DÉCONFLER team/modèle : nouvelle table teams(id,name unique,lead_name,active) ; ajouter creators.team_id -> teams(id) on delete set null ; ajouter creators.excluded_reason. Migrer les 13 valeurs actuelles (Carla, Sarah...) en teams, y rattacher les creators.
2. 0001 — chatters : SUPPRIMER unique(name,email) (email a 1 NULL + 1 doublon, name instable) ; renommer creator_id -> team_id (-> teams) ; ajouter access_revoked, config_updated_at, display_name not null ; passer email en citext ; index unique partiel on lower(email) where email is not null ; à l'ingestion nettoyer la ligne name=email et dédoublonner safidyup@gmail.com.
3. 0001 — NOUVELLE table chatter_alias(raw_label, raw_label_norm unique, chatter_id, source) : réconciliation d'identité (pseudo/email/casse/emoji/suffixe). Bloquant pour l'exactitude des agrégats.
4. 0001 — NOUVELLE table chatter_creators(chatter_id, creator_id, role, active, is_manual) PK(chatter_id,creator_id) : multi-modèles (assigned[]>1) ; grain de perf (chatter,modèle).
5. 0001 — chatter_daily : AJOUTER presence_active_h numeric(5,2), presence_idle_h numeric(5,2), reactivite_sec integer (les 3 sont au JOUR dans daily_ca.csv) ; AJOUTER check(ca=ca_ppv+ca_tips), check(reactivite_sec is null or >0), checks >=0 ; NE PAS ajouter check vendu<=propose ; AJOUTER index(date). Dédupliquer/SOMMER les sessions multiples (Safidy) avant upsert.
6. 0001 — SUPPRIMER la table chatter_period_stats et la remplacer par la vue v_chatter_period (présence/réactivité désormais dérivables du jour) ; ne plus stocker taux_conv (recalcul SUM/SUM en RPC).
7. 0001 — NOUVELLE table chatter_daily_reach(chatter_id,date,messages,mots,fans_distincts,ppv_proposes) depuis daily_fans_distincts.csv ; REVENIR sur la suppression de fans_distincts (réel dans le CSV, 0 seulement dans data.json). Dédupliquer Safidy 2026-05-29.
8. 0001 — NOUVELLE table chatter_creator_daily(chatter_id,creator_id,date,ca,ca_ppv,ca_tips,propose,vendu) PK(chatter_id,creator_id,date) pour la ventilation multi-modèles ; nécessite d'activer un fetch money-team par créateur (sinon peupler au grain période).
9. 0001 — creator_daily : AJOUTER ca_ppv, ca_tips, ca_renew numeric(12,2) (breakdown journalier de dashboard/stats) ; checks >=0 ; ca (total) >= ppv+tips+renew (pas d'égalité stricte, composante 'autres').
10. 0001 — NOUVELLE table period_snapshot_kpi(last_update PK, bornes period/prev/week/current_week, current_week_days, period_days, total_ca, total_ca_prev, n_active, n_inactive, max_missed_shifts, source, sheet_used) ; total_ca_prev NON recalculable.
11. 0001 — quotas : re-clé de creator_id VERS team_id -> teams(id) on delete cascade ; ajouter checks (presence_h>0, reactivite_s>0, conv_pct 0..100, ca_eur>=0) ; ajouter updated_by.
12. 0001 — REMPLACER transfers(chatter_id PK) par creator_transfers(creator_id, date, from_team_id, to_team_id, created_by) PK(creator_id,date) : déplacement de MODÈLE historisable, check(from<>to), index(to_team_id),(from_team_id).
13. 0001 — insights : PK -> (insight_key, generated_at) pour historiser ; AJOUTER team_id, chatter_id, chatter_email, period (enum insight_period month|week), snapshot_id -> period_snapshot_kpi ; scope/target matérialisés à l'ingestion ; enum insight_scope : retirer 'day' (jamais produit) ; index(insight_key),(chatter_id),(generated_at).
14. 0001 — insight_states : PK -> (insight_key, period) (un slug peut exister month ET week) ; ajouter snoozed_until, note ; ancrer sur le slug, pas sur le insight_pk versionné.
15. 0001 — NOUVEAUX enums : insight_period('month','week') ; bilan_duree('5min','15min','30min','1h+') ; bilan_etat('motive','neutre','fatigue'). bilans : ajouter signal_key unique, signal_type, week_start, chatter_id (matché via alias), typer duree/etat ; NOUVELLE table optionnelle bilan_revisions(bilan_id, revision_no, ...) pour l'historique requêtable.
16. 0001 — NOUVELLE table optionnelle insight_data_points(insight_key,generated_at,ord,label,is_meta,status,value_raw,value_num) FK cascade vers insights ; sinon conserver data_points jsonb.
17. 0001 — Activer l'extension citext (chatters.email, insights.chatter_email).
18. 0002 (RLS) — Étendre les policies aux nouvelles tables (chatter_daily_reach, chatter_creator_daily, chatter_alias, chatter_creators, teams, creator_transfers, period_snapshot_kpi, bilan_revisions, insight_data_points) ; quotas_read/write re-basé sur team_id ; garder l'ingestion en service-role (bypass) et les utilisateurs en lecture faits/insights + écriture état éditable.
19. 0003 (functions) — fn_chatters_period : AJOUTER presence_active_h, presence_idle_h, idle_pct, reactivite_avg_sec, com, active (jointure chatter_daily) ; fn_creators_period : AJOUTER ca_ppv, ca_tips, ca_renew, mix ; NOUVELLES : fn_teams_period (rollup équipe + transferts), fn_quota_compliance(team,week_start) (ok_days/7 au jour), fn_pareto(period), fn_evolution(period) ; toutes en SECURITY INVOKER.

## Décisions validées (avec le gérant de projet)

### Changement d'équipe d'un chatteur en cours de période — page « Analyse » (cartes par manager)
Contexte : la page Analyse affiche **une carte par manager** avec la **liste de ses chatteurs** + les chiffres agrégés. Un chatteur peut **changer d'équipe en cours de semaine** → l'attribution des chiffres est ambiguë.

**Décision (gérant)** : ne PAS chercher à ventiler parfaitement la ligne du chatteur ; **juste l'indiquer**.
- **Agrégats d'équipe (totaux de la carte)** : attribués au **grain JOUR** → chaque jour compte pour l'équipe **de ce jour-là**. Totaux justes, **aucun double comptage** (résolu gratuitement par le grain jour).
- **Ligne du chatteur dans une carte manager** : le chatteur apparaît sous son **équipe de référence** (celle de **fin de période**) avec un **flag `team_changed_in_period`** → badge « changement d'équipe cette semaine ». On **ne ventile pas** la ligne entre deux managers.
- **Prérequis de modèle** : **affectations chatteur↔équipe datées** (`from_date`/`to_date`) — nouvelle notion (table `chatter_team_assignments` ou dates sur `chatter_creators`) pour (a) résoudre l'équipe-du-jour et (b) **détecter le changement** afin de poser le flag automatiquement. À intégrer dans `fn_teams_period`.

### Périmètre du CA — comptes privés/secondaires : ON GARDE TOUT
**Décision** : **inclure** les comptes que l'ancien dashboard excluait (`carlaprive`, `juliepvv`, `alice_prvv` = les comptes privés/VIP de Carla, Julie, Alice). On les **stocke et on les compte**, avec un **flag `is_private`** sur `creators` pour pouvoir les filtrer **en option** — au lieu de les supprimer.
- **Conséquence** : le **total compte** = exactement celui de MyPuls (**258 853,45 € pour juin**). Les chiffres collent partout.
- L'ancien `excluded_accounts.json` devient un **flag**, jamais une suppression de donnée.
- **Cible de réconciliation** : total compte juin = **258 853,45 €** (à confirmer au 1er vrai scrape, exclusions OFF ; impossible à reproduire depuis le `data.json` actuel car ces 3 comptes y sont déjà retirés).
- **3 périmètres documentés, tous stockés** (chiffres justes = on sait lequel on affiche) :
  `258 853 €` tous comptes (= MyPuls) ⊇ `255 338 €` hors privés ⊇ `252 856 €` attribué chatteurs. L'écart attribué↔compte = revenu **non-messagerie** (renew, media on-demand/push) — normal, non imputable à un chatteur.

### Ingestion via l'API officielle MyPuls (fin du scraping HTML)
MyPuls expose une **API REST officielle documentée** (OpenAPI/NelmioApiDocBundle) sous `/api/v1`, auth **`X-API-TOKEN`** (`/api/doc`, spec `/api/doc.json`).

**Testé en réel le 2026-07-01 (GET + token, lecture seule) → verdict : HYBRIDE.** L'API donne les **totaux compte au centime** + le **roster chatteurs** + la **volumétrie par chatteur**, mais **PAS l'argent attribué par chatteur** (attribution `null` à 100 %, cf. « Testé » plus bas). On garde donc un **mini-scrape ciblé** (session `money-team`) pour ce que l'API n'expose pas.

**Mapping endpoints → tables :**
| Endpoint (GET /api/v1/) | → Table | Contenu |
|---|---|---|
| `users` | `chatters` + `chatter_creators` | user_id **stable**, email, is_active_now, last_activity_at, créateurs+rôles |
| `creators` | `creators` | id, pseudo, platform, currency, status, external_id |
| `team/money` | `creator_daily` (compte) | transactions PPV+tips **par compte** (`attributed_user_id` VIDE → pas de ventilation chatteur) → totaux au centime |
| `team/messages/stats` | `chatter_daily_reach` | messages, mots, fans distincts, PPV **proposés** (⚠️ PPV **vendus** = 0, non exposé) ; jointure par **email** |
| `creators/{id}/stats` | `creator_daily` | revenu par type (ppv/tips/**renew**), nouveaux fans |
| `creators/{id}/fans` | (LTV/abonnés) | fans + revenus par type |

**Gains majeurs :**
- **Identité** : `/users` donne un roster propre (email + affectations), mais les `user_id` **diffèrent selon l'endpoint** → l'**email** reste la clé de jointure. `chatter_alias`/email restent nécessaires (roster API + attribution scrapée + backfill CSV).
- **Grain jour** : pas d'endpoint jour, MAIS `team/money` est **par transaction** (timestamp) → on bucketise par jour (voire plus fin). Les stats période → appel `start=end=jour`. Cron 23h59 = quelques GET pour la veille.
- **Token seul** → plus de login/mot de passe, GET only, plus sûr.

**✅ Testé le 2026-07-01 (juin, réel) :**
- `team/money` : **9 576 transactions**, Σ = **255 998,17 €** = PPV **142 672,88** + Tips **113 325,29** = **MyPuls au centime**. MAIS `attributed_user_id` = **null à 100 %** (méthode `brute_force`), et `team/money?chatter=X` → **0 transaction**. → **argent par chatteur NON récupérable via l'API.**
- `team/messages/stats` : **161 chatteurs**, donne messages/mots/fans distincts/PPV **proposés** ✅ ; mais `ppv_sold` = 0 (**conversion non exposée**). Son `user_id` **diffère** de celui de `/users` → jointure par **email**.
- `/users` (188 membres) + `/creators` (17 comptes) + `/session` : ✅ roster & dimensions propres.

**Conséquences :**
- **Source de l'attribution argent chatteur + présence + réactivité = dashboard HTML `money-team`** (session login), comme l'ancien script. L'API ne la remplace **pas**.
- **L'API = source de vérité des totaux** → **garde-fou** : Σ(chatteurs scrapés) doit coller au total compte API (PPV 142 672,88 / Tips 113 325,29). Chiffres bons partout, mécaniquement vérifiés.
- **Identité** : `/users.user_id` stable pour le roster, mais **l'email est la clé de jointure canonique** entre endpoints (les user_id ne concordent pas d'un endpoint à l'autre) → `chatter_alias`/email restent nécessaires.

### Spike recalcul d'attribution 100 % API (2026-07-01) — chiffres OK, identité = verrou
Testé sur **Sarah (creator 221)**, PPV juin, recalcul **100 % API** (transactions `team/money` réelles attribuées via `message_id → sender_user_id` des `team/messages`) **vs data.json** (vérité MyPuls scrapée) :
- **Montants reproductibles** ✅ : join `message_id` à **98 %** (666/681 tx), Σ API 12 793 € ≈ « Média privé » 13 105 € (−2,4 %), et **matchs au centime** dès que l'identité s'aligne (`ntcharlette` 181,82=181,82 ; `lucasnyaina` 996,37=996,37 ; `aholouakoele` 4954 vs 4887 = +1,4 %).
- **Verrou = IDENTITÉ** ⚠️ : le `sender_user_id` des messages est un **ID opaque** (le message ne porte **ni email ni nom**), dans un espace qui **ne concorde ni avec `/users` ni avec `messages/stats`** (89/681 non résolus). data.json a aussi son bazar (« Josias » = josiasbossou52@gmail.com). ⇒ les bons montants tombent sur le **mauvais chatteur** tant que l'identité n'est pas résolue.
- **Tips** : portent aussi un `message_id` → même mécanisme (reste à valider). **Présence/réactivité** : hors API (réactivité dérivable des timestamps de `team/messages`).

**Conséquence stratégie** : le **100 % API est atteignable** (chiffres prouvés), mais exige (1) une **résolution d'identité robuste** `sender_user_id → chatteur canonique` (= le gros du travail, c'est `chatter_alias`), (2) valider les tips, (3) dériver la réactivité. **Cutover SÛR** : construire le recalcul API en gardant le scrape `money-team` comme **oracle de validation** ; ne couper le scrape que quand le recalcul **matche une période complète** (tous modèles, PPV+tips, identité résolue). → objectif « plus de scrape » atteint **sans jamais risquer un chiffre faux**.

## Questions ouvertes (détail technique)

1. Hiérarchie team vs modèle : valider le split teams (lead) 1-N creators (modèle OF). Les données actuelles sont ~1:1 (13 équipes = 13 modèles) mais CREATOR_TO_TEAM, SECONDARY_TO_PRIMARY et les transferts (Tagwalker/DIX/Kira) impliquent N modèles/équipe. Confirmer la profondeur (sinon on garde la conflation actuelle creators=team).
2. Définition canonique de total_ca : Σ creator_daily.ca (dashboard/stats) OU Σ chatter_daily.ca des actifs ? Les deux divergent (modèles sans dataset vs scraping). Trancher LA définition officielle affichée et documenter.
3. Source du grain (chatter,modèle,jour) : active-t-on un fetch money-team PAR créateur/jour (pour peupler chatter_creator_daily au JOUR) ou reste-t-on au grain période pour la ventilation multi-modèles ? Impacte le kind de la table et l'ingestion.
4. Clé d'identité canonique du chatteur : mypuls_user_id (API) ou email ? Certains chatteurs n'ont pas d'email (Alberic) et l'API ne couvre pas tout le monde. Définir la priorité de résolution et le fallback.
5. total_ca_prev : recomputer depuis chatter_daily (on a ~95 jours d'historique 03-01->06-03) OU faire confiance au chiffre figé du snapshot (same-period-prev MyPuls) ? Ils peuvent différer selon le set de chatteurs.
6. Portée RLS : cloisonnement par MODÈLE (profile_creators, existant) ou par ÉQUIPE (un manager gère toute son équipe) ? Si équipe, ajouter profile_teams et réécrire current_allowed_creator.
7. Unité de présence : stocker en heures numeric(5,2) (fidèle au CSV 11.38h) — retenu — vs minutes/secondes integer (l'ancien schéma utilisait *_min integer, non-entier pour 11.38h). Confirmer h pour éviter la perte de précision.
8. Redondance propose : chatter_daily.propose (daily_ca) et chatter_daily_reach.ppv_proposes (daily_fans) mesurent-ils la même chose ? Si oui, laquelle fait foi pour le taux de conversion ?
9. renew : ca (total) modèle inclut-il renew, ou renew est-il hors ca ? Le delta team.total != ppv+tips (~1828€ Carla) suggère 'autres' (subs/renew). Confirmer pour poser (ou non) un CHECK ca >= ppv+tips+renew.
10. Historisation des insights : conserver toutes les générations (PK insight_key+generated_at) pour l'audit/age, ou garder seulement la dernière (upsert) ? Coût de stockage vs traçabilité.
11. Devise : EUR ou USD ? numeric(12,2) suffit techniquement mais l'affichage/labels et l'agrégation multi-comptes en dépendent.
12. missed_shifts : existe-t-il une source de planning/shifts assignés pour le calculer, ou reste-t-il un placeholder 0 (max_missed_shifts figé dans le snapshot) ?
13. Matching bilans->chatter : accepter le fuzzy-match (slug minuscule/emoji/email) vers chatter_id via chatter_alias, ou conserver uniquement signal_key et résoudre le chatteur à l'affichage ? Impacte les index et la fiabilité RH.
14. Normalisation de category (insights) et statut : figer un référentiel category (quota/Quotas critiques/Quotas insuffisants -> une valeur) ; et l'enum insight_status côté app (resolved/in_progress/ignored/kept) vs dictionnaire (unread/read/dismissed/snoozed/done) — choisir un seul vocabulaire.
15. Leaderboard : vue simple (RPC) suffisante ou vue matérialisée rafraîchie après chaque ingestion (perf de lecture dashboard) ? Décider du seuil de volumétrie qui justifie la matview.
