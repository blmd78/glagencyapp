-- 0069 — todos.updated_by : QUI a modifié une tâche, pas seulement QUAND (0067 a updated_at,
-- pas l'auteur du dernier changement). Un admin/manager peut éditer la to-do d'un autre
-- encadrant (todos_update, 0067) : sans cette colonne, on sait quand une tâche a bougé mais
-- jamais qui l'a fait bouger. Convention du reste du projet : toute table qui a `updated_at`
-- a aussi `updated_by` (cf. plannings 0036, rest_planning_cells 0016, script_items 0040).
alter table public.todos
  add column updated_by uuid references public.profiles(id) on delete set null;

-- Toute FK est indexée (convention 0055_fk_indexes.sql, advisor 100 % vert).
create index todos_updated_by_idx on public.todos (updated_by);

-- Remplace todos_touch (0067 + 0068). Posé par le TRIGGER, pas par l'app : Claude écrit dans
-- cette table en SQL direct hors des Server Actions (comme created_by, 0067), et une valeur
-- posée côté serveur depuis l'identité de session ne peut pas être falsifiée par le client
-- (contrairement à un champ rempli par l'application). `auth.uid()` = identité de la session
-- Supabase, même mécanisme que les fonctions RLS du projet (can_manage_planning_of, 0061).
-- Sous le rôle service-role (écritures de Claude), auth.uid() est null : updated_by reste
-- null, comportement voulu — cohérent avec created_by qui vaut alors déjà null (0067, affiché
-- « Claude » côté app).
--
-- À la différence de profile_id/created_by/created_by_name/created_at (0068, épinglés APRÈS
-- la création), updated_by est RECALCULÉ à chaque écriture, INSERT compris : "auteur de la
-- tâche" est immuable, "dernier à l'avoir touchée" doit changer à chaque écriture — y compris
-- la toute première, où updated_by == created_by côté identité.
create or replace function public.todos_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' then
    -- Épinglés : jamais réécrivables, y compris par un admin/manager que la RLS autorise à
    -- éditer la tâche (le droit d'ÉDITER le contenu n'est pas le droit de reparenter/réattribuer).
    new.created_at := old.created_at;
    new.profile_id := old.profile_id;
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
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
