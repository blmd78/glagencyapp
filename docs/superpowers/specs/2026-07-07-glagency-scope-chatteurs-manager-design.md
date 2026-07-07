# Design — Cloisonnement des chatteurs par manager (modèles assignés)

> Date : 2026-07-07 · Statut : **design validé** (Benoit) · Features : `repos`, `police`, `lib`

## 1. Objectif

Un manager (rôle `user`) ne doit voir et sélectionner que **les chatteurs des modèles qui lui
sont assignés**. La chaîne : manager → `profile_creators` (ses modèles) → `chatter_creators`
actifs (ses chatteurs). **Admin = tout, inchangé.**

## 2. État des lieux

Déjà cloisonné par la RLS existante (0008) : Chatters (`chatters_report` sur
`chatter_creator_daily`), Santé, Overview, Modèles, cartes Insights (`restricted`), Compta.
**Les deux trous — créés volontairement via le client admin — sont Repos et Police.** Le
classement Insights **reste global** (décision : émulation entre équipes).

## 3. Décisions actées

- **Repos** : le manager **ne voit que ses chatteurs** (cellules) et **ne peut sélectionner
  qu'eux** (options). Les colonnes modèles dont la compo ne recoupe pas ses modèles sont
  **masquées** ; Managers/Policiers restent visibles (cellules scopées). Les noms texte legacy
  sont masqués pour un non-admin.
- **Anti-écrasement (critique)** : quand un non-admin enregistre une cellule, le serveur
  **fusionne** — sa soumission + les chatteurs/texte **hors de son périmètre sont préservés**
  (sinon il écraserait des repos qu'il ne voit pas).
- **Police** : options de saisie, **historique du jour, KPIs, compteur d'avertissements 30 j**
  scopés à ses chatteurs. **Garde serveur** : `addPoliceWarning`/`addPoliceMalus` refusent un
  `chatterId` hors périmètre.
- **Compo des colonnes repos** (crayon) : déjà admin-only, non concernée.

## 4. Helper partagé — `apps/web/src/lib/scope.ts`

```ts
export interface ChatterScope {
  /** null = admin → aucun filtrage. */
  chatterIds: Set<string> | null
  creatorIds: Set<string> | null
}
export async function getChatterScope(profile: Profile): Promise<ChatterScope>
```
- Admin → `{ chatterIds: null, creatorIds: null }`.
- Sinon **client session** : `chatter_creators` (`active = true`) — la RLS (admin OU
  `creator_id ∈ profile_creators`) renvoie exactement le périmètre → `chatterIds` distincts +
  `creatorIds` distincts. Pas de nouvelle table, pas de client admin.

## 5. Application

### 5.1 Repos (`get-repos`, `actions.saveReposCell`, page)
- `page.tsx` passe `profile` → `getRepos(week, profile)`.
- `get-repos` : calcule le scope ; si non-admin —
  - `chatterOptions` filtrés au scope ;
  - `cells[..].chatterIds` filtrés au scope ; `names` (texte legacy) vidés à l'affichage ;
  - `columns` : ne garde que les colonnes modèles dont `creatorIds ∩ scope.creatorIds ≠ ∅`
    (+ toujours `managers`/`policiers`) ;
  - les noms restent résolus via client admin (inchangé — seuls les IDS affichés sont scopés).
- `saveReposCell` : si non-admin — relit la ligne existante, `hidden = existants ∉ scope`,
  sauvegarde `hidden ∪ soumis` et **préserve `names`** tel quel (le client n'envoie pas les
  names pour un non-admin ; le serveur garde l'existant). Rejette tout `chatterId` soumis hors
  scope.
- `PlanningGrid` : rien à changer côté logique (il reçoit des données déjà scopées) ; le PNG
  exporte la vue scopée du manager.

### 5.2 Police (`get-police`, `actions`)
- `page.tsx` passe `profile` → `getPolice(day, profile)`.
- `get-police` : si non-admin — `chatterOptions`, `entries` (journal du jour),
  `warningsByChatter` et les KPIs filtrés sur `scope.chatterIds`.
- `addPoliceWarning` / `addPoliceMalus` : garde serveur — `chatterId ∈ scope` sinon
  « Accès refusé » (admin exempté).
- `updatePoliceMalus` : garde serveur aussi — relit le `chatter_id` de l'entrée et vérifie
  qu'il est dans le scope (un non-admin ne peut pas éditer le malus d'une autre équipe par id).
  `deletePoliceEntry` inchangé (admin only).

## 6. Hors périmètre
- Classement Insights (reste global — décision).
- Pages déjà scopées par la RLS (aucun changement).
- RLS en base pour `rest_planning_cells`/`police_entries` (le scoping est applicatif ici ;
  la RLS page-level `has_page` reste la barrière d'accès).

## 7. Fichiers touchés
- `apps/web/src/lib/scope.ts` (nouveau)
- `apps/web/src/features/repos/services/get-repos.ts`, `actions.ts`,
  `app/(dash)/chatter/repos/page.tsx`
- `apps/web/src/features/police/services/get-police.ts`, `actions.ts`,
  `app/(dash)/chatter/police/page.tsx`
