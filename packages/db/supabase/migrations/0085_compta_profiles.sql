-- 0085 — La compta bascule sur `profiles` et devient cloisonnée.
--
-- 1. RE-CLÉAGE. Les tables compta_* étaient clées sur `chatters` (MyPuls) alors que la Police,
--    Membres et le Planning travaillent sur `profiles`. Conséquence mesurée le 2026-07-27 :
--    338 chatteurs MyPuls actifs, dont seulement 72 ont un compte app — la page aurait listé
--    266 personnes sans compte, donc sans sanction possible. On paie les MEMBRES.
--    Les 5 lignes existantes sont vides ou aux valeurs par défaut (donnée de test) : supprimées.
-- 2. `compta_primes.amount` passe de `text` ('100 €') à `numeric` — on ne calcule pas de
--    l'argent en parsant une chaîne.
-- 3. INSTANTANÉ de paiement : le CA est ré-ingéré depuis MyPuls, donc un calcul à la volée
--    verrait un montant DÉJÀ VERSÉ changer rétroactivement. Le détail est figé au paiement.
-- 4. RLS : les policies actuelles donnent la lecture de TOUTE la compta à quiconque a la page.
--    Remplacées par admin = tout, manager/sous-manager = ses rattachés directs.

-- ── 1. Purge + re-cléage ─────────────────────────────────────────────────────────────────

delete from public.compta_payments;
delete from public.compta_day_entries;
delete from public.compta_week_entries;
delete from public.compta_primes;
delete from public.compta_settings;

alter table public.compta_settings     drop constraint compta_settings_chatter_id_fkey;
alter table public.compta_primes       drop constraint compta_primes_chatter_id_fkey;
alter table public.compta_day_entries  drop constraint compta_day_entries_chatter_id_fkey;
alter table public.compta_week_entries drop constraint compta_week_entries_chatter_id_fkey;
alter table public.compta_payments     drop constraint compta_payments_chatter_id_fkey;

alter table public.compta_settings
  add constraint compta_settings_chatter_id_fkey
  foreign key (chatter_id) references public.profiles(id) on delete cascade;
alter table public.compta_primes
  add constraint compta_primes_chatter_id_fkey
  foreign key (chatter_id) references public.profiles(id) on delete cascade;
alter table public.compta_day_entries
  add constraint compta_day_entries_chatter_id_fkey
  foreign key (chatter_id) references public.profiles(id) on delete cascade;
alter table public.compta_week_entries
  add constraint compta_week_entries_chatter_id_fkey
  foreign key (chatter_id) references public.profiles(id) on delete cascade;
alter table public.compta_payments
  add constraint compta_payments_chatter_id_fkey
  foreign key (chatter_id) references public.profiles(id) on delete cascade;

-- ── 2. Prime en numérique ────────────────────────────────────────────────────────────────

alter table public.compta_primes alter column amount drop default;
alter table public.compta_primes
  alter column amount type numeric(10,2) using (nullif(regexp_replace(amount, '[^0-9.]', '', 'g'), '')::numeric);
alter table public.compta_primes alter column amount set default 100;

-- ── 3. Instantané de paiement ────────────────────────────────────────────────────────────
-- `amount` reste le NET versé. Invariant applicatif :
--   amount = base + setter + bonus − malus + handoffs + prime − sanctions

alter table public.compta_payments
  add column if not exists period            smallint not null default 1,
  add column if not exists ca_reference      numeric(10,2) not null default 0,
  add column if not exists mode_applied      text not null default 'percent',
  add column if not exists rate_applied      numeric(5,2) not null default 0,
  add column if not exists base_amount       numeric(10,2) not null default 0,
  add column if not exists setter_amount     numeric(10,2) not null default 0,
  add column if not exists bonus_amount      numeric(10,2) not null default 0,
  add column if not exists malus_amount      numeric(10,2) not null default 0,
  add column if not exists handoffs_amount   numeric(10,2) not null default 0,
  add column if not exists prime_amount      numeric(10,2) not null default 0,
  add column if not exists sanctions_amount  numeric(10,2) not null default 0;

alter table public.compta_payments
  add constraint compta_payments_period_check check (period in (1, 2));
alter table public.compta_payments
  add constraint compta_payments_mode_check check (mode_applied in ('percent', 'fixed'));

-- ── 4. RLS cloisonnée ────────────────────────────────────────────────────────────────────
-- `manages(target)` (0054) = `profiles.manager_id = auth.uid()`. `is_manager()` (0059) couvre
-- manager ET sous-manager. Le chatteur n'a jamais la page : aucune policy ne le mentionne.

drop policy if exists day_entries_admin_all     on public.compta_day_entries;
drop policy if exists day_entries_member_read   on public.compta_day_entries;
drop policy if exists day_entries_member_insert on public.compta_day_entries;
drop policy if exists day_entries_member_update on public.compta_day_entries;
create policy compta_day_entries_scope on public.compta_day_entries for all to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))))
  with check ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));

drop policy if exists compta_week_entries_admin_all on public.compta_week_entries;
drop policy if exists week_entries_member_read      on public.compta_week_entries;
drop policy if exists week_entries_member_insert    on public.compta_week_entries;
drop policy if exists week_entries_member_update    on public.compta_week_entries;
create policy compta_week_entries_scope on public.compta_week_entries for all to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))))
  with check ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));

-- Réglages et primes : lecture pour l'encadrement, écriture admin seule.
drop policy if exists compta_settings_admin_all on public.compta_settings;
create policy compta_settings_read on public.compta_settings for select to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));
create policy compta_settings_admin_write on public.compta_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists compta_primes_admin_all on public.compta_primes;
create policy compta_primes_read on public.compta_primes for select to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));
create policy compta_primes_admin_write on public.compta_primes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Paiements : lecture pour l'encadrement, ÉCRITURE ADMIN SEULE (les virements).
drop policy if exists compta_payments_admin_all on public.compta_payments;
drop policy if exists payments_member_read      on public.compta_payments;
create policy compta_payments_read on public.compta_payments for select to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));
create policy compta_payments_admin_write on public.compta_payments for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
