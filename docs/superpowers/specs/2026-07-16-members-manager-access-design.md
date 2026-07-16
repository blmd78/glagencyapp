# Membres — accès managers (gestion de SES chatters)

**Date** : 2026-07-16 (révisée le jour même — itération 2 : rattachement + édition)
**Objet** : ouvrir la page `/chatter/members` aux profils `manager`, qui gèrent
UNIQUEMENT leur équipe : les comptes `user` rattachés à eux (`profiles.manager_id`).

## Décisions produit (validées)

- **Périmètre** : face Chatteurs uniquement. `/marketing/members` reste admin-only.
- **Rattachement** : chaque compte `user` créé par un manager lui est rattaché
  (`manager_id`). Un admin peut rattacher/déplacer tout compte user/manager (jamais un
  admin — non éditables ici) via un sélecteur « Manager » dans le dialog (face
  chatteurs). Auto-rattachement interdit (check en base). **Démotion** d'un manager
  (role → user) : ses chatters sont détachés automatiquement ; suppression d'un
  manager : détachement par FK `on delete set null`.
- **Visibilité** : un manager ne voit que lui-même + SES chatters (RLS). Les admins,
  autres managers et chatters non rattachés lui sont invisibles.
- **Droits manager** : créer, modifier et supprimer SES chatters (rôle `user` rattachés
  à lui). Jamais sa propre fiche, jamais un admin/manager, jamais de promotion de rôle
  (rôle **forcé `user`** côté serveur). Suppression via ConfirmDialog comme partout.
- **Modèles assignables** : uniquement les modèles du périmètre du manager
  (ses `profile_creators`).
- **Rôles (itération 3)** : un SUPERADMIN peut nommer des admins et gérer les fiches
  admin (changer leur rôle, les modifier/supprimer). Un admin simple ne le peut pas.
  Les fiches superadmin ne se gèrent jamais depuis cette page. Rôle admin choisi →
  pages/modèles/rattachement sans objet (masqués, non requis — un admin voit tout) ;
  un manager promu admin ou démis voit ses chatters détachés.

## Approche retenue

RLS élargie en **lecture** + gardes applicatives pour les mutations (approche A).
Les mutations continuent de passer par le client service-role (obligatoire pour
`auth.admin.*`), gardées côté app ; la RLS reste la ceinture en lecture.
Alternative écartée : lecture au client admin dans `getMembers()` (sort du modèle
« RLS = enforcement réel » et oblige à re-filtrer à la main).

## Changements

### 1. Migration `0048_members_manager_read.sql`

- `profiles.manager_id uuid references profiles(id) on delete set null` — le
  rattachement (null = non rattaché ; supprimer un manager détache, ne supprime pas).
- `is_manager()` : security definer, même patron que `is_superadmin()` (0037),
  revoke public + grant authenticated.
- `manages(target uuid)` : security definer — l'appelant est le manager de
  rattachement du profil cible (évite d'empiler l'évaluation RLS de profiles).
- `profiles` : la policy `profiles_self_or_admin_read` (0008) devient
  `id = auth.uid() OR is_admin() OR (is_manager() AND manager_id = auth.uid())`.
- `profile_creators` : la policy devient
  `profile_id = auth.uid() OR is_admin() OR (is_manager() AND manages(profile_id))`
  — le gate `is_manager()` est indispensable : sans lui, un manager démis lirait
  encore les assignations de son ex-équipe.
- **Aucune policy d'écriture manager** : les écritures base restent admin/superadmin
  (0037/0038), les mutations app passent par le service-role.

Effet induit voulu : `getMembers()` (client session) se filtre tout seul — un manager
reçoit lui-même + son équipe, et `creators` reste scopé à SES modèles par la RLS
`creators_scoped_read` (0008) — exactement le périmètre assignable voulu.

### 2. `lib/auth` — profil et garde

- `Profile.manager: boolean` (rôle base `manager`). Le mapping `role` existant est
  inchangé : un manager reste `'user'` partout ailleurs (pages via `requireAccess`).
- `requireAdminOrManager()` : admin (superadmin compris) OU manager, sinon redirect
  `/chatter/overview` — même patron que `requireAdmin()`.

### 3. Nav — `config/workspaces.ts` + `AppSidebar`

- `NavItem.managerAccess?: boolean` : item admin-only AUSSI visible des managers.
  Posé uniquement sur `/chatter/members`.
- `AppSidebar` reçoit `isManager` (depuis le layout, via `getProfile()`) ; filtre :
  un non-admin voit un item `adminOnly` si `managerAccess && isManager`.

### 4. Page + UI — `viewer: 'admin' | 'manager'`

- `chatter/members/page.tsx` : `requireAdminOrManager()` → `viewer` passé à
  `MembersTemplate` → `MembersTable` → `MemberDialog`.
- Manager : actions (Modifier/Supprimer) visibles UNIQUEMENT sur les lignes rôle
  `user` (= ses chatters, sa vue étant filtrée par la RLS) — jamais sur sa propre
  ligne ; dialog sans sélecteur de rôle ni de rattachement (`user` + rattachement à
  lui forcés côté serveur).
- Admin : sélecteur « Manager (rattachement) » dans le dialog (face chatteurs),
  options = profils rôle manager de la liste, « Aucun » = détaché.
- `/marketing/members` : inchangé (`requireAdmin`, `viewer='admin'` implicite,
  rattachement non affiché ni modifié sur cette face).
- Assumé : dans la colonne Modèles, un modèle hors périmètre du manager s'affiche
  « — » (nom masqué par la RLS `creators`).
- `Member.managerId` ('' = aucun) exposé par `get-members` ; types Supabase générés
  patchés à la main (`manager_id`) en attendant le regen post-migration.

### 5. Actions `createMember` / `updateMember` / `deleteMember`

- Garde : `requireAdminOrManager()` sur les trois.
- Si l'appelant est **manager** :
  - `scope` doit être `'chatter'` (sinon erreur) ;
  - `role` **forcé `'user'`** quel que soit l'input (pas de confiance au client) ;
  - `creatorIds ⊆ ses propres modèles` (`requireOwnCreators`, filtre applicatif
    `.eq('profile_id', caller.id)` — la RLS n'est plus une ceinture ici, cf. 0048) ;
    à l'édition, `syncAssignments` est borné à son périmètre : une assignation posée
    par un admin hors scope est PRÉSERVÉE (le dialog la retire du form, le serveur ne
    la retire jamais) ;
  - création : `manager_id` **forcé à lui** ;
  - édition/suppression : cible bornée par `requireEditableTarget` = compte `user`
    de SON équipe (`manager_id = caller.id`) — jamais un admin/manager, jamais soi ;
  - édition : le rattachement ne bouge pas (patch `manager_id` réservé aux admins).
- Si l'appelant est **admin** : `managerId` d'input validé (`requireManagerTarget` :
  la cible du rattachement doit être un profil rôle manager), posé sur scope chatter.

## Hors périmètre

- Aucune modification des droits d'écriture RLS (mutations = service-role gardé app).
- Aucun changement des autres pages/gardes (le manager reste un `user` ailleurs).
- Pas de rattachement rétroactif automatique : les chatters existants se rattachent
  à la main via le sélecteur admin.

## Tests / vérification

- Typecheck monorepo (lint repo cassé — `next lint` supprimé en Next 16, préexistant).
- **Ordre de deploy STRICT : appliquer 0047 puis 0048 AVANT de déployer le web** —
  le code web lit `manager_id` ; sans la colonne, la page Membres est vide pour tous
  et les mutations échouent (« Profil introuvable »).
- Vérif runtime (2 comptes) : un manager voit l'entrée Membres côté Chatteurs
  seulement ; sa liste = lui + ses chatters ; il crée un chatter (rôle user, ses
  modèles uniquement, rattaché à lui), le modifie, le supprime (ConfirmDialog) ; pas
  d'actions sur sa propre ligne ; un `user` ne voit toujours pas la page ; un admin
  garde tout + rattache un compte existant via le sélecteur.
- Tentatives d'escalade : `createMember`/`updateMember` avec `role: 'manager'` ou
  `managerId` d'un autre manager depuis un compte manager → forcés/ignorés ;
  `updateMember`/`deleteMember` sur un chatter d'un autre manager → refusés.
