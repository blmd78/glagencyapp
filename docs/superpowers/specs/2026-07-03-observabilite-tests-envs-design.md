# Observabilité, tests & environnements — design

**Date** : 2026-07-03 · **Statut** : validé (brainstorming)
**Périmètre** : watcher de logs + alertes email, Sentry (web + ingestion), tests (Vitest ciblés, pgTAP RLS, Playwright front), préprod/prod + UAT.

## 1. Contexte & objectif

Le projet tourne en « prod de fait » : un seul projet Supabase, déploiements manuels
`wrangler` depuis la machine de dev, aucune CI, aucun monitoring. Le cron d'ingestion
tourne à 00h05 Paris sans surveillance, et le pipeline avale volontairement les échecs
partiels (`apps/ingestion/src/pipeline.ts:348` login money-team raté → chatteurs
ignorés en `console.warn` ; `:405` jour en échec → warn et on continue) : un run peut
finir « OK » en ayant silencieusement rien ingéré côté chatteurs.

Objectifs :

1. **Être prévenu par email** quand quelque chose casse (erreur 500 web, run
   d'ingestion planté, dégradé, **ou qui n'a pas tourné du tout**).
2. **Historique consultable** : logs récents + historique durable des runs d'ingestion.
3. **Filet de tests** : e2e Playwright sur le front, unitaires là où ça rapporte,
   tests RLS (couvre le backlog « RLS par modèle »).
4. **Préprod + process UAT** avant chaque promotion en prod.

Contrainte transverse : **0 €** — Sentry Developer (gratuit), Cloudflare Workers Free,
Supabase Free.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Alerte email auto | **Alertes email Sentry** (incluses au plan gratuit) — pas de mailer custom, pas de Telegram |
| SDK web | `@sentry/nextjs` (voie officielle pour Next.js + OpenNext + Cloudflare Workers) |
| SDK ingestion | `@sentry/cloudflare` (`withSentry` + `withMonitor` pour le cron) |
| Historique runs | Table `ingest_runs` dans Supabase (durable, chez nous) |
| Logs bruts | Workers Logs (`observability.enabled`), gratuit, rétention 3 jours |
| Tests unitaires | Oui mais ciblés : `packages/core` (étendre) + `packages/mypuls` (parsers sur fixtures). **Pas** d'unit sur le web UI |
| Tests RLS | pgTAP via `supabase test db` + helpers basejump |
| E2E | Playwright, front uniquement (~5-8 specs), Supabase local + Mailpit |
| Préprod | 2ᵉ projet Supabase Free + `wrangler environments` (branching Supabase = plan Pro, hors budget) |

## 3. Observabilité

### 3.1 Ingestion (`apps/ingestion`)

- `@sentry/cloudflare` : `export default Sentry.withSentry(env => ({ dsn: env.SENTRY_DSN,
  environment: env.SENTRY_ENVIRONMENT, tracesSampleRate: 0 }), { scheduled, fetch })`.
  Le wrapper capture l'exception du `scheduled()`, la re-throw (l'invocation apparaît en
  échec côté Cloudflare) et flush via `waitUntil` — **aucun `flush()` manuel**.
- **Cron monitor** : `Sentry.withMonitor('ingestion-mypuls-nightly', run, monitorConfig)`.
  Le cron passe à une ligne unique **`5 23 * * *`** (= 00h05 Paris l'hiver, 01h05 l'été,
  toujours après minuit et le snapshot 23h59) — l'ancien découpage été/hiver par mois
  entiers laissait un trou la dernière semaine d'octobre (bascule le dernier dimanche) où
  le run partait avant minuit Paris. Le monitor utilise le **même crontab** (aligné, à
  modifier ensemble). Détecte un cron qui **ne tourne pas** (missed check-in), pas
  seulement qui plante. Le plan gratuit inclut 1 cron monitor — c'est celui-là.
- **Cap de rattrapage côté Worker** : `maxCatchup: 3` (plan Free = 50 sous-requêtes par
  invocation ; ~13 appels fixes + ~8/jour). Au-delà, warning « rattrapage tronqué » dans
  le résumé ; auto-cicatrisant nuit après nuit. Le CLI local (Node, sans limite) reste
  l'outil de backfill massif.
- **Résumé de run structuré** : `runPipeline` retourne un objet
  `{ status: 'ok'|'degraded'|'failed', days: [{ date, creatorRows, chatterRows, errors }],
  warnings, loginOk, durationMs }` au lieu d'avaler les échecs partiels.
  - `degraded` = login money-team KO, jour(s) en échec, 0 ligne creator upsertée, ou
    **login OK avec 0 ligne chatter** (markup money-team cassé : les parseurs renvoient
    vide sans throw). Les règles « zéro ligne » ne s'appliquent pas au rejeu explicite
    d'un jour (`catchup: false`).
  - Si `degraded` → `Sentry.captureMessage` (niveau warning) → alerte email.
  - Le résumé est **inséré dans `ingest_runs`** (nouvelle migration) :
    `id, started_at, finished_at, status, trigger ('cron'|'http'|'local'), summary jsonb, error text`.
    RLS : lecture admin uniquement. C'est l'historique durable (Workers Logs = 3 jours)
    et c'est affichable plus tard dans le dashboard.
- `console.log` d'un résumé compact en fin de run (rend les 3 jours de Workers Logs exploitables).

### 3.2 Web (`apps/web`)

Setup officiel `@sentry/nextjs` (dernière 10.x) :

- `next.config.ts` : `withSentryConfig(nextConfig, { org, project, authToken:
  process.env.SENTRY_AUTH_TOKEN, widenClientFileUpload: true })` — upload des source
  maps pendant `next build` (invoqué par `opennextjs-cloudflare build`).
  `SENTRY_AUTH_TOKEN` = variable de build locale, jamais commitée, jamais en secret Worker.
- `instrumentation.ts` : `register()` (import des configs server/edge) +
  `export const onRequestError = Sentry.captureRequestError` → **capture les 500 RSC,
  middleware et route handlers** (le « mail auto si 500 »).
- `instrumentation-client.ts` + `sentry.server.config.ts` + `sentry.edge.config.ts` :
  `Sentry.init` avec `NEXT_PUBLIC_SENTRY_DSN` (inliné au build), `tracesSampleRate: 0.1` max.
- `app/global-error.tsx` : capture des erreurs de rendu React client.
- Server Actions critiques : `Sentry.withServerActionInstrumentation(...)`.
- **`wrangler.jsonc`** : bump `compatibility_date` → **`2025-08-16`** (requis : introduit
  `https.request` dans workerd, sans quoi le SDK n'envoie rien) + garder `nodejs_compat`.
  Re-tester l'app après bump.

### 3.3 Logs Cloudflare (les deux workers)

- `observability: { enabled: true, head_sampling_rate: 1 }` dans les deux configs wrangler.
  Gratuit : 200 000 événements/jour (par compte, partagé), rétention 3 jours, recherche
  dans le dashboard. `wrangler tail <worker>` pour le temps réel.
- Pas de traces (`observability.traces`) : facturées dans le même quota, inutile ici.

### 3.4 Alertes Sentry (dashboard, one-shot)

- Web : alerte email sur toute nouvelle issue (défaut).
- Ingestion : alerte sur issues + issues du cron monitor (missed/error/timeout).
- **Rate limits côté projet Sentry** (quota 5 000 errors/mois) : une boucle d'erreurs du
  cron ne doit pas griller le mois.

## 4. Tests — « diamant »

Positions officielles (vérifiées juillet 2026) : Next.js recommande l'e2e plutôt que
l'unit pour les async Server Components ; Supabase recommande « no mocking », tests
contre le stack local. Donc :

### 4.1 Unit Vitest

- `packages/core` : existant, à étendre au fil des features (fonctions pures, zéro mock).
- `packages/mypuls` : **la priorité**. Fixtures = vraies captures **anonymisées**
  (noms/montants) copiées de `apps/ingestion/raw/pages/` vers
  `packages/mypuls/test/fixtures/`. Tester les helpers de parsing et les mappers
  d'endpoints sur JSON/HTML capturés. Un changement de markup MyPuls se détecte en test,
  pas en prod à minuit.
- Pas de tests du parser HTMLRewriter (`money-team-hr.ts`) à ce stade : il exigerait
  `@cloudflare/vitest-pool-workers` (vitest ≥ 4.1, bump depuis 3.x) — reporté (§8).

### 4.2 RLS pgTAP (`packages/db`)

- `supabase test db` + `basejump-supabase_test_helpers` (v0.0.6 épinglée, via dbdev).
- Un fichier par table/policy : `tests.rls_enabled('public')`, puis par rôle
  (`tests.create_supabase_user` / `tests.authenticate_as`) — cas central : **un user du
  modèle A ne voit pas les lignes `creator_daily`/`chatter_daily` du modèle B**.
- Prérequis : parité migrations locales ↔ prod à vérifier avant de faire confiance aux
  résultats (des migrations ont pu être appliquées à la main en prod).

### 4.3 E2E Playwright (front)

- `@playwright/test` + projet **setup** (pattern officiel) :
  `auth.admin.createUser` (email confirmé) → `auth.admin.generateLink({ type: 'magiclink' })`
  (aucun email envoyé) → navigation vers la route `@supabase/ssr` `auth/confirm`
  (`token_hash`) → cookies posés par l'app → `storageState` sauvegardé, réutilisé par
  toutes les specs. Prérequis à vérifier : la route `app/auth/confirm/route.ts`
  (`verifyOtp({ token_hash, type })`) existe dans `apps/web`.
- **1 spec OTP réelle** : soumission de l'email dans l'UI, lecture du code 6 chiffres via
  l'API Mailpit locale (`http://127.0.0.1:54324/api/v1/messages`), saisie, redirection.
- ~5-8 specs au total : login OTP, les 3 pages du dashboard avec filtre datepicker,
  1 spec d'isolation RLS visible (données modèle A invisibles pour user B).
- **DB = Supabase local uniquement** (`supabase start` ; `supabase db reset` + seed avant
  run). Jamais le projet hébergé.
- Cibles : itération sur `next dev` (`E2E_BASE_URL`), **run de référence sur
  `opennextjs-cloudflare preview`** (workerd local, port 8787, via `webServer` Playwright)
  avant chaque deploy — `next dev` vert ne garantit pas workerd vert.
- Nuance assumée : le build e2e inline l'URL Supabase locale (`NEXT_PUBLIC_*`) — parité
  runtime oui, parité binaire avec l'artefact déployé non. Acceptable en solo.

## 5. Environnements & UAT

### 5.1 Supabase

- 2ᵉ projet Free **`glagency-preprod`** dans la même orga (le Free autorise 2 projets
  actifs ; pause après 7 jours d'inactivité — le cron d'ingestion préprod sert de
  keep-alive, à confirmer à l'usage). Configurer l'Auth préprod (Site URL + Redirect URLs
  → URL workers.dev préprod).
- **Migrations** : `packages/db/supabase/migrations` reste la source unique.
  `supabase link` reste sur la prod ; préprod ciblée sans re-link :
  `supabase db push --db-url $SUPABASE_DB_URL_PREPROD` (URL en env non commitée,
  mot de passe percent-encodé). Flux : `--dry-run` → push préprod → UAT → push prod.
- **Seeds préprod** idempotents (`on conflict do nothing`) dans
  `packages/db/supabase/seeds/`, appliqués via `--include-seed` **vers la préprod
  uniquement**, jamais la prod.

### 5.2 Cloudflare (`wrangler environments`)

Les deux configs passent en `env.production` + `env.preprod`. Pièges (vérifiés) :

1. **`name` explicite en production** = nom actuel du worker (`glagency-web`,
   `glagency-ingestion`) — sinon wrangler déploierait un *nouveau* worker
   `<nom>-production` (URL et secrets perdus). Préprod = `<nom>-preprod`.
2. **vars/bindings/secrets non hérités** : tout redéclarer par env ;
   `wrangler secret put X --env preprod` puis `--env production` (re-poser les secrets
   après création des env-workers). Local : `.dev.vars` / `.dev.vars.preprod`.
3. **Crons hérités** : écrire `triggers.crons` **explicitement dans chaque env** —
   préprod avec son propre horaire (décalé), ou `[]` pour désactiver. Sinon la préprod
   scraperait MyPuls sur le cron prod.
- Sentry : `environment: 'preprod' | 'production'` par env (var wrangler) pour séparer
  les alertes.

### 5.3 Web — deux builds

`NEXT_PUBLIC_*` inlinées au build ⇒ un build par env, jamais d'artefact partagé :

- `.env.preprod` / `.env.production` (committables : URL + clé publishable).
- Scripts : `deploy:preprod` = `dotenv -e .env.preprod -- opennextjs-cloudflare build
  && opennextjs-cloudflare deploy --env=preprod` (forme `--env=` ; vérifier le nom du
  worker déployé au 1er run ; fallback `CLOUDFLARE_ENV=preprod`). Idem `deploy:prod`.

### 5.4 Process UAT

Avant chaque promotion en prod :

1. Migrations → préprod (`db push --dry-run` puis push).
2. Deploy préprod (web + ingestion si concernée).
3. Run Playwright (référence `preview` locale) + checklist UAT manuelle sur la préprod
   (login OTP, 3 pages, filtres, isolation par modèle).
4. Si OK : migrations → prod, puis `deploy:prod`.

La checklist UAT vit dans `docs/uat-checklist.md` (créée en PR6).

## 6. Découpage (PRs)

1. **PR1 — Watcher ingestion** : résumé de run structuré + migration `ingest_runs` +
   `@sentry/cloudflare` + cron monitor + `observability.enabled` (les 2 workers).
2. **PR2 — Sentry web** : `@sentry/nextjs`, bump `compatibility_date`, vérif taille
   Worker au deploy.
3. **PR3 — Unit mypuls** : fixtures anonymisées + tests parsers/mappers (+ extension core).
4. **PR4 — pgTAP RLS** : setup helpers + tests policies par modèle.
5. **PR5 — Playwright** : config + setup auth + specs + scripts (`e2e`, `preview:e2e`).
6. **PR6 — Préprod/UAT** : projet Supabase préprod, wrangler envs, scripts deploy,
   seeds, checklist UAT.

Chaque PR est indépendamment déployable ; l'ordre suit la valeur (alerting d'abord).

## 7. Contraintes vérifiées & risques assumés

| Fait (vérifié docs officielles, juil. 2026) | Conséquence |
|---|---|
| Source maps **serveur** OpenNext non résolues dans Sentry (issue getsentry #19213 ouverte) | Stack traces serveur parfois minifiées ; client OK. Assumé |
| Worker Free = 3 MiB gzip max | Risque au deploy PR2 ; fallback = Sentry client-only (`instrumentation-client` + `global-error` seuls) |
| Limite CPU Free = 10 ms **CPU pur** (réseau non compté) | Sentry OK sur le cron ; le risque CPU reste le parsing, pas le SDK |
| Workers Logs Free : 200k évts/jour, **3 jours** | Historique durable = `ingest_runs` + Sentry (30 j) |
| Aucune alerte native Cloudflare sur erreurs Workers (tous plans) | L'alerting passe par Sentry |
| Sentry Developer : 5k errors/mois, 1 user, 1 cron monitor, rejet au-delà du quota | Rate limits à poser ; monitors supplémentaires → healthchecks.io si besoin |
| Supabase Free : 2 projets actifs, pause à 7 j d'inactivité ; branching = Pro | Préprod = 2ᵉ projet ; keep-alive par le cron préprod |
| `supabase status` peut sortir des clés legacy (anon/service_role) en local | Ne pas hardcoder ; lire la sortie du CLI |
| Session `@supabase/ssr` = cookies chunkés posés côté serveur | Auth e2e via la route `auth/confirm`, jamais d'injection localStorage |

## 8. Hors périmètre (YAGNI, reporté)

- Tests d'intégration du pipeline dans workerd (`@cloudflare/vitest-pool-workers`,
  exige vitest ≥ 4.1) — à reconsidérer quand le parser HTMLRewriter bougera.
- CI GitHub Actions (lint/typecheck/tests/e2e) — gratuit et utile, mais chantier séparé.
- `tunnelRoute` Sentry (contournement adblockers) — seulement si des events client manquent.
- Affichage de `ingest_runs` dans le dashboard web — plus tard.
- Telegram — remplacé par les alertes email Sentry.
