-- 0104 — HISTORIQUE DE VIE D'UN MEMBRE : une ligne par changement, posée par TRIGGER.
--
-- POURQUOI UN TRIGGER ET PAS UN LOG APPLICATIF. Le shift et les modèles s'écrivent depuis QUATRE
-- sources : le dialog Membres (service-role), les RPC du board Organisation, le planning Repos, et
-- les requêtes SQL directes. Un log dans les Server Actions en raterait la moitié. Le projet a
-- déjà tranché la question pour les spenders — 0033 : « alimenté par TRIGGER → robuste quelle que
-- soit la source d'écriture ». Même patron ici.
--
-- L'HISTORIQUE DÉMARRE VIDE : le passé n'est pas reconstituable. Chaque jour sans ce trigger est
-- du mouvement définitivement perdu.

-- ── La table ────────────────────────────────────────────────────────────────────────────────
-- GÉNÉRIQUE (`kind` + from/to) plutôt qu'une colonne par type : une timeline se rend de la même
-- façon quel que soit le changement, et un nouveau type d'événement n'imposera pas de migration.
--
-- VALEURS EN TEXTE LISIBLE (nom du modèle, 'matin', 'chatteur') et pas des UUID : un historique
-- doit rester lisible après la suppression du modèle ou du manager auquel il fait référence.
create table if not exists public.member_events (
  id         bigserial primary key,
  -- CASCADE : si un compte est vraiment supprimé (corbeille admin, réservée aux comptes créés par
  -- erreur), son historique part avec — il n'a jamais existé. Les vrais départs ne suppriment
  -- plus rien depuis 0102.
  profile_id uuid not null references profiles(id) on delete cascade,
  at         timestamptz not null default now(),
  -- L'auteur peut partir ; le changement reste.
  actor_id   uuid references profiles(id) on delete set null,
  kind       text not null check (kind in
    ('creation','role','shift','closing','modele','manager','pages','nouveau','arrivee','sortie')),
  from_value text,
  to_value   text
);

comment on table public.member_events is
  'Historique des changements d''un membre (0104). Alimentée EXCLUSIVEMENT par trigger — n''écrire jamais depuis l''app, la table ne vaut que si elle est exhaustive.';
comment on column public.member_events.actor_id is
  'Qui a fait le changement. Null = écriture hors app (SQL direct) → l''écran affiche « système », jamais « inconnu ».';

create index if not exists member_events_profile_idx on public.member_events (profile_id, at desc);
create index if not exists member_events_at_idx on public.member_events (at desc);

-- ── L'ACTEUR ────────────────────────────────────────────────────────────────────────────────
-- `auth.uid()` suffirait si toutes les écritures venaient d'un client authentifié. Ce n'est pas le
-- cas : la page Membres écrit en SERVICE ROLE (auth.admin.* exige la clé secrète), où `auth.uid()`
-- est NULL. Les RPC du board, elles, passent par le client authentifié.
--
-- D'où `profiles.updated_by`, posé par les actions Membres — patron de `created_by` (0098).
alter table profiles add column if not exists updated_by uuid references profiles(id) on delete set null;
comment on column profiles.updated_by is
  'Dernier profil ayant modifié cette ligne depuis l''app (0104). Sert au trigger d''historique quand l''écriture passe par le service role, où auth.uid() est null.';

-- ── Trigger sur `profiles` ──────────────────────────────────────────────────────────────────
-- UN SEUL trigger qui compare colonne par colonne et insère 0 à n lignes. `is distinct from`
-- partout : un enregistrement du dialog qui ne change rien ne doit RIEN écrire, sinon la timeline
-- se remplit de bruit et devient inutilisable.
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
    insert into member_events (profile_id, actor_id, kind, to_value)
    values (new.id, new.created_by, 'creation', new.role);
    return new;
  end if;

  -- L'acteur applicatif prime quand il existe (RPC sous client authentifié) ; sinon la colonne
  -- posée par l'action (chemin service-role).
  v_actor := coalesce(auth.uid(), new.updated_by);

  if new.role is distinct from old.role then
    insert into member_events (profile_id, actor_id, kind, from_value, to_value)
    values (new.id, v_actor, 'role', old.role, new.role);
  end if;

  if new.shift is distinct from old.shift then
    insert into member_events (profile_id, actor_id, kind, from_value, to_value)
    values (new.id, v_actor, 'shift', old.shift, new.shift);
  end if;

  -- Closing = rôle + équipe, une seule ligne : ils se lisent ensemble et changent souvent
  -- ensemble ; deux lignes pour un même geste alourdiraient la timeline sans rien apprendre.
  if new.closing_role is distinct from old.closing_role
     or new.closing_team is distinct from old.closing_team then
    insert into member_events (profile_id, actor_id, kind, from_value, to_value)
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
    insert into member_events (profile_id, actor_id, kind, from_value, to_value)
    values (new.id, v_actor, 'manager', v_from, v_to);
  end if;

  -- PAGES : on note QUE ça a changé et COMBIEN il y en a, pas lesquelles. La liste complète serait
  -- illisible dans une timeline, et le droit courant est de toute façon visible dans le dialog.
  if new.pages is distinct from old.pages then
    insert into member_events (profile_id, actor_id, kind, from_value, to_value)
    values (
      new.id, v_actor, 'pages',
      coalesce(array_length(old.pages, 1), 0)::text,
      coalesce(array_length(new.pages, 1), 0)::text
    );
  end if;

  if new.is_new is distinct from old.is_new then
    insert into member_events (profile_id, actor_id, kind, from_value, to_value)
    values (new.id, v_actor, 'nouveau', old.is_new::text, new.is_new::text);
  end if;

  if new.arrived_at is distinct from old.arrived_at then
    insert into member_events (profile_id, actor_id, kind, from_value, to_value)
    values (new.id, v_actor, 'arrivee', old.arrived_at::text, new.arrived_at::text);
  end if;

  if new.left_at is distinct from old.left_at then
    -- L'acteur d'une sortie est déjà nommé par `left_by` (0102) : on le préfère à v_actor, qui
    -- serait le même mais par un chemin moins sûr.
    insert into member_events (profile_id, actor_id, kind, from_value, to_value)
    values (
      new.id, coalesce(new.left_by, v_actor), 'sortie',
      old.left_at::text,
      case when new.left_at is null then null
           else concat(new.left_at::text, ' (', coalesce(new.left_reason, '?'), ')') end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_member_changes on profiles;
create trigger trg_log_member_changes
  after insert or update on profiles
  for each row execute function public.log_member_changes();

-- ── Trigger sur `profile_creators` (les modèles) ────────────────────────────────────────────
-- L'ASTUCE DE L'ACTEUR. Cette table n'a pas de colonne d'auteur, et les assignations posées depuis
-- Membres passent par le service role (auth.uid() null). On lit donc `profiles.updated_by` du
-- membre concerné — VALIDE parce que `updateMember` écrit le profil AVANT les assignations
-- (actions.ts:190 puis :241) : `updated_by` est déjà à jour quand ce trigger tire.
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
    insert into member_events (profile_id, actor_id, kind, to_value)
    values (v_profile, v_actor, 'modele', coalesce(v_name, '?'));
  else
    insert into member_events (profile_id, actor_id, kind, from_value)
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
-- les triggers sont `security definer` et personne n'écrit ici à la main. Même patron que 0033.
alter table public.member_events enable row level security;

drop policy if exists member_events_read on public.member_events;
create policy member_events_read on public.member_events for select to authenticated
  using (public.is_admin() or public.is_manager());
