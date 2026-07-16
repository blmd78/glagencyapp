-- 0022 — Tracker sanctions « Police ». Journal d'avertissements (1 ligne = 1 erreur) + malus
-- MANUELS par chatteur, rattachés chatter_id + occurred_on (repiquables en compta.malus).
-- Droits : saisie/modif = has_page('police') ; suppression = is_admin (cf. 0008/0016).
create table police_entries (
  id            uuid primary key default gen_random_uuid(),
  chatter_id    uuid not null references chatters(id) on delete cascade,
  controller_id uuid references profiles(id) on delete set null,   -- policier connecté (auto)
  occurred_on   date not null default current_date,                -- jour (clé de rattachement compta)
  kind          text not null check (kind in ('warning','malus')),
  error_key     text,                                              -- warning : type d'erreur
  amount_eur    numeric(10,2) not null default 0,                  -- malus : montant décidé à la main
  note          text,                                              -- raison (surtout malus)
  shift         text check (shift in ('matin','aprem','soir')),    -- optionnel
  created_at    timestamptz not null default now(),
  -- un warning porte un error_key et 0 € ; un malus porte un montant.
  check ((kind = 'warning' and error_key is not null and amount_eur = 0)
      or (kind = 'malus' and amount_eur >= 0))
);
create index police_entries_day_idx on police_entries (occurred_on);
create index police_entries_chatter_idx on police_entries (chatter_id, occurred_on);

alter table police_entries enable row level security;
create policy police_read   on police_entries for select to authenticated using (public.has_page('police'));
create policy police_insert on police_entries for insert to authenticated with check (public.has_page('police'));
create policy police_update on police_entries for update to authenticated
  using (public.has_page('police')) with check (public.has_page('police'));
create policy police_delete on police_entries for delete to authenticated using (public.is_admin());
