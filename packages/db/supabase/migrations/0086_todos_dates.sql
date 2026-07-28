-- 0086 — To-do : dates de vie (started_at) + transitions à sens unique + dates non falsifiables.
--
-- Le chrono d'une tâche = son temps en « En cours » (spec 2026-07-28-todos-dates-design) :
-- started_at est posé par le trigger à l'ENTRÉE réelle en « En cours », puis MONOTONE — jamais
-- recalculé ni effacé (rouvrir une tâche terminée reprend le chrono d'origine, et réécrire une
-- ligne sans changer son statut ne fabrique pas de chrono : les tâches d'avant cette migration,
-- sans started_at faute de backfill, restent sans chrono). « À faire » = la tâche est juste
-- posée là : created_at suffit, aucun chrono.
--
-- Anti-triche, deux volets :
-- 1. Une tâche sortie de « À faire » n'y revient JAMAIS (revenir remettrait le chrono à zéro) —
--    l'interdiction couvre aussi « Terminé → À faire », sinon le détour par Terminé rouvrirait
--    la triche. Enforcement DUR ici même (exception levée par le trigger).
-- 2. AUCUNE date de vie n'est écrivable par un client. En particulier done_at : l'ancienne
--    règle (0067) honorait un new.done_at fourni à l'entrée en « done » (old.done_at y est
--    toujours null, le else null l'efface à toute sortie de ce statut) — un encadrant pouvait
--    antidater sa date de fin via PostgREST direct et forger le « début → fin · N j » affiché.
--    Le coalesce ne lit plus new.done_at.
--
-- Un correctif manuel légitime (import antidaté, retour exceptionnel en « À faire ») passe par
-- la désactivation du trigger le temps du fix :
--   alter table public.todos disable trigger todos_touch_trg;
--   -- … correction …
--   alter table public.todos enable trigger todos_touch_trg;
--
-- (Fusion pré-prod des ex-0086/0087 de la branche feature/todos-dates — une seule migration
-- par chantier, même pratique que 0085_compta_paie.)

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
    -- Sens unique : sortie de « À faire » définitive (voir en-tête).
    if old.status <> 'todo' and new.status = 'todo' then
      raise exception 'Une tâche commencée ne revient pas dans « À faire ».';
    end if;
  end if;
  -- started_at : posé seulement à l'ENTRÉE réelle en « En cours » — INSERT direct déjà
  -- in_progress, ou UPDATE dont l'ancien statut n'était pas in_progress —, puis monotone
  -- (jamais recalculé ni effacé ensuite, y compris quand la ligne est réécrite sans changer
  -- de statut). Jamais fourni par le client.
  new.started_at := coalesce(
    case when tg_op = 'UPDATE' then old.started_at end,
    case
      when new.status = 'in_progress'
       and (tg_op = 'INSERT' or old.status <> 'in_progress')
      then now()
    end
  );
  -- done_at : posé à l'entrée en « done », JAMAIS fourni par le client (new.done_at ignoré —
  -- l'ancienne règle 0067 le laissait passer, voir en-tête), effacé à toute sortie de ce statut.
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
