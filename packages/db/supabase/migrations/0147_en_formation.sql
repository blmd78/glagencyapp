-- « EN FORMATION » : un drapeau, pour que la file d'attente de l'agence soit lisible.
-- Spec : docs/superpowers/specs/2026-09-04-formation-en-formation-design.md
--
-- POURQUOI UNE COLONNE. L'Overview Formation coupait sa promo en deux sections sur une DÉDUCTION —
-- « pas de modèle rattachée » (`overview-roster.tsx:80` et `:93`). Elle tenait tant que le bouton
-- « Intégrer » du recrutement rattachait une modèle dans le même geste. Ce dialog disparaît (le
-- choix de la modèle n'est presque jamais fait à cette seconde-là) : sans modèle à l'arrivée, la
-- déduction ne dit plus rien, et « en formation » devient un état qui dure des semaines sans que
-- rien en base ne le porte.
--
-- ÉTAT DES LIEUX EN PRODUCTION le 2026-09-04 : 260 chatteurs en poste, 245 avec le droit
-- `frm-entrainement` — donc 245 lignes empilées sur un écran dont 58 seulement intéressent
-- l'encadrement. C'est ça, « c'est illisible ».

alter table public.profiles
  add column if not exists in_training boolean not null default false;

comment on column public.profiles.in_training is
  'Le chatteur est en cours de FORMATION (pas encore en production sur une modèle). Coché à '
  'l''intégration depuis Recrutement et à la création d''un chatteur dans Membres ; décoché '
  'AUTOMATIQUEMENT au premier rattachement à une modèle (trigger profile_creators), et modifiable '
  'à la main dans Membres. Ne concerne que role = ''chatteur''.';

-- `default false` et NON `default true` : la valeur par défaut d'une colonne s'applique à tous les
-- profils — encadrants et admins compris — et à toute création future, y compris celle du trigger
-- `on_auth_user_created`. Le « coché par défaut » de la demande est un défaut de FORMULAIRE et
-- d'INTÉGRATION, pas de colonne. Même partage que `is_new` (0101:28).
--
-- Pas de check à la `profiles_is_new_needs_arrived_at` : aucune date n'est associée. On sait déjà
-- depuis quand la personne est là (`arrived_at`) et quand elle est entrée en production
-- (`integrated_at`, 0129) — une troisième date ne dirait rien de neuf.

create index if not exists profiles_in_training_idx on public.profiles (in_training)
  where in_training;

-- ── Backfill ────────────────────────────────────────────────────────────────────────────────
-- Les chatteurs en poste sans AUCUNE assignation : 58 lignes en production au 2026-09-04, toutes
-- créées il y a moins de 60 jours (0 ancien) — le backfill ne peut donc pas ressusciter en
-- « formation » un vétéran dont on aurait retiré la modèle.
--
-- Le filtre `frm-entrainement` est volontairement ABSENT : il ne change que 2 lignes, et ce sont
-- précisément celles qu'on veut voir — un chatteur intégré à qui on a oublié le droit Entraînement
-- est aujourd'hui invisible de l'écran qui devrait le signaler.
update public.profiles p set in_training = true
where p.role = 'chatteur'
  and p.left_at is null
  and not exists (select 1 from public.profile_creators pc where pc.profile_id = p.id);

-- ── Journal du membre : le kind `integration` ───────────────────────────────────────────────
alter table public.member_events drop constraint member_events_kind_check;
alter table public.member_events add constraint member_events_kind_check
  check (kind in ('creation','role','shift','closing','modele','manager','pages','nouveau',
                  'arrivee','sortie','lien','identite','sanction','rapport','recompense',
                  'formation','integration'));

-- ── Le journal suit le drapeau ──────────────────────────────────────────────────────────────
-- La fonction est recopiée de 0101:142-257 avec UN bloc en plus (`in_training`) : c'est un
-- trigger monolithique, il n'y a pas d'autre façon de l'étendre que de le redéfinir en entier.
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

  -- EN FORMATION (0147). Kind `integration` et SURTOUT PAS `formation`, qui est déjà pris par la
  -- reprise de l'ancienne plateforme GLA (0123) et s'affiche « Ancienne plateforme » : on y lirait
  -- « Ancienne plateforme : true → false ».
  --
  -- Le décochage automatique (trigger `profile_creators_clear_in_training` plus bas) passe par ici
  -- comme le reste : il sera signé par `updated_by` du profil, donc « système » quand personne ne
  -- l'a posé. C'est exact — c'est le rattachement à une modèle qui a décoché, pas une personne.
  if new.in_training is distinct from old.in_training then
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (new.id, v_actor, 'integration', old.in_training::text, new.in_training::text);
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


-- ── Le décochage automatique ────────────────────────────────────────────────────────────────
-- EN BASE, et pas dans le code applicatif, parce que `profile_creators` est écrit depuis TROIS
-- chemins indépendants :
--   • Membres        → `syncAssignments` (apps/web/src/features/members/authz.ts:78-88)
--   • Organisation   → RPC SQL `save_org_cell` / `save_org_row` (0099/0110), qui n'appellent
--                      aucun code TypeScript — c'est là qu'on PLACE les chatteurs sur les modèles
--   • SQL à la main
-- Un décochage posé dans `authz.ts` raterait le board Organisation, c'est-à-dire l'endroit même
-- où l'entrée en production se décide le plus souvent.
--
-- `role = 'chatteur'` dans le where : `profile_creators` porte AUSSI le périmètre modèles des
-- encadrants (lib/services/creator-scope.ts). Sans ce filtre, assigner une modèle à un manager
-- toucherait un drapeau qui ne le concerne pas.
--
-- LE RETRAIT D'UNE MODÈLE NE RECOCHE RIEN. Écart assumé avec Good Luck Agency, qui effaçait
-- `integrated_at` sur un « Repasser en formation » (serveur.py:1122-1123) — le même écart est déjà
-- acté pour `integrated_at` (members/authz.ts:96-100). Un retrait passe souvent par le board
-- Organisation, où c'est une réorganisation, pas un retour en formation. Le recochage est manuel.
create or replace function public.clear_in_training()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles
     set in_training = false
   where id = new.profile_id and in_training and role = 'chatteur';
  return null; -- AFTER trigger : la valeur de retour est ignorée.
end;
$$;

drop trigger if exists profile_creators_clear_in_training on public.profile_creators;
create trigger profile_creators_clear_in_training
  after insert on public.profile_creators
  for each row execute function public.clear_in_training();

-- ── Le roster de l'Overview ─────────────────────────────────────────────────────────────────
-- `drop` puis `create` (et non `create or replace`) : la table de retour gagne deux colonnes, ce
-- que `replace` refuse. Les grants sont donc à REPOSER derrière — ils ne survivent pas au drop.
--
-- Le `where` s'élargit à `or in_training` : un candidat intégré dont la pose des droits a échoué
-- (le cas décrit dans recruit-admin/actions.ts:283-288) restait invisible de l'écran censé le
-- signaler, donc introuvable. Il y apparaîtra, marqué « sans accès » par `has_training`.
drop function if exists public.training_overview_roster();

create function public.training_overview_roster()
returns table (profile_id uuid, display_name text, is_new boolean, arrived_at date, models text[],
               cases_done integer, avg_total numeric, points integer, boss_best smallint, boss_done boolean,
               streak_days integer, last_session_at timestamptz, sessions_scored integer,
               in_training boolean, has_training boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select p.id, coalesce(p.display_name, '—'), coalesce(p.is_new, false), p.arrived_at,
         coalesce((select array_agg(c.name order by c.name) from profile_creators pc join creators c on c.id = pc.creator_id where pc.profile_id = p.id), '{}'),
         coalesce(s.cases_done, 0), s.avg_total, coalesce(s.points, 0), s.boss_best, coalesce(s.boss_done, false),
         case when s.last_active_day >= (now() at time zone 'Europe/Paris')::date - 1 then s.streak_days else 0 end,
         s.last_session_at,
         (select count(*)::integer from training_sessions ts where ts.profile_id = p.id and ts.status = 'scored'),
         coalesce(p.in_training, false),
         'frm-entrainement' = any(p.pages)
  from profiles p
  left join training_profile_stats s on s.profile_id = p.id
  where p.left_at is null and p.role = 'chatteur'
    and ('frm-entrainement' = any(p.pages) or coalesce(p.in_training, false))
    and (select public.has_page('frm-suivi'))
  order by coalesce(p.is_new, false) desc, p.display_name;
$$;

revoke execute on function public.training_overview_roster() from public, anon;
grant execute on function public.training_overview_roster() to authenticated;
