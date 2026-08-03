-- 0105 — `member_events` : deux colonnes renommées pour rejoindre les conventions du schéma.
--
-- `at` → `created_at` : `at` n'existait QUE sur cette table (relevé du 2026-08-03), quand
-- `created_at` est présent sur 17 autres. Une ligne de log est créée à un instant, comme le reste.
--
-- `actor_id` → `created_by` : la paire naturelle de `created_at`, et le nom EXACT du même concept
-- ailleurs (`profiles.created_by`, 0098). `updated_by` — plus répandu dans le schéma (15 tables) —
-- a été écarté volontairement : `member_events` est APPEND-ONLY, aucune de ses lignes n'est jamais
-- mise à jour (ni par l'app, qui n'y écrit pas du tout, ni par les triggers, qui n'y font que des
-- INSERT). Un `updated_by` y annoncerait une mise à jour qui n'arrive jamais.
--
-- `kind` est CONSERVÉ : `police_entries.kind`, `script_items.kind` et `fan_transactions.kind`
-- l'utilisent déjà. Le renommer en `type` aurait fait de cette table l'exception, à rebours de
-- l'uniformité recherchée (arbitrage Benoit 2026-08-03, sur relevé du schéma).
--
-- Renommage PUR : aucune donnée touchée, aucun type modifié. Les index et contraintes suivent
-- automatiquement leur colonne — seuls leurs NOMS restent ceux d'origine, ce qui est sans effet
-- (Postgres ne les résout pas par nom). On les renomme quand même pour ne pas laisser une trace
-- « actor » dans un schéma qui ne connaît plus ce mot.

alter table public.member_events rename column at to created_at;
alter table public.member_events rename column actor_id to created_by;

alter index if exists member_events_at_idx rename to member_events_created_at_idx;
alter table public.member_events rename constraint member_events_actor_id_fkey to member_events_created_by_fkey;

comment on column public.member_events.created_at is
  'Quand le changement a eu lieu — c''est-à-dire quand le trigger a écrit cette ligne.';
comment on column public.member_events.created_by is
  'Qui a fait le changement. Null = écriture hors app (SQL direct) → l''écran affiche « système », jamais « inconnu ».';

-- ── Les deux triggers, réécrits sur les nouveaux noms ───────────────────────────────────────
-- Corps IDENTIQUE à 0104 hors les deux colonnes : ne rien changer d'autre ici, ce fichier est un
-- renommage. La logique (comparaisons `is distinct from`, résolution de l'acteur) reste la même.
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

  -- Closing = rôle + équipe, une seule ligne : ils se lisent ensemble et changent souvent
  -- ensemble ; deux lignes pour un même geste alourdiraient la timeline sans rien apprendre.
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

  -- PAGES : on note QUE ça a changé et COMBIEN il y en a, pas lesquelles.
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
    -- L'acteur d'une sortie est déjà nommé par `left_by` (0102) : on le préfère à v_actor.
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
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
  -- `updateMember` écrit le profil AVANT les assignations : `updated_by` y est déjà à jour quand
  -- ce trigger tire. Sans ça, tout changement de modèle fait depuis Membres dirait « système ».
  select coalesce(auth.uid(), p.updated_by) into v_actor from profiles p where p.id = v_profile;
  select name into v_name from creators where id = v_creator;

  if tg_op = 'INSERT' then
    insert into member_events (profile_id, created_by, kind, to_value)
    values (v_profile, v_actor, 'modele', coalesce(v_name, '?'));
  else
    insert into member_events (profile_id, created_by, kind, from_value)
    values (v_profile, v_actor, 'modele', coalesce(v_name, '?'));
  end if;
  return null;
end;
$$;
