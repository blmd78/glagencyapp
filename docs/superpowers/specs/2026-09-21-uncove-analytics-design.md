# Uncove — analytics par compte (design)

*2026-09-21 — chantier « onglet Uncove », pilote Alice puis multi-comptes.*

## Objectif

Relever **Subs + CA par compte créatrice Uncove** dans le CRM, sur le modèle MyPuls.
Analytics **lecture seule** (ingestion → Supabase → dashboards). Comptes ajoutés
**manuellement** (pas de rattachement `creators`). Placement : **face Chatteurs**,
route `/chatter/uncove` (nouveau slug `uncove` dans `config/workspaces.ts`).

## Acquis (VÉRIFIÉ par spike)

- API REST JSON `https://uncove.com/api/v2.0/`. Auth = `Authorization: Bearer <JWT>`
  (= cookie `user_token`). Jeton **longue durée** (même jeton 200 à J+5, en curl serveur
  sans cookie, autre IP). **Turnstile protège seulement le login**, pas l'API.
- **Subs** : `GET /api/v2.0/subscribe/volumes?start=<ISO>&end=<ISO>`
  → `{ "DD/MM/YYYY": { new, canceled, current } }`.
- **CA** : `GET /api/v2.0/transactions/volumes?start&end&currency=eur`
  → `{ "DD/MM/YYYY": montant }`. `currency` **obligatoire** (ZodError 400 sinon).
- Détail (option) : `GET /api/v2.0/transactions/{own,customers}?start&end&currency=eur`.
- Solde : `GET /api/v2.0/wallet/` → `[{ balance, currency, pausedTransfers }]`
  (sert à VALIDER un token à l'ajout).
- Dates ISO UTC en entrée ; réponse clée par **jour Europe/Paris**.
- ⚠️ **Unité € à confirmer** sur données non nulles (Alice = 0 en septembre).

## Parité MyPuls (niveau modèle)

Parité sur : CA journalier, abonnés actifs (`current`), nouveaux abos (`new`).
Écarts : **pas de ventilation du CA par type** (tips/abo/ppv/renew/live) — peut-être
reconstructible via `transactions/own`/`customers`, à confirmer ; Uncove donne les
**désabos** (`canceled`) là où MyPuls donne les **renouvellements**.
**Limite forte** : aucune **attribution par chatteur** sur Uncove (par compte/modèle only).

## Architecture

- **`packages/uncove` (`@glagency/uncove`)** — client Bearer + parsers + types +
  tests Vitest sur fixtures. Calqué sur `packages/mypuls`. Pur, aucune dépendance web.
- **Migration `0163_uncove.sql`** — 2 tables + RLS.
- **`apps/ingestion`** — commande + cron `uncove`, fan-out sur comptes actifs.
- **`apps/web`** — `/chatter/uncove` : écran Comptes + dashboard Subs/CA.

## Modèle de données (0163)

`uncove_accounts` : `id uuid pk`, `label text` (libre, ex. « Alice »),
`uncove_user_id text` (extrait du JWT), `token_encrypted text` (via `lib/snap-crypto.ts`),
`currency text default 'eur'`, `status text check (status in ('ok','reconnect'))`,
`last_synced_at timestamptz`, `created_at`, `created_by`.

`uncove_daily` : `account_id uuid fk`, `day date`, `subs_current int`, `subs_new int`,
`subs_canceled int`, `revenue numeric`, **pk `(account_id, day)`**.

## Sécurité & droits

- Token = secret → **chiffré** (`snap-crypto.ts`), jamais en clair ni committé.
- **Gestion des comptes** (ajout/suppression de token) = **admin**, écritures
  service-role après garde. **Lecture du dashboard** = porteurs du slug `uncove`.
- À l'ajout d'un compte : valider le token via `GET /wallet/` (200 → ok), extraire
  `uncove_user_id` du JWT. `401` au scrap → `status = 'reconnect'` (recoller un token).

## Ingestion

Commande `pnpm --filter @glagency/ingestion uncove` + cron quotidien. Pour chaque compte
`status='ok'` : fenêtre glissante (~35 j) → `subscribe/volumes` + `transactions/volumes`
(`currency=eur`) → **upsert** `uncove_daily`. Dynamique : un compte ajouté est scrapé au
run suivant. Journalisation via le mécanisme de run existant. `401` → bascule statut.

## Découpage (4 PRs)

1. `@glagency/uncove` (client + parsers + types + tests).
2. Migration `0163_uncove.sql` (tables + RLS).
3. `apps/ingestion` (commande + cron + fan-out + statut).
4. `apps/web` (`/chatter/uncove` : Comptes + dashboard).

## Points ouverts

- Unité des montants (€ vs centimes) — confirmer sur un compte actif.
- Ventilation CA par type — confirmer si `transactions/own` la porte.
- Fréquence cron + taille de fenêtre glissante — à caler (défaut : quotidien / 35 j).
