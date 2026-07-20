-- 0067 — To-do personnelle : une liste par encadrant, affichée en 2e onglet de la page
-- Planning (spec docs/superpowers/specs/2026-07-20-todos-kanban-design.md).
--
-- Droits = ceux du planning (0061), PLUS « chacun gère la sienne » (une to-do qu'on ne peut
-- pas cocher soi-même n'a aucun sens), MOINS les cibles non encadrantes : can_edit_planning_of
-- laisserait un admin écrire chez un chatteur, or un chatteur n'a pas accès à la page — sa
-- liste serait invisible.
create table public.todos (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  -- Un titre blanc ("   ") passerait le `not null` : le formulaire le bloque déjà, mais une
  -- insertion SQL directe (Claude, correctif manuel) le contournerait sans ce check.
  title       text not null check (btrim(title) <> ''),
  description text,
  status      text not null default 'todo'
              check (status in ('todo', 'in_progress', 'done')),
  -- Facultatif : sert la roadmap de dev, inutile pour une tâche opérationnelle.
  type        text check (type in ('feature', 'bug', 'maintenance')),
  -- Rang numérique et NON un libellé : un `order by` sur du texte trierait alphabétiquement
  -- (basse < haute < normale), soit un ordre faux et silencieux.
  priority    smallint not null default 2 check (priority in (1, 2, 3)),  -- 1 haute, 2 normale, 3 basse
  release     text,
  created_by  uuid references public.profiles(id) on delete set null,
  -- Nom de l'auteur DÉNORMALISÉ, posé par les Server Actions. Indispensable : la RLS de
  -- `profiles` (0054) ne laisse un manager lire que lui-même et ses rattachés directs — une
  -- jointure sur l'auteur renverrait donc null quand un admin dépose une tâche chez lui.
  -- null + created_by null = écrit par Claude (service role).
  created_by_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  done_at     timestamptz
);

create or replace function public.can_write_todo_of(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
      select 1 from profiles t
      where t.id = target
        and t.role in ('superadmin', 'admin', 'manager', 'sous-manager')
    )
    and (
      public.can_edit_planning_of(target)
      or (target = (select auth.uid()) and exists (
            select 1 from profiles p
            where p.id = (select auth.uid())
              and p.role in ('superadmin', 'admin', 'manager', 'sous-manager')
          ))
    );
$$;
revoke all on function public.can_write_todo_of(uuid) from public;
grant execute on function public.can_write_todo_of(uuid) to authenticated;

alter table public.todos enable row level security;

-- Lecture = écriture (pas de to-do en lecture seule, spec §1).
-- PAS de wrapping `(select …)` ici : le pattern initPlan de 0057 ne profite qu'aux appels
-- SANS argument dépendant de la ligne (is_admin(), auth.uid()…) — la sous-requête devient
-- alors une constante par requête, évaluée une seule fois. `can_write_todo_of(profile_id)`
-- prend une colonne de la ligne courante : la sous-requête reste corrélée, Postgres ne peut
-- pas la réduire à un InitPlan, et le wrapping n'apporte rien. Convention déjà suivie par les
-- fonctions RLS à argument de ligne du repo : `can_manage_planning_of(profile_id)` nu
-- (0061_planning_manager_scope.sql) et `manages(profile_id)` nu (0064_daily_reports.sql).
create policy todos_select on public.todos for select to authenticated
  using (public.can_write_todo_of(profile_id));
create policy todos_insert on public.todos for insert to authenticated
  with check (public.can_write_todo_of(profile_id));
create policy todos_update on public.todos for update to authenticated
  using (public.can_write_todo_of(profile_id))
  with check (public.can_write_todo_of(profile_id));
create policy todos_delete on public.todos for delete to authenticated
  using (public.can_write_todo_of(profile_id));

-- Toutes les lectures filtrent d'abord par personne, puis par statut.
create index todos_profile_status_idx on public.todos (profile_id, status);
-- Toute FK est indexée (convention 0055_fk_indexes.sql).
create index todos_created_by_idx on public.todos (created_by);

-- updated_at / done_at / created_at maintenus EN BASE : Claude écrit en SQL direct, hors des
-- Server Actions — un maintien applicatif seul les laisserait périmés. INSERT compris (une
-- tâche créée directement en 'done' doit avoir son done_at) ; `old` n'existe pas à l'INSERT,
-- d'où la garde tg_op.
--
-- done_at, par ordre de priorité :
--   1. `old.done_at` s'il existe (UPDATE d'une tâche DÉJÀ finie) : on ne le laisse pas
--      dériver tant que le statut reste 'done', même si un `done_at` est fourni dans le même
--      UPDATE — corriger une date suppose de d'abord ressortir de 'done' (règle 3 ci-dessous
--      le remet alors à null), puis d'y rerentrer avec la bonne valeur (règle 2).
--   2. sinon `new.done_at` s'il est fourni : permet d'IMPORTER une tâche terminée la veille,
--      ou de la corriger via le repassage décrit ci-dessus, sans être écrasé par `now()`.
--   3. sinon `now()` : le cas courant (case cochée depuis l'app, sans date explicite).
-- Le passage HORS de 'done' remet toujours `done_at` à null.
create or replace function public.todos_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    -- created_at épinglé : jamais réécrivable, y compris par un admin qui édite la to-do
    -- d'un encadrant sous lui (la RLS l'y autorise, mais pas à falsifier la date de création).
    new.created_at := old.created_at;
  end if;
  new.done_at := case
    when new.status = 'done'
      then coalesce(
        case when tg_op = 'UPDATE' then old.done_at end,
        new.done_at,
        now()
      )
    else null
  end;
  return new;
end;
$$;

create trigger todos_touch_trg before insert or update on public.todos
  for each row execute function public.todos_touch();
