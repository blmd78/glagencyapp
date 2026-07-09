-- 0032 — Résolution de l'assignation vers NOTRE chatter_id (uuid), pas l'id MyPuls.
-- Constat : chatters.mypuls_user_id est vide (0 match) ; l'app réconcilie ses chatteurs
-- PAR NOM via chatter_alias (comme money-team). Le scrape spenders résout donc
-- assigned_label → chatter_id à l'ingestion et le stocke ici. L'historique d'assignation
-- (0031, basé sur l'id MyPuls inexploitable) est refait sur ce chatter_id.

-- 1. Conversation : chatteur résolu chez nous (null = label MyPuls non rapproché).
alter table spender_conversations
  add column assigned_chatter_id uuid references chatters(id) on delete set null;
create index spender_conversations_chatter_idx on spender_conversations (assigned_chatter_id);

-- 2. Refonte de l'historique sur le chatter_id (l'ancienne table 0031 n'a pas de données utiles).
drop trigger if exists trg_spender_assignment_change on spender_conversations;
drop function if exists log_spender_assignment_change();
drop table if exists spender_assignment_events;

create table spender_assignment_events (
  id              uuid primary key default gen_random_uuid(),
  creator_id      uuid not null references creators(id) on delete cascade,
  fan_id          bigint not null,
  from_chatter_id uuid references chatters(id) on delete set null,  -- null = 1ʳᵉ assignation
  to_chatter_id   uuid references chatters(id) on delete set null,  -- null = désassigné
  changed_at      timestamptz not null default now()
);
create index spender_assignment_events_conv_idx
  on spender_assignment_events (creator_id, fan_id, changed_at desc);

-- Log la transition à l'insert (1ʳᵉ assignation) et au changement de chatteur résolu.
create or replace function log_spender_assignment_change()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_chatter_id is not null then
      insert into spender_assignment_events (creator_id, fan_id, to_chatter_id)
      values (new.creator_id, new.fan_id, new.assigned_chatter_id);
    end if;
  elsif new.assigned_chatter_id is distinct from old.assigned_chatter_id then
    insert into spender_assignment_events (creator_id, fan_id, from_chatter_id, to_chatter_id)
    values (new.creator_id, new.fan_id, old.assigned_chatter_id, new.assigned_chatter_id);
  end if;
  return new;
end;
$$;

create trigger trg_spender_assignment_change
  after insert or update on spender_conversations
  for each row execute function log_spender_assignment_change();

alter table spender_assignment_events enable row level security;
create policy spender_assignment_events_read on spender_assignment_events for select to authenticated
  using (public.has_page('crm-spenders') and (public.is_admin() or creator_id in (
    select creator_id from profile_creators where profile_id = auth.uid())));
