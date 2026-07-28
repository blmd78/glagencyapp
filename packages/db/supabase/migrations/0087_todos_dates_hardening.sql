-- 0087 — To-do : durcissement des dates de vie contre l'écriture client.
--
-- Revue de branche finale de `feature/todos-dates` : deux failles dans `todos_touch` (0086),
-- toutes deux dans la même fonction, corrigées ensemble.
--
-- F1 — `done_at` restait forgeable. La règle 0086 était
--   coalesce(case when tg_op = 'UPDATE' then old.done_at end, new.done_at, now())
-- Or `old.done_at` est TOUJOURS null à l'entrée en « done » (le `else null` de la branche
-- précédente l'efface à toute sortie de ce statut) : le deuxième terme, `new.done_at`, passait
-- donc systématiquement — un encadrant pouvait antidater sa date de fin via PostgREST direct et
-- forger un « début → fin · N j » (négatif possible). Fix : on retire `new.done_at` du
-- coalesce, le client ne peut plus jamais fournir cette date. L'import antidaté légitime
-- (Claude, correctif SQL direct) passe désormais par la même procédure que documentée en tête
-- de 0086 : désactiver le trigger le temps du correctif.
--   alter table public.todos disable trigger todos_touch_trg;
--   -- … correction …
--   alter table public.todos enable trigger todos_touch_trg;
--
-- F2 — `started_at` se déclenchait sur TOUTE écriture d'une ligne déjà « En cours », pas
-- seulement à l'entrée réelle dans ce statut. Une tâche d'avant 0086 encore « En cours »
-- (`started_at` null faute de backfill) dont on corrige seulement le titre se voyait fabriquer
-- un chrono ancré sur la date de l'édition, pas sur le vrai début. Fix : la règle ne pose
-- `started_at` que si la ligne ENTRE en « in_progress » (INSERT direct en in_progress, ou
-- UPDATE dont l'ancien statut n'était pas déjà in_progress) — pas sur une réécriture qui laisse
-- le statut inchangé.

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
    -- Sens unique : sortie de « À faire » définitive (0086).
    if old.status <> 'todo' and new.status = 'todo' then
      raise exception 'Une tâche commencée ne revient pas dans « À faire ».';
    end if;
  end if;
  -- started_at : posé seulement à l'ENTRÉE réelle en « En cours » (0087, F2) — INSERT direct
  -- déjà in_progress, ou UPDATE dont l'ancien statut n'était pas in_progress —, puis monotone
  -- (jamais recalculé ni effacé ensuite, y compris quand la ligne est réécrite sans changer de
  -- statut). Jamais fourni par le client.
  new.started_at := coalesce(
    case when tg_op = 'UPDATE' then old.started_at end,
    case
      when new.status = 'in_progress'
       and (tg_op = 'INSERT' or old.status <> 'in_progress')
      then now()
    end
  );
  -- done_at : posé à l'entrée en « done », jamais fourni par le client (0087, F1 — `new.done_at`
  -- retiré du coalesce), effacé à toute sortie de ce statut.
  new.done_at := case
    when new.status = 'done'
      then coalesce(
        case when tg_op = 'UPDATE' then old.done_at end,
        now()
      )
    else null
  end;
  return new;
end;
$$;
