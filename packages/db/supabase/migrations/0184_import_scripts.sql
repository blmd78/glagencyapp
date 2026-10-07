-- 0184 — Import de scripts Notion → MyPuls depuis le CRM (spec 2026-10-07-import-scripts-crm-design.md).
--
-- notion_connection : la connexion OAuth au Notion de l'agence (une seule ligne, 'agence'). La clé est
-- CHIFFRÉE par le serveur (AES-256-GCM, SNAP_CODES_SECRET hors base). RLS activée SANS policy :
-- service role seul, comme ingest_session (0109) — l'écran admin la lit par le serveur après contrôle
-- du rôle, et la clé n'est jamais renvoyée au navigateur.
create table if not exists public.notion_connection (
  id text primary key default 'agence' check (id = 'agence'),
  access_token_encrypted text not null,
  workspace_id text not null,
  workspace_name text not null,
  bot_id text not null,
  root_page_id text,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now()
);
alter table public.notion_connection enable row level security;
comment on table public.notion_connection is
  'Connexion OAuth au Notion de l''agence (import de scripts) — clé chiffrée, service-role only (0184).';

-- script_imports : historique et état de chaque import. La RLS fait le VRAI cloisonnement par modèle :
-- admin partout, manager sur SES modèles (profile_creators) — même miroir que creators_scoped_read.
-- Un manager sans modèle assignée ne peut rien importer (on écrit chez un tiers).
create table if not exists public.script_imports (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
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
  -- En `sending` : heure de DÉPART de l'envoi (un envoi coupé par la durée Vercel s'affiche « interrompu »).
  sent_at timestamptz
);
create index if not exists script_imports_created_by_idx on public.script_imports (created_by, created_at desc);
create index if not exists script_imports_creator_idx on public.script_imports (creator_id);
alter table public.script_imports enable row level security;
comment on table public.script_imports is
  'Imports de scripts Notion → Studio MyPuls (CRM) : rapport, brouillon, statut, id du script MyPuls (0184).';

create policy script_imports_read on public.script_imports for select to authenticated
  using ((select public.is_admin()) or created_by = (select auth.uid()));

create policy script_imports_insert on public.script_imports for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (select public.is_admin())
      or exists (
        select 1 from public.profile_creators pc
        where pc.profile_id = (select auth.uid()) and pc.creator_id = script_imports.creator_id
      )
    )
  );

create policy script_imports_update on public.script_imports for update to authenticated
  using (created_by = (select auth.uid()))
  with check (
    created_by = (select auth.uid())
    and (
      (select public.is_admin())
      or exists (
        select 1 from public.profile_creators pc
        where pc.profile_id = (select auth.uid()) and pc.creator_id = script_imports.creator_id
      )
    )
  );
