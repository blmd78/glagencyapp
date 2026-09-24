# Runbook Uncove — glagencyapp

Onglet `/chatter/uncove` (slug `uncove`, groupe Performance) : analytics par compte de créatrice sur Uncove — abonnés et CA, en **lecture seule**. En prod depuis la Release 2.57 (2026-09-21), cron actif.

## L'API

REST JSON sur `https://uncove.com/api/v2.0/` (quelques endpoints en `/api/v1.0/`), CORS `*`. Relevés dans le bundle du front (`main_safari.*.js`) :

| Donnée | Endpoint |
| --- | --- |
| Abonnés | `GET /api/v2.0/subscribe/volumes?start=<ISO>&end=<ISO>` → `{ "DD/MM/YYYY": {new, canceled, current} }` |
| CA | `GET /api/v2.0/transactions/volumes?start&end&currency=eur` → `{ "DD/MM/YYYY": montant }` — `currency` **obligatoire** (ZodError 400 sinon) |
| Détail | `GET /api/v2.0/transactions/{own,customers}?start&end&currency=eur` |
| Solde | `GET /api/v2.0/wallet/` → `[{balance, currency, pausedTransfers}]` |

Dates en ISO UTC en entrée ; réponses clées par jour **Europe/Paris**.

## L'authentification — et pourquoi on colle un jeton

- **`Authorization: Bearer <JWT>`**, le même jeton que le cookie `user_token`. HS256, **sans `exp`**, découplé de la session : il répond après rechargement, après plusieurs jours, et en curl serveur sans cookie depuis une autre IP (le scénario du cron).
- **Turnstile ne protège que la page de login**, pas l'API → un re-login automatisé (e-mail + mot de passe) est **impossible côté serveur**. C'est le même mur que celui qui a tué le login par mot de passe de MyPuls.
- Décision qui en découle : « connecter un compte » dans le CRM = **coller le `user_token`** capturé après un login HUMAIN, stocké **chiffré** (préfixe `v1:`, `@glagency/db` `crypto.ts`, clé `UNCOVE_TOKEN_SECRET`). Jamais le mot de passe : inutile car non rejouable, et accès total au compte. Pas de refresh. Sur un `401`, le compte passe « à reconnecter » → recoller un jeton.
- ⚠️ Ne jamais committer un `user_token` : secrets en env ou en table chiffrée uniquement.

## Le code

- `@glagency/uncove` : client Bearer + parsers + fusion journalière, fixtures réelles, tests vitest.
- Migration `0163_uncove.sql` : `uncove_accounts`, `uncove_account_tokens` (admin-only), `uncove_daily`, RLS.
- Ingestion : `uncove-core.ts` / `uncove.ts`, lançable à la main par `pnpm --filter @glagency/ingestion uncove`.
- Web : `/chatter/uncove` (dashboard) et `/chatter/uncove/modeles` (ajout / reconnexion / retrait de compte, service-role, jeton chiffré).

## Exploitation

- **Ajouter une modèle** : `/chatter/uncove/modeles`, coller son `user_token`. Au 2026-09-21, seul le compte pilote (Alice) était en prod.
- **Cron** : worker Cloudflare, schedule `0 5` (à côté de `5 23`, `0 0`, `30 4`). Secret `UNCOVE_TOKEN_SECRET` posé sur le worker **et** sur Vercel (production + preview), même valeur.
- ⚠️ **Piège wrangler** : `wrangler whoami` peut répondre `holyware2000@gmail.com` alors que `wrangler.toml` verrouille le compte `091614e1…`. `wrangler login` retombe sur le compte **connecté dans le navigateur** (le dashboard n'est pas le CLI) : se connecter au bon compte dans le navigateur d'abord.
- **Accès base hors MCP** : pooler IPv4 `aws-0-eu-west-3.pooler.supabase.com:5432`, utilisateur `postgres.<ref>` — le direct est IPv6-only, donc injoignable. UAT = `ihkksdmgtrbbjugeboks`, prod = `cqmfpsnqaxymswijdnfz`. Le MCP Supabase ne voit **que la prod**.
