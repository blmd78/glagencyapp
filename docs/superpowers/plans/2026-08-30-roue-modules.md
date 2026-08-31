# Roue des modules (2ᵉ roue, côté chatter) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** un chatter gagne un tour de roue à chaque module terminé (≥ 60 à tous ses exos, joués
sur le CRM), le joue lui-même depuis `/formation/ma-roue`, et gagne entre 6 et 8 € à chaque fois.

**Architecture :** l'octroi vit **dans Postgres** — le trigger `training_on_session_scored` appelle
une fonction qui matérialise un *ticket* dès que le dernier exo d'un module passe à 60. Deux
unicités de base portent les garanties du modèle : `(profile_id, module_id)` sur les tickets (un
module ne paie qu'une fois) et `(ticket_id)` sur les tirages (un tour = un tirage). Côté web, une
feature standard `app → feature(template) → composants`, lectures sous RLS, écriture du tirage en
service-role après garde, tirage décidé serveur (`crypto.randomInt`).

**Tech Stack :** Postgres/Supabase (migrations `packages/db/supabase/migrations/`), Next.js 16 App
Router (RSC + Server Actions), Tailwind v4 + shadcn/ui, Zod v4 + React Hook Form, Vitest.

**Spec :** `docs/superpowers/specs/2026-08-30-roue-modules-chatter-design.md` — à lire AVANT de
commencer. Les décisions D1→D5 et les deux pièges (§2.2 index `semaine_systeme_uidx`, §3.2 import
GLA) y sont argumentés ; ce plan ne les re-justifie pas.

## Global Constraints

- **Migration = `0136_roue_modules.sql`.** Séquence contiguë, prod ET UAT sont à `0135`
  (vérifié le 2026-08-30). Ne jamais re-renuméroter l'existant.
- **Appliquer une migration** : `cd packages/db && supabase db push --db-url "$DB"` (jamais
  `psql -f`, jamais `supabase link` — cassé sur ce projet). URL extraite en brut :
  `grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//'` — **jamais `source .env`**.
  Connexion directe port **5432** (pas le pooler 6543).
- **UAT d'abord.** Tout ce plan se recette sur `DATABASE_URL_UAT`. La prod ne reçoit la migration
  qu'au moment de la release, **avant** le déploiement du code.
- **Convention SQL** : `text` + `check`, **jamais `create type … enum`**. RLS wrappée `(select …)`.
  Fonctions `security definer` toujours avec `set search_path = public, pg_temp`. FK indexée sauf si
  déjà couverte par un unique en tête.
- **Convention web** : `app/**/page.tsx` récupère la donnée via `features/<f>/services/`, la passe en
  props au `Template` (Server Component). **Aucun fetch dans une feature.** Mutations en Server
  Actions via `runAction`. Cross-feature **interdit** par ESLint.
- **Jamais de `select` nu sur une table de faits** (troncature silencieuse à 1000 lignes) :
  agrégation en RPC SQL, ou `fetchAll`.
- **Tout formulaire RHF DOIT porter `'use no memo'`** en tête du composant (le React Compiler casse
  `formState` — loading et erreurs).
- **Terminologie UI** : « chatter » / « chatters ». Le rôle en base reste `'chatteur'`, les routes
  restent `/chatter/`.
- **Design** : épuré, pas de filet ni séparateur décoratif. Ne pas toucher au style existant.
- **Aucun commit n'est poussé sans validation de Benoit.** Les steps `Commit` créent le commit
  local ; la PR se fait à la fin, sur demande.
- **Vérifications** : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (à la racine).

---

## Structure des fichiers

**Créés :**

| Fichier | Responsabilité |
|---|---|
| `packages/db/supabase/migrations/0136_roue_modules.sql` | config, ticket `module_id`, index, 3 fonctions, trigger, rétroactif |
| `apps/web/src/components/training/wheel-svg.tsx` | *(déplacé)* le disque SVG, partagé par les 2 roues |
| `apps/web/src/components/training/wheel-result.tsx` | *(déplacé + props généralisées)* la révélation « coffre » |
| `apps/web/src/features/training-module-wheel/types.ts` | contrat de la feature |
| `apps/web/src/features/training-module-wheel/mappers.ts` | frontière jsonb ↔ TS des segments |
| `apps/web/src/features/training-module-wheel/mappers.test.ts` | tests de la frontière |
| `apps/web/src/features/training-module-wheel/schema.ts` | Zod du dialog admin |
| `apps/web/src/features/training-module-wheel/schema.test.ts` | tests du schéma |
| `apps/web/src/features/training-module-wheel/services/get-module-wheel.ts` | la donnée de la page |
| `apps/web/src/features/training-module-wheel/actions.ts` | `spinModuleWheel`, `saveModuleWheelConfig` |
| `apps/web/src/features/training-module-wheel/ModuleWheelTemplate.tsx` | assemblage (Server Component) |
| `apps/web/src/features/training-module-wheel/components/module-wheel-spinner.tsx` | feuille client : la roue |
| `apps/web/src/features/training-module-wheel/components/module-wheel-progress.tsx` | « Comment gagner un tour » |
| `apps/web/src/features/training-module-wheel/components/module-wheel-gains.tsx` | « Mes gains » |
| `apps/web/src/features/training-module-wheel/components/module-wheel-config-dialog.tsx` | config admin |
| `apps/web/src/features/training-module-wheel/components/module-wheel-skeleton.tsx` | silhouette |
| `apps/web/src/app/(dash)/formation/ma-roue/page.tsx` | route |
| `apps/web/src/app/(dash)/formation/ma-roue/loading.tsx` | squelette de route |
| `apps/web/src/lib/services/module-wheel-pending.ts` | la pastille |

**Modifiés :**

| Fichier | Modification |
|---|---|
| `packages/db/src/types.ts` | régénéré |
| `CLAUDE.md` | état des migrations (0135 → prochaine 0136) |
| `apps/web/src/lib/types/training.ts` | + type `WheelReveal` |
| `apps/web/src/features/training-wheel/components/wheel-spinner.tsx` | imports déplacés + mapping `WheelReveal` |
| `apps/web/src/features/training-wheel/components/wheel-config-dialog.tsx` | import déplacé |
| `apps/web/src/features/training-wheel/services/get-wheel-history.ts` | + `origine` par tirage |
| `apps/web/src/features/training-wheel/types.ts` | + `origine` sur `WheelHistoryRow` |
| `apps/web/src/features/training-wheel/components/wheel-history.tsx` | + colonne « Origine » |
| `apps/web/src/config/workspaces.ts` | + item de nav « Ma roue » |
| `apps/web/src/app/(dash)/layout.tsx` | + promesse de pastille |
| `apps/web/src/components/app-sidebar.tsx` | + `<CountBadge>` sur `/ma-roue` |

---

### Task 1 : la migration `0136`

**Files:**
- Create: `packages/db/supabase/migrations/0136_roue_modules.sql`
- Modify: `packages/db/src/types.ts` (régénéré, ne pas éditer à la main)
- Modify: `CLAUDE.md:… ` (bloc « Migrations (Supabase) » et mention `0113_formation.sql`)

**Interfaces:**
- Produces:
  - table `training_module_wheel_config (id smallint, title text, segments jsonb, updated_at, updated_by)`
  - colonne `training_wheel_tickets.module_id uuid null`
  - `training_module_wheel_grant(p_profile uuid, p_module uuid) returns integer` — **service_role uniquement**
  - `training_module_wheel_pending(p_profile uuid) returns integer` — `authenticated`
  - `training_module_wheel_state(p_profile uuid) returns table (module_id uuid, cas_actifs integer, valides_ici integer)` — `authenticated`, `security invoker`

- [ ] **Step 1 : écrire la migration**

Créer `packages/db/supabase/migrations/0136_roue_modules.sql` :

```sql
-- 0136 — La roue des MODULES : une 2ᵉ roue, celle du chatter.
--
-- Règle produit (2026-08-30) : un module terminé = un tour de roue. « Terminé » = tous les cas
-- ACTIFS du module validés à ≥ 60. 7 modules au catalogue (6 + le boss) = 7 tours, 8 secteurs
-- 6/6/7/7/7/8/8/8 €, aucun perdant. Espérance 7,125 € le tour, ~50 € pour un parcours complet.
--
-- La roue nº 1 (`/formation/roue`, l'encadrant qui lance pour quelqu'un) n'est PAS touchée. Les
-- deux roues écrivent dans le MÊME `training_wheel_spins` : une seule compta, un seul `paid_at`.
--
-- ⚠️ D5 — L'HISTORIQUE IMPORTÉ DE GLA NE PAIE PAS. 0123 l'énonce déjà (« seul ce qui DÉCIDE d'un
-- versement est filtré ») : l'import compte pour la progression, le classement et les trophées,
-- jamais pour de l'argent. Mesuré sur la prod le 2026-08-30 : sans ce filtre, 6 des 10 tours
-- rétroactifs auraient payé du travail fait ailleurs, et la reprise étant TOUJOURS OUVERTE, un
-- import aurait débloqué jusqu'à 50 € d'un coup. D'où deux choix, ci-dessous :
--   1. la complétion se lit dans `training_sessions` (`legacy_id is null`), PAS dans
--      `training_case_bests` — qui mélange les deux origines ;
--   2. l'octroi est branché sur le TRIGGER (AFTER UPDATE), pas dans `training_refresh_stats` —
--      que `training_legacy_refresh_all` (0123) appelle en boucle pendant un import.
--
-- Migration SÛRE À APPLIQUER AVANT le déploiement du code : purement additive (une table, une
-- colonne nullable, trois index, trois fonctions). Le seul index remplacé l'est à l'identique,
-- avec une clause en plus.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. La config de la roue (une seule ligne, éditable par un admin)
--
-- Table à part et pas une 2ᵉ ligne de `training_wheel_config` : la roue nº 1 est à DEUX étages
-- (secteur gagnant/perdant, puis lot dans le coffre). Celle-ci est à UN étage — le secteur EST le
-- montant. Détourner l'autre en laissant `sectors` inerte serait de la magie implicite.
-- La FORME du jsonb, elle, est celle de `training_wheel_config.prizes` : les mappers TS existants
-- (`toPrizes` / `prizesToJson`) et le type `WheelPrize` se réutilisent tels quels.
create table public.training_module_wheel_config (
  id         smallint primary key default 1 check (id = 1),
  title      text not null default 'La roue des modules' check (length(title) between 1 and 60),
  -- [{"label":"6 €","weight":1,"amount_eur":6}, …]
  segments   jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create index training_module_wheel_config_updated_by_idx
  on public.training_module_wheel_config (updated_by);

insert into public.training_module_wheel_config (id, segments) values (
  1,
  '[{"label":"6 €","weight":1,"amount_eur":6},
    {"label":"6 €","weight":1,"amount_eur":6},
    {"label":"7 €","weight":1,"amount_eur":7},
    {"label":"7 €","weight":1,"amount_eur":7},
    {"label":"7 €","weight":1,"amount_eur":7},
    {"label":"8 €","weight":1,"amount_eur":8},
    {"label":"8 €","weight":1,"amount_eur":8},
    {"label":"8 €","weight":1,"amount_eur":8}]'::jsonb
);

alter table public.training_module_wheel_config enable row level security;

create policy training_module_wheel_config_read on public.training_module_wheel_config
  for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_module_wheel_config_admin_write on public.training_module_wheel_config
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Le ticket — on RÉVEILLE `training_wheel_tickets`
--
-- Table morte depuis 0122 (qui a supprimé tout l'octroi automatique) et VIDE en production
-- (0 ligne, vérifié le 2026-08-30). Le ticket est exactement le bon objet : un droit à un tour,
-- nominatif, consommable une fois. Inutile d'en inventer un autre.
alter table public.training_wheel_tickets
  add column module_id uuid references public.training_modules(id) on delete cascade;

comment on column public.training_wheel_tickets.module_id is
$cmt$module dont l'achèvement a offert ce tour (0136) — null = tour d'encadrant, ou ticket d'avant 0136$cmt$;

-- Un module ne paie qu'une fois, POUR TOUJOURS. C'est CET index qui rend l'octroi idempotent :
-- la fonction peut être rejouée à chaque notation sans jamais doubler un tour. (Même tour de main
-- que `trophy_key` en 0120.)
create unique index training_wheel_tickets_module_uidx
  on public.training_wheel_tickets (profile_id, module_id)
  where module_id is not null;

-- ⚠️ LE PIÈGE DE 0120, À NE PAS REFAIRE. L'index ci-dessous impose « un seul ticket SYSTÈME par
-- semaine ». Un ticket de module a `granted_by is null` ET `trophy_key is null` : DEUX MODULES
-- TERMINÉS LA MÊME SEMAINE tomberaient donc sur le même conflit — et comme l'octroi insère en
-- `on conflict do nothing`, le second tour disparaîtrait EN SILENCE. On ajoute la clause
-- manquante. (On le conserve plutôt que de le supprimer : il ne contraint plus rien aujourd'hui,
-- mais il redeviendrait juste si l'octroi au classement hebdo revenait un jour.)
drop index if exists public.training_wheel_tickets_semaine_systeme_uidx;
create unique index training_wheel_tickets_semaine_systeme_uidx
  on public.training_wheel_tickets (profile_id, week)
  where granted_by is null and trophy_key is null and module_id is null;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. L'index qui rend la vérification gratuite
--
-- La question posée par l'octroi ET par l'écran du chatter est toujours la même : « ce couple
-- (profil, cas) a-t-il une session notée ≥ 60 jouée ICI ? ». Index partiel, donc étroit.
create index training_sessions_valides_ici_idx
  on public.training_sessions (profile_id, case_id)
  where status = 'scored' and legacy_id is null and total >= 60;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. L'octroi
--
-- SÉCURITÉ : `service_role` seul. La fonction ne vérifie PAS qui l'appelle — comme
-- `training_trophy_grant` en son temps. Exposée à `authenticated`, elle laisserait n'importe qui
-- s'offrir sept tours.
create or replace function public.training_module_wheel_grant(p_profile uuid, p_module uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_week  date := (date_trunc('week', (now() at time zone 'Europe/Paris'))::date);
begin
  if p_profile is null or p_module is null then
    return 0;
  end if;

  -- Garde de population : chatteur en poste, avec le droit Entraînement. MÊME filtre que
  -- `training_weekly_ranking` (0123_reprise_gla.sql:439). Un ex-chatteur ou un encadrant qui
  -- jouerait pour tester ne déclenche aucun versement.
  if not exists (
    select 1 from profiles p
    where p.id = p_profile and p.left_at is null and p.role = 'chatteur'
      and 'frm-entrainement' = any(p.pages)
  ) then
    return 0;
  end if;

  -- Module actif, et son titre pour le libellé du ticket.
  select m.title into v_title from training_modules m where m.id = p_module and m.active;
  if v_title is null then
    return 0;
  end if;

  -- Un module VIDE n'est pas « terminé », il n'a jamais été commencé. Ce test doit passer AVANT
  -- celui d'après : sur un module sans cas actif, le `not exists` ci-dessous est vrai par vacuité
  -- et paierait un tour pour rien.
  if not exists (select 1 from training_cases c where c.module_id = p_module and c.active) then
    return 0;
  end if;

  -- LE CŒUR. « Existe-t-il un cas actif de ce module que ce chatter n'ait pas validé ICI à ≥ 60 ? »
  -- Si oui, le module n'est pas fini. `legacy_id is null` = D5.
  if exists (
    select 1 from training_cases c
    where c.module_id = p_module and c.active
      and not exists (
        select 1 from training_sessions s
        where s.profile_id = p_profile and s.case_id = c.id
          and s.status = 'scored' and s.legacy_id is null and s.total >= 60
      )
  ) then
    return 0;
  end if;

  insert into public.training_wheel_tickets (profile_id, week, reason, module_id)
  values (p_profile, v_week, left('Module ' || v_title || ' terminé', 120), p_module)
  on conflict do nothing;

  return case when found then 1 else 0 end;
end;
$$;

revoke execute on function public.training_module_wheel_grant(uuid, uuid) from public, anon, authenticated;
grant execute on function public.training_module_wheel_grant(uuid, uuid) to service_role;

comment on function public.training_module_wheel_grant(uuid, uuid) is
$cmt$octroie le tour de roue d'un module terminé (≥ 60 partout, sessions jouées ICI) — idempotent par l'unicité (profile_id, module_id)$cmt$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Le déclencheur : le trigger, SURTOUT PAS `training_refresh_stats`
--
-- `training_refresh_stats` serait l'endroit naturel — et c'est le piège : `training_legacy_refresh_all`
-- (0123_reprise_gla.sql:367) l'appelle EN BOUCLE sur tous les cas d'un profil pendant un import GLA.
-- L'octroi y aurait payé l'import.
--
-- Le trigger, lui, est un `AFTER UPDATE OF status, scored_at` — et 0123:361 le note noir sur blanc :
-- « un INSERT ne le déclenche JAMAIS ». L'import insère. D5 est donc respectée PAR CONSTRUCTION,
-- pas par un filtre qu'on pourrait oublier de recopier.
--
-- `new.module_id` est une colonne `not null` de `training_sessions` : on ne vérifie qu'UN module
-- (≤ 23 cas), jamais les sept.
create or replace function public.training_on_session_scored()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform training_refresh_stats(new.profile_id, new.case_id, coalesce(new.scored_at, now()));
  perform training_module_wheel_grant(new.profile_id, new.module_id);
  return null;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 6. La pastille de sidebar
--
-- Appelée au rendu de CHAQUE page du CRM : un `count` sur l'index partiel des tickets en attente,
-- rien d'autre. Tout est matérialisé au moment de la notation — contrairement à l'ancienne
-- `training_wheel_pending` (0118, supprimée par 0122), qui devait rejouer quatre classements
-- hebdo à chaque appel.
create or replace function public.training_module_wheel_pending(p_profile uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Cloisonnement : son propre compteur, ou celui de n'importe qui pour un encadrant `frm-suivi`.
  select case
    when p_profile = (select auth.uid()) or (select public.has_page('frm-suivi'))
      then (
        select count(*)::integer from training_wheel_tickets t
        where t.profile_id = p_profile and t.module_id is not null and t.used_at is null
      )
    else 0
  end;
$$;

revoke execute on function public.training_module_wheel_pending(uuid) from public, anon;
grant execute on function public.training_module_wheel_pending(uuid) to authenticated;

comment on function public.training_module_wheel_pending(uuid) is
$cmt$nombre de tours de roue de module en attente (tickets non utilisés)$cmt$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 7. L'état par module, pour l'écran du chatter
--
-- « Combien de cas actifs, combien validés ICI » — agrégé en SQL et pas côté web : un chatter peut
-- avoir des centaines de sessions notées (l'import GLA en a chargé jusqu'à 400 pour un profil), et
-- un `select` nu tronquerait à 1000 lignes en silence.
--
-- SECURITY INVOKER, volontairement : la RLS de `training_sessions` fait déjà le cloisonnement (on
-- ne lit que ses propres sessions, ou toutes avec `frm-suivi`). Aucune garde à écrire, aucune à
-- oublier ; un `p_profile` forgé rend simplement des compteurs à zéro.
create or replace function public.training_module_wheel_state(p_profile uuid)
returns table (module_id uuid, cas_actifs integer, valides_ici integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select m.id,
         count(c.id)::integer,
         count(c.id) filter (where exists (
           select 1 from training_sessions s
           where s.profile_id = p_profile and s.case_id = c.id
             and s.status = 'scored' and s.legacy_id is null and s.total >= 60
         ))::integer
  from training_modules m
  join training_cases c on c.module_id = m.id and c.active
  where m.active
  group by m.id;
$$;

revoke execute on function public.training_module_wheel_state(uuid) from public, anon;
grant execute on function public.training_module_wheel_state(uuid) to authenticated;

comment on function public.training_module_wheel_state(uuid) is
$cmt$par module actif : nombre de cas actifs et nombre validés ≥ 60 sur une session JOUÉE ICI (legacy exclu, D5)$cmt$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 8. Rétroactif (décision D3)
--
-- Les modules déjà terminés paient leur tour au déploiement — sinon ceux qui ont bossé avant sont
-- les seuls à ne rien toucher. Même règle que l'octroi, D5 comprise.
--
-- COÛT mesuré sur la prod le 2026-08-30 : 4 tours ≈ 28 € (Emmanuelupmedia · relance,
-- Harindranto · relance, Reely · relance, Hanielshop · boss). C'était 10 tours ≈ 70 € avant D5.
insert into public.training_wheel_tickets (profile_id, week, reason, module_id)
select p.id,
       (date_trunc('week', (now() at time zone 'Europe/Paris'))::date),
       left('Module ' || m.title || ' terminé', 120),
       m.id
from profiles p
cross join training_modules m
where p.left_at is null and p.role = 'chatteur' and 'frm-entrainement' = any(p.pages)
  and m.active
  and exists (select 1 from training_cases c where c.module_id = m.id and c.active)
  and not exists (
    select 1 from training_cases c
    where c.module_id = m.id and c.active
      and not exists (
        select 1 from training_sessions s
        where s.profile_id = p.id and s.case_id = c.id
          and s.status = 'scored' and s.legacy_id is null and s.total >= 60
      )
  )
on conflict do nothing;
```

- [ ] **Step 2 : prévisualiser sur l'UAT**

```bash
cd packages/db
DB=$(grep '^DATABASE_URL_UAT=' ../../.env | cut -d= -f2- | sed 's/^"//; s/"$//')
supabase db push --db-url "$DB" --dry-run
```

Attendu : `0136_roue_modules.sql` listée comme seule migration à appliquer. Si la sortie annonce
d'autres fichiers, **s'arrêter** — l'historique est désaligné, ne pas forcer.

- [ ] **Step 3 : appliquer sur l'UAT**

```bash
cd packages/db
DB=$(grep '^DATABASE_URL_UAT=' ../../.env | cut -d= -f2- | sed 's/^"//; s/"$//')
supabase db push --db-url "$DB"
supabase db push --db-url "$DB" --dry-run   # doit dire « Remote database is up to date »
```

- [ ] **Step 4 : vérifier le rétroactif**

```bash
DB=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$DB" -X -c "
select p.display_name, m.title, t.reason
from training_wheel_tickets t
join profiles p on p.id = t.profile_id
join training_modules m on m.id = t.module_id
order by 1, 2;"
```

Attendu : une ligne par (chatter, module terminé **sans compter l'import**), `reason` de la forme
`Module Relance terminé`. Comparer au compte de contrôle :

```bash
psql "$DB" -X -c "
with cas as (select c.module_id, c.id from training_cases c join training_modules m on m.id=c.module_id where c.active and m.active)
select count(*) from profiles p cross join (select distinct module_id from cas) cs
where p.left_at is null and p.role='chatteur' and 'frm-entrainement' = any(p.pages)
  and not exists (select 1 from cas c where c.module_id=cs.module_id
    and not exists (select 1 from training_sessions s where s.profile_id=p.id and s.case_id=c.id
                    and s.status='scored' and s.legacy_id is null and s.total>=60));"
```

Les deux nombres doivent être **égaux**.

- [ ] **Step 5 : vérifier la seed de la roue**

```bash
DB=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$DB" -X -c "
select jsonb_array_length(segments)                                    as secteurs,
       sum((v->>'amount_eur')::numeric) / jsonb_array_length(segments) as esperance,
       min((v->>'amount_eur')::numeric)                                as mini,
       max((v->>'amount_eur')::numeric)                                as maxi,
       bool_and((v->>'weight')::int > 0)                               as tous_jouables
from training_module_wheel_config, jsonb_array_elements(segments) v
where id = 1 group by segments;"
```

Attendu, **exactement** : `secteurs = 8`, `esperance = 7.125`, `mini = 6`, `maxi = 8`,
`tous_jouables = t`. C'est la seule vérification du barème — une faute de frappe dans la seed est
le vrai risque de cette tâche, et elle ne se verrait nulle part ailleurs avant le premier
versement.

- [ ] **Step 6 : vérifier que l'octroi est idempotent**

Rejouer le trigger sur une session déjà notée d'un chatter dont un module est complet : le nombre
de tickets ne doit pas bouger.

```bash
DB=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$DB" -X -c "
select count(*) as avant from training_wheel_tickets where module_id is not null;

-- Une session notée appartenant à un profil qui a déjà un ticket : rejouer sa notation.
update training_sessions set scored_at = scored_at + interval '1 second'
where id = (
  select s.id from training_sessions s
  join training_wheel_tickets t on t.profile_id = s.profile_id and t.module_id = s.module_id
  where s.status = 'scored' and s.legacy_id is null limit 1);

select count(*) as apres from training_wheel_tickets where module_id is not null;"
```

Attendu : `avant` = `apres`. *(Si aucune ligne n'est mise à jour — l'UAT n'a aucun ticket
rétroactif — créer d'abord un cas de test en notant à la main un module court, ou noter ce step
« sans objet » et le rejouer après la recette de la Task 4.)*

- [ ] **Step 7 : vérifier que l'import GLA ne paie PAS**

```bash
psql "$DB" -X -c "
select count(*) as tickets_avant from training_wheel_tickets where module_id is not null;
select public.training_legacy_refresh_all(p.id)
  from profiles p where exists (
    select 1 from training_sessions s where s.profile_id = p.id and s.legacy_id is not null)
  limit 1;
select count(*) as tickets_apres from training_wheel_tickets where module_id is not null;"
```

Attendu : **`tickets_avant` = `tickets_apres`.** C'est la vérification la plus importante de la
tâche — c'est elle qui prouve D5.

- [ ] **Step 8 : régénérer les types**

```bash
DB=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
supabase gen types typescript --db-url "$DB" > packages/db/src/types.ts
pnpm --filter @glagency/db typecheck
```

Vérifier que `training_module_wheel_config`, `training_module_wheel_grant`,
`training_module_wheel_pending` et `training_module_wheel_state` apparaissent dans le fichier
généré.

- [ ] **Step 9 : corriger `CLAUDE.md`**

Dans le bloc de la face Formation, remplacer :

```
UAT à
**0130**, prod à **0124** (2026-08-27) — prochaine migration = 0131 ; **0125→0130 sont en
attente de release côté prod : appliquer les migrations AVANT de déployer le web**
```

par :

```
UAT et prod
sont à **0135** (2026-08-30) — prochaine migration = **0137** ; rien en attente de release
```

*(0136 étant celle de ce lot, la prochaine libre est 0137.)*

Ajouter dans la même section, après la roue existante :

```
**Roue des modules** (`/formation/ma-roue`, migration `0136`) : 2ᵉ roue, celle du CHATTER — un
tour par module terminé (≥ 60 à tous les exos, **sur des sessions jouées ici** : l'historique
GLA importé ne paie pas, cf. D5 et `0123:414`). Ticket en `training_wheel_tickets.module_id`
(unicité `(profile_id, module_id)` = un module paie une fois), tirage dans le MÊME
`training_wheel_spins` que la roue nº 1 (une seule compta), octroi dans le trigger
`training_on_session_scored` — **jamais dans `training_refresh_stats`**, que l'import appelle
en boucle. Pastille de tours sur la sidebar.
```

- [ ] **Step 10 : commit**

```bash
git add packages/db/supabase/migrations/0136_roue_modules.sql packages/db/src/types.ts CLAUDE.md
git commit -m "feat(formation): la roue des modules, côté base (0136)

Un tour de roue par module terminé (>= 60 à tous les exos), ticket
ressuscité dans training_wheel_tickets.module_id, octroi dans le trigger
de notation, rétroactif inclus.

L'octroi n'est PAS dans training_refresh_stats : training_legacy_refresh_all
l'appelle en boucle pendant un import GLA, qui aurait donc payé du travail
fait sur l'ancienne plateforme (cf. 0123:414, D5). Le trigger est un
AFTER UPDATE, l'import fait des INSERT.

Recreé training_wheel_tickets_semaine_systeme_uidx avec 'module_id is null' :
sans ça, deux modules finis la même semaine ne donnaient qu'un tour, en
silence (piège déjà rencontré en 0120)."
```

---

### Task 2 : sortir les deux composants de roue de leur feature

Ils vont servir aux **deux** roues, et l'ESLint interdit le cross-feature
(`apps/web/eslint.config.mjs:51-56`). Aucun changement de comportement dans cette tâche : c'est
un déménagement, plus une généralisation minimale des props de `WheelResult`.

**Files:**
- Create: `apps/web/src/components/training/wheel-svg.tsx` *(contenu identique à l'actuel)*
- Create: `apps/web/src/components/training/wheel-result.tsx` *(props généralisées)*
- Delete: `apps/web/src/features/training-wheel/components/wheel-svg.tsx`
- Delete: `apps/web/src/features/training-wheel/components/wheel-result.tsx`
- Modify: `apps/web/src/lib/types/training.ts` (ajout de `WheelReveal`)
- Modify: `apps/web/src/features/training-wheel/components/wheel-spinner.tsx:13-14` (imports) et son rendu de `<WheelResult>`
- Modify: `apps/web/src/features/training-wheel/components/wheel-config-dialog.tsx:20` (import)

**Interfaces:**
- Produces :
  - `WheelSvg`, `sectorAngles(sectors: WheelSector[]): SectorAngle[]`, type `SectorAngle` depuis `@/components/training/wheel-svg`
  - `WheelResult({ reveal, winnerName, onDone })` depuis `@/components/training/wheel-result`
  - `interface WheelReveal { won: boolean; label: string; amountEur: number | null }` depuis `@/lib/types/training`

- [ ] **Step 1 : déplacer `wheel-svg.tsx` tel quel**

```bash
git mv apps/web/src/features/training-wheel/components/wheel-svg.tsx apps/web/src/components/training/wheel-svg.tsx
```

Aucune modification du contenu : le composant ne dépend que de `WheelSector` (`@glagency/core`) et
de `cn` (`@/lib/utils`), tous deux hors feature.

- [ ] **Step 2 : ajouter le type de révélation partagé**

Dans `apps/web/src/lib/types/training.ts`, à la suite de `MEDAL_EMOJI` :

```ts
/**
 * Ce qu'une roue révèle, quelle qu'elle soit — la forme MINIMALE dont la cinématique a besoin.
 * La roue nº 1 (encadrant) y projette son `SpinResult` à deux étages (secteur puis lot) ; la roue
 * des modules, qui n'a qu'un étage et aucun perdant, la remplit directement.
 */
export interface WheelReveal {
  won: boolean
  /** Ce qui est annoncé : le lot pour la roue nº 1, le montant pour la roue des modules. */
  label: string
  amountEur: number | null
}
```

- [ ] **Step 3 : déplacer `wheel-result.tsx` et généraliser ses props**

```bash
git mv apps/web/src/features/training-wheel/components/wheel-result.tsx apps/web/src/components/training/wheel-result.tsx
```

Puis, dans le fichier déplacé, remplacer l'import de type et la signature :

```ts
// AVANT : import type { SpinResult } from '../types'
import type { WheelReveal } from '@/lib/types/training'
```

```ts
export function WheelResult({
  reveal,
  winnerName,
  onDone,
}: {
  reveal: WheelReveal
  /** Le chatter pour qui le tour a été lancé — `null` quand on joue pour soi-même. */
  winnerName: string | null
  onDone: () => void
}) {
```

Et dans le corps, remplacer les 5 usages de `result` :

| Avant | Après |
|---|---|
| `if (result.won) playWind()` | `if (reveal.won) playWind()` |
| `}, [result.won])` | `}, [reveal.won])` |
| `{!result.won ? (` | `{!reveal.won ? (` |
| `{result.prize?.label ?? result.sectorLabel}` | `{reveal.label}` |
| `{result.prize?.amountEur != null && (` … `{eur(result.prize.amountEur)}` | `{reveal.amountEur != null && (` … `{eur(reveal.amountEur)}` |

- [ ] **Step 4 : recâbler les deux importeurs de la roue nº 1**

`apps/web/src/features/training-wheel/components/wheel-spinner.tsx`, lignes 13-14 :

```ts
import { WheelResult } from '@/components/training/wheel-result'
import { sectorAngles, WheelSvg } from '@/components/training/wheel-svg'
```

et son rendu, en bas du fichier :

```tsx
{phase === 'reveal' && result && (
  <WheelResult
    // La roue nº 1 est à deux étages : le lot s'il y en a un, sinon le libellé du secteur.
    reveal={{ won: result.won, label: result.prize?.label ?? result.sectorLabel, amountEur: result.prize?.amountEur ?? null }}
    winnerName={cible?.displayName ?? null}
    onDone={() => {
      busy.current = false
      setPhase('idle')
      setResult(null)
      router.refresh()
    }}
  />
)}
```

`apps/web/src/features/training-wheel/components/wheel-config-dialog.tsx`, ligne 20 :

```ts
import { WheelSvg } from '@/components/training/wheel-svg'
```

- [ ] **Step 5 : vérifier**

```bash
pnpm lint && pnpm typecheck && pnpm build
```

Attendu : tout vert. `pnpm lint` est la vraie vérification de cette tâche — c'est la règle de
frontière ESLint qui valide que plus rien de partagé ne vit dans une feature.

- [ ] **Step 6 : recette manuelle de non-régression**

Sur l'UAT, ouvrir `/formation/roue` avec un compte encadrant, lancer un tour pour un chatter de
test. Le coffre, les 10 clics, les confettis, le montant et l'historique doivent être **identiques
à avant**. C'est une page qui verse de l'argent : ne pas sauter cette étape.

- [ ] **Step 7 : commit**

```bash
git add -A apps/web/src/components/training apps/web/src/features/training-wheel apps/web/src/lib/types/training.ts
git commit -m "refactor(formation): sort le disque et la révélation de la roue dans components/training

Les deux composants vont servir aux deux roues et l'ESLint interdit le
cross-feature. WheelResult prend désormais un WheelReveal { won, label,
amountEur } au lieu du SpinResult à deux étages de la roue encadrant, qui
l'y projette. Aucun changement de comportement."
```

---

### Task 3 : le noyau de la feature (types, mappers, schéma, services, actions)

**Files:**
- Create: `apps/web/src/features/training-module-wheel/types.ts`
- Create: `apps/web/src/features/training-module-wheel/mappers.ts`
- Create: `apps/web/src/features/training-module-wheel/mappers.test.ts`
- Create: `apps/web/src/features/training-module-wheel/schema.ts`
- Create: `apps/web/src/features/training-module-wheel/schema.test.ts`
- Create: `apps/web/src/features/training-module-wheel/services/get-module-wheel.ts`
- Create: `apps/web/src/features/training-module-wheel/actions.ts`

**Interfaces:**
- Consumes : `training_module_wheel_config`, `training_module_wheel_state`, `training_wheel_tickets`,
  `training_wheel_spins` (Task 1) ; `getModules()` (`@/lib/services/training-public`) ;
  `pickWeighted`, `WheelPrize` (`@glagency/core`).
- Produces :
  - types `ModuleWheelConfig`, `ModuleWheelModule`, `ModuleWheelSpin`, `ModuleWheelData`, `ModuleSpinResult`
  - `toSegments(json: unknown): WheelPrize[]`, `segmentsToJson(segments: WheelPrize[])`
  - `moduleWheelConfigForm` (Zod), types `ModuleWheelConfigInput` / `ModuleWheelConfigFormValues`
  - `getModuleWheel(profileId: string): Promise<ModuleWheelData>`
  - `spinModuleWheel(): Promise<ActionResult<ModuleSpinResult>>`
  - `saveModuleWheelConfig(raw: unknown): Promise<ActionResult>`

- [ ] **Step 1 : écrire le contrat de la feature**

`apps/web/src/features/training-module-wheel/types.ts` :

```ts
import type { WheelPrize } from '@glagency/core'

/**
 * Roue des MODULES — celle du chatter (0136). Un étage : le secteur EST le montant, et tous les
 * secteurs sont gagnants. Les segments réutilisent `WheelPrize` (label / weight / amountEur), qui
 * a exactement la forme du jsonb de `training_module_wheel_config.segments`.
 */
export interface ModuleWheelConfig {
  title: string
  segments: WheelPrize[]
}

/** État du tour d'un module, du point de vue du chatter. */
export type ModuleTourEtat = 'a_gagner' | 'gagne' | 'joue'

export interface ModuleWheelModule {
  id: string
  code: string
  title: string
  emoji: string | null
  /** Cas ACTIFS du module. */
  total: number
  /** Cas validés à ≥ 60 sur une session jouée ICI (l'import GLA ne compte pas — D5). */
  valides: number
  etat: ModuleTourEtat
}

/** Un tirage passé du visiteur. */
export interface ModuleWheelSpin {
  id: string
  spunAt: string
  label: string
  amountEur: number | null
  /** « Module Relance terminé » — le libellé du ticket consommé. */
  reason: string | null
}

export interface ModuleWheelData {
  config: ModuleWheelConfig
  /** Tours disponibles = tickets de module non utilisés. */
  tours: number
  modules: ModuleWheelModule[]
  spins: ModuleWheelSpin[]
  /** Σ des montants déjà gagnés par le visiteur sur CETTE roue. */
  totalEur: number
}

/**
 * Résultat d'un tour — décidé par le SERVEUR. `segmentIndex` sert l'animation : le client fait
 * tourner la roue jusqu'à CE secteur, il ne tire rien lui-même.
 */
export interface ModuleSpinResult {
  segmentIndex: number
  label: string
  amountEur: number | null
}
```

- [ ] **Step 2 : écrire les tests de la frontière jsonb (rouge)**

`apps/web/src/features/training-module-wheel/mappers.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { segmentsToJson, toSegments } from './mappers'

describe('toSegments', () => {
  it('lit la forme de la seed 0136', () => {
    expect(toSegments([{ label: '6 €', weight: 1, amount_eur: 6 }])).toEqual([
      { label: '6 €', weight: 1, amountEur: 6 },
    ])
  })

  it('refuse un tableau vide (une roue sans secteur ne tourne pas)', () => {
    expect(() => toSegments([])).toThrow()
  })

  it('refuse un poids décimal — randomInt(0, n) throw sur un n non entier', () => {
    expect(() => toSegments([{ label: '6 €', weight: 1.5, amount_eur: 6 }])).toThrow()
  })

  it('refuse un montant négatif — il passerait la lecture puis violerait le check SQL APRÈS avoir consommé le ticket', () => {
    expect(() => toSegments([{ label: 'x', weight: 1, amount_eur: -1 }])).toThrow()
  })

  it('refuse un montant absent : sur CETTE roue, tout secteur paie', () => {
    expect(() => toSegments([{ label: '6 €', weight: 1 }])).toThrow()
  })
})

describe('segmentsToJson', () => {
  it('renomme amountEur en amount_eur', () => {
    expect(segmentsToJson([{ label: '8 €', weight: 1, amountEur: 8 }])).toEqual([
      { label: '8 €', weight: 1, amount_eur: 8 },
    ])
  })
})
```

- [ ] **Step 3 : lancer les tests, vérifier qu'ils échouent**

```bash
pnpm --filter @glagency/web test -- mappers.test
```

Attendu : ÉCHEC — `Cannot find module './mappers'`.

- [ ] **Step 4 : écrire les mappers**

`apps/web/src/features/training-module-wheel/mappers.ts` :

```ts
import { z } from 'zod'
import type { WheelPrize } from '@glagency/core'

/**
 * Frontière jsonb ↔ TS de `training_module_wheel_config.segments`. Même rôle que
 * `features/training-wheel/mappers.ts` : la colonne est typée `Json`, un `as unknown as` serait un
 * mensonge au compilateur — une config éditée à la main en SQL ferait planter le tirage plus loin,
 * sans message.
 *
 * UNE différence avec la roue nº 1 : `amount_eur` est **obligatoire**. Là-bas, `null` a un sens
 * (« day off », lot non monétaire) ; ici, tout secteur paie — un `null` serait un secteur muet qui
 * consommerait un tour sans rien verser.
 */
const segmentRow = z.object({
  label: z.string(),
  // Entier : `randomInt(0, n)` (node:crypto) throw sur un n non entier.
  weight: z.number().int().min(0),
  amount_eur: z.number().min(0),
})

const CONFIG_KO = 'Configuration de la roue des modules invalide — corrige-la dans « Configurer »'

export function toSegments(json: unknown): WheelPrize[] {
  const parsed = z.array(segmentRow).min(1).safeParse(json)
  if (!parsed.success) throw new Error(CONFIG_KO)
  return parsed.data.map((s) => ({ label: s.label, weight: s.weight, amountEur: s.amount_eur }))
}

/** Sens écriture : `amountEur` → `amount_eur` (le jsonb garde le format documenté par 0136). */
export function segmentsToJson(segments: WheelPrize[]): { label: string; weight: number; amount_eur: number }[] {
  // `?? 0` : `WheelPrize.amountEur` est nullable par son type (partagé avec la roue nº 1), mais le
  // schéma du formulaire le rend obligatoire ici — la branche est inatteignable, pas le typage.
  return segments.map((s) => ({ label: s.label, weight: s.weight, amount_eur: s.amountEur ?? 0 }))
}
```

- [ ] **Step 5 : lancer les tests, vérifier qu'ils passent**

```bash
pnpm --filter @glagency/web test -- mappers.test
```

Attendu : 6 tests PASS.

- [ ] **Step 6 : écrire les tests du schéma admin (rouge)**

`apps/web/src/features/training-module-wheel/schema.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { moduleWheelConfigForm } from './schema'

const ok = { title: 'La roue des modules', segments: [{ label: '6 €', weight: '1', amountEur: '6' }] }

describe('moduleWheelConfigForm', () => {
  it('accepte une config minimale', () => {
    expect(moduleWheelConfigForm.safeParse(ok).success).toBe(true)
  })

  it('refuse un poids VIDÉ : coercé en 0, le secteur sortait du tirage sans un mot', () => {
    const r = moduleWheelConfigForm.safeParse({ ...ok, segments: [{ label: '6 €', weight: '', amountEur: '6' }] })
    expect(r.success).toBe(false)
  })

  it('refuse un montant vide — sur cette roue, tout secteur paie', () => {
    const r = moduleWheelConfigForm.safeParse({ ...ok, segments: [{ label: '6 €', weight: '1', amountEur: '' }] })
    expect(r.success).toBe(false)
  })

  it('refuse une roue dont tous les poids sont à 0 : pickWeighted throw sur une somme nulle', () => {
    const r = moduleWheelConfigForm.safeParse({ ...ok, segments: [{ label: '6 €', weight: '0', amountEur: '6' }] })
    expect(r.success).toBe(false)
  })

  it('refuse zéro segment', () => {
    expect(moduleWheelConfigForm.safeParse({ ...ok, segments: [] }).success).toBe(false)
  })
})
```

- [ ] **Step 7 : lancer, vérifier l'échec**

```bash
pnpm --filter @glagency/web test -- schema.test
```

Attendu : ÉCHEC sur `training-module-wheel/schema.test.ts` — `Cannot find module './schema'`.
*(Les autres `schema.test.ts` du repo passent : ne pas s'y tromper, filtrer la sortie.)*

- [ ] **Step 8 : écrire le schéma**

`apps/web/src/features/training-module-wheel/schema.ts` :

```ts
import { z } from 'zod'
import { requiredInt } from '@/lib/form-fields'

// Schéma PARTAGÉ dialog admin (RHF + zodResolver) / Server Action (runAction). Zod v4.
// Longueurs alignées sur les `check` SQL de 0136 (titre 1..60).
//
// `requiredInt` et pas `z.coerce.number()` : un poids VIDÉ se coercerait en 0 et s'enregistrerait
// tel quel — le secteur sortirait du tirage sans le moindre message (piège déjà rencontré sur la
// roue nº 1). Vide = refus.
const weight = requiredInt(0, 1000, {
  required: 'Poids requis', invalid: 'Poids invalide', integer: 'Poids entier',
  min: 'Poids ≥ 0', max: 'Poids ≤ 1000',
})
const label = z.string().trim().min(1, 'Libellé requis').max(60, '60 caractères max')

// Le montant passe par `requiredInt` LUI AUSSI, et c'est obligatoire — pas par `z.coerce.number()`.
// Deux raisons, toutes deux documentées dans `lib/form-fields.ts` :
//   1. une chaîne VIDE se coerce en `0` : le secteur s'enregistrerait à 0 € sans un mot d'erreur ;
//   2. le schéma est parsé DEUX FOIS sur deux formes différentes — `zodResolver` rend des NOMBRES
//      à `handleSubmit`, et c'est cet objet-là que le client envoie à la Server Action, qui
//      revalide avec le MÊME schéma. Un validateur qui n'accepterait que des chaînes rejetterait
//      donc sa propre sortie côté serveur (« Saisie invalide » à l'enregistrement, sans plus).
//      `requiredInt` porte l'union `string | number` qui règle ça.
// Conséquence assumée : les montants sont des EUROS ENTIERS. Le barème (6/7/8 €) l'est ; le jour
// où un montant décimal sera demandé, ajouter un `requiredNumber` à `form-fields.ts`.
const amountEur = requiredInt(0, 1000, {
  required: 'Montant requis', invalid: 'Montant invalide', integer: 'Montant en euros entiers',
  min: 'Montant ≥ 0', max: 'Montant ≤ 1000 €',
})

export const moduleSegmentForm = z.object({ label, weight, amountEur })

export const moduleWheelConfigForm = z
  .object({
    title: z.string().trim().min(1, 'Titre requis').max(60, '60 caractères max'),
    segments: z.array(moduleSegmentForm).min(1, 'Au moins un secteur').max(12, '12 secteurs max'),
  })
  // L'invariant qui protège le tirage : `pickWeighted` THROW si la somme des poids vaut 0.
  .refine((c) => c.segments.some((s) => s.weight > 0), {
    message: 'Il faut au moins un secteur avec un poids > 0',
    path: ['segments'],
  })

/** Sortie validée (ce que reçoit l'action). */
export type ModuleWheelConfigInput = z.infer<typeof moduleWheelConfigForm>
/** Entrée du formulaire (inputs HTML : tout arrive en chaîne) — type de `useForm`. */
export type ModuleWheelConfigFormValues = z.input<typeof moduleWheelConfigForm>
```

- [ ] **Step 9 : lancer, vérifier que ça passe**

```bash
pnpm --filter @glagency/web test -- schema.test
```

Attendu : les 5 tests de `training-module-wheel/schema.test.ts` PASS.

- [ ] **Step 10 : écrire le service de lecture**

`apps/web/src/features/training-module-wheel/services/get-module-wheel.ts` :

```ts
import { getModuleRefs } from '@/lib/services/training-public'
import { createClient } from '@/lib/supabase/server'
import { toSegments } from '../mappers'
import type { ModuleWheelData, ModuleWheelModule, ModuleWheelSpin } from '../types'

/** Fenêtre de « Mes gains » — un chatter a au plus 7 tours, la borne est un garde-fou. */
const GAINS_LIMIT = 50

/**
 * La page « Ma roue » : la config, les tours en attente, l'état des 7 modules et les gains passés
 * du VISITEUR. Quatre lectures en parallèle, toutes sous RLS.
 *
 * L'état par module vient de la RPC `training_module_wheel_state` (0136) et non d'un `select` sur
 * les sessions : un chatter peut en avoir des centaines (l'import GLA en a chargé jusqu'à 400 pour
 * un profil) et un `select` nu tronquerait à 1000 lignes, en silence. L'agrégat est fait en SQL.
 *
 * D5 est portée par la RPC (`legacy_id is null`) : rien à refiltrer ici.
 */
export async function getModuleWheel(profileId: string): Promise<ModuleWheelData> {
  const supabase = await createClient()
  const [cfgRes, ticketsRes, stateRes, spinsRes, modules] = await Promise.all([
    supabase.from('training_module_wheel_config').select('title, segments').eq('id', 1).single(),
    supabase
      .from('training_wheel_tickets')
      .select('id, module_id, used_at')
      .eq('profile_id', profileId)
      .not('module_id', 'is', null),
    supabase.rpc('training_module_wheel_state', { p_profile: profileId }),
    supabase
      .from('training_wheel_spins')
      .select('id, spun_at, prize_label, amount_eur, ticket_id')
      .eq('profile_id', profileId)
      .not('ticket_id', 'is', null)
      .order('spun_at', { ascending: false })
      .limit(GAINS_LIMIT),
    // `getModuleRefs` et pas `getModules` : celui-ci rapatrie de quoi calculer `hasCourse` et
    // `caseCount`, dont on n'a que faire ici — les compteurs viennent de la RPC.
    getModuleRefs(),
  ])
  if (cfgRes.error) throw new Error(cfgRes.error.message)
  if (ticketsRes.error) throw new Error(ticketsRes.error.message)
  if (stateRes.error) throw new Error(stateRes.error.message)
  if (spinsRes.error) throw new Error(spinsRes.error.message)

  const tickets = ticketsRes.data ?? []
  const state = new Map((stateRes.data ?? []).map((r) => [r.module_id, r]))
  // Un module peut porter DEUX états dans les tickets ? Non : l'unicité (profile_id, module_id) de
  // 0136 en garantit au plus un. `find` est donc suffisant, pas besoin de trancher.
  const parModule = new Map(tickets.map((t) => [t.module_id as string, t]))

  const cards: ModuleWheelModule[] = modules.map((m) => {
    const st = state.get(m.id)
    const ticket = parModule.get(m.id)
    return {
      id: m.id,
      code: m.code,
      title: m.title,
      emoji: m.emoji,
      total: st?.cas_actifs ?? 0,
      valides: st?.valides_ici ?? 0,
      etat: ticket ? (ticket.used_at ? 'joue' : 'gagne') : 'a_gagner',
    }
  })

  // Les libellés des tickets consommés, en UNE requête sur les ids déjà en main — pas d'embed
  // PostgREST (dont la cardinalité rendue varie) ni de jointure par ligne. Les tickets du visiteur
  // lui sont ouverts par la RLS (`profile_id = auth.uid()`).
  const ticketIds = (spinsRes.data ?? []).flatMap((s) => (s.ticket_id ? [s.ticket_id] : []))
  const raisons = new Map<string, string>()
  if (ticketIds.length > 0) {
    const { data, error } = await supabase.from('training_wheel_tickets').select('id, reason').in('id', ticketIds)
    if (error) throw new Error(error.message)
    for (const t of data ?? []) raisons.set(t.id, t.reason)
  }

  const spins: ModuleWheelSpin[] = (spinsRes.data ?? []).map((s) => ({
    id: s.id,
    spunAt: s.spun_at,
    label: s.prize_label ?? '—',
    // `numeric` Postgres : supabase-js peut le rendre en chaîne selon la version → Number().
    amountEur: s.amount_eur == null ? null : Number(s.amount_eur),
    reason: s.ticket_id ? (raisons.get(s.ticket_id) ?? null) : null,
  }))

  return {
    config: { title: cfgRes.data.title, segments: toSegments(cfgRes.data.segments) },
    tours: tickets.filter((t) => t.used_at == null).length,
    modules: cards,
    spins,
    totalEur: spins.reduce((n, s) => n + (s.amountEur ?? 0), 0),
  }
}
```

- [ ] **Step 11 : écrire les Server Actions**

`apps/web/src/features/training-module-wheel/actions.ts` :

```ts
'use server'

// Roue des modules — le CHATTER lance pour lui-même, en consommant un tour gagné en finissant un
// module (0136). C'est la différence avec la roue nº 1, où l'encadrant lance pour quelqu'un.
//
// LECTURES avec le client utilisateur (RLS) ; ÉCRITURES en service-role (aucune policy d'écriture
// `authenticated` sur les tickets ni les spins) — TOUJOURS après la garde applicative. Seule la
// config admin s'écrit sous RLS.
//
// Le TIRAGE est décidé ici (crypto.randomInt) : le client ne fait qu'animer jusqu'au secteur rendu.

import { randomInt } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { mondayOf, pickWeighted, todayParis } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { BusinessError, noGuard, requireAdminProfileLive, requirePageProfileLive, runAction, type ActionResult } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'
import { segmentsToJson, toSegments } from './mappers'
import { moduleWheelConfigForm } from './schema'
import type { ModuleSpinResult } from './types'

/**
 * Le tirage — décidé ICI (crypto), enregistré au nom du chatter, adossé au ticket qu'il consomme.
 *
 * `requirePageProfileLive` et pas `requirePageProfile` : la variante `…Live` refuse la consultation
 * « en tant que ». Une impersonation ne verse jamais d'argent.
 */
export async function spinModuleWheel(): Promise<ActionResult<ModuleSpinResult>> {
  return runAction({
    // Aucune entrée : on ne tire que pour soi, avec son plus vieux ticket.
    schema: z.object({}),
    input: {},
    guard: noGuard,
    handler: async (): Promise<ModuleSpinResult> => {
      const profile = await requirePageProfileLive('frm-entrainement')
      const supabase = await createClient()
      const [ticketRes, cfgRes] = await Promise.all([
        supabase
          .from('training_wheel_tickets')
          .select('id, module_id')
          .eq('profile_id', profile.id)
          .not('module_id', 'is', null)
          .is('used_at', null)
          // Le plus ancien d'abord : les tours s'accumulent, on les joue dans l'ordre où ils ont
          // été gagnés — c'est ce que dit l'historique ensuite.
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase.from('training_module_wheel_config').select('segments').eq('id', 1).single(),
      ])
      if (ticketRes.error) throw new Error(ticketRes.error.message)
      if (cfgRes.error) throw new Error(cfgRes.error.message)
      if (!ticketRes.data) throw new BusinessError('Tu n’as aucun tour disponible')

      const segments = toSegments(cfgRes.data.segments)
      const pick = pickWeighted(segments, (n) => randomInt(0, n))
      const admin = createAdminClient()

      // ORDRE CRITIQUE : le spin D'ABORD. `training_wheel_spins.ticket_id` est UNIQUE — c'est
      // cette contrainte, et rien d'autre, qui interdit de jouer deux fois le même tour (double
      // clic, deux onglets, rejeu réseau). Si elle est violée, RIEN n'a été écrit.
      // L'ordre inverse (marquer le ticket puis insérer) brûlerait le ticket sur un insert raté.
      const { error: sErr } = await admin.from('training_wheel_spins').insert({
        profile_id: profile.id,
        ticket_id: ticketRes.data.id,
        spun_by: profile.id,
        week: mondayOf(todayParis()),
        // Roue à UN étage : le secteur est le lot. `won` toujours vrai — il n'y a pas de perdant.
        sector_label: pick.item.label,
        won: true,
        prize_label: pick.item.label,
        amount_eur: pick.item.amountEur,
      })
      if (sErr) throw new BusinessError('Ce tour vient d’être joué — recharge la page')

      const { error: tErr } = await admin
        .from('training_wheel_tickets')
        .update({ used_at: new Date().toISOString() })
        .eq('id', ticketRes.data.id)
      if (tErr) throw new Error(tErr.message)

      // PAS de revalidatePath ici, volontairement : une Server Action qui revalide renvoie le RSC
      // payload rafraîchi AVEC sa réponse — « Mes gains » afficherait le montant avant même que la
      // roue ait fini de tourner. Le rafraîchissement se fait côté client, après la révélation.
      return { segmentIndex: pick.index, label: pick.item.label, amountEur: pick.item.amountEur }
    },
  })
}

/** Config admin — la ligne 1 est seedée par 0136, donc c'est toujours un update de fait. */
export async function saveModuleWheelConfig(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: moduleWheelConfigForm,
    input: raw,
    guard: noGuard,
    handler: async (c) => {
      const profile = await requireAdminProfileLive()
      // Client UTILISATEUR : `training_module_wheel_config_admin_write` autorise l'admin — la RLS
      // fait le travail, défense en profondeur gratuite.
      const supabase = await createClient()
      const { error } = await supabase.from('training_module_wheel_config').upsert({
        id: 1,
        title: c.title,
        segments: segmentsToJson(c.segments.map((s) => ({ label: s.label, weight: s.weight, amountEur: s.amountEur }))),
        updated_at: new Date().toISOString(),
        updated_by: profile.id,
      })
      if (error) throw new Error(error.message)
      revalidatePath('/formation/ma-roue')
    },
  })
}
```

- [ ] **Step 12 : vérifier**

```bash
pnpm --filter @glagency/web test && pnpm typecheck && pnpm lint
```

Attendu : tout vert.

- [ ] **Step 13 : commit**

```bash
git add apps/web/src/features/training-module-wheel
git commit -m "feat(formation): noyau de la roue des modules (types, mappers, schéma, service, actions)

Le tirage est décidé serveur (crypto.randomInt + pickWeighted). L'insert
du spin passe AVANT le marquage du ticket : c'est l'unicité de
training_wheel_spins.ticket_id qui interdit de jouer deux fois le même
tour, et l'ordre inverse brûlerait le ticket sur un insert raté.

Contrairement à la roue encadrant, amount_eur est obligatoire sur chaque
segment : ici tout secteur paie, un null serait un tour consommé sans
versement."
```

---

### Task 4 : la page `/formation/ma-roue`

**Files:**
- Create: `apps/web/src/features/training-module-wheel/components/module-wheel-skeleton.tsx`
- Create: `apps/web/src/features/training-module-wheel/components/module-wheel-progress.tsx`
- Create: `apps/web/src/features/training-module-wheel/components/module-wheel-gains.tsx`
- Create: `apps/web/src/features/training-module-wheel/components/module-wheel-spinner.tsx`
- Create: `apps/web/src/features/training-module-wheel/components/module-wheel-config-dialog.tsx`
- Create: `apps/web/src/features/training-module-wheel/ModuleWheelTemplate.tsx`
- Create: `apps/web/src/app/(dash)/formation/ma-roue/page.tsx`
- Create: `apps/web/src/app/(dash)/formation/ma-roue/loading.tsx`
- Modify: `apps/web/src/config/workspaces.ts:237` (ajout de l'item après « Roue »)

**Interfaces:**
- Consumes : `getModuleWheel`, `spinModuleWheel`, `saveModuleWheelConfig`, les types de Task 3 ;
  `WheelSvg` / `sectorAngles` / `WheelResult` de Task 2.
- Produces : la route `/formation/ma-roue`, l'item de nav dont le `href` sert d'ancre à la pastille
  de Task 5.

- [ ] **Step 1 : l'item de nav**

Dans `apps/web/src/config/workspaces.ts`, ajouter `Sparkles` à l'import `lucide-react`, puis
insérer **juste après** la ligne `{ href: '/formation/roue', … }` :

```ts
      // La 2ᵉ roue (0136) : celle du CHATTER. Il gagne un tour en finissant un module et le joue
      // lui-même — d'où la pastille : un chiffre sur lequel on ne peut pas cliquer n'a pas de sens.
      // `anyOf` sans `slug` : le droit vient de « Ma formation », ce n'est pas une case de plus
      // dans Membres. Seul item de la face à porter une pastille avec Recrutement.
      { href: '/formation/ma-roue', label: 'Ma roue', icon: Sparkles, anyOf: ['frm-entrainement'] },
```

- [ ] **Step 2 : le squelette**

`apps/web/src/features/training-module-wheel/components/module-wheel-skeleton.tsx` :

```tsx
import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette de « Ma roue » : titre, compteur de tours, disque, bouton, liste des modules. */
export function ModuleWheelSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex flex-col items-center gap-5">
          <Skeleton className="aspect-square w-full max-w-[340px] rounded-full" />
          <Skeleton className="h-12 w-full max-w-[250px]" />
        </div>
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
```

Et `apps/web/src/app/(dash)/formation/ma-roue/loading.tsx` :

```tsx
import { ModuleWheelSkeleton } from '@/features/training-module-wheel/components/module-wheel-skeleton'

export default function Loading() {
  return (
    <div className="gla gla-page">
      <ModuleWheelSkeleton />
    </div>
  )
}
```

- [ ] **Step 3 : le panneau « Comment gagner un tour »**

`apps/web/src/features/training-module-wheel/components/module-wheel-progress.tsx` :

```tsx
import { Progress } from '@/components/ui/progress'
import type { ModuleWheelModule } from '../types'

/**
 * Les 7 modules et ce qui sépare le chatter du prochain tour. Sans ce panneau, la mécanique est
 * opaque : on gagne des tours sans savoir pourquoi ni comment en gagner un de plus.
 *
 * « Validé » veut dire ≥ 60 sur une session jouée ICI. Les exos repris de l'ancienne plateforme
 * comptent dans la progression et le classement, mais pas pour la roue — c'est dit explicitement
 * en bas du panneau, sinon un chatter qui a importé son historique ne comprendra pas ses chiffres.
 */
export function ModuleWheelProgress({ modules }: { modules: ModuleWheelModule[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Comment gagner un tour</h2>
      <p className="text-sm text-muted-foreground">
        Un tour de roue par module terminé — il faut au moins 60 à <span className="font-medium">tous</span> ses exos.
      </p>
      <ul className="flex flex-col gap-2">
        {modules.map((m) => {
          const restant = Math.max(0, m.total - m.valides)
          return (
            <li key={m.id} className="flex items-center gap-3 rounded-xl border px-4 py-3">
              <span aria-hidden className="text-xl leading-none">{m.emoji ?? '📘'}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{m.title}</span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {m.valides}/{m.total}
                  </span>
                </div>
                <Progress value={m.total ? (m.valides * 100) / m.total : 0} label={`Progression du module ${m.title}`} />
              </div>
              <span className="shrink-0 text-sm">
                {m.etat === 'joue' ? (
                  <span className="text-muted-foreground">Tour joué</span>
                ) : m.etat === 'gagne' ? (
                  <span className="font-medium text-gold">Tour à jouer 🎡</span>
                ) : (
                  <span className="text-muted-foreground">
                    {restant} exo{restant > 1 ? 's' : ''} restant{restant > 1 ? 's' : ''}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Seuls les exos joués ici comptent pour la roue. Ceux repris de l’ancienne plateforme comptent
        pour ta progression et le classement.
      </p>
    </section>
  )
}
```

- [ ] **Step 4 : « Mes gains »**

`apps/web/src/features/training-module-wheel/components/module-wheel-gains.tsx` :

```tsx
import { frDateTimeParis } from '@glagency/core'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { eur } from '@/lib/format'
import type { ModuleWheelSpin } from '../types'

/** Les tours déjà joués par le visiteur, et ce qu'ils lui ont rapporté. */
export function ModuleWheelGains({ spins, totalEur }: { spins: ModuleWheelSpin[]; totalEur: number }) {
  if (spins.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Mes gains</h2>
        <p className="text-sm text-muted-foreground">Aucun tour joué pour l’instant.</p>
      </section>
    )
  }
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Mes gains</h2>
      <p className="text-sm text-muted-foreground">
        Total gagné : <span className="font-medium tabular-nums text-foreground">{eur(totalEur)}</span> sur {spins.length} tour
        {spins.length > 1 ? 's' : ''}
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Date</TableHead>
              <TableHead>Pour</TableHead>
              <TableHead className="w-28 text-right">Gain</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spins.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="tabular-nums text-muted-foreground">{frDateTimeParis(s.spunAt)}</TableCell>
                <TableCell>{s.reason ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{s.amountEur == null ? '—' : eur(s.amountEur)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
```

- [ ] **Step 5 : la roue (feuille client)**

`apps/web/src/features/training-module-wheel/components/module-wheel-spinner.tsx` :

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { WheelPrize } from '@glagency/core'
import { ActionButton } from '@/components/action-button'
import { WheelResult } from '@/components/training/wheel-result'
import { sectorAngles, WheelSvg } from '@/components/training/wheel-svg'
import { playCling, playWheelSpin } from '@/lib/sfx'
import { spinModuleWheel } from '../actions'
import type { ModuleSpinResult } from '../types'

/** Durée de la transition CSS de `WheelSvg` (4,8 s) + une marge pour l'arrêt franc. */
const SPIN_MS = 4900
/**
 * Une Server Action ne REJETTE que sur un échec de transport (réseau coupé, id d'action périmé
 * après un déploiement) — jamais sur une erreur métier, que `runAction` rend en `success: false`.
 * Sans ce filet, la phase resterait bloquée sur « spinning » et le bouton tournerait indéfiniment.
 */
const TRANSPORT_KO = 'Connexion perdue — recharge la page'

type Phase = 'idle' | 'spinning' | 'reveal'

/**
 * La roue des modules, côté CHATTER : il joue pour lui-même, en consommant un tour gagné en
 * finissant un module. Le tirage est décidé par le SERVEUR (`spinModuleWheel`) : ici on anime la
 * roue jusqu'au secteur renvoyé, puis on révèle le montant. Aucune lib — rotation CSS sur le SVG.
 */
export function ModuleWheelSpinner({ segments, tours }: { segments: WheelPrize[]; tours: number }) {
  const router = useRouter()
  const [rotation, setRotation] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<ModuleSpinResult | null>(null)
  const timer = useRef<number | null>(null)
  // Verrou SYNCHRONE : `phase` ne vaut 'spinning' qu'au rendu suivant, et le `disabled` du bouton
  // avec lui. Deux clics dans la même frame passeraient donc tous les deux. (La base refuserait
  // le second — `ticket_id` est unique — mais l'utilisateur verrait une erreur pour rien.)
  const busy = useRef(false)

  // Le timer de révélation ne doit pas survivre au démontage (navigation pendant la rotation).
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])

  // `WheelSvg` parle en `WheelSector` : sur cette roue, aucun secteur n'est perdant.
  const sectors = segments.map((s) => ({ label: s.label, weight: s.weight, lose: false }))

  const spin = async () => {
    if (tours <= 0 || phase !== 'idle' || busy.current) return
    busy.current = true
    setPhase('spinning')
    let r: Awaited<ReturnType<typeof spinModuleWheel>>
    try {
      r = await spinModuleWheel()
    } catch {
      toast.error(TRANSPORT_KO)
      busy.current = false
      setPhase('idle')
      router.refresh()
      return
    }
    if (!r.success) {
      toast.error(r.error)
      busy.current = false
      setPhase('idle')
      router.refresh()
      return
    }
    setResult(r.data)
    const angles = sectorAngles(sectors)
    const a = angles.find((x) => x.index === r.data.segmentIndex) ?? angles[0]
    if (!a) {
      // Config sans aucun poids > 0 : le serveur aurait throw avant d'en arriver là.
      busy.current = false
      setPhase('idle')
      router.refresh()
      return
    }
    // Angle cible = un point ALÉATOIRE dans le secteur (jamais pile au milieu : ça se voit).
    const target = a.a0 + (a.a1 - a.a0) * (0.15 + Math.random() * 0.7)
    // Pointeur en haut (0°) : amener le secteur sous le pointeur = tourner de −target. Les deux
    // `((x % 360) + 360) % 360` évitent le modulo négatif ; +5 tours pour le spectacle. La
    // rotation ne fait que CROÎTRE — la transition CSS ne repart jamais en arrière.
    const current = ((rotation % 360) + 360) % 360
    const targetMod = ((-target % 360) + 360) % 360
    setRotation(rotation + ((targetMod - current + 360) % 360) + 5 * 360)
    playWheelSpin(SPIN_MS / 1000)
    timer.current = window.setTimeout(() => {
      playCling()
      setPhase('reveal')
    }, SPIN_MS)
  }

  return (
    <section className="flex flex-col items-center gap-5">
      <WheelSvg sectors={sectors} rotation={rotation} spinning={phase === 'spinning'} />

      <ActionButton
        type="button"
        onClick={() => void spin()}
        pending={phase === 'spinning'}
        disabled={tours <= 0 || phase === 'reveal'}
        className="gla-btn mt-2 h-12 w-full max-w-[250px] border-0 text-[15px] font-bold"
      >
        {tours > 0 ? 'Tourner la roue 🎡' : 'Aucun tour disponible'}
      </ActionButton>

      <p className="text-center text-sm text-[var(--gla-faint)]">
        {tours > 0
          ? `Tu as ${tours} tour${tours > 1 ? 's' : ''} — chaque tour rapporte entre 6 et 8 €.`
          : 'Termine un module (au moins 60 à tous ses exos) pour gagner un tour.'}
      </p>

      {phase === 'reveal' && result && (
        <WheelResult
          reveal={{ won: true, label: result.label, amountEur: result.amountEur }}
          winnerName={null}
          onDone={() => {
            busy.current = false
            setPhase('idle')
            setResult(null)
            // C'est ICI qu'on rafraîchit, pas dans l'action : le compteur de tours et « Mes gains »
            // ne doivent bouger qu'une fois le coffre ouvert.
            router.refresh()
          }}
        />
      )}
    </section>
  )
}
```

- [ ] **Step 6 : le dialog admin**

`apps/web/src/features/training-module-wheel/components/module-wheel-config-dialog.tsx` :

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { WheelSector } from '@glagency/core'
import { ActionButton } from '@/components/action-button'
import { FieldError } from '@/components/field-error'
import { WheelSvg } from '@/components/training/wheel-svg'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveModuleWheelConfig } from '../actions'
import { moduleWheelConfigForm, type ModuleWheelConfigFormValues, type ModuleWheelConfigInput } from '../schema'
import type { ModuleWheelConfig } from '../types'

/** Un poids saisi (l'input rend une chaîne) → nombre affichable. */
const asWeight = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}
/** Part d'un poids dans la roue, en %, arrondie — purement indicatif. */
const share = (w: unknown, total: number) => (total > 0 ? `${Math.round((asWeight(w) / total) * 100)} %` : '—')

const toForm = (c: ModuleWheelConfig): ModuleWheelConfigFormValues => ({
  title: c.title,
  segments: c.segments.map((s) => ({ label: s.label, weight: String(s.weight), amountEur: String(s.amountEur ?? 0) })),
})

/**
 * Configuration de la roue des modules (admin). UNE seule liste, contrairement à la roue nº 1 :
 * cette roue n'a qu'un étage — le secteur EST le montant, et il n'y a pas de perdant. Les poids
 * sont relatifs (la colonne « % » calcule la vraie probabilité), et l'aperçu à droite est la
 * VRAIE roue, redessinée à chaque frappe.
 *
 * Reset à chaque OUVERTURE seulement (piège des dialogs) : réinitialiser sur un changement de
 * `config` effacerait la saisie en cours si un autre admin enregistrait pendant ce temps.
 */
export function ModuleWheelConfigDialog({ config }: { config: ModuleWheelConfig }) {
  // OBLIGATOIRE sur tout composant RHF de ce projet : sans lui, le React Compiler casse
  // `formState` — le formulaire perd son état de chargement ET ses messages d'erreur.
  'use no memo'
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ModuleWheelConfigFormValues, unknown, ModuleWheelConfigInput>({
    resolver: zodResolver(moduleWheelConfigForm),
    defaultValues: toForm(config),
  })
  const prevOpen = useRef(false)
  useEffect(() => {
    if (open && !prevOpen.current) reset(toForm(config))
    prevOpen.current = open
  }, [open, config, reset])

  const segments = useFieldArray({ control, name: 'segments' })
  const watched = useWatch({ control, name: 'segments' }) ?? []
  const total = watched.reduce((n, x) => n + asWeight(x.weight), 0)
  // Espérance affichée : c'est le VRAI coût par tour, la seule chose qu'un admin doit regarder
  // avant d'enregistrer. Σ(poids × montant) / Σ(poids).
  const esperance =
    total > 0 ? watched.reduce((n, x) => n + asWeight(x.weight) * (Number(x.amountEur) || 0), 0) / total : 0
  // Aperçu : aucun secteur perdant sur cette roue.
  const preview: WheelSector[] = watched.map((x) => ({ label: String(x.label ?? ''), weight: asWeight(x.weight), lose: false }))

  const submit = handleSubmit(async (values) => {
    const res = await saveModuleWheelConfig(values)
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success('Roue enregistrée')
    setOpen(false)
    router.refresh()
  })

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Configurer
      </Button>
      <Dialog open={open} onOpenChange={(o) => !isSubmitting && setOpen(o)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Configurer la roue des modules</DialogTitle>
            <DialogDescription>
              Un secteur = un montant, et tous sont gagnants. Les poids sont relatifs — le pourcentage est calculé.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="mw-title">Titre de la page</Label>
              <Input id="mw-title" disabled={isSubmitting} aria-invalid={!!errors.title} {...register('title')} />
              <FieldError message={errors.title?.message} />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
              <fieldset className="flex flex-col gap-3">
                <legend className="text-sm font-medium">Secteurs</legend>
                <ul className="flex flex-col gap-2">
                  {segments.fields.map((f, i) => (
                    <li key={f.id} className="flex flex-col gap-1">
                      <div className="grid grid-cols-[1fr_6rem_5rem_3rem_auto] items-center gap-2">
                        <Input
                          aria-label={`Libellé du secteur ${i + 1}`}
                          placeholder="7 €"
                          disabled={isSubmitting}
                          aria-invalid={!!errors.segments?.[i]?.label}
                          {...register(`segments.${i}.label`)}
                        />
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          placeholder="€"
                          aria-label={`Montant du secteur ${i + 1} en euros`}
                          disabled={isSubmitting}
                          aria-invalid={!!errors.segments?.[i]?.amountEur}
                          {...register(`segments.${i}.amountEur`)}
                        />
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          aria-label={`Poids du secteur ${i + 1}`}
                          disabled={isSubmitting}
                          aria-invalid={!!errors.segments?.[i]?.weight}
                          {...register(`segments.${i}.weight`)}
                        />
                        <span className="text-right text-xs tabular-nums text-muted-foreground">{share(watched[i]?.weight, total)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          aria-label={`Supprimer le secteur ${i + 1}`}
                          disabled={isSubmitting}
                          onClick={() => segments.remove(i)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <FieldError
                        message={
                          errors.segments?.[i]?.label?.message ??
                          errors.segments?.[i]?.amountEur?.message ??
                          errors.segments?.[i]?.weight?.message
                        }
                      />
                    </li>
                  ))}
                </ul>
                {/* Erreur de refine (au moins un poids > 0) : SOUS la liste — c'est la liste
                    entière qui est en cause, pas une ligne. */}
                <FieldError message={errors.segments?.message ?? errors.segments?.root?.message} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  disabled={isSubmitting}
                  onClick={() => segments.append({ label: '7 €', weight: '1', amountEur: '7' })}
                >
                  <Plus className="size-4" /> Secteur
                </Button>
              </fieldset>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Aperçu</p>
                <WheelSvg sectors={preview} className="max-w-[14rem]" />
                <p className="text-sm text-muted-foreground">
                  Coût moyen d’un tour :{' '}
                  <span className="font-medium tabular-nums text-foreground">{esperance.toFixed(2)} €</span>
                </p>
              </div>
            </div>

            {errors.root && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {errors.root.message}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
                Annuler
              </Button>
              <ActionButton type="submit" pending={isSubmitting}>
                Enregistrer
              </ActionButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 7 : le template**

`apps/web/src/features/training-module-wheel/ModuleWheelTemplate.tsx` :

```tsx
import { ModuleWheelConfigDialog } from './components/module-wheel-config-dialog'
import { ModuleWheelGains } from './components/module-wheel-gains'
import { ModuleWheelProgress } from './components/module-wheel-progress'
import { ModuleWheelSpinner } from './components/module-wheel-spinner'
import type { ModuleWheelData } from './types'

/**
 * « Ma roue » — Server Component, AUCUN fetch (guidelines-data-loading §3).
 *
 * Une seule page, pas d'onglets : le chatter a au plus 7 tours dans sa vie, tout tient à l'écran.
 * La roue en haut, ce qui reste à faire pour en gagner un de plus au milieu, ses gains en bas.
 */
export function ModuleWheelTemplate({ data, isAdmin }: { data: ModuleWheelData; isAdmin: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[30px] font-bold tracking-[-0.3px]">{data.config.title}</h1>
          <p className="text-sm text-[var(--gla-faint)]">
            {data.tours > 0
              ? `Tu as ${data.tours} tour${data.tours > 1 ? 's' : ''} à jouer.`
              : 'Termine un module pour gagner un tour.'}
          </p>
        </div>
        {isAdmin && <ModuleWheelConfigDialog config={data.config} />}
      </div>
      <ModuleWheelSpinner segments={data.config.segments} tours={data.tours} />
      <ModuleWheelProgress modules={data.modules} />
      <ModuleWheelGains spins={data.spins} totalEur={data.totalEur} />
    </div>
  )
}
```

- [ ] **Step 8 : la route**

`apps/web/src/app/(dash)/formation/ma-roue/page.tsx` :

```tsx
import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { ModuleWheelTemplate } from '@/features/training-module-wheel/ModuleWheelTemplate'
import { ModuleWheelSkeleton } from '@/features/training-module-wheel/components/module-wheel-skeleton'
import { getModuleWheel } from '@/features/training-module-wheel/services/get-module-wheel'
import type { ModuleWheelData } from '@/features/training-module-wheel/types'

/**
 * « Ma roue » — la roue des MODULES, réservée aux chatters en formation (`frm-entrainement`, les
 * admins passent partout). Le vrai verrou est la garde de `spinModuleWheel` + la RLS ; cette page
 * ne fait que refuser l'entrée.
 */
export default async function MaRouePage() {
  // `requireAccess(slug)` (lib/auth/index.ts:95) redirige si le droit manque et rend le `Profile`
  // (id, role, pages) — les admins passent partout.
  const profile = await requireAccess('frm-entrainement')
  // Pas de `await` ici : la requête part pendant que le squelette s'affiche (streaming).
  const data = getModuleWheel(profile.id)
  return (
    // `.gla` : même décor que la roue nº 1 — c'est le même objet, hérité de Good Luck Agency.
    <div className="gla gla-page">
      <Suspense fallback={<ModuleWheelSkeleton />}>
        <Content data={data} isAdmin={profile.role === 'admin'} />
      </Suspense>
    </div>
  )
}

async function Content({ data, isAdmin }: { data: Promise<ModuleWheelData>; isAdmin: boolean }) {
  return <ModuleWheelTemplate data={await data} isAdmin={isAdmin} />
}
```

- [ ] **Step 9 : vérifier**

```bash
pnpm lint && pnpm typecheck && pnpm build
```

- [ ] **Step 10 : recette manuelle sur l'UAT**

Avec un compte **chatter** ayant `frm-entrainement` et au moins un ticket (cf. le rétroactif de
Task 1) :

1. « Ma roue » apparaît dans la sidebar (la pastille arrive en Task 5).
2. La roue montre 8 secteurs, `Tourner la roue 🎡` est actif, le texte annonce le bon nombre de tours.
3. Un tour : la roue tourne ~5 s, le coffre s'ouvre en 10 clics, le montant est **entre 6 et 8 €**.
4. Après fermeture : le compteur a baissé de 1, le module passe à « Tour joué », « Mes gains » a une
   ligne de plus avec le bon montant.
5. **Double-clic sur `Tourner`** : un seul tirage, pas deux.
6. Avec 0 tour : le bouton est désactivé et le texte explique comment en gagner un.
7. Avec un compte **encadrant `frm-suivi` sans `frm-entrainement`** : l'item n'apparaît pas, et
   `/formation/ma-roue` en accès direct refuse.
8. Avec un compte **admin** : le bouton « Configurer » est là, éditer un montant et vérifier que la
   roue affiche la nouvelle valeur.

- [ ] **Step 11 : commit**

```bash
git add apps/web/src/features/training-module-wheel apps/web/src/app/\(dash\)/formation/ma-roue apps/web/src/config/workspaces.ts
git commit -m "feat(formation): la page Ma roue, côté chatter

Une seule page sans onglets (7 tours dans une vie, tout tient à l'écran) :
la roue, le panneau « Comment gagner un tour » avec ce qui reste à valider
par module, et les gains. Le panneau dit explicitement que les exos repris
de l'ancienne plateforme ne comptent pas pour la roue — sinon les chiffres
d'un chatter qui a importé son historique sont incompréhensibles."
```

---

### Task 5 : la pastille et la colonne « Origine »

**Files:**
- Create: `apps/web/src/lib/services/module-wheel-pending.ts`
- Modify: `apps/web/src/app/(dash)/layout.tsx:44-52` et le bloc `<AppSidebar …>` (l. 60-70)
- Modify: `apps/web/src/components/app-sidebar.tsx:72` (commentaire orphelin), la signature de
  `AppSidebar`, et `renderDirect` (l. 240-252)
- Modify: `apps/web/src/features/training-wheel/types.ts` (`WheelHistoryRow`)
- Modify: `apps/web/src/features/training-wheel/services/get-wheel-history.ts`
- Modify: `apps/web/src/features/training-wheel/components/wheel-history.tsx`

**Interfaces:**
- Consumes : `training_module_wheel_pending` (Task 1), l'item de nav `/formation/ma-roue` (Task 4).
- Produces : `getModuleWheelPending(profileId: string): Promise<number>` ;
  `WheelHistoryRow.origine: string`.

- [ ] **Step 1 : le service de pastille**

`apps/web/src/lib/services/module-wheel-pending.ts` :

```ts
import { createClient } from '@/lib/supabase/server'

/**
 * Pastille sidebar « Ma roue » : nombre de tours de roue de module en attente — RPC
 * `training_module_wheel_pending` (0136), lecture seule.
 *
 * Client USER (RLS) et SURTOUT PAS le service-role : la fonction est `security definer` mais
 * s'auto-restreint dans son corps (`p_profile = auth.uid()` ou `has_page('frm-suivi')`). Sous
 * service-role `auth.uid()` est nul : elle renverrait 0 pour tout le monde. Même piège que
 * `getRecruitPending`.
 */
export async function getModuleWheelPending(profileId: string): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('training_module_wheel_pending', { p_profile: profileId })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}
```

- [ ] **Step 2 : brancher la promesse dans le layout**

Dans `apps/web/src/app/(dash)/layout.tsx`, après le bloc `recruitPendingPromise` :

```ts
  // Pastille « Ma roue » : les tours de roue gagnés en finissant un module (0136). Court-circuitée
  // pour qui n'a pas le droit Entraînement — l'item de nav n'existe pas pour eux, l'aller-retour
  // serait payé pour rien à chaque hard load. `.catch` inline comme les deux autres : une erreur
  // de pastille ne casse jamais la page.
  // `profile.pages` est un `string[]` non optionnel (cf. `lib/auth/index.ts:99`, qui l'appelle
  // sans garde).
  const moduleWheelPendingPromise =
    profile.pages.includes('frm-entrainement') || profile.role === 'admin'
      ? getModuleWheelPending(profile.id).catch(() => 0)
      : Promise.resolve(0)
```

et le passer au composant :

```tsx
        moduleWheelPendingPromise={moduleWheelPendingPromise}
```

- [ ] **Step 3 : afficher le badge**

Dans `apps/web/src/components/app-sidebar.tsx`, remplacer le commentaire orphelin de la ligne 72
et ajouter la prop :

```ts
  /** Tours de roue de module disponibles (badge streamé, cf. `insightsCountPromise`). */
  moduleWheelPendingPromise?: Promise<number>
```

*(le commentaire actuel `/** Tour de roue disponible (badge streamé, cf. `insightsCountPromise`). */`
est un vestige sans prop — il devient celui-ci)*

L'ajouter à la déstructuration des props, puis dans `renderDirect`, après le bloc `/recrutement` :

```tsx
        {item.href.endsWith('/ma-roue') && moduleWheelPendingPromise && (
          <Suspense fallback={null}>
            <CountBadge promise={moduleWheelPendingPromise} />
          </Suspense>
        )}
```

- [ ] **Step 4 : l'origine dans l'historique encadrant**

Dans `apps/web/src/features/training-wheel/types.ts`, ajouter à `WheelHistoryRow` :

```ts
  /**
   * D'où vient le tour : « Encadrant » (roue nº 1, aucun ticket) ou le libellé du ticket consommé
   * (« Module Relance terminé », roue des modules). Les deux roues écrivent dans la même table :
   * sans cette colonne, la compta ne sait plus ce qu'elle paie.
   */
  origine: string
```

Dans `get-wheel-history.ts`, ajouter `ticket_id` au `select` des spins, charger les `reason` des
tickets référencés en une requête, et remplir `origine` :

```ts
  const ticketIds = [...new Set((spinsRes.data ?? []).flatMap((s) => (s.ticket_id ? [s.ticket_id] : [])))]
  const raisons = new Map<string, string>()
  if (ticketIds.length > 0) {
    // Client UTILISATEUR : la RLS de `training_wheel_tickets` ouvre déjà toutes les lignes à
    // `frm-suivi` — pas besoin du service-role ici, contrairement aux noms des encadrants.
    const { data, error } = await supabase.from('training_wheel_tickets').select('id, reason').in('id', ticketIds)
    if (error) throw new Error(error.message)
    for (const t of data ?? []) raisons.set(t.id, t.reason)
  }
```

puis dans le `map` des lignes :

```ts
    origine: s.ticket_id ? (raisons.get(s.ticket_id) ?? 'Roue des modules') : 'Encadrant',
```

Dans `wheel-history.tsx`, ajouter la colonne, entre « Lot » et « Lancé par » :

```tsx
                    <TableHead className="w-44">Origine</TableHead>
```

```tsx
                        <TableCell className="text-muted-foreground">{r.origine}</TableCell>
```

- [ ] **Step 5 : vérifier**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

- [ ] **Step 6 : recette manuelle sur l'UAT**

1. Compte chatter avec un ticket : le chiffre apparaît à côté de « Ma roue » dans la sidebar.
2. Jouer le tour : après le rafraîchissement, le chiffre disparaît (ou baisse de 1).
3. Finir un module de bout en bout (notation du dernier exo à ≥ 60) : le chiffre apparaît **sans
   rechargement manuel** au retour sur une page de la face — c'est le layout qui le recalcule.
4. Compte encadrant sur `/formation/roue?vue=historique` : la colonne « Origine » dit `Encadrant`
   sur les anciens tirages et `Module … terminé` sur ceux de la roue des modules.
5. Compte sans `frm-entrainement` : aucune pastille, aucun item.

- [ ] **Step 7 : commit**

```bash
git add apps/web/src/lib/services/module-wheel-pending.ts apps/web/src/app/\(dash\)/layout.tsx apps/web/src/components/app-sidebar.tsx apps/web/src/features/training-wheel
git commit -m "feat(formation): pastille des tours de roue, et l'origine dans l'historique encadrant

Le badge reprend la plomberie déjà en place (CountBadge + promesse streamée
du layout) — il restait même son commentaire orphelin dans app-sidebar.

Les deux roues écrivant dans training_wheel_spins, l'historique encadrant
gagne une colonne Origine : sans elle, la compta ne sait plus si un
versement vient d'un tour donné par un encadrant ou d'un module terminé."
```

---

## Après les 5 tasks — la mise en production

1. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` verts à la racine.
2. Recette complète sur l'UAT (les recettes des tasks 4 et 5).
3. **Re-mesurer le rétroactif sur la PROD** avant d'appliquer la migration — la promo joue tous les
   jours, le chiffre de 4 tours date du 2026-08-30 :

```bash
DB=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$DB" -X -c "
with cas as (select c.module_id, c.id from training_cases c join training_modules m on m.id=c.module_id where c.active and m.active)
select p.display_name, m.title from profiles p
cross join (select distinct module_id from cas) cs join training_modules m on m.id=cs.module_id
where p.left_at is null and p.role='chatteur' and 'frm-entrainement' = any(p.pages)
  and not exists (select 1 from cas c where c.module_id=cs.module_id
    and not exists (select 1 from training_sessions s where s.profile_id=p.id and s.case_id=c.id
                    and s.status='scored' and s.legacy_id is null and s.total>=60))
order by 1,2;"
```

Annoncer le total à Benoit **avant** de pousser.
4. PR sur `main`, merge.
5. **Appliquer `0136` en PROD AVANT le déploiement du web** (`supabase db push --db-url "$DATABASE_URL"`,
   dry-run d'abord et après). La migration est additive : le code actuellement en ligne continue de
   tourner avec, mais le nouveau code planterait sans elle.
6. Vérifier le déploiement Vercel, puis recette en prod avec un compte chatter.
