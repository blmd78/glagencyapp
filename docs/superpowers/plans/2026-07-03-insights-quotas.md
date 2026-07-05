# Insights hebdo « Quotas » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une carte hebdo par chatteur (« X — S-1 : n/5 quotas manqués »), splittée par modèle au prorata, S-1 + semaine en cours, statuts de traitement.

**Architecture:** Moteur pur et testé dans `packages/core/src/insights/quotas-hebdo.ts` (entrées = agrégats, sorties = `InsightDraft[]`) ; générateur côté ingestion (`apps/ingestion/src/insights.ts`, service-role) appelé après chaque run + CLI locale ; tables `insights`/`insight_states` (migration 0011, RLS admin-only v1) ; feature web `insights` (service lecture dernière génération + états, Server Action statut, cartes UI, badge sidebar).

**Tech Stack:** Vitest (TDD core), psql (migration), supabase-js service-role (worker), Next RSC + Server Actions (web), shadcn (Collapsible existant, Badge, Card).

## Global Constraints

- **AUCUN commit** (GO explicite requis) ; **migration appliquée seulement après accord** (elle touche la prod).
- **Fichiers scopés session** : ne pas réécrire `pipeline.ts`/`worker.ts` au-delà du hook minimal (2-6 lignes) — fichiers co-édités par une session parallèle, à signaler au commit.
- Spec source : `docs/superpowers/specs/2026-07-03-glagency-insights-design.md`. Vocabulaire : « quotas manqués », jamais « régression ».
- Seuils : warning = 1–2 quotas manqués, critical = ≥ 3 ; réactivité = LOWER-is-better ; niveau = mois-éq (CA moy/j × 30) : Gobelin < 1 000 · Recrue ≥ 1 000 · Stratège ≥ 1 900 · Commandant > 4 000.
- Clé stable : `quotas_<weekStart>_<chatterId>`. Sévérités en base : check `('critical','warning')`.

---

### Task 1: Moteur pur `buildQuotaInsights` (TDD, packages/core)

**Files:**
- Create: `packages/core/src/insights/quotas-hebdo.ts`
- Create: `packages/core/src/insights/quotas-hebdo.test.ts`
- Modify: `packages/core/src/index.ts` (exports)

**Interfaces (Produces):**
```ts
export interface QuotaTargets { presenceH: number; reactiviteS: number; mediasProposes: number; convPct: number; caEur: number }
export interface ChatterDayInput { chatterId: string; date: string; ca: number; propose: number; vendu: number; presenceActiveH: number; presenceIdleH: number; reactiviteSec: number | null }
export interface ChatterModelDayInput { chatterId: string; creatorId: string; date: string; ca: number }
export interface WeekWindow { start: string; label: string; daysWithData: number; days: ChatterDayInput[]; modelDays: ChatterModelDayInput[] }
export interface QuotaInsightsInput {
  evaluated: WeekWindow            // S-1 (ou semaine courante partielle à l'amorçage)
  currentWeek: WeekWindow | null   // null quand evaluated EST la semaine courante
  chatterNames: Record<string, string>
  modelNames: Record<string, string>
  targetsByModel: Record<string, QuotaTargets>  // creatorId → quotas de son équipe
}
export interface InsightKpi { label: string; value: string; target: string; ok: boolean }
export interface InsightModelSplit { name: string; days: number; ca: number; expected: number; pct: number; weekDays: number; weekCa: number; weekExpected: number }
export interface InsightDraft { key: string; weekStart: string; severity: 'critical' | 'warning'; chatterId: string; title: string; body: string; actionPlan: string; kpis: InsightKpi[]; models: InsightModelSplit[] }
export function buildQuotaInsights(input: QuotaInsightsInput): InsightDraft[]
```

**Règles de calcul (source unique) :**
- Jour actif (global) = ligne `days` du chatteur ce jour. Moyennes par quota sur jours actifs :
  présence = Σ presenceActiveH / jours ; médias = Σ propose / jours ; conv = Σ vendu / Σ propose × 100 (0 propose → quota non évaluable = ok) ; réactivité = moyenne des non-null (aucune valeur → ok), OK si ≤ cible (lower-is-better).
- **CA prorata** : par modèle, jours actifs modèle = dates distinctes de `modelDays` (ca > 0) ; attendu modèle = jours × `targetsByModel[creatorId].caEur` ; attendu global = Σ attendus ; réel = Σ ca modèle. Modèle sans quotas configurés → exclu de l'attendu (mentionné dans le split avec expected = 0, pct = 100).
- Cibles des 4 quotas globaux = celles du **modèle dominant** (max CA S-1).
- missed = nb de kpis `ok === false` ; 0 → pas de carte ; 1–2 → warning ; ≥ 3 → critical.
- Titre : `«{Nom} — S-1 : {n}/5 quotas manqués»` + ` · {d} j de données` si daysWithData < 7.
- Semaine en cours (si `currentWeek`) : CA à date, moy/j, `j{n}/7`, tendance « En difficulté » si moy/j < 80 % de la moy/j S-1, sinon « Dans la cible » ; alimente la section [SEMAINE EN COURS] du plan.
- actionPlan : sections texte [CA] / [PRÉSENCE] / [SEMAINE EN COURS] uniquement pour les volets en échec, phrases reprises de l'ancien CRM (RDV début de semaine, objectif chiffré +20 % vs S-1, vérif idle > 1h/j sur MyPuls, escalade « convocation bureau + rapport » si récurrence).

- [ ] **Step 1** : écrire `quotas-hebdo.test.ts` — cas : (a) prorata 2 modèles (3 j Carla cible 286 + 2 j Lola cible 80 → expected 1018, réel 600 → quota CA manqué, split correct) ; (b) tous quotas atteints → `[]` ; (c) 3 manqués → severity `critical` ; (d) clé = `quotas_2026-06-30_<id>` stable ; (e) réactivité 297s vs cible 300 → ok ; 350s → ko ; (f) semaine partielle daysWithData=4 → titre suffixé « 4 j de données » ; (g) currentWeek moy/j < 80 % S-1 → body contient « En difficulté ».
- [ ] **Step 2** : `pnpm --filter @glagency/core test` → FAIL (module absent).
- [ ] **Step 3** : implémenter `quotas-hebdo.ts` (fonctions internes : `activeDays`, `perModelSplit`, `buildKpis`, `severityOf`, `levelOf`, `buildActionPlan`) + exports index.
- [ ] **Step 4** : tests verts + `pnpm -r typecheck`.
- [ ] **Step 5** : checkpoint (pas de commit).

---

### Task 2: Migration `0011_insights.sql` + types DB

**Files:**
- Create: `packages/db/supabase/migrations/0011_insights.sql`
- Modify: `packages/db/src/types.ts` (tables insights, insight_states)

```sql
create table insights (
  insight_key  text not null,
  generated_at timestamptz not null default now(),
  week_start   date not null,
  severity     text not null check (severity in ('critical','warning')),
  chatter_id   uuid not null references chatters(id) on delete cascade,
  title        text not null,
  body         text not null,
  action_plan  text not null,
  kpis         jsonb not null default '[]',
  models       jsonb not null default '[]',
  primary key (insight_key, generated_at)
);
create index on insights (week_start);
create index on insights (chatter_id);

create table insight_states (
  insight_key text primary key,
  status      text not null default 'new' check (status in ('new','in_progress','resolved','ignored')),
  note        text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id) on delete set null
);

alter table insights enable row level security;
alter table insight_states enable row level security;
-- v1 : contenu tous-modèles → admin uniquement (lecture ET écriture des états).
create policy insights_admin_read on insights for select to authenticated using (public.is_admin());
create policy insight_states_admin_read  on insight_states for select to authenticated using (public.is_admin());
create policy insight_states_admin_write on insight_states for insert to authenticated with check (public.is_admin());
create policy insight_states_admin_update on insight_states for update to authenticated using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 1** : écrire le fichier ci-dessus. **Step 2** : ⚠️ demander l'accord de Benoit puis `psql -f` + `\d insights`. **Step 3** : ajouter les 2 tables à `packages/db/src/types.ts` (Row/Insert/Update, kpis/models en `Json`). **Step 4** : `pnpm -r typecheck` vert. Checkpoint.

---

### Task 3: Générateur côté ingestion + CLI + hook worker

**Files:**
- Create: `apps/ingestion/src/insights.ts`
- Create: `apps/ingestion/src/gen-insights.ts` (CLI : `pnpm insights`)
- Modify: `apps/ingestion/package.json` (script `"insights": "tsx src/gen-insights.ts"`)
- Modify: `apps/ingestion/src/worker.ts` (hook ~3 lignes dans `runAndRecord`, après `runPipeline` — fichier co-édité, toucher a minima)

**Interfaces:**
- Produces: `generateWeeklyInsights(db): Promise<{ generated: number; weekStart: string }>` —
  1. `maxDate` = max(chatter_daily.date). Semaine évaluée : si `maxDate` ≥ dimanche de S-1 (semaine complète dispo) → S-1 ; sinon semaine de `maxDate` (partielle, amorçage). `currentWeek` = semaine courante si ≠ évaluée, sinon null.
  2. Fetch : chatter_daily + chatter_creator_daily des 2 fenêtres, chatters (id, display_name), creators (id, name, team_id), quotas (par team) → `targetsByModel` (creator → quotas de sa team ; team sans ligne quotas → absent).
  3. `buildQuotaInsights(...)` → upsert `insights` (insert, PK versionnée par generated_at) via service-role. `insight_states` non touché (créé à la première action UI).
- CLI `gen-insights.ts` : loadEnv → createAdminClient → generateWeeklyInsights → console.log (test local immédiat sans déployer).
- Hook worker (dans `runAndRecord`, après le log du summary) :
```ts
try {
  const ins = await generateWeeklyInsights(createAdminClient())
  console.log(`[insights] ${ins.generated} carte(s) — semaine du ${ins.weekStart}`)
} catch (e) {
  console.warn('[insights] génération échouée (run OK par ailleurs) :', (e as Error).message)
}
```
- [ ] Steps : écrire module + CLI → `pnpm --filter @glagency/ingestion insights` en local → vérifier en SQL (`select insight_key, severity, title from insights`) → hook worker → typecheck. Checkpoint.

---

### Task 4: Feature web `insights`

**Files:**
- Modify: `apps/web/src/features/insights/types.ts`, `services/get-insights.ts`, `actions.ts`, `InsightsTemplate.tsx` (scaffolds existants)
- Create: `apps/web/src/features/insights/components/insight-card.tsx` (remplace l'existant lié à la fixture si présent), `components/status-buttons.tsx`
- Modify: `apps/web/src/app/(dash)/chatter/insights/page.tsx`

**Interfaces:**
- `InsightRow { key, weekStart, severity, chatterName?, title, body, actionPlan, kpis: InsightKpi[], models: InsightModelSplit[], generatedAt, status, note }`
- `getInsights(): Promise<{ weekStart: string | null; insights: InsightRow[] }>` — dernière génération par clé (tri générations desc, dédup par clé côté JS — volumes faibles), join `insight_states` (défaut `new`), join chatters pour le nom ; RLS fait le reste (user → []).
- `setInsightState(input: { key: string; status: 'new'|'in_progress'|'resolved'|'ignored'; note?: string }): Promise<Result>` — zod → `requireAccess('insights')` → upsert `insight_states` via client SESSION (la RLS admin-only est la garde réelle) → revalidatePath.
- UI carte : bandeau sévérité (STATUS_COLORS.danger/warning) + badge statut + titre ; chips kpis (vert/rouge, cible affichée) ; split modèles (S-1 et semaine en cours, % coloré) si ≥ 2 ; body pré-formaté ; plan d'action dans `Collapsible` (composant ui existant) ; boutons statut + note (textarea inline) via `useTransition`, erreurs affichées.
- Page : `requireAccess('insights')` ; en-tête « Semaine du {date} » + compteurs par sévérité + filtres (statut, sévérité) côté client ; état vide « Aucune analyse sur ton périmètre » (couvre le rôle user).
- Badge sidebar : `layout.tsx` compte (RLS-scopé) les clés dont l'état est `new`/`in_progress` (ou sans état) → prop `insightsCount` → `AppSidebar` affiche `SidebarMenuBadge` sur l'entrée Insights. (layout/app-sidebar = fichiers partagés : modifs minimales.)

- [ ] Steps : types → service → action → composants → page → badge → `pnpm typecheck && pnpm build` → déployer sur Cloudflare pour relecture (PAS de commit). Vérifs spec §7 : statut survit à une régénération (relancer la CLI), rôle user = vide.
