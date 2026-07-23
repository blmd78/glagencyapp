# Feature « Consulter / agir en tant que » (impersonation) — Design

**Date** : 2026-07-23
**Statut** : validé (Benoit) — **write-capable**, durci après revue de sécurité adversariale (verdict « sound-with-fixes », 2 critiques + 12 high intégrés).

## Objectif

Un **admin / superadmin** clique sur un membre (manager, sous-manager, police, chatteur) depuis la
liste **Membres** et **voit ET agit exactement comme lui**, via sa vraie session. Usage : diagnostiquer
« qu'est-ce qu'il voit ? », dépanner, tester de bout en bout.

## Approche : vraie session forgée + état d'impersonation CÔTÉ SERVEUR

On forge une vraie session Supabase pour la cible et on bascule le navigateur dessus → `auth.uid()` =
cible → la RLS scope. **Nouveauté post-revue** : l'état d'impersonation est **matérialisé côté serveur**
(row éphémère), le cookie ne porte qu'un **identifiant opaque signé**. C'est ce qui rend le teardown, le
TTL, l'atomicité et la traçabilité possibles — un cookie client autonome ne le permettait pas.

**Restauration par RE-MINT** : à la sortie, on **re-forge la session de l'admin** (generateLink+verifyOtp
sur son propre compte) au lieu de stocker ses tokens. → **aucun token (admin ou cible) n'est stocké dans
un cookie ni dans la base**. Élimine la confidentialité du refresh admin, la taille de cookie, la rotation.

**Rejeté — re-scoping app-side** (réimplémenter la RLS) : refacto fragile, contraire à « RLS = enforcement réel ».

## Contexte technique (vérifié)

- Auth Supabase **OTP email** + `@supabase/ssr` (session cookie `sb-<ref>-auth-token`, **browser-global,
  pas par onglet**). Clients : `client.ts` (browser), `server.ts` (SSR/RLS, `cache()`-mémoïsé, **setAll
  avale les erreurs cookies**), `createAdminClient` (service-role). Nouvelles clés `sb_secret_` (pas de
  JWT HS256 partagé → forge via **admin API**, pas de JWT maison).
- ⚠️ **L'enforcement est DUAL, pas seulement RLS.** ≥11 chemins de lecture tournent en **service-role**
  (RLS bypassée) et dérivent leur périmètre d'un **branchement applicatif** (`getProfile().role` /
  `restricted`) — ex. `getRanking`, `getClosingByChatter`, `get-members`, `get-overview`, `get-chatters`.
  L'impersonation reste fidèle **uniquement parce que ces branches lisent `getProfile()/getUser()` = la
  session-cookie échangée**. Invariant dur à documenter et **tester** : toute branche de privilège DOIT
  dériver de `getProfile()/getUser()`, jamais d'une valeur ambiante.

## Architecture — état serveur + cookie opaque

- **Table `impersonation_sessions`** (migration) : `id uuid pk, actor_id uuid, target_id uuid,
  actor_email text, target_email text, started_at timestamptz, expires_at timestamptz, ended_at
  timestamptz null`. Sert de : source de vérité de l'état, base du teardown/TTL, et **audit** (qui a
  impersonné qui, quand). RLS : lecture `admin/superadmin` only ; écriture via service-role (actions).
- **Cookie `imp_sid`** : uniquement l'`id` opaque de la row, **HMAC-SHA256** avec un secret DÉDIÉ
  `IMPERSONATION_COOKIE_SECRET` (env, jamais `NEXT_PUBLIC_*`, ≠ clés Supabase), `httpOnly` `secure`
  `sameSite=lax`, `maxAge` court (= TTL, 30 min). **Vérif de signature obligatoire (constant-time) AVANT
  tout usage** ; signature/expiry KO → logout de secours.
- **`lib/impersonation/session.ts`** : helpers isolés (signer/vérifier `imp_sid`, forger une session pour
  un userId via admin API, révoquer un jeton forgé, asserter `getClaims().sub`).

## Mécanisme

**`startImpersonation(targetId)`** (Server Action) :
1. **Garde appelant** = `requireAdmin()` (admin **ou** superadmin) — **jamais** `requireCaller`/manager.
2. **Garde cible fail-closed, sur le rôle BRUT** relu par `targetId` via service-role : rejeter sauf si
   `role IN ('manager','sous-manager','police','chatteur')` (allowlist — couvre superadmin, admin, le
   transitoire `user`, tout rôle futur). **Aucune** propriété (role/email) venant du client.
3. **Garde imbrication** : refuser si session courante n'est pas un admin, ou si `imp_sid` déjà présent.
4. **Résoudre par id** : `admin.auth.admin.getUserById(targetId)` → email COURANT + `email_confirmed_at`
   (rejeter si email absent/non confirmé). Ne JAMAIS forger depuis `profiles.email` (copie figée).
5. **Forger en mémoire d'abord** (atomicité) : `generateLink({ type:'magiclink', email })` → `token_hash`
   ; `verifyOtp({ token_hash, type: data.properties.verification_type })` (**le type vient de la réponse**,
   pas hardcodé — concrètement `'magiclink'`, confirmé par les patterns externes ; générer ET vérifier
   avec le MÊME type) sur un **client SSR DÉDIÉ, non-`cache()`, lié aux cookies de la réponse, dont
   `setAll` THROW**. **Asserter `getClaims().sub === targetId`** avant tout commit.
6. **Commit quasi-atomique** : créer la row (`expires_at = now()+30min`) → poser le cookie session cible →
   poser `imp_sid` (no-overwrite). Échec de forge = sortie en erreur **sans mutation d'état** (rollback).
7. **Sentry** : `captureMessage('impersonate:start', { actor_id, target_id })` — **jamais** de token.
8. Redirige `/`. (Bouton déclencheur désactivé après 1er clic → anti double-start.)

**`stopImpersonation()`** :
1. **Snapshot** l'access token forgé depuis les cookies **AVANT** toute restauration.
2. **Re-mint** la session admin : lire `actor_id` de la row → `generateLink`/`verifyOtp` sur l'admin →
   **asserter `sub === actor_id` ET rôle admin/superadmin en base** avant commit.
3. **Révoquer** le jeton forgé : `admin.auth.admin.signOut(forgedAccess, 'local')`. (⚠️ l'access token
   forgé reste valide localement jusqu'à son `exp` ~1 h → compensé par le teardown proactif + TTL.)
4. Marquer `ended_at`, effacer `imp_sid`. Sentry `impersonate:stop`. Redirige `/chatter/members`.

**Teardown proactif (`proxy.ts` / middleware)** : si `imp_sid` présent et row **expirée / incohérente /
introuvable** → forcer stop (re-mint admin + révoquer cible + nettoyer). Couvre onglet fermé / crash.

**Tripwire aval** : à chaque navigation (proxy ou bandeau), relire le rôle COURANT de la cible via
service-role → si hors allowlist (ex. promue admin pendant l'impersonation) → forcer stop.

**Bandeau** : Server Component monté dans le layout dashboard, rendu à chaque navigation, source =
`imp_sid` vérifié → « Consultation en tant que *X* · **expire dans MM:SS** · **Quitter** » (form →
`stopImpersonation`). Sobre. Le **compte à rebours** est un petit îlot client qui reçoit `expires_at`
(de la row d'état) et décompte ; **à 0 → `router.refresh()`** → le teardown proactif du proxy restaure
l'admin (le client n'a pas besoin d'écrire pour finir). Sert aussi de « prévenu à l'avance ».
+ **garde client léger** (storage event / cookie lisible JS) → `router.refresh()` dès changement
d'identité (contre le cookie jar multi-onglets). `start`/`stop` font `revalidatePath('/','layout')`.

## Sécurité — garde-fous (exigences dures)

1. **Allowlist fail-closed sur rôle brut** + `requireAdmin` appelant + zéro donnée cliente (§Mécanisme 1-2).
2. **Impersonation descendante uniquement** {manager, sous-manager, police, chatteur} ; jamais admin/superadmin.
3. **Deuxième ligne de défense** : tripwire aval (rôle re-vérifié à chaque nav) — la garde de start n'est
   PAS le seul rempart (couvre promotion en cours + TOCTOU).
4. **Teardown garanti** : TTL 30 min + proxy force-stop → pas de session forgée fantôme à l'abandon.
5. **Cookie opaque signé HMAC (secret dédié), vérif constant-time avant usage** ; aucun token en cookie/base.
6. **Sortie sûre** : re-mint admin + révocation cible **scope local uniquement** (jamais de signout global).
   Le bouton **« Déconnexion » de la sidebar** (`nav-user.tsx`) est **neutralisé/redirigé vers
   `stopImpersonation`** tant que `imp_sid` présent (sinon il déconnecterait la vraie cible partout).
7. **Fallback logout** : `imp_sid` corrompu **ou** toute erreur de re-mint/`setSession` → logout complet
   + effacement de TOUS les cookies (auth + `imp_*`) + révocation du jeton cible si récupérable.
8. **CSRF** : contrôle = check Origin des Server Actions Next → **épingler `serverActions.allowedOrigins`**
   au(x) domaine(s) prod dans `next.config`. Confirmation UI au clic « Consulter en tant que ».
9. **Pas de fuite de credentials** : `token_hash`/tokens JAMAIS loggés ; consommés côté serveur ;
   `beforeSend` Sentry scrubbe cookies/tokens ; args de Server Actions non capturés.

## Write-capable — imputabilité

- **Trace par-action** : tant que `imp_sid` présent, les Server Actions **mutantes** posent un breadcrumb
  Sentry `{ real_actor: actor_id (de la row), target_id, action }` — sinon une écriture n'est imputable
  qu'à la cible (`created_by`/`controller_id` = cible).
- **Actions irréversibles gardées** : `deleteMember` (cascade FK / `admin.auth.admin.deleteUser`) et
  mutations sensibles = **bloquées ou reconfirmées** quand `imp_sid` présent.

## Cas limites

- Page interdite à la cible → `/no-access` (fidèle).
- Impersonation imbriquée / double-clic → bloquée (garde + bouton désactivé + no-overwrite `imp_sid`).
- Session forgée expirée (TTL) → teardown proactif → retour admin/login.
- Cible en cours de magic-login → `generateLink` peut invalider son lien / 429 rate-limit (assumé ;
  e2e : throttle/retry, pas de boucle serrée start/stop).

## Composants / fichiers

- Migration `00NN_impersonation_sessions.sql` (table + RLS lecture admin).
- `lib/impersonation/session.ts` (sign/verify cookie, forge/révoque session, asserts).
- `features/impersonation/actions.ts` (`startImpersonation`, `stopImpersonation` + gardes).
- `features/impersonation/components/impersonation-banner.tsx` (Server Component) + garde client.
- `features/impersonation/components/impersonate-button.tsx` (ligne Membres, admin only, confirm).
- `features/members/components/members-table.tsx` (action sur lignes impersonnables).
- `nav-user.tsx` (neutraliser Déconnexion pendant impersonation).
- `proxy.ts`/middleware (teardown proactif + tripwire), `next.config` (`allowedOrigins`), `.env.example`
  (`IMPERSONATION_COOKIE_SECRET`), layout dashboard (montage bandeau).

## Hors périmètre (YAGNI)

- Pas de mode lecture seule (write-capable assumé).
- Pas d'impersonation d'admin/superadmin.
- Pas d'UI d'historique d'audit (la table sert d'état + trace ; consultation SQL suffit v1).
- Pas de ré-auth OTP avant impersonation (confirmation UI + `requireAdmin` suffisent v1).

## Tests

- **Garde start** (unit/intégration) : refus (a) appelant manager, (b) appelant non-admin, (c) cible
  admin/superadmin, (d) cible `user`/rôle inconnu, (e) imbrication, (f) role/email client ignorés.
- **Mécanisme réel (intégration, PAS mock)** : `start` → `getClaims().sub === targetId` ; `stop` →
  `sub === actor_id` + jeton cible révoqué ; teardown expiré ; fallback logout.
- **Fidélité RLS + service-role (e2e)** : en impersonation d'un chatteur/manager, les pages service-role
  (Overview, Chatteurs, Insights, Membres, Police) rendent le périmètre **restreint** de la cible.
- **Sorties (e2e)** : « Quitter » → redevient admin ; **clic « Déconnexion » pendant impersonation** ne
  déconnecte pas la cible globalement ; multi-onglets → l'onglet resté admin ne mute pas en tant que cible.
- **Write** : écriture en impersonation attribuée à la cible + breadcrumb `real_actor` présent ;
  `deleteMember` bloqué/reconfirmé.
