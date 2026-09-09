# Marketing par modèle — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à la face Marketing une page par modèle qui met le CA et les abonnés venus des liens de tracking en rapport avec le CA et les abonnés totaux de la modèle.

**Architecture:** Deux batches indépendants. Le batch 1 remet l'ingestion des liens en marche (arrêtée depuis le 12/07) par un fan-out `SELF` depuis un cron existant, sans consommer de Cron Trigger. Le batch 2 ouvre le CA total au pôle marketing par une RPC `security definer` (`0152`) et construit la page `/marketing/modeles` selon la convention `app → feature(template) → composants`.

**Tech Stack:** Next.js 16 (App Router, RSC), Supabase (Postgres + RLS), Tailwind v4 + shadcn/ui, Recharts 2.15.4, Vitest, Cloudflare Workers (wrangler).

**Spec:** `docs/superpowers/specs/2026-09-08-marketing-modeles-design.md`

## Global Constraints

- **Rien en prod** (D8). Migrations poussées sur l'UAT uniquement, via
  `--db-url "$DATABASE_URL_UAT"`. Pas de `wrangler deploy`. Pas de merge sur `main`.
- **Pas de commit sans accord de Benoit.** Les steps « Commit » de ce plan préparent le
  message ; demander avant d'exécuter.
- **Branche de travail :** `develop` (préprod UAT).
- **Prochaine migration = `0152`.** UAT et prod sont toutes deux à `0151`. Convention :
  `text` + `check`, jamais `create type ... enum`. Appliquer avec
  `cd packages/db && supabase db push --db-url "$DATABASE_URL_UAT"` (jamais `psql -f`, qui
  désaligne `schema_migrations`).
- **Extraire l'URL en brut :** `grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//'`.
  Jamais `source .env`.
- **Aucun fetch dans une feature** : `page.tsx` appelle `features/<f>/services/`, passe en props
  au `Template`.
- **Jamais de `select` nu sur une table de faits** : RPC d'agrégation ou `fetchAll`.
- **Pas de `use cache`** sur cette page : lecture RLS cookie-bound.
- **Deux couleurs sur la page** : `#8b5cf6` (via liens) et un gris neutre. Pas de couleur par
  modèle — la palette `MODEL_HEX_COLORS` échoue au validateur dataviz (§4.3 de la spec).
- **Terminologie UI** : « chatter », « modèle », « abonnés » (pas « subs » à l'écran).

---

## Fichiers touchés

| Fichier | Responsabilité |
|---|---|
| `apps/ingestion/src/marketing-cli.ts` | **créer** — CLI de backfill des liens |
| `apps/ingestion/package.json` | **modifier** — script `marketing` |
| `apps/ingestion/src/worker.ts` | **modifier** — fan-out `?job=marketing` sur le cron 23h05 |
| `apps/ingestion/wrangler.toml:24-33` | **modifier** — commentaire seul, aucun cron ajouté |
| `packages/db/supabase/migrations/0152_mkt_creator_revenue.sql` | **créer** — RPC `security definer` |
| `packages/db/src/types.ts` | **régénérer** |
| `apps/web/src/lib/types/marketing.ts` | **modifier** — `creatorId` sur `MktLinkRow` |
| `apps/web/src/lib/services/get-mkt-links.ts:88` | **modifier** — propage `creator_id` |
| `apps/web/src/config/workspaces.ts` | **modifier** — slug `mkt-modeles` + item de nav |
| `apps/web/src/features/marketing-modeles/types.ts` | **créer** |
| `apps/web/src/features/marketing-modeles/aggregate.ts` | **créer** — fonction PURE, testée |
| `apps/web/src/features/marketing-modeles/aggregate.test.ts` | **créer** |
| `apps/web/src/features/marketing-modeles/services/get-modeles.ts` | **créer** |
| `apps/web/src/features/marketing-modeles/ModelesTemplate.tsx` | **créer** — Server Component |
| `apps/web/src/features/marketing-modeles/components/agency-split.client.tsx` | **créer** — donuts + courbe |
| `apps/web/src/features/marketing-modeles/components/creator-section.client.tsx` | **créer** — bande dépliable |
| `apps/web/src/features/marketing-modeles/components/modeles-skeleton.tsx` | **créer** |
| `apps/web/src/app/(dash)/marketing/modeles/page.tsx` | **créer** |
| `apps/web/src/app/(dash)/marketing/modeles/loading.tsx` | **créer** |

---

# BATCH 1 — Remettre l'ingestion des liens en marche

## Task 1: CLI de backfill des liens de tracking

**Files:**
- Create: `apps/ingestion/src/marketing-cli.ts`
- Modify: `apps/ingestion/package.json` (bloc `scripts`)

**Interfaces:**
- Consumes: `runMarketing({ backfillFrom })` de `apps/ingestion/src/marketing.ts`, `loadEnv()` de `./env`, `recordRun` de `./record-run`.
- Produces: la commande `pnpm --filter @glagency/ingestion marketing <YYYY-MM-DD>`.

**Pourquoi un CLI et pas le handler HTTP `?job=marketing`** : 58 jours de rattrapage font ~58 upserts Supabase, au-delà des 50 sous-requêtes d'une invocation Worker sur le plan Free. En local, aucune limite.

- [ ] **Step 1: Écrire le CLI**

```ts
// apps/ingestion/src/marketing-cli.ts
import { loadEnv } from './env'
import { runMarketing } from './marketing'
import { recordRun } from './record-run'

// Charge le .env racine avant tout (le client Supabase lit process.env).
loadEnv()

/**
 * Rattrapage des liens de tracking sur une plage arbitraire — le run nocturne ne réécrit
 * qu'une fenêtre glissante de 8 jours (`marketing.ts:70`), insuffisante après une coupure.
 * Le payload MyPuls porte la série `daily` depuis l'origine : un seul run rattrape tout,
 * au même coût de requêtes qu'un run normal.
 *
 *   pnpm --filter @glagency/ingestion marketing 2026-07-12
 *
 * Cibler l'UAT plutôt que la prod = surcharger les deux variables en préfixe de commande
 * (loadEnv() ne remplit que les clés ABSENTES, cf. env.ts:15) :
 *   SUPABASE_URL=$SUPABASE_URL_UAT SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY_UAT pnpm …
 */
const arg = process.argv[2]
if (!arg || !/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
  console.error('usage : pnpm --filter @glagency/ingestion marketing <YYYY-MM-DD>')
  process.exit(1)
}

const startedAt = new Date()
runMarketing({ backfillFrom: arg })
  .then(async (summary) => {
    console.log(`[marketing] ${summary.status.toUpperCase()}`, JSON.stringify(summary))
    await recordRun('local', startedAt, {
      summary: { job: 'marketing', ...summary } as unknown as Parameters<typeof recordRun>[2]['summary'],
    })
    process.exit(0)
  })
  .catch(async (err: unknown) => {
    console.error('[marketing] ÉCHEC', err)
    await recordRun('local', startedAt, { error: err })
    process.exit(1)
  })
```

- [ ] **Step 2: Déclarer le script**

Dans `apps/ingestion/package.json`, bloc `scripts`, après la ligne `"shifts"` :

```json
"marketing": "tsx src/marketing-cli.ts",
```

- [ ] **Step 3: Vérifier que le typecheck passe**

Run: `pnpm --filter @glagency/ingestion typecheck`
Expected: aucune erreur.

- [ ] **Step 4: Vérifier l'état de départ de l'UAT**

```bash
DBU=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$DBU" -X -q -c "select max(date) from mkt_link_daily;"
```

Expected: `2026-07-12`.

- [ ] **Step 5: Lancer le backfill VERS L'UAT**

```bash
set -a; SUPABASE_URL=$(grep '^SUPABASE_URL_UAT=' .env | cut -d= -f2- | tr -d '"'); \
SUPABASE_SECRET_KEY=$(grep '^SUPABASE_SECRET_KEY_UAT=' .env | cut -d= -f2- | tr -d '"'); set +a; \
SUPABASE_URL="$SUPABASE_URL" SUPABASE_SECRET_KEY="$SUPABASE_SECRET_KEY" \
  pnpm --filter @glagency/ingestion marketing 2026-07-12
```

Expected: `[marketing] OK` avec `updatedDaily` non nul.

**Si la session MyPuls est expirée** (erreur `login refusé` / `status 429`) : rafraîchir
`MYPULS_SESSION_COOKIE` dans `.env` depuis un login humain, puis relancer. Ne pas insister
plus de deux fois — remonter à Benoit.

- [ ] **Step 6: Vérifier que la prod n'a PAS bougé**

```bash
DB=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$DB" -X -q -c "select max(date) from mkt_link_daily;"
```

Expected: **toujours `2026-07-12`**. Si la prod a avancé, la surcharge d'environnement n'a pas
pris — arrêter et corriger avant toute autre étape.

- [ ] **Step 7: Vérifier que l'UAT a avancé**

```bash
psql "$DBU" -X -q -c "select max(date) as dernier, count(*) as lignes from mkt_link_daily;"
```

Expected: `dernier` = J-1 ou J, `lignes` > 1996.

- [ ] **Step 8: Commit** *(demander à Benoit d'abord)*

```bash
git add apps/ingestion/src/marketing-cli.ts apps/ingestion/package.json
git commit -m "feat(ingestion): un CLI pour rattraper les liens de tracking après une coupure"
```

---

## Task 2: Fan-out du job marketing depuis le cron chatteurs

**Files:**
- Modify: `apps/ingestion/src/worker.ts` (fonction `scheduled`, branche `MONITOR_SLUG` / cron `5 23 * * *`)
- Modify: `apps/ingestion/wrangler.toml:24-33` (commentaire uniquement)

**Interfaces:**
- Consumes: le binding `SELF` et `WORKER_SELF_URL` / `TRIGGER_TOKEN` déjà déclarés (`worker.ts:47`, `wrangler.toml`), le handler `?job=marketing` (`worker.ts:439`).
- Produces: aucune interface consommée ailleurs.

**Le patron existe déjà** pour spenders (`worker.ts:103-116`) : chaque appel `SELF` est une
invocation séparée, avec son propre budget de 10 ms CPU et 50 sous-requêtes. C'est ce qui
permet de rebrancher le marketing **sans ajouter de Cron Trigger** (plafond Free : 5 par
compte, déjà 3 utilisés).

- [ ] **Step 1: Lire la branche du cron chatteurs**

Run: `grep -n "MONITOR_SLUG\|SPENDERS_CRON\|SHIFTS_CRON" apps/ingestion/src/worker.ts | head`

Repérer la branche qui traite `5 23 * * *` (le `await Sentry.withMonitor(MONITOR_SLUG, () => runAndRecord('cron'), MONITOR_CONFIG)` vers la ligne 382).

- [ ] **Step 2: Ajouter le fan-out APRÈS cette branche, hors de son chemin de succès**

```ts
    // ── Fan-out MARKETING (liens de tracking) ────────────────────────────────────────
    // Rebranché le 2026-09-08 sans ajouter de Cron Trigger : le plan Free plafonne à 5 crons
    // par COMPTE et les 3 slots sont pris (chatteurs, spenders, shifts). Un appel SELF est une
    // invocation SÉPARÉE, avec son propre budget 10 ms CPU / 50 sous-requêtes — même mécanique
    // que le fan-out spenders plus haut.
    //
    // HORS du chemin de succès du run chatteurs : un échec MyPuls côté chatteurs ne doit pas
    // priver le marketing de sa nuit. Sa propre erreur est capturée et n'échoue pas l'invocation.
    //
    // 23h05 UTC reste sûr : été comme hiver, c'est APRÈS minuit à Paris (cf. wrangler.toml), donc
    // la journée capturée est complète. Le marketing tournait à 23h20 pour la même raison.
    //
    // Instagram et Telegram restent en pause (D2) : `marketing-social` rappelle Apify et consomme
    // des crédits. Les rebrancher = un `self.fetch` de plus, décision séparée.
    try {
      const { SELF: self, WORKER_SELF_URL: selfUrl, TRIGGER_TOKEN: token } = env
      if (self && selfUrl && token) {
        const r = await self.fetch(`${selfUrl}?job=marketing`, {
          headers: { 'x-trigger-token': token },
        })
        if (!r.ok) {
          Sentry.captureMessage(`[marketing] fan-out KO (${r.status})`, 'warning')
        }
      } else {
        Sentry.captureMessage('[marketing] fan-out impossible : SELF / URL / token manquant', 'warning')
      }
    } catch (err) {
      Sentry.captureException(err)
    }
```

**Vérifier avant d'écrire** le nom exact de l'en-tête d'authentification attendu par le handler
HTTP (`grep -n "TRIGGER_TOKEN" apps/ingestion/src/worker.ts`) et l'aligner — le fan-out spenders
en est le modèle littéral.

- [ ] **Step 3: Mettre à jour le commentaire de `wrangler.toml`**

Remplacer la mention « Crons marketing DÉSACTIVÉS temporairement (2026-07-12) » par :

```
# Crons marketing : le job LIENS est rebranché depuis le 2026-09-08 en FAN-OUT sur le cron
# chatteurs (5 23 * * *) — cf. worker.ts, section « Fan-out MARKETING ». Aucun slot consommé :
# un appel SELF est une invocation séparée. Instagram (35) et Telegram (50) restent en pause.
# La ligne d'origine, pour mémoire :
# crons = ["5 23 * * *", "20 23 * * *", "35 23 * * *", "50 23 * * *", "0 0 * * *"]
```

Ne PAS toucher à la ligne `crons = [...]` active.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @glagency/ingestion typecheck`
Expected: aucune erreur.

- [ ] **Step 5: Test du cron en local, sans déployer**

```bash
pnpm --filter @glagency/ingestion cf:dev
```

Puis, dans un autre terminal : `curl "http://localhost:8799/__scheduled?cron=5+23+*+*+*"`

Expected: les logs montrent le run chatteurs **puis** une ligne `[marketing]`. En local le
binding `SELF` peut être absent — dans ce cas le message attendu est
`fan-out impossible : SELF / URL / token manquant`, ce qui valide quand même le branchement.

- [ ] **Step 6: Commit** *(demander à Benoit d'abord)*

```bash
git add apps/ingestion/src/worker.ts apps/ingestion/wrangler.toml
git commit -m "feat(ingestion): les liens de tracking repartent chaque nuit, sans slot cron"
```

**PAS de `wrangler deploy`** (D8).

---

# BATCH 2 — La donnée et la page

## Task 3: Migration 0152 — la RPC du CA par modèle

**Files:**
- Create: `packages/db/supabase/migrations/0152_mkt_creator_revenue.sql`
- Modify: `packages/db/src/types.ts` (régénéré)

**Interfaces:**
- Produces: `mkt_creator_revenue(p_from date, p_to date)` → `jsonb` :
  `{ creators: [{ creator_id, name, ca, new_subs, subs_active }], daily: [{ date, new_subs }] }`.
  Le second tableau est le DÉNOMINATEUR QUOTIDIEN de la courbe (§4.2 de la spec) : sans lui, la
  part par jour n'est pas calculable, et une courbe des seuls abonnés issus des liens ferait
  doublon avec l'Overview.

**Pourquoi `security definer`** : `creator_daily` ET `creators` sont scopés « admin OU modèle
assignée » (`0008:58` et `:64`). Le seul porteur non-admin de la face Marketing a 0 ligne dans
`profile_creators` — il ne lit ni le CA ni les noms de modèles. Sans cette RPC, la page est
vide pour lui.

- [ ] **Step 1: Écrire la migration**

```sql
-- 0152 — Le CA des modèles, lisible par le pôle marketing.
--
-- La page /marketing/modeles met le CA venu des LIENS de tracking en rapport avec le CA TOTAL
-- de la modèle. Le premier est déjà lisible (mkt_* est ouvert à has_page('marketing')), le
-- second ne l'est pas : `creator_daily` et `creators` sont scopés « admin OU modèle assignée »
-- (0008:58 et 0008:64), et le pôle marketing n'a AUCUNE assignation dans profile_creators.
-- Résultat aujourd'hui : sur /marketing/liens, un non-admin voit tous les liens étiquetés
-- « Sans créatrice » — le nom lui est déjà refusé.
--
-- POURQUOI PAS un élargissement de policy : `creators_scoped_read` et `creator_daily_scoped_read`
-- portent le cloisonnement par modèle de TOUTE la face chatteurs. Y ajouter une disjonction
-- `has_page('mkt-modeles')` ouvrirait le CA ligne à ligne, partout, pour un besoin d'agrégat.
-- POURQUOI PAS une assignation profile_creators : elle marcherait, mais elle est implicite et
-- se défait au premier geste dans Membres.
--
-- Le périmètre exposé ici est un AGRÉGAT PAR MODÈLE SUR UNE PÉRIODE — jamais la ligne
-- journalière, jamais le détail par chatteur.
--
-- Comptes privés (D6) : regroupés sur leur modèle principale via `primary_creator_id`. Le
-- trafic traçable arrive sur le compte public ; le privé est un aval, l'en séparer fausserait
-- la part. `excluded` n'entre PAS en jeu : dans ce projet il ne sert qu'au calcul LTV de la
-- page Santé (features/models/services/get-models.ts:118).

create or replace function public.mkt_creator_revenue(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  -- Garde explicite : la fonction contourne la RLS, elle doit dire elle-même qui entre.
  if not (public.is_admin() or public.has_page('mkt-modeles')) then
    raise exception 'acces refuse' using errcode = '42501';
  end if;

  select jsonb_build_object(
    -- ── Par modèle, comptes privés regroupés.
    'creators', coalesce((
      select jsonb_agg(row_to_json(t) order by t.ca desc)
      from (
        select
          coalesce(c.primary_creator_id, c.id)   as creator_id,
          max(p.name)                            as name,
          round(sum(cd.ca), 2)                   as ca,
          sum(cd.new_subs)::bigint               as new_subs,
          -- STOCK, pas un flux : la valeur du DERNIER jour de la période, sommée sur les
          -- comptes regroupés. Une somme sur la période compterait chaque jour.
          coalesce(sum(cd.subs_active) filter (where cd.date = last.d), 0)::bigint as subs_active
        from creator_daily cd
        join creators c on c.id = cd.creator_id
        join creators p on p.id = coalesce(c.primary_creator_id, c.id)
        cross join lateral (
          select max(cd2.date) as d from creator_daily cd2
          where cd2.creator_id = cd.creator_id and cd2.date between p_from and p_to
        ) last
        where cd.date between p_from and p_to
        group by coalesce(c.primary_creator_id, c.id)
      ) t
    ), '[]'::jsonb),
    -- ── Nouveaux abonnés PAR JOUR, toutes modèles — dénominateur de la courbe (§4.2).
    -- Pas de regroupement à faire ici : on somme toute l'agence, les comptes privés inclus.
    'daily', coalesce((
      select jsonb_agg(row_to_json(d) order by d.date)
      from (
        select cd.date::text as date, sum(cd.new_subs)::bigint as new_subs
        from creator_daily cd
        where cd.date between p_from and p_to
        group by cd.date
      ) d
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.mkt_creator_revenue(date, date) from public;
grant execute on function public.mkt_creator_revenue(date, date) to authenticated;

comment on function public.mkt_creator_revenue(date, date) is
  'Agrégat CA / nouveaux abonnés / abonnés actifs par modèle sur une période, comptes privés '
  'regroupés sur leur principale. security definer À DESSEIN : creator_daily et creators sont '
  'scopés par profile_creators et le pôle marketing n''a aucune assignation. Garde interne : '
  'admin ou has_page(''mkt-modeles'').';
```

- [ ] **Step 2: Prévisualiser**

```bash
cd packages/db && supabase db push --dry-run --db-url "$(grep '^DATABASE_URL_UAT=' ../../.env | cut -d= -f2- | sed 's/^"//; s/"$//')"
```

Expected: la migration `0152` listée comme à appliquer.

- [ ] **Step 3: Appliquer sur l'UAT**

```bash
cd packages/db && supabase db push --db-url "$(grep '^DATABASE_URL_UAT=' ../../.env | cut -d= -f2- | sed 's/^"//; s/"$//')"
```

- [ ] **Step 4: Vérifier le résultat contre la table de recette de la spec**

```bash
DBU=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$DBU" -X -q -c "
select x->>'name' as modele, round((x->>'ca')::numeric) as ca, x->>'new_subs' as new_subs
from jsonb_array_elements(mkt_creator_revenue('2026-06-01','2026-07-11')->'creators') x limit 4;"
```

Expected (§6 de la spec) : Carla **137 382 €** / 18 742, Julie 62 999 € / 10 146,
Alice 47 160 € / 9 575, Sarah 33 267 € / 8 022.

Puis la série journalière :

```bash
psql "$DBU" -X -q -c "
select jsonb_array_length(mkt_creator_revenue('2026-06-01','2026-07-11')->'daily') as jours,
       (select sum((x->>'new_subs')::int)
        from jsonb_array_elements(mkt_creator_revenue('2026-06-01','2026-07-11')->'daily') x) as total;"
```

Expected: `jours` = 41, `total` = **67 575** — le même nombre d'abonnés que la somme par modèle.

> `psql` se connecte en superuser : la garde `has_page` n'est pas éprouvée ici, seulement le
> calcul. Le contrôle d'accès se vérifie à la Task 10, dans l'app.

- [ ] **Step 5: Vérifier que la PROD n'a pas bougé**

```bash
DB=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$DB" -X -q -c "select max(version) from supabase_migrations.schema_migrations;"
```

Expected: **`0151`**.

- [ ] **Step 6: Régénérer les types**

Run: `pnpm --filter @glagency/db gen-types` (vérifier le nom exact du script dans
`packages/db/package.json` ; sinon utiliser la commande `supabase gen types` qui y est déclarée).
Expected: `mkt_creator_revenue` apparaît dans `packages/db/src/types.ts`.

- [ ] **Step 7: Commit** *(demander à Benoit d'abord)*

```bash
git add packages/db/supabase/migrations/0152_mkt_creator_revenue.sql packages/db/src/types.ts
git commit -m "feat(db): 0152 — le CA des modèles lisible par le pôle marketing"
```

---

## Task 4: `creatorId` sur `MktLinkRow`

**Files:**
- Modify: `apps/web/src/lib/types/marketing.ts`
- Modify: `apps/web/src/lib/services/get-mkt-links.ts:88`

**Interfaces:**
- Produces: `MktLinkRow.creatorId: string | null`, consommé par la Task 6.

La jointure liens ↔ modèles doit se faire par **id**, pas par nom : par nom elle est vide pour
tout non-admin (la RLS sur `creators` lui rend 0 ligne, `get-mkt-links.ts:42`). La colonne
`creator_id` est **déjà lue** (`get-mkt-links.ts:38`), seule la propagation manque.

- [ ] **Step 1: Ajouter le champ au type**

Dans `apps/web/src/lib/types/marketing.ts`, dans `MktLinkRow`, juste avant `creator` :

```ts
  /** Id de la modèle rattachée — la jointure se fait par ID, jamais par nom : sous RLS
   *  `creators_scoped_read`, un non-admin ne lit aucun nom (get-mkt-links.ts:42). */
  creatorId: string | null
```

- [ ] **Step 2: Le propager**

Dans `apps/web/src/lib/services/get-mkt-links.ts`, dans l'objet retourné par le `.map((l) => …)`,
à côté de `creator:` :

```ts
        creatorId: l.creator_id,
```

- [ ] **Step 3: Exposer `date` sur `MktLinkDailyRow`**

Même fichier. L'interface déclare `link_id, clicks, conversions, revenue_eur` mais pas `date`,
alors que la table l'a et que le dashboard la sélectionne déjà. `buildDailyShare` (Task 6) en a
besoin pour grouper par jour.

Dans l'interface :

```ts
export interface MktLinkDailyRow {
  link_id: string
  /** Jour du relevé — nécessaire à tout agrégat PAR JOUR (cf. marketing-modeles). */
  date: string
  clicks: number
  conversions: number
  revenue_eur: number
}
```

Et dans le `fetchAll` par défaut de `getLinkRows`, ajouter `date` au select pour que le type
ne mente pas :

```ts
          .select('date, link_id, clicks, conversions, revenue_eur')
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @glagency/web typecheck`
Expected: aucune erreur — l'ajout d'un champ ne casse aucun des trois consommateurs
(marketing-liens, marketing-dashboard, marketing-social).

- [ ] **Step 5: Commit** *(demander à Benoit d'abord)*

```bash
git add apps/web/src/lib/types/marketing.ts apps/web/src/lib/services/get-mkt-links.ts
git commit -m "refactor(marketing): les liens portent l'id de leur modèle et le jour du relevé"
```

---

## Task 5: Le droit et l'entrée de nav

**Files:**
- Modify: `apps/web/src/config/workspaces.ts` (`PAGE_SLUGS` ligne ~290, tableau `nav` de la face marketing)
- Modify: `apps/web/src/config/workspaces.test.ts` (ajout d'un test)

**Interfaces:**
- Produces: le slug `'mkt-modeles'` (type `PageSlug`), consommé par `requireAccess` en Task 8.

- [ ] **Step 1: Écrire le test d'abord**

Dans `apps/web/src/config/workspaces.test.ts`, ajouter :

```ts
describe('face Marketing — page Modèles', () => {
  it('expose le slug mkt-modeles', () => {
    expect(PAGE_SLUGS).toContain('mkt-modeles')
  })

  it('range Modèles dans le sous-onglet Réseaux', () => {
    const mkt = WORKSPACES.find((w) => w.id === 'marketing')!
    const item = mkt.nav.find((n) => n.href === '/marketing/modeles')!
    expect(item.group).toBe('reseaux')
    expect(item.slug).toBe('mkt-modeles')
    expect(item.adminOnly).toBeUndefined()
  })
})
```

Vérifier les imports en tête du fichier (`PAGE_SLUGS`, `WORKSPACES`) et les compléter si besoin.

- [ ] **Step 2: Lancer le test, vérifier qu'il ÉCHOUE**

Run: `pnpm --filter @glagency/web test -- workspaces`
Expected: FAIL — `mkt-modeles` absent de `PAGE_SLUGS`.

- [ ] **Step 3: Ajouter le slug**

Dans `PAGE_SLUGS`, après `'mkt-liens'` :

```ts
'mkt-modeles',
```

- [ ] **Step 4: Ajouter l'item de nav**

Dans le tableau `nav` de la face `marketing`, après la ligne « Liens tracking » :

```ts
      { href: '/marketing/modeles', label: 'Modèles', icon: UsersRound, slug: 'mkt-modeles', group: 'reseaux' },
```

`UsersRound` est déjà importé en tête de `workspaces.ts`.

- [ ] **Step 5: Lancer le test, vérifier qu'il PASSE**

Run: `pnpm --filter @glagency/web test -- workspaces`
Expected: PASS, et aucun test existant cassé.

- [ ] **Step 6: Accorder le droit sur l'UAT**

```bash
DBU=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$DBU" -X -q -c "
update profiles set pages = array_append(pages, 'mkt-modeles')
where 'mkt-liens' = any(pages) and not ('mkt-modeles' = any(pages))
returning display_name;"
```

Expected: au moins « Juba marketing ». Nécessaire pour éprouver D3 à la Task 10.

- [ ] **Step 7: Commit** *(demander à Benoit d'abord)*

```bash
git add apps/web/src/config/workspaces.ts apps/web/src/config/workspaces.test.ts
git commit -m "feat(marketing): le droit et l'entrée de nav de la page Modèles"
```

---

## Task 6: La fonction pure d'agrégation (TDD)

**Files:**
- Create: `apps/web/src/features/marketing-modeles/types.ts`
- Create: `apps/web/src/features/marketing-modeles/aggregate.ts`
- Create: `apps/web/src/features/marketing-modeles/aggregate.test.ts`

**Interfaces:**
- Consumes: `MktLinkRow` (Task 4).
- Produces: `buildModeles(revenue: CreatorRevenue[], links: MktLinkRow[], daily: DailyShare[], periodLabel: string): MktModelesData`
  et `buildDailyShare(subs: DailySubs[], linkDaily: MktLinkDailyRow[]): DailyShare[]`,
  tous deux consommés par la Task 7.

C'est le cœur métier de la page, et la seule partie testable sans base. `vitest.config.ts`
d'`apps/web` inclut `src/**/*.test.ts` — un test dans la feature est pris.

- [ ] **Step 1: Écrire les types**

```ts
// apps/web/src/features/marketing-modeles/types.ts
// Types / forme des props de la feature marketing-modeles.

import type { MktLinkRow } from '@/lib/types/marketing'

/** Une ligne de `mkt_creator_revenue(…)->'creators'` (0152) — comptes privés déjà regroupés. */
export interface CreatorRevenue {
  creator_id: string
  name: string
  ca: number
  new_subs: number
  subs_active: number
}

/** Une ligne de `mkt_creator_revenue(…)->'daily'` : les nouveaux abonnés de TOUTE l'agence ce jour. */
export interface DailySubs {
  date: string
  new_subs: number
}

/** Un point de la courbe : quelle part des abonnés de ce jour est venue d'un lien. */
export interface DailyShare {
  date: string
  newSubs: number
  subsLiens: number
  /** %, `null` si aucun nouvel abonné ce jour-là — la courbe fait un trou, elle ne descend pas à 0. */
  part: number | null
}

/** Une modèle, ses totaux et la part venue des liens de tracking. */
export interface MktModeleRow {
  creatorId: string
  name: string
  /** Totaux de la modèle (source `creator_daily`, via RPC). */
  caTotal: number
  newSubs: number
  subsActive: number
  /** Attribué aux liens de tracking (source `mkt_link_daily`). */
  caLiens: number
  subsLiens: number
  clics: number
  /** Parts en %, `null` quand le dénominateur est nul (jamais 0 — cf. §4.4 de la spec). */
  partCa: number | null
  partSubs: number | null
  /** Liens de la modèle, triés par abonnés décroissants puis CA (D4). */
  links: MktLinkRow[]
}

export interface MktModelesData {
  period: string
  /** Part des nouveaux abonnés venue des liens, jour par jour. */
  daily: DailyShare[]
  /** Y a-t-il UN relevé de lien sur la période ? `false` → état vide explicite, jamais des 0. */
  hasLinkData: boolean
  totals: {
    caTotal: number
    newSubs: number
    caLiens: number
    subsLiens: number
    clics: number
    partCa: number | null
    partSubs: number | null
  }
  modeles: MktModeleRow[]
}
```

- [ ] **Step 2: Écrire les tests (ils doivent échouer)**

```ts
// apps/web/src/features/marketing-modeles/aggregate.test.ts
import { describe, expect, it } from 'vitest'
import { buildDailyShare, buildModeles } from './aggregate'
import type { CreatorRevenue } from './types'
import type { MktLinkRow } from '@/lib/types/marketing'

const rev = (o: Partial<CreatorRevenue> & { creator_id: string }): CreatorRevenue => ({
  name: 'X', ca: 0, new_subs: 0, subs_active: 0, ...o,
})

const link = (o: Partial<MktLinkRow> & { id: string }): MktLinkRow => ({
  name: 'l', type: 'twitter', url: '', creatorId: null, creator: null, staff: [], active: true,
  clicks: 0, conversions: 0, revenueEur: 0, ltv: null, taux: null, ...o,
})

describe('buildModeles', () => {
  it('rattache un lien à sa modèle par ID, pas par nom', () => {
    const d = buildModeles(
      [rev({ creator_id: 'c1', name: 'Carla', ca: 1000, new_subs: 100 })],
      // `creator` (le nom) est null : c'est ce que voit un non-admin sous RLS.
      [link({ id: 'l1', creatorId: 'c1', creator: null, conversions: 10, revenueEur: 50 })],
      [],
      'Juin',
    )
    expect(d.modeles[0].links).toHaveLength(1)
    expect(d.modeles[0].caLiens).toBe(50)
    expect(d.modeles[0].subsLiens).toBe(10)
  })

  it('calcule les parts en % et arrondit à une décimale', () => {
    const d = buildModeles(
      [rev({ creator_id: 'c1', name: 'Carla', ca: 1000, new_subs: 100 })],
      [link({ id: 'l1', creatorId: 'c1', conversions: 5, revenueEur: 30 })],
      [],
      'Juin',
    )
    expect(d.modeles[0].partCa).toBe(3)
    expect(d.modeles[0].partSubs).toBe(5)
  })

  it('rend null (jamais 0) quand le dénominateur est nul', () => {
    const d = buildModeles(
      [rev({ creator_id: 'c1', name: 'Carla', ca: 0, new_subs: 0 })],
      [link({ id: 'l1', creatorId: 'c1', conversions: 3, revenueEur: 10 })],
      [],
      'Juin',
    )
    expect(d.modeles[0].partCa).toBeNull()
    expect(d.modeles[0].partSubs).toBeNull()
  })

  it('garde une modèle sans aucun lien, à zéro et sans part', () => {
    const d = buildModeles([rev({ creator_id: 'c1', name: 'Claire', ca: 500, new_subs: 30 })], [], [], 'Juin')
    expect(d.modeles[0].links).toHaveLength(0)
    expect(d.modeles[0].caLiens).toBe(0)
    expect(d.modeles[0].partSubs).toBe(0)
  })

  it('ignore un lien sans modèle rattachée', () => {
    const d = buildModeles(
      [rev({ creator_id: 'c1', name: 'Carla', ca: 100, new_subs: 10 })],
      [link({ id: 'l1', creatorId: null, conversions: 5, revenueEur: 20 })],
      [],
      'Juin',
    )
    expect(d.modeles).toHaveLength(1)
    expect(d.modeles[0].caLiens).toBe(0)
    // Mais il compte dans les totaux d'agence : le revenu existe, il est juste non rattaché.
    expect(d.totals.caLiens).toBe(20)
  })

  it('trie les modèles par CA total décroissant et leurs liens par abonnés', () => {
    const d = buildModeles(
      [
        rev({ creator_id: 'c1', name: 'Petite', ca: 100, new_subs: 10 }),
        rev({ creator_id: 'c2', name: 'Grosse', ca: 900, new_subs: 90 }),
      ],
      [
        link({ id: 'a', creatorId: 'c2', conversions: 2, revenueEur: 99 }),
        link({ id: 'b', creatorId: 'c2', conversions: 8, revenueEur: 1 }),
      ],
      [],
      'Juin',
    )
    expect(d.modeles.map((m) => m.name)).toEqual(['Grosse', 'Petite'])
    expect(d.modeles[0].links.map((l) => l.id)).toEqual(['b', 'a'])
  })

  it('dit hasLinkData=false quand AUCUN lien n a de relevé sur la période', () => {
    const d = buildModeles([rev({ creator_id: 'c1', ca: 100, new_subs: 10 })], [], [], 'Septembre')
    expect(d.hasLinkData).toBe(false)
  })

  it('dit hasLinkData=true dès qu un lien a un clic, même sans revenu', () => {
    const d = buildModeles(
      [rev({ creator_id: 'c1', ca: 100, new_subs: 10 })],
      [link({ id: 'l1', creatorId: 'c1', clicks: 4 })],
      [],
      'Juin',
    )
    expect(d.hasLinkData).toBe(true)
  })
})

describe('buildDailyShare', () => {
  it('calcule la part de chaque jour et ordonne par date', () => {
    const r = buildDailyShare(
      [
        { date: '2026-06-02', new_subs: 200 },
        { date: '2026-06-01', new_subs: 100 },
      ],
      [
        { link_id: 'a', date: '2026-06-01', clicks: 0, conversions: 10, revenue_eur: 0 },
        { link_id: 'b', date: '2026-06-01', clicks: 0, conversions: 5, revenue_eur: 0 },
        { link_id: 'a', date: '2026-06-02', clicks: 0, conversions: 40, revenue_eur: 0 },
      ],
    )
    expect(r.map((d) => d.date)).toEqual(['2026-06-01', '2026-06-02'])
    expect(r[0].subsLiens).toBe(15)
    expect(r[0].part).toBe(15)
    expect(r[1].part).toBe(20)
  })

  it('rend part=null (un trou, pas un zéro) un jour sans nouvel abonné', () => {
    const r = buildDailyShare([{ date: '2026-06-01', new_subs: 0 }], [])
    expect(r[0].part).toBeNull()
  })

  it('garde un jour sans relevé de lien à 0 %, ce qui est vrai', () => {
    const r = buildDailyShare([{ date: '2026-06-01', new_subs: 50 }], [])
    expect(r[0].part).toBe(0)
  })
})
```

- [ ] **Step 3: Lancer les tests, vérifier qu'ils échouent**

Run: `pnpm --filter @glagency/web test -- aggregate`
Expected: FAIL — `buildModeles` et `buildDailyShare` n'existent pas.

- [ ] **Step 4: Écrire l'implémentation**

```ts
// apps/web/src/features/marketing-modeles/aggregate.ts
import { round1, round2 } from '@glagency/core'
import type { MktLinkRow } from '@/lib/types/marketing'
import type {
  CreatorRevenue,
  DailyShare,
  DailySubs,
  MktModeleRow,
  MktModelesData,
} from './types'
import type { MktLinkDailyRow } from '@/lib/services/get-mkt-links'

/** Part en %, arrondie à 0,1. `null` si le dénominateur est nul — JAMAIS 0 (§4.4 de la spec) :
 *  « pas de base de calcul » et « part nulle » sont deux informations différentes. */
const part = (n: number, d: number): number | null => (d > 0 ? round1((n / d) * 100) : null)

/**
 * Croise l'agrégat par modèle (RPC `mkt_creator_revenue`, 0152) avec les liens de tracking
 * de la période (`getLinkRows`). FONCTION PURE — tout le métier de la page tient ici.
 *
 * La jointure se fait par `creatorId`, jamais par nom : sous RLS `creators_scoped_read`, un
 * non-admin ne lit aucun nom de modèle et toute jointure par nom lui rendrait une page vide.
 *
 * Un lien sans modèle rattachée ne disparaît pas : il ne s'accroche à aucune bande, mais
 * compte dans les totaux d'agence — son revenu est réel.
 */
export function buildModeles(
  revenue: CreatorRevenue[],
  links: MktLinkRow[],
  daily: DailyShare[],
  periodLabel: string,
): MktModelesData {
  const byCreator = new Map<string, MktLinkRow[]>()
  for (const l of links) {
    if (!l.creatorId) continue
    byCreator.set(l.creatorId, [...(byCreator.get(l.creatorId) ?? []), l])
  }

  const modeles: MktModeleRow[] = revenue
    .map((r) => {
      const own = (byCreator.get(r.creator_id) ?? []).slice().sort(
        (a, b) => b.conversions - a.conversions || b.revenueEur - a.revenueEur,
      )
      const caLiens = round2(own.reduce((s, l) => s + l.revenueEur, 0))
      const subsLiens = own.reduce((s, l) => s + l.conversions, 0)
      return {
        creatorId: r.creator_id,
        name: r.name,
        caTotal: round2(r.ca),
        newSubs: r.new_subs,
        subsActive: r.subs_active,
        caLiens,
        subsLiens,
        clics: own.reduce((s, l) => s + l.clicks, 0),
        partCa: part(caLiens, r.ca),
        partSubs: part(subsLiens, r.new_subs),
        links: own,
      }
    })
    .sort((a, b) => b.caTotal - a.caTotal)

  // Totaux d'agence : les liens sont sommés sur TOUS les liens (y compris non rattachés),
  // le CA sur toutes les modèles rendues par la RPC.
  const caTotal = round2(revenue.reduce((s, r) => s + r.ca, 0))
  const newSubs = revenue.reduce((s, r) => s + r.new_subs, 0)
  const caLiens = round2(links.reduce((s, l) => s + l.revenueEur, 0))
  const subsLiens = links.reduce((s, l) => s + l.conversions, 0)
  const clics = links.reduce((s, l) => s + l.clicks, 0)

  return {
    period: periodLabel,
    daily,
    // Un relevé existe dès qu'une métrique bouge — un lien peut avoir des clics sans revenu.
    hasLinkData: caLiens > 0 || subsLiens > 0 || clics > 0,
    totals: {
      caTotal,
      newSubs,
      caLiens,
      subsLiens,
      clics,
      partCa: part(caLiens, caTotal),
      partSubs: part(subsLiens, newSubs),
    },
    modeles,
  }
}

/**
 * La courbe : quelle part des nouveaux abonnés de CHAQUE jour est venue d'un lien.
 *
 * Deux sources au même grain : `subs` vient de la RPC (`->'daily'`, tout l'agence),
 * `linkDaily` des lignes brutes de `mkt_link_daily` que le service lit déjà pour
 * `getLinkRows` — aucune requête supplémentaire.
 *
 * L'axe des jours est celui des ABONNÉS, pas celui des liens : un jour sans le moindre
 * relevé de lien reste sur la courbe à 0 %, ce qui est vrai. C'est l'inverse qui mentirait
 * (un jour sans nouvel abonné rendrait `part` indéfinie — d'où `null`, un trou dans la
 * courbe, jamais un 0 qui se lirait comme un échec).
 */
export function buildDailyShare(subs: DailySubs[], linkDaily: MktLinkDailyRow[]): DailyShare[] {
  const convByDay = new Map<string, number>()
  for (const d of linkDaily) {
    convByDay.set(d.date, (convByDay.get(d.date) ?? 0) + d.conversions)
  }
  return subs
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const subsLiens = convByDay.get(d.date) ?? 0
      return {
        date: d.date,
        newSubs: d.new_subs,
        subsLiens,
        part: part(subsLiens, d.new_subs),
      }
    })
}
```

> `MktLinkDailyRow` porte `date` depuis la Task 4 Step 3 — sans quoi `buildDailyShare` ne
> compile pas.

- [ ] **Step 5: Lancer les tests, vérifier qu'ils passent**

Run: `pnpm --filter @glagency/web test -- aggregate`
Expected: 11 tests PASS.

- [ ] **Step 6: Commit** *(demander à Benoit d'abord)*

```bash
git add apps/web/src/features/marketing-modeles/
git commit -m "feat(marketing): le croisement CA total / CA des liens, pur et testé"
```

---

## Task 7: Le service de lecture

**Files:**
- Create: `apps/web/src/features/marketing-modeles/services/get-modeles.ts`

**Interfaces:**
- Consumes: `buildModeles` (Task 6), `getLinkRows(period)` de `@/lib/services/get-mkt-links`, la RPC `mkt_creator_revenue` (Task 3).
- Produces: `getMktModeles(period: Period): Promise<MktModelesData>`, consommé par la Task 8.

- [ ] **Step 1: Écrire le service**

```ts
// apps/web/src/features/marketing-modeles/services/get-modeles.ts
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getLinkRows } from '@/lib/services/get-mkt-links'
import type { Period } from '@/lib/period'
import { buildDailyShare, buildModeles } from '../aggregate'
import type { CreatorRevenue, DailySubs, MktModelesData } from '../types'

/** Ce que rend la RPC `mkt_creator_revenue` (0152). */
interface RevenuePayload {
  creators: CreatorRevenue[]
  daily: DailySubs[]
}

/**
 * Page Modèles : le CA total de chaque modèle (RPC 0152, `security definer` — la face
 * marketing n'a aucune assignation dans profile_creators) croisé avec ses liens de tracking.
 *
 * UN SEUL fetchAll sur `mkt_link_daily` sert deux usages, comme sur le dashboard marketing
 * (`get-dashboard.ts`) : `getLinkRows` en dérive l'agrégat PAR LIEN via `dailyRows`, et
 * `buildDailyShare` l'agrégat PAR JOUR. Passer la PROMESSE (pas les lignes résolues) préserve
 * le parallélisme.
 */
export async function getMktModeles(period: Period): Promise<MktModelesData> {
  const supabase = await createClient()
  const dailyPromise = fetchAll((f, t) =>
    supabase
      .from('mkt_link_daily')
      .select('date, link_id, clicks, conversions, revenue_eur')
      .gte('date', period.from)
      .lte('date', period.to)
      .order('link_id')
      .order('date')
      .range(f, t),
  )
  const [revenueRes, links, dailyRes] = await Promise.all([
    supabase.rpc('mkt_creator_revenue', { p_from: period.from, p_to: period.to }),
    getLinkRows(period, { dailyRows: dailyPromise }),
    dailyPromise,
  ])
  if (revenueRes.error) throw new Error(revenueRes.error.message)
  if (dailyRes.error) throw new Error(dailyRes.error.message)

  const payload = (revenueRes.data as RevenuePayload | null) ?? { creators: [], daily: [] }
  const share = buildDailyShare(payload.daily, dailyRes.data)
  return buildModeles(payload.creators, links, share, period.label)
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @glagency/web typecheck`
Expected: aucune erreur. Si `supabase.rpc('mkt_creator_revenue', …)` n'est pas typé, c'est que
la Task 3 Step 6 (régénération des types) n'a pas été faite — y retourner.

- [ ] **Step 3: Commit** *(demander à Benoit d'abord)*

```bash
git add apps/web/src/features/marketing-modeles/services/get-modeles.ts
git commit -m "feat(marketing): la lecture croisée modèles × liens"
```

---

## Task 8: La page et son squelette

**Files:**
- Create: `apps/web/src/app/(dash)/marketing/modeles/page.tsx`
- Create: `apps/web/src/app/(dash)/marketing/modeles/loading.tsx`
- Create: `apps/web/src/features/marketing-modeles/components/modeles-skeleton.tsx`
- Create: `apps/web/src/features/marketing-modeles/ModelesTemplate.tsx` (version minimale, enrichie en Task 9)

**Interfaces:**
- Consumes: `getMktModeles` (Task 7).
- Produces: la route `/marketing/modeles`.

Anatomie calquée sur `/marketing/liens/page.tsx` : kickoff **sans `await`** pour que le shell
s'affiche tout de suite, contenu sous `Suspense`.

- [ ] **Step 1: Écrire la page**

```tsx
// apps/web/src/app/(dash)/marketing/modeles/page.tsx
import { Suspense } from 'react'
import { getMktModeles } from '@/features/marketing-modeles/services/get-modeles'
import { MktModelesTemplate } from '@/features/marketing-modeles/ModelesTemplate'
import { MktModelesSkeleton } from '@/features/marketing-modeles/components/modeles-skeleton'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MktModelesData } from '@/features/marketing-modeles/types'

export default async function MktModelesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('mkt-modeles')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement.
  const data = getMktModeles(period)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Modèles</h1>
      <Suspense
        fallback={
          <SectionFallback subtitle="h-4 w-40">
            <MktModelesSkeleton />
          </SectionFallback>
        }
      >
        <MktModelesContent data={data} />
      </Suspense>
    </div>
  )
}

async function MktModelesContent({ data }: { data: Promise<MktModelesData> }) {
  return <MktModelesTemplate data={await data} />
}
```

- [ ] **Step 2: Copier le `loading.tsx` du voisin**

Run: `cat apps/web/src/app/\(dash\)/marketing/liens/loading.tsx`

Le reproduire à l'identique dans `modeles/loading.tsx`, en remplaçant le titre par « Modèles »
et le skeleton par `MktModelesSkeleton`.

- [ ] **Step 3: Écrire le skeleton**

Calquer `apps/web/src/features/marketing-liens/components/liens-skeleton.tsx` (le lire d'abord) :
une rangée de 4 `Skeleton` pour les KPI, un bloc large pour les donuts, puis 6 bandes de la
hauteur d'une section de modèle.

- [ ] **Step 4: Template minimal (le visuel arrive en Task 9)**

```tsx
// apps/web/src/features/marketing-modeles/ModelesTemplate.tsx
import { eur, num, pct } from '@/lib/format'
import type { MktModelesData } from './types'

/** Page Modèles : ce que les liens de tracking apportent à chaque modèle. */
export function MktModelesTemplate({ data }: { data: MktModelesData }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">{data.period}</p>
      {!data.hasLinkData && (
        <p className="text-sm text-muted-foreground">
          Aucun relevé de liens sur cette période.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {data.modeles.map((m) => (
          <li key={m.creatorId} className="flex items-baseline gap-3">
            <span className="font-medium">{m.name}</span>
            <span className="tabular-nums">{eur(m.caTotal)}</span>
            <span className="text-muted-foreground tabular-nums">
              {num(m.newSubs)} abonnés
            </span>
            <span className="tabular-nums">
              {m.partSubs === null ? '—' : pct(m.partSubs)} via liens
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 5: Lancer l'app et vérifier la page**

Run: `pnpm --filter @glagency/web dev`

Ouvrir `http://localhost:3000/marketing/modeles?from=2026-06-01&to=2026-07-11`.

Expected: 13 lignes, Carla en tête à **137 382 €** / 18 742 abonnés / **5 %** via liens.
Sans les paramètres `from`/`to`, la page doit afficher « Aucun relevé de liens sur cette
période » si le backfill de la Task 1 n'a pas été fait — **et non des zéros**.

- [ ] **Step 6: Commit** *(demander à Benoit d'abord)*

```bash
git add apps/web/src/app/\(dash\)/marketing/modeles apps/web/src/features/marketing-modeles
git commit -m "feat(marketing): la page Modèles, en lecture"
```

---

## Task 9: La couche visuelle

**Files:**
- Create: `apps/web/src/features/marketing-modeles/components/agency-split.client.tsx`
- Create: `apps/web/src/features/marketing-modeles/components/creator-section.client.tsx`
- Modify: `apps/web/src/features/marketing-modeles/ModelesTemplate.tsx`

**Interfaces:**
- Consumes: `MktModelesData` (Task 6).
- Produces: aucune interface consommée ailleurs.

**Contraintes de la charte dataviz** (§4.3 de la spec) : deux couleurs sur toute la page,
`#8b5cf6` pour « via liens » et le token `--muted` pour le reste ; écart de 2 px entre segments ;
survol avec tooltip ; valeurs en toutes lettres sous chaque donut (l'identité n'est jamais
portée par la couleur seule) ; pas de couleur par modèle.

- [ ] **Step 1: Les deux donuts + la courbe**

`agency-split.client.tsx`, `'use client'`. Trois blocs sur une ligne responsive
(`grid gap-4 md:grid-cols-3`) :

1. Donut « Nouveaux abonnés » — `PieChart` Recharts, `innerRadius={60} outerRadius={90}`,
   `paddingAngle={2}` (l'écart de 2 px exigé), deux `Cell` (`#8b5cf6`, `var(--muted)`).
   Valeur au centre via un `<text>` ou un div superposé : `pct(totals.partSubs)`.
2. Donut « CA » — identique, alimenté par `totals.caLiens` / `totals.caTotal`.
3. Sous chaque donut, en toutes lettres : `« 7 489 via liens · 60 086 hors tracking »`.

Emballer dans `ChartContainer` + `ChartTooltip` / `ChartTooltipContent` de
`@/components/ui/chart`, comme `mkt-daily-chart.client.tsx`.

**Si `partSubs` ou `partCa` vaut `null`** : afficher « — » et ne pas rendre le donut. Un anneau
plein gris se lirait comme « 0 % », ce que §4.4 interdit.

- [ ] **Step 2: La courbe de la part dans le temps**

Toujours dans `agency-split.client.tsx`, sous les donuts : `AreaChart` Recharts sur
`data.daily` (type `DailyShare[]`, produit par `buildDailyShare` en Task 6) — **une seule
série**, `dataKey="part"`.

```tsx
<ChartContainer config={{ part: { label: 'Part des abonnés via liens', color: '#8b5cf6' } }}
                className="aspect-auto h-[220px] w-full">
  <AreaChart data={data.daily}>
    <CartesianGrid vertical={false} />
    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24}
           tickFormatter={(v: string) => frDayMonthShort(v)} />
    <YAxis tickLine={false} axisLine={false} width={44}
           tickFormatter={(v: number) => `${v} %`} />
    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot"
      labelFormatter={(v) => frDayLong(v as string)} />} />
    <Area dataKey="part" type="monotone" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15}
          strokeWidth={2} connectNulls={false} />
  </AreaChart>
</ChartContainer>
```

`connectNulls={false}` est le point important : un jour sans nouvel abonné a `part: null` et
doit faire un **trou** dans la courbe. Relier les points par-dessus inventerait une continuité
qui n'existe pas, et la faire tomber à 0 se lirait comme un effondrement.

Une seule série : pas de légende (le titre nomme la série), mais le tooltip au survol reste
obligatoire. `frDayLong` / `frDayMonthShort` viennent de `@glagency/core`, comme dans
`mkt-daily-chart.client.tsx`.

- [ ] **Step 3: La bande dépliable par modèle**

`creator-section.client.tsx`, `'use client'`, sur `Collapsible` / `CollapsibleTrigger` /
`CollapsibleContent` de `@/components/ui/collapsible`.

Fermée : nom, CA total, CA liens + part, nouveaux abonnés, abonnés via liens + part, clics,
nombre de liens, et la barre de part (un `div` de fond `bg-muted` avec un `div` intérieur
`bg-[#8b5cf6]` à `width: {partSubs}%`).

Ouverte : `Table` de `@/components/ui/table` — Lien, Type (`Badge` + `typeBadge`), Abonnés,
CA, Clics, Taux, €/abonné. Micro-barre de part dans la colonne Abonnés.

Modèle sans lien : bande non dépliable, texte « aucun lien de tracking », `text-muted-foreground`.

- [ ] **Step 4: Assembler dans le Template**

Remplacer la liste minimale de la Task 8 par : rangée de `KpiCard` (4 tuiles) →
`<AgencySplit …>` → la liste de `<CreatorSection …>`.

Les 4 KPI : CA total, CA via liens (`hint` = la part), Nouveaux abonnés, Abonnés via liens
(`hint` = la part). `deltaPct: null` partout — pas de comparaison de période en v1, comme sur
le dashboard marketing existant.

- [ ] **Step 5: Vérifier à l'écran**

Ouvrir `/marketing/modeles?from=2026-06-01&to=2026-07-11`.

Expected, contre §6 de la spec : donut abonnés à **11,1 %**, donut CA à **3,2 %**, KPI
382 625 € / 12 375 € / 67 575 / 7 489. Déplier Jade → 3 liens, le premier à 2 754 abonnés.

- [ ] **Step 6: Vérifier le thème sombre**

Basculer le thème. Expected: le segment neutre suit le fond (il utilise `var(--muted)`, pas un
gris en dur), le violet reste lisible, aucun texte en couleur de série.

- [ ] **Step 7: Lint + typecheck**

Run: `pnpm --filter @glagency/web lint && pnpm --filter @glagency/web typecheck`
Expected: aucune erreur.

- [ ] **Step 8: Commit** *(demander à Benoit d'abord)*

```bash
git add apps/web/src/features/marketing-modeles
git commit -m "feat(marketing): la page Modèles passe en visuel — donuts, parts, liens dépliables"
```

---

## Task 10: Recette

**Files:** aucun (vérification).

- [ ] **Step 1: Les totaux d'agence**

Sur `/marketing/modeles?from=2026-06-01&to=2026-07-11`, comparer à §6 de la spec :

| Attendu | Valeur |
|---|---|
| CA total | 382 625 € |
| CA via liens | 12 375 € — 3,2 % |
| Nouveaux abonnés | 67 575 |
| Abonnés via liens | 7 489 — 11,1 % |
| Clics | 148 018 |

- [ ] **Step 2: Les 13 lignes par modèle**

Vérifier les 13 lignes du tableau de §6, dans l'ordre. **Contrôle de D6** : Carla à
**137 382 €** et non 134 895 € — c'est la fusion du compte privé.

- [ ] **Step 3: L'état vide**

Ouvrir la page sans paramètres (mois en cours). Si le backfill de la Task 1 a été fait, des
chiffres s'affichent. Sinon : « Aucun relevé de liens sur cette période » — **jamais 0 €**.

- [ ] **Step 4: Le contrôle d'accès (ce que D3 achète)**

Se connecter (ou s'impersonner) en « Juba marketing » — manager, 0 modèle assignée. La page
doit afficher **les mêmes chiffres** qu'un admin, noms de modèles compris.

- [ ] **Step 5: La prod n'a pas bougé**

```bash
DB=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$DB" -X -q -c "select max(version) from supabase_migrations.schema_migrations;"
psql "$DB" -X -q -c "select max(date) from mkt_link_daily;"
```

Expected: `0151` et `2026-07-12`. Aucun `wrangler deploy` n'a été lancé.

- [ ] **Step 6: Rapport à Benoit**

Résumer : ce qui est vérifié, ce qui reste ouvert (la courbe de la Task 9 Step 2 si elle a été
reportée), et la liste ordonnée du go prod (§7 de la spec).
