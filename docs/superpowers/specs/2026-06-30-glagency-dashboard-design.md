# Design — glagency dashboard (rebuild propre du « Chatters Performance Dashboard »)

> Date : 2026-06-30 · Repo : `glagencyapp` (blmd78/glagencyapp) · Statut : **design validé, en attente de relecture**

## 1. Contexte & objectif

L'agence pilote ses chatters (le staff qui message les fans des créatrices OnlyFans) via un
dashboard interne. L'app actuelle tourne sur un VPS : frontend statique (nginx + Basic Auth) +
API Flask (systemd, **en root**) qui aspire quotidiennement le CRM **MyPuls** et pré-calcule un
`data.json` de ~2 Mo. Dette : tout est pré-calculé et empilé dans un blob monolithique, les
données sont servies en fichiers statiques (fuite : tout compte authentifié télécharge tout), des
secrets sont en clair dans le code, le service tourne en root, plusieurs métriques sont mortes.

**Objectif** : reconstruire **proprement** la couche analytics (le dashboard), **sans remplacer
MyPuls** (qui reste la source via son API/scraping). Cible : **Next.js 16 + Supabase + OTP**, en
**TypeScript**, dans un **monorepo** au squelette inspiré de Holyware (`apps/*` + `packages/*`),
avec la convention maison **`app` (récup data) → `feature` (template) → `composants` (display)**.

## 2. Non-objectifs

- **Ne pas** remplacer MyPuls ni réimplémenter l'intégration OnlyFans (pas d'API OF officielle).
- **Ne pas** forker Twenty : on reprend sa *forme* (monorepo TS feature-sliced, design-system,
  packages partagés), pas son *moteur* (NestJS + GraphQL + métadonnées multi-tenant), surdimensionné
  pour un dashboard mono-tenant à schéma fixe.
- Pas de multi-tenant, pas de moteur de champs dynamiques.

## 3. Décisions d'architecture (verrouillées)

| Sujet | Décision |
|---|---|
| Langage | **TypeScript partout** (front, ingestion, domaine) |
| Monorepo | **pnpm workspaces** (`pnpm@9`, globs `apps/*` + `packages/*`), **pas de Turborepo** — comme Holyware |
| Front | **Next.js 16 (App Router, RSC)** + **Tailwind v4** + **shadcn/ui** (base reprise d'`apps/vitrine`) |
| Données/Auth | **Supabase** : Postgres + Auth (**OTP email**) + **RLS** ; clients via **`@supabase/ssr`** |
| Backend | **Aucun backend custom** : Server Components (lecture) + Server Actions (écriture) ; RLS = enforcement |
| Couche data | **Entrepôt** : tables Postgres au **grain jour** (+ **grain période** hybride), agrégations en **vues/RPC SQL** |
| Ingestion | **`apps/ingestion`** : worker Node cron (sur le VPS) ; MyPuls → `core` (transform + insights) → Supabase |
| Insights | **moteur de règles** (port des heuristiques Python) ; l'IA (Claude) reste **un bonus à la demande** |
| Déploiement web | **à trancher au déploiement** (Vercel ou Docker/VPS) — n'impacte pas le squelette |

## 4. Squelette du monorepo

```
glagencyapp/
├─ pnpm-workspace.yaml · package.json · tsconfig.base.json · .env.example
├─ apps/
│  ├─ web/            # Next 16 + Tailwind 4 + shadcn — le dashboard
│  └─ ingestion/      # worker cron Node : MyPuls → core → Supabase (tourne sur le VPS)
└─ packages/
   ├─ core/           # domaine PUR (zéro I/O) : métriques + moteur d'insights + types
   ├─ mypuls/         # adaptateur MyPuls : login CSRF + scrape (cheerio) + parsers
   └─ db/             # Supabase : migrations, RLS, vues/RPC, types générés, clients
```

**Règle de dépendance (sens unique) :**
```
web       → core (types, métriques), db (clients, types, RPC)
ingestion → mypuls (fetch), core (transform, insights), db (upsert, service-role)
core      → (rien : pur, testable sans réseau ni base)
```
Personne n'importe `web`. La **frontière = les tables Supabase** : `ingestion` est swappable.

### 4.1 `apps/web` (convention `app → feature(template) → composants`)

```
apps/web/src/
├─ app/                      ← RÉCUP DATA (Server Components), et rien d'autre
│  ├─ layout.tsx · globals.css
│  ├─ (auth)/login/page.tsx · (auth)/auth/callback/route.ts
│  ├─ (dash)/layout.tsx                      # shell : nav + onglets selon rôle
│  ├─ (dash)/{overview,insights,chatters,teams,health,quotas,compta,members}/page.tsx
│  └─ api/analyses/route.ts                  # seul appel IA (Claude, à la demande)
├─ features/                 ← DISPLAY (aucun fetch ici)
│  └─ <domaine>/
│     ├─ template.tsx        # reçoit `data` en props, appelle TOUS les composants
│     ├─ components/*.tsx    # composants présentationnels
│     ├─ actions.ts          # ("use server") mutations (server actions)
│     └─ types.ts
├─ components/ui/            # shadcn (button, card, dialog, table…)
├─ components/layout/        # AppShell, Nav, TabBar (génériques)
├─ lib/
│  ├─ supabase/{server,client,middleware}.ts   # @supabase/ssr
│  ├─ query/                # lectures typées (RPC/vues) — appelées par app/page.tsx
│  ├─ auth/                 # getSession, requireRole, scope-modèles
│  └─ utils.ts              # cn()
├─ providers/ · hooks/ (client) · config/ · types/ · styles/
└─ middleware.ts            # refresh session Supabase + gate auth
```

**Flux d'un onglet (uniforme) :** `app/(dash)/X/page.tsx` lit via `lib/query` (Supabase, session
user → RLS applique le cloisonnement) → passe `data` (+ server actions) à `features/X/template.tsx`
→ le template appelle ses `components/*`. Les écritures passent par `features/X/actions.ts`.

## 5. Modèle de données (Supabase / Postgres)

Grain **hybride** (confirmé par l'audit) : l'argent est dispo au **jour**, la présence/réactivité
seulement au **niveau période** côté MyPuls.

### 5.1 Dimensions
- **`creators`** (= « équipes/modèles ») : `id, name, mypuls_creator_id, is_secondary bool,
  primary_creator_id fk→creators, excluded bool, active bool`.
  *(`is_secondary`/`primary_creator_id` remplacent le mapping in-code `SECONDARY_TO_PRIMARY` ;
  `excluded` remplace `excluded_accounts.json`.)*
- **`chatters`** : `id, name, email, mypuls_user_id, creator_id fk→creators (équipe courante),
  role enum(setter|closer|sous_manager|volant|trainee|null), active bool, created_at`.
- **`profiles`** : `id (=auth.users.id), role enum(admin|manager|member), display_name, created_at`.
- **`profile_creators`** : `profile_id fk, creator_id fk` — modèles visibles par un manager
  *(remplace `users.models[]` ; `admin` ⇒ tout)*.

### 5.2 Faits — grain jour
- **`chatter_daily`** : `chatter_id fk, date, ca, ca_ppv, ca_tips, propose, vendu`
  — PK `(chatter_id, date)`. `taux_conv` dérivé = `vendu/propose`.
- **`creator_daily`** : `creator_id fk, date, ca, subs_active, new_subs` — PK `(creator_id, date)`.

### 5.3 Faits — grain période (hybride)
- **`chatter_period_stats`** : `chatter_id fk, period_start, period_end, presence_active_min,
  presence_idle_min, reactivite_sec, taux_conv` — PK `(chatter_id, period_start, period_end)`.

### 5.4 Insights & suivi
- **`insights`** : `id text PK (stable), scope enum(month|week|day), creator_id fk null,
  severity enum(critical|warning|opportunity|insight|notable|ok), category text, title, body,
  recommendation, icon, data_points jsonb, period_start, period_end, generated_at, age_days int`.
- **`insight_states`** : `insight_id text PK, status enum(open|in_progress|resolved|ignored|kept),
  updated_at, updated_by fk→profiles`.
- **`bilans`** (RH/disciplinaire) : `id, insight_id, chatter_id null, date, duree, etat, resume,
  actions, objectifs, sanction, next_check, notes, history jsonb, saved_at, saved_by`.

### 5.5 Config éditable
- **`quotas`** : `creator_id fk, presence_h, reactivite_s, medias_proposes, conv_pct, ca_eur,
  updated_at, updated_by`.
- **`transfers`** : `chatter_id fk, from_creator_id, to_creator_id, date, by` (journal des réaffectations).

### 5.6 Compta / paie (passe **côté serveur**, données sensibles)
Aujourd'hui 100 % en `localStorage` navigateur. **Ouvert** : capturer la forme exacte de
`compta_settings`/`compta_periods` avant de figer le schéma. Modèle minimal proposé :
`payroll_config (scope, key, value jsonb, updated_at)` + RLS **admin-only**.

### 5.7 Agrégation (RPC paramétrées)
`fn_chatters_period(p_start, p_end)`, `fn_creators_period(p_start, p_end)`, `fn_team_totals(...)`
— `SECURITY INVOKER` pour que la **RLS s'applique**. Vues matérialisées optionnelles pour les
fenêtres fixes (mois courant, dernière semaine complète).

### 5.8 RLS (corrige la fuite actuelle)
RLS activée sur toutes les tables. Politique : `admin` voit tout ; `manager`/`member` voit les
lignes dont `creator_id ∈ (select creator_id from profile_creators where profile_id = auth.uid())`
(les lignes `chatters`/`insights` sont jointes au `creator`). Écritures (`insight_states`, `bilans`,
`quotas`, `transfers`) gardées par rôle. **Fini** le `data.json` statique téléchargeable par tous.

## 6. Métriques (définitions + nettoyage)

À **conserver** (recalculées en SQL/`core`) : `ca / ca_ppv / ca_tips` (somme jour), `taux_conv`
(`vendu/propose`), `presence` (actif/idle, minutes, période), `reactivite` (s, période), `evolution`
(vs période précédente), `week_evolution` (vs semaine de réf), `subs_active / new_subs`, **LTV**
(`CA / new_subs`).

À **réparer ou retirer** (mortes/trompeuses aujourd'hui) :
- `com` (commission) = **10 % en dur** → **retirée** jour 1 ; réintroduite via une config de barème
  quand la vraie règle est connue *(ouvert)*.
- `missed_shifts` / `max_missed_shifts` = **0 figé** → **retirées** (pas de source de shifts) *(ouvert)*.
- `fans_distincts` = **toujours 0** (source vide) → **retirée** jusqu'à une vraie source *(ouvert)*.

## 7. Ingestion (`apps/ingestion`)

Worker Node lancé par **cron 06:00 Europe/Paris** sur le VPS (systemd-timer ou conteneur).
Pipeline `fetch → transform → upsert`, **idempotent** (upserts par clés naturelles) :
1. `mypuls.login` (formulaire web : CSRF + cookie) ; **secrets via env**, plus en clair.
2. Fetch : mois courant, dernière semaine complète, semaine en cours, mois précédent —
   `dashboard/stats` (JSON), `dashboard/subscriptions` (JSON), scrape `messaging-money-team` (HTML),
   API v1 `/creators` + `/users` (rôle MESSAGING) = source de vérité des affectations.
3. `core.transform` : DTO MyPuls → lignes `chatter_daily` / `creator_daily` / `chatter_period_stats`.
4. `core.insights.runRules` → upsert `insights` (remplace le pré-calcul du blob).
5. `cleanup` : `age_days`, purge des états anciens.
6. **`notify`** : alerte **réellement câblée** en cas d'échec (Telegram ou email) — le `notify.py`
   actuel est muet. Retries (3×, backoff) ; en cas d'échec total, on garde l'état précédent et on alerte.

Retours : avec le grain jour, **plus besoin d'archives mensuelles figées** (`history/*.json`).

## 8. Moteur d'insights (`packages/core/insights`)

Port **déterministe** des heuristiques Python (l'IA n'est pas dans le pipeline) :
`engine.ts` = `runRules(ctx) → Insight[]`, registre de règles : `pareto`, `regression`/`progression`,
`lowPerf`, `quotas` (KO/7 jours), `weeklyActionPlan` (système de « castes »
Commandant/Stratège/Recrue/Gobelin). `severity.ts` mappe la sévérité. **Fonctions pures** → testées
unitairement sur fixtures. **IA** : uniquement l'endpoint `app/api/analyses/route.ts` (Claude, clé
serveur), bouton « Générer l'analyse » — produit `summary/findings/action_plan/alerts`.

## 9. Auth & rôles

Supabase **OTP email** (code magique). `profiles` mappe `auth.uid → role + display_name` ;
`profile_creators` = modèles autorisés. `middleware.ts` rafraîchit la session ; le `(dash)/layout`
masque les onglets selon le rôle ; **la RLS fait l'enforcement réel** (le masquage UI n'est que cosmétique).
Rôles : `admin` (tout, gère les membres), `manager` (ses modèles), `member` (ses modèles, lecture).

## 10. Frontend — inventaire des features

Les **9 onglets actuels** sont regroupés en **8 features** : « Analyses » et « Bilan hebdo » sont
fusionnés dans `insights`.

| Feature (`features/<x>`) | Affiche | Données (RPC/tables) |
|---|---|---|
| `overview` | KPI globaux, Pareto, podium, castes | `fn_team_totals`, `fn_chatters_period` |
| `insights` | cartes + statut + bilans + analyse IA (à la demande) + bilan hebdo | `insights`, `insight_states`, `bilans`, `api/analyses` |
| `chatters` | classement chatters (CA/PPV/tips/conv/évolution) | `fn_chatters_period` |
| `teams` | CA par modèle, membres, répartition | `fn_creators_period`, `creators`, `chatters` |
| `health` | LTV agence + par modèle, abonnés | `fn_creators_period` (CA/new_subs) |
| `quotas` | seuils par modèle + exclusions (édition) | `quotas`, `creators` |
| `compta` | paie (désormais serveur + RLS admin) | `payroll_config` |
| `members` | CRUD comptes + rôles + scope modèles (admin) | `profiles`, `profile_creators` |

Écritures = **server actions** typées + validées **zod** + RLS (statut d'insight, bilan, quota,
transfert, membres, paie). Plus de 39 endpoints REST faits main.

## 11. Sécurité — corrections par rapport à l'existant

- Secrets MyPuls / clé Anthropic **hors du code**, en variables d'env / secrets Supabase.
  *(Les identifiants MyPuls actuels, en clair dans `fetch_mypuls.py`, sont à considérer compromis et à
  faire tourner.)*
- **Plus de fuite par fichiers statiques** : tout passe par Supabase + RLS.
- **Plus de service en root** : ingestion = worker dédié, droits minimaux (service-role côté serveur uniquement).
- Auth OTP (plus de Basic Auth partagé), sessions par cookies, scope par modèle réel.
- Validation systématique des entrées (zod) ; service-role **jamais** exposé au navigateur.

## 12. Tests

- **`packages/core`** : Vitest, tests unitaires de chaque fonction pure (métriques, chaque règle
  d'insight) — déterministes, sur fixtures.
- **`packages/mypuls/parse`** : Vitest sur **fixtures** de réponses MyPuls réelles (HTML/JSON).
- **`apps/ingestion`** : test d'intégration contre un Supabase local (`supabase start`) + fixtures.
- **`apps/web`** : Playwright optionnel (auth OTP + 2-3 onglets).

## 13. Plan de migration (incrémental)

0. **Scaffold** monorepo (pnpm) + `packages/db` (schéma + RLS + RPC) + Auth OTP + base `apps/web`
   (Next16/Tailwind4/shadcn repris d'`apps/vitrine`).
1. **Ingestion** : `mypuls` + `core.transform` + upserts ; **backfill** de l'historique
   (import des `history/*.json` + `data.json` existants, et/ou re-fetch quotidien sur la rétention MyPuls).
2. **Web feature par feature** : `overview → chatters → teams → insights → quotas → health → compta → members`.
3. **Bascule** : on coupe l'app Flask du VPS une fois la parité atteinte.

## 14. Points ouverts (à trancher avant/pendant l'implémentation)

1. **Déploiement web** : Vercel vs Docker/VPS.
2. **Compta/paie** : capturer la forme exacte du `localStorage` actuel (`compta_settings`,
   `compta_periods`) avant de figer `payroll_config`.
3. **`com` / `missed_shifts` / `fans_distincts`** : vraies définitions (et sources) ou suppression définitive.
4. **Profondeur du backfill** : quelle rétention quotidienne MyPuls expose réellement.
5. **Canal d'alerte** ingestion : Telegram (déjà câblé côté agence ?) vs email.
6. **Nommage** : `features/` (retenu) vs `modules/` (façon Twenty) — cosmétique.
