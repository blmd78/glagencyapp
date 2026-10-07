# Import de scripts dans le CRM — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un écran « Importer un script » dans le CRM : connexion Notion par un admin (OAuth), liste des scripts du Notion d'agence, préparation (conversion + rapport), envoi désactivé dans le Studio MyPuls de la modèle, historique.

**Architecture:** les briques de la commande `script-mypuls` passent dans un package partagé `@glagency/scripts` (lecture Notion, conversion, envoi, session MyPuls « scripts »). Le CRM (`features/scripts-import/`) les orchestre par Server Actions. L'OAuth Notion passe par deux Route Handlers. La migration `0184` ajoute `notion_connection` (secret, service role seul) et `script_imports` (historique, RLS par périmètre de modèles).

**Tech Stack:** Next.js 16 (App Router, Server Actions, `runAction`), Supabase (RLS), Vitest, Zod v4, `@anthropic-ai/sdk` ^0.117.1, API Notion (`Notion-Version: 2022-06-28`, OAuth), shadcn/ui existant.

**Spec:** `docs/superpowers/specs/2026-10-07-import-scripts-crm-design.md` (suite de `2026-10-06-script-mypuls-design.md`).

## Global Constraints

- Base de travail : la branche `feature/script-mypuls` (commande déjà codée, non commitée) — ce plan s'empile dessus.
- Admin : toutes les modèles ; manager : seulement ses modèles (`profile_creators`) ; manager sans modèle assignée : aucune ; RLS = vrai cloisonnement.
- Connexion Notion : **admin réel seulement** (`requireAdminProfileLive`, refus en « en tant que ») ; clé chiffrée par `encryptSecret` (`apps/web/src/lib/snap-crypto.ts`), jamais renvoyée au navigateur.
- `notion_connection` et la ligne `ingest_session` « scripts » : RLS activée **sans policy** (service role seul).
- Envoi : **à toute heure** (pas de fenêtre de nuit — session à part, décision Benoit 2026-10-07) ; seulement depuis une ligne `prepared`, sans erreur, de l'appelant ; identifiant MyPuls enregistré dès la création.
- Session MyPuls « scripts » : `ingest_session.id = 'scripts'`, amorçage `MYPULS_SCRIPTS_SESSION_COOKIE` (Vercel) ; à l'envoi, **vérifiée** et renouvelée seulement si morte ; gardée en vie par le Worker si rafraîchie depuis plus de 12 h (avertissement seulement en cas d'échec).
- `maxDuration = 800` sur la page (Pro ; 300 si Hobby).
- Conventions web : `runAction` + `revalidatePath`, `BusinessError` pour les refus métier, logique de décision dans des modules purs testés sans mock (comme `snap-codes/access.ts`), aucun import d'une autre feature, pas de barrel, UI reprise à l'identique de l'existant (§ 9 des guidelines : `Card`, `Button`, `DataTable`, `Badge`, `Select`).
- Migration : `0184`, `text` + `check` (jamais d'enum), UAT d'abord ; prod sur accord explicite de Benoit.
- Commits : sur « commit » de Benoit uniquement.

## Review Focus

1. Manager qui forge un `creatorId` hors de son périmètre dans `prepareImport` ou `sendImport` → refus par la RLS (insert/update), pas seulement par l'UI (Task 5, test SQL).
2. Double clic sur « Envoyer » → un seul envoi : la ligne passe `prepared → sending` par un `update … where status = 'prepared'` qui ne touche qu'une ligne (Task 7, test de la règle `canSend` + garde SQL).
3. Callback OAuth rejoué, `state` manquant ou forgé, ou ouvert par un non-admin → refus sans écrire (Task 6, tests `oauth.ts`).
4. Envoi coupé par la durée Vercel → ligne restée `sending` affichée « interrompu » avec l'identifiant MyPuls (Task 8, test `importStatus`).
5. Dossier Notion dont le nom ne correspond à aucune modèle, ou à deux → aucune présélection, choix manuel (Task 3, tests `matchCreatorByName`).

---

### Task 1: (supprimée)

Pas de fenêtre de nuit pour l'import (décision Benoit, 2026-10-07 : l'import a sa propre session et n'écrit que dans le Studio de scripts). `nightlyWindow` reste où il est, dans `identity-backfill.ts`.

---

### Task 2: Package `@glagency/scripts` (déplacement des briques de la commande)

**Files:**
- Create: `packages/scripts/package.json`, `packages/scripts/tsconfig.json` (copie de `packages/mypuls/tsconfig.json`), `packages/scripts/src/index.ts`
- Move (`git mv`) : `apps/ingestion/src/script-notion.ts` → `packages/scripts/src/notion.ts` ; `script-convert.ts` → `convert.ts` ; `script-send.ts` → `send.ts` ; et leurs `.test.ts`
- Create: `packages/scripts/src/report.ts` (+ `report.test.ts`) — `formatReport` et `describeFailure` déplacés de `apps/ingestion/src/script-mypuls.ts`, avec leurs tests
- Modify: `apps/ingestion/src/script-mypuls.ts`, `apps/ingestion/src/script-mypuls.test.ts`, `apps/ingestion/package.json` (dépendance `"@glagency/scripts": "workspace:*"`)

**Interfaces:**
- Produces (`@glagency/scripts`) : tout ce qu'exportaient `script-notion.ts`, `script-convert.ts`, `script-send.ts`, plus `formatReport(s, errors, notes?)`, `describeFailure(r, name)`.

- [ ] **Step 1: `packages/scripts/package.json`**

```json
{
  "name": "@glagency/scripts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./session": "./src/session.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.117.1",
    "@glagency/core": "workspace:*",
    "@glagency/db": "workspace:*",
    "@glagency/mypuls": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Déplacer** avec `git mv` les six fichiers (le dossier doit exister : `mkdir -p packages/scripts/src`), puis corriger les imports relatifs internes (`./script-send` → `./send`, etc.). Déplacer `formatReport`, `describeFailure` (et leur `import { INCOMPLETE_PREFIX }`) dans `packages/scripts/src/report.ts`, et leurs blocs de tests de `script-mypuls.test.ts` vers `report.test.ts`.
- [ ] **Step 3: `packages/scripts/src/index.ts`**

```ts
// Briques partagées par la commande `script-mypuls` et l'import du CRM (pas de barrel côté web : point d'entrée du package).
export { blocksToText, fetchNotionPage, notionPageId, type NotionBlock } from './notion'
export { CONVERT_EXAMPLE, CONVERT_MODEL, CONVERT_SYSTEM, SCRIPT_DRAFT_SCHEMA, convertToDraft, type ConvertClient } from './convert'
export { RATE_LIMIT_DELAYS_MS, sendScript, studioWriter, type Cleanup, type SendResult, type StudioWriter } from './send'
export { describeFailure, formatReport } from './report'
```

- [ ] **Step 4: Commande** — `script-mypuls.ts` importe désormais `convertToDraft`, `fetchNotionPage`, `notionPageId`, `sendScript`, `studioWriter`, `formatReport`, `describeFailure` depuis `@glagency/scripts` ; garder `parseArgs`, `resolveCreator` et `run()`. `pnpm install` pour lier le package.
- [ ] **Step 5: Lancer** : `pnpm --filter @glagency/scripts test && pnpm --filter @glagency/scripts typecheck && pnpm --filter @glagency/ingestion test && pnpm --filter @glagency/ingestion typecheck` → PASS (mêmes nombres de tests qu'avant, répartis entre les deux packages).
- [ ] **Step 6: Préparer le commit** — `refactor(scripts): briques de la commande dans @glagency/scripts`.

---

### Task 3: Liste Notion par dossier et rattachement dossier → modèle

**Files:**
- Modify: `packages/scripts/src/notion.ts` (+ test) — `listNotionScripts`
- Create: `packages/core/src/scripts/creator-match.ts` (+ test) — `matchCreatorByName`
- Modify: `packages/core/src/index.ts` ; `apps/ingestion/src/script-mypuls.ts` (`resolveCreator` s'appuie sur `matchCreatorByName`)

**Interfaces:**
- Produces: `listNotionScripts(token: string, rootId: string, fetchFn?: typeof fetch): Promise<NotionFolder[]>` avec `type NotionFolder = { id: string; title: string; scripts: Array<{ id: string; title: string }> }` ; `matchCreatorByName<T extends { name: string }>(rows: T[], name: string): { kind: 'found'; row: T } | { kind: 'none' } | { kind: 'ambiguous'; rows: T[] }`.

- [ ] **Step 1: Tests `creator-match.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { matchCreatorByName } from './creator-match'

const rows = [{ name: 'Emma' }, { name: 'Léa' }, { name: 'Sarah' }, { name: 'sarah' }]
describe('matchCreatorByName', () => {
  it('ignore casse, accents et espaces autour (dossier « EMMA » ↔ Emma, « LEA » ↔ Léa)', () => {
    expect(matchCreatorByName(rows, ' EMMA ')).toEqual({ kind: 'found', row: { name: 'Emma' } })
    expect(matchCreatorByName(rows, 'LEA')).toEqual({ kind: 'found', row: { name: 'Léa' } })
  })
  it('aucune ou plusieurs correspondances → pas de présélection', () => {
    expect(matchCreatorByName(rows, 'OUTILS MANAGERS')).toEqual({ kind: 'none' })
    expect(matchCreatorByName(rows, 'Sarah')).toEqual({ kind: 'ambiguous', rows: [{ name: 'Sarah' }, { name: 'sarah' }] })
  })
})
```

- [ ] **Step 2: Tests `listNotionScripts`** (dans `packages/scripts/src/notion.test.ts`) — un faux `fetch` répondant :
  - `…/blocks/root/children?page_size=100` → deux `child_page` (« EMMA » id `f1`, « OUTILS MANAGERS » id `f2`) et un `paragraph` ignoré ;
  - `…/blocks/f1/children?page_size=100` → `has_more: true`, `next_cursor: 'c2'`, un `child_page` « Script de vente · Soirée révisions » (id `s1`) ;
  - `…/blocks/f1/children?page_size=100&start_cursor=c2` → un `child_page` « KYC » (id `s2`) ;
  - `…/blocks/f2/children?page_size=100` → un `child_page` « Prompt – Script de vente V3 » (id `p1`).
  Attendu : `[{ id: 'f1', title: 'EMMA', scripts: [{ id: 's1', title: 'Script de vente · Soirée révisions' }, { id: 's2', title: 'KYC' }] }, { id: 'f2', title: 'OUTILS MANAGERS', scripts: [{ id: 'p1', title: 'Prompt – Script de vente V3' }] }]`. Un second test : 404 sur la racine → `Notion 404 sur /v1/blocks/root/children — page partagée avec l’intégration ? (Partager → Connexions)`.
- [ ] **Step 3: Lancer — échec attendu** sur les deux fichiers.
- [ ] **Step 4: Implémentation**

```ts
// packages/core/src/scripts/creator-match.ts
/**
 * Dossier Notion ↔ modèle du CRM, par le nom (« EMMA » ↔ Emma) : casse, accents et espaces ignorés.
 * Ambigu ou absent → pas de présélection, le manager choisit (jamais de rattachement deviné).
 */
const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()

export function matchCreatorByName<T extends { name: string }>(
  rows: T[],
  name: string,
): { kind: 'found'; row: T } | { kind: 'none' } | { kind: 'ambiguous'; rows: T[] } {
  const hits = rows.filter((r) => fold(r.name) === fold(name))
  const [only] = hits
  if (!only) return { kind: 'none' }
  return hits.length === 1 ? { kind: 'found', row: only } : { kind: 'ambiguous', rows: hits }
}
```

Dans `notion.ts`, extraire de `children()` une fonction `listChildren(token, id, fetchFn)` (pagination seule, sans récursion) et ajouter :

```ts
export type NotionFolder = { id: string; title: string; scripts: Array<{ id: string; title: string }> }

/**
 * Notion d'agence : la racine contient un dossier par modèle (et OUTILS MANAGERS) ; chaque dossier
 * contient les scripts en sous-pages. Deux niveaux, pas plus — les pages média sous un script ne
 * sont pas des scripts.
 */
export async function listNotionScripts(token: string, rootId: string, fetchFn: typeof fetch = fetch): Promise<NotionFolder[]> {
  const pages = (blocks: NotionBlock[]) =>
    blocks.filter((b) => b.type === 'child_page').map((b) => ({ id: b.id, title: String((b.child_page as { title?: string })?.title ?? '') }))
  const folders = pages(await listChildren(token, rootId, fetchFn))
  return Promise.all(folders.map(async (f) => ({ ...f, scripts: pages(await listChildren(token, f.id, fetchFn)) })))
}
```

Exporter `matchCreatorByName` depuis `@glagency/core`, `listNotionScripts` et `NotionFolder` depuis `@glagency/scripts`. `resolveCreator` (commande) : remplacer son filtre par `matchCreatorByName`, mêmes messages d'erreur.
- [ ] **Step 5: Lancer** : tests et typecheck de core, scripts, ingestion → PASS.
- [ ] **Step 6: Préparer le commit** — `feat(scripts): liste des scripts du Notion d'agence par dossier de modèle`.

---

### Task 4: Session MyPuls « scripts » et garde en vie par le Worker

**Files:**
- Create: `packages/scripts/src/session.ts` (+ `session.test.ts`)
- Modify: `apps/ingestion/src/worker.ts` (dans `runAndRecord`, après le `refreshCookie` existant, l.344)

**Interfaces:**
- Produces (`@glagency/scripts/session`) : `SCRIPTS_SESSION_ID = 'scripts'` ; `interface SessionStore { read(): Promise<{ cookie: string; refreshedAt: string } | null>; write(cookie: string): Promise<void> }` ; `ingestSessionStore(db: ReturnType<typeof createAdminClient>, id: string): SessionStore` ; `scriptsSessionForSend(store: SessionStore, seed?: string, deps?: SessionDeps): Promise<string>` ; `keepScriptsSessionAlive(store: SessionStore, now?: Date, deps?: SessionDeps): Promise<'absente' | 'récente' | 'renouvelée'>`.

- [ ] **Step 1: Tests** (`session.test.ts`), avec un `SessionStore` en mémoire et des `deps` factices `{ rememberMeLogin, readCookie, verifySession }` :
  - `scriptsSessionForSend` :
    - ligne présente et session valide (`verifySession` → true) → renvoyée telle quelle, **ni `rememberMeLogin` ni écriture** ;
    - ligne présente, session morte, REMEMBERME présent → `rememberMeLogin` appelé, cookie frais écrit et renvoyé ;
    - ligne vide + amorçage `seed = 'PHPSESSID=a; REMEMBERME=r1'` (session morte) → renouvelée par `r1` et écrite ;
    - ligne présente → l'amorçage est ignoré ;
    - ni ligne ni amorçage → `Session MyPuls « scripts » absente — amorcer MYPULS_SCRIPTS_SESSION_COOKIE (connexion en navigation privée).` ;
    - session morte sans REMEMBERME → `Session MyPuls « scripts » expirée sans REMEMBERME — ré-amorcer MYPULS_SCRIPTS_SESSION_COOKIE.` ;
  - `keepScriptsSessionAlive` : ligne vide → `'absente'` sans appel réseau ; rafraîchie il y a 3 h → `'récente'` sans appel réseau ; il y a 13 h → `rememberMeLogin`, écriture, `'renouvelée'`.
- [ ] **Step 2: Lancer — échec attendu.**
- [ ] **Step 3: Implémentation**

```ts
// packages/scripts/src/session.ts
import type { createAdminClient } from '@glagency/db'
import { readCookie, rememberMeLogin, verifySession } from '@glagency/mypuls'

/**
 * Session MyPuls de l'import de scripts — une 2e ligne de `ingest_session` (service role seul, 0109),
 * DISTINCTE de celle du relevé de nuit : changer de modèle (`switchCreator`) dans l'une ne bouscule
 * pas l'autre. Série « remember me » à elle : amorcée une fois par un login humain (Turnstile),
 * renouvelée avant chaque envoi et chaque nuit par le Worker (expiration glissante de 7 j).
 * Aucun import du SDK Anthropic ici : le Worker importe ce module.
 */
export const SCRIPTS_SESSION_ID = 'scripts'

export interface SessionStore {
  read(): Promise<{ cookie: string; refreshedAt: string } | null>
  write(cookie: string): Promise<void>
}
export interface SessionDeps {
  rememberMeLogin: typeof rememberMeLogin
  readCookie: typeof readCookie
  verifySession: typeof verifySession
}
const DEFAULT_DEPS: SessionDeps = { rememberMeLogin, readCookie, verifySession }

type Db = ReturnType<typeof createAdminClient>
export function ingestSessionStore(db: Db, id: string): SessionStore {
  return {
    async read() {
      const { data, error } = await db.from('ingest_session' as never).select('cookie, refreshed_at').eq('id', id).maybeSingle()
      if (error) throw new Error(`ingest_session lecture : ${error.message}`)
      const row = data as { cookie?: string; refreshed_at?: string } | null
      return row?.cookie ? { cookie: row.cookie, refreshedAt: row.refreshed_at ?? new Date(0).toISOString() } : null
    },
    async write(cookie) {
      const { error } = await db
        .from('ingest_session' as never)
        .upsert({ id, cookie, refreshed_at: new Date().toISOString() } as never, { onConflict: 'id' })
      if (error) throw new Error(`ingest_session écriture : ${error.message}`)
    },
  }
}

/** Renouvelle par le REMEMBERME et enregistre le cookie frais. */
async function renew(store: SessionStore, cookie: string, deps: SessionDeps): Promise<string> {
  const remember = deps.readCookie(cookie, 'REMEMBERME')
  if (!remember) throw new Error('Session MyPuls « scripts » expirée sans REMEMBERME — ré-amorcer MYPULS_SCRIPTS_SESSION_COOKIE.')
  const fresh = await deps.rememberMeLogin(remember)
  await store.write(fresh.cookie)
  return fresh.cookie
}

/**
 * Session pour un envoi : VÉRIFIÉE d'abord, renouvelée seulement si elle est morte. Un import ne
 * fait donc pas tourner le REMEMBERME pendant que le Worker pourrait le faire (pas de fenêtre de
 * nuit à respecter) — et un PHPSESSID déjà en main reste valide si le REMEMBERME tourne entre-temps.
 */
export async function scriptsSessionForSend(store: SessionStore, seed?: string, deps: SessionDeps = DEFAULT_DEPS): Promise<string> {
  const cookie = (await store.read())?.cookie ?? seed?.trim() ?? null
  if (!cookie) throw new Error('Session MyPuls « scripts » absente — amorcer MYPULS_SCRIPTS_SESSION_COOKIE (connexion en navigation privée).')
  if (await deps.verifySession(cookie)) return cookie
  return renew(store, cookie, deps)
}

const KEEPALIVE_AFTER_MS = 12 * 3_600_000

/** Garde en vie nocturne (Worker) : rien tant que l'import n'est pas amorcé, ni si la session a moins de 12 h. */
export async function keepScriptsSessionAlive(
  store: SessionStore,
  now: Date = new Date(),
  deps: SessionDeps = DEFAULT_DEPS,
): Promise<'absente' | 'récente' | 'renouvelée'> {
  const row = await store.read()
  if (!row) return 'absente'
  if (now.getTime() - new Date(row.refreshedAt).getTime() < KEEPALIVE_AFTER_MS) return 'récente'
  await renew(store, row.cookie, deps)
  return 'renouvelée'
}
```

Worker (`apps/ingestion/src/worker.ts`, dans `runAndRecord`, juste après le bloc `try { cookie = await refreshCookie(...) }`) :

```ts
  // Garde en vie de la session de l'import de scripts (CRM) — jamais bloquante pour le relevé.
  try {
    await keepScriptsSessionAlive(ingestSessionStore(createAdminClient(), SCRIPTS_SESSION_ID))
  } catch (e) {
    console.warn(`[worker] session « scripts » non renouvelée : ${(e as Error).message}`)
  }
```

avec `import { SCRIPTS_SESSION_ID, ingestSessionStore, keepScriptsSessionAlive } from '@glagency/scripts/session'` et la dépendance `"@glagency/scripts": "workspace:*"` déjà ajoutée (Task 2).
- [ ] **Step 4: Lancer** : `pnpm --filter @glagency/scripts test && pnpm --filter @glagency/ingestion test && pnpm --filter @glagency/ingestion typecheck` → PASS. Vérifier que le bundle du Worker ne tire pas le SDK : `pnpm --filter @glagency/ingestion exec wrangler deploy --dry-run --outdir /tmp/wrangler-dry 2>&1 | tail -5` → taille du bundle comparable (± 50 Ko) à celle du dernier déploiement (2 078 Ko).
- [ ] **Step 5: Préparer le commit** — `feat(scripts): session MyPuls « scripts » à part, gardée en vie par le Worker`.

---

### Task 5: Migration `0184` — `notion_connection` et `script_imports`

**Files:**
- Create: `packages/db/supabase/migrations/0184_import_scripts.sql`, `packages/db/supabase/tests/0184_import_scripts.test.sql`
- Modify: `packages/db/src/types.ts` (régénéré)

- [ ] **Step 1: Migration** (style de `0183_identite_fiabilite.sql`) :

```sql
-- 0184 — Import de scripts Notion → MyPuls depuis le CRM (spec 2026-10-07-import-scripts-crm-design.md).
--
-- notion_connection : la connexion OAuth au Notion de l'agence (une ligne). La clé est CHIFFRÉE par
-- le serveur (AES-256-GCM, SNAP_CODES_SECRET hors base). RLS activée SANS policy : service role seul,
-- comme ingest_session (0109) — l'écran admin la lit par le serveur après contrôle du rôle.
create table if not exists public.notion_connection (
  id text primary key default 'agence' check (id = 'agence'),
  access_token_encrypted text not null,
  workspace_id text not null,
  workspace_name text not null,
  bot_id text not null,
  root_page_id text,
  connected_by uuid references public.profiles(id),
  connected_at timestamptz not null default now()
);
alter table public.notion_connection enable row level security;
comment on table public.notion_connection is
  'Connexion OAuth au Notion de l''agence (import de scripts) — clé chiffrée, service-role only (0184).';

-- script_imports : historique et état de chaque import. La RLS fait le vrai cloisonnement par modèle :
-- admin partout, manager sur SES modèles (profile_creators) — même miroir que creators_scoped_read.
create table if not exists public.script_imports (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  creator_id uuid not null references public.creators(id),
  notion_page_id text not null,
  notion_title text not null,
  status text not null default 'prepared' check (status in ('prepared', 'sending', 'sent', 'failed')),
  summary jsonb not null,
  notes jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  draft jsonb not null,
  usage jsonb,
  mypuls_script_id bigint,
  failed_step text,
  error text,
  cleanup jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists script_imports_created_by_idx on public.script_imports (created_by, created_at desc);
create index if not exists script_imports_creator_idx on public.script_imports (creator_id);
alter table public.script_imports enable row level security;

create policy script_imports_read on public.script_imports for select to authenticated
  using ((select public.is_admin()) or created_by = (select auth.uid()));

create policy script_imports_insert on public.script_imports for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and ((select public.is_admin()) or exists (
      select 1 from public.profile_creators pc where pc.profile_id = (select auth.uid()) and pc.creator_id = script_imports.creator_id
    ))
  );

create policy script_imports_update on public.script_imports for update to authenticated
  using (created_by = (select auth.uid()))
  with check (
    created_by = (select auth.uid())
    and ((select public.is_admin()) or exists (
      select 1 from public.profile_creators pc where pc.profile_id = (select auth.uid()) and pc.creator_id = script_imports.creator_id
    ))
  );
```

- [ ] **Step 2: Test SQL** (`0184_import_scripts.test.sql`, transaction annulée, style de `0183_identite_fiabilite.test.sql`) : en se faisant passer pour un manager (`set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid manager>"}'`) avec une modèle assignée A et une non assignée B :
  - insertion pour A acceptée, pour B refusée (`new row violates row-level security policy`) ;
  - lecture : le manager ne voit que ses lignes ;
  - `notion_connection` : `select` → 0 ligne pour `authenticated` ;
  - admin : insertion pour B acceptée.
  Les uuid de test sont créés dans la transaction (profils et modèles fictifs), comme le test de `0183`.
- [ ] **Step 3: UAT** — dry-run puis application sur l'UAT (pooler session, `supabase db push --db-url`, cf. `AGENTS.md` § Migrations) ; lancer le test SQL sur l'UAT (`psql "<url UAT>" -f packages/db/supabase/tests/0184_import_scripts.test.sql`) → tous les contrôles OK, transaction annulée. **Prod : pas maintenant** (accord explicite de Benoit, au moment de la mise en prod).
- [ ] **Step 4: Types** — régénérer `packages/db/src/types.ts` depuis l'UAT (même URL de pooler) ; vérifier que `script_imports` et `notion_connection` y figurent ; `pnpm typecheck` → PASS.
- [ ] **Step 5: Préparer le commit** — `feat(db): 0184 — connexion Notion et historique des imports de scripts`.

---

### Task 6: OAuth Notion (connexion par un admin)

**Files:**
- Create: `apps/web/src/features/scripts-import/oauth.ts` (+ `oauth.test.ts`) — pur
- Create: `apps/web/src/app/api/notion/connect/route.ts`, `apps/web/src/app/api/notion/callback/route.ts`
- Create: `apps/web/src/features/scripts-import/services/notion-connection.ts` — lecture/écriture serveur de la connexion
- Modify: `.env.example` (`NOTION_OAUTH_CLIENT_ID=`, `NOTION_OAUTH_CLIENT_SECRET=`, `MYPULS_SCRIPTS_SESSION_COOKIE=`, `SNAP_CODES_SECRET=` s'il manque)

**Interfaces:**
- Produces: `notionAuthorizeUrl({ clientId, redirectUri, state }): string` ; `checkState(cookieState: string | undefined, queryState: string | null): boolean` ; `exchangeCode(fetchFn, { clientId, clientSecret, code, redirectUri }): Promise<NotionGrant>` avec `type NotionGrant = { accessToken: string; workspaceId: string; workspaceName: string; botId: string }` ; services `getNotionConnection(): Promise<NotionConnectionView | null>` (sans la clé), `getNotionToken(): Promise<{ token: string; rootPageId: string | null } | null>`, `saveNotionConnection(grant, profileId)`, `setNotionRootPage(id)`, `deleteNotionConnection()`.

- [ ] **Step 1: Relire la doc officielle** de l'OAuth Notion (page « Authorization » de developers.notion.com) avant d'écrire : paramètres de `/v1/oauth/authorize`, corps et réponse de `/v1/oauth/token`, présence éventuelle d'un `refresh_token`. Si la réponse diffère de ce qui suit, ajuster `exchangeCode` et ses tests, et le noter dans le registre.
- [ ] **Step 2: Tests `oauth.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { checkState, exchangeCode, notionAuthorizeUrl } from './oauth'

describe('notionAuthorizeUrl', () => {
  it('construit l’URL d’autorisation Notion', () => {
    const u = new URL(notionAuthorizeUrl({ clientId: 'cid', redirectUri: 'https://crm.test/api/notion/callback', state: 's1' }))
    expect(u.origin + u.pathname).toBe('https://api.notion.com/v1/oauth/authorize')
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: 'cid', response_type: 'code', owner: 'user', redirect_uri: 'https://crm.test/api/notion/callback', state: 's1',
    })
  })
})

describe('checkState', () => {
  it('refuse un state absent, vide ou différent du cookie', () => {
    expect(checkState('abc', 'abc')).toBe(true)
    expect(checkState(undefined, 'abc')).toBe(false)
    expect(checkState('abc', null)).toBe(false)
    expect(checkState('', '')).toBe(false)
    expect(checkState('abc', 'abd')).toBe(false)
  })
})

describe('exchangeCode', () => {
  it('échange le code (Basic auth, JSON) et lit la réponse', async () => {
    const seen: RequestInit[] = []
    const fake = (async (_url: string, init: RequestInit) => {
      seen.push(init)
      return new Response(JSON.stringify({ access_token: 'secret_x', workspace_id: 'w1', workspace_name: 'Agence', bot_id: 'b1' }), { status: 200 })
    }) as typeof fetch
    expect(await exchangeCode(fake, { clientId: 'cid', clientSecret: 'cs', code: 'c1', redirectUri: 'https://crm.test/api/notion/callback' })).toEqual({
      accessToken: 'secret_x', workspaceId: 'w1', workspaceName: 'Agence', botId: 'b1',
    })
    expect((seen[0]!.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('cid:cs').toString('base64')}`)
    expect(JSON.parse(seen[0]!.body as string)).toEqual({ grant_type: 'authorization_code', code: 'c1', redirect_uri: 'https://crm.test/api/notion/callback' })
  })
  it('refus Notion → erreur sans la clé', async () => {
    const fake = (async () => new Response('{"error":"invalid_grant"}', { status: 400 })) as typeof fetch
    await expect(exchangeCode(fake, { clientId: 'cid', clientSecret: 'cs', code: 'x', redirectUri: 'r' })).rejects.toThrow('Notion a refusé la connexion (400)')
  })
})
```

- [ ] **Step 3: Lancer — échec attendu** : `pnpm --filter @glagency/web exec vitest run src/features/scripts-import/oauth.test.ts`.
- [ ] **Step 4: `oauth.ts`**

```ts
import { timingSafeEqual } from 'node:crypto'

/** OAuth du Notion de l'agence — fonctions pures, testées ; les Route Handlers ne font que les brancher. */
export function notionAuthorizeUrl(o: { clientId: string; redirectUri: string; state: string }): string {
  const u = new URL('https://api.notion.com/v1/oauth/authorize')
  u.searchParams.set('client_id', o.clientId)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('owner', 'user')
  u.searchParams.set('redirect_uri', o.redirectUri)
  u.searchParams.set('state', o.state)
  return u.toString()
}

export function checkState(cookieState: string | undefined, queryState: string | null): boolean {
  if (!cookieState || !queryState) return false
  const a = Buffer.from(cookieState)
  const b = Buffer.from(queryState)
  return a.length === b.length && timingSafeEqual(a, b)
}

export type NotionGrant = { accessToken: string; workspaceId: string; workspaceName: string; botId: string }

export async function exchangeCode(
  fetchFn: typeof fetch,
  o: { clientId: string; clientSecret: string; code: string; redirectUri: string },
): Promise<NotionGrant> {
  const res = await fetchFn('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${o.clientId}:${o.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ grant_type: 'authorization_code', code: o.code, redirect_uri: o.redirectUri }),
  })
  if (!res.ok) throw new Error(`Notion a refusé la connexion (${res.status})`)
  const j = (await res.json()) as { access_token?: string; workspace_id?: string; workspace_name?: string; bot_id?: string }
  if (!j.access_token || !j.workspace_id || !j.bot_id) throw new Error('Notion : réponse de connexion incomplète')
  return { accessToken: j.access_token, workspaceId: j.workspace_id, workspaceName: j.workspace_name ?? '', botId: j.bot_id }
}
```

- [ ] **Step 5: Services** (`services/notion-connection.ts`, `import 'server-only'`, client admin `createAdminClient()` de `@glagency/db`) :
  - `getNotionConnection()` → `{ workspaceName, rootPageId, connectedAt, connectedBy: displayName }` ou `null` (jamais la clé) ;
  - `getNotionToken()` → `{ token: decryptSecret(row.access_token_encrypted), rootPageId }` ou `null` (lève si `decryptSecret` renvoie `null` : `Clé Notion illisible — reconnecter Notion.`) ;
  - `saveNotionConnection(grant, profileId)` : `upsert` de la ligne `agence` avec `encryptSecret(grant.accessToken)`, `root_page_id: null` ;
  - `setNotionRootPage(id)`, `deleteNotionConnection()`.
  Toute erreur Supabase destructurée et levée (`throw new Error(error.message)`).
- [ ] **Step 6: Route Handlers**
  - `app/api/notion/connect/route.ts` — `GET` : `const profile = await getProfile()` ; refuser (redirect `/chatter/scripts?notion=refus`) si pas admin ou si `await readStateCookie()` (impersonation, `@/lib/impersonation/session`) ; générer `state = randomBytes(24).toString('base64url')` ; poser le cookie `notion_oauth_state` (httpOnly, secure, sameSite `lax`, path `/api/notion`, maxAge 600) ; rediriger vers `notionAuthorizeUrl({ clientId: process.env.NOTION_OAUTH_CLIENT_ID, redirectUri: new URL('/api/notion/callback', req.url).toString(), state })`. Variable absente → redirect `/chatter/scripts?notion=config`.
  - `app/api/notion/callback/route.ts` — `GET` : mêmes contrôles admin et impersonation ; `checkState(cookies().get('notion_oauth_state')?.value, url.searchParams.get('state'))` sinon redirect `?notion=refus` ; supprimer le cookie ; `error` dans la query (refus de l'utilisateur côté Notion) → `?notion=annule` ; `exchangeCode(fetch, …)` puis `saveNotionConnection(grant, profile.id)` → redirect `/chatter/scripts?notion=connecte`. Exceptions → `Sentry.captureException` + `?notion=erreur`.
  Les deux routes exigent une session (le `proxy.ts` redirige déjà vers `/login` sans session) : ne pas les ajouter à sa liste de contournement.
- [ ] **Step 7: Lancer** : `pnpm --filter @glagency/web exec vitest run src/features/scripts-import && pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint` → PASS.
- [ ] **Step 8: Préparer le commit** — `feat(scripts-import): connexion du Notion de l'agence par un admin (OAuth)`.

---

### Task 7: Actions « Préparer » et « Envoyer »

**Files:**
- Create: `apps/web/src/features/scripts-import/rules.ts` (+ `rules.test.ts`) — pur
- Create: `apps/web/src/features/scripts-import/services/get-scripts-import.ts`
- Create: `apps/web/src/features/scripts-import/actions.ts`
- Modify: `apps/web/package.json` (`"@glagency/scripts": "workspace:*"`), `apps/web/next.config.ts` (`transpilePackages` : ajouter `'@glagency/scripts'`)

**Interfaces:**
- Consumes: `@glagency/scripts` (`fetchNotionPage`, `convertToDraft`, `sendScript`, `studioWriter`, `describeFailure`, `listNotionScripts`), `@glagency/scripts/session` (`scriptsSessionForSend`, `ingestSessionStore`, `SCRIPTS_SESSION_ID`), `@glagency/core` (`normalizeDraft`, `validateScriptDraft`, `summarizeDraft`, `matchCreatorByName`, `parseScriptDraft`), `anthropic()` (`@/lib/ai/client`), services de la Task 6.
- Produces: `rules.ts` : `type ImportRow` (colonnes de `script_imports` utiles à l'écran), `canSend(row: ImportRow, viewerId: string): { ok: true } | { ok: false; reason: string }`, `importStatus(row: ImportRow, now: Date): 'prêt' | 'à corriger' | 'envoi en cours' | 'interrompu' | 'envoyé' | 'échec'` ; actions `prepareImport(raw): Promise<ActionResult<{ importId: string }>>`, `sendImport(raw): Promise<ActionResult<{ mypulsScriptId: number }>>`, `setRootPage(raw)`, `disconnectNotion(raw)`.

- [ ] **Step 1: Tests `rules.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { canSend, importStatus, type ImportRow } from './rules'

const row = (over: Partial<ImportRow> = {}): ImportRow => ({
  id: 'i1', createdBy: 'u1', status: 'prepared', errorsCount: 0, createdAt: '2026-10-07T10:00:00Z', sentAt: null, mypulsScriptId: null, ...over,
})
describe('canSend', () => {
  it('seulement une ligne prête, sans erreur, de l’appelant', () => {
    expect(canSend(row(), 'u1')).toEqual({ ok: true })
    expect(canSend(row({ createdBy: 'u2' }), 'u1')).toEqual({ ok: false, reason: 'Cet import ne t’appartient pas.' })
    expect(canSend(row({ errorsCount: 2 }), 'u1')).toEqual({ ok: false, reason: 'Le rapport contient des erreurs : corrige le script dans Notion puis prépare-le à nouveau.' })
    expect(canSend(row({ status: 'sending' }), 'u1')).toEqual({ ok: false, reason: 'Cet import est déjà parti ou en cours d’envoi.' })
    expect(canSend(row({ status: 'sent' }), 'u1')).toEqual({ ok: false, reason: 'Cet import est déjà parti ou en cours d’envoi.' })
  })
})
describe('importStatus', () => {
  const now = new Date('2026-10-07T10:30:00Z')
  it('libellés, et « interrompu » pour un envoi resté en cours plus de 15 min', () => {
    expect(importStatus(row(), now)).toBe('prêt')
    expect(importStatus(row({ errorsCount: 1 }), now)).toBe('à corriger')
    // En `sending`, `sentAt` = heure de DÉPART de l'envoi (posée par le verrou, Step 4) ; mise à jour à la fin.
    expect(importStatus(row({ status: 'sending', sentAt: '2026-10-07T10:25:00Z' }), now)).toBe('envoi en cours')
    expect(importStatus(row({ status: 'sending', sentAt: '2026-10-07T10:00:00Z' }), now)).toBe('interrompu')
    expect(importStatus(row({ status: 'sent', sentAt: '2026-10-07T10:02:00Z' }), now)).toBe('envoyé')
    expect(importStatus(row({ status: 'failed' }), now)).toBe('échec')
  })
})
```

- [ ] **Step 2: Lancer — échec attendu.**
- [ ] **Step 3: `rules.ts`** — implémentation directe des deux fonctions selon les tests (seuil `15 * 60_000` ms sur `sentAt`).
- [ ] **Step 4: `actions.ts`** (`'use server'`, `runAction`, guard `noGuard`, contrôles dans le handler une seule fois). Garde locale :

```ts
/** Admin ou encadrant (manager / sous-manager), jamais « en tant que » : on écrit chez un tiers. */
async function requireImporter(): Promise<Profile> {
  if (await readStateCookie()) throw new BusinessError(DENY_IMPERSONATION)
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && !profile.manager)) throw new BusinessError(DENY_STAFF)
  return profile
}
```

(`readStateCookie` de `@/lib/impersonation/session`, `getProfile`/`Profile` de `@/lib/auth`, `BusinessError`/`DENY_*` de `@/lib/actions` — vérifier que `DENY_STAFF` et `DENY_IMPERSONATION` y sont exportés, sinon les exporter.)
  - `prepareImport({ notionPageId: z.string().min(1), notionTitle: z.string().min(1), creatorId: z.uuid() })` :
    1. `const profile = await requireImporter()` ;
    2. `getNotionToken()` (sinon `BusinessError('Notion n’est pas connecté — demande à un admin.')`) ;
    3. `fetchNotionPage(token, notionPageId)` → `convertToDraft(anthropic(), page)` → `normalizeDraft` → `validateScriptDraft` → `summarizeDraft` ;
    4. insertion avec le **client session** (`await createClient()`) dans `script_imports` : `created_by: profile.id`, `creator_id`, `notion_page_id`, `notion_title`, `summary`, `notes`, `errors`, `draft`, `usage`, `status: 'prepared'`. Erreur RLS → `BusinessError('Modèle hors de ton périmètre.')` (code `42501`), autre → `throw new Error(error.message)` ;
    5. `revalidatePath('/chatter/scripts')`, retourne `{ importId }`.
  - `sendImport({ importId: z.uuid() })` :
    1. `const profile = await requireImporter()` (pas de fenêtre de nuit : envoi à toute heure) ;
    2. lire la ligne (client session) ; `canSend(row, profile.id)` sinon `BusinessError(reason)` ;
    3. **verrou** : `update script_imports set status = 'sending', sent_at = now() where id = :id and status = 'prepared'` (client session) avec `.select('id')` ; 0 ligne → `BusinessError('Cet import est déjà parti ou en cours d’envoi.')` ;
    4. `creator.mypuls_creator_id` (client session, `creators`) sinon échec ; `cookie = await scriptsSessionForSend(ingestSessionStore(createAdminClient(), SCRIPTS_SESSION_ID), process.env.MYPULS_SCRIPTS_SESSION_COOKIE)` ;
    5. `sendScript(writerWithTrace, mypulsId, parseScriptDraft(row.draft))` où `writerWithTrace` = `studioWriter(cookie)` dont `createScript` est enveloppé pour **enregistrer `mypuls_script_id` aussitôt** (update client session) ;
    6. résultat : `sent` (`mypuls_script_id`, `sent_at`) ou `failed` (`failed_step`, `error`, `cleanup`) ; en cas d'échec, `throw new BusinessError(describeFailure(result, draft.name))` après la mise à jour ;
    7. `revalidatePath('/chatter/scripts')`.
  - `setRootPage({ pageId: z.string().min(1) })`, `disconnectNotion({})` : `requireAdminProfileLive()` puis services de la Task 6.
- [ ] **Step 5: `services/get-scripts-import.ts`** (`import 'server-only'`) : `getScriptsImport(profile, importId?)` renvoie, en parallèle (`Promise.all`) :
  - `connection` : `getNotionConnection()` ;
  - `folders` : si connecté et racine choisie, `listNotionScripts(token, rootPageId)`, chaque dossier enrichi de `creatorId` (`matchCreatorByName` sur les modèles autorisées ; `null` si absent ou ambigu) ; sinon `[]` ;
  - `rootCandidates` (admin, racine non choisie) : pages partagées de premier niveau via `POST /v1/search` (`filter: { property: 'object', value: 'page' }`), filtrées sur `parent.type === 'workspace'` ;
  - `creators` autorisées : admin → `creators` actives avec `mypuls_creator_id` non nul ; manager → mêmes colonnes jointes à `profile_creators` de l'appelant (client admin, comme `getCreatorScope`) ;
  - `imports` : 50 dernières lignes `script_imports` (client session, RLS), tri `created_at desc` ;
  - `current` : la ligne `importId` si fournie (client session).
  Toute erreur destructurée et levée.
- [ ] **Step 6: Lancer** : `pnpm --filter @glagency/web exec vitest run src/features/scripts-import && pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint` → PASS.
- [ ] **Step 7: Préparer le commit** — `feat(scripts-import): préparer et envoyer un script depuis le CRM`.

---

### Task 8: Écran « Importer un script »

**Files:**
- Create: `apps/web/src/app/(dash)/chatter/scripts/page.tsx`, `apps/web/src/app/(dash)/chatter/scripts/loading.tsx`
- Create: `apps/web/src/features/scripts-import/ScriptsImportTemplate.tsx`
- Create: `apps/web/src/features/scripts-import/components/notion-connection-card.tsx` (+ `.client.tsx` pour les boutons), `script-picker.client.tsx`, `import-report.client.tsx`, `imports-table.client.tsx`
- Modify: `apps/web/src/config/workspaces.ts` (item de navigation), `apps/web/src/config/workspaces.test.ts` (bloc de test)

- [ ] **Step 1: Test de navigation** (`workspaces.test.ts`, nouveau bloc sur le modèle du bloc « Membres ») : l'item `/chatter/scripts` est visible de l'admin et d'un encadrant sans droit coché (`canAccessNav(item, encadrant([])) === true`), invisible d'un chatteur, n'ajoute aucune case dans `pageChoicesFor`, et n'est jamais page d'atterrissage (`landingHref` inchangé). Lancer → FAIL (item absent).
- [ ] **Step 2: Item** — face chatteurs, à côté de « Membres » : `{ href: '/chatter/scripts', label: 'Importer un script', icon: FileInput, adminOnly: true, managerAccess: true, bottom: true }` (`FileInput` de `lucide-react`). Lancer le test → PASS.
- [ ] **Step 3: Page** (`page.tsx`) : `export const maxDuration = 800` ; `const profile = await requireAdminOrManager()` ; `searchParams: Promise<{ import?: string; notion?: string }>` ; kickoff sans await `getScriptsImport(profile, sp.import)` ; `h1` « Importer un script » + `p.max-w-2xl text-sm text-muted-foreground` (« Choisis un script dans le Notion de l'agence : le CRM le prépare, tu relis le rapport, puis il part désactivé dans le Studio MyPuls de la modèle. ») ; `<Suspense fallback={…skeleton…}>` → `ScriptsImportTemplate`. `loading.tsx` : la même silhouette.
- [ ] **Step 4: Template et composants** — reprendre les composants existants à l'identique (§ 9) :
  - `notion-connection-card` (admin seulement) : `Card` ; non connecté → `Button asChild` vers `/api/notion/connect` « Connecter Notion » ; connecté → espace, racine, « connecté par X le … », `Select` de la racine si `rootPageId` nul (action `setRootPage`), « Déconnecter » (`AlertDialog` de confirmation, action `disconnectNotion`) ; message selon `?notion=` (`connecte`, `annule`, `refus`, `config`, `erreur`) ;
  - manager sans connexion : `Card` « Notion n'est pas connecté — demande à un admin. » ;
  - `script-picker` : par dossier, la liste des scripts ; `Select` de la modèle (présélection `creatorId` du dossier, sinon vide) limité aux modèles autorisées ; bouton « Préparer » (`useTransition`, `toast` de sonner en cas d'erreur) → `router.push('/chatter/scripts?import=<id>')` ; dossiers sans modèle reconnue regroupés en fin sous « Autres dossiers » ;
  - `import-report` : la ligne courante — la ligne de résumé et le mode, ajustements, médias à rattacher, erreurs situées ; « Envoyer » seulement si `canSend` ok ; pendant l'envoi : `Spinner` + « Envoi en cours — ne ferme pas la page (1 à 2 min) » ; succès → `toast` et lien `https://mypuls.app/scripts` ; échec → le message `describeFailure` ;
  - `imports-table` : `DataTable` (date, script, modèle, statut `importStatus` en `Badge`, script MyPuls ou erreur).
- [ ] **Step 5: Lancer** : `pnpm --filter @glagency/web test && pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build` → PASS.
- [ ] **Step 6: Préparer le commit** — `feat(scripts-import): écran « Importer un script »`.

---

### Task 9: Documentation et contrôles complets

**Files:** `ARCHITECTURE.md` (§ 10 « Scripts MyPuls » : l'écran, la connexion Notion, `script_imports`, la session « scripts », la garde en vie ; § 7 variables), `docs/CARTE.md` (ligne de la page `/chatter/scripts` + package `@glagency/scripts`), `CHANGELOG.md` (« Non publié » › « Ajouté »), `AGENTS.md` (prochaine migration `0185`, UAT = `0184`).

- [ ] **Step 1: Écrire la doc** (au format des lignes voisines, `grep -n "script-mypuls" ARCHITECTURE.md docs/CARTE.md` pour les emplacements).
- [ ] **Step 2: Contrôles** : `pnpm typecheck && pnpm test && pnpm lint && pnpm check:carte && pnpm --filter @glagency/web build` → tout vert (relancer seul le test DST de core s'il dépasse son délai sous charge).
- [ ] **Step 3: Préparer le commit** — `docs(scripts-import): écran d'import, connexion Notion, session « scripts »`.

---

### Task 10: Recette avec le compte de Benoit (UAT)

Rien ne s'écrit chez MyPuls ni en prod sans l'accord de Benoit.

- [ ] **Step 1: Application Notion** : guider Benoit pour déclarer l'application OAuth dans le portail développeur de Notion (adresse de retour `https://<domaine UAT>/api/notion/callback`), poser `NOTION_OAUTH_CLIENT_ID` et `NOTION_OAUTH_CLIENT_SECRET` sur Vercel (Preview/UAT), et `MYPULS_SCRIPTS_SESSION_COOKIE` (connexion MyPuls en navigation privée).
- [ ] **Step 2: Connexion** : Benoit clique « Connecter Notion » sur l'UAT, coche une racine de test (dossier « JULIE » avec une copie du KYC de Lucie), confirme la racine dans le CRM.
- [ ] **Step 3: Préparer** : depuis le compte de Benoit, puis depuis un compte manager de test (modèle assignée / non assignée) — rapport identique à la recette de la commande (77 messages, 8 embranchements, 0 erreur) ; refus hors périmètre constaté.
- [ ] **Step 4: Envoyer** (sur go de Benoit, modèle de test) : script désactivé dans le Studio, relu, puis supprimé par Benoit ; historique `envoyé` avec l'identifiant.
- [ ] **Step 5: Consigner** dans la spec (§ 8, une ligne datée) et préparer le commit.
