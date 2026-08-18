# Formation — Entraînement (moteur IA, sessions, progression, overview) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reprendre l'entraînement de Good Luck Agency dans le CRM : moteur IA (fan Haiku, notation Sonnet structurée), sessions solo / défi simultané / boss (chrono, élimination, révélation différée), Ma formation (progression, médailles, streak, trophées, classement), Overview encadrant (sélecteur, points faibles, coût IA), signalement — sur l'archi du CRM (RSC + Server Actions + RLS), rapide et sobre en tokens.

**Architecture:** Branche `feature/formation-catalogue` (on continue, rien n'est mergé). Migrations `0116` (secrets du catalogue en tables admin), `0117` (sessions/threads/messages/scores/reports/ai_calls), `0118` (agrégats par trigger + RPC). `lib/ai/` = seul point de contact avec l'API Anthropic (serveur). Features `training-session`, `training-me`, `training-overview` (+ retouches `training-catalog`, `training-modules`), règles pures dans `@glagency/core/training`. Aucun Route Handler, streaming, websocket ni cron : révélation différée par `visible_at` + timers client, serveur autorité (chrono, élimination).

**Tech Stack:** Next.js 16 (App Router, RSC, typedRoutes), Supabase (Postgres, RLS, triggers `security definer`), `@anthropic-ai/sdk` (nouveau, `apps/web`), Zod v4, react-hook-form, shadcn/ui, Vitest (`apps/web`, `packages/core`).

**Spec:** `docs/superpowers/specs/2026-08-18-formation-entrainement-design.md`

## Global Constraints

- Migrations `packages/db/supabase/migrations/NNNN_slug.sql`, séquence contiguë après `0115` : **0116** secrets, **0117** sessions, **0118** agrégats. `text + check` (jamais d'enum), RLS wrappée `(select …)`, `create policy` simple, FK indexées sauf unique en tête, colonnes RLS indexées, triggers `security definer set search_path = public, pg_temp`. Appliquer avec `cd packages/db && supabase db push --db-url "$DB"` (dry-run avant/après), **UAT uniquement** (`DATABASE_URL_UAT`), URL extraite par `grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//'`, jamais `source .env`, jamais `link`, jamais `psql -f`. Régénérer `packages/db/src/types.ts` (`supabase gen types typescript --db-url "$DB" > packages/db/src/types.ts`) après chaque migration.
- Web : `docs/guidelines-standard-feature.md` — `page.tsx` = garde + kickoff sans await + `<Suspense>` ; `loading.tsx` par route ; Template RSC sans fetch ; services throw ; actions `runAction` + `noGuard` + vérif UNE fois en tête de handler (`requirePageProfile('frm-entrainement')` / `requireAdminProfile()`), `BusinessError` pour tout message français, `revalidatePath` ; forms RHF + Zod + `'use no memo'` ; `ActionButton` ; toasts `sonner`. Frontières ESLint `lib → features → app`, cross-feature interdit (partagé = `lib/`), pas de barrel, fichiers < 300 lignes.
- Impersonation : toute mutation refuse en « en tant que » (`readStateCookie()` → `BusinessError('Action indisponible en consultation (mode « en tant que »)')`).
- IA : `@anthropic-ai/sdk` côté serveur uniquement (`import 'server-only'`), modèles **`claude-haiku-4-5`** (fan, `max_tokens` 200 / boss 260, sans `thinking`, sans `temperature`) et **`claude-sonnet-5`** (notation, `output_config: { format: { type: 'json_schema', schema }, effort: 'low' }`, `thinking: { type: 'adaptive' }`, `max_tokens` 1 500), `maxRetries: 2`, `timeout: 20_000` ; toute réponse vérifiée (`stop_reason === 'refusal'` → repli), toute sortie structurée revalidée Zod ; chaque appel tracé dans `training_ai_calls` (service-role) ; clé `ANTHROPIC_API_KEY` (env web + Vercel, jamais côté client). Prompts = transposition fidèle de GLA (`serveur.py` : `formation_bot_system`, `formation_boss_bot_system`, `formation_score_system`, `formation_boss_score_system`, `to_messages_formation`) — texte FR reproduit dans les tasks.
- Sécurité : les secrets (`fan_brief`, `expected`, `scoring_notes`, champs cachés des fans) ne sont lus QUE côté serveur avec `createAdminClient()` dans `lib/ai/` et les actions ; jamais dans un payload RSC destiné à un chatter ; les scores et `training_ai_calls` s'écrivent en service-role (aucune policy d'écriture `authenticated`).
- Règles métier (spec §6) : médailles Or ≥ 85 / Argent ≥ 75 / Bronze ≥ 60 / sinon « À valider » ; points = Σ meilleurs totaux (hors boss) ; moyenne = moyenne des meilleurs (hors boss) ; boss débloqué si moyenne ≥ 60 ; streak = jours consécutifs Europe/Paris ; solo : chrono `SOLO_REACTION_S = 60` ; défi/boss : `reaction_max_s` du cas, révélation différée aléatoire 30-120 s (ouvertures 0/20/45/75/110 s) ; élimination `[[ELIM:code]]` (12 codes GLA) ou `timeout` ; boss `objective_reached` = note ≥ 60 ; plafond 65 si objectif non atteint.
- Design : DA du CRM, sobre, zéro couleur attitrée, pas de médaille dorée (texte/badge outline), pas de classe globale.
- Aucun commit sans accord de Benoit (les étapes « Commit » = demander) ; vérifs avant chaque commit : `pnpm --filter @glagency/web lint && typecheck && test`, `pnpm --filter @glagency/core test`, `pnpm --filter @glagency/db test`.

**Écarts / décisions tranchées dans ce plan (à confirmer à la revue) :**
1. `training_messages.session_id` dénormalisé (FK) pour une RLS à un niveau et un index direct.
2. Recalcul des `training_case_bests` **depuis les sessions** (max/count sur les sessions notées du couple profil/cas) plutôt qu'incrémental → une re-notation à la baisse est prise en compte.
3. Classement et roster Overview via RPC `security definer` (`training_ranking`, `training_overview_roster`) : la RLS de `profiles` (`profiles_self_admin_or_team_read`) ne laisse pas un chatter/manager lire tous les noms — la RPC ne renvoie que nom + agrégats.
4. Projection publique du catalogue promue en `lib/services/training-public.ts` (utilisée par `training-modules` ET `training-me`).
5. `startSession` (démarrer/reprendre une session) vit en **`lib/training/start-session.ts`** (`'use server'`, précédent : `lib/impersonation/actions.ts`) avec un bouton partagé `components/training/play-button.tsx` : il est déclenché depuis trois features (Modules « Jouer », session « Rejouer », Ma formation « Continuer ») et la frontière ESLint interdit le cross-feature. `CaseSnapshot` vit en `lib/types/training.ts` pour la même raison.

---

## Carte des fichiers

```
packages/db/supabase/migrations/0116_training_secrets.sql            (T1)
packages/db/supabase/migrations/0117_training_sessions.sql           (T3)
packages/db/supabase/migrations/0118_training_stats.sql              (T5)
packages/db/src/types.ts                                            (T1, T3, T5 — régénéré)
packages/db/scripts/gen-training-seed.mjs                            (T2 — note d'en-tête)

packages/core/src/training/rules.ts (+ rules.test.ts), src/index.ts  (T6)  médailles, boss, progression module, trophées

apps/web/src/lib/types/training.ts                                  (T4)  élargi (+ CaseSnapshot)
apps/web/src/lib/ai/client.ts, prompts.ts (+ .test.ts), schema.ts (+ .test.ts), fan.ts, score.ts, log.ts   (T4)
apps/web/src/lib/services/training-engine.ts, training-scoring.ts   (T7)  contexte fan (secrets), notation
apps/web/src/lib/training/start-session.ts                          (T7)  'use server' partagé (démarrer / reprendre)
apps/web/src/components/training/play-button.tsx                    (T8)  bouton partagé
apps/web/src/lib/services/training-public.ts, lib/types/training-public.ts   (T10) promotion de get-modules/get-module (+ getAllCases)

apps/web/src/features/training-catalog/{types,schema,actions,actions-cases,actions-cases-helpers}.ts, services/get-catalog.ts   (T2)

apps/web/src/features/training-session/
  types.ts, schema.ts (+ .test.ts), actions.ts, actions-lifecycle.ts, services/get-session.ts   (T7)
  SessionTemplate.tsx, components/{session-view,session-header,thread-tabs,thread-panel,message-list,composer,media-price-popover,session-skeleton}.tsx, use-now.ts, use-scoring.ts   (T8)
  components/{result-view,score-panel,thread-result,transcript-view,message-bubble,failed-view,result-actions,report-dialog}.tsx   (T9)
apps/web/src/app/(dash)/formation/session/[id]/{page,loading}.tsx   (T8)

apps/web/src/features/training-modules/components/cases-list.tsx, ModuleTemplate.tsx, services/get-my-bests.ts   (T8 « Jouer », T10 médailles)
apps/web/src/app/(dash)/formation/modules/{page,[code]/page}.tsx    (T8 canPlay, T10 imports lib + bests)

apps/web/src/features/training-me/{types.ts, services/get-me.ts, MeTemplate.tsx, components/*}   (T10)
apps/web/src/app/(dash)/formation/ma-formation/{page,loading}.tsx    (T10 — remplace le placeholder)

apps/web/src/features/training-overview/{types,schema,actions}.ts, services/{get-overview,get-chatter}.ts, OverviewTemplate.tsx, components/*   (T11)
apps/web/src/app/(dash)/formation/overview/{page,loading}.tsx        (T11 — remplace le placeholder)

CLAUDE.md, specs (statut), apps/web/.env.example, docs/guidelines-standard-feature.md   (T12)
```

---

### Task 1: Migration `0116_training_secrets.sql` — secrets du catalogue en tables admin

**Files:**
- Create: `packages/db/supabase/migrations/0116_training_secrets.sql`
- Modify: `packages/db/src/types.ts` (régénéré)

**Interfaces:**
- Produces: tables `training_case_secrets (case_id pk, fan_brief, expected)`, `training_module_secrets (module_id pk, scoring_notes)`, `training_boss_fan_secrets (fan_id pk, budget_cap, nego_threshold, nego_where, meet_when, meet_where, derails)` — RLS admin seul ; colonnes sources supprimées ; nouveau check `training_cases_solo_fields` (`kind='solo' ⇔ fan_name not null`).

- [ ] **Step 1: Écrire la migration**

```sql
-- 0116 — Secrets du catalogue de formation en tables ADMIN SEUL (revue finale du Catalogue,
-- 2026-08-18). La RLS 0113 est par ligne : tout membre ayant le droit de face `formation`
-- pouvait lire fan_brief / expected / scoring_notes / champs cachés des fans via PostgREST.
-- On DÉPLACE ces colonnes dans trois tables miroirs lisibles/écrites par les admins seulement ;
-- le moteur IA (lib/ai, serveur) les lit avec le client service-role. Données recopiées puis
-- colonnes sources supprimées (la 0115 — seed — reste telle quelle : c'est cette migration qui
-- transporte ses données).

create table public.training_case_secrets (
  case_id   uuid primary key references public.training_cases(id) on delete cascade,
  fan_brief text,   -- consigne du fan pour l'IA (solo) — jamais montrée au chatter
  expected  text    -- « ce qui était attendu » (solo) — révélé APRÈS la notation
);
create table public.training_module_secrets (
  module_id     uuid primary key references public.training_modules(id) on delete cascade,
  scoring_notes text  -- consigne de notation transmise à l'IA
);
create table public.training_boss_fan_secrets (
  fan_id         uuid primary key references public.training_case_boss_fans(id) on delete cascade,
  budget_cap     integer check (budget_cap >= 0),
  nego_threshold integer check (nego_threshold >= 0),
  nego_where     text,
  meet_when      text,
  meet_where     text,
  derails        text
);

-- Copie des données (0113 + seed 0115).
insert into public.training_case_secrets (case_id, fan_brief, expected)
select id, fan_brief, expected from public.training_cases
where fan_brief is not null or expected is not null;
insert into public.training_module_secrets (module_id, scoring_notes)
select id, scoring_notes from public.training_modules where scoring_notes is not null;
insert into public.training_boss_fan_secrets (fan_id, budget_cap, nego_threshold, nego_where, meet_when, meet_where, derails)
select id, budget_cap, nego_threshold, nego_where, meet_when, meet_where, derails
from public.training_case_boss_fans;

-- Colonnes sources : le check solo référençait fan_brief/expected → recréé sur fan_name seul
-- (fan_brief/expected restent obligatoires pour un solo CÔTÉ ACTION, cf. Zod caseForm).
alter table public.training_cases drop constraint training_cases_solo_fields;
alter table public.training_cases drop column fan_brief, drop column expected;
alter table public.training_cases add constraint training_cases_solo_fields
  check ((kind = 'solo') = (fan_name is not null));
alter table public.training_modules drop column scoring_notes;
alter table public.training_case_boss_fans
  drop column budget_cap, drop column nego_threshold, drop column nego_where,
  drop column meet_when, drop column meet_where, drop column derails;

alter table public.training_case_secrets enable row level security;
alter table public.training_module_secrets enable row level security;
alter table public.training_boss_fan_secrets enable row level security;

create policy training_case_secrets_admin on public.training_case_secrets for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy training_module_secrets_admin on public.training_module_secrets for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy training_boss_fan_secrets_admin on public.training_boss_fan_secrets for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
```

- [ ] **Step 2: Push UAT + contrôle**

```bash
DB="$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')"
(cd packages/db && supabase db push --db-url "$DB" --dry-run && supabase db push --db-url "$DB" && supabase db push --db-url "$DB" --dry-run)
psql "$DB" -c "select (select count(*) from training_case_secrets) cs, (select count(*) from training_module_secrets) ms, (select count(*) from training_boss_fan_secrets) fs, (select count(*) from training_case_secrets where fan_brief is not null) briefs;"
psql "$DB" -c "select column_name from information_schema.columns where table_name='training_cases' and column_name in ('fan_brief','expected');"
```
Attendu : `79 | 6 | 5 | 79` (79 solos avec brief/attendu ; 6 modules avec consigne — le boss n'en a pas ; 5 fans) ; aucune colonne restante.

- [ ] **Step 3: Régénérer les types** — `supabase gen types typescript --db-url "$DB" > packages/db/src/types.ts` ; `pnpm --filter @glagency/db typecheck`. **`pnpm --filter @glagency/web typecheck` échouera** (le catalogue lit encore `fan_brief`…) — attendu, corrigé en Task 2 ; ne pas commiter avant que Task 2 rende le typecheck vert (les deux tasks forment un commit chacune, mais Task 1 se commite avec typecheck **db** vert seulement — le noter dans le message).

- [ ] **Step 4: Commit** (demander) — `feat(db): 0116 secrets du catalogue de formation en tables admin (fan_brief, expected, scoring_notes, fans du boss)`

---

### Task 2: Catalogue adapté aux secrets (types, service, actions, dialog) + note du générateur

**Files:**
- Modify: `apps/web/src/features/training-catalog/types.ts` (aucun changement de forme : `fanBrief`, `expected`, `scoringNotes`, champs cachés restent dans le modèle ADMIN)
- Modify: `apps/web/src/features/training-catalog/services/get-catalog.ts`
- Modify: `apps/web/src/features/training-catalog/actions.ts` (`saveModule` → upsert secrets)
- Modify: `apps/web/src/features/training-catalog/actions-cases.ts` (`saveCase`, `duplicateCase`)
- Modify: `apps/web/src/features/training-catalog/actions-cases-helpers.ts` (`insertChildren` → fans + secrets)
- Modify: `packages/db/scripts/gen-training-seed.mjs` (commentaire d'en-tête)

**Interfaces:**
- Consumes: tables secrets (Task 1). Produces: le même `CatalogData` qu'avant (les dialogs ne changent pas).

- [ ] **Step 1: `get-catalog.ts` — embeds secrets (admin)**

Remplacer les deux `select` :
```ts
    supabase
      .from('training_modules')
      .select('*, training_module_axes(*), training_module_sections(*), training_module_secrets(scoring_notes)')
      .order('position'),
    // `!case_id` : deux FK de arena_slots vers training_cases (PGRST201). Les secrets (RLS admin)
    // sont joints ici — le Catalogue est admin ; la face lecture (training-modules) ne les touche pas.
    supabase
      .from('training_cases')
      .select('*, training_case_messages(*), training_case_arena_slots!case_id(*), training_case_boss_fans(*, training_boss_fan_secrets(*)), training_case_secrets(fan_brief, expected)')
      .order('position'),
```
Types locaux : `ModuleRow` gagne `training_module_secrets: { scoring_notes: string | null } | null` ; `CaseRow` gagne `training_case_secrets: { fan_brief: string | null; expected: string | null } | null` et `training_case_boss_fans: (T['training_case_boss_fans']['Row'] & { training_boss_fan_secrets: T['training_boss_fan_secrets']['Row'] | null })[]`. Mappings : `scoringNotes: m.training_module_secrets?.scoring_notes ?? null` ; `fanBrief: c.training_case_secrets?.fan_brief ?? null`, `expected: c.training_case_secrets?.expected ?? null` ; fans : `budgetCap: f.training_boss_fan_secrets?.budget_cap ?? null` (idem `negoThreshold`, `negoWhere`, `meetWhen`, `meetWhere`, `derails`). Un embed 1-1 par pk est typé objet ou tableau selon la génération : si TS voit un tableau, prendre `[0]`.

- [ ] **Step 2: `actions.ts` — `saveModule` écrit `training_module_secrets`**

Dans `saveModule`, retirer `scoring_notes` de `row` (la colonne n'existe plus) et, après l'insert/update du module (avant `syncAxes`), upsert :
```ts
      const { error: sErr } = await supabase
        .from('training_module_secrets')
        .upsert({ module_id: moduleId, scoring_notes: d.scoringNotes }, { onConflict: 'module_id' })
      if (sErr) throw new Error(sErr.message)
```
(RLS admin : le client session d'un admin passe.)

- [ ] **Step 3: `actions-cases.ts` — `saveCase` / `duplicateCase`**

`saveCase` : retirer `fan_brief`/`expected` de `row` ; après avoir obtenu `caseId` (création ou édition), écrire les secrets :
```ts
      // Secrets (table admin) : solo → brief + attendu obligatoires (Zod) ; autres sortes → ligne supprimée.
      if (solo) {
        const { error: secErr } = await supabase
          .from('training_case_secrets')
          .upsert({ case_id: caseId, fan_brief: d.fanBrief, expected: d.expected }, { onConflict: 'case_id' })
        if (secErr) throw new Error(secErr.message)
      } else {
        const { error: secErr } = await supabase.from('training_case_secrets').delete().eq('case_id', caseId)
        if (secErr) throw new Error(secErr.message)
      }
```
`duplicateCase` : le `select` source devient `'*, training_case_messages(*), training_case_arena_slots!case_id(*), training_case_boss_fans(*, training_boss_fan_secrets(*)), training_case_secrets(fan_brief, expected)'` ; retirer `fan_name`? NON — `fan_name` reste sur `training_cases` ; retirer `fan_brief`/`expected` de l'insert ; après création : si `src.training_case_secrets` non nul → insert `training_case_secrets` pour la copie ; pour les fans du boss : insérer les fans **avec `.select('id, code')`**, puis insérer `training_boss_fan_secrets` en associant par `code` (les codes sont uniques dans le cas) : `{ fan_id: created.id, ...secretsOf(code) }`.

- [ ] **Step 4: `actions-cases-helpers.ts` — `insertChildren` (boss)**

Les 6 champs cachés sortent de l'insert `training_case_boss_fans` ; l'insert devient `.insert(rows).select('id, code')` ; puis :
```ts
    const bySlug = new Map(d.fans.map((f, i) => [rows[i].code, f]))
    const secrets = (created ?? []).map((row) => {
      const f = bySlug.get(row.code)!
      return { fan_id: row.id, budget_cap: f.budgetCap, nego_threshold: f.negoThreshold, nego_where: f.negoWhere, meet_when: f.meetWhen, meet_where: f.meetWhere, derails: f.derails }
    })
    const { error: sErr } = await supabase.from('training_boss_fan_secrets').insert(secrets)
    if (sErr) throw new Error(sErr.message)
```

- [ ] **Step 5: Générateur** — en tête de `gen-training-seed.mjs`, ajouter : `// NOTE : génère la migration 0115 pour le SCHÉMA 0113 (colonnes fan_brief/expected/scoring_notes/champs cachés dans les tables principales). Depuis 0116 ces colonnes vivent dans training_*_secrets : ne pas rejouer ce script sur un schéma ≥ 0116 (il resterait à adapter — YAGNI tant que le contenu GLA n'est pas ré-importé).` — pas de changement de code (le test de régénération byte-identique de la 0115 reste vrai).

- [ ] **Step 6: Vérifier** — `pnpm --filter @glagency/web typecheck && lint && test` (17+ tests) ; `pnpm --filter @glagency/db test`. Manuel UAT : Catalogue → éditer un solo (consigne + attendu visibles et sauvés), un boss (champs cachés), dupliquer un solo et le boss ; « en tant que » chatter → `/formation/modules/setting` : aucun `fan_brief` dans le payload (déjà garanti par la projection).

- [ ] **Step 7: Commit** (demander) — `feat(formation): catalogue — secrets en tables admin (service, actions, duplication)`

---

### Task 3: Migration `0117_training_sessions.sql` — sessions, threads, messages, scores, signalements, appels IA

**Files:**
- Create: `packages/db/supabase/migrations/0117_training_sessions.sql`
- Modify: `packages/db/src/types.ts` (régénéré)

**Interfaces:**
- Produces: tables `training_sessions`, `training_threads`, `training_messages`, `training_thread_scores`, `training_thread_axis_scores`, `training_reports`, `training_ai_calls` — colonnes de la spec §3.2 (+ `training_messages.session_id`, `training_threads.lost_reason`, `training_sessions.status` ∈ active/scored/failed/abandoned).

- [ ] **Step 1: Écrire la migration**

```sql
-- 0117 — Entraînement : sessions (un cas joué), threads (1 solo / 5 défi / 5 boss), messages,
-- notation par thread + par axe, signalements, traçabilité des appels IA.
-- Spec : docs/superpowers/specs/2026-08-18-formation-entrainement-design.md §3.2, §3.4.
-- RLS : le chatter voit/écrit SES sessions ; encadrants (has_page('frm-suivi'), admin inclus) lisent tout
-- (Overview non cloisonné, décidé 2026-08-18) ; scores et ai_calls s'écrivent en service-role
-- depuis les Server Actions (aucune policy d'écriture authenticated). `session_id` est
-- dénormalisé sur training_messages : RLS à un niveau + index direct (table la plus lue).

create table public.training_sessions (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  case_id           uuid not null references public.training_cases(id) on delete restrict,
  module_id         uuid not null references public.training_modules(id) on delete restrict,
  kind              text not null check (kind in ('solo', 'arena', 'boss')),
  status            text not null default 'active' check (status in ('active', 'scored', 'failed', 'abandoned')),
  -- PARTIE VISIBLE du cas au moment joué : { code, title, phase, difficulty, context, objective,
  -- objectiveLabel, targetLine, maxTurns, reactionMaxS, isSale, moduleTitle } — jamais de secret.
  case_snapshot     jsonb not null,
  total             smallint check (total between 0 and 100),
  objective_reached boolean,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  scored_at         timestamptz
);
create index training_sessions_profile_started_idx on public.training_sessions (profile_id, started_at desc);
create index training_sessions_case_idx on public.training_sessions (case_id);
create index training_sessions_module_idx on public.training_sessions (module_id);
create index training_sessions_scored_idx on public.training_sessions (scored_at desc) where status = 'scored';
-- une seule session ACTIVE par chatter
create unique index training_sessions_one_active_idx on public.training_sessions (profile_id) where status = 'active';

create table public.training_threads (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.training_sessions(id) on delete cascade,
  position     smallint not null,
  ref_case_id  uuid references public.training_cases(id) on delete restrict,        -- défi : le solo rejoué
  boss_fan_id  uuid references public.training_case_boss_fans(id) on delete restrict, -- boss : le fan
  fan_name     text not null check (length(fan_name) between 1 and 30),
  status       text not null default 'open' check (status in ('open', 'done', 'lost')),
  lost_reason  text check (lost_reason is null or lost_reason ~ '^(timeout|[a-z_]{2,20})$'),
  turns_used   smallint not null default 0 check (turns_used >= 0),
  max_turns    smallint not null check (max_turns between 1 and 50),
  next_due_at  timestamptz,   -- chrono : le chatter doit répondre avant (null = pas de chrono en cours)
  unique (session_id, position)
);
create index training_threads_ref_case_idx on public.training_threads (ref_case_id);
create index training_threads_boss_fan_idx on public.training_threads (boss_fan_id);

create table public.training_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.training_sessions(id) on delete cascade,
  thread_id   uuid not null references public.training_threads(id) on delete cascade,
  position    smallint not null,
  speaker     text not null check (speaker in ('chatter', 'fan')),
  body        text not null check (length(body) between 1 and 1000),
  media_price integer check (media_price is null or media_price between 1 and 10000),
  visible_at  timestamptz not null default now(),   -- révélation différée (défi/boss)
  created_at  timestamptz not null default now(),
  unique (thread_id, position)
);
create index training_messages_session_idx on public.training_messages (session_id);

create table public.training_thread_scores (
  thread_id         uuid primary key references public.training_threads(id) on delete cascade,
  total             smallint not null check (total between 0 and 100),
  objective_reached boolean not null,
  capped            boolean not null default false,
  comment           text not null,
  moments           jsonb not null default '[]'::jsonb,
  scored_at         timestamptz not null default now()
);
create table public.training_thread_axis_scores (
  thread_id uuid not null references public.training_threads(id) on delete cascade,
  axis_key  text not null,
  axis_name text not null,
  score     smallint not null check (score between 0 and 100),   -- 0-25 pour les axes de module, 0-100 pour les étapes du boss
  primary key (thread_id, axis_key)
);

create table public.training_reports (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.training_sessions(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  message     text not null check (length(message) between 1 and 2000),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);
create index training_reports_session_idx on public.training_reports (session_id);
create index training_reports_profile_idx on public.training_reports (profile_id);
create index training_reports_resolved_by_idx on public.training_reports (resolved_by);
create index training_reports_open_idx on public.training_reports (created_at desc) where resolved_at is null;

create table public.training_ai_calls (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.training_sessions(id) on delete cascade,
  thread_id         uuid references public.training_threads(id) on delete set null,
  kind              text not null check (kind in ('fan', 'score')),
  model             text not null,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  cache_read_tokens integer not null default 0,
  latency_ms        integer not null default 0,
  ok                boolean not null default true,
  created_at        timestamptz not null default now()
);
create index training_ai_calls_session_idx on public.training_ai_calls (session_id);
create index training_ai_calls_thread_idx on public.training_ai_calls (thread_id);
create index training_ai_calls_created_idx on public.training_ai_calls (created_at desc);

alter table public.training_sessions enable row level security;
alter table public.training_threads enable row level security;
alter table public.training_messages enable row level security;
alter table public.training_thread_scores enable row level security;
alter table public.training_thread_axis_scores enable row level security;
alter table public.training_reports enable row level security;
alter table public.training_ai_calls enable row level security;

-- Sessions : propriétaire, encadrant, admin lisent ; propriétaire écrit ; admin peut mettre à jour (rescore).
-- « Encadrant » = has_page('frm-suivi') (droit Overview de la face Formation, admin inclus) — PAS is_manager()
-- (rôle manager seul) : un sous-manager ou un policier à qui on donne Suivi doit lire les sessions (spec §7).
create policy training_sessions_read on public.training_sessions for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')));
create policy training_sessions_insert on public.training_sessions for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy training_sessions_update on public.training_sessions for update to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()))
  with check (profile_id = (select auth.uid()) or (select public.is_admin()));

-- Threads : héritent de la session (exists — même patron que police_report_lines, 0071).
create policy training_threads_read on public.training_threads for select to authenticated
  using (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')))));
create policy training_threads_write on public.training_threads for all to authenticated
  using (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.is_admin()))));

-- Messages : session_id dénormalisé → un seul niveau.
create policy training_messages_read on public.training_messages for select to authenticated
  using (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')))));
create policy training_messages_write on public.training_messages for all to authenticated
  using (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.is_admin()))));

-- Scores : lecture via thread → session ; AUCUNE écriture authenticated (service-role depuis scoreSession).
create policy training_thread_scores_read on public.training_thread_scores for select to authenticated
  using (exists (select 1 from public.training_threads t join public.training_sessions s on s.id = t.session_id
                 where t.id = thread_id
                 and (s.profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')))));
create policy training_thread_axis_scores_read on public.training_thread_axis_scores for select to authenticated
  using (exists (select 1 from public.training_threads t join public.training_sessions s on s.id = t.session_id
                 where t.id = thread_id
                 and (s.profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')))));

-- Signalements : auteur + encadrants lisent ; auteur crée ; encadrant/admin résout.
create policy training_reports_read on public.training_reports for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')));
create policy training_reports_insert on public.training_reports for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy training_reports_update on public.training_reports for update to authenticated
  using ((select public.has_page('frm-suivi')))
  with check ((select public.has_page('frm-suivi')));

-- Appels IA : admin lit ; écriture service-role uniquement.
create policy training_ai_calls_admin_read on public.training_ai_calls for select to authenticated
  using ((select public.is_admin()));
```

- [ ] **Step 2: Push UAT (dry-run avant/après) + `psql "$DB" -c "select count(*) from pg_policies where tablename like 'training_%';"`** — attendu : 14 (0113) + 3 (0116) + 14 (0117) = **31**.

- [ ] **Step 3: Régénérer `types.ts`** ; `pnpm --filter @glagency/db typecheck && pnpm --filter @glagency/web typecheck`.

- [ ] **Step 4: Commit** (demander) — `feat(db): 0117 sessions d'entraînement — threads, messages, scores, signalements, appels IA (RLS)`

---

### Task 4: `lib/types/training.ts` (élargi) + `lib/ai/` (client, prompts, schéma de notation, fan, score, log) + tests

**Files:**
- Modify: `apps/web/src/lib/types/training.ts`
- Create: `apps/web/src/lib/ai/client.ts`, `apps/web/src/lib/ai/prompts.ts`, `apps/web/src/lib/ai/prompts.test.ts`, `apps/web/src/lib/ai/schema.ts`, `apps/web/src/lib/ai/schema.test.ts`, `apps/web/src/lib/ai/fan.ts`, `apps/web/src/lib/ai/score.ts`, `apps/web/src/lib/ai/log.ts`
- Modify: `apps/web/package.json` (deps `@anthropic-ai/sdk`, `server-only`), `.env.example` (`ANTHROPIC_API_KEY`), `apps/web/.env.local` (à faire par Benoit — clé déjà à la racine)

**Interfaces:**
- Produces (types) : `SESSION_STATUSES`/`SessionStatus`, `THREAD_STATUSES`/`ThreadStatus`, `MESSAGE_SPEAKERS`/`MessageSpeaker`, `SOLO_REACTION_S = 60`, `ARENA_REVEAL_MIN_S = 30`, `ARENA_REVEAL_MAX_S = 120`, `ARENA_OPENING_OFFSETS_S = [0, 20, 45, 75, 110]`, `FAULT_CODES`/`FaultCode`, `FAULT_LABELS` (12 codes + `timeout`), `MEDAL_LABELS`, `CaseSnapshot`.
- Produces (ai) : `FAN_MODEL`, `SCORE_MODEL`, `anthropic()` ; `fanSystemPrompt(ctx)`, `bossFanSystemPrompt(ctx)`, `scoreSystemPrompt(ctx)`, `bossScoreSystemPrompt(ctx)`, `toFanMessages(history)`, `formatTranscript(history)`, `stripElim(text)`, `mediaLabel(price)` ; `buildScoreJsonSchema(axes)`, `buildScoreZod(axes)`, `BOSS_STEPS`, `bossScoreJsonSchema`, `bossScoreZod` ; `replyAsFan(opts): Promise<FanReply>` ; `scoreThread(opts): Promise<ScoreResult>` ; `logAiCall(admin, entry)`.

- [ ] **Step 1: Dépendances**

```bash
pnpm --filter @glagency/web add @anthropic-ai/sdk server-only
grep -n "ANTHROPIC_API_KEY" .env.example || echo 'ANTHROPIC_API_KEY=' >> .env.example
```
(Benoit ajoute `ANTHROPIC_API_KEY` à `apps/web/.env.local` et à Vercel — la valeur existe déjà dans `.env` racine.)

- [ ] **Step 2: `lib/types/training.ts` — ajouter (garder l'existant)**

```ts
// ---------- Entraînement (incrément 2) ----------
export const SESSION_STATUSES = ['active', 'scored', 'failed', 'abandoned'] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]
export const THREAD_STATUSES = ['open', 'done', 'lost'] as const
export type ThreadStatus = (typeof THREAD_STATUSES)[number]
export const MESSAGE_SPEAKERS = ['chatter', 'fan'] as const
export type MessageSpeaker = (typeof MESSAGE_SPEAKERS)[number]

/** Chrono de réponse en SOLO (GLA TRAIN_LIMIT_MS = 60 s) ; défi/boss = reaction_max_s du cas. */
export const SOLO_REACTION_S = 60
/** Défi/boss : la réponse du fan est révélée entre 30 et 120 s après l'envoi (GLA), ouvertures échelonnées. */
export const ARENA_REVEAL_MIN_S = 30
export const ARENA_REVEAL_MAX_S = 120
export const ARENA_OPENING_OFFSETS_S = [0, 20, 45, 75, 110] as const

/** Codes de faute grave émis par le fan (`[[ELIM:code]]`, GLA) → thread perdu. */
export const FAULT_CODES = ['interro', 'froid', 'brutal', 'saut', 'spam', 'gratuit', 'remise_prev', 'abandon', 'renc_date', 'force_stop', 'brushoff', 'revente'] as const
export type FaultCode = (typeof FAULT_CODES)[number]
export const isFaultCode = (s: string): s is FaultCode => (FAULT_CODES as readonly string[]).includes(s)
/** Libellés GLA (BOSS_FAULTS + timeout) — affichés sur l'écran « Raté » et sur un thread perdu. */
export const FAULT_LABELS: Record<FaultCode | 'timeout', { title: string; text: string }> = {
  timeout: { title: 'Trop lent', text: 'Tu as dépassé le temps pour répondre. Un fan qu’on fait attendre part voir ailleurs — la réactivité fait partie du métier.' },
  interro: { title: 'Interrogatoire', text: 'Tu as posé plusieurs questions d’affilée façon flic. Le KYC se noie dans la conversation, une info à la fois.' },
  froid: { title: 'Vente à froid', text: 'Tu as sorti le média (ou le sexting) sans l’avoir chauffé. À froid, le fan se braque.' },
  brutal: { title: 'Virage brutal', text: 'Passage au chaud sec / robotique, sans rebondir sur ce qu’il venait de dire.' },
  saut: { title: 'Palier sauté', text: 'Tu as balancé un gros prix d’un coup sans faire monter les paliers.' },
  spam: { title: 'Spam de ventes', text: 'Tu as enchaîné plusieurs médias payants sans le réchauffer entre.' },
  gratuit: { title: 'Gratuit offert', text: 'Tu as donné un média gratuitement sur demande. On ne brade jamais le contenu.' },
  remise_prev: { title: 'Remise préventive', text: 'Tu as baissé ton prix avant même qu’il objecte. Tu casses ta valeur tout seul.' },
  abandon: { title: 'Abandon', text: 'Tu as laissé mourir la conv sur son refus. On relance, on date, on ne lâche pas.' },
  renc_date: { title: 'Rencontre ratée', text: 'Tu as fixé une vraie date, refusé sec ou tué l’espoir. On conditionne, on fait rêver, jamais fixer.' },
  force_stop: { title: 'Forcé après le stop', text: 'Il avait dit qu’il avait fini / plus de budget et tu as re-poussé un média au lieu de passer au relationnel.' },
  brushoff: { title: 'Lâché après la vente', text: 'Tu l’as expédié juste après l’avoir fait payer. Le relationnel post-vente, c’est là que tout se joue.' },
  revente: { title: 'Revente au lieu de rassurer', text: 'Juste après un gros achat, tu es reparti vendre au lieu de le rassurer.' },
}

/** Libellés des médailles (la règle vit dans @glagency/core : medalFor). */
export const MEDAL_LABELS = { or: 'Or', argent: 'Argent', bronze: 'Bronze' } as const

/** Snapshot VISIBLE du cas au moment joué (jsonb `training_sessions.case_snapshot`) — jamais de secret. */
export interface CaseSnapshot {
  code: string; title: string; phase: string; difficulty: number
  context: string; objective: string; objectiveLabel: string; targetLine: string | null
  maxTurns: number; reactionMaxS: number | null; isSale: boolean
  moduleTitle: string; moduleCode: string
}
```

- [ ] **Step 3: Tests (échouent : modules absents)**

`apps/web/src/lib/ai/prompts.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { bossFanSystemPrompt, fanSystemPrompt, formatTranscript, mediaLabel, stripElim, toFanMessages } from './prompts'

describe('toFanMessages (GLA to_messages_formation)', () => {
  it('fan = assistant, chatter = user, tours consécutifs fusionnés, média formaté', () => {
    const msgs = toFanMessages([
      { speaker: 'fan', body: 'cc', mediaPrice: null },
      { speaker: 'fan', body: 'tu fais quoi', mediaPrice: null },
      { speaker: 'chatter', body: 'salut toi', mediaPrice: null },
      { speaker: 'chatter', body: '', mediaPrice: 6 },
    ])
    expect(msgs).toEqual([
      { role: 'user', content: '(début de la conversation)' },
      { role: 'assistant', content: 'cc\ntu fais quoi' },
      { role: 'user', content: 'salut toi\n[MEDIA VERROUILLE - 6€]' },
    ])
  })
  it('un historique vide donne un seul tour user', () => {
    expect(toFanMessages([])).toEqual([{ role: 'user', content: '(début de la conversation)' }])
  })
  it('un historique commençant par le chatter ne reçoit pas de préfixe', () => {
    expect(toFanMessages([{ speaker: 'chatter', body: 'hey', mediaPrice: null }])).toEqual([{ role: 'user', content: 'hey' }])
  })
})

describe('stripElim', () => {
  it('extrait et retire le token de faute', () => {
    expect(stripElim('nan laisse tomber 😒 [[ELIM:froid]]')).toEqual({ text: 'nan laisse tomber 😒', faultCode: 'froid' })
    expect(stripElim('[[ELIM:INTERRO]]')).toEqual({ text: '😒', faultCode: 'interro' })
    expect(stripElim('ça va et toi')).toEqual({ text: 'ça va et toi', faultCode: null })
    expect(stripElim('ok [[ELIM:inconnu]]')).toEqual({ text: 'ok', faultCode: null })
  })
})

describe('prompts', () => {
  it('fan solo : prénom, consigne, section MÉDIAS seulement si vente', () => {
    const p = fanSystemPrompt({ fanName: 'Tony', fanBrief: 'Tu es méfiant.', isSale: true })
    expect(p).toContain("Tu t'appelles Tony")
    expect(p).toContain('Tu es méfiant.')
    expect(p).toContain('MÉDIAS PAYANTS')
    expect(fanSystemPrompt({ fanName: null, fanBrief: 'x', isSale: false })).not.toContain('MÉDIAS PAYANTS')
  })
  it('boss : paliers ≤ plafond', () => {
    const p = bossFanSystemPrompt({ name: 'Kevin', age: 34, job: 'plombier', city: 'Lyon', persona: 'méfiant', derails: 'd', budgetCap: 60, negoWhere: 'nw', meetWhere: 'rw' })
    expect(p).toContain('6€ puis 30€ puis 60€')
    expect(p).not.toContain('150€')
    expect(p).toContain('TON PLAFOND DE DÉPENSE est 60€')
  })
  it('formatTranscript', () => {
    expect(formatTranscript([{ speaker: 'chatter', body: 'hey', mediaPrice: null }, { speaker: 'chatter', body: '', mediaPrice: 30 }, { speaker: 'fan', body: 'ok', mediaPrice: null }]))
      .toBe('Créatrice: hey\nCréatrice: [MEDIA VERROUILLE - 30€]\nFan: ok')
    expect(mediaLabel(6)).toBe('[MEDIA VERROUILLE - 6€]')
  })
})
```

`apps/web/src/lib/ai/schema.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { BOSS_STEPS, bossScoreJsonSchema, bossScoreZod, buildScoreJsonSchema, buildScoreZod } from './schema'

const axes = [{ key: 'naturel', name: 'Naturel', description: 'd1' }, { key: 'lecture', name: 'Lecture', description: 'd2' }]

describe('schéma de notation (module)', () => {
  it('JSON schema : un entier par axe + total, objectif_atteint, moments, commentaire ; strict', () => {
    const s = buildScoreJsonSchema(axes)
    expect(Object.keys(s.properties)).toEqual(['naturel', 'lecture', 'total', 'objectif_atteint', 'plafond', 'moments', 'commentaire'])
    expect(s.required).toEqual(['naturel', 'lecture', 'total', 'objectif_atteint', 'moments', 'commentaire'])
    expect(s.additionalProperties).toBe(false)
  })
  it('Zod : bornes 0-25 par axe, moments ≤ 3, type good|bad', () => {
    const z = buildScoreZod(axes)
    const ok = { naturel: 20, lecture: 15, total: 35, objectif_atteint: true, moments: [{ cite: 'x', type: 'bad', probleme: 'p', indice: 'i' }], commentaire: 'c' }
    expect(z.safeParse(ok).success).toBe(true)
    expect(z.safeParse({ ...ok, naturel: 26 }).success).toBe(false)
    expect(z.safeParse({ ...ok, moments: [ok.moments[0], ok.moments[0], ok.moments[0], ok.moments[0]] }).success).toBe(false)
    expect(z.safeParse({ ...ok, moments: [{ ...ok.moments[0], type: 'meh' }] }).success).toBe(false)
  })
})

describe('schéma de notation (boss)', () => {
  it('6 étapes nullables + note + commentaire', () => {
    expect(BOSS_STEPS.map((s) => s.key)).toEqual(['setting', 'transition', 'sexting', 'rencontre', 'nego', 'relationnel'])
    expect(bossScoreJsonSchema.required).toEqual([...BOSS_STEPS.map((s) => s.key), 'note', 'commentaire'])
    expect(bossScoreZod.safeParse({ setting: 70, transition: null, sexting: null, rencontre: null, nego: null, relationnel: null, note: 70, commentaire: 'c' }).success).toBe(true)
    expect(bossScoreZod.safeParse({ setting: 101, transition: null, sexting: null, rencontre: null, nego: null, relationnel: null, note: 70, commentaire: 'c' }).success).toBe(false)
  })
})
```
Run: `pnpm --filter @glagency/web test` → FAIL (modules absents).

- [ ] **Step 4: `lib/ai/client.ts`**

```ts
import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Client Anthropic — SERVEUR uniquement (`server-only` : un import côté client casse au build).
 * `ANTHROPIC_API_KEY` lue par le SDK depuis l'env. Modèles figés ici : fan = Haiku 4.5 (réponses
 * courtes, ~0,03 $ la session solo), notation = Sonnet 5 (jugement, un appel structuré).
 * Coût/latence tracés par appel dans training_ai_calls (lib/ai/log.ts).
 */
export const FAN_MODEL = 'claude-haiku-4-5'
export const SCORE_MODEL = 'claude-sonnet-5'

let client: Anthropic | null = null
export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 2, timeout: 20_000 })
  return client
}
```

- [ ] **Step 5: `lib/ai/prompts.ts`** — transposition fidèle de GLA (accents restaurés, sens inchangé)

```ts
import type Anthropic from '@anthropic-ai/sdk'
import { isFaultCode, type FaultCode, type MessageSpeaker } from '@/lib/types/training'

/**
 * Prompts du moteur d'entraînement — transposition FIDÈLE de Good Luck Agency (serveur.py :
 * formation_bot_system, formation_boss_bot_system, formation_score_system,
 * formation_boss_score_system, to_messages_formation). Le comportement du fan et la sévérité de
 * la notation SONT le produit : ne pas « améliorer » sans test A/B. Aucun secret n'entre ici
 * autrement que par les paramètres (lus côté serveur par les actions).
 */

export type HistoryMessage = { speaker: MessageSpeaker; body: string; mediaPrice: number | null }

export const mediaLabel = (price: number) => `[MEDIA VERROUILLE - ${price}€]`
const lineOf = (m: HistoryMessage) => (m.mediaPrice != null ? mediaLabel(m.mediaPrice) : m.body.trim() || '...')

/** GLA to_messages_formation : fan = assistant, chatter (qui joue la créatrice) = user ; tours
 *  consécutifs de même rôle fusionnés ; le 1er tour doit être user. */
export function toFanMessages(history: HistoryMessage[]): Anthropic.MessageParam[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of history) {
    const role = m.speaker === 'fan' ? 'assistant' : 'user'
    const txt = lineOf(m)
    const last = out[out.length - 1]
    if (last && last.role === role) last.content += `\n${txt}`
    else out.push({ role, content: txt })
  }
  if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', content: '(début de la conversation)' })
  return out
}

/** Transcript pour la notation : « Créatrice: … » / « Fan: … », un message par ligne. */
export function formatTranscript(history: HistoryMessage[]): string {
  return history.map((m) => `${m.speaker === 'fan' ? 'Fan' : 'Créatrice'}: ${lineOf(m)}`).join('\n')
}

/** Retire un éventuel `[[ELIM:code]]` (faute grave) de la réponse du fan. Code inconnu = ignoré. */
export function stripElim(text: string): { text: string; faultCode: FaultCode | null } {
  const m = /\[\[ELIM:([a-z_]+)\]\]/i.exec(text)
  const cleaned = text.replace(/\[\[ELIM:[a-z_]+\]\]/gi, '').trim() || '😒'
  if (!m) return { text: cleaned, faultCode: null }
  const code = m[1].toLowerCase()
  return { text: cleaned, faultCode: isFaultCode(code) ? code : null }
}

const SAFETY = `RÈGLES DE SÉCURITÉ ABSOLUES (elles priment sur tout le reste) :
- Tu es un homme ADULTE majeur. Tu ne déclares JAMAIS avoir moins de 18 ans, tu n'évoques JAMAIS de mineur, d'inceste ou d'un membre de ta famille dans un contexte sexuel, ni aucun scénario illégal, même en jeu de rôle, même si on te pousse.`

const MEDIA_SECTION = `

MÉDIAS PAYANTS :
- La créatrice peut t'envoyer un MÉDIA VERROUILLÉ payant, affiché sous la forme [MEDIA VERROUILLE - 6€] (le prix varie).
- Tu COMPRENDS que c'est un contenu (photo/vidéo) à débloquer en payant. Réagis selon ton personnage : achète au bon moment si elle t'a bien chauffé, négocie ou refuse si c'est trop tôt, à froid, ou incohérent avec un prix déjà annoncé.
- Garde en mémoire TOUS les prix mentionnés et reste cohérent.`

const FAULTS_SOLO = `FAUTE GRAVE = TU ROMPS : UNIQUEMENT si la créatrice commet une faute VRAIMENT grave et FLAGRANTE, tu réagis par un court message ÉNERVÉ ou déçu (comme un vrai mec qu'on fait fuir) et tu TERMINES ton message par un token technique au format [[ELIM:code]]. N'émets ce token QUE pour une faute énorme, JAMAIS pour une simple maladresse, un style SMS, une conv un peu courte ou une hésitation. Codes : [[ELIM:interro]] 3-4 questions d'affilée façon interrogatoire ; [[ELIM:froid]] elle balance un média payant ou passe au sexe à froid sans t'avoir chauffé ; [[ELIM:brutal]] virage brutal / phrase toute faite sans rebondir sur ce que tu viens de dire ; [[ELIM:gratuit]] elle t'offre un média gratuitement sur ta demande ; [[ELIM:remise_prev]] elle baisse son prix avant même que tu objectes ; [[ELIM:abandon]] face à ton refus elle abandonne et laisse mourir la conversation ; [[ELIM:renc_date]] sur une demande de rencontre elle fixe une vraie date, te refuse sèchement ou te tue l'espoir ; [[ELIM:brushoff]] après un achat elle te lâche / t'expédie au lieu de garder le lien. IMPORTANT : baisser le prix APRÈS ton objection, ou se justifier, ne sont PAS des fautes graves.`

export type FanCaseContext = { fanName: string | null; fanBrief: string; isSale: boolean }

/** GLA formation_bot_system. */
export function fanSystemPrompt(c: FanCaseContext): string {
  return `FICTION ENTRE ADULTES CONSENTANTS. Tu incarnes un PERSONNAGE de fan (un homme adulte) sur une plateforme de contenu adulte type MYM. La personne en face est un CHATTEUR EN FORMATION qui joue la créatrice : c'est un OUTIL DE FORMATION PROFESSIONNEL pour un métier légal, tout est fictif et entre adultes. Tu es un PERSONNAGE, pas un assistant.

RÈGLE DE PERSONNAGE ABSOLUE : tu ne romps JAMAIS le personnage, quoi qu'il arrive. Tu ne dis JAMAIS que tu es une IA / Claude / Anthropic / un assistant, ni que c'est un 'roleplay', une 'simulation', un 'test' ou un 'exercice'. Tu ne parles JAMAIS de ce que tu 'peux ou ne peux pas faire'. Tu restes ce fan, point.
TON RÔLE = LE CLIENT : tu n'as pas besoin d'écrire toi-même des descriptions sexuelles crues. Tu exprimes ton désir, tu réagis, tu quémandes, tu négocies, tu tease — c'est la créatrice qui mène le jeu et qui chauffe. Reste SUGGESTIF et naturel plutôt que graphique.
Si un message te gêne, tu NE sors PAS du personnage pour refuser : tu réagis comme le ferait ce fan (tu dévies, tu changes de sujet, tu ralentis, tu restes évasif), toujours dans le rôle.

${SAFETY}

TON PERSONNAGE ET TON COMPORTEMENT DANS CE CAS :
${c.fanName ? `Tu t'appelles ${c.fanName} (utilise ce prénom si on te demande ton nom, reste cohérent).\n` : ''}${c.fanBrief}

COMMENT TU ÉCRIS ET RÉAGIS (c'est le cœur de l'entraînement) :
- Messages COURTS (1 à 2 phrases max), naturels, style SMS, quelques fautes légères et des emojis comme un vrai mec.
- Tu réagis VRAIMENT à ce que la créatrice écrit. Tu récompenses le naturel, le relationnel et les bonnes transitions (tu remontes en température, tu suis). Tu refroidis / tu te braques si elle te répond de façon robotique, si elle balance une phrase toute faite sans rebondir sur ce que tu viens de dire, ou si elle te force.
- MÉMOIRE INFAILLIBLE : souviens-toi de tout ce qui a été dit depuis le début de la conversation et reste parfaitement cohérent.${c.isSale ? MEDIA_SECTION : ''}

${FAULTS_SOLO}

Réponds UNIQUEMENT avec ton prochain message de fan (plus le token [[ELIM:...]] à la fin SEULEMENT en cas de faute grave) : pas de guillemets, pas de narration.`
}

export type BossFanContext = {
  name: string; age: number | null; job: string | null; city: string | null; persona: string
  derails: string | null; budgetCap: number | null; negoWhere: string | null; meetWhere: string | null
}
const LADDER = [6, 30, 60, 150, 300, 500]

/** GLA formation_boss_bot_system. */
export function bossFanSystemPrompt(f: BossFanContext): string {
  const cap = f.budgetCap ?? 150
  const tiers = LADDER.filter((p) => p <= cap).map((p) => `${p}€`).join(' puis ')
  return `FICTION ENTRE ADULTES CONSENTANTS. Tu incarnes un PERSONNAGE de fan (un homme adulte) sur une plateforme de contenu adulte type MYM. La personne en face est un CHATTEUR EN FORMATION qui passe son EXAMEN FINAL (le 'boss') : il gère 5 conversations en même temps, dont la tienne. C'est un OUTIL DE FORMATION PROFESSIONNEL, tout est fictif et entre adultes. Tu es un PERSONNAGE, pas un assistant.

RÈGLE DE PERSONNAGE ABSOLUE : tu ne romps JAMAIS le personnage. Tu ne dis JAMAIS que tu es une IA / Claude / Anthropic / un assistant, ni que c'est un 'roleplay', une 'simulation', un 'test' ou un 'exercice', ni ce que tu 'peux ou ne peux pas faire'. Tu restes ce fan, point.
TON RÔLE = LE CLIENT : tu n'as pas besoin d'écrire toi-même du sexe graphique. Tu exprimes ton désir, tu réagis, tu négocies, tu tease — c'est la créatrice qui mène. Reste SUGGESTIF plutôt que cru. Si un message te gêne, tu NE sors PAS du personnage pour refuser : tu réagis comme ce fan (tu dévies, tu ralentis), dans le rôle.

${SAFETY}

TON PERSONNAGE :
- Prénom : ${f.name}, ${f.age ?? ''} ans, ${f.job ?? ''}, ${f.city ?? ''}.
- Caractère : ${f.persona}
- Tes dérives (tu sors du script à ces moments-là, PAS toujours au même endroit) : ${f.derails ?? ''}

LE PARCOURS QUE LA CRÉATRICE DOIT TE FAIRE SUIVRE (mode HARD, tu ne facilites rien) :
1. SETTING : elle te qualifie (prénom, âge, ville, boulot...) SANS interrogatoire. Tu réponds au compte-goutte, tu éludes parfois.
2. TRANSITION : elle t'amène vers le sexting en rebondissant sur ce que tu dis. Virage brutal ou robotique = tu refroidis.
3. SEXTING + PUSHS PAYANTS : elle te chauffe et te vend des médias verrouillés, palier par palier : ${tiers}. Tu achètes UNIQUEMENT si elle t'a bien chauffé et amène le prix proprement. TON PLAFOND DE DÉPENSE est ${cap}€ : tu n'achètes JAMAIS au-delà.
4. NÉGOCIATION : tu résistes / tu négocies surtout ${f.negoWhere ?? ''}. Tu ne lâches pas l'argent facilement à ce palier.
5. DEMANDE DE RENCONTRE : à un moment tu demandes à la voir en vrai — ${f.meetWhere ?? ''}. Elle doit te faire rêver et conditionner, jamais fixer une vraie date.
6. QUAND TU ATTEINS TON PLAFOND (${cap}€) : tu STOPPES les achats de toi-même et tu le dis clairement (ex : 'bon là j'ai plus rien pour aujourd'hui 😅' ou 'voilà je me suis bien fait plaisir'). Ensuite tu veux du RELATIONNEL (qu'elle crée du lien, s'intéresse à toi). Tu ne rachètes plus rien ce soir.

FAUTES GRAVES = TU LE PERDS (très important) :
Si la créatrice commet une de ces fautes FLAGRANTES, réagis par un message ÉNERVÉ ou déçu (comme un vrai mec qu'on fait fuir) et TERMINE ton message par un token technique, exactement au format [[ELIM:code]]. N'émets ce token QUE si la faute est nette ; dans le doute, contente-toi de refroidir SANS token. Codes :
- [[ELIM:interro]] : 3-4 questions d'affilée façon interrogatoire.
- [[ELIM:froid]] : elle balance un média payant (ou passe au sexting) à froid, sans t'avoir chauffé.
- [[ELIM:brutal]] : virage sexuel brutal/robotique sans rebondir sur ce que tu viens de dire.
- [[ELIM:saut]] : elle saute des paliers / te balance un gros prix d'un coup sans progression.
- [[ELIM:spam]] : elle enchaîne plusieurs médias payants sans te réchauffer entre.
- [[ELIM:gratuit]] : en négociation, elle t'offre un média gratuitement sur ta demande.
- [[ELIM:remise_prev]] : elle baisse son prix AVANT même que tu objectes (remise préventive).
- [[ELIM:abandon]] : face à ton objection/refus, elle abandonne et laisse mourir la conversation ('ok tant pis à plus').
- [[ELIM:renc_date]] : sur ta demande de rencontre, elle fixe une vraie date/lieu, OU te refuse sèchement, OU te tue l'espoir ('jamais', 'dans une semaine').
- [[ELIM:force_stop]] : tu as déjà dit que tu avais fini / plus de budget, et elle tente quand même de te revendre un média.
- [[ELIM:brushoff]] : après les ventes, elle te lâche / t'expédie trop vite ('bon je te laisse, on se voit demain') au lieu de créer du lien.
- [[ELIM:revente]] : juste après un gros achat, au lieu de te rassurer, elle repart directement sur une autre offre.
IMPORTANT : baisser le prix APRÈS ton objection n'est PAS une faute. Se justifier ('ça me prend du temps') n'est PAS éliminatoire.

MÉDIAS PAYANTS : un média verrouillé s'affiche [MEDIA VERROUILLE - 30€] (le prix varie). Tu comprends que c'est un contenu à débloquer en payant. Garde en mémoire tous les prix et reste cohérent.

COMMENT TU ÉCRIS : messages COURTS (1-2 phrases), style SMS, quelques fautes légères, des emojis comme un vrai mec. Réagis VRAIMENT à ce qu'elle écrit. Mémoire infaillible sur toute la conversation.

Réponds UNIQUEMENT avec ton prochain message de fan (plus le token [[ELIM:...]] à la fin SEULEMENT en cas de faute grave). Pas de guillemets, pas de narration.`
}

export type ScoreAxis = { key: string; name: string; description: string }
export type ScoreCaseContext = {
  scoringNotes: string | null; context: string; objective: string; targetLine: string | null; expected: string | null; axes: ScoreAxis[]
}

/** GLA formation_score_system — la sortie est contrainte par le schéma structuré (lib/ai/schema.ts). */
export function scoreSystemPrompt(c: ScoreCaseContext): string {
  const intro = c.scoringNotes || 'Tu es un formateur expert en chat de vente adulte (type MYM). Tu évalues un CHATTEUR EN FORMATION.'
  const axesTxt = c.axes.map((a) => `- ${a.key} : ${a.description}`).join('\n')
  return `${intro}

CONTEXTE DU CAS :
- Situation : ${c.context}
- Objectif du chatteur : ${c.objective}
- Repère / réponse attendue : ${c.targetLine ?? ''}
- Ce qu'aurait fait un excellent chatteur (référence) : ${c.expected ?? ''}

Le langage cru ou explicite n'est PAS un défaut, c'est le métier. Juge le SENS et la TECHNIQUE, pas l'orthographe.

AXES À NOTER (chacun sur 25) :
${axesTxt}

NOTATION AU MÉRITE (chaque axe sur 25). Le maximum se GAGNE : on ne le donne que si le chatteur a VRAIMENT bien exécuté cet axe, pas juste parce qu'il n'a 'rien fait de mal'. Barème par axe :
- 22-25 : exécution excellente, au niveau de la référence 'attendu' ci-dessus.
- 17-21 : bien, mais une ou deux occasions manquées.
- 12-16 : correct mais plat, mécanique, basique.
- 6-11 : faible, il passe à côté de cet axe.
- 0-5 : il fait l'inverse de la consigne (casse la conv, ignore le fan, force, reste passif).
COMPTE LES OCCASIONS MANQUÉES, pas seulement les fautes : un axe où il n'a rien fait de mal MAIS n'a pas saisi ce qu'un excellent aurait fait (réutiliser une info, relancer, chauffer, closer, rebondir) plafonne vers 15-18, pas 25.
BANDES GLOBALES à viser : 90-100 = passage exemplaire (rare) ; 78-89 = bon ; 65-77 = correct mais sans relief ; moins de 50 = objectif raté ou fautes réelles. Un passage juste 'correct' doit tomber autour de 70, PAS 90.
Tu évalues UNIQUEMENT les messages du chatteur (qui joue la créatrice), jamais ceux du fan. Le style SMS, les fautes d'orthographe, un ton direct ou cru, les emojis, une conversation courte : ce ne sont PAS des fautes (retire 1 point AU MAXIMUM, et seulement si c'est vraiment illisible). La sévérité porte sur la TECHNIQUE, pas sur l'écriture.
En cas de doute sur un axe, reste EXIGEANT : n'accorde pas le maximum par défaut.

OBJECTIF : détermine si l'objectif concret du cas est RÉELLEMENT atteint (pas juste 'l'esprit'). S'il N'EST PAS atteint, renseigne "plafond": 65 (la note globale ne pourra pas dépasser 65 même si les axes semblent propres).

SOIS SYNTHÉTIQUE ET RAPIDE : phrases courtes, va à l'essentiel, ne délaye pas. Chaque champ texte doit rester bref.
DÉBRIEF = REPRISE DE LA CONVERSATION (le cœur du retour). Tu reprends le fil et tu pointes 2 à 3 MOMENTS PRÉCIS (jamais plus de 3), chacun sur un message DIFFÉRENT du chatteur, en priorité là où il a perdu des points. Pour chaque moment : cite MOT POUR MOT ce qu'il a écrit, dis en une phrase ce qui ne va pas, puis donne un INDICE — une PISTE, le levier ou le principe à activer (ex : 'rebondis sur ce qu'il vient de confier', 'chauffe avant de vendre', 'tiens ton prix sans te justifier'). NE DONNE JAMAIS le message tout fait ni une phrase à copier-coller : il doit trouver la formulation LUI-MÊME. NE RÉPÈTE JAMAIS deux fois le même reproche. Si le passage est très bon, mets moins de moments et souligne un bon coup.
VÉRIFIE LES FAITS AVANT CHAQUE REPROCHE (règle absolue) : relis mot pour mot les messages du chatteur AVANT de lui reprocher une omission. Ne lui reproche JAMAIS de ne pas avoir fait une chose qu'il a RÉELLEMENT faite. Exemple concret : s'il a écrit le prénom du fan (ex : 'ravie de faire ta connaissance Kevin'), il est INTERDIT de lui reprocher de ne pas avoir repris/réutilisé le prénom — il l'a fait. De même s'il a posé une question, rebondi sur une info, etc. Le champ "probleme" d'un moment doit être STRICTEMENT COHÉRENT avec le texte du champ "cite".

Renseigne le résultat selon le schéma fourni : un entier 0-25 par axe, "total" = la somme des axes (sur 100) en respectant tout plafond applicable, "objectif_atteint", "plafond" (65 si l'objectif n'est pas atteint, sinon omis), "moments" (2 à 3, chaque "cite" DOIT être un vrai extrait d'un message du chatteur (créatrice), jamais une invention ni un message du fan ; "type" = "bad" si ce moment coûte des points, "good" si c'est un bon coup ; "indice" = une PISTE pour corriger si bad, vide si good), "commentaire" (3 phrases MAXIMUM, concises : (1) ce qui a été bien joué, (2) LE point principal à corriger et pourquoi ça compte (effet sur le fan ou la vente) + la PISTE pour progresser (le principe, jamais le message tout fait), (3) une phrase d'encouragement. Ne recopie pas les moments).`
}

export type BossScoreContext = { name: string; persona: string; budgetCap: number | null; negoWhere: string | null; meetWhen: string | null }

/** GLA formation_boss_score_system. */
export function bossScoreSystemPrompt(f: BossScoreContext): string {
  return `Tu es un formateur expert en chat de vente adulte (type MYM). Tu évalues UNE des 5 conversations de l'examen final (boss) d'un CHATTEUR EN FORMATION qui jouait la créatrice face au fan '${f.name}'. Cette conversation a été menée EN PARALLÈLE de 4 autres, sous pression de temps : elle est donc hachée et souvent INACHEVÉE. NE PÉNALISE JAMAIS la brièveté ni le fait qu'elle soit incomplète.

Le fan '${f.name}' (${f.persona}) avait un plafond de dépense de ${f.budgetCap ?? 150}€, négociait surtout ${f.negoWhere ?? ''}, et demandait une rencontre ${f.meetWhen ?? ''}.

Note SÉPARÉMENT chacune des 6 étapes du tunnel, chacune sur 100, UNIQUEMENT si l'étape a eu lieu dans la conversation (sinon mets null) :
- setting : qualification noyée, pas d'interrogatoire, infos réutilisées.
- transition : passage vers le sexting en rebondissant, pas de virage sec.
- sexting : chauffe + amenée des médias payants au bon moment, prix assumés.
- rencontre : demande de rencontre conditionnée / faite rêver, jamais fixée ni refusée sèchement.
- nego : tenue de la valeur sur son palier (baisser APRÈS objection est toléré ; offrir gratuit ou remise préventive = grosse faute).
- relationnel : après les ventes, création d'un vrai lien, ne pas lâcher le fan.

NOTATION AU MÉRITE (chaque étape jouée sur 100) : le haut du barème se GAGNE. 90-100 = étape excellente (niveau pro) ; 78-89 = bonne ; 65-77 = correcte mais plate ; moins de 50 = ratée ou fautes. Compte les OCCASIONS MANQUÉES (pas seulement les fautes) : une étape où il n'a rien fait de mal mais n'a pas saisi ce qu'un excellent aurait fait plafonne vers 65-70. Un passage juste 'correct' doit tomber autour de 70, pas 90. Le langage cru / SMS n'est PAS un défaut (la sévérité porte sur la technique). Ne juge QUE les messages de la créatrice.

Renseigne le résultat selon le schéma fourni : mets null (pas 0) pour une étape qui n'a pas eu lieu ; "note" = moyenne des étapes NON-null, sur 100 ; "commentaire" = 3 à 5 phrases de débrief concret pour CETTE conv : ce qui était bien, les erreurs par étape, et une meilleure formulation entre guillemets si pertinent.`
}
```

- [ ] **Step 6: `lib/ai/schema.ts`**

```ts
import { z } from 'zod'
import type { ScoreAxis } from './prompts'

/**
 * Schéma de NOTATION structurée (output_config.format = json_schema) — généré depuis les axes du
 * module (un schéma par module, compilé/caché 24 h côté API). Les bornes numériques ne sont pas
 * exprimables en JSON schema structuré → revalidées par le Zod jumeau côté serveur.
 */
export function buildScoreJsonSchema(axes: ScoreAxis[]) {
  const properties: Record<string, unknown> = {}
  for (const a of axes) properties[a.key] = { type: 'integer', description: `${a.name} — ${a.description} (0 à 25)` }
  properties.total = { type: 'integer', description: 'Somme des axes, sur 100, plafond appliqué' }
  properties.objectif_atteint = { type: 'boolean' }
  properties.plafond = { type: 'integer', description: '65 si l’objectif n’est pas atteint' }
  properties.moments = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        cite: { type: 'string' }, type: { type: 'string', enum: ['good', 'bad'] }, probleme: { type: 'string' }, indice: { type: 'string' },
      },
      required: ['cite', 'type', 'probleme', 'indice'],
      additionalProperties: false,
    },
  }
  properties.commentaire = { type: 'string' }
  return {
    type: 'object' as const,
    properties,
    required: [...axes.map((a) => a.key), 'total', 'objectif_atteint', 'moments', 'commentaire'],
    additionalProperties: false as const,
  }
}

export const momentZod = z.object({
  cite: z.string().max(500),
  type: z.enum(['good', 'bad']),
  probleme: z.string().max(500),
  indice: z.string().max(500),
})
export type ScoreMoment = z.infer<typeof momentZod>

export function buildScoreZod(axes: ScoreAxis[]) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const a of axes) shape[a.key] = z.number().int().min(0).max(25)
  return z.object({
    ...shape,
    total: z.number().int().min(0).max(100),
    objectif_atteint: z.boolean(),
    plafond: z.number().int().min(0).max(100).optional(),
    moments: z.array(momentZod).max(3),
    commentaire: z.string().max(1500),
  })
}

export const BOSS_STEPS = [
  { key: 'setting', name: 'Setting' }, { key: 'transition', name: 'Transition' }, { key: 'sexting', name: 'Sexting' },
  { key: 'rencontre', name: 'Rencontre' }, { key: 'nego', name: 'Négociation' }, { key: 'relationnel', name: 'Relationnel' },
] as const
export const bossScoreJsonSchema = {
  type: 'object' as const,
  properties: {
    ...Object.fromEntries(BOSS_STEPS.map((s) => [s.key, { anyOf: [{ type: 'integer' }, { type: 'null' }], description: `${s.name} — 0 à 100, null si l’étape n’a pas eu lieu` }])),
    note: { type: 'integer', description: 'Moyenne des étapes non nulles, sur 100' },
    commentaire: { type: 'string' },
  },
  required: [...BOSS_STEPS.map((s) => s.key), 'note', 'commentaire'],
  additionalProperties: false as const,
}
export const bossScoreZod = z.object({
  ...Object.fromEntries(BOSS_STEPS.map((s) => [s.key, z.number().int().min(0).max(100).nullable()])),
  note: z.number().int().min(0).max(100),
  commentaire: z.string().max(2000),
})
```
(Le `Object.fromEntries` typé `Record<string, ZodTypeAny>` : si TS se plaint sur `bossScoreZod`, écrire les 6 clés à la main.)

- [ ] **Step 7: `lib/ai/fan.ts`**

```ts
import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import type { FaultCode } from '@/lib/types/training'
import { anthropic, FAN_MODEL } from './client'
import { stripElim, toFanMessages, type HistoryMessage } from './prompts'

export type AiUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number }
export type FanReply = { text: string; faultCode: FaultCode | null; ok: boolean; usage: AiUsage; latencyMs: number; model: string }

const usageOf = (m: Anthropic.Message): AiUsage => ({
  inputTokens: m.usage.input_tokens,
  outputTokens: m.usage.output_tokens,
  cacheReadTokens: m.usage.cache_read_input_tokens ?? 0,
})

/**
 * Le fan répond (Haiku 4.5, non streamé, ~1-2 s). Refus du modèle (`stop_reason: 'refusal'`,
 * possible sur du sexting) → réponse de repli « … » et ok=false : jamais de crash, l'entraînement
 * continue. Les erreurs réseau/API remontent (l'action les transforme en BusinessError).
 */
export async function replyAsFan(opts: { system: string; history: HistoryMessage[]; maxTokens: number }): Promise<FanReply> {
  const t0 = Date.now()
  const res = await anthropic().messages.create({
    model: FAN_MODEL,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: toFanMessages(opts.history),
  })
  const latencyMs = Date.now() - t0
  const usage = usageOf(res)
  if (res.stop_reason === 'refusal') return { text: '…', faultCode: null, ok: false, usage, latencyMs, model: res.model }
  const raw = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim()
  const { text, faultCode } = stripElim(raw)
  return { text: text.slice(0, 1000), faultCode, ok: true, usage, latencyMs, model: res.model }
}
```

- [ ] **Step 8: `lib/ai/score.ts`**

```ts
import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { anthropic, SCORE_MODEL } from './client'
import type { AiUsage } from './fan'
import type { ScoreAxis } from './prompts'
import { BOSS_STEPS, bossScoreJsonSchema, bossScoreZod, buildScoreJsonSchema, buildScoreZod, type ScoreMoment } from './schema'

export type AxisScore = { key: string; name: string; score: number }
export type ScoreResult = {
  total: number; objectiveReached: boolean; capped: boolean; comment: string; moments: ScoreMoment[]
  axes: AxisScore[]; usage: AiUsage; latencyMs: number; model: string
}

const OBJECTIVE_CAP = 65
const BOSS_PASS = 60

async function callStructured(system: string, transcript: string, schema: object) {
  const t0 = Date.now()
  const res = await anthropic().messages.create({
    model: SCORE_MODEL,
    max_tokens: 1500,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: `Transcription de la conversation :\n\n${transcript}` }],
  })
  const latencyMs = Date.now() - t0
  if (res.stop_reason === 'refusal') throw new Error('Notation refusée par le modèle')
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
  const usage: AiUsage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, cacheReadTokens: res.usage.cache_read_input_tokens ?? 0 }
  return { json: JSON.parse(text) as unknown, usage, latencyMs, model: res.model }
}

/**
 * Notation d'un thread SOLO/DÉFI (axes du module) — UN appel structuré. Le total est
 * DÉTERMINISTE côté serveur : somme des axes, plafonnée à 65 si l'objectif n'est pas atteint
 * (GLA « plafond ») — on ne fait pas confiance à l'arithmétique du modèle.
 */
export async function scoreThread(opts: { system: string; transcript: string; axes: ScoreAxis[] }): Promise<ScoreResult> {
  const { json, usage, latencyMs, model } = await callStructured(opts.system, opts.transcript, buildScoreJsonSchema(opts.axes))
  const parsed = buildScoreZod(opts.axes).parse(json)
  const axes = opts.axes.map((a) => ({ key: a.key, name: a.name, score: parsed[a.key] as number }))
  const sum = axes.reduce((n, a) => n + a.score, 0)
  const objectiveReached = parsed.objectif_atteint
  const cap = objectiveReached ? 100 : OBJECTIVE_CAP
  return {
    total: Math.min(sum, cap), objectiveReached, capped: !objectiveReached && sum > OBJECTIVE_CAP,
    comment: parsed.commentaire, moments: parsed.moments, axes, usage, latencyMs, model,
  }
}

/** Notation d'un fan du BOSS : 6 étapes /100 (null = non jouée), note = moyenne des étapes jouées ; réussi si ≥ 60. */
export async function scoreBossThread(opts: { system: string; transcript: string }): Promise<ScoreResult> {
  const { json, usage, latencyMs, model } = await callStructured(opts.system, opts.transcript, bossScoreJsonSchema)
  const parsed = bossScoreZod.parse(json)
  const axes = BOSS_STEPS.flatMap((s) => (parsed[s.key] == null ? [] : [{ key: s.key, name: s.name, score: parsed[s.key] as number }]))
  const total = axes.length ? Math.round(axes.reduce((n, a) => n + a.score, 0) / axes.length) : 0
  return { total, objectiveReached: total >= BOSS_PASS, capped: false, comment: parsed.commentaire, moments: [], axes, usage, latencyMs, model }
}
```

- [ ] **Step 9: `lib/ai/log.ts`**

```ts
import 'server-only'
import type { createAdminClient } from '@glagency/db'
import type { AiUsage } from './fan'

type Admin = ReturnType<typeof createAdminClient>
export type AiCallEntry = {
  sessionId: string; threadId: string | null; kind: 'fan' | 'score'; model: string
  usage: AiUsage; latencyMs: number; ok: boolean
}

/** Trace un appel IA (service-role — aucune policy d'écriture authenticated). Ne bloque jamais l'action : erreur avalée + console.error. */
export async function logAiCall(admin: Admin, e: AiCallEntry): Promise<void> {
  const { error } = await admin.from('training_ai_calls').insert({
    session_id: e.sessionId, thread_id: e.threadId, kind: e.kind, model: e.model,
    input_tokens: e.usage.inputTokens, output_tokens: e.usage.outputTokens, cache_read_tokens: e.usage.cacheReadTokens,
    latency_ms: e.latencyMs, ok: e.ok,
  })
  if (error) console.error('[training_ai_calls]', error.message)
}
```

- [ ] **Step 10: Vérifier** — `pnpm --filter @glagency/web test` (prompts + schema PASS) ; `typecheck` ; `lint`. Points TS possibles : le nom exact des types SDK (`Anthropic.Message`, `Anthropic.TextBlock`, `Anthropic.MessageParam` — vérifier dans `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts` si l'un manque) et l'acceptation de `output_config.format` par le typage (sinon `// @ts-expect-error` local documenté). **Smoke test réel** (Benoit ou avec sa clé, une fois) : un script `node` de 10 lignes hors repo appelant `replyAsFan` n'est pas possible depuis Next (`server-only`) → tester via la première session en UAT (Task 7).

- [ ] **Step 11: Commit** (demander) — `feat(web): moteur IA formation — client Anthropic, prompts GLA transposés, notation structurée, traçabilité`

---

### Task 5: Migration `0118_training_stats.sql` — agrégats (bests, stats), trigger de notation, RPC

**Files:**
- Create: `packages/db/supabase/migrations/0118_training_stats.sql`
- Modify: `packages/db/src/types.ts` (régénéré)

**Interfaces:**
- Produces: `training_case_bests`, `training_profile_stats` (maintenues par `training_refresh_stats()` via trigger sur `training_sessions`), RPC `training_axis_profile(p_profile uuid)`, `training_ai_cost(p_since timestamptz)`, `training_ranking()`, `training_overview_roster()`.

- [ ] **Step 1: Écrire la migration**

```sql
-- 0118 — Agrégats de progression PRÉ-CALCULÉS (perf : Ma formation / Overview / classement lisent
-- 1-2 lignes au lieu de rejouer les sessions comme GLA), maintenus par trigger à chaque notation ;
-- RPC de lecture (points faibles par axe, coût IA, classement, roster overview).
-- Règles (spec §6) : médailles/points/moyenne = SUR LES MEILLEURS totaux par cas, HORS boss ;
-- boss_best/boss_done à part (réussi = objectif atteint = note ≥ 60) ; streak = jours consécutifs
-- Europe/Paris avec ≥ 1 notation.

create table public.training_case_bests (
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  case_id        uuid not null references public.training_cases(id) on delete cascade,
  best_total     smallint not null check (best_total between 0 and 100),
  best_objective boolean not null default false,
  attempts       integer not null default 1 check (attempts >= 1),
  last_at        timestamptz not null,
  primary key (profile_id, case_id)
);
create index training_case_bests_case_idx on public.training_case_bests (case_id);

create table public.training_profile_stats (
  profile_id      uuid primary key references public.profiles(id) on delete cascade,
  cases_done      integer not null default 0,
  avg_total       numeric(5,2),
  points          integer not null default 0,
  boss_best       smallint,
  boss_done       boolean not null default false,
  active_days     integer not null default 0,
  streak_days     integer not null default 0,
  last_active_day date,
  last_session_at timestamptz,
  updated_at      timestamptz not null default now()
);

alter table public.training_case_bests enable row level security;
alter table public.training_profile_stats enable row level security;
-- Lecture : bests = propriétaire / encadrant / admin ; stats = tout membre Formation (classement =
-- agrégats, jamais de contenu). AUCUNE écriture authenticated : trigger security definer.
create policy training_case_bests_read on public.training_case_bests for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')));
create policy training_profile_stats_read on public.training_profile_stats for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));

-- Recalcul DEPUIS LES SESSIONS (pas incrémental) : une re-notation à la baisse est prise en compte.
create or replace function public.training_refresh_stats(p_profile uuid, p_case uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_day date := (p_at at time zone 'Europe/Paris')::date;
  v_last date;
  v_streak integer;
  v_active integer;
begin
  select kind into v_kind from training_cases where id = p_case;

  -- 1) meilleur résultat du couple (profil, cas) depuis les sessions notées
  insert into training_case_bests (profile_id, case_id, best_total, best_objective, attempts, last_at)
  select p_profile, p_case, max(total), bool_or(objective_reached), count(*), max(scored_at)
  from training_sessions
  where profile_id = p_profile and case_id = p_case and status = 'scored'
  on conflict (profile_id, case_id) do update
    set best_total = excluded.best_total, best_objective = excluded.best_objective,
        attempts = excluded.attempts, last_at = excluded.last_at;

  -- 2) stats du profil depuis ses bests (≤ ~90 lignes)
  select last_active_day, streak_days, active_days into v_last, v_streak, v_active
  from training_profile_stats where profile_id = p_profile;
  if v_last is null or v_last < v_day - 1 then v_streak := 1; v_active := coalesce(v_active, 0) + 1;
  elsif v_last = v_day - 1 then v_streak := coalesce(v_streak, 0) + 1; v_active := coalesce(v_active, 0) + 1;
  else v_streak := coalesce(v_streak, 1); v_active := coalesce(v_active, 1);   -- même jour
  end if;

  insert into training_profile_stats (profile_id, cases_done, avg_total, points, boss_best, boss_done,
                                      active_days, streak_days, last_active_day, last_session_at, updated_at)
  select p_profile,
         count(*) filter (where c.kind <> 'boss'),
         avg(b.best_total) filter (where c.kind <> 'boss'),
         coalesce(sum(b.best_total) filter (where c.kind <> 'boss'), 0),
         max(b.best_total) filter (where c.kind = 'boss'),
         coalesce(bool_or(b.best_objective) filter (where c.kind = 'boss'), false),
         v_active, v_streak, greatest(coalesce(v_last, v_day), v_day), p_at, now()
  from training_case_bests b join training_cases c on c.id = b.case_id
  where b.profile_id = p_profile
  on conflict (profile_id) do update
    set cases_done = excluded.cases_done, avg_total = excluded.avg_total, points = excluded.points,
        boss_best = excluded.boss_best, boss_done = excluded.boss_done,
        active_days = excluded.active_days, streak_days = excluded.streak_days,
        last_active_day = excluded.last_active_day, last_session_at = excluded.last_session_at, updated_at = now();
end;
$$;
revoke execute on function public.training_refresh_stats(uuid, uuid, timestamptz) from public, anon, authenticated;

create or replace function public.training_on_session_scored()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform training_refresh_stats(new.profile_id, new.case_id, coalesce(new.scored_at, now()));
  return null;
end;
$$;
drop trigger if exists trg_training_session_scored on public.training_sessions;
create trigger trg_training_session_scored
  after update of status, scored_at on public.training_sessions
  for each row
  when (new.status = 'scored' and (old.status is distinct from 'scored' or old.scored_at is distinct from new.scored_at))
  execute function public.training_on_session_scored();

-- RPC lecture. INVOKER : bornées par la RLS de l'appelant.
create or replace function public.training_axis_profile(p_profile uuid)
returns table (axis_key text, axis_name text, avg_score numeric, n integer)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select a.axis_key, a.axis_name, round(avg(a.score), 1), count(*)::integer
  from training_thread_axis_scores a
  join training_threads t on t.id = a.thread_id
  join training_sessions s on s.id = t.session_id
  where s.profile_id = p_profile and s.status = 'scored' and s.kind <> 'boss'
  group by a.axis_key, a.axis_name
  order by avg(a.score) asc;
$$;

create or replace function public.training_ai_cost(p_since timestamptz)
returns table (day date, model text, kind text, calls integer, input_tokens bigint, output_tokens bigint, cache_read_tokens bigint)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select (created_at at time zone 'Europe/Paris')::date, model, kind, count(*)::integer,
         sum(input_tokens), sum(output_tokens), sum(cache_read_tokens)
  from training_ai_calls
  where created_at >= p_since
  group by 1, 2, 3
  order by 1 desc, 2, 3;
$$;

-- DEFINER : la RLS de profiles (profiles_self_admin_or_team_read) ne laisse pas un chatter/manager
-- lire tous les noms ; ces deux RPC ne renvoient que nom + agrégats, jamais de contenu.
create or replace function public.training_ranking()
returns table (profile_id uuid, display_name text, points integer, cases_done integer, avg_total numeric, boss_done boolean, streak_days integer, is_new boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select s.profile_id, coalesce(p.display_name, p.email, '—'), s.points, s.cases_done, s.avg_total, s.boss_done, s.streak_days, coalesce(p.is_new, false)
  from training_profile_stats s
  join profiles p on p.id = s.profile_id
  where p.left_at is null
    and ((select public.is_admin()) or (select public.has_page('formation')))
  order by s.points desc, s.avg_total desc nulls last;
$$;

create or replace function public.training_overview_roster()
returns table (profile_id uuid, display_name text, is_new boolean, arrived_at date, models text[],
               cases_done integer, avg_total numeric, points integer, boss_best smallint, boss_done boolean,
               streak_days integer, last_session_at timestamptz, sessions_scored integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  select p.id, coalesce(p.display_name, p.email, '—'), coalesce(p.is_new, false), p.arrived_at,
         coalesce((select array_agg(c.name order by c.name) from profile_creators pc join creators c on c.id = pc.creator_id where pc.profile_id = p.id), '{}'),
         coalesce(s.cases_done, 0), s.avg_total, coalesce(s.points, 0), s.boss_best, coalesce(s.boss_done, false),
         coalesce(s.streak_days, 0), s.last_session_at,
         (select count(*)::integer from training_sessions ts where ts.profile_id = p.id and ts.status = 'scored')
  from profiles p
  left join training_profile_stats s on s.profile_id = p.id
  where p.left_at is null and p.role = 'chatteur' and 'frm-entrainement' = any(p.pages)
    and (select public.has_page('frm-suivi'))
  order by coalesce(p.is_new, false) desc, p.display_name;
$$;
```
(`arrived_at`, `is_new`, `pages`, `left_at`, `role`, `email`, `display_name` existent sur `profiles` — cf. `lib/auth` `getProfile` et migration 0101 ; `profile_creators`/`creators` : 0054.)

- [ ] **Step 2: Push UAT (dry-run avant/après) + tests SQL rapides**

```bash
psql "$DB" -c "select proname from pg_proc where proname like 'training_%' order by 1;"   # 6 fonctions
psql "$DB" -c "select tgname from pg_trigger where tgname = 'trg_training_session_scored';"
psql "$DB" -c "select count(*) from pg_policies where tablename like 'training_%';"          # 33
```

- [ ] **Step 3: Régénérer `types.ts`** ; `pnpm --filter @glagency/db typecheck && pnpm --filter @glagency/web typecheck`.

- [ ] **Step 4: Commit** (demander) — `feat(db): 0118 progression formation — bests, stats par profil (trigger), RPC axes / coût IA / classement / roster`

---

### Task 6: `@glagency/core/training` — règles pures (médailles, boss, progression par module, trophées)

**Files:**
- Create: `packages/core/src/training/rules.ts`, `packages/core/src/training/rules.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `MEDAL_OR = 85`, `MEDAL_ARGENT = 75`, `MEDAL_BRONZE = 60`, `BOSS_UNLOCK_AVG = 60`, `type Medal = 'or' | 'argent' | 'bronze'`, `medalFor(total: number | null): Medal | null`, `bossUnlocked(avgTotal: number | null): boolean`, `moduleProgress(cases: { id: string; kind: string }[], bests: Map<string, { bestTotal: number }>): { total: number; done: number; pct: number; avg: number | null; points: number }`, `TROPHIES` (8 définitions `{ key, label, description }`), `computeTrophies(input: TrophyInput): Trophy[]` avec `TrophyInput = { casesDone: number; streakDays: number; goldCount: number; modulesComplete: number; allDone: boolean; bossDone: boolean }` et `Trophy = { key; label; description; earned: boolean }`.

- [ ] **Step 1: Test (échoue)**

`packages/core/src/training/rules.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { bossUnlocked, computeTrophies, medalFor, moduleProgress, TROPHIES } from './rules'

describe('medalFor (GLA medalFor : Or ≥ 85, Argent ≥ 75, Bronze ≥ 60)', () => {
  it('seuils inclus', () => {
    expect(medalFor(100)).toBe('or'); expect(medalFor(85)).toBe('or'); expect(medalFor(84)).toBe('argent')
    expect(medalFor(75)).toBe('argent'); expect(medalFor(74)).toBe('bronze'); expect(medalFor(60)).toBe('bronze')
    expect(medalFor(59)).toBeNull(); expect(medalFor(null)).toBeNull()
  })
})

describe('bossUnlocked (moyenne ≥ 60)', () => {
  it('60 débloque, 59.9 non, null non', () => {
    expect(bossUnlocked(60)).toBe(true); expect(bossUnlocked(59.9)).toBe(false); expect(bossUnlocked(null)).toBe(false)
  })
})

describe('moduleProgress', () => {
  const cases = [{ id: 'a', kind: 'solo' }, { id: 'b', kind: 'solo' }, { id: 'c', kind: 'arena' }]
  it('compte les cas faits, % , moyenne et points depuis les meilleurs', () => {
    const bests = new Map([['a', { bestTotal: 80 }], ['c', { bestTotal: 60 }]])
    expect(moduleProgress(cases, bests)).toEqual({ total: 3, done: 2, pct: 67, avg: 70, points: 140 })
  })
  it('module vide / rien de fait', () => {
    expect(moduleProgress([], new Map())).toEqual({ total: 0, done: 0, pct: 0, avg: null, points: 0 })
    expect(moduleProgress(cases, new Map())).toEqual({ total: 3, done: 0, pct: 0, avg: null, points: 0 })
  })
})

describe('computeTrophies (jalons GLA)', () => {
  it('8 trophées, gagnés selon les seuils', () => {
    expect(TROPHIES).toHaveLength(8)
    const none = computeTrophies({ casesDone: 0, streakDays: 0, goldCount: 0, modulesComplete: 0, allDone: false, bossDone: false })
    expect(none.every((t) => !t.earned)).toBe(true)
    const some = computeTrophies({ casesDone: 3, streakDays: 3, goldCount: 5, modulesComplete: 1, allDone: false, bossDone: false })
    expect(some.filter((t) => t.earned).map((t) => t.key)).toEqual(['first_case', 'streak_3', 'gold_5', 'module_complete'])
    const all = computeTrophies({ casesDone: 85, streakDays: 7, goldCount: 15, modulesComplete: 6, allDone: true, bossDone: true })
    expect(all.every((t) => t.earned)).toBe(true)
  })
})
```
Run: `pnpm --filter @glagency/core test` → FAIL (module absent).

- [ ] **Step 2: `rules.ts`**

```ts
/**
 * Règles de la formation (transposées de Good Luck Agency) — PURES, testées, partagées par
 * apps/web (Ma formation, résultat, Overview). Les agrégats eux-mêmes (bests, stats) sont
 * calculés en base (0118) ; ici : ce qu'on en déduit pour l'affichage.
 */
export const MEDAL_OR = 85
export const MEDAL_ARGENT = 75
export const MEDAL_BRONZE = 60
export const BOSS_UNLOCK_AVG = 60

export type Medal = 'or' | 'argent' | 'bronze'

/** GLA medalFor : Or ≥ 85, Argent ≥ 75, Bronze ≥ 60, sinon « À valider » (null). */
export function medalFor(total: number | null | undefined): Medal | null {
  if (total == null) return null
  if (total >= MEDAL_OR) return 'or'
  if (total >= MEDAL_ARGENT) return 'argent'
  if (total >= MEDAL_BRONZE) return 'bronze'
  return null
}

/** Le boss final se débloque à 60/100 de moyenne sur les meilleurs totaux (hors boss). */
export const bossUnlocked = (avgTotal: number | null | undefined): boolean => avgTotal != null && avgTotal >= BOSS_UNLOCK_AVG

export type ModuleProgress = { total: number; done: number; pct: number; avg: number | null; points: number }

/** Progression d'un module depuis les meilleurs totaux par cas (GLA formation_progress : pct, avg, points = Σ). */
export function moduleProgress(cases: { id: string; kind: string }[], bests: Map<string, { bestTotal: number }>): ModuleProgress {
  const totals = cases.flatMap((c) => (bests.has(c.id) ? [bests.get(c.id)!.bestTotal] : []))
  const done = totals.length
  const points = totals.reduce((n, t) => n + t, 0)
  return {
    total: cases.length,
    done,
    pct: cases.length ? Math.round((done * 100) / cases.length) : 0,
    avg: done ? Math.round(points / done) : null,
    points,
  }
}

export type TrophyInput = { casesDone: number; streakDays: number; goldCount: number; modulesComplete: number; allDone: boolean; bossDone: boolean }
export type Trophy = { key: string; label: string; description: string; earned: boolean }

/** Jalons GLA (trophées), dans l'ordre d'affichage. */
export const TROPHIES: { key: string; label: string; description: string; test: (i: TrophyInput) => boolean }[] = [
  { key: 'first_case', label: 'Premier pas', description: 'Un premier cas validé', test: (i) => i.casesDone >= 1 },
  { key: 'streak_3', label: '3 jours d’affilée', description: 'Une notation 3 jours de suite', test: (i) => i.streakDays >= 3 },
  { key: 'streak_7', label: '7 jours d’affilée', description: 'Une notation 7 jours de suite', test: (i) => i.streakDays >= 7 },
  { key: 'gold_5', label: '5 Or', description: 'Cinq cas à 85 ou plus', test: (i) => i.goldCount >= 5 },
  { key: 'gold_15', label: '15 Or', description: 'Quinze cas à 85 ou plus', test: (i) => i.goldCount >= 15 },
  { key: 'module_complete', label: 'Module complet', description: 'Tous les cas d’un module validés', test: (i) => i.modulesComplete >= 1 },
  { key: 'all_done', label: 'Tout le catalogue', description: 'Tous les cas validés', test: (i) => i.allDone },
  { key: 'boss', label: 'Boss final', description: 'Le boss final réussi', test: (i) => i.bossDone },
]

export function computeTrophies(input: TrophyInput): Trophy[] {
  return TROPHIES.map(({ key, label, description, test }) => ({ key, label, description, earned: test(input) }))
}
```
`packages/core/src/index.ts` : ajouter
```ts
export { MEDAL_OR, MEDAL_ARGENT, MEDAL_BRONZE, BOSS_UNLOCK_AVG, medalFor, bossUnlocked, moduleProgress, TROPHIES, computeTrophies } from './training/rules'
export type { Medal, ModuleProgress, Trophy, TrophyInput } from './training/rules'
```

- [ ] **Step 3: Vérifier** — `pnpm --filter @glagency/core test` (183+ PASS) ; `pnpm --filter @glagency/core typecheck`.

- [ ] **Step 4: Commit** (demander) — `feat(core): règles de formation — médailles, déblocage boss, progression module, trophées`

---

### Task 7: Sessions — types, schémas, moteur (`lib/services/training-engine.ts`, `training-scoring.ts`), service de lecture, Server Actions

**Files:**
- Create: `apps/web/src/features/training-session/types.ts`, `schema.ts`, `schema.test.ts`
- Create: `apps/web/src/lib/services/training-engine.ts` (contextes du fan depuis les secrets, `server-only`)
- Create: `apps/web/src/lib/services/training-scoring.ts` (`scoreSessionById`, `server-only`)
- Create: `apps/web/src/features/training-session/services/get-session.ts`
- Create: `apps/web/src/lib/training/start-session.ts` (`'use server'` — `startSession`, partagé hors feature : appelé depuis Modules, la session et Ma formation ; précédent `lib/impersonation/actions.ts`)
- Create: `apps/web/src/features/training-session/actions.ts` (`sendMessage`), `actions-lifecycle.ts` (`endSession`, `abandonSession`, `scoreSession`, `timeoutThread`, `reportScore`)

**Interfaces:**
- Produces (types) : `SessionMessage`, `AxisScore`, `ThreadScore`, `BossFanPublic`, `SessionThread`, `SessionData`, `SendResult`.
- Produces (schema) : `composerFields`, `composerForm`, `sendInput`, `sessionIdInput`, `threadIdInput`, `reportInput`, `mediaPriceForm`.
- Produces (engine) : `buildFanSystem(admin, thread): Promise<string>`, `revealDelayMs(kind)`, `dueAtFrom(visibleAt, kind, reactionMaxS)`.
- Produces (scoring) : `scoreSessionById(sessionId, opts?: { force?: boolean }): Promise<{ total: number }>`.
- Produces (service) : `getSession(id): Promise<SessionData | null>` (RLS = viewer).
- Produces (actions) : `startSession(raw: { caseId }) → ActionResult<{ sessionId: string; resumed: boolean }>` (dans `lib/training/start-session.ts`), `sendMessage(raw) → ActionResult<SendResult>`, `endSession(raw)`, `abandonSession(raw)`, `scoreSession(raw) → ActionResult<{ total: number }>`, `timeoutThread(raw: { threadId }) → ActionResult<{ sessionStatus: string; sessionEnded: boolean }>`, `reportScore(raw)`.
- Consumes : Task 3-6 (`training_*` tables, `lib/ai/*`, `lib/types/training`, `@glagency/core` `medalFor`), `requirePageProfile`, `readStateCookie`, `createAdminClient`.

- [ ] **Step 1: `types.ts`**

```ts
import type { ScoreMoment } from '@/lib/ai/schema'
import type { CaseKind, CaseSnapshot, MessageSpeaker, SessionStatus, ThreadStatus } from '@/lib/types/training'

export interface SessionMessage {
  id: string; threadId: string; position: number; speaker: MessageSpeaker; body: string
  mediaPrice: number | null; visibleAt: string
}
export interface AxisScore { key: string; name: string; score: number }
export interface ThreadScore {
  total: number; objectiveReached: boolean; capped: boolean; comment: string; moments: ScoreMoment[]; axes: AxisScore[]
}
export interface BossFanPublic { name: string; age: number | null; job: string | null; city: string | null; color: string | null; persona: string }
export interface SessionThread {
  id: string; position: number; fanName: string; status: ThreadStatus; lostReason: string | null
  turnsUsed: number; maxTurns: number; nextDueAt: string | null; bossFan: BossFanPublic | null
  messages: SessionMessage[]; score: ThreadScore | null
}
export interface SessionData {
  id: string; profileId: string; kind: CaseKind; status: SessionStatus; caseId: string; moduleId: string
  snapshot: CaseSnapshot; total: number | null; objectiveReached: boolean | null
  startedAt: string; endedAt: string | null; threads: SessionThread[]
  /** « Ce qui était attendu » — révélé APRÈS notation (solo), sinon null. */
  expected: string | null
  /** Meilleur total précédent du chatter sur ce cas (record ?), null si première fois. */
  previousBest: number | null
  report: { id: string; resolvedAt: string | null } | null
  /** Horloge serveur (ISO) : les timers client se calent dessus (révélation, chrono). */
  serverNow: string
}
export interface SendResult {
  chatter: SessionMessage; fan: SessionMessage | null
  thread: { status: ThreadStatus; lostReason: string | null; turnsUsed: number; nextDueAt: string | null }
  sessionStatus: SessionStatus; sessionEnded: boolean; serverNow: string
}
```

- [ ] **Step 2: `schema.ts` + test**

```ts
import { z } from 'zod'

export const sessionIdInput = z.object({ sessionId: z.uuid() })
export const threadIdInput = z.object({ threadId: z.uuid() })
/** Champs du composer : un message texte OU un média verrouillé (prix en €). */
export const composerFields = z.object({
  body: z.string().trim().max(1000, '1000 caractères max'),
  // Pas de coerce ici : posé en nombre par le popover « Média » (mediaPriceForm coerce la saisie), envoyé en JSON.
  mediaPrice: z.number().int('Prix entier').min(1, 'Prix minimum 1 €').max(10000, 'Prix maximum 10 000 €').nullable(),
})
const textOrMedia = { check: (v: { body: string; mediaPrice: number | null }) => v.body.length > 0 || v.mediaPrice != null, opts: { message: 'Écris un message ou envoie un média', path: ['body'] } }
/** Formulaire client (RHF) — sans threadId. */
export const composerForm = composerFields.refine(textOrMedia.check, textOrMedia.opts)
export type ComposerInput = z.infer<typeof composerForm>
/** Entrée de la Server Action `sendMessage`. */
export const sendInput = composerFields.extend({ threadId: z.uuid() }).refine(textOrMedia.check, textOrMedia.opts)
export type SendInput = z.infer<typeof sendInput>
export const reportInput = z.object({
  sessionId: z.uuid(),
  message: z.string().trim().min(1, 'Explique ce qui te semble faux').max(2000, '2000 caractères max'),
})
export type ReportInput = z.infer<typeof reportInput>
export const mediaPriceForm = z.object({ price: z.coerce.number().int('Prix entier').min(1, 'Minimum 1 €').max(10000, 'Maximum 10 000 €') })
```
`schema.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { sendInput } from './schema'
const id = '11111111-1111-4111-8111-111111111111'
describe('sendInput', () => {
  it('texte OU média', () => {
    expect(sendInput.safeParse({ threadId: id, body: 'hey', mediaPrice: null }).success).toBe(true)
    expect(sendInput.safeParse({ threadId: id, body: '', mediaPrice: 30 }).success).toBe(true)
    expect(sendInput.safeParse({ threadId: id, body: '   ', mediaPrice: null }).success).toBe(false)
    expect(sendInput.safeParse({ threadId: id, body: 'x', mediaPrice: 0 }).success).toBe(false)
  })
})
```

- [ ] **Step 3: `lib/services/training-engine.ts`**

```ts
import 'server-only'
import type { createAdminClient } from '@glagency/db'
import { bossFanSystemPrompt, fanSystemPrompt } from '@/lib/ai/prompts'
import { ARENA_REVEAL_MAX_S, ARENA_REVEAL_MIN_S, SOLO_REACTION_S, type CaseKind } from '@/lib/types/training'

type Admin = ReturnType<typeof createAdminClient>
export type FanThreadRef = { kind: CaseKind; caseId: string; refCaseId: string | null; bossFanId: string | null; fanName: string; isSale: boolean }

/**
 * Prompt système du fan pour un thread — lit les SECRETS (tables admin) avec le client service-role,
 * côté serveur uniquement. Solo : consigne du cas ; défi : consigne du solo rejoué ; boss : fan riche.
 */
export async function buildFanSystem(admin: Admin, t: FanThreadRef): Promise<string> {
  if (t.kind === 'boss') {
    if (!t.bossFanId) throw new Error('thread boss sans fan')
    const { data, error } = await admin
      .from('training_case_boss_fans')
      .select('name, age, job, city, persona, training_boss_fan_secrets(budget_cap, nego_where, meet_where, derails)')
      .eq('id', t.bossFanId)
      .single()
    if (error) throw new Error(error.message)
    const s = Array.isArray(data.training_boss_fan_secrets) ? data.training_boss_fan_secrets[0] : data.training_boss_fan_secrets
    return bossFanSystemPrompt({
      name: data.name, age: data.age, job: data.job, city: data.city, persona: data.persona,
      derails: s?.derails ?? null, budgetCap: s?.budget_cap ?? null, negoWhere: s?.nego_where ?? null, meetWhere: s?.meet_where ?? null,
    })
  }
  const briefCaseId = t.kind === 'arena' ? t.refCaseId : t.caseId
  if (!briefCaseId) throw new Error('thread défi sans cas de référence')
  const { data, error } = await admin.from('training_case_secrets').select('fan_brief').eq('case_id', briefCaseId).maybeSingle()
  if (error) throw new Error(error.message)
  return fanSystemPrompt({ fanName: t.fanName, fanBrief: data?.fan_brief ?? '', isSale: t.isSale })
}

/** Délai de révélation de la réponse du fan : immédiat en solo, 30-120 s (aléatoire) en défi/boss (GLA). */
export function revealDelayMs(kind: CaseKind): number {
  if (kind === 'solo') return 0
  return (ARENA_REVEAL_MIN_S + Math.floor(Math.random() * (ARENA_REVEAL_MAX_S - ARENA_REVEAL_MIN_S + 1))) * 1000
}

/** Échéance du chrono : solo = 60 s après la révélation ; défi/boss = reaction_max_s du cas. */
export function dueAtFrom(visibleAt: Date, kind: CaseKind, reactionMaxS: number | null): Date {
  const s = kind === 'solo' ? SOLO_REACTION_S : (reactionMaxS ?? 120)
  return new Date(visibleAt.getTime() + s * 1000)
}
```

- [ ] **Step 4: `lib/services/training-scoring.ts`**

```ts
import 'server-only'
import { createAdminClient } from '@glagency/db'
import { logAiCall } from '@/lib/ai/log'
import { bossScoreSystemPrompt, formatTranscript, scoreSystemPrompt, type HistoryMessage } from '@/lib/ai/prompts'
import { scoreBossThread, scoreThread, type ScoreResult } from '@/lib/ai/score'
import { FAULT_LABELS, type CaseKind, type FaultCode } from '@/lib/types/training'

/**
 * Notation d'une session TERMINÉE : un appel structuré par thread `done` (les `lost` valent 0,
 * sans appel), scores + axes écrits en service-role, total = moyenne des threads, statut `scored`
 * (→ trigger 0118 : bests + stats). `force` (admin, rescore) : réécrit les scores d'une session
 * déjà notée (scored_at change → le trigger recalcule). Idempotent : upsert par thread — un
 * échec en cours peut se relancer.
 */
export async function scoreSessionById(sessionId: string, opts: { force?: boolean } = {}): Promise<{ total: number }> {
  const admin = createAdminClient()
  const { data: s, error } = await admin
    .from('training_sessions')
    .select('id, kind, status, case_id, module_id, ended_at, training_threads(id, position, status, lost_reason, ref_case_id, boss_fan_id, fan_name)')
    .eq('id', sessionId)
    .single()
  if (error) throw new Error(error.message)
  if (s.status !== 'active' && !(opts.force && s.status === 'scored')) throw new Error(`session non notable (statut ${s.status})`)
  if (!s.ended_at && !opts.force) throw new Error('session non terminée')
  const kind = s.kind as CaseKind

  const [{ data: msgs, error: mErr }, { data: mod, error: modErr }] = await Promise.all([
    admin.from('training_messages').select('thread_id, position, speaker, body, media_price').eq('session_id', sessionId).order('position'),
    admin.from('training_modules').select('id, training_module_axes(key, name, description, position), training_module_secrets(scoring_notes)').eq('id', s.module_id).single(),
  ])
  if (mErr) throw new Error(mErr.message)
  if (modErr) throw new Error(modErr.message)
  const axes = [...mod.training_module_axes].sort((a, b) => a.position - b.position).map((a) => ({ key: a.key, name: a.name, description: a.description }))
  const modSecrets = Array.isArray(mod.training_module_secrets) ? mod.training_module_secrets[0] : mod.training_module_secrets
  const scoringNotes = modSecrets?.scoring_notes ?? null

  // Contexte de notation par cas (solo : le cas ; défi : chaque solo rejoué), secrets compris.
  const caseIds = kind === 'arena' ? [...new Set(s.training_threads.map((t) => t.ref_case_id).filter((x): x is string => !!x))] : [s.case_id]
  const { data: cases, error: cErr } = await admin
    .from('training_cases')
    .select('id, context, objective, target_line, training_case_secrets(expected)')
    .in('id', caseIds)
  if (cErr) throw new Error(cErr.message)
  const caseById = new Map(cases.map((c) => [c.id, c]))
  const bossFanIds = s.training_threads.map((t) => t.boss_fan_id).filter((x): x is string => !!x)
  const { data: fans, error: fErr } = bossFanIds.length
    ? await admin.from('training_case_boss_fans').select('id, name, persona, training_boss_fan_secrets(budget_cap, nego_where, meet_when)').in('id', bossFanIds)
    : { data: [], error: null }
  if (fErr) throw new Error(fErr.message)
  const fanById = new Map((fans ?? []).map((f) => [f.id, f]))

  const totals: { total: number; objective: boolean }[] = []
  for (const t of [...s.training_threads].sort((a, b) => a.position - b.position)) {
    let r: ScoreResult
    if (t.status === 'lost') {
      const reason = (t.lost_reason ?? 'timeout') as FaultCode | 'timeout'
      const label = FAULT_LABELS[reason] ?? FAULT_LABELS.timeout
      r = { total: 0, objectiveReached: false, capped: false, comment: `${label.title}. ${label.text}`, moments: [], axes: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }, latencyMs: 0, model: '' }
    } else {
      const history: HistoryMessage[] = (msgs ?? []).filter((m) => m.thread_id === t.id).map((m) => ({ speaker: m.speaker as HistoryMessage['speaker'], body: m.body, mediaPrice: m.media_price }))
      const transcript = formatTranscript(history)
      if (kind === 'boss') {
        const f = t.boss_fan_id ? fanById.get(t.boss_fan_id) : undefined
        if (!f) throw new Error('fan du boss introuvable')
        const sec = Array.isArray(f.training_boss_fan_secrets) ? f.training_boss_fan_secrets[0] : f.training_boss_fan_secrets
        r = await scoreBossThread({ system: bossScoreSystemPrompt({ name: f.name, persona: f.persona, budgetCap: sec?.budget_cap ?? null, negoWhere: sec?.nego_where ?? null, meetWhen: sec?.meet_when ?? null }), transcript })
      } else {
        const c = caseById.get(kind === 'arena' ? (t.ref_case_id ?? '') : s.case_id)
        if (!c) throw new Error('cas de notation introuvable')
        const sec = Array.isArray(c.training_case_secrets) ? c.training_case_secrets[0] : c.training_case_secrets
        r = await scoreThread({ system: scoreSystemPrompt({ scoringNotes, context: c.context, objective: c.objective, targetLine: c.target_line, expected: sec?.expected ?? null, axes }), transcript, axes })
      }
      await logAiCall(admin, { sessionId, threadId: t.id, kind: 'score', model: r.model, usage: r.usage, latencyMs: r.latencyMs, ok: true })
    }
    const { error: uErr } = await admin.from('training_thread_scores').upsert({
      thread_id: t.id, total: r.total, objective_reached: r.objectiveReached, capped: r.capped, comment: r.comment, moments: r.moments, scored_at: new Date().toISOString(),
    }, { onConflict: 'thread_id' })
    if (uErr) throw new Error(uErr.message)
    const { error: dErr } = await admin.from('training_thread_axis_scores').delete().eq('thread_id', t.id)
    if (dErr) throw new Error(dErr.message)
    if (r.axes.length) {
      const { error: aErr } = await admin.from('training_thread_axis_scores').insert(r.axes.map((a) => ({ thread_id: t.id, axis_key: a.key, axis_name: a.name, score: a.score })))
      if (aErr) throw new Error(aErr.message)
    }
    totals.push({ total: r.total, objective: r.objectiveReached })
  }
  const total = totals.length ? Math.round(totals.reduce((n, x) => n + x.total, 0) / totals.length) : 0
  const objective = totals.length > 0 && totals.every((x) => x.objective)
  const { error: sErr } = await admin
    .from('training_sessions')
    .update({ status: 'scored', total, objective_reached: objective, scored_at: new Date().toISOString(), ended_at: s.ended_at ?? new Date().toISOString() })
    .eq('id', sessionId)
  if (sErr) throw new Error(sErr.message)
  return { total }
}
```

- [ ] **Step 5: `services/get-session.ts`**

```ts
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import type { ScoreMoment } from '@/lib/ai/schema'
import type { CaseKind, MessageSpeaker, SessionStatus, ThreadStatus } from '@/lib/types/training'
import type { CaseSnapshot, SessionData, SessionThread } from '../types'

/**
 * Une session (RLS : propriétaire, encadrant, admin) : threads + messages + scores + signalement en
 * 3 requêtes. `expected` (secret) n'est lu — en service-role — QUE si la session est notée (révélé
 * après coup, comme GLA) et pour un solo. `previousBest` = meilleur total du chatter sur ce cas.
 */
export async function getSession(id: string): Promise<SessionData | null> {
  const supabase = await createClient()
  const { data: s, error } = await supabase
    .from('training_sessions')
    .select('*, training_threads(*, training_case_boss_fans(name, age, job, city, color, persona), training_thread_scores(*), training_thread_axis_scores(axis_key, axis_name, score)), training_reports(id, resolved_at)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!s) return null
  const { data: msgs, error: mErr } = await supabase
    .from('training_messages')
    .select('id, thread_id, position, speaker, body, media_price, visible_at')
    .eq('session_id', id)
    .order('position')
  if (mErr) throw new Error(mErr.message)
  const { data: best, error: bErr } = await supabase
    .from('training_case_bests')
    .select('best_total')
    .eq('profile_id', s.profile_id)
    .eq('case_id', s.case_id)
    .maybeSingle()
  if (bErr) throw new Error(bErr.message)

  let expected: string | null = null
  if (s.status === 'scored' && s.kind === 'solo') {
    const { data: sec, error: eErr } = await createAdminClient().from('training_case_secrets').select('expected').eq('case_id', s.case_id).maybeSingle()
    if (eErr) throw new Error(eErr.message)
    expected = sec?.expected ?? null
  }

  const threads: SessionThread[] = [...s.training_threads].sort((a, b) => a.position - b.position).map((t) => {
    const score = Array.isArray(t.training_thread_scores) ? t.training_thread_scores[0] : t.training_thread_scores
    const fan = Array.isArray(t.training_case_boss_fans) ? t.training_case_boss_fans[0] : t.training_case_boss_fans
    return {
      id: t.id, position: t.position, fanName: t.fan_name, status: t.status as ThreadStatus, lostReason: t.lost_reason,
      turnsUsed: t.turns_used, maxTurns: t.max_turns, nextDueAt: t.next_due_at,
      bossFan: fan ? { name: fan.name, age: fan.age, job: fan.job, city: fan.city, color: fan.color, persona: fan.persona } : null,
      messages: (msgs ?? []).filter((m) => m.thread_id === t.id).map((m) => ({
        id: m.id, threadId: m.thread_id, position: m.position, speaker: m.speaker as MessageSpeaker, body: m.body, mediaPrice: m.media_price, visibleAt: m.visible_at,
      })),
      score: score
        ? { total: score.total, objectiveReached: score.objective_reached, capped: score.capped, comment: score.comment, moments: (score.moments as ScoreMoment[]) ?? [], axes: t.training_thread_axis_scores.map((a) => ({ key: a.axis_key, name: a.axis_name, score: a.score })) }
        : null,
    }
  })
  const report = s.training_reports?.[0]
  return {
    id: s.id, profileId: s.profile_id, kind: s.kind as CaseKind, status: s.status as SessionStatus, caseId: s.case_id, moduleId: s.module_id,
    snapshot: s.case_snapshot as unknown as CaseSnapshot, total: s.total, objectiveReached: s.objective_reached,
    startedAt: s.started_at, endedAt: s.ended_at, threads, expected,
    previousBest: best?.best_total ?? null,
    report: report ? { id: report.id, resolvedAt: report.resolved_at } : null,
    serverNow: new Date().toISOString(),
  }
}
```
(Le `training_reports(id, resolved_at)` embed retourne un tableau ; on prend le premier — un seul signalement par session côté action.)

- [ ] **Step 6a: `lib/training/start-session.ts` — `startSession` (partagé)**

```ts
'use server'

// Démarrer (ou reprendre) une session d'entraînement — PARTAGÉ hors feature (Modules « Jouer »,
// session « Rejouer », Ma formation « Continuer ») : la frontière ESLint interdit le cross-feature,
// d'où lib/ (précédent : lib/impersonation/actions.ts). Garde : droit Entraînement, pas d'impersonation. Garde : droit Entraînement (frm-entrainement),
// propriétaire de la session (RLS + vérif explicite), refus en impersonation. Le fan (IA) est

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { bossUnlocked } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { runAction, noGuard, requirePageProfile, BusinessError, type ActionResult } from '@/lib/actions'
import { readStateCookie } from '@/lib/impersonation/session'
import { dueAtFrom } from '@/lib/services/training-engine'
import { ARENA_OPENING_OFFSETS_S, type CaseKind, type CaseSnapshot, type MessageSpeaker } from '@/lib/types/training'

const startInput = z.object({ caseId: z.uuid() })
const ARENA_MAX_TURNS_FALLBACK = 8
const BOSS_MAX_TURNS_FALLBACK = 32

const iso = (d: Date) => d.toISOString()
/** GLA seed : `me` = la créatrice = le chatter, `them` = le fan. */
const speakerOf = (s: string): MessageSpeaker => (s === 'fan' ? 'fan' : 'chatter')

/**
 * Démarre une session sur un cas (ou reprend l'ACTIVE du chatter : une seule à la fois).
 * Boss verrouillé sous 60/100 de moyenne. Crée session (snapshot visible) + threads + messages
 * d'ouverture (défi/boss : ouvertures échelonnées 0/20/45/75/110 s ; chrono armé si l'ouverture
 * finit par le fan).
 */
export async function startSession(raw: unknown): Promise<ActionResult<{ sessionId: string; resumed: boolean }>> {
  return runAction({
    schema: startInput,
    input: raw,
    guard: noGuard,
    handler: async ({ caseId }) => {
      const profile = await requirePageProfile('frm-entrainement')
      if (await readStateCookie()) throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')
      const supabase = await createClient()
      const { data: active, error: aErr } = await supabase.from('training_sessions').select('id').eq('profile_id', profile.id).eq('status', 'active').maybeSingle()
      if (aErr) throw new Error(aErr.message)
      if (active) return { sessionId: active.id, resumed: true }

      const { data: c, error } = await supabase
        .from('training_cases')
        .select('id, module_id, code, kind, title, phase, difficulty, max_turns, reaction_max_s, is_sale, context, objective, target_line, fan_name, active, training_modules(code, title, objective_label, active), training_case_messages(position, speaker, body), training_case_arena_slots!case_id(position, ref_case_id, display_name), training_case_boss_fans(id, name, position, opening_message)')
        .eq('id', caseId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!c || !c.active || !c.training_modules?.active) throw new BusinessError('Ce cas n’est plus disponible')
      const kind = c.kind as CaseKind
      if (kind === 'boss') {
        const { data: st, error: sErr } = await supabase.from('training_profile_stats').select('avg_total').eq('profile_id', profile.id).maybeSingle()
        if (sErr) throw new Error(sErr.message)
        if (!bossUnlocked(st?.avg_total == null ? null : Number(st.avg_total))) {
          throw new BusinessError(`Le boss final se débloque à 60/100 de moyenne — ta moyenne : ${st?.avg_total == null ? '—' : Math.round(Number(st.avg_total))}/100`)
        }
      }
      const snapshot: CaseSnapshot = {
        code: c.code, title: c.title, phase: c.phase, difficulty: c.difficulty, context: c.context, objective: c.objective,
        objectiveLabel: c.training_modules.objective_label, targetLine: c.target_line, maxTurns: c.max_turns, reactionMaxS: c.reaction_max_s,
        isSale: c.is_sale, moduleTitle: c.training_modules.title, moduleCode: c.training_modules.code,
      }
      const { data: session, error: iErr } = await supabase
        .from('training_sessions')
        .insert({ profile_id: profile.id, case_id: c.id, module_id: c.module_id, kind, case_snapshot: snapshot as unknown as Record<string, unknown> })
        .select('id')
        .single()
      if (iErr) {
        if (iErr.code === '23505') { // course : une session active vient d'être créée
          const { data: again } = await supabase.from('training_sessions').select('id').eq('profile_id', profile.id).eq('status', 'active').maybeSingle()
          if (again) return { sessionId: again.id, resumed: true }
        }
        throw new Error(iErr.message)
      }
      const now = new Date()

      // Threads + ouvertures selon la sorte.
      type Opening = { speaker: MessageSpeaker; body: string }
      let plan: { position: number; fanName: string; refCaseId: string | null; bossFanId: string | null; maxTurns: number; openings: Opening[]; offsetS: number }[] = []
      if (kind === 'solo') {
        plan = [{ position: 0, fanName: c.fan_name ?? 'Fan', refCaseId: null, bossFanId: null, maxTurns: c.max_turns,
          openings: [...c.training_case_messages].sort((a, b) => a.position - b.position).map((m) => ({ speaker: speakerOf(m.speaker), body: m.body })), offsetS: 0 }]
      } else if (kind === 'arena') {
        const slots = [...c.training_case_arena_slots].sort((a, b) => a.position - b.position)
        const { data: refMsgs, error: rErr } = await supabase.from('training_case_messages').select('case_id, position, speaker, body').in('case_id', slots.map((s) => s.ref_case_id)).order('position')
        if (rErr) throw new Error(rErr.message)
        plan = slots.map((s, i) => ({ position: i, fanName: s.display_name, refCaseId: s.ref_case_id, bossFanId: null, maxTurns: c.max_turns || ARENA_MAX_TURNS_FALLBACK,
          openings: (refMsgs ?? []).filter((m) => m.case_id === s.ref_case_id).map((m) => ({ speaker: speakerOf(m.speaker), body: m.body })), offsetS: ARENA_OPENING_OFFSETS_S[i] ?? 0 }))
      } else {
        plan = [...c.training_case_boss_fans].sort((a, b) => a.position - b.position).map((f, i) => ({ position: i, fanName: f.name, refCaseId: null, bossFanId: f.id, maxTurns: c.max_turns || BOSS_MAX_TURNS_FALLBACK,
          openings: [{ speaker: 'fan', body: f.opening_message }], offsetS: ARENA_OPENING_OFFSETS_S[i] ?? 0 }))
      }
      const { data: threads, error: tErr } = await supabase
        .from('training_threads')
        .insert(plan.map((p) => ({ session_id: session.id, position: p.position, fan_name: p.fanName, ref_case_id: p.refCaseId, boss_fan_id: p.bossFanId, max_turns: p.maxTurns })))
        .select('id, position')
      if (tErr) throw new Error(tErr.message)
      const threadIdAt = new Map(threads.map((t) => [t.position, t.id]))
      const rows: { session_id: string; thread_id: string; position: number; speaker: MessageSpeaker; body: string; visible_at: string }[] = []
      const dueUpdates: { id: string; next_due_at: string }[] = []
      for (const p of plan) {
        const threadId = threadIdAt.get(p.position)!
        const visibleAt = new Date(now.getTime() + p.offsetS * 1000)
        p.openings.forEach((m, i) => rows.push({ session_id: session.id, thread_id: threadId, position: i, speaker: m.speaker, body: m.body, visible_at: iso(visibleAt) }))
        const last = p.openings[p.openings.length - 1]
        if (last?.speaker === 'fan') dueUpdates.push({ id: threadId, next_due_at: iso(dueAtFrom(visibleAt, kind, c.reaction_max_s)) })
      }
      if (rows.length) {
        const { error: mErr } = await supabase.from('training_messages').insert(rows)
        if (mErr) throw new Error(mErr.message)
      }
      for (const u of dueUpdates) {
        const { error: dErr } = await supabase.from('training_threads').update({ next_due_at: u.next_due_at }).eq('id', u.id)
        if (dErr) throw new Error(dErr.message)
      }
      revalidatePath('/formation/ma-formation')
      return { sessionId: session.id, resumed: false }
    },
  })
}
```

- [ ] **Step 6b: `actions.ts` — `sendMessage`**

```ts
'use server'

// Server Action de l'entraînement — envoyer un message dans une session. Garde : droit Entraînement
// (frm-entrainement), propriétaire de la session (RLS + vérif explicite), refus en impersonation.
// Le fan (IA) est appelé ici, sans streaming (approche A) ; les secrets sont lus en service-role par
// lib/services/training-engine ; chaque appel IA est tracé.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { runAction, noGuard, requirePageProfile, BusinessError, type ActionResult } from '@/lib/actions'
import { readStateCookie } from '@/lib/impersonation/session'
import { logAiCall } from '@/lib/ai/log'
import { replyAsFan } from '@/lib/ai/fan'
import { buildFanSystem, dueAtFrom, revealDelayMs } from '@/lib/services/training-engine'
import type { CaseKind, CaseSnapshot, MessageSpeaker } from '@/lib/types/training'
import { sendInput } from './schema'
import type { SendResult, SessionMessage } from './types'

async function requireTrainee() {
  const profile = await requirePageProfile('frm-entrainement')
  if (await readStateCookie()) throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')
  return profile
}

/**
 * Le chatter envoie un message (texte ou média verrouillé) ; le fan répond (Haiku). Chrono vérifié
 * CÔTÉ SERVEUR (solo 60 s, défi/boss reaction_max_s) ; faute grave `[[ELIM:code]]` → thread perdu
 * (solo → session `failed`). Défi/boss : la réponse est stockée avec `visible_at` différé.
 */
export async function sendMessage(raw: unknown): Promise<ActionResult<SendResult>> {
  return runAction({
    schema: sendInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      const profile = await requireTrainee()
      const supabase = await createClient()
      const admin = createAdminClient()
      const { data: t, error } = await supabase
        .from('training_threads')
        .select('id, session_id, status, turns_used, max_turns, next_due_at, ref_case_id, boss_fan_id, fan_name, training_sessions!inner(id, profile_id, kind, status, case_id, case_snapshot)')
        .eq('id', d.threadId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      const s = t?.training_sessions
      if (!t || !s || s.profile_id !== profile.id) throw new BusinessError('Session introuvable')
      if (s.status !== 'active') throw new BusinessError('Cette session est terminée')
      if (t.status !== 'open') throw new BusinessError('Cette conversation est terminée')
      if (t.turns_used >= t.max_turns) throw new BusinessError('Plus de tours disponibles dans cette conversation')
      const kind = s.kind as CaseKind
      const snap = s.case_snapshot as unknown as CaseSnapshot
      const now = new Date()

      // Chrono (autorité serveur) : trop tard → thread perdu, solo → session ratée.
      if (t.next_due_at && now.getTime() > new Date(t.next_due_at).getTime()) {
        const { error: lErr } = await supabase.from('training_threads').update({ status: 'lost', lost_reason: 'timeout', next_due_at: null }).eq('id', t.id)
        if (lErr) throw new Error(lErr.message)
        if (kind === 'solo') {
          const { error: fErr } = await supabase.from('training_sessions').update({ status: 'failed', ended_at: now.toISOString() }).eq('id', s.id)
          if (fErr) throw new Error(fErr.message)
        }
        revalidatePath(`/formation/session/${s.id}`)
        throw new BusinessError('Trop lent — ce fan est parti')
      }

      const { data: history, error: hErr } = await supabase
        .from('training_messages').select('id, position, speaker, body, media_price').eq('thread_id', t.id).order('position')
      if (hErr) throw new Error(hErr.message)
      const nextPos = (history?.[history.length - 1]?.position ?? -1) + 1
      const body = d.mediaPrice != null ? `Média verrouillé — ${d.mediaPrice} €` : d.body
      const { data: mine, error: iErr } = await supabase
        .from('training_messages')
        .insert({ session_id: s.id, thread_id: t.id, position: nextPos, speaker: 'chatter', body, media_price: d.mediaPrice, visible_at: now.toISOString() })
        .select('id, position, visible_at')
        .single()
      if (iErr) throw new Error(iErr.message)
      const chatter: SessionMessage = { id: mine.id, threadId: t.id, position: mine.position, speaker: 'chatter', body, mediaPrice: d.mediaPrice, visibleAt: mine.visible_at }

      // Le fan (IA). Échec réseau/API → message métier, le message du chatter reste (le tour n'est pas consommé).
      const system = await buildFanSystem(admin, { kind, caseId: s.case_id, refCaseId: t.ref_case_id, bossFanId: t.boss_fan_id, fanName: t.fan_name, isSale: snap.isSale })
      const hist = [...(history ?? []).map((m) => ({ speaker: m.speaker as MessageSpeaker, body: m.body, mediaPrice: m.media_price })), { speaker: 'chatter' as const, body, mediaPrice: d.mediaPrice }]
      let reply
      try {
        reply = await replyAsFan({ system, history: hist, maxTokens: kind === 'boss' ? 260 : 200 })
      } catch (err) {
        await logAiCall(admin, { sessionId: s.id, threadId: t.id, kind: 'fan', model: 'claude-haiku-4-5', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }, latencyMs: 0, ok: false })
        console.error('[training fan]', err)
        throw new BusinessError('Le fan n’a pas répondu — réessaie')
      }
      await logAiCall(admin, { sessionId: s.id, threadId: t.id, kind: 'fan', model: reply.model, usage: reply.usage, latencyMs: reply.latencyMs, ok: reply.ok })

      const visibleAt = new Date(now.getTime() + revealDelayMs(kind))
      const { data: fanRow, error: fErr } = await supabase
        .from('training_messages')
        .insert({ session_id: s.id, thread_id: t.id, position: nextPos + 1, speaker: 'fan', body: reply.text, visible_at: visibleAt.toISOString() })
        .select('id, position, visible_at')
        .single()
      if (fErr) throw new Error(fErr.message)
      const fan: SessionMessage = { id: fanRow.id, threadId: t.id, position: fanRow.position, speaker: 'fan', body: reply.text, mediaPrice: null, visibleAt: fanRow.visible_at }

      const turnsUsed = t.turns_used + 1
      const lost = reply.faultCode !== null
      const done = !lost && turnsUsed >= t.max_turns
      const status = lost ? 'lost' : done ? 'done' : 'open'
      const nextDueAt = status === 'open' ? dueAtFrom(visibleAt, kind, snap.reactionMaxS).toISOString() : null
      const { error: uErr } = await supabase.from('training_threads').update({ turns_used: turnsUsed, status, lost_reason: lost ? reply.faultCode : null, next_due_at: nextDueAt }).eq('id', t.id)
      if (uErr) throw new Error(uErr.message)

      // Fin de session ? solo perdu → failed ; tous les threads finis → ended_at (la notation suit).
      let sessionStatus: SendResult['sessionStatus'] = 'active'
      let sessionEnded = false
      if (kind === 'solo' && lost) {
        const { error: sErr } = await supabase.from('training_sessions').update({ status: 'failed', ended_at: now.toISOString() }).eq('id', s.id)
        if (sErr) throw new Error(sErr.message)
        sessionStatus = 'failed'; sessionEnded = true
      } else {
        const { data: open, error: oErr } = await supabase.from('training_threads').select('id').eq('session_id', s.id).eq('status', 'open').limit(1)
        if (oErr) throw new Error(oErr.message)
        if (!open?.length) {
          const { error: eErr } = await supabase.from('training_sessions').update({ ended_at: now.toISOString() }).eq('id', s.id)
          if (eErr) throw new Error(eErr.message)
          sessionEnded = true
        }
      }
      revalidatePath(`/formation/session/${s.id}`)
      return { chatter, fan, thread: { status, lostReason: lost ? reply.faultCode : null, turnsUsed, nextDueAt }, sessionStatus, sessionEnded, serverNow: new Date().toISOString() }
    },
  })
}
```

- [ ] **Step 7: `actions-lifecycle.ts` — `endSession`, `abandonSession`, `scoreSession`, `timeoutThread`, `reportScore`** (si le fichier dépasse 300 lignes : `timeoutThread` + `reportScore` dans `actions-thread.ts`, `requireOwnSession` exporté depuis `actions-shared.ts`)

```ts
'use server'

// Fin de session / notation / signalement. Même garde que actions.ts (droit Entraînement,
// propriétaire, pas d'impersonation). La notation vit dans lib/services/training-scoring
// (partagée avec le rescore admin de l'Overview).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { runAction, noGuard, requirePageProfile, BusinessError, type ActionResult } from '@/lib/actions'
import { readStateCookie } from '@/lib/impersonation/session'
import { scoreSessionById } from '@/lib/services/training-scoring'
import { reportInput, sessionIdInput, threadIdInput } from './schema'

async function requireOwnSession(sessionId: string) {
  const profile = await requirePageProfile('frm-entrainement')
  if (await readStateCookie()) throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')
  const supabase = await createClient()
  const { data: s, error } = await supabase.from('training_sessions').select('id, profile_id, status, ended_at, case_id').eq('id', sessionId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!s || s.profile_id !== profile.id) throw new BusinessError('Session introuvable')
  return { supabase, s, profile }
}
const revalidate = (id: string) => { revalidatePath(`/formation/session/${id}`); revalidatePath('/formation/ma-formation') }

/** « Terminer » : ferme les threads ouverts (done), pose ended_at — la notation est appelée ensuite par le client. */
export async function endSession(raw: unknown): Promise<ActionResult> {
  return runAction({ schema: sessionIdInput, input: raw, guard: noGuard, handler: async ({ sessionId }) => {
    const { supabase, s } = await requireOwnSession(sessionId)
    if (s.status !== 'active') throw new BusinessError('Cette session est déjà terminée')
    const { error: tErr } = await supabase.from('training_threads').update({ status: 'done', next_due_at: null }).eq('session_id', sessionId).eq('status', 'open')
    if (tErr) throw new Error(tErr.message)
    if (!s.ended_at) {
      const { error } = await supabase.from('training_sessions').update({ ended_at: new Date().toISOString() }).eq('id', sessionId)
      if (error) throw new Error(error.message)
    }
    revalidate(sessionId)
  } })
}

/** « Abandonner » : session non notée, libère le slot « une seule active ». */
export async function abandonSession(raw: unknown): Promise<ActionResult> {
  return runAction({ schema: sessionIdInput, input: raw, guard: noGuard, handler: async ({ sessionId }) => {
    const { supabase, s } = await requireOwnSession(sessionId)
    if (s.status !== 'active') throw new BusinessError('Cette session est déjà terminée')
    const { error } = await supabase.from('training_sessions').update({ status: 'abandoned', ended_at: new Date().toISOString() }).eq('id', sessionId)
    if (error) throw new Error(error.message)
    const { error: tErr } = await supabase.from('training_threads').update({ next_due_at: null }).eq('session_id', sessionId)
    if (tErr) throw new Error(tErr.message)
    revalidate(sessionId)
  } })
}

/** Note la session terminée (un appel IA par thread joué). Relançable en cas d'échec. */
export async function scoreSession(raw: unknown): Promise<ActionResult<{ total: number }>> {
  return runAction({ schema: sessionIdInput, input: raw, guard: noGuard, handler: async ({ sessionId }) => {
    const { s } = await requireOwnSession(sessionId)
    if (s.status !== 'active' || !s.ended_at) throw new BusinessError('Termine la session avant de la faire noter')
    let res: { total: number }
    try {
      res = await scoreSessionById(sessionId)
    } catch (err) {
      console.error('[training score]', err)
      throw new BusinessError('La notation a échoué — relance-la dans un instant')
    }
    revalidate(sessionId)
    revalidatePath('/formation/modules', 'layout')
    return res
  } })
}

/**
 * Chrono écoulé côté client : le serveur VÉRIFIE (next_due_at dépassé, 2 s de grâce) puis marque le
 * thread perdu (`timeout`) ; solo → session `failed` ; défi/boss : plus aucun thread ouvert → ended_at.
 */
export async function timeoutThread(raw: unknown): Promise<ActionResult<{ sessionStatus: string; sessionEnded: boolean }>> {
  return runAction({ schema: threadIdInput, input: raw, guard: noGuard, handler: async ({ threadId }) => {
    const profile = await requirePageProfile('frm-entrainement')
    if (await readStateCookie()) throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')
    const supabase = await createClient()
    const { data: t, error } = await supabase.from('training_threads').select('id, session_id, status, next_due_at, training_sessions!inner(id, profile_id, kind, status)').eq('id', threadId).maybeSingle()
    if (error) throw new Error(error.message)
    const s = t?.training_sessions
    if (!t || !s || s.profile_id !== profile.id) throw new BusinessError('Session introuvable')
    if (s.status !== 'active') return { sessionStatus: s.status, sessionEnded: true }
    if (t.status !== 'open') return { sessionStatus: s.status, sessionEnded: false }
    if (!t.next_due_at || Date.now() < new Date(t.next_due_at).getTime() - 2000) throw new BusinessError('Le temps n’est pas écoulé')
    const now = new Date().toISOString()
    const { error: lErr } = await supabase.from('training_threads').update({ status: 'lost', lost_reason: 'timeout', next_due_at: null }).eq('id', t.id)
    if (lErr) throw new Error(lErr.message)
    let sessionStatus = 'active'
    let sessionEnded = false
    if (s.kind === 'solo') {
      const { error: fErr } = await supabase.from('training_sessions').update({ status: 'failed', ended_at: now }).eq('id', s.id)
      if (fErr) throw new Error(fErr.message)
      sessionStatus = 'failed'; sessionEnded = true
    } else {
      const { data: open, error: oErr } = await supabase.from('training_threads').select('id').eq('session_id', s.id).eq('status', 'open').limit(1)
      if (oErr) throw new Error(oErr.message)
      if (!open?.length) {
        const { error: eErr } = await supabase.from('training_sessions').update({ ended_at: now }).eq('id', s.id)
        if (eErr) throw new Error(eErr.message)
        sessionEnded = true
      }
    }
    revalidate(s.id)
    return { sessionStatus, sessionEnded }
  } })
}

/** Signaler une note contestée (une fois par session). */
export async function reportScore(raw: unknown): Promise<ActionResult> {
  return runAction({ schema: reportInput, input: raw, guard: noGuard, handler: async ({ sessionId, message }) => {
    const { supabase, s, profile } = await requireOwnSession(sessionId)
    if (s.status !== 'scored') throw new BusinessError('On ne signale qu’une session notée')
    const { data: existing, error: eErr } = await supabase.from('training_reports').select('id').eq('session_id', sessionId).maybeSingle()
    if (eErr) throw new Error(eErr.message)
    if (existing) throw new BusinessError('Cette note est déjà signalée')
    const { error } = await supabase.from('training_reports').insert({ session_id: sessionId, profile_id: profile.id, message })
    if (error) throw new Error(error.message)
    revalidate(sessionId)
    revalidatePath('/formation/overview')
  } })
}
```

- [ ] **Step 8: Vérifier** — `pnpm --filter @glagency/web test` (schema test PASS) ; `typecheck` ; `lint`. Points TS : embeds 1-1 typés tableau vs objet (utiliser le garde `Array.isArray` comme écrit), `training_sessions!inner(...)` sur le select des threads, `case_snapshot` cast `as unknown as Record<string, unknown>` (colonne `Json`).

- [ ] **Step 9: Commit** (demander) — `feat(formation): sessions — moteur (contexte fan, notation), service, démarrage partagé (lib/training), actions envoyer / terminer / noter / signaler`

---

### Task 8: UI de jeu — route `/formation/session/[id]`, `SessionTemplate`, vue de jeu (threads, timers, composer), bouton « Jouer » partagé

**Files:**
- Create: `apps/web/src/components/training/play-button.tsx` (client, partagé)
- Modify: `apps/web/src/features/training-modules/components/cases-list.tsx` (bouton Jouer, prop `canPlay`), `ModuleTemplate.tsx`, `apps/web/src/app/(dash)/formation/modules/[code]/page.tsx` (`canPlay`)
- Create: `apps/web/src/features/training-session/SessionTemplate.tsx`
- Create: `apps/web/src/features/training-session/components/{session-view,session-header,thread-tabs,thread-panel,message-list,composer,media-price-popover,session-outcome,session-skeleton}.tsx`, `use-now.ts`, `use-scoring.ts`
- Create: `apps/web/src/app/(dash)/formation/session/[id]/{page,loading}.tsx`

**Interfaces:**
- Consumes : Task 7 (`getSession`, `SessionData`, `SessionThread`, `SessionMessage`, `SendResult`, `sendMessage`, `timeoutThread`, `endSession`, `abandonSession`, `scoreSession`, `composerForm`, `mediaPriceForm`), `lib/training/start-session` (`startSession`), `lib/types/training` (`FAULT_LABELS`, `CASE_KIND_LABELS`, `SOLO_REACTION_S`), `hasPageAccess`.
- Produces : `PlayButton({ caseId, label?, variant?, size? })` (client, partagé — utilisé par Task 9 et 10), `SessionTemplate({ data, viewerIsOwner })`, `SessionView` (client), `useNow(serverNow)`, `useScoring(sessionId)`, `SessionOutcome` (stub remplacé en Task 9 par `ResultView` / `FailedView`).

- [ ] **Step 1: `components/training/play-button.tsx`**

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import type { ButtonProps } from '@/components/ui/button'
import { startSession } from '@/lib/training/start-session'

/**
 * « Jouer » / « Rejouer » / « Continuer » : démarre (ou reprend) une session sur un cas puis navigue
 * vers /formation/session/[id]. Partagé (Modules, session, Ma formation) — d'où components/.
 */
export function PlayButton({ caseId, label = 'Jouer', ...props }: { caseId: string; label?: string } & Omit<ButtonProps, 'onClick' | 'children'>) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <ActionButton
      size="sm"
      pending={pending}
      {...props}
      onClick={() =>
        start(async () => {
          const r = await startSession({ caseId })
          if (!r.success) { toast.error(r.error); return }
          if (r.data.resumed) toast.info('Tu as déjà une session en cours — on la reprend')
          router.push(`/formation/session/${r.data.sessionId}`)
        })
      }
    >
      {label}
    </ActionButton>
  )
}
```
(`typedRoutes` : si `router.push` refuse la string, caster `as Route` — `import type { Route } from 'next'` — comme `module-tabs.tsx`.)

- [ ] **Step 2: « Jouer » dans les Modules** — `cases-list.tsx` reçoit `canPlay: boolean` (`hasPageAccess(profile, 'frm-entrainement')`, calculé dans la page, passé via `ModuleTemplate`). Dans `CaseRow` (solo + défi) : `{canPlay && <PlayButton caseId={c.id} />}` à droite (dans le `<span className="ml-auto …">`, avant les badges → `flex items-center gap-2`). Dans la section boss : un `<PlayButton caseId={c.id} label="Affronter le boss" />` sous la description (le verrou < 60 est appliqué par `startSession` → toast métier). Page `modules/[code]/page.tsx` : `const [profile, …] = await Promise.all([requireAccess([...]), …])` puis `canPlay={hasPageAccess(profile, 'frm-entrainement')}` (import `hasPageAccess` de `@/lib/auth`) transmis à `ModuleContent` → `ModuleTemplate` → `CasesList`. Un encadrant Suivi seul voit les cas sans bouton.

- [ ] **Step 3: `use-now.ts`, `use-scoring.ts`**

```ts
'use client'
import { useEffect, useState } from 'react'
/** Horloge alignée sur le serveur (offset calculé au montage) — les timers (chrono, révélation) s'y calent. */
export function useNow(serverNow: string, tickMs = 250): number {
  const [now, setNow] = useState(() => Date.parse(serverNow))
  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now()
    setNow(Date.now() + offset)
    const id = setInterval(() => setNow(Date.now() + offset), tickMs)
    return () => clearInterval(id)
  }, [serverNow, tickMs])
  return now
}
```
```ts
'use client'
import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { scoreSession } from '../actions-lifecycle'
/** Lance la notation (une fois) puis `router.refresh()` → le RSC bascule sur l'écran de résultat. */
export function useScoring(sessionId: string) {
  const router = useRouter()
  const [scoring, setScoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const run = useCallback(async () => {
    if (started.current) return
    started.current = true
    setScoring(true)
    setError(null)
    const r = await scoreSession({ sessionId })
    if (!r.success) { started.current = false; setScoring(false); setError(r.error); return }
    router.refresh()
  }, [sessionId, router])
  return { scoring, error, run }
}
```

- [ ] **Step 4: `session-view.tsx` (client, orchestrateur)**

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { sendMessage } from '../actions'
import { timeoutThread } from '../actions-lifecycle'
import type { ComposerInput } from '../schema'
import type { SessionData, SessionThread } from '../types'
import { SessionHeader } from './session-header'
import { ThreadPanel } from './thread-panel'
import { ThreadTabs } from './thread-tabs'
import { useNow } from './use-now'
import { useScoring } from './use-scoring'

/**
 * Session ACTIVE : état local des threads (messages, statut, chrono) alimenté par les retours des
 * actions ; horloge alignée serveur ; fin de session → notation → refresh (le RSC affiche le résultat).
 * Une seule conversation en solo ; onglets en défi / boss.
 */
export function SessionView({ data }: { data: SessionData }) {
  const router = useRouter()
  const now = useNow(data.serverNow)
  const [threads, setThreads] = useState<SessionThread[]>(data.threads)
  const [current, setCurrent] = useState(data.threads[0]?.id ?? '')
  const [ended, setEnded] = useState(!!data.endedAt)
  const { scoring, error: scoreError, run: runScoring } = useScoring(data.id)
  const firing = useRef(new Set<string>())

  useEffect(() => { if (ended) void runScoring() }, [ended, runScoring])

  const patch = (threadId: string, f: (t: SessionThread) => SessionThread) => setThreads((ts) => ts.map((t) => (t.id === threadId ? f(t) : t)))
  const onSessionEnd = useCallback((status: string) => { if (status === 'failed') router.refresh(); else setEnded(true) }, [router])

  const handleSend = async (threadId: string, input: ComposerInput): Promise<boolean> => {
    const r = await sendMessage({ threadId, ...input })
    if (!r.success) {
      toast.error(r.error)
      if (r.error.startsWith('Trop lent') || r.error.includes('terminée')) router.refresh()
      return false
    }
    const d = r.data
    patch(threadId, (t) => ({ ...t, messages: [...t.messages, d.chatter, ...(d.fan ? [d.fan] : [])], status: d.thread.status, lostReason: d.thread.lostReason, turnsUsed: d.thread.turnsUsed, nextDueAt: d.thread.nextDueAt }))
    if (d.sessionEnded) onSessionEnd(d.sessionStatus)
    return true
  }

  const handleTimeout = useCallback(async (threadId: string) => {
    if (firing.current.has(threadId)) return
    firing.current.add(threadId)
    const r = await timeoutThread({ threadId })
    if (!r.success) { firing.current.delete(threadId); return }
    patch(threadId, (t) => ({ ...t, status: 'lost', lostReason: 'timeout', nextDueAt: null }))
    if (r.data.sessionEnded) onSessionEnd(r.data.sessionStatus)
  }, [onSessionEnd])

  if (ended) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border p-10 text-center">
        <p className="text-sm text-muted-foreground">{scoring ? 'Notation en cours…' : 'Session terminée'}</p>
        {scoreError && (
          <>
            <p className="text-sm">{scoreError}</p>
            <Button size="sm" onClick={() => void runScoring()}>Relancer la notation</Button>
          </>
        )}
      </div>
    )
  }
  const thread = threads.find((t) => t.id === current) ?? threads[0]
  return (
    <div className="flex flex-col gap-4">
      <SessionHeader data={data} threads={threads} onEnded={() => setEnded(true)} />
      {threads.length > 1 && <ThreadTabs threads={threads} current={thread.id} now={now} onSelect={setCurrent} />}
      {thread && <ThreadPanel key={thread.id} thread={thread} kind={data.kind} now={now} onSend={(v) => handleSend(thread.id, v)} onTimeout={handleTimeout} />}
    </div>
  )
}
```

- [ ] **Step 5: `session-header.tsx`** — titre du cas (`snapshot.title`), sous-titre `moduleTitle · CASE_KIND_LABELS[kind] · difficulté`, bloc **Contexte** + **Objectif** (`snapshot.context`, `snapshot.objective`, `targetLine` en italique si présent — repliable en `<details>` ouvert par défaut en solo, replié en défi/boss), à droite deux boutons : « Terminer » (AlertDialog « Terminer la session ? La notation démarre tout de suite. » → `endSession({ sessionId })` → `onEnded()`) et « Abandonner » (AlertDialog « Abandonner ? Rien ne sera noté. » → `abandonSession` → `router.push('/formation/ma-formation')`). Les deux via `useTransition` + `ActionButton`, erreurs en `toast.error`. Le nombre de conversations terminées `x/N` en défi/boss.

- [ ] **Step 6: `thread-tabs.tsx`** — liste horizontale (`Tabs`-like : boutons `role="tab"`) : nom du fan, point d'état (ouvert / terminé / perdu → `text-muted-foreground`, `line-through` si perdu), badge « à toi » quand le dernier message VISIBLE est du fan et le thread est ouvert (`lastVisible.speaker === 'fan'`), « … » quand une réponse du fan est en attente de révélation (dernier message = fan avec `visibleAt > now`), et le chrono restant en secondes si `nextDueAt` (rouge < 10 s). Reçoit `now`.

- [ ] **Step 7: `thread-panel.tsx`, `message-list.tsx`**

```tsx
'use client'
import { useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { FAULT_LABELS, type CaseKind, type FaultCode } from '@/lib/types/training'
import type { ComposerInput } from '../schema'
import type { SessionThread } from '../types'
import { Composer } from './composer'
import { MessageList } from './message-list'

/** Une conversation : messages révélés, chrono, composer. Chrono écoulé → `onTimeout` (le serveur tranche). */
export function ThreadPanel({ thread, kind, now, onSend, onTimeout }: {
  thread: SessionThread; kind: CaseKind; now: number
  onSend: (v: ComposerInput) => Promise<boolean>; onTimeout: (threadId: string) => void
}) {
  const visible = thread.messages.filter((m) => Date.parse(m.visibleAt) <= now)
  const pendingFan = thread.messages.some((m) => m.speaker === 'fan' && Date.parse(m.visibleAt) > now)
  const last = visible[visible.length - 1]
  const dueMs = thread.nextDueAt ? Date.parse(thread.nextDueAt) - now : null
  const remaining = dueMs != null && !pendingFan ? Math.max(0, Math.ceil(dueMs / 1000)) : null
  const expired = thread.status === 'open' && dueMs != null && !pendingFan && dueMs < -500
  useEffect(() => { if (expired) onTimeout(thread.id) }, [expired, onTimeout, thread.id])
  const canWrite = thread.status === 'open' && !pendingFan && !expired && last?.speaker !== 'chatter' && thread.turnsUsed < thread.maxTurns
  const lost = thread.status === 'lost' ? FAULT_LABELS[(thread.lostReason ?? 'timeout') as FaultCode | 'timeout'] ?? FAULT_LABELS.timeout : null
  return (
    <section className="flex flex-col rounded-xl border">
      <header className="flex items-center gap-3 border-b px-4 py-2 text-sm">
        <span className="font-medium">{thread.fanName}</span>
        {thread.bossFan && <span className="text-muted-foreground">{[thread.bossFan.age && `${thread.bossFan.age} ans`, thread.bossFan.job, thread.bossFan.city].filter(Boolean).join(' · ')}</span>}
        <span className="ml-auto tabular-nums text-muted-foreground">{thread.turnsUsed}/{thread.maxTurns} tours</span>
        {remaining != null && thread.status === 'open' && (
          <Badge variant={remaining <= 10 ? 'destructive' : 'secondary'} className="tabular-nums">⏱ {remaining} s</Badge>
        )}
      </header>
      <MessageList messages={visible} pendingFan={pendingFan} fanName={thread.fanName} />
      {lost ? (
        <p className="border-t px-4 py-3 text-sm"><span className="font-medium">{lost.title}.</span> {lost.text}</p>
      ) : thread.status === 'done' ? (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">Conversation terminée.</p>
      ) : (
        <Composer disabled={!canWrite} onSend={onSend} />
      )}
    </section>
  )
}
```
`message-list.tsx` : liste (`ul`, `max-h-[55vh] overflow-y-auto`, auto-scroll en bas à chaque nouveau message — `useEffect` + `ref.scrollTop = ref.scrollHeight`) ; bulle fan à gauche (`bg-muted`), chatter à droite (`bg-primary text-primary-foreground`) ; média = bulle `🔒 Média verrouillé — 30 €` ; `pendingFan` → bulle « … » animée (`animate-pulse`) avec le nom du fan (« Marc écrit… »). Rien d'autre.

- [ ] **Step 8: `composer.tsx`, `media-price-popover.tsx`**

```tsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { composerForm, type ComposerInput } from '../schema'
import { MediaPricePopover } from './media-price-popover'

/** Zone d'envoi : texte (Entrée envoie, Maj+Entrée = retour ligne) OU média verrouillé (prix). */
export function Composer({ disabled, onSend }: { disabled: boolean; onSend: (v: ComposerInput) => Promise<boolean> }) {
  'use no memo'
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<ComposerInput>({
    resolver: zodResolver(composerForm), defaultValues: { body: '', mediaPrice: null },
  })
  const mediaPrice = watch('mediaPrice')
  const submit = handleSubmit(async (v) => { if (await onSend(v)) reset({ body: '', mediaPrice: null }) })
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-t p-3">
      {mediaPrice != null && (
        <div className="flex items-center gap-2 text-sm">
          <span>🔒 Média verrouillé — {mediaPrice} €</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setValue('mediaPrice', null)}>Retirer</Button>
        </div>
      )}
      <Textarea
        {...register('body')}
        rows={2}
        placeholder={disabled ? 'En attente…' : 'Ton message…'}
        disabled={disabled || isSubmitting}
        aria-invalid={!!errors.body}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() } }}
      />
      <div className="flex items-center gap-2">
        {errors.body && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{errors.body.message}</p>}
        <span className="ml-auto" />
        <MediaPricePopover disabled={disabled || isSubmitting} onPick={(p) => setValue('mediaPrice', p, { shouldValidate: true })} />
        <ActionButton type="submit" size="sm" pending={isSubmitting} disabled={disabled}>Envoyer</ActionButton>
      </div>
    </form>
  )
}
```
`media-price-popover.tsx` : `Popover` (bouton « Média 🔒 ») avec un mini form RHF (`'use no memo'`, `mediaPriceForm`, `Input type="number" min=1`, boutons rapides 10/25/50/100 €) → `onPick(price)` puis fermer. Erreur de champ sous l'input.

- [ ] **Step 9: `session-outcome.tsx` (STUB, remplacé en Task 9)** — RSC : « Session {status} — note {total ?? '—'}/100 », lien « Retour au module » (`/formation/modules/${snapshot.moduleCode}?vue=cas`), `<PlayButton caseId label="Rejouer" />`. Vingt lignes, sans style particulier — il n'existe que pour vérifier la boucle complète de la Task 8.

- [ ] **Step 10: `SessionTemplate.tsx`, `session-skeleton.tsx`, route**

```tsx
import type { SessionData } from './types'
import { SessionOutcome } from './components/session-outcome'
import { SessionView } from './components/session-view'

/** Session : jeu (active, propriétaire) ou issue (notée / ratée / abandonnée) — Server Component, aucun fetch. */
export function SessionTemplate({ data, viewerIsOwner }: { data: SessionData; viewerIsOwner: boolean }) {
  if (data.status === 'active' && viewerIsOwner) return <SessionView data={data} />
  if (data.status === 'active') return <p className="text-sm text-muted-foreground">Session en cours (lecture seule).</p>
  return <SessionOutcome data={data} />
}
```
`session-skeleton.tsx` : `Skeleton` en-tête (h-7 w-64) + bloc contexte (h-20) + zone messages (h-64) + composer (h-16). Route `app/(dash)/formation/session/[id]/page.tsx` :
```tsx
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { requireAccess } from '@/lib/auth'
import { getSession } from '@/features/training-session/services/get-session'
import { SessionTemplate } from '@/features/training-session/SessionTemplate'
import { SessionSkeleton } from '@/features/training-session/components/session-skeleton'
import type { SessionData } from '@/features/training-session/types'

/** Une session d'entraînement — jouer (propriétaire) ou relire (encadrant Suivi, admin). 404 si inconnue / hors RLS. */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const [profile, { id }] = await Promise.all([requireAccess(['frm-entrainement', 'frm-suivi']), params])
  const data = getSession(id)
  return (
    <Suspense fallback={<SessionSkeleton />}>
      <SessionContent data={data} viewerId={profile.id} />
    </Suspense>
  )
}
async function SessionContent({ data, viewerId }: { data: Promise<SessionData | null>; viewerId: string }) {
  const s = await data
  if (!s) notFound()
  return <SessionTemplate data={s} viewerIsOwner={s.profileId === viewerId} />
}
```
`loading.tsx` : `export default function Loading() { return <SessionSkeleton /> }` (import depuis la feature). Pas de `not-found.tsx` dédié : celui de `training-modules`/global suffit — vérifier qu'un `not-found` existe sous `(dash)` (sinon rendu Next par défaut, acceptable).

- [ ] **Step 11: Vérifier** — `typecheck`, `lint`, `test`. **Manuel UAT (Benoit, clé `ANTHROPIC_API_KEY` posée dans `apps/web/.env.local`)** : Modules → un solo → Jouer → la conversation s'ouvre avec l'ouverture du fan, chrono 60 s → répondre → le fan répond → media 30 € → … → Terminer → « Notation en cours… » → écran (stub) avec la note ; laisser le chrono expirer → écran raté (stub `failed`) ; un défi → 5 onglets, ouvertures échelonnées, réponses révélées après 30-120 s, « à toi » ; boss verrouillé (< 60) → toast. `training_ai_calls` se remplit (2 lignes par tour solo : fan + score à la fin).

- [ ] **Step 12: Commit** (demander) — `feat(formation): jouer une session — route, vue de jeu (threads, chrono, révélation différée, composer), bouton Jouer partagé`

---

### Task 9: Écrans de résultat — `ResultView` (note, médaille, axes, moments, attendu, transcription), `FailedView`, signalement

**Files:**
- Delete: `apps/web/src/features/training-session/components/session-outcome.tsx` (stub Task 8)
- Create: `apps/web/src/features/training-session/components/{result-view,score-panel,thread-result,transcript-view,failed-view,result-actions,report-dialog}.tsx`
- Modify: `apps/web/src/features/training-session/SessionTemplate.tsx`

**Interfaces:**
- Consumes : Task 7 (`SessionData`, `SessionThread`, `ThreadScore`, `reportScore`, `reportInput`), Task 8 (`PlayButton`), `@glagency/core` (`medalFor`), `lib/types/training` (`MEDAL_LABELS`, `FAULT_LABELS`, `CASE_KIND_LABELS`).
- Produces : `ResultView({ data, viewerIsOwner })`, `FailedView({ data, viewerIsOwner })`, `ScorePanel({ score, objectiveLabel })`, `TranscriptView({ thread })`, `ReportDialog({ sessionId, disabled })`.

- [ ] **Step 1: `SessionTemplate.tsx`** — remplacer le stub :
```tsx
if (data.status === 'scored') return <ResultView data={data} viewerIsOwner={viewerIsOwner} />
return <FailedView data={data} viewerIsOwner={viewerIsOwner} />   // failed | abandoned
```
Supprimer `session-outcome.tsx`.

- [ ] **Step 2: `result-view.tsx` (RSC)**

```tsx
import { medalFor } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { CASE_KIND_LABELS, MEDAL_LABELS } from '@/lib/types/training'
import type { SessionData } from '../types'
import { ResultActions } from './result-actions'
import { ScorePanel } from './score-panel'
import { ThreadResult } from './thread-result'
import { TranscriptView } from './transcript-view'

/**
 * Session NOTÉE. En-tête : note /100, médaille (texte, badge outline — pas de doré), objectif atteint /
 * plafonné à 65, record vs meilleur précédent. Solo : un ScorePanel + « ce qui était attendu » + transcription.
 * Défi / boss : une carte par conversation (ThreadResult), note globale = moyenne.
 */
export function ResultView({ data, viewerIsOwner }: { data: SessionData; viewerIsOwner: boolean }) {
  const s = data.snapshot
  const medal = medalFor(data.total)
  const solo = data.kind === 'solo'
  const single = data.threads[0]
  const improved = data.total != null && data.previousBest != null && data.total > data.previousBest
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{s.moduleTitle} · {CASE_KIND_LABELS[data.kind]}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
      </header>
      <section className="flex flex-wrap items-end gap-6 rounded-xl border p-6">
        <div>
          <p className="text-5xl font-semibold tabular-nums">{data.total ?? '—'}<span className="text-lg text-muted-foreground">/100</span></p>
          <p className="mt-1 text-sm text-muted-foreground">
            {medal ? `Médaille ${MEDAL_LABELS[medal]}` : 'À valider (60 minimum)'}
            {data.previousBest != null && ` · précédent ${data.previousBest}`}
            {improved && ' · nouveau record'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{data.kind === 'boss' ? (data.objectiveReached ? 'Boss réussi' : 'Boss non réussi') : data.objectiveReached ? `${s.objectiveLabel} atteint` : `${s.objectiveLabel} non atteint`}</Badge>
          {solo && single?.score?.capped && <Badge variant="outline">Plafonné à 65</Badge>}
        </div>
        <div className="ml-auto"><ResultActions data={data} viewerIsOwner={viewerIsOwner} /></div>
      </section>
      {solo && single?.score ? (
        <>
          <ScorePanel score={single.score} objectiveLabel={s.objectiveLabel} />
          {data.expected && (
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer text-sm font-medium">Ce qui était attendu</summary>
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{data.expected}</p>
            </details>
          )}
          <TranscriptView thread={single} />
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.threads.map((t) => <ThreadResult key={t.id} thread={t} kind={data.kind} objectiveLabel={s.objectiveLabel} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: `score-panel.tsx` (RSC)** — pour un `ThreadScore` : (a) barres par axe : ligne `nom · x/25` + `div` de fond `bg-muted h-2 rounded` avec `div` intérieure `style={{ width: \`${(score/25)*100}%\` }}` `bg-foreground` (boss : x/100, largeur `score%` — passer `max = axes[0].score > 25 ? 100 : 25`… non : recevoir `axisMax: 25 | 100` en prop, 25 par défaut, 100 pour le boss) ; (b) **Moments** : liste des `moments` (`type` good → « 👍 », bad → « 🔧 ») avec la citation entre guillemets, `probleme`, puis « Indice : {indice} » ; (c) **Commentaire** : `comment` en `whitespace-pre-line`. Zéro couleur attitrée hors emoji.

- [ ] **Step 4: `thread-result.tsx` (RSC)** — carte par conversation (défi/boss) : en-tête nom du fan (+ `bossFan` âge/métier/ville), à droite `total/100` ou « Perdu — {FAULT_LABELS[lostReason].title} » si `status === 'lost'` (score `null` ou 0) ; sous l'en-tête `<ScorePanel score axisMax={kind==='boss'?100:25} />` si score, sinon le texte `FAULT_LABELS[…].text` ; `<TranscriptView thread />` replié (`details`).

- [ ] **Step 5: `transcript-view.tsx` (RSC)** — `<details>` « Transcription » (ouvert par défaut en solo : prop `open`) : `ul` des messages (tous — la session est finie), fan à gauche / chatter à droite, média `🔒 Média verrouillé — X €`, même rendu que `message-list.tsx` mais SANS état (RSC) — factoriser la bulle en `message-bubble.tsx` (client-agnostique, sans hook) utilisée par les deux.

- [ ] **Step 6: `failed-view.tsx` (RSC)** — statut `failed` : gros pictogramme (⏱️ si `lostReason === 'timeout'`, sinon 💀), `FAULT_LABELS[reason].title` en h1, `.text` en dessous, rappel du cas (`snapshot.title`, module), `<TranscriptView thread open />` ; statut `abandoned` : « Session abandonnée » + texte neutre. Actions : `<ResultActions data viewerIsOwner />` (Recommencer / Retour — pas de Signaler hors `scored`).

- [ ] **Step 7: `result-actions.tsx` (client), `report-dialog.tsx` (client)**

```tsx
'use client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PlayButton } from '@/components/training/play-button'
import type { SessionData } from '../types'
import { ReportDialog } from './report-dialog'

/** Rejouer / Recommencer (propriétaire), Retour au module, Signaler (session notée, propriétaire, une fois). */
export function ResultActions({ data, viewerIsOwner }: { data: SessionData; viewerIsOwner: boolean }) {
  const back = `/formation/modules/${data.snapshot.moduleCode}?vue=cas`
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm"><Link href={back}>Retour au module</Link></Button>
      {viewerIsOwner && data.status === 'scored' && <ReportDialog sessionId={data.id} reported={!!data.report} />}
      {viewerIsOwner && <PlayButton caseId={data.caseId} label={data.status === 'scored' ? 'Rejouer' : 'Recommencer'} />}
    </div>
  )
}
```
(`typedRoutes` : `href={back as Route}` si nécessaire.) `report-dialog.tsx` : bouton « Signaler la note » (`variant="ghost" size="sm"`, `disabled={reported}` → libellé « Note signalée ») → `Dialog` avec un `Textarea` (RHF `'use no memo'`, `zodResolver(reportInput.pick({ message: true }))`), submit → `reportScore({ sessionId, message })` → toast « Signalement envoyé — un encadrant regardera » + fermeture + `router.refresh()` ; erreurs `FieldError`/toast comme les dialogs du catalogue.

- [ ] **Step 8: Vérifier** — `typecheck`, `lint`, `test` ; UAT : une session solo notée → note, médaille, barres d'axes, moments, commentaire, attendu, transcription, Rejouer ; un défi noté → 5 cartes ; un thread perdu → « Perdu — … » ; chrono expiré → écran ⏱️ ; Signaler → ligne dans `training_reports`, bouton devient « Note signalée » ; en tant qu'admin ouvrir la même URL → lecture seule (pas de Rejouer/Signaler).

- [ ] **Step 9: Commit** (demander) — `feat(formation): résultat de session — note, médaille, axes, moments, attendu, transcription, écran raté, signalement`

---

### Task 10: « Ma formation » — projection publique promue en `lib/services/training-public.ts`, feature `training-me` (progression, modules, historique, trophées, classement), médailles dans Modules

**Files:**
- Create: `apps/web/src/lib/services/training-public.ts` (déplacement de `getModules` / `getModule` + `getAllCases`) ; les types `ModuleSummary`, `PublicCase`, `PublicBossFan`, `ModuleDetail` migrent dans `apps/web/src/lib/types/training-public.ts`
- Modify: `apps/web/src/features/training-modules/services/get-modules.ts`, `get-module.ts` → supprimés ; `types.ts` ré-exporte depuis `lib/types/training-public` (garde `ModuleVue`) ; pages `modules/page.tsx`, `modules/[code]/page.tsx` importent depuis `@/lib/services/training-public` ; `cases-list.tsx` + `ModuleTemplate.tsx` + `modules/[code]/page.tsx` : médailles/meilleur par cas (`bests`)
- Create: `apps/web/src/features/training-me/{types.ts, services/get-me.ts, MeTemplate.tsx}`, `components/{me-header,me-modules,me-history,me-trophies,me-ranking,me-tabs,me-skeleton}.tsx`
- Modify: `apps/web/src/app/(dash)/formation/ma-formation/page.tsx` (remplace le placeholder), create `loading.tsx`

**Interfaces:**
- Consumes : Task 5 (`training_case_bests`, `training_profile_stats`, RPC `training_ranking`), Task 6 (`medalFor`, `moduleProgress`, `computeTrophies`, `bossUnlocked`), Task 8 (`PlayButton`), `lib/types/training` (`MEDAL_LABELS`, `CASE_KIND_LABELS`).
- Produces : `getModules()`, `getModule(code)`, `getAllCases()` (lib) ; `getMe(profileId)`, `MeData`, `MeTemplate({ data, vue })`.

- [ ] **Step 1: Promotion en `lib/services/training-public.ts`** — déplacer le corps de `get-modules.ts` et `get-module.ts` (inchangé, mêmes commentaires) ; ajouter :
```ts
/** Tous les cas actifs (id, module_id, kind, title, code du module) — pour la progression par module (Ma formation). */
export async function getAllCases(): Promise<{ id: string; moduleId: string; kind: CaseKind; title: string; sectionId: string | null }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('training_cases').select('id, module_id, kind, title, section_id, training_modules!inner(active)').eq('active', true).eq('training_modules.active', true).order('position')
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => ({ id: c.id, moduleId: c.module_id, kind: c.kind as CaseKind, title: c.title, sectionId: c.section_id }))
}
```
Types → `lib/types/training-public.ts` (le fichier `features/training-modules/types.ts` devient `export type { ModuleSummary, PublicBossFan, PublicCase, ModuleDetail } from '@/lib/types/training-public'` + `export type ModuleVue = 'cours' | 'cas'`). Mettre à jour les imports (`grep -rn "services/get-module" apps/web/src`). Tests : `pnpm --filter @glagency/web typecheck && lint`.

- [ ] **Step 2: Médailles dans Modules** — `modules/[code]/page.tsx` : en plus de `getModule(code)`, kickoff `getMyBests()` (nouveau, dans `features/training-modules/services/get-my-bests.ts` : `training_case_bests` du viewer, `select('case_id, best_total, best_objective, attempts')` — RLS propriétaire — → `Map<caseId, { bestTotal; attempts }>`) ; `ModuleTemplate` → `CasesList` reçoit `bests` ; `CaseRow` affiche à droite `Badge outline` « Or 92 » / « Argent 78 » / « Bronze 64 » / « 45 — à valider » (`medalFor` + `MEDAL_LABELS`) et `× attempts` en `text-muted-foreground` si > 1 ; le bouton « Jouer » devient « Rejouer » quand un best existe. Boss : `bossUnlocked(avg)` — passer `avgTotal` (depuis `training_profile_stats` du viewer, même service `getMyBests` renvoie `{ bests, avgTotal }`) → si verrouillé, bouton désactivé + texte « Se débloque à 60/100 de moyenne (actuelle : X) ». Encadrant sans droit Entraînement : `bests` vide, pas de bouton.

- [ ] **Step 3: `training-me/types.ts`, `services/get-me.ts`**

```ts
import type { Medal, ModuleProgress, Trophy } from '@glagency/core'
import type { CaseKind } from '@/lib/types/training'
export interface MeStats { casesDone: number; avgTotal: number | null; points: number; bossBest: number | null; bossDone: boolean; streakDays: number; activeDays: number; lastSessionAt: string | null }
export interface MeCase { id: string; title: string; kind: CaseKind; best: number | null; medal: Medal | null; attempts: number }
export interface MeModule { id: string; code: string; title: string; emoji: string | null; progress: ModuleProgress; cases: MeCase[] }
export interface MeSession { id: string; caseId: string; caseTitle: string; kind: CaseKind; status: string; total: number | null; objectiveReached: boolean | null; startedAt: string; moduleTitle: string }
export interface RankRow { profileId: string; displayName: string; points: number; casesDone: number; avgTotal: number | null; bossDone: boolean; streakDays: number; isNew: boolean }
export interface MeData {
  stats: MeStats; modules: MeModule[]; active: MeSession | null; history: MeSession[]; trophies: Trophy[]
  ranking: RankRow[]; myRank: number | null; totalCases: number; goldCount: number; bossUnlocked: boolean
}
export type MeVue = 'progression' | 'historique' | 'classement'
```
`get-me.ts` : **4 requêtes en parallèle** (RLS viewer) : `training_profile_stats` (`.eq('profile_id', me).maybeSingle()`), `training_case_bests` (`case_id, best_total, best_objective, attempts`), `training_sessions` (`id, case_id, kind, status, total, objective_reached, started_at, case_snapshot` `.eq('profile_id', me).order('started_at', { ascending: false }).limit(50)` — historique 50 dernières ; l'active = celle `status = 'active'` — 1 requête suffit), `supabase.rpc('training_ranking')` ; + `getModules()` et `getAllCases()` (lib, 2 requêtes) → `Promise.all` de 6. Assemblage : `modules` = modules actifs → cas du module (hors boss) → `moduleProgress(cases, bests)` + `MeCase` avec `medalFor` ; `goldCount` = bests ≥ 85 hors boss ; `trophies = computeTrophies({ casesDone, streakDays, goldCount, modulesComplete: modules.filter(m => m.progress.total > 0 && m.progress.done === m.progress.total).length, allDone: totalCases > 0 && casesDone >= totalCases, bossDone })` ; `history` : titre depuis `case_snapshot.title`/`moduleTitle` (pas de jointure) ; `myRank` = index+1 dans `ranking` ; `bossUnlocked(avgTotal)`. Le classement affiche des prénoms d'équipe (`display_name`) : normal en interne (GLA le fait), pas d'e-mail.

- [ ] **Step 4: `MeTemplate.tsx` + composants** — RSC + feuilles ; `?vue=` `progression` (défaut) | `historique` | `classement` (`me-tabs.tsx` client comme `module-tabs.tsx`).
  - `me-header.tsx` : bandeau « Reprendre » si `active` (titre du cas + `<Button asChild><Link href=/formation/session/[id]>Continuer</Link></Button>`) ; 4 chiffres : cas validés `casesDone/totalCases`, moyenne `avgTotal ?? '—'`, points, streak `streakDays j` (+ « meilleur : » non — YAGNI) ; sous-ligne trophées gagnés `n/8`.
  - `me-modules.tsx` : liste des modules : emoji + titre + barre `progress.pct` + `done/total · moy. avg · pts` ; en dessous les cas en chips `titre — Or 92` (`Badge outline`), « — » si non joué ; lien module (`/formation/modules/[code]?vue=cas`) ; boss : verrouillé/débloqué + `bossBest`.
  - `me-history.tsx` : table (`Table`) des 50 dernières sessions : date (`lib/format`), cas, sorte, statut (`scored` → note ; `failed` → « Raté » ; `abandoned` → « Abandonnée » ; `active` → « En cours »), lien « Voir » `/formation/session/[id]`.
  - `me-trophies.tsx` : grille 8 trophées (label + description, `earned` → plein, sinon `opacity-50`) — sous la progression.
  - `me-ranking.tsx` : table classement (rang, prénom, points, cas, moyenne, streak, boss ✓, « nouveau » badge si `isNew`), ma ligne `font-medium bg-muted/40`. Encart discret « Le classement sert aux récompenses (roue) — à venir. »
  - `me-skeleton.tsx`.
- Page `ma-formation/page.tsx` : `requireAccess('frm-entrainement')` → kickoff `getMe(profile.id)` → `Suspense` → `MeTemplate` ; `loading.tsx` = `MeSkeleton`.

- [ ] **Step 5: Vérifier** — `typecheck`, `lint`, `test` ; UAT : après 2-3 sessions notées, Ma formation montre progression/points/streak (jour), Modules montre les médailles, boss verrouillé/débloqué correct, classement cohérent avec `training_profile_stats`.

- [ ] **Step 6: Commit** (demander) — `feat(formation): Ma formation — progression, modules, historique, trophées, classement ; médailles dans Modules ; projection publique en lib`

---

### Task 11: Overview encadrant — roster, fiche chatter (bests, sessions, axes faibles), signalements, coût IA (admin), re-notation admin

**Files:**
- Create: `apps/web/src/features/training-overview/{types.ts, schema.ts, actions.ts, services/get-overview.ts, services/get-chatter.ts, OverviewTemplate.tsx}`, `components/{overview-roster,overview-chatter,overview-reports,overview-cost,overview-picker,overview-skeleton}.tsx`
- Modify: `apps/web/src/app/(dash)/formation/overview/page.tsx` (remplace le placeholder), create `loading.tsx`

**Interfaces:**
- Consumes : Task 5 (RPC `training_overview_roster`, `training_axis_profile`, `training_ai_cost`, `training_case_bests`, `training_sessions`, `training_reports`), Task 7 (`scoreSessionById` pour la re-notation), `requireAdminProfile`, `requirePageProfile('frm-suivi')`, `hasPageAccess`, `Profile.role`.
- Produces : `getOverview()`, `getChatter(profileId)`, `OverviewData`, `ChatterDetail`, actions `resolveReport`, `rescoreSession`.

- [ ] **Step 1: `types.ts`**
```ts
import type { CaseKind } from '@/lib/types/training'
export interface RosterRow { profileId: string; displayName: string; isNew: boolean; arrivedAt: string | null; models: string[]; casesDone: number; avgTotal: number | null; points: number; bossBest: number | null; bossDone: boolean; streakDays: number; lastSessionAt: string | null; sessionsScored: number }
export interface ReportRow { id: string; sessionId: string; profileId: string; displayName: string; message: string; createdAt: string; resolvedAt: string | null; caseTitle: string; total: number | null }
export interface CostRow { day: string; model: string; kind: string; calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number }
export interface OverviewData { roster: RosterRow[]; reports: ReportRow[]; cost: { rows: CostRow[]; estimatedUsd: number } | null; totalCases: number }
export interface ChatterDetail {
  profileId: string; displayName: string
  bests: { caseId: string; caseTitle: string; moduleTitle: string; kind: CaseKind; bestTotal: number; attempts: number; lastAt: string }[]
  sessions: { id: string; caseTitle: string; kind: CaseKind; status: string; total: number | null; startedAt: string }[]
  axes: { key: string; name: string; avg: number; n: number }[]
}
```
- [ ] **Step 2: `services/get-overview.ts`, `get-chatter.ts`** — `getOverview(isAdmin)` : `Promise.all` de `rpc('training_overview_roster')`, `training_reports` (`select('id, session_id, profile_id, message, created_at, resolved_at, training_sessions!inner(total, case_snapshot)')` — RLS : admin/encadrant, `.order('created_at', { ascending: false }).limit(100)`, `displayName` : depuis le roster (map profileId → nom, sinon '—'), `caseTitle` : `case_snapshot.title`), `training_cases` count actifs, et si `isAdmin` `rpc('training_ai_cost', { p_since: <30 jours> })` → `estimatedUsd` = Σ (input × prix_in + output × prix_out + cache_read × prix_in × 0,1) / 1e6 avec `{ 'claude-haiku-4-5': [1, 5], 'claude-sonnet-5': [3, 15] }` (prix liste, tolérance promo — commentaire). `getChatter(profileId)` : `training_case_bests` (`.eq('profile_id', id)` + embed `training_cases(title, kind, training_modules(title))`), `training_sessions` (50 dernières, `case_snapshot`), `rpc('training_axis_profile', { p_profile: id })` ; `displayName` via `training_overview_roster` filtré (ou passé en param depuis la page — plus simple : `getChatter(profileId, displayName)`).

- [ ] **Step 3: `actions.ts`, `schema.ts`** — `resolveInput = z.object({ reportId: z.uuid() })`, `rescoreInput = z.object({ sessionId: z.uuid() })`. `resolveReport` : `requirePageProfile('frm-suivi')` (RLS : encadrant/admin) → `update({ resolved_at: now, resolved_by: profile.id })` → `revalidatePath('/formation/overview')`. `rescoreSession` : `requireAdminProfile()` → `scoreSessionById(sessionId, { force: true })` (erreur → `BusinessError('La re-notation a échoué')`) → `revalidatePath` overview + `/formation/session/[id]` + `/formation/ma-formation` ; toast « Session re-notée : X/100 ».

- [ ] **Step 4: `OverviewTemplate.tsx` + composants** — `?chatter=<profileId>` = fiche ; sinon roster.
  - `overview-picker.tsx` (client) : `Combobox` (`components/ui/combobox`) « Tous les chatters / <nom> » → `router.replace(?chatter=)` — visible pour manager, sous-manager, admin (rôle) ; un policier / lecteur voit le roster sans sélecteur (RLS 0117 borne de toute façon la lecture des sessions à l'encadrement).
  - `overview-roster.tsx` : `Table` : chatter (badge « nouveau » + `arrivedAt` si `isNew`), modèles, cas validés `x/total`, moyenne, points, streak, boss (best / ✓), dernière session (`formatRelative`), sessions notées ; ligne cliquable → `?chatter=`. Tri : nouveaux d'abord (RPC), puis nom. Compteur en tête : « N chatters en formation, M nouveaux ».
  - `overview-chatter.tsx` : en-tête nom + `Button` « Tous » ; 3 blocs : **Points faibles** (axes triés par moyenne croissante, barre + `avg/25 · n`), **Cas** (table best/attempts/date, lien « Voir » vers la dernière session ? — non : lien module), **Sessions** (table 50 dernières : date, cas, sorte, statut/note, lien `/formation/session/[id]`).
  - `overview-reports.tsx` : signalements ouverts d'abord (`resolvedAt null`) : chatter, cas, note, message, date, lien « Voir la session », bouton « Résolu » (`resolveReport`, `useTransition`) ; admin : bouton « Re-noter » (`rescoreSession`, AlertDialog « Relancer la notation IA de cette session ? ») ; résolus repliés (`details`).
  - `overview-cost.tsx` (admin) : encart 30 jours : appels, tokens in/out/cache, coût estimé `$` ; petite table par jour × modèle (10 lignes max, `details` pour le reste).
  - `overview-skeleton.tsx`.
- Page : `requireAccess('frm-suivi')` → `isAdmin = profile.role === 'admin'` ; `showPicker = ['admin','manager','sous-manager'].includes(profile.role)` (vérifier les libellés exacts de rôle dans `lib/roles.ts`) ; kickoff `getOverview(isAdmin)` et, si `?chatter`, `getChatter(id, name)` (nom résolu après le roster — donc `getChatter` prend le roster en dépendance : `getOverview().then(o => getChatter(id, o.roster.find(...)?.displayName ?? '—'))`, ou `getChatter` sans nom et la fiche prend le nom dans le roster côté Template — **choisir cette 2e option**, plus simple : la Template reçoit `overview` + `chatter` en parallèle).

- [ ] **Step 5: Vérifier** — `typecheck`, `lint`, `test` ; UAT en tant que manager avec droit Suivi : roster (les chatters `frm-entrainement`), fiche d'un chatter, sessions lisibles (RLS 0117 encadrant), signalement → Résolu ; admin : coût IA, Re-noter (la note change si l'IA diffère, `training_case_bests` recalculé par le trigger, `scored_at` avance) ; en tant que chatter → `/formation/overview` redirige (pas le droit).

- [ ] **Step 6: Commit** (demander) — `feat(formation): Overview encadrant — roster, fiche chatter (bests, sessions, axes faibles), signalements, coût IA, re-notation admin`

---

### Task 12: Docs, vérification globale, recette

**Files:**
- Modify: `CLAUDE.md` (bloc « 3 faces » : Formation = Overview + Ma formation + Modules + Catalogue + Membres ; règle « secrets IA en tables `training_*_secrets` admin-only, appels IA en `lib/ai/` uniquement, tracés dans `training_ai_calls` » ; « aucun streaming / Route Handler pour l'entraînement »), `docs/superpowers/specs/2026-08-18-formation-entrainement-design.md` (statut « implémenté sur `feature/formation-catalogue`, migrations 0116-0118 UAT seulement, à recetter »), `docs/superpowers/specs/2026-08-17-formation-catalogue-design.md` (note : secrets déplacés en 0116), `apps/web/.env.example` (+ `ANTHROPIC_API_KEY`), `docs/guidelines-standard-feature.md` (§ précédent « action partagée en lib » : `lib/training/start-session.ts` à côté de `lib/impersonation/actions.ts`).

- [ ] **Step 1: Docs** — éditer les 5 fichiers ci-dessus (diff minimal, phrases courtes).
- [ ] **Step 2: Vérification globale** — `pnpm --filter @glagency/web lint && pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web test` ; `pnpm --filter @glagency/core test` ; `pnpm --filter @glagency/db test && typecheck` ; `pnpm --filter @glagency/web build` (Next 16 — `typedRoutes`, `server-only` dans un composant client = erreur de build → à corriger) ; `cd packages/db && supabase db push --db-url "$DB" --dry-run` → « Remote database is up to date » ; `wc -l` sur les fichiers créés (< 300 lignes, sauf migrations et `prompts.ts` — accepté, textes GLA) ; `grep -rn "fan_brief\|expected\|scoring_notes\|budget_cap\|nego_where\|meet_where\|meet_when\|derails" apps/web/src --include=*.tsx` → aucun composant client / RSC public ne lit un secret (seuls `training-catalog` (admin) et `result-view` (`expected` après notation) sont légitimes).
- [ ] **Step 3: Recette (Benoit, UAT)** — checklist spec §9 recopiée dans le message de fin ; ajouter `ANTHROPIC_API_KEY` sur Vercel (preview) ; ne rien merger.
- [ ] **Step 4: Commit** (demander) — `docs(formation): entraînement — CLAUDE.md, spec (statut), env example`

---

## Self-review (fait à l'écriture du plan)

**Couverture de la spec** (§ → tasks) : §3.1 secrets → T1, T2 ; §3.2 sessions/threads/messages/scores/reports/ai_calls → T3, T7 ; §3.3 bests/stats/trigger/RPC → T5 ; §3.4 RLS → T3, T5 ; §4 moteur IA (Haiku fan, ELIM, Sonnet notation structurée, boss, traçabilité, robustesse) → T4, T7 ; §5 flux (démarrer/reprendre, chrono, révélation, élimination, terminer/abandonner, notation, écran raté) → T7, T8, T9 ; §6 Ma formation (progression, streak, médailles, trophées, classement, historique, boss verrouillé) → T6, T10 ; §7 Overview + signalement + coût + re-notation → T9 (signaler), T11 ; §8 archi/perf/tests → transversal (Global Constraints), T12 ; §9 recette → T12. **Rien sans task.**

**Placeholders** : aucun « TBD/TODO » ; les composants d'UI décrits en prose (Task 8 Steps 5-6-8 popover, Task 9 Steps 3-6, Task 10 Step 4, Task 11 Step 4) sont des descriptions **complètes** (contenu, données, actions, états) — le code exact est laissé à l'implémenteur pour rester sous 300 lignes par fichier et coller à la DA existante (Badge/Table/Dialog déjà en place dans `training-catalog`).

**Cohérence des types / signatures** (vérifiée à la relecture) : `ScoreResult.axes` = `{ key, name, score }` (T4) → `training_thread_axis_scores(axis_key, axis_name, score)` (T3, T7) → `AxisScore` (T7 types) → `ScorePanel` (T9) ✓ ; `FanReply.faultCode: FaultCode | null` (T4) → `training_threads.lost_reason` (`text`, check `FAULT_CODES + timeout`) ✓ ; `CaseSnapshot` en `lib/types/training` (T4) utilisé par `lib/training/start-session` (T7), `get-session` (T7), UI (T8/T9), `get-me` (T10 : `case_snapshot.title/moduleTitle`) ✓ ; `startSession` renvoie `{ sessionId, resumed }` → `PlayButton` (T8) ✓ ; `sendMessage` renvoie `SendResult` (`chatter`, `fan | null`, `thread`, `sessionStatus`, `sessionEnded`, `serverNow`) → `session-view` (T8) ✓ ; `timeoutThread` renvoie `{ sessionStatus, sessionEnded }` ✓ ; `scoreSessionById(id, { force })` (T7) ← `scoreSession` (T7) et `rescoreSession` (T11) ✓ ; RPC : `training_ranking()` → `RankRow` (T10), `training_overview_roster()` → `RosterRow` (T11), `training_axis_profile(p_profile)` → `ChatterDetail.axes` (T11), `training_ai_cost(p_since)` → `CostRow` (T11) ✓ ; `moduleProgress(cases, bests: Map<id, { bestTotal }>)` (T6) ← `get-me` (T10) ✓ ; `medalFor(total)` ← T9, T10, T11 ✓.

**Numérotation** : la « Carte des fichiers » en tête utilise les numéros de tasks FINAUX ci-dessous (corrigée) :
T1 0116 · T2 catalogue secrets · T3 0117 · T4 types + lib/ai · T5 0118 · T6 core rules · T7 sessions (moteur, service, actions, `lib/training/start-session`) · T8 UI jeu + route + PlayButton · T9 résultat/raté/signalement · T10 Ma formation + lib/services/training-public · T11 Overview · T12 docs.
