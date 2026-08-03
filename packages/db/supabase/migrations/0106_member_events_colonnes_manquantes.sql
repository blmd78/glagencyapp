-- 0106 — Les quatre colonnes de `profiles` que l'historique laissait passer.
--
-- CE QUI MANQUAIT, relevé en confrontant les colonnes de `profiles` à celles que le trigger
-- comparait (question Benoit 2026-08-03 : « est-ce qu'aucune action ne peut manquer ? ») :
--
--   • `chatter_id`   — LE LIEN MyPuls. Le plus important des quatre : c'est lui qui décide de quel
--                      CA est attribué au membre, donc de ce qu'il est payé. Le relier à une autre
--                      fiche changeait sa rémunération sans laisser la moindre trace.
--   • `display_name` — un membre renommé devenait quelqu'un d'autre dans tous les écrans, sans
--                      qu'on puisse savoir qui l'avait renommé.
--   • `email`        — verrouillé dans le dialog, mais modifiable en SQL : c'est l'identifiant de
--                      connexion, il ne doit pas pouvoir changer en silence.
--   • `work_link`    — mineur, mais c'est une donnée saisie : aucune raison de l'excepter.
--
-- CE QUI RESTE VOLONTAIREMENT HORS CHAMP : `id`, `created_at`, `created_by` (immuables), et
-- `updated_by` — celle-ci change à CHAQUE écriture par construction, la tracer produirait une
-- ligne d'historique par ligne d'historique. `left_note` non plus : elle n'est jamais écrite seule
-- (le dialog de départ l'écrit avec `left_at`, qui produit déjà l'événement « sortie »).

alter table public.member_events drop constraint if exists member_events_kind_check;
alter table public.member_events add constraint member_events_kind_check
  check (kind in ('creation','role','shift','closing','modele','manager','pages','nouveau',
                  'arrivee','sortie','lien','identite'));

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

  v_actor := coalesce(auth.uid(), new.updated_by);

  if new.role is distinct from old.role then
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (new.id, v_actor, 'role', old.role, new.role);
  end if;

  if new.shift is distinct from old.shift then
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (new.id, v_actor, 'shift', old.shift, new.shift);
  end if;

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
    select string_agg(display_name, ', ' order by display_name) into v_from
      from profiles where id = any(coalesce(old.manager_ids, '{}'));
    select string_agg(display_name, ', ' order by display_name) into v_to
      from profiles where id = any(coalesce(new.manager_ids, '{}'));
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (new.id, v_actor, 'manager', v_from, v_to);
  end if;

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
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (
      new.id, coalesce(new.left_by, v_actor), 'sortie',
      old.left_at::text,
      case when new.left_at is null then null
           else concat(new.left_at::text, ' (', coalesce(new.left_reason, '?'), ')') end
    );
  end if;

  -- ── NOUVEAU EN 0106 ───────────────────────────────────────────────────────────────────────
  -- LE LIEN MyPuls, résolu en NOM de fiche : un uuid dans un historique ne se lit pas, et la
  -- fiche peut disparaître ensuite (`chatters` n'a pas de FK depuis ici). Même principe que les
  -- modèles et les managers.
  if new.chatter_id is distinct from old.chatter_id then
    select display_name into v_from from chatters where id = old.chatter_id;
    select display_name into v_to from chatters where id = new.chatter_id;
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (new.id, v_actor, 'lien', v_from, v_to);
  end if;

  -- IDENTITÉ : nom, email et lien de travail. Groupés sous un seul `kind` — ils décrivent la même
  -- chose (la fiche de la personne) et changent rarement ; trois kinds séparés auraient allongé
  -- la légende sans rien apprendre. Une ligne par champ modifié quand même, pour que le
  -- « avant → après » reste lisible.
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
    values (new.id, v_actor, 'identite',
            nullif(old.work_link, ''), nullif(new.work_link, ''));
  end if;

  return new;
end;
$$;
