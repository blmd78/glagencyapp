-- 0093 — Le TAUX DE COMMISSION devient DATÉ.
--
-- POURQUOI (mesuré le 2026-07-28 sur la feuille de juillet du propriétaire, période
-- 06 → 19/07/2026) : sur les 95 chatteurs portant du CA en semaine 1, **12 changent de taux
-- ENTRE LES DEUX SEMAINES DE LA MÊME PÉRIODE**, toujours à la hausse — Josaphat, JC, Ethane,
-- Salemmontin 10 → 11 % ; kwasi, Alain, Juliot 10,5 → 11 % ; Anja, Matisse, Ange, Big Jo,
-- Patrick 10 → 10,5 %. `compta_settings.rate` ne porte qu'UN taux, appliqué aux 14 jours : il
-- sur-paie la première semaine si on monte le taux avant de payer (+133,58 € sur ces 12 fiches),
-- et sous-paie la seconde si on attend (−190,12 €). C'est de la paie : on historise.

-- ── 1. L'HISTORIQUE ──────────────────────────────────────────────────────────────────────
-- TABLE DÉDIÉE, et non une colonne `effective_from` ajoutée à `compta_settings` : cette
-- dernière porte AUSSI `fixed_amount`, qui n'est PAS daté (un montant par période, changé
-- rarement). Dater la ligne entière obligerait à recopier le fixe à chaque changement de taux
-- et rendrait ambigu « quel fixe s'applique ». Une table par grain de variation.
--
-- Le taux en vigueur un jour J = la ligne la plus récente dont `effective_from <= J`
-- (`rateSpans`, `packages/core/src/compta/rates.ts`).

create table if not exists public.compta_rates (
  chatter_id     uuid not null references public.profiles(id) on delete cascade,
  -- PREMIER jour où ce taux s'applique. INCLUSIF.
  effective_from date not null,
  rate           numeric(5,2) not null check (rate >= 0),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null,
  -- Une seule ligne par (membre, date d'effet) : ré-enregistrer la même date CORRIGE le taux
  -- au lieu d'empiler deux vérités pour le même jour.
  primary key (chatter_id, effective_from)
);

create index if not exists compta_rates_updated_by_idx on public.compta_rates (updated_by);

-- REPRISE DES RÉGLAGES EXISTANTS — sans elle, tout taux déjà posé disparaîtrait et chaque
-- membre retomberait au défaut de 10 %. La date d'effet est un PLANCHER (1970-01-01) et non la
-- date du jour : le taux actuel s'appliquait déjà à TOUTES les périodes passées, et le dater
-- d'aujourd'hui ferait recalculer l'historique à 10 %. Cette migration doit être un no-op sur
-- tout net déjà calculé.
insert into public.compta_rates (chatter_id, effective_from, rate, updated_at, updated_by)
select chatter_id, date '1970-01-01', rate, updated_at, updated_by
from public.compta_settings
on conflict (chatter_id, effective_from) do nothing;

-- UNE SEULE SOURCE DU TAUX. Garder `compta_settings.rate` à côté de l'historique, c'est le
-- défaut d'argent de la tâche 19 (`fixe_setter`, deux points de saisie pour un montant) répété
-- sur le taux. La colonne part ; tout lecteur passe désormais par `compta_rates`.
alter table public.compta_settings drop column if exists rate;

-- ── 2. RLS — MÊME RÉGIME QUE `compta_settings` ───────────────────────────────────────────
-- Recopié de `compta_settings_read` / `compta_settings_admin_write` (0085), relu sur `pg_policy`
-- avant écriture : lecture pour l'admin et pour l'encadrant sur ses rattachés directs, ÉCRITURE
-- ADMIN SEULE. Le taux est une décision de paie.

alter table public.compta_rates enable row level security;

drop policy if exists compta_rates_read on public.compta_rates;
create policy compta_rates_read on public.compta_rates for select to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));

drop policy if exists compta_rates_admin_write on public.compta_rates;
create policy compta_rates_admin_write on public.compta_rates for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ── 3. L'INSTANTANÉ DE PAIEMENT NE PEUT PLUS TENIR DANS UN SEUL TAUX ─────────────────────
-- `compta_payments.rate_applied numeric(5,2)` est la trace de ce qui a été versé. Une période
-- payée à deux taux ne peut pas s'y écrire sans mentir : quel que soit celui qu'on y range, la
-- moitié de la fiche est fausse. Il est remplacé par la SEGMENTATION RÉELLEMENT APPLIQUÉE.
--
-- POURQUOI DU `jsonb` ET NON UNE TABLE FILLE : `recordPayment` écrit le paiement en UN insert.
-- Une table fille imposerait une seconde écriture, sans transaction possible depuis supabase-js
-- (le même trou que la trace `compta_primes`, cf. `record-payment.ts`) — un paiement pourrait
-- exister sans sa trace de taux. Ici l'instantané reste ATOMIQUE avec le paiement.

alter table public.compta_payments add column if not exists rates_applied jsonb;

-- Reprise des paiements déjà enregistrés : leur taux unique devient un segment unique couvrant
-- les jours réellement couverts. Aucune trace n'est perdue, elle change de forme.
update public.compta_payments p
set rates_applied = jsonb_build_array(
  jsonb_build_object(
    'from', to_char(coalesce((select min(d) from unnest(p.covered_days) d), p.period_start), 'YYYY-MM-DD'),
    'to',   to_char(coalesce((select max(d) from unnest(p.covered_days) d), p.period_start + 13), 'YYYY-MM-DD'),
    'rate', p.rate_applied,
    'fallback', false
  )
)
where p.rates_applied is null;

-- AUCUN `default` — la règle de 0085, et elle vaut d'autant plus ici : un défaut rendrait la
-- colonne OPTIONNELLE dans le type `Insert` généré, et un paiement l'omettant écrirait un
-- instantané SANS taux, en silence. Sans défaut, TypeScript l'exige à chaque paiement.
alter table public.compta_payments alter column rates_applied set not null;

alter table public.compta_payments drop constraint if exists compta_payments_rates_applied_check;
alter table public.compta_payments
  add constraint compta_payments_rates_applied_check
  check (jsonb_typeof(rates_applied) = 'array' and jsonb_array_length(rates_applied) >= 1);

alter table public.compta_payments drop column if exists rate_applied;
