-- 0086 — To-do : date de début (started_at) + transitions à sens unique.
--
-- Le chrono d'une tâche = son temps en « En cours » (spec 2026-07-28-todos-dates-design) :
-- started_at est posé par le trigger à la PREMIÈRE entrée en « En cours », puis MONOTONE —
-- jamais effacé ni réécrit ; rouvrir une tâche terminée reprend le chrono d'origine.
-- « À faire » = la tâche est juste posée là : created_at suffit, aucun chrono.
--
-- Anti-triche : une tâche sortie de « À faire » n'y revient JAMAIS (revenir remettrait le
-- chrono à zéro) — l'interdiction couvre aussi « Terminé → À faire », sinon le détour par
-- Terminé rouvrirait la triche. Enforcement DUR ici même (exception) : un correctif manuel
-- légitime devra désactiver le trigger le temps du fix :
--   alter table public.todos disable trigger todos_touch_trg;
--   -- … correction …
--   alter table public.todos enable trigger todos_touch_trg;

alter table public.todos add column started_at timestamptz;

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
    -- NOUVEAU — sens unique : sortie de « À faire » définitive (0086).
    if old.status <> 'todo' and new.status = 'todo' then
      raise exception 'Une tâche commencée ne revient pas dans « À faire ».';
    end if;
  end if;
  -- NOUVEAU (0086) — started_at : première entrée en « En cours », monotone ensuite. Jamais
  -- fourni par le client (recalculé ici, comme done_at). La branche INSERT est défensive :
  -- l'UI ne crée qu'en « À faire », mais une insertion SQL directe reste cohérente.
  new.started_at := coalesce(
    case when tg_op = 'UPDATE' then old.started_at end,
    case when new.status = 'in_progress' then now() end
  );
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
