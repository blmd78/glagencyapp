# Cloisonnement chatteurs par manager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** Un manager ne voit/sélectionne que les chatteurs de ses modèles assignés — sur Repos (affichage + selects + colonnes, fusion anti-écrasement serveur) et Police (options + journal + KPIs + gardes serveur). Admin inchangé.

**Architecture:** Helper `lib/scope.ts` (`getChatterScope(profile)` → null pour admin, sinon Sets depuis `chatter_creators` via client session/RLS). Services `get-repos`/`get-police` reçoivent le profile et filtrent ; actions serveur ajoutent des gardes (rejet hors-scope + merge non destructif).

**Tech Stack:** Next 16 RSC, Supabase RLS, TypeScript. Pas de migration.

## Global Constraints
- Admin (`role='admin'`) → aucun filtrage, comportement actuel.
- Scope = `chatter_creators.active=true` lu au **client session** (RLS = admin OU `creator_id ∈ profile_creators`).
- Repos non-admin : cells `chatterIds ∩ scope`, `names` vidés à l'affichage, colonnes modèles limitées à `creatorIds ∩ scope ≠ ∅` (+ managers/policiers toujours), options scopées. `saveReposCell` : merge `hidden ∪ soumis`, `names` existants préservés, rejet d'un id soumis hors scope.
- Police non-admin : options, entries, KPIs, warningsByChatter scopés ; add/update refusent un chatter hors scope.
- Vérif : `pnpm typecheck` + exécution réelle (pas de runner).

## Task 1 : `lib/scope.ts`
- Create `apps/web/src/lib/scope.ts` : `ChatterScope { chatterIds: Set<string>|null; creatorIds: Set<string>|null }` ; `getChatterScope(profile: Profile)` → admin = nulls ; sinon session client `.from('chatter_creators').select('chatter_id, creator_id').eq('active', true)` → Sets.
- Typecheck, pas de commit isolé (part avec Task 2).

## Task 2 : Repos scopé
- `page.tsx` : `getRepos(week ?? null, profile)`.
- `get-repos.ts` : param `profile` ; scope ; si non-admin → filtre `chatterOptions`, `cells` (ids ∩ scope, names=''), `columns` (modèles : intersection creatorIds, encadrement conservé).
- `actions.ts saveReposCell` : non-admin → relecture ligne existante (client session), `hidden = existants ∉ scope` ; rejet si un id soumis ∉ scope ; save `merge = [...hidden, ...soumis]`, `names` = existant (ignoré du payload).
- Typecheck + commit `feat(scope): repos filtré par les modèles du manager (+ merge anti-écrasement)`.

## Task 3 : Police scopé
- `page.tsx` : `getPolice(day ?? null, profile)`.
- `get-police.ts` : param `profile` ; scope ; si non-admin → filtre `chatterOptions`, `entries`, `warningsByChatter` ; KPIs calculés sur les entries filtrées (déjà le cas).
- `actions.ts` : helper interne `assertInScope(profile, chatterId)` (session client sur `chatter_creators`) utilisé par `addPoliceWarning`, `addPoliceMalus` ; `updatePoliceMalus` relit `chatter_id` de l'entrée et vérifie.
- Typecheck + commit `feat(scope): police filtrée par les modèles du manager (+ gardes serveur)`.

## Self-Review
Spec §4→T1, §5.1→T2 (affichage, options, colonnes, merge), §5.2→T3 (options/journal/KPIs/gardes, update guard). Admin bypass partout. Pas de placeholder. Types cohérents (`getChatterScope` consommé T2/T3).
