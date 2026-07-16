-- 0031 — Faits spenders (CRM closing, fusion gla-workflow) : transactions par fan
-- (API /team/money, backfill + quotidien) et état des conversations (/chat/init par
-- modèle). Écriture = ingestion service-role uniquement (aucune policy d'écriture).
-- Lecture = page `crm-spenders` + cloisonnement par modèle (profile_creators).

-- Journal de transactions par fan — clé naturelle payment_id (idempotent au re-run).
create table fan_transactions (
  payment_id        bigint primary key,
  occurred_at       timestamptz not null,
  date              date not null,                       -- jour Paris (dérivé de l'ISO local API)
  mypuls_creator_id text not null,
  creator_id        uuid references creators(id) on delete set null,
  fan_id            bigint not null,
  fan_username      text not null,
  amount            numeric(10,2) not null,
  net               numeric(10,2) not null,
  kind              text,
  type              text,
  attributed_mypuls_user_id text,                        -- chatteur attribué (id MyPuls, brut)
  created_at        timestamptz not null default now()
);
create index fan_transactions_fan_idx on fan_transactions (fan_id, occurred_at desc);
create index fan_transactions_creator_day_idx on fan_transactions (creator_id, date);

-- État courant des conversations par (modèle, fan) — upsert à chaque passage du cron.
-- Pas d'historique : la fraîcheur est celle de captured_at.
create table spender_conversations (
  creator_id            uuid not null references creators(id) on delete cascade,
  fan_id                bigint not null,
  username              text not null,
  ca_total              numeric(10,2) not null default 0,
  status                text,                            -- 'Abonné' / 'Ancien abonné' (libellé MyPuls)
  last_message_at       timestamptz,
  last_message_is_mine  boolean,
  has_unread            boolean not null default false,
  assigned_mypuls_user_id text,                          -- assignation MyPuls (assignUser.id)
  assigned_label        text,                            -- assignUser.label (ex. 'Laury')
  captured_at           timestamptz not null,
  primary key (creator_id, fan_id)
);
create index spender_conversations_last_msg_idx on spender_conversations (last_message_at);

alter table fan_transactions enable row level security;
alter table spender_conversations enable row level security;

create policy fan_transactions_read on fan_transactions for select to authenticated
  using (public.has_page('crm-spenders') and (public.is_admin() or creator_id in (
    select creator_id from profile_creators where profile_id = auth.uid())));
create policy spender_conversations_read on spender_conversations for select to authenticated
  using (public.has_page('crm-spenders') and (public.is_admin() or creator_id in (
    select creator_id from profile_creators where profile_id = auth.uid())));
