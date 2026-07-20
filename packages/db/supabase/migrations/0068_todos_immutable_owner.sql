-- 0068 — Durcissement `todos` : propriétaire/auteur immuables + bornes de longueur.
--
-- `profile_id` (porteur de la liste), `created_by` et `created_by_name` restent réécrivables
-- par un UPDATE — dans le périmètre déjà autorisé par la RLS (todos_update, 0067), donc pas
-- une faille d'accès, mais une perte de traçabilité : une tâche peut changer de propriétaire ou
-- d'auteur sans laisser de trace. `todos_touch` (0067) épingle déjà `created_at` de la même
-- façon (silencieusement écrasé par l'ancienne valeur, pas d'erreur levée) : ces trois colonnes
-- suivent exactement le même traitement, l'INSERT n'est pas concerné (`old` n'existe pas).
create or replace function public.todos_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
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

-- Bornes cohérentes avec le schéma Zod (schema.ts) : le formulaire les respecte déjà, ces
-- checks ne visent qu'une insertion SQL directe (Claude, correctif manuel) qui les
-- contournerait sinon — un titre de 100 000 caractères casse l'affichage de la liste/kanban.
alter table public.todos
  add constraint todos_title_length check (char_length(title) <= 200),
  add constraint todos_description_length check (description is null or char_length(description) <= 5000),
  add constraint todos_release_length check (release is null or char_length(release) <= 20);
