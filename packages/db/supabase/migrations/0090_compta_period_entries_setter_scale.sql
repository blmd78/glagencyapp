-- 0090 — Le SOCLE du lot final : les lignes de la feuille que l'app ne savait pas porter.
--
-- Inventaire relevé sur la feuille de paie du propriétaire (plan, « Lot final ») : `RESTE SEMAINE
-- PASSEE`, `PRIME TOP3 MOIS`, l'onglet `CLASSEMENT SETTER` (barème TOP15), les soldes des
-- partants, et les rôles `nouveau` / `hybride` de la légende (L96-98 : 🟢 setter, 🔵 closer,
-- 🔴 nouveau, plus « chatteurs hybrides »). Rien ici ne calcule : la formule vit dans
-- `packages/core/src/compta/payslip.ts`, cette migration ne fait que lui donner où se poser.
--
-- MESURES FAITES SUR L'UAT LE 2026-07-28, juste avant d'écrire ce fichier :
--   * `compta_debts` = 0 ligne, et `amount` n'y a AUCUN défaut (le `'100 €'` du plan est celui de
--     `compta_primes`, converti par 0085 — confusion relevée, pas propagée). La conversion
--     ci-dessous est donc un no-op sur l'UAT.
--   * `profiles.closing_role` : contrainte `profiles_closing_role_check`, 1 `setter`, 7 `closer`,
--     107 non renseignés.
-- LA PROD N'A PAS ÉTÉ OUVERTE (consigne : `DATABASE_URL` sans suffixe ne s'ouvre pas). Elle n'a
-- reçu ni 0085…0089 ; `compta_debts` y est annoncée vide par le plan, ce qui reste À REVÉRIFIER
-- avant de pousser — voir le garde de sécurité de la section 3.

-- ── 1. compta_period_entries — la saisie PAR PÉRIODE ─────────────────────────────────────
--
-- POURQUOI UNE TABLE DE PLUS. Les deux montants qui manquent ne sont ni journaliers
-- (`compta_day_entries`, clée par date) ni hebdomadaires (`compta_week_entries`, clée par lundi
-- de semaine) : ils valent pour LA PÉRIODE DE PAIE entière. Les loger dans les semaines est
-- exactement le défaut d'argent corrigé par la tâche 19 (`fixe_setter` : montant par période,
-- champ par semaine, donc affiché deux fois et SOMMÉ — 75 € saisis deux fois versaient 150 €).
-- Un montant par période a besoin d'une clé par période.
--
-- CLÉ PRIMAIRE `(chatter_id, period_start)` — le même patron que ses deux sœurs, au grain près :
--   compta_day_entries  → primary key (chatter_id, date)        [0084]
--   compta_week_entries → primary key (chatter_id, week_start)  [0084]
--   compta_period_entries → primary key (chatter_id, period_start)
-- Une clé technique `id uuid` + un `unique` sur le couple aurait le même effet de bord (l'upsert
-- `on conflict`) en ajoutant une colonne dont personne ne se sert : les trois tables de saisie se
-- lisent et s'écrivent toujours par (qui, quand).
--
-- DEUX COLONNES, UNE TABLE : même clé, même écran, même droit (plan, tâche 21). Les séparer
-- doublerait l'upsert et les policies sans rien distinguer.
create table if not exists public.compta_period_entries (
  chatter_id   uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  -- `RESTE SEMAINE PASSEE` : reliquat reporté de la période précédente. SIGNÉ, volontairement —
  -- un trop-perçu se reporte en négatif, et un `check (>= 0)` obligerait à le contourner par un
  -- malus, qui ne dit pas la même chose sur la fiche.
  carryover    numeric(10,2) not null default 0,
  -- `PRIME TOP3 MOIS` : prime mensuelle MANUELLE (règle inconnue, cf. plan). Une prime négative
  -- ne veut rien dire — et la ligne signée d'à côté (`carryover`) est là pour les corrections :
  -- la distinction devient structurelle plutôt qu'une affaire de discipline.
  top3_prime   numeric(10,2) not null default 0 check (top3_prime >= 0),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id) on delete set null,
  primary key (chatter_id, period_start),
  -- Même contrainte d'alignement que `compta_payments` (0088) et même raison : le découpage EST
  -- une contrainte de données. Sans elle, une ligne posée sur un lundi décalé porterait un report
  -- qu'aucune période affichée ne ramasserait — invisible, et jamais versé.
  constraint compta_period_entries_period_start_aligned
    check (mod(period_start - date '2026-07-06', 14) = 0)
);

-- La page charge UNE période pour TOUS les membres (`where period_start = $1`) : la PK, dont la
-- colonne de tête est `chatter_id`, ne sert pas cette requête. Même raison que
-- `compta_day_entries_date_idx` (0084).
create index if not exists compta_period_entries_period_start_idx
  on public.compta_period_entries (period_start);
create index if not exists compta_period_entries_updated_by_idx
  on public.compta_period_entries (updated_by);

-- ── 2. compta_setter_scale — le barème du TOP15 setter ───────────────────────────────────
--
-- Réglable (« je veux pouvoir le régler ») : les montants vivent en base, pas dans le code. Une
-- constante TypeScript aurait demandé un déploiement pour changer un chiffre, et aurait figé
-- l'historique — le barème de juin ne serait plus lisible après une modification.
--
-- Pas de `chatter_id` : c'est un barème GLOBAL, une grille de 15 tranches. Le classement, lui,
-- est calculé (`rankSetters`, `packages/core/src/compta/setter-rank.ts`) et n'est pas stocké.
create table if not exists public.compta_setter_scale (
  rank       smallint primary key check (rank >= 1),
  amount     numeric(10,2) not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create index if not exists compta_setter_scale_updated_by_idx
  on public.compta_setter_scale (updated_by);

-- Amorce : le barème de JUIN relevé sur l'onglet CLASSEMENT SETTER (plan, tâche 21).
-- `on conflict do nothing` : la migration doit pouvoir être rejouée sans écraser un barème que
-- l'admin aurait déjà retouché. Un `do update` remettrait les valeurs de juin en silence.
insert into public.compta_setter_scale (rank, amount) values
  (1, 200), (2, 175), (3, 165), (4, 140), (5, 130),
  (6, 120), (7, 115), (8, 110), (9, 105), (10, 100),
  (11, 95), (12, 90), (13, 87), (14, 84), (15, 80)
on conflict (rank) do nothing;

-- ── 3. compta_debts — l'argent cesse d'être du texte ─────────────────────────────────────
--
-- `amount` était `text` (0084 le reproduisait fidèlement, avec l'avertissement « si ça doit
-- changer, ce sera une migration de conversion dédiée » — la voici). Valeurs relevées en prod par
-- le plan : `'10$'`, `'43$'`. Calculer de l'argent en parsant une chaîne est une erreur
-- silencieuse qui attend son jour ; `compta_primes.amount` a fait le même chemin en 0085.
--
-- `drop default` d'abord : sans défaut sur l'UAT (mesuré), mais l'ordre est nécessaire si la prod
-- en porte un — Postgres refuse de convertir un type dont le défaut n'est plus assignable.
alter table public.compta_debts alter column amount drop default;

-- LE GARDE DE SÉCURITÉ EST LE `not null` DE LA COLONNE, et il est volontaire : une valeur que
-- l'expression ne sait pas réduire à un nombre donne `null`, ce que la contrainte refuse — la
-- migration ÉCHOUE au lieu de convertir de travers. Sur une table vide (UAT vérifié) l'expression
-- ne s'exécute jamais ; sur une prod qui aurait des lignes, mieux vaut un push en échec qu'un
-- montant faussé sans bruit.
-- La virgule décimale est traduite AVANT le filtrage : sinon `'43,50 €'` deviendrait `4350`.
alter table public.compta_debts
  alter column amount type numeric(10,2)
  using (nullif(regexp_replace(replace(amount, ',', '.'), '[^0-9.-]', '', 'g'), '')::numeric);

-- Aucun défaut réintroduit : une dette n'a pas de montant « habituel » (contrairement à la prime
-- d'embauche, à 100 €). Le saisir est le geste même.
comment on column public.compta_debts.amount is
  'Solde dû, en euros. Était du `text` (« 10$ ») jusqu''à 0090.';

-- Qui a soldé — `on delete set null` comme tous les `updated_by`/`paid_by` de la compta : la
-- trace du solde survit au départ de celui qui l'a posée.
alter table public.compta_debts
  add column if not exists settled_by uuid references public.profiles(id) on delete set null;
create index if not exists compta_debts_settled_by_idx on public.compta_debts (settled_by);

-- ── 4. profiles.closing_role accueille `nouveau` et `hybride` ────────────────────────────
--
-- La légende de la feuille connaît quatre états, pas deux. Élargir un `check` ne peut invalider
-- aucune ligne existante (1 `setter`, 7 `closer`, 107 nulls sur l'UAT).
--
-- ⚠️ TABLE HORS COMPTA — c'est la feature Membres qui écrit cette colonne
-- (`features/members/actions.ts`). Son UI porte une liste FIGÉE à deux valeurs
-- (`CRM_ROLES = ['closer','setter']`, `lib/types/chatters.ts`) : elle ne peut ni produire, ni
-- afficher correctement les deux nouvelles. Rien n'est cassé par cette migration — mais rien ne
-- pourra écrire `'nouveau'` ou `'hybride'` avant que Membres soit élargi. Volontairement NON
-- traité ici (hors périmètre de la tâche 21) ; le détail des trois points de blocage est dans
-- `.superpowers/sdd/2026-07-27-compta-paie/task-21-22-report.md`.
alter table public.profiles drop constraint if exists profiles_closing_role_check;
alter table public.profiles
  add constraint profiles_closing_role_check
  check (closing_role in ('setter', 'closer', 'nouveau', 'hybride'));

-- ── 5. RLS — les régimes existants, reproduits, pas réinventés ───────────────────────────
--
-- `manages(target)` (0054) = `profiles.manager_id = auth.uid()`. `is_manager()` (0059) couvre
-- manager ET sous-manager. Le chatteur n'a jamais la page : aucune policy ne le mentionne.
-- Forme scalarisée `(select f())` : convention posée par 0057 (initplan), tenue depuis.

-- SAISIE → le régime de `compta_week_entries_scope` (0085), au mot près : admin = tout,
-- encadrement = ses rattachés directs, en lecture comme en écriture.
alter table public.compta_period_entries enable row level security;
drop policy if exists compta_period_entries_scope on public.compta_period_entries;
create policy compta_period_entries_scope on public.compta_period_entries for all to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))))
  with check ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));

-- RÉGLAGE → le régime de `compta_settings` (0085) : lecture pour l'encadrement, écriture admin
-- seule. La jambe `manages(chatter_id)` n'a PAS d'équivalent ici — le barème est global, il ne
-- désigne personne ; la restreindre n'aurait rien à restreindre.
--
-- POURQUOI L'ENCADREMENT DOIT LE LIRE. La prime setter est une composante du net. Un manager qui
-- ne verrait pas le barème verrait la prime à 0 € SANS AUCUNE ERREUR, donc un net sous-estimé —
-- c'est mot pour mot le défaut que 0086 a corrigé sur les sanctions Police (spec §6).
alter table public.compta_setter_scale enable row level security;
drop policy if exists compta_setter_scale_read on public.compta_setter_scale;
create policy compta_setter_scale_read on public.compta_setter_scale for select to authenticated
  using ((select public.is_admin()) or (select public.is_manager()));
drop policy if exists compta_setter_scale_admin_write on public.compta_setter_scale;
create policy compta_setter_scale_admin_write on public.compta_setter_scale for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- `compta_debts` : RIEN À FAIRE. `compta_debts_admin_all` (0084) donne déjà tout à l'admin et
-- rien à personne d'autre — exactement la ligne « `compta_debts` | tout | — | — » de la spec §6.
-- La recréer à l'identique n'ajouterait qu'une occasion de la modifier par distraction.
