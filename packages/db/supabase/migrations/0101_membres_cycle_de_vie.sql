-- 0101 — CYCLE DE VIE D'UN MEMBRE : nouvel arrivant, sortie, historique, turnover.
--
-- Fusion des dix migrations 0101→0110 du chantier (2026-07-30 → 08-03), écrites au fil de
-- l'itération et regroupées avant tout déploiement : aucune n'est jamais partie en prod, et dix
-- fichiers pour une seule feature auraient raconté nos hésitations plutôt que le schéma.
--
-- ENTIÈREMENT IDEMPOTENTE (`if not exists`, `or replace`, `drop … if exists` avant chaque
-- `create`) : elle se rejoue sans effet de bord, ce qui a permis de la reposer sur une préprod qui
-- portait déjà l'état final.
--
-- ── CE QU'ELLE RÉPARE ───────────────────────────────────────────────────────────────────────
-- Avant elle, `profiles_id_fkey` en ON DELETE CASCADE faisait qu'un membre supprimé emportait son
-- profil : nom, rôle, modèles, tout. Aucune trace ne restait qu'une personne ait travaillé ici,
-- donc aucun turnover mesurable. Et chaque écriture sur `profiles` écrasait la précédente sans
-- rien conserver — changer un shift détruisait l'ancien.

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 1. NOUVEL ARRIVANT — un drapeau MANUEL et sa date d'arrivée réelle
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- POURQUOI MANUEL : `created_at` ne dit pas quand la personne est arrivée dans l'agence — un
-- chatteur peut être créé tardivement dans le CRM alors qu'il travaille depuis deux mois, ou
-- l'inverse. Dériver le badge de la date de création aurait affiché « nouveau » à des anciens.
--
-- POURQUOI DEUX COLONNES : décocher le drapeau ne doit pas effacer la date d'arrivée, qui est la
-- donnée d'entrée du calcul d'ancienneté. Une colonne unique la détruirait à chaque décochage.
alter table profiles
  add column if not exists arrived_at date,
  add column if not exists is_new boolean not null default false;

comment on column profiles.arrived_at is
  'Date d''arrivée RÉELLE dans l''agence (saisie à la main). Conservée même après retrait du drapeau is_new — base du calcul d''ancienneté/turnover.';
comment on column profiles.is_new is
  'Drapeau manuel « nouvel arrivant ». Chatteurs uniquement côté app. Au-delà de 30 jours, l''UI réclame son retrait.';

-- Un drapeau sans date s'afficherait « nouveau depuis on ne sait quand », donc nouveau pour
-- toujours, et le rappel de retrait ne pourrait jamais se déclencher.
alter table profiles drop constraint if exists profiles_is_new_needs_arrived_at;
alter table profiles add constraint profiles_is_new_needs_arrived_at
  check (not is_new or arrived_at is not null);

create index if not exists profiles_is_new_idx on profiles (is_new) where is_new;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 2. SORTIE — on désactive, on ne détruit plus
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Le membre parti GARDE son rôle et ses `profile_creators` : le rôle porte la statistique
-- (« 4 chatteurs et 1 manager sont partis en août »), les assignations racontent ce qui était vrai
-- quand il était là. La DÉSACTIVATION elle-même n'est pas ici : elle se fait côté GoTrue
-- (`ban_duration`, Server Action), qui invalide session, API et RLS ensemble.
alter table profiles
  add column if not exists left_at     date,
  add column if not exists left_reason text
    check (left_reason is null or left_reason in
      ('vire', 'demission', 'fin_essai', 'abandon', 'autre')),
  add column if not exists left_note   text,
  add column if not exists left_by     uuid references profiles(id) on delete set null;

comment on column profiles.left_at is
  'Date de sortie de l''agence. Null = membre en poste. Le compte auth est banni en parallèle, jamais supprimé.';
comment on column profiles.left_reason is
  'Motif : vire | demission | fin_essai | abandon | autre. « abandon » (part sans prévenir) n''est ni un renvoi ni une démission — fréquent en agence, il ne se compte pas pareil.';
comment on column profiles.left_note is
  'Commentaire libre sur le départ. Lisible en relecture, inutilisable en statistique — c''est `left_reason` qui compte.';
comment on column profiles.left_by is
  'Profil qui a acté le départ. on delete set null : si cet encadrant part à son tour, le départ enregistré survit.';

-- Les détails n'ont de sens qu'avec une date : un motif seul décrirait un départ qui n'a pas eu lieu.
alter table profiles drop constraint if exists profiles_left_fields_need_left_at;
alter table profiles add constraint profiles_left_fields_need_left_at
  check (left_at is not null or (left_reason is null and left_note is null and left_by is null));

-- Et une sortie DOIT porter un motif : sans lui le taux se calcule mais ne s'interprète pas
-- (subi ou choisi ? c'est toute la question qu'on pose au turnover).
alter table profiles drop constraint if exists profiles_left_needs_reason;
alter table profiles add constraint profiles_left_needs_reason
  check (left_at is null or left_reason is not null);

create index if not exists profiles_left_at_idx on profiles (left_at) where left_at is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 3. L'ACTEUR D'UNE ÉCRITURE
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- `auth.uid()` suffirait si toutes les écritures venaient d'un client authentifié. Ce n'est pas le
-- cas : la page Membres écrit en SERVICE ROLE (auth.admin.* exige la clé secrète), où `auth.uid()`
-- est NULL. Les RPC du board Organisation, elles, passent par le client authentifié.
alter table profiles add column if not exists updated_by uuid references profiles(id) on delete set null;
comment on column profiles.updated_by is
  'Dernier profil ayant modifié cette ligne depuis l''app. Sert au trigger d''historique quand l''écriture passe par le service role, où auth.uid() est null.';

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 4. HISTORIQUE — une ligne par changement, posée par TRIGGER
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- POURQUOI UN TRIGGER ET PAS UN LOG APPLICATIF : shift et modèles s'écrivent depuis QUATRE
-- sources — le dialog Membres (service-role), les RPC du board Organisation, le planning Repos, et
-- les requêtes SQL directes. Un log dans les Server Actions en raterait la moitié. Même patron que
-- `spender_assignment_events` (0033) : « robuste quelle que soit la source d'écriture ».
--
-- GÉNÉRIQUE (`kind` + from/to) plutôt qu'une colonne par type : une timeline se rend de la même
-- façon quel que soit le changement, et un nouveau type n'imposera pas de migration de schéma.
-- VALEURS EN TEXTE LISIBLE (nom du modèle, 'matin') et pas des UUID : un historique doit rester
-- lisible après la suppression du modèle ou du manager auquel il fait référence.
--
-- `kind` et non `type` : `police_entries`, `script_items` et `fan_transactions` utilisent déjà
-- `kind`. L'historique DÉMARRE VIDE — le passé n'est pas reconstituable.
create table if not exists public.member_events (
  id         bigserial primary key,
  -- CASCADE : si un compte est vraiment supprimé (corbeille admin, réservée aux comptes créés par
  -- erreur), son historique part avec — il n'a jamais existé.
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- L'auteur peut partir ; le changement reste.
  created_by uuid references profiles(id) on delete set null,
  kind       text not null,
  from_value text,
  to_value   text
);

comment on table public.member_events is
  'Historique des changements d''un membre. Alimentée EXCLUSIVEMENT par trigger — n''écrire jamais depuis l''app, la table ne vaut que si elle est exhaustive.';
comment on column public.member_events.created_at is
  'Quand le changement a eu lieu — c''est-à-dire quand le trigger a écrit cette ligne.';
comment on column public.member_events.created_by is
  'Qui a fait le changement. Null = écriture hors app (SQL direct) → l''écran affiche « système », jamais « inconnu ».';

alter table public.member_events drop constraint if exists member_events_kind_check;
alter table public.member_events add constraint member_events_kind_check
  check (kind in ('creation','role','shift','closing','modele','manager','pages','nouveau',
                  'arrivee','sortie','lien','identite'));

create index if not exists member_events_profile_idx on public.member_events (profile_id, created_at desc);
create index if not exists member_events_created_at_idx on public.member_events (created_at desc);

-- ── Trigger sur `profiles` ──────────────────────────────────────────────────────────────────
-- UN SEUL trigger qui compare colonne par colonne et insère 0 à n lignes. `is distinct from`
-- partout : un enregistrement du dialog qui ne change rien ne doit RIEN écrire, sinon la timeline
-- se remplit de bruit et devient inutilisable.
--
-- HORS CHAMP, volontairement : `id`, `created_at`, `created_by` (immuables) et `updated_by`, qui
-- change à CHAQUE écriture par construction — la tracer produirait une ligne d'historique par
-- ligne d'historique. `left_note` non plus : jamais écrite seule, elle accompagne `left_at` qui
-- produit déjà l'événement.
create or replace function public.log_member_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_from  text;
  v_to    text;
begin
  if tg_op = 'INSERT' then
    insert into member_events (profile_id, created_by, kind, to_value)
    values (new.id, new.created_by, 'creation', new.role);
    return new;
  end if;

  -- L'acteur applicatif prime quand il existe (RPC sous client authentifié) ; sinon la colonne
  -- posée par l'action (chemin service-role).
  v_actor := coalesce(auth.uid(), new.updated_by);

  if new.role is distinct from old.role then
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (new.id, v_actor, 'role', old.role, new.role);
  end if;

  if new.shift is distinct from old.shift then
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (new.id, v_actor, 'shift', old.shift, new.shift);
  end if;

  -- Closing = rôle + équipe sur UNE ligne : ils se lisent ensemble et changent souvent ensemble ;
  -- deux lignes pour un même geste alourdiraient la timeline sans rien apprendre.
  if new.closing_role is distinct from old.closing_role
     or new.closing_team is distinct from old.closing_team then
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (
      new.id, v_actor, 'closing',
      nullif(concat_ws(' / ', old.closing_role, old.closing_team), ''),
      nullif(concat_ws(' / ', new.closing_role, new.closing_team), '')
    );
  end if;

  if new.manager_ids is distinct from old.manager_ids then
    -- Les NOMS, pas les uuid : l'historique doit rester lisible si le manager part.
    select string_agg(display_name, ', ' order by display_name) into v_from
      from profiles where id = any(coalesce(old.manager_ids, '{}'));
    select string_agg(display_name, ', ' order by display_name) into v_to
      from profiles where id = any(coalesce(new.manager_ids, '{}'));
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (new.id, v_actor, 'manager', v_from, v_to);
  end if;

  -- PAGES : on note QUE ça a changé et COMBIEN il y en a, pas lesquelles — la liste complète
  -- serait illisible dans une timeline, et le droit courant est visible dans le dialog.
  if new.pages is distinct from old.pages then
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (
      new.id, v_actor, 'pages',
      coalesce(array_length(old.pages, 1), 0)::text,
      coalesce(array_length(new.pages, 1), 0)::text
    );
  end if;

  if new.is_new is distinct from old.is_new then
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (new.id, v_actor, 'nouveau', old.is_new::text, new.is_new::text);
  end if;

  if new.arrived_at is distinct from old.arrived_at then
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (new.id, v_actor, 'arrivee', old.arrived_at::text, new.arrived_at::text);
  end if;

  if new.left_at is distinct from old.left_at then
    -- L'acteur d'une sortie est déjà nommé par `left_by` : on le préfère à v_actor.
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (
      new.id, coalesce(new.left_by, v_actor), 'sortie',
      old.left_at::text,
      case when new.left_at is null then null
           else concat(new.left_at::text, ' (', coalesce(new.left_reason, '?'), ')') end
    );
  end if;

  -- LE LIEN MyPuls, résolu en NOM de fiche : c'est lui qui décide de quel CA est attribué au
  -- membre, donc de ce qu'il est payé. Le relier ailleurs changeait sa rémunération sans trace.
  if new.chatter_id is distinct from old.chatter_id then
    select display_name into v_from from chatters where id = old.chatter_id;
    select display_name into v_to from chatters where id = new.chatter_id;
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (new.id, v_actor, 'lien', v_from, v_to);
  end if;

  -- IDENTITÉ : nom, email et lien de travail. Groupés sous un seul `kind` — ils décrivent la même
  -- chose (la fiche de la personne) ; trois kinds séparés auraient allongé la légende sans rien
  -- apprendre. Une ligne par champ modifié, pour que le « avant → après » reste lisible.
  if new.display_name is distinct from old.display_name then
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (new.id, v_actor, 'identite', old.display_name, new.display_name);
  end if;

  if new.email is distinct from old.email then
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (new.id, v_actor, 'identite', old.email, new.email);
  end if;

  if new.work_link is distinct from old.work_link then
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (new.id, v_actor, 'identite', nullif(old.work_link, ''), nullif(new.work_link, ''));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_member_changes on profiles;
create trigger trg_log_member_changes
  after insert or update on profiles
  for each row execute function public.log_member_changes();

-- ── Trigger sur `profile_creators` (les modèles) ────────────────────────────────────────────
-- L'ASTUCE DE L'ACTEUR : cette table n'a pas de colonne d'auteur, et les assignations posées
-- depuis Membres passent par le service role (auth.uid() null). On lit donc `profiles.updated_by`
-- du membre concerné — VALIDE parce que `updateMember` écrit le profil AVANT les assignations.
-- Sans ça, tout changement de modèle fait depuis Membres serait attribué à « système ».
create or replace function public.log_member_model_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := coalesce(new.profile_id, old.profile_id);
  v_creator uuid := coalesce(new.creator_id, old.creator_id);
  v_actor   uuid;
  v_name    text;
begin
  select coalesce(auth.uid(), p.updated_by) into v_actor from profiles p where p.id = v_profile;
  select name into v_name from creators where id = v_creator;

  if tg_op = 'INSERT' then
    insert into member_events (profile_id, created_by, kind, to_value)
    values (v_profile, v_actor, 'modele', coalesce(v_name, '?'));
  else
    insert into member_events (profile_id, created_by, kind, from_value)
    values (v_profile, v_actor, 'modele', coalesce(v_name, '?'));
  end if;
  return null; -- AFTER trigger : la valeur de retour est ignorée.
end;
$$;

drop trigger if exists trg_log_member_model_changes on profile_creators;
create trigger trg_log_member_model_changes
  after insert or delete on profile_creators
  for each row execute function public.log_member_model_changes();

-- ── RLS ─────────────────────────────────────────────────────────────────────────────────────
-- Lecture : même périmètre que la page Membres (admin + encadrants). ÉCRITURE : aucune policy —
-- les triggers sont `security definer` et personne n'écrit ici à la main. Patron de 0033.
alter table public.member_events enable row level security;

drop policy if exists member_events_read on public.member_events;
create policy member_events_read on public.member_events for select to authenticated
  using (public.is_admin() or public.is_manager());

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 5. TURNOVER — agrégation en base
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠️ SECURITY INVOKER : la RLS de `profiles` s'applique à l'appelant. La page Membres est déjà
-- réservée aux encadrants ; cette fonction n'ouvre rien de plus.
--
-- BORNES EN PARAMÈTRES, jamais `current_date` en base : le serveur tourne en UTC et le jour métier
-- de l'agence est Europe/Paris (`todayParis()` côté TS) — piège de fuseau documenté.
--
-- CHATTEURS UNIQUEMENT, et sur TOUT le rapport : les encadrants sont une poignée et bougent
-- rarement, les mélanger diluait le taux. Un effectif de chatteurs rapporté à des sorties tous
-- rôles confondus aurait produit un chiffre faux qui se lit sans se remarquer.
--
-- LA FONCTION NE CALCULE QUE CE QUE LE JS NE PEUT PAS PRODUIRE : la série quotidienne (qui exige
-- `generate_series`) et l'effectif courant. Les totaux — nombre de départs, ancienneté moyenne —
-- sont dérivés de `departures` côté service : la moyenne et la liste affichée viennent ainsi de la
-- même source et ne peuvent pas se contredire.
--
-- `generate_series` sur les JOURS : un jour sans mouvement vaut zéro et doit apparaître, sinon le
-- graphe se resserre sur les seules dates actives et fait lire une activité continue.
create or replace function public.turnover_report(p_from date, p_to date)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with jours as (
    select generate_series(p_from, p_to, interval '1 day')::date as d
  ),
  par_jour as (
    select
      to_char(j.d, 'YYYY-MM-DD') as jour,
      (select count(*) from profiles p
        where p.role = 'chatteur' and p.arrived_at = j.d) as entrees,
      (select count(*) from profiles p
        where p.role = 'chatteur' and p.left_at = j.d) as sorties,
      -- Présent ce jour-là = arrivé au plus tard ce jour, pas encore parti. Le jour du départ, la
      -- personne est encore comptée : elle a travaillé ce jour-là.
      -- `coalesce(arrived_at, created_at)` : au démarrage aucun chatteur n'a de date saisie, sans
      -- ce repli la courbe d'effectif serait plate à zéro.
      (select count(*) from profiles p
        where p.role = 'chatteur'
          and coalesce(p.arrived_at, p.created_at::date) <= j.d
          and (p.left_at is null or p.left_at > j.d)) as effectif
    from jours j
  )
  select json_build_object(
    'by_day', coalesce((select json_agg(t order by t.jour) from par_jour t), '[]'::json),
    'headcount', (select count(*) from profiles where role = 'chatteur' and left_at is null),
    'departures', coalesce((
      select json_agg(t order by t.left_at desc) from (
        select
          coalesce(p.display_name, p.email, '—') as name,
          p.left_reason as reason,
          p.left_at::text as left_at,
          -- Null si l'arrivée n'est pas connue : la ligne reste, sans durée. C'est aussi ce qui
          -- permet au service de compter les départs MESURABLES sans seconde requête.
          case when p.arrived_at is not null then (p.left_at - p.arrived_at) end as tenure_days
        from profiles p
        where p.role = 'chatteur' and p.left_at between p_from and p_to
      ) t
    ), '[]'::json)
  );
$$;

revoke execute on function public.turnover_report(date, date) from public, anon;
grant execute on function public.turnover_report(date, date) to authenticated;
