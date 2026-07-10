-- 0030 — Planning journalier par manager (page « Planning », face chatteurs).
-- Un planning par profil (les sous-managers) : encart priorité, blocs horaires par
-- section (matin / après-midi / soir), tâches annexes. La répartition du temps et les
-- plages de section se CALCULENT côté web à partir des blocs (rien de dénormalisé).
-- Lecture : l'admin voit tout, un membre voit LE SIEN. Écriture : admin uniquement.

create table plannings (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null unique references profiles(id) on delete cascade,
  -- Encart « PRIORITÉ N°1 » en tête de page (vide = pas d'encart).
  priority_title     text not null default '',
  priority_body      text not null default '',
  priority_forbidden text not null default '',   -- « Interdits : … »
  priority_allowed   text not null default '',   -- « Tout le reste est permis. »
  -- Note affichée sous chaque pause (ex. « Restez disponibles sur vos téléphones… »).
  pause_note   text not null default '',
  -- Tâches annexes : [{title, detail}] + note de bas d'encart.
  annexes      jsonb not null default '[]',
  annex_note   text not null default '',
  updated_at   timestamptz not null default now(),
  updated_by   uuid references profiles(id) on delete set null
);

create table planning_blocks (
  id          uuid primary key default gen_random_uuid(),
  planning_id uuid not null references plannings(id) on delete cascade,
  section     text not null check (section in ('matin', 'apres_midi', 'soir')),
  position    integer not null default 0,
  time_start  text not null,                      -- 'HH:MM'
  time_end    text not null,                      -- 'HH:MM' ('00:00' = minuit fin de journée)
  title       text not null,
  badge       text not null default '',           -- ex. COMPTA / SETTERS / CLOSERS
  color       text not null default '#0ea5e9',    -- barre d'accent + teinte du badge
  bullets     jsonb not null default '[]',        -- puces (text[]) — « lead : détail »
  created_at  timestamptz not null default now()
);
create index planning_blocks_planning_idx on planning_blocks (planning_id, section, position);

alter table plannings enable row level security;
alter table planning_blocks enable row level security;

create policy plannings_read on plannings for select to authenticated
  using (public.is_admin() or profile_id = (select auth.uid()));
create policy plannings_ins on plannings for insert to authenticated
  with check (public.is_admin());
create policy plannings_upd on plannings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy plannings_del on plannings for delete to authenticated
  using (public.is_admin());

-- Blocs visibles si le planning parent l'est (le RLS de plannings s'applique dans l'exists).
create policy planning_blocks_read on planning_blocks for select to authenticated
  using (exists (select 1 from plannings p where p.id = planning_id));
create policy planning_blocks_ins on planning_blocks for insert to authenticated
  with check (public.is_admin());
create policy planning_blocks_upd on planning_blocks for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy planning_blocks_del on planning_blocks for delete to authenticated
  using (public.is_admin());
