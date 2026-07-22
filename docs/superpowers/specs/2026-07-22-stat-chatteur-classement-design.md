# Page « Stat chatteur » — KPIs closing + classement des setters/closers — Design

**Date** : 2026-07-22
**Statut** : validé (Benoit)

## Objectif

Nouvelle page **« Stat chatteur »** (face Chatteurs, groupe **Performance**) exposant la désignation
« closing » (setter/closer + équipe rouge/bleue, portée par le membre via le lien membre↔chatteur) :

1. **4 KPI en haut** — le **nombre de membres** par désignation : Setters · Closers · Équipe Rouge · Équipe Bleue.
2. **Un classement en dessous** — les chatteurs closing triés par **nombre de ventes** (`vendu`), avec un
   **filtre** : Setter / Closer / Rouge / Bleue / **Mixé** (tous). Répond à la demande « compter les
   ventes des setters et avoir un classement », étendue par Benoit aux closers + équipes.

La période est celle du **datepicker du header** (source unique de tout le CRM) — le `vendu` est agrégé
sur cette période.

## Contexte / état actuel (vérifié)

- La désignation closing vit sur `profiles` : `closing_role` (setter/closer) + `closing_team`
  (rouge/bleue), migration `0077`. Le lien `profiles.chatter_id` (migration `0079`) relie un membre à
  son chatteur MyPuls.
- **La donnée est déjà rapprochée** : `getChatters()` (`apps/web/src/lib/services/get-chatters.ts`)
  renvoie chaque `ChatterRow` avec **`closingRole`** + **`closingTeam`** (via le helper
  `getClosingByChatter`, `apps/web/src/lib/services/closing-by-chatter.ts`) **ET `vendu`** (RPC
  `chatters_report(p_from, p_to)`, agrégé sur la période). Le rapprochement setter/closer/équipe →
  ventes est donc **déjà matérialisé par ligne** — il ne reste qu'à compter (KPI) + filtrer + trier (classement).
- La face Chatteurs a déjà un groupe de nav **`performance`** (`config/workspaces.ts` : Bilan, Stats,
  Santé/LTV, Quotas). La page `/chatter/stats` existante = courbes d'abonnés (≠ classement) → on n'y touche pas.
- Un composant de classement existe comme référence de structure : `RankingTable`
  (`apps/web/src/features/insights/components/ranking-table.tsx`). La `DataTable` générique
  (`apps/web/src/components/data-table/`) est le patron des tableaux triables/filtrables du repo.

## Architecture

Convention `app → feature(services) → composants` (skill archi-web) :
`app/(dash)/chatter/stat-chatteur/page.tsx` (récupère la donnée + période) → `StatChatteurTemplate`
(Server Component + feuille client) → composants (KPI cards + filtre + tableau).

### 1. Nav — nouvel item (Performance)

Dans `apps/web/src/config/workspaces.ts`, ajouter à la face `chatter`, groupe `performance` :
```ts
{ href: '/chatter/stat-chatteur', label: 'Stat chatteur', icon: Trophy, group: 'performance' }
```
(icône `Trophy` de lucide, ou `BarChart3` — au choix.) Droit d'accès : par défaut, même visibilité que
les autres items Performance (pas `adminOnly` sauf demande de Benoit) ; item direct sans slug dédié,
comme « Stats »/« Santé ».

### 2. Données — un seul service

`features/stat-chatteur/services/get-stat-chatteur.ts` :
- **Ventes / classement** : réutilise la logique de `getChatters()` (ou l'appelle) pour obtenir les
  `ChatterRow` (`closingRole`, `closingTeam`, `vendu`) sur la période. On ne garde que les chatteurs
  **closing** (`closingRole !== null`).
- **4 KPI (compteurs)** : nombre de **membres** par désignation, depuis `profiles` :
  - `nbSetters` = `count(closing_role = 'setter')`
  - `nbClosers` = `count(closing_role = 'closer')`
  - `nbRouge` = `count(closing_team = 'rouge')`
  - `nbBleue` = `count(closing_team = 'bleue')`
  Requête `profiles` via client admin (agence-wide, la RLS `profiles` cloisonne par équipe — même
  justification que `getClosingByChatter`). Compteurs **indépendants de la période** (ce sont des désignations).
- Retour : `{ period, kpis: { nbSetters, nbClosers, nbRouge, nbBleue }, rows: ClosingChatterRow[] }`
  où `ClosingChatterRow = { id, name, closingRole, closingTeam, vendu }`.

### 3. Composants

- **KPI cards** (4) : réutiliser le pattern de cartes KPI existant du repo (ex. celui des autres pages
  Performance / `STATUS_COLORS`). Statiques (pas de période).
- **Filtre** (feuille client) : un sélecteur single-select **Setter / Closer / Rouge / Bleue / Mixé**
  (Mixé = tous les chatteurs closing). Pilote l'affichage du tableau côté client (pas de round-trip —
  toutes les lignes sont déjà chargées).
- **Tableau classement** : `DataTable` (générique), colonnes **Rôle · Équipe · Ventes**, **trié par
  Ventes décroissant** par défaut (c'est un classement). Le filtre restreint les lignes ; le tri reste
  sur Ventes. Nom du chatteur en tête de ligne.

## Data flow

1. `page.tsx` : `resolvePeriod(searchParams)` → `getStatChatteur(period)`.
2. `getStatChatteur` : compteurs (`profiles` admin) + lignes closing (`getChatters`-like, filtré
   `closingRole !== null`) en parallèle.
3. `StatChatteurTemplate` : rend les 4 KPI + le filtre + le tableau (feuille client qui filtre/trie).

## Gestion des erreurs / cas limites

- **Chatteur closing sans ventes sur la période** : `vendu = 0` → présent en bas du classement (pas exclu).
- **Membre closing non lié à un chatteur** : compté dans les KPI (désignation existe) mais **absent du
  classement** (pas de `vendu` sans chatteur lié). Cohérent : le KPI compte les désignations, le
  classement classe ceux qui ont des ventes.
- **Mode restreint** (RLS) : `getChatters` gère déjà le restreint (`vendu` reste calculable) ; le
  classement suit le périmètre visible de l'appelant. Les 4 KPI (client admin) restent agence-wide.
- **Aucun setter/closer** : KPI à 0, tableau vide (état vide explicite).

## Hors périmètre (à ne PAS faire ici)

- Le **filtre rôle/équipe sur la page `/chatter/chatters`** (mentionné comme « petit plus ») — pas dans
  cette page ; à voir séparément si besoin.
- Classement des **closers par ventes** comme vue distincte : couvert par le filtre (Closer) — pas de
  vue séparée.
- Toute modification de l'édition du closing (elle reste sur la fiche Membre).

## Tests

- **KPI** : les 4 compteurs = nombre de membres par `closing_role`/`closing_team` (vérif SQL).
- **Classement** : filtre Setter → seuls les setters, triés par `vendu` desc ; Mixé → tous les closing ;
  un chatteur sans ventes → `vendu = 0`, en bas.
- **Période** : changer la période du header change les `vendu` (et donc l'ordre).
- **Non-régression** : `getChatters` inchangé (on le réutilise) ; typecheck/lint/build verts.
