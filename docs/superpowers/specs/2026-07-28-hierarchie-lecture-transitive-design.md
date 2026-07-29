# Hiérarchie — lecture transitive pour les managers (design)

## 1. Problème

Un manager ne voit que ses rattachés **directs** (`manager_id = lui`). Or 97 des 107 chatteurs
sont rattachés à des **sous-managers** : le sélecteur du Dashboard (et la lecture de leurs
comptes rendus) est donc quasi vide pour un manager. Décision Benoit (2026-07-28) : **un manager
voit les chatteurs associés à ses sous-managers.**

## 2. Décision de design — lecture transitive, écritures inchangées

La demande porte sur **voir**. L'inventaire prod (pg_policies + pg_proc) montre que `manages()`
(direct-only) est consommée par **10 policies**, dont deux en écriture (`compta_day_entries`,
`compta_week_entries`, USING + CHECK) et les lectures compta/police fraîchement livrées.
Changer `manages()` élargirait ces écritures en silence.

**Donc : `manages()` ne bouge pas.** Une nouvelle fonction transitive, `manages_deep(target)`,
remonte la chaîne `manager_id` depuis la cible (CTE récursive, profondeur bornée, SECURITY
DEFINER comme ses sœurs) et n'est branchée QUE sur les trois policies de **lecture** :

| Policy | Avant | Après |
|---|---|---|
| `profiles` SELECT (branche manager) | `manager_id = auth.uid()` | `manages_deep(id)` |
| `daily_reports` SELECT (branche manager) | `manages(profile_id)` | `manages_deep(profile_id)` |
| `profile_creators` SELECT (branche manager) | `manages(profile_id)` | `manages_deep(profile_id)` — sans elle, Membres afficherait les chatteurs du sous-arbre avec des modèles vides |

**Tout le reste est explicitement inchangé** : écritures compta (le manager ne saisit que pour
ses directs), police, planning (`can_manage_planning_of`), todos (`can_write_todo_of`), gardes
applicatives d'écriture (`members/authz.ts`, `requireCanWriteTodo`, `requireCanEdit` planning).
Le droit d'ÉDITER reste direct partout ; seul le droit de VOIR descend le sous-arbre.

## 3. Effets visibles

- **Dashboard** (manager) : le sélecteur liste tout son sous-arbre, chatteurs de ses
  sous-managers compris ; il peut lire leurs comptes rendus. La pile reste l'encadrement.
- **Membres** (manager) : son équipe complète (sous-managers + leurs chatteurs), avec modèles.
  L'édition reste bornée à ses chatteurs directs (authz inchangée).
- **Planning / to-do** : rien ne change (rosters filtrés par rôle, droits d'écriture directs).
- Admin/superadmin : déjà tout ; sous-managers : pas de sous-arbre en dessous — inchangés.

## 4. Migration `0087_hierarchie_lecture_transitive.sql` (unique)

`manages_deep` : récursive sur `manager_id` depuis la cible vers la racine, `true` si
`auth.uid()` apparaît dans la chaîne (hors cible elle-même), profondeur bornée à 6 (garde
anti-cycle). Puis `create or replace` des trois policies de lecture. Aucune table, aucun autre
objet. UAT d'abord ; prod à la release.

## 5. Vérification

Comportementale sur l'UAT, en simulant la session d'un vrai manager
(`set local role authenticated` + `request.jwt.claims`) :
1. `profiles` : voit soi + sous-managers + leurs chatteurs ; PAS les chatteurs d'un autre manager.
2. `daily_reports` : lit un compte rendu d'un chatteur du sous-arbre.
3. **Écriture compta pour un chatteur non-direct → toujours REFUSÉE** (preuve que le périmètre
   d'écriture n'a pas bougé).
4. Sous-manager : visibilité inchangée (ses directs seulement).
Côté app : 2 commentaires devenus faux à réécrire (`get-reports.ts` docstring « rattachés
directs », `get-members.ts` « son équipe (manager_id) »). Typecheck/lint/build.

## 6. Hors périmètre

Les 3 chatteurs orphelins (`manager_id` null : miantsa, osko, rayson) restent invisibles des
encadrants — c'est un problème de **données**, pas de policy : à rattacher dans Membres.
