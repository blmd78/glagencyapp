-- 0033 — Historique des (ré)assignations de conversations spenders : 1 ligne par transition
-- chatteur (id MyPuls) datée. Alimenté par TRIGGER sur spender_conversations → robuste quelle
-- que soit la source d'écriture (scan nocturne, correction manuelle). Matière du futur onglet
-- Passation (transitions inter-shift). On ne garde PAS de snapshot quotidien : uniquement les
-- changements (le champ `assigned_mypuls_user_id` de spender_conversations reste l'état courant).
create table spender_assignment_events (
  id                  uuid primary key default gen_random_uuid(),
  creator_id          uuid not null references creators(id) on delete cascade,
  fan_id              bigint not null,
  from_mypuls_user_id text,                 -- chatteur précédent (null = 1ʳᵉ assignation)
  to_mypuls_user_id   text,                 -- nouveau chatteur (null = désassigné)
  changed_at          timestamptz not null default now()
);
create index spender_assignment_events_conv_idx
  on spender_assignment_events (creator_id, fan_id, changed_at desc);

-- Log la transition à l'insert (1ʳᵉ assignation) et à l'update (changement de chatteur).
create or replace function log_spender_assignment_change()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_mypuls_user_id is not null then
      insert into spender_assignment_events (creator_id, fan_id, to_mypuls_user_id)
      values (new.creator_id, new.fan_id, new.assigned_mypuls_user_id);
    end if;
  elsif new.assigned_mypuls_user_id is distinct from old.assigned_mypuls_user_id then
    insert into spender_assignment_events (creator_id, fan_id, from_mypuls_user_id, to_mypuls_user_id)
    values (new.creator_id, new.fan_id, old.assigned_mypuls_user_id, new.assigned_mypuls_user_id);
  end if;
  return new;
end;
$$;

create trigger trg_spender_assignment_change
  after insert or update on spender_conversations
  for each row execute function log_spender_assignment_change();

-- Lecture : même cloisonnement que spender_conversations (crm-spenders + modèle assigné).
-- Écriture = trigger sous service-role (bypass RLS) → aucune policy d'insert nécessaire.
alter table spender_assignment_events enable row level security;
create policy spender_assignment_events_read on spender_assignment_events for select to authenticated
  using (public.has_page('crm-spenders') and (public.is_admin() or creator_id in (
    select creator_id from profile_creators where profile_id = auth.uid())));
