-- 0085 — LA PAIE : re-cléage sur `profiles`, périodes de 14 jours, taux daté, instantané de
-- paiement, barème setter, RLS cloisonnée.
--
-- FICHIER FUSIONNÉ (2026-07-28). La construction de la feature a produit onze migrations
-- (0085→0095), appliquées sur l'UAT seulement — avec leurs allers-retours : un `mode` de
-- rémunération ajouté puis supprimé, `month` devenu `period_start`, une table
-- `compta_period_entries` créée puis droppée avec ses concepts (report, prime du mois), le taux
-- déplacé de `compta_settings.rate` vers `compta_rates`. La PROD est restée à 0084 : elle n'a
-- pas à rejouer cette histoire. Ce fichier unique amène une base à l'état 0084 directement à
-- l'état final.
--
-- MÉTHODE (celle de 0084) : le DDL ci-dessous est extrait des catalogues de l'UAT — qui EST à
-- l'état final — le 2026-07-28 (`information_schema.columns`, `pg_constraint`, `pg_indexes`,
-- `pg_policies`, `pg_get_functiondef`, `pg_trigger`), puis VÉRIFIÉ par rejeu complet :
-- 0001→0084 puis ce fichier sur un Postgres 17 jetable, diff des catalogues contre l'UAT à
-- vide sur tout le périmètre compta (+ `police_read_compta` + `profiles_closing_role_check`).
-- Sur l'UAT, l'historique 0086→0095 est marqué « reverted » (`supabase migration repair`) ;
-- son 0085 enregistré correspond à l'ancien fichier, mais l'état final est identique.

-- ── 1. PURGE des lignes de test ──────────────────────────────────────────────────────────
-- Les tables 0084 sont clées sur `chatters` (MyPuls) et leurs lignes (relevé prod du
-- 2026-07-27 : 2 primes, 1 saisie hebdo, réglages aux valeurs par défaut) sont de la donnée de
-- test sans valeur. Le re-cléage du §2 les rendrait de toute façon invalides : les id
-- `chatters` ne sont pas des id `profiles`. `compta_debts`, dont les lignes sont réelles,
-- n'est PAS purgée (convertie au §8).

delete from public.compta_payments;
delete from public.compta_day_entries;
delete from public.compta_week_entries;
delete from public.compta_primes;
delete from public.compta_settings;

-- ── 2. RE-CLÉAGE sur `profiles` ──────────────────────────────────────────────────────────
-- Mesuré le 2026-07-27 : 338 chatteurs MyPuls actifs, dont seulement 72 ont un compte app —
-- clée sur `chatters`, la page aurait listé 266 personnes sans compte, donc sans sanction
-- possible. On paie les MEMBRES : la compta rejoint la Police, Membres et le Planning, qui
-- travaillent sur `profiles`. La colonne garde son nom `chatter_id` (convention de
-- `police_entries`, qui désigne un membre).

alter table public.compta_settings     drop constraint if exists compta_settings_chatter_id_fkey;
alter table public.compta_primes       drop constraint if exists compta_primes_chatter_id_fkey;
alter table public.compta_day_entries  drop constraint if exists compta_day_entries_chatter_id_fkey;
alter table public.compta_week_entries drop constraint if exists compta_week_entries_chatter_id_fkey;
alter table public.compta_payments     drop constraint if exists compta_payments_chatter_id_fkey;

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

-- ── 3. `compta_primes.amount` : text → numeric ───────────────────────────────────────────
-- On ne calcule pas de l'argent en parsant une chaîne. Le défaut `'100 €'` devient `100`.
-- La table vient d'être purgée : l'expression `using` ne convertit aucune ligne en pratique,
-- mais resterait correcte si elle en trouvait.

alter table public.compta_primes alter column amount drop default;
alter table public.compta_primes
  alter column amount type numeric(10,2) using (nullif(regexp_replace(amount, '[^0-9.]', '', 'g'), '')::numeric);
alter table public.compta_primes alter column amount set default 100;

-- ── 4. `compta_settings` se réduit au FIXE ───────────────────────────────────────────────
-- La feuille de paie de juillet du propriétaire (LA référence du modèle) montre que la
-- commission `CA × taux` s'applique à TOUS et que le fixe S'AJOUTE (59 chatteurs sur 95) : le
-- `mode` (`percent`|`fixed`) qui faisait REMPLACER l'un par l'autre venait d'une ancienne
-- branche WIP, pas d'une pratique. `is_setter` dupliquait `profiles.closing_role` — deux
-- sources d'un même fait divergent toujours ; le fixe s'applique dès qu'il est > 0, aucun
-- drapeau ne le commande. `rate` part au §5 (taux daté), APRÈS la reprise.
-- `drop column mode` emporte son `check` de colonne (0084).

alter table public.compta_settings drop column if exists mode;
alter table public.compta_settings drop column if exists is_setter;

comment on column public.compta_settings.fixed_amount is
  'Fixe versé UNE FOIS PAR PÉRIODE de paie, qui S''AJOUTE à la commission. S''applique dès qu''il est > 0 — aucun drapeau ne le commande. Une saisie compta_week_entries.fixe_setter non nulle le remplace pour cette période.';

-- ── 5. `compta_rates` — le taux de commission est DATÉ ───────────────────────────────────
-- Mesuré sur la feuille de juillet : 12 chatteurs sur 95 changent de taux ENTRE les deux
-- semaines de la même période. Un taux unique sur-paie la première semaine ou sous-paie la
-- seconde. TABLE DÉDIÉE, et non `effective_from` sur `compta_settings` : le fixe, lui, n'est
-- pas daté — un grain de variation par table. Le taux en vigueur un jour J = la ligne la plus
-- récente dont `effective_from <= J` (`rateSpans`, packages/core). PK (chatter_id,
-- effective_from) : ré-enregistrer la même date CORRIGE le taux au lieu d'empiler deux vérités.

create table if not exists public.compta_rates (
  chatter_id     uuid not null references public.profiles(id) on delete cascade,
  -- PREMIER jour où ce taux s'applique. INCLUSIF.
  effective_from date not null,
  rate           numeric(5,2) not null check (rate >= 0),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null,
  primary key (chatter_id, effective_from)
);

create index if not exists compta_rates_updated_by_idx on public.compta_rates (updated_by);

-- REPRISE des réglages existants, à une date PLANCHER (1970-01-01) et non la date du jour : le
-- taux actuel s'appliquait déjà à toutes les périodes passées, le dater d'aujourd'hui ferait
-- recalculer l'historique au défaut de 10 %. Après la purge du §1 c'est un no-op structurel —
-- gardé parce que c'est LE geste qui rend le `drop column` sûr, quel que soit l'état de la
-- table au moment du push.
insert into public.compta_rates (chatter_id, effective_from, rate, updated_at, updated_by)
select chatter_id, date '1970-01-01', rate, updated_at, updated_by
from public.compta_settings
on conflict (chatter_id, effective_from) do nothing;

-- UNE SEULE SOURCE DU TAUX : garder `compta_settings.rate` à côté de l'historique, c'est deux
-- points de saisie pour un même nombre — ils finiraient par diverger. Tout lecteur passe par
-- `compta_rates`.
alter table public.compta_settings drop column if exists rate;

-- ── 6. `compta_payments` — périodes de 14 jours + INSTANTANÉ de paiement ─────────────────
-- La feuille du propriétaire paie des blocs de DEUX SEMAINES pleines calées sur les lundis
-- (S1 = 06→12/07, S2 = 13→19/07, l'onglet « juillet » court du 06/07 au 02/08), pas des
-- quinzaines calendaires 1–15 / 16–fin. `month` était donc un mensonge — la période du
-- 20/07/2026 finit le 02/08, elle ne se rattache à aucun mois. Renommée vers son vrai contenu ;
-- l'index suit sa colonne.

alter table public.compta_payments rename column month to period_start;
alter index if exists public.compta_payments_month_idx rename to compta_payments_period_start_idx;

-- Le découpage EST une contrainte de données, pas seulement une convention applicative : une
-- période démarre un lundi M tel que (M − 2026-07-06) mod 14 = 0 (ancre relevée sur la
-- feuille). Sans ce check, un paiement posé à la main sur une date décalée créerait des
-- périodes qui se chevauchent — et la couverture (`covered_days`) comme le bandeau de retard
-- deviendraient incohérents en silence. `mod` suit le signe du dividende en Postgres, mais
-- vaut bien 0 sur toute date alignée, avant comme après l'ancre.
alter table public.compta_payments drop constraint if exists compta_payments_period_start_aligned;
alter table public.compta_payments
  add constraint compta_payments_period_start_aligned
  check (mod(period_start - date '2026-07-06', 14) = 0);

-- L'INSTANTANÉ. Le CA est ré-ingéré depuis MyPuls : un calcul à la volée verrait un montant
-- DÉJÀ VERSÉ changer rétroactivement. Le détail est figé au paiement. `amount` reste le NET
-- versé ; invariant applicatif (vérifié par le `superRefine` de `payInput` et le recalcul
-- serveur de `payPeriod`) :
--   amount = base + setter + bonus − malus + handoffs + prime − sanctions + setter_prime
--
-- AUCUN `default` — volontaire, arbitré le 2026-07-27. Un défaut rendrait ces colonnes
-- OPTIONNELLES dans le type `Insert` généré : un enregistrement de paiement omettant
-- `sanctions_amount` compilerait et écrirait 0 €, faisant disparaître une retenue sans bruit.
-- Sans défaut, TypeScript exige toutes les composantes à chaque paiement. La table est purgée
-- au §1 : aucune ligne existante à remplir, le `not null` sans défaut passe.
alter table public.compta_payments
  add column if not exists ca_reference        numeric(10,2) not null,
  add column if not exists base_amount         numeric(10,2) not null,
  add column if not exists setter_amount       numeric(10,2) not null,
  add column if not exists bonus_amount        numeric(10,2) not null,
  add column if not exists malus_amount        numeric(10,2) not null,
  add column if not exists handoffs_amount     numeric(10,2) not null,
  add column if not exists prime_amount        numeric(10,2) not null,
  add column if not exists sanctions_amount    numeric(10,2) not null,
  -- Prime du classement setter (TOP15, §7) — FIGÉE parce que le classement se recalcule à
  -- chaque rendu depuis les handoffs saisis, corrigeables après coup : le rang d'un membre
  -- déjà payé changerait sa prime rétroactivement.
  add column if not exists setter_prime_amount numeric(10,2) not null,
  -- La segmentation de taux réellement appliquée : `[{from, to, rate, fallback}, …]`. Un
  -- unique `rate_applied` ne peut pas dire vrai sur une période payée à deux taux. Du `jsonb`
  -- et non une table fille : `recordPayment` écrit le paiement en UN insert (pas de
  -- transaction multi-écritures depuis supabase-js) — l'instantané reste ATOMIQUE avec le
  -- paiement.
  add column if not exists rates_applied       jsonb not null;

comment on column public.compta_payments.setter_prime_amount is
  'Prime du classement setter (TOP15), figée au virement — le rang, lui, se recalcule.';

-- `[]` est LÉGITIME quand il n'y a rien à commissionner : un membre sans aucun CA sur la
-- période mais qui touche une prime, un bonus ou un fixe (spec §10). Ce que la contrainte
-- interdit vraiment : une COMMISSION versée sans trace du taux qui l'a produite.
alter table public.compta_payments drop constraint if exists compta_payments_rates_applied_check;
alter table public.compta_payments
  add constraint compta_payments_rates_applied_check
  check (
    jsonb_typeof(rates_applied) = 'array'
    and (base_amount = 0 or jsonb_array_length(rates_applied) >= 1)
  );

-- UN JOUR NE PEUT ÊTRE PAYÉ QU'UNE FOIS PAR CHATTEUR. Le vrai invariant est le
-- non-chevauchement des jours couverts, pas l'unicité de la période — les paiements PARTIELS
-- sont un cas nominal (spec §3 et §10). Le verrou consultatif est ce qui rend la garde
-- réellement atomique : un simple `exists` en READ COMMITTED ne verrouille rien, deux
-- insertions concurrentes le passeraient toutes les deux ; sérialiser par chatteur suffit.
-- `security definer` : la fonction doit voir TOUS les paiements du chatteur visé — si
-- l'écriture s'ouvrait un jour à l'encadrement, une vérification soumise à la RLS deviendrait
-- silencieusement partielle, et un jour serait payé deux fois sans erreur. Elle ne fait que
-- lire et lever : rien à détourner.
create or replace function public.compta_payment_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.chatter_id::text));

  if exists (
    select 1 from public.compta_payments p
     where p.chatter_id = new.chatter_id
       and p.id <> new.id
       and p.covered_days && new.covered_days
  ) then
    -- 23505 (unique_violation) et non une erreur générique : `payFortnight` la traduit déjà en
    -- message métier, et c'est bien une violation d'unicité au sens fonctionnel.
    raise exception 'Un paiement couvre déjà au moins un de ces jours pour ce chatteur'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists compta_payment_no_overlap on public.compta_payments;
create trigger compta_payment_no_overlap
  before insert or update of covered_days, chatter_id on public.compta_payments
  for each row
  when (new.covered_days is not null)
  execute function public.compta_payment_no_overlap();

-- ── 7. `compta_setter_scale` — le barème du TOP15 setter ─────────────────────────────────
-- Réglable (« je veux pouvoir le régler ») : les montants vivent en base, pas dans le code —
-- une constante TypeScript aurait demandé un déploiement pour changer un chiffre. Pas de
-- `chatter_id` : barème GLOBAL de 15 tranches ; le classement, lui, est calculé
-- (`rankSetters`, packages/core) et n'est pas stocké.

create table if not exists public.compta_setter_scale (
  rank       smallint primary key check (rank >= 1),
  amount     numeric(10,2) not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create index if not exists compta_setter_scale_updated_by_idx
  on public.compta_setter_scale (updated_by);

-- Amorce : le barème de JUIN relevé sur l'onglet CLASSEMENT SETTER de la feuille.
-- `on conflict do nothing` : rejouable sans écraser un barème que l'admin aurait retouché.
insert into public.compta_setter_scale (rank, amount) values
  (1, 200), (2, 175), (3, 165), (4, 140), (5, 130),
  (6, 120), (7, 115), (8, 110), (9, 105), (10, 100),
  (11, 95), (12, 90), (13, 87), (14, 84), (15, 80)
on conflict (rank) do nothing;

-- ── 8. `compta_debts` — l'argent cesse d'être du texte ───────────────────────────────────
-- Valeurs relevées en prod : '10$', '43$'. Même chemin que `compta_primes` (§3), mais SANS
-- purge : ces lignes sont réelles, elles sont converties. LE GARDE DE SÉCURITÉ EST LE
-- `not null` DE LA COLONNE : une valeur que l'expression ne sait pas réduire à un nombre donne
-- `null`, la migration ÉCHOUE au lieu de convertir de travers. La virgule décimale est
-- traduite AVANT le filtrage (sinon '43,50 €' deviendrait 4350). `drop default` d'abord :
-- nécessaire si la base en porte un — Postgres refuse de convertir un type dont le défaut
-- n'est plus assignable. Aucun défaut réintroduit : une dette n'a pas de montant « habituel »
-- (contrairement à la prime d'embauche, à 100 €), le saisir est le geste même.

alter table public.compta_debts alter column amount drop default;
alter table public.compta_debts
  alter column amount type numeric(10,2)
  using (nullif(regexp_replace(replace(amount, ',', '.'), '[^0-9.-]', '', 'g'), '')::numeric);

comment on column public.compta_debts.amount is
  'Solde dû, en euros. Était du `text` (« 10$ ») jusqu''à 0085.';

-- Qui a soldé — `on delete set null` comme tous les `updated_by`/`paid_by` de la compta : la
-- trace du solde survit au départ de celui qui l'a posée.
alter table public.compta_debts
  add column if not exists settled_by uuid references public.profiles(id) on delete set null;
create index if not exists compta_debts_settled_by_idx on public.compta_debts (settled_by);

-- ── 9. `profiles.closing_role` accueille `nouveau` et `hybride` ──────────────────────────
-- La légende de la feuille connaît quatre états, pas deux (0077). Élargir un `check` ne peut
-- invalider aucune ligne existante. ⚠️ Table HORS compta — c'est Membres qui écrit cette
-- colonne ; `CRM_ROLES` côté app est passé à quatre valeurs en même temps.

alter table public.profiles drop constraint if exists profiles_closing_role_check;
alter table public.profiles
  add constraint profiles_closing_role_check
  check (closing_role in ('setter', 'closer', 'nouveau', 'hybride'));

-- ── 10. RLS — la compta devient CLOISONNÉE ───────────────────────────────────────────────
-- Les policies 0084 donnaient la lecture de TOUTE la compta à quiconque a la page `compta`.
-- Remplacées : admin = tout ; manager/sous-manager = ses rattachés directs. `manages(target)`
-- (0054) = `profiles.manager_id = auth.uid()` ; `is_manager()` (0059) couvre manager ET
-- sous-manager. Le chatteur n'a jamais la page : aucune policy ne le mentionne. Forme
-- scalarisée `(select f())` : convention posée par 0057 (initplan). `compta_debts_admin_all`
-- (0084) reste telle quelle — déjà admin-only, exactement le régime voulu.

-- Saisies jour/semaine : admin = tout, encadrement = ses rattachés, lecture ET écriture.
drop policy if exists day_entries_admin_all     on public.compta_day_entries;
drop policy if exists day_entries_member_read   on public.compta_day_entries;
drop policy if exists day_entries_member_insert on public.compta_day_entries;
drop policy if exists day_entries_member_update on public.compta_day_entries;
drop policy if exists compta_day_entries_scope  on public.compta_day_entries;
create policy compta_day_entries_scope on public.compta_day_entries for all to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))))
  with check ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));

drop policy if exists compta_week_entries_admin_all on public.compta_week_entries;
drop policy if exists week_entries_member_read      on public.compta_week_entries;
drop policy if exists week_entries_member_insert    on public.compta_week_entries;
drop policy if exists week_entries_member_update    on public.compta_week_entries;
drop policy if exists compta_week_entries_scope     on public.compta_week_entries;
create policy compta_week_entries_scope on public.compta_week_entries for all to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))))
  with check ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));

-- Réglages, taux, primes : lecture pour l'encadrement, ÉCRITURE ADMIN SEULE (décisions de paie).
drop policy if exists compta_settings_admin_all on public.compta_settings;
drop policy if exists compta_settings_read      on public.compta_settings;
create policy compta_settings_read on public.compta_settings for select to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));
drop policy if exists compta_settings_admin_write on public.compta_settings;
create policy compta_settings_admin_write on public.compta_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.compta_rates enable row level security;
drop policy if exists compta_rates_read on public.compta_rates;
create policy compta_rates_read on public.compta_rates for select to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));
drop policy if exists compta_rates_admin_write on public.compta_rates;
create policy compta_rates_admin_write on public.compta_rates for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists compta_primes_admin_all on public.compta_primes;
drop policy if exists compta_primes_read      on public.compta_primes;
create policy compta_primes_read on public.compta_primes for select to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));
drop policy if exists compta_primes_admin_write on public.compta_primes;
create policy compta_primes_admin_write on public.compta_primes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Paiements : lecture pour l'encadrement, ÉCRITURE ADMIN SEULE (les virements).
drop policy if exists compta_payments_admin_all on public.compta_payments;
drop policy if exists payments_member_read      on public.compta_payments;
drop policy if exists compta_payments_read      on public.compta_payments;
create policy compta_payments_read on public.compta_payments for select to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));
drop policy if exists compta_payments_admin_write on public.compta_payments;
create policy compta_payments_admin_write on public.compta_payments for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Barème setter : lecture pour TOUT l'encadrement, écriture admin seule. La jambe
-- `manages(chatter_id)` n'a pas d'équivalent ici — le barème est global, il ne désigne
-- personne. Et l'encadrement DOIT le lire : la prime setter est une composante du net ; un
-- manager qui ne verrait pas le barème verrait cette prime à 0 € SANS AUCUNE ERREUR — le même
-- défaut que celui corrigé sur les sanctions Police au §11.
alter table public.compta_setter_scale enable row level security;
drop policy if exists compta_setter_scale_read on public.compta_setter_scale;
create policy compta_setter_scale_read on public.compta_setter_scale for select to authenticated
  using ((select public.is_admin()) or (select public.is_manager()));
drop policy if exists compta_setter_scale_admin_write on public.compta_setter_scale;
create policy compta_setter_scale_admin_write on public.compta_setter_scale for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ── 11. La compta lit les sanctions de SES rattachés, sans le droit de page `police` ─────
-- `police_entries` n'est lisible qu'avec `has_page('police')` (0078), droit qui donne accès à
-- TOUTES les sanctions, non cloisonnées. Des sous-managers portent `compta` sans `police` :
-- leur fiche de paie affichait 0 € de sanctions SANS erreur — la requête RLS ne lève pas, elle
-- renvoie zéro ligne — donc un net surestimé et une retenue disparue en silence. Policy
-- ADDITIONNELLE (les policies permissives se cumulent en OR) : `police_read` n'est pas
-- touchée, la page Police garde son comportement exact. Ici l'accès est CLOISONNÉ aux
-- rattachés directs, contrairement à la page Police qui est volontairement globale depuis 0078.

drop policy if exists police_read_compta on public.police_entries;
create policy police_read_compta on public.police_entries for select to authenticated
  using (
    (select public.has_page('compta'))
    and (
      (select public.is_admin())
      or ((select public.is_manager()) and (select public.manages(chatter_id)))
    )
  );
