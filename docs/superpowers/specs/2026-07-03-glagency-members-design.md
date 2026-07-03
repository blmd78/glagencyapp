# Design — Membres & droits d'accès (pages + modèles)

> Date : 2026-07-03 · Statut : **design validé** (Benoit) · Feature : `apps/web/src/features/members`

## 1. Objectif

Reprendre la gestion de membres de l'ancien CRM (pages accessibles + modèles assignés) dans le
nouveau, avec deux différences assumées : **connexion par code email (OTP, pas de mot de passe)**
et **cloisonnement verrouillé en base (RLS)**, pas seulement masqué à l'écran (le trou de
sécurité historique de l'ancien dashboard).

## 2. Modèle de droits

- **Rôles** : `admin` (tout voir, tout gérer, seul à voir la page Membres) et **`user`**
  (restreint par pages + modèles). **Pas d'enum Postgres** : la migration convertit
  `profiles.role` en `text` + `check (role in ('admin','user'))`, migre les valeurs
  `member` → `user`, supprime le type `app_role` et adapte le trigger 0002. Les enums PG
  sont pénibles à faire évoluer ; un check se modifie en une ligne.
- **`profiles.pages text[]`** (nouvelle colonne) : slugs des pages autorisées, ex.
  `{overview, chatters, modeles, health}`. Vide/null pour un admin = tout.
- **`profile_creators`** (existante) : modèles assignés (profile_id, creator_id).
- Création d'un membre = `auth.admin.createUser({ email, email_confirm: true })` (service role,
  côté Server Action) + profil `user` + pages + modèles. À sa 1re visite il entre son email et
  reçoit son code — zéro mot de passe.

## 3. RLS (migration `0008_member_scoping.sql`)

Helper `private.profile_of(uid)`/fonctions stables pour éviter la récursion sur `profiles`.

| Table | SELECT policy |
|---|---|
| `creators`, `creator_daily`, `chatter_creator_daily`, `chatter_creators` | admin OU `creator_id ∈ profile_creators(auth.uid())` |
| `chatter_daily`, `chatter_daily_reach`, `chatter_alias`, `period_snapshot_kpi`, `teams` | **admin uniquement** (grain tous-modèles, non cloisonnable) |
| `chatters` | admin OU membre ayant ≥1 modèle assigné (noms nécessaires pour la ventilation) |
| `profiles` | soi-même OU admin ; UPDATE/INSERT/DELETE : admin |
| `profile_creators` | soi-même (lecture) ; écriture : admin |

Conséquences automatiques (aucun changement de code) : Overview / Modèles / Santé d'un `user`
ne montrent QUE ses modèles ; « CA agence » devient le CA de son périmètre.

Conséquence à coder : **page Chatters pour un `user`** = ventilation `chatter_creator_daily`
de ses modèles uniquement ; colonnes présence/réactivité/« Prop./Vendu » global masquées
(données au grain tous-modèles, invisibles pour lui). `get-chatters` reçoit le rôle et bascule.

## 4. Écrans (design system actuel, pas l'ancien CRM)

- **Liste** (`/chatter/members`, admin only — les autres sont redirigés) : cartes shadcn.
  Avatar initiales · nom + email · badge rôle · badges pages (icônes de la sidebar) · badges
  modèles (couleurs `modelColor`) · date de création · menu ⋯ → Modifier / Supprimer
  (AlertDialog de confirmation). Bouton « Nouveau membre » en tête.
- **Dialog Nouveau/Modifier** (shadcn Dialog) : email (verrouillé en édition), nom affiché,
  « Pages accessibles » (grille de Checkbox — Overview, Chatters, Modèles, Santé, Quotas,
  Compta, Insights ; Membres non proposé, admin only), « Modèles assignés » (grille de
  Checkbox, badges colorés). Enregistrer via Server Action + revalidate.
- **Sidebar dynamique** : `WORKSPACES` filtré par `profiles.pages` (les admins voient tout) ;
  garde serveur dans le layout `(dash)` : page non autorisée → redirect `/chatter/overview`
  (ou 1re page autorisée).

## 5. Server Actions (`features/members/actions.ts`)

`createMember`, `updateMember` (nom, pages, modèles), `deleteMember` (auth + profil, cascade).
Toutes : zod → `getUser()` → vérif `role='admin'` → client **admin** (service role) pour
`auth.admin.*`, client RLS pour le reste quand possible. `SUPABASE_SECRET_KEY` ajouté aux
secrets du Worker web (jamais exposé au navigateur — Server Actions uniquement).

## 6. Hors périmètre v1

Rôle `manager`, invitations par lien/email, pages Analyses/Équipes de l'ancien CRM (n'existent
pas ici), édition du rôle admin depuis l'UI (les 2 admins restent pilotés par la migration 0002
+ seed script).

## 7. Vérification

1. Créer un membre test (email jetable) avec 2 pages + 2 modèles.
2. Se connecter avec → sidebar réduite, pages interdites redirigées, Overview/Modèles/Santé
   limités aux 2 modèles (contrôle réseau : aucune ligne des autres modèles ne transite).
3. Page Chatters (si autorisée) : ventilation de ses 2 modèles seulement.
4. Admin : page Membres liste/édite/supprime ; suppression → connexion du membre refusée.
