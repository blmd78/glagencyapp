# Marketing par modèle — conception

Demande Benoit (2026-09-08) : « sur la partie marketing réseaux, une partie par modèle :
CA total et CA depuis les trackings links. Récupérer tous les liens de trackings, afficher
par CA généré / subs sur le lien en priorité. CA total / nombre de subs, un truc très
visuel avec pas mal de détail. »

Ce que la face Marketing sait aujourd'hui : ce que rapportent les **liens**. Ce qu'elle
ignore : ce que pèse ce chiffre **par rapport au CA de la modèle**. Cette page fait le
rapprochement — c'est son seul objet.

---

## 0. L'état réel de la donnée, mesuré le 2026-09-08

### 0.1 L'ingestion marketing est arrêtée depuis le 12 juillet

`mkt_link_daily` s'arrête au **2026-07-11** (une ligne résiduelle au 12/07) ; `creator_daily`
va jusqu'au **2026-09-07**. Ce n'est pas une panne : les crons marketing sont **commentés**
dans `apps/ingestion/wrangler.toml:30-33`. Motif documenté sur place : le plan Cloudflare Free
plafonne à **5 Cron Triggers par compte**, la ligne marketing en comptait 5 à elle seule, et
les 3 slots retenus sont chatteurs (`5 23 * * *`), spenders (`0 0 * * *`) et relevé des
shifts (`30 4 * * *`).

`ingest_runs` le confirme : les jobs `marketing`, `marketing-social` et `marketing-telegram`
comptent **4 runs chacun**, tous entre le 9 et le 11 juillet.

Conséquence directe sur cette page : sans remise à niveau, elle afficherait, sur le mois en
cours, un CA total frais face à un CA de liens **nul** — soit « le marketing ne rapporte
plus rien ». C'est ce qui fait du batch 1 un prérequis, pas un bonus.

### 0.2 Les deux sources sont comparables — et pas sur l'axe attendu

`mkt_link_daily` porte la série **journalière** MyPuls par lien (`apps/ingestion/src/marketing.ts:5-11`
— on stocke le par-jour tel quel, les cumuls sont dérivés côté app), donc la même granularité
que `creator_daily`. Mesure sur juin → 11/07 (prod) :

| Modèle | CA total | CA liens | % CA | New subs | Subs liens | **% subs** |
|---|---|---|---|---|---|---|
| Carla | 134 895 € | 3 677 € | 3 % | 18 507 | 914 | 5 % |
| Julie | 62 603 € | 3 233 € | 5 % | 10 014 | 1 159 | 12 % |
| Jade | 9 247 € | 3 418 € | 37 % | 4 849 | 2 754 | **57 %** |
| Lena | 16 269 € | 789 € | 5 % | 1 891 | 548 | 29 % |

Le ratio ne dépasse jamais 100 % : les deux mesures sont bien du même monde. Mais le CA d'un
lien pèse **3 à 5 %** du CA de la modèle, parce que le CA se fait *ensuite*, par les chatteurs.
La **part des nouveaux abonnés** (5 à 57 %) est le chiffre qui dit ce que le pôle apporte
réellement. D'où D4.

### 0.3 La RLS ferme le CA total au pôle marketing

`creator_daily` **et** `creators` sont scopés « admin OU modèle assignée »
(`0008_members_roles_pages.sql:58` et `:64`). Le seul porteur non-admin de la face Marketing
en prod — « Juba marketing », rôle `manager` — a **0 ligne dans `profile_creators`**.

Il ne lit donc ni le CA, ni même **le nom des modèles**. C'est déjà visible aujourd'hui :
sur `/marketing/liens`, `getLinkRows` lit `creators` sous RLS (`lib/services/get-mkt-links.ts:42`)
et lui rend 0 ligne — tous les liens s'affichent « Sans créatrice ». Cette page corrige ce
défaut au passage.

### 0.4 L'existant

- `/marketing/liens` — table de tous les liens, triée par CA. Pas de regroupement par modèle.
- `/marketing/overview` — KPIs du pôle, barres quotidiennes, et un bloc « poids par créatrice »
  (nom + subs + CA, sans mise en rapport avec le CA de la modèle).
- `lib/services/get-mkt-links.ts` — `getLinkRows(period)`, **partagé** par marketing-liens,
  marketing-dashboard et marketing-social. Rend `MktLinkRow[]` (clics, conversions, revenu,
  LTV, taux). C'est le socle réutilisé ici.
- 213 liens, tous rattachés à une modèle ; 12 modèles en portent, 4 n'en ont aucune
  (Claire, Mathilde, Emma, Maeva).
- `mkt_staff_links` est **vide** en prod : aucun lien n'est assigné à un VA.

---

## 1. Les décisions

- **D1 — On réactive l'ingestion des liens avant de construire la page**, sans consommer de
  slot cron : fan-out via le Service Binding `SELF` depuis un cron existant (§2.1).
- **D2 — Seuls les liens sont réactivés.** Ni Instagram (`marketing-social`, qui rappelle
  Apify et consomme des crédits) ni Telegram. Hors demande, décidable séparément.
- **D3 — Le CA total s'ouvre à la face marketing par une RPC `security definer`**
  (migration `0152`), pas par un élargissement de policy ni par une assignation
  `profile_creators`. Explicite, et indépendante des rattachements.
- **D4 — Les abonnés priment sur le CA.** L'ordre de lecture est : part des nouveaux abonnés,
  puis part du CA. Motivé par §0.2.
- **D5 — Une page dédiée** `/marketing/modeles`, slug `mkt-modeles`, groupe « Réseaux ».
  L'Overview reste synthétique.
- **D6 — Les comptes privés sont fusionnés dans leur modèle principale**
  (`creators.primary_creator_id`). Carla passe de 134 895 € à 137 382 €. Le trafic traçable
  arrive sur le compte public ; le privé est un aval, l'en séparer fausserait la part.
- **D7 — Deux donuts côte à côte** en tête (abonnés, CA) — choix Benoit, contre la
  recommandation de la charte dataviz (§4.3). Deux parts chacun : le grief contre le
  camembert porte sur 12 parts, pas sur 2.
- **D8 — Rien en prod avant validation.** Migration, page et ingestion sont recettées sur
  l'UAT ; `wrangler deploy`, `db push` prod et merge sur `main` attendent le feu vert (§7).

---

## 2. Batch 1 — remettre la donnée à jour

### 2.1 Le fan-out, sans slot cron

Tout est déjà en place dans `apps/ingestion/src/worker.ts` : le binding `SELF`, `TRIGGER_TOKEN`,
`WORKER_SELF_URL`, et un handler HTTP `?job=marketing` (`worker.ts:439`). Le patron existe
littéralement pour spenders (`worker.ts:103-116`) : **chaque appel `SELF` est une invocation
séparée, avec son propre budget de 10 ms CPU et 50 sous-requêtes.**

Dans `scheduled()`, sur le cron chatteurs `5 23 * * *`, dans un bloc distinct exécuté que le
run chatteurs ait réussi ou échoué :

```
await self.fetch(`${selfUrl}?job=marketing`, { headers: { 'x-trigger-token': token } })
```

Deux exigences :

1. **Hors du chemin de succès du run chatteurs.** Un échec MyPuls côté chatteurs ne doit pas
   priver le marketing de sa nuit : le fan-out part dans tous les cas, et sa propre erreur est
   capturée sans faire échouer l'invocation.
2. **L'heure reste sûre.** 23h05 UTC est déjà, été comme hiver, après minuit à Paris
   (raisonnement documenté dans `wrangler.toml`) — la journée capturée est complète. Le
   marketing tournait 15 min plus tard pour la même raison ; avancer ne casse rien.

`wrangler.toml` ne gagne aucun cron : seul son commentaire est mis à jour.

### 2.2 Le rattrapage du trou (12/07 → J-1)

58 jours manquants. La fenêtre glissante du run nocturne ne couvre que 8 jours
(`marketing.ts:70`), donc il faut un backfill explicite : `runMarketing({ backfillFrom })`.

**En CLI local, pas en HTTP** : 58 jours d'upserts dépassent les 50 sous-requêtes d'une
invocation Worker. Nouveau script `apps/ingestion/src/marketing-cli.ts` →
`pnpm --filter @glagency/ingestion marketing <YYYY-MM-DD>`.

Le payload MyPuls porte la série `daily` depuis l'origine (13/02) : un seul run rattrape tout,
au même coût de requêtes qu'un run normal (16 modèles × 2).

Cible du backfill de recette = **l'UAT**, par surcharge d'environnement :

```
SUPABASE_URL=$SUPABASE_URL_UAT SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY_UAT \
  pnpm --filter @glagency/ingestion marketing 2026-07-12
```

`loadEnv()` ne remplit que les clés **absentes** (`apps/ingestion/src/env.ts:15`) : le préfixe
gagne, la prod n'est pas touchée.

### 2.3 Monitors Sentry

Un seul monitor est concerné : celui du job `marketing` (D2 laisse `marketing-social` et
`marketing-telegram` en pause). Il est réactivé sur la crontab du **porteur** (`5 23 * * *`),
pas sur son ancienne (`20 23 * * *`). À faire au moment du go prod, pas avant : armé trop
tôt, il alerte « missed check-in » chaque nuit.

---

## 3. Batch 2 — la donnée

### 3.1 Migration `0152_mkt_creator_revenue.sql`

RPC `mkt_creator_revenue(p_from date, p_to date)`, `security definer`, `stable`,
`set search_path = public`. Garde en tête de fonction : `is_admin() or has_page('mkt-modeles')`,
sinon `raise exception` — même patron que `tracker_todo_week_recap` (`0151`).

Rend un objet à deux clés :

- `creators` — par modèle : `creator_id, name, ca, new_subs, subs_active` ;
- `daily` — par jour, toute l'agence : `date, new_subs`. C'est le **dénominateur de la
  courbe** (§4.2). Sans lui la part par jour n'est pas calculable, et une courbe des seuls
  abonnés venus des liens ferait doublon avec l'Overview.

Le `security definer` est **le point de la migration**, pas un raccourci : §0.3 montre que la
face marketing ne lit ni le CA ni les noms. L'agrégation en SQL suit par ailleurs
`docs/guidelines-data-loading.md` (jamais de `select` nu sur une table de faits).

`subs_active` est un **stock** : valeur du dernier jour de la période, pas une somme.

### 3.2 Le regroupement des comptes privés (D6)

Clé de regroupement : `coalesce(c.primary_creator_id, c.id)`, nom pris sur le compte principal.
Les trois comptes concernés (`Carla (privé)`, `Alice (privé)`, `Julie (privé)`) sont marqués
`excluded` — sans effet ici : dans ce projet `excluded` ne joue que sur le calcul LTV de la
page Santé (`features/models/services/get-models.ts:118`).

Le même `coalesce` s'applique côté liens, par sécurité, bien qu'aucun lien ne soit rattaché à
un compte privé aujourd'hui.

### 3.3 `creatorId` sur `MktLinkRow`

`lib/types/marketing.ts` gagne `creatorId: string | null`, propagé depuis
`get-mkt-links.ts` (la colonne `creator_id` y est **déjà lue**, ligne 38 — seule la
propagation manque). `creator` (le nom) reste, inchangé.

Raison : la jointure liens ↔ modèles doit se faire par **id**, pas par nom. Par nom, elle est
vide pour tout non-admin (§0.3). Modification non cassante pour les trois features qui
consomment déjà ce type.

---

## 4. Batch 2 — la page

### 4.1 Route, droit, nav

`/marketing/modeles`, slug **`mkt-modeles`**, groupe `reseaux` de la face marketing dans
`config/workspaces.ts`. La case à cocher dans Membres se dérive automatiquement de `WORKSPACES`.

Convention `app → feature(template) → composants` : `page.tsx` appelle
`features/marketing-modeles/services/get-modeles.ts`, passe la promesse au `Template` sous
`Suspense` (même anatomie que `/marketing/liens/page.tsx`).

```
features/marketing-modeles/
  types.ts
  services/get-modeles.ts            RPC + getLinkRows() en parallèle, jointure par creatorId
  ModelesTemplate.tsx                Server Component
  components/agency-split.client.tsx les deux donuts + la courbe (feuille client)
  components/creator-section.client.tsx  bande dépliable (Collapsible)
  components/modeles-skeleton.tsx
```

Période via `resolvePeriod` (le datepicker du header pilote la page), défaut mois en cours.
Pas de `use cache` : lecture RLS cookie-bound.

### 4.2 Anatomie

1. **Rangée de KPI** (`KpiCard`, existant) — CA total · CA via liens + part · Nouveaux
   abonnés · Abonnés via liens + part.
2. **Deux donuts côte à côte** (D7) : nouveaux abonnés, puis CA. Deux parts chacun,
   « via liens » et « hors tracking », valeur au centre.
3. **Une courbe temporelle** : part des nouveaux abonnés venus des liens, **jour par jour**.
   Une seule série. Ce n'est pas un doublon de l'Overview, qui montre le CA des liens en
   absolu — la part dans le temps n'existe nulle part.
4. **La liste des modèles**, triée par CA total décroissant. Chaque bande : nom, CA total,
   CA liens + part, nouveaux abonnés, abonnés via liens + part, clics, nombre de liens, et
   sa barre de part. **La liste triée EST le graphique de comparaison** — pas de graphe
   séparé pour classer les modèles, et pas de couleur par modèle (§4.3).
5. **Dépliée** (`Collapsible`) : la table des liens de la modèle, triée **par abonnés
   décroissants puis CA** (D4) — nom, badge de type (`typeBadge`, existant), abonnés, CA,
   clics, taux de conversion, €/abonné. Micro-barre de part dans la colonne abonnés.
6. **Les modèles sans lien** (Claire, Mathilde, Emma, Maeva) : bande présente, grisée,
   « aucun lien de tracking ». C'est une information actionnable, pas un trou à masquer.

### 4.3 La couche visuelle

**Deux couleurs sur toute la page** : le violet du pôle (`#8b5cf6`, déjà la teinte « revenus »
de `mkt-daily-chart.client.tsx`) pour « via liens », un gris neutre pour le reste.

**Pas de couleur par modèle.** La palette du projet (`MODEL_HEX_COLORS`, 10 teintes) a été
passée au validateur de la charte dataviz :

```
[FAIL] CVD separation       rose ↔ teal    ΔE 3,7 (deutéranopie)   — seuil 8
[FAIL] Normal-vision floor  orange ↔ rouge ΔE 10,4 (vision normale) — seuil 15
```

Elle est faite pour des **badges**, où le nom écrit à côté porte l'information et la couleur
n'est qu'un rappel. Employée comme information unique — 12 parts d'un camembert, 12 segments
d'une barre empilée — elle devient illisible pour une partie des lecteurs. Les donuts de D7
n'ont donc que **deux** parts, et la comparaison entre modèles passe par le tri, pas par la
teinte.

Règles de la charte appliquées : marques fines, écart de 2 px entre segments, survol avec
tooltip sur les donuts et la courbe (`ChartTooltip` shadcn, déjà utilisé), légende + valeurs
en toutes lettres sous chaque donut (l'identité n'est jamais portée par la couleur seule),
libellés en jetons de texte et non en couleur de série.

**Limite assumée** : le projet ne définit aucune variable CSS `--chart-*` (rien dans
`globals.css`) ; les graphes existants utilisent des hex littéraux. On s'aligne dessus plutôt
que d'introduire un système de tokens — ce serait toucher au design existant. Le segment
neutre, lui, prend un token shadcn (`--muted`) pour suivre le thème sombre.

### 4.4 L'état vide — invariant

Quand la période ne contient **aucun relevé de liens**, la page affiche « aucun relevé de
liens sur cette période », **jamais 0 € et 0 %**.

C'est l'invariant nº 2 du Relevé MyPuls, transposé : sans lui, « l'ingestion est coupée » et
« le marketing n'a rien rapporté » deviennent indiscernables. Le cas est réel — c'est ce
qu'affichera la page en prod, sur le mois en cours, tant que le batch 1 n'est pas déployé, et
sur l'UAT avant backfill.

---

## 5. Hors scope

Export CSV. Courbe par modèle (l'Overview couvre le pôle). Axe VA — `mkt_staff_links` est vide
en prod. Tri interactif des colonnes : le tri est fixe (modèles par CA, liens par abonnés).
Réactivation d'Instagram et Telegram (D2). Toute retouche des pages Overview et Liens
existantes.

---

## 6. Recette

Sur l'UAT, période **1er juin → 11 juillet 2026** — la fenêtre où les deux sources se
recouvrent. Totaux attendus, mesurés le 2026-09-08 (identiques UAT et prod) :

| Agence | Valeur |
|---|---|
| CA total | 382 625 € |
| CA via liens | 12 375 € — **3,2 %** |
| Nouveaux abonnés | 67 575 |
| Abonnés via liens | 7 489 — **11,1 %** |
| Clics | 148 018 |

Par modèle, comptes privés fusionnés (D6) — 13 lignes attendues :

| Modèle | CA total | CA liens | % CA | New subs | Subs liens | % subs | Liens |
|---|---|---|---|---|---|---|---|
| Carla | 137 382 € | 3 677 € | 3 % | 18 742 | 914 | 5 % | 24 |
| Julie | 62 999 € | 3 233 € | 5 % | 10 146 | 1 159 | 11 % | 27 |
| Alice | 47 160 € | 131 € | 0 % | 9 575 | 552 | 6 % | 20 |
| Sarah | 33 267 € | 334 € | 1 % | 8 022 | 725 | 9 % | 16 |
| Lucie | 20 666 € | 197 € | 1 % | 1 969 | 312 | 16 % | 7 |
| Lena | 16 269 € | 789 € | 5 % | 1 891 | 548 | 29 % | 12 |
| Claire | 11 677 € | — | — | 3 006 | — | — | 0 |
| Mathilde | 11 105 € | — | — | 1 902 | — | — | 0 |
| Lola | 10 839 € | 353 € | 3 % | 1 052 | 355 | 34 % | 7 |
| Jade | 9 247 € | 3 418 € | 37 % | 4 849 | 2 754 | 57 % | 3 |
| Emma | 7 871 € | — | — | 1 768 | — | — | 0 |
| Maeva | 7 652 € | — | — | 3 422 | — | — | 0 |
| Manon | 6 491 € | 243 € | 4 % | 1 231 | 170 | 14 % | 6 |

Carla à **137 382 €** (et non 134 895 €) est le contrôle de D6 : la fusion du compte privé.

Tests Vitest sur la fonction pure d'agrégation : jointure liens ↔ modèles par id, fusion des
privés, part à dénominateur nul, modèle sans lien, lien sans modèle.

Contrôle d'accès : la page doit rendre les mêmes chiffres pour un admin et pour « Juba
marketing » (0 modèle assignée) — c'est ce que D3 achète.

---

## 7. Livraison

Deux PR, la première vérifiable seule.

| | Batch 1 — ingestion | Batch 2 — RPC + page |
|---|---|---|
| Code | `worker.ts`, `marketing-cli.ts`, `wrangler.toml` | `0152`, `marketing-modeles`, `workspaces.ts`, `MktLinkRow` |
| Recette | backfill vers l'UAT, `cf:dev --test-scheduled` | UAT + preview Vercel de `develop` |
| Prod | `wrangler deploy` — **après validation** | `db push` prod + merge `main` — **après validation** |

Rien ne part en prod avant le feu vert (D8). Au go, dans l'ordre : `db push` prod, merge sur
`main`, `wrangler deploy`, backfill prod (`marketing 2026-07-12`), réactivation des monitors
Sentry (§2.3).
