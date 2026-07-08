-- 0021 — Paiements du staff marketing (page Compta du pôle, même logique que la compta
-- chatteurs : paye théorique calculée ↔ paiements enregistrés ↔ reste à payer).
-- Un paiement est rattaché à un MOIS (les payes staff sont mensuelles).

create table mkt_staff_payments (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references mkt_staff(id) on delete cascade,
  month      date not null,                       -- 1er jour du mois payé (YYYY-MM-01)
  amount_eur numeric(10,2) not null check (amount_eur > 0),
  method     text not null default 'virement',
  note       text not null default '',
  paid_at    timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null
);
create index mkt_staff_payments_staff_idx on mkt_staff_payments (staff_id, month);

alter table mkt_staff_payments enable row level security;
create policy mkt_staff_payments_all on mkt_staff_payments for all to authenticated
  using (public.has_page('marketing')) with check (public.has_page('marketing'));
