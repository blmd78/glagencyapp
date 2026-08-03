-- 0102 — Deux sujets, fusionnés parce qu'aucun n'avait atteint la production :
--   A. les colonnes d'encadrement du planning repos suivent la HIÉRARCHIE ;
--   B. un membre PARTI n'a plus aucun droit, jeton valide ou pas.
--
-- Écrit en trois temps (auto-assignation, puis règle hiérarchique, puis verrou de départ) et
-- consolidé ici : le premier état de `save_repos_cell` était intégralement réécrit par le
-- deuxième, le rejouer n'aurait servi qu'à documenter un aller-retour. Seul l'état final compte.


-- ── A. PLANNING REPOS — COLONNES D'ENCADREMENT ──────────────────────────────────────────────
--
--   Colonne          | admin | manager        | sous-manager | police
--   -----------------|-------|----------------|--------------|-------------
--   Managers         | tout  | LUI-MÊME       | ✗            | ✗
--   Sous-managers    | tout  | tout le monde  | LUI-MÊME     | ✗
--   Policiers        | tout  | tout le monde  | ✗            | LUI-MÊME
--   Modèles (g1…g12) | tout  | tout le monde  | tout le monde| ✗
--
-- Un manager ne pose donc PAS un autre manager : entre pairs, chacun s'inscrit. Il place en
-- revanche librement ceux qu'il encadre.
--
-- LE POLICIER ÉTAIT BLOQUÉ AVANT MÊME D'ARRIVER ICI. `can_write_page(slug)` vaut
-- `is_admin() or (is_manager() and has_page(slug))`, et `is_manager()` ne reconnaît QUE
-- 'manager' et 'sous-manager' : un policier échouait sur la toute première garde — soit le seul
-- rôle pour qui l'auto-assignation avait été demandée. Élargir `is_manager()` lui aurait ouvert
-- TOUTES les écritures de TOUTES ses pages (planning, quotas, scripts…), un effet de bord sans
-- rapport. L'exception est donc posée ICI, au plus près, et strictement bornée : sa seule case
-- de la seule colonne Policiers, rien dans les colonnes de modèles.
--
-- Le delta est calculé sur la ligne VERROUILLÉE (`for update`) : deux sauvegardes concurrentes se
-- sérialisent, sinon chacune compare à un état déjà périmé et la seconde efface la première.

create or replace function public.save_repos_cell(
  p_week_start date,
  p_day smallint,
  p_col text,
  p_chatter_ids uuid[],
  p_names text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before uuid[];
  v_role   text;
  v_libre  boolean := false;  -- l'appelant peut-il poser QUELQU'UN D'AUTRE dans cette colonne ?
begin
  select role into v_role from profiles where id = (select auth.uid());

  -- ACCÈS : les encadrants par le chemin normal ; le policier par l'exception ci-dessus, qui ne
  -- lui ouvre rien de plus qu'une case de la colonne Policiers (contrôlé plus bas).
  if not (public.can_write_page('repos')
          or (v_role = 'police' and public.has_page('repos'))) then
    raise exception 'repos_acces_refuse';
  end if;

  if not (p_col ~ '^g([1-9]|1[0-2])$' or p_col in ('managers', 'sous-managers', 'policiers')) then
    raise exception 'repos_colonne_inconnue';
  end if;
  if length(coalesce(p_names, '')) > 1000 then
    raise exception 'repos_names_trop_long';
  end if;
  if coalesce(array_length(p_chatter_ids, 1), 0) > 200
     or exists (select 1 from unnest(p_chatter_ids) x(id) where x.id is null) then
    raise exception 'repos_ids_invalides';
  end if;

  if public.is_admin() then
    v_libre := true;

  elsif p_col in ('managers', 'sous-managers', 'policiers') then
    if p_col = 'managers' then
      -- Entre pairs : un manager s'inscrit lui-même, personne d'autre ne le fait pour lui.
      if v_role <> 'manager' then
        raise exception 'repos_colonne_encadrement';
      end if;
    elsif v_role = 'manager' then
      -- Il encadre les sous-managers et les policiers : il pose leurs repos.
      v_libre := true;
    elsif not ((p_col = 'sous-managers' and v_role = 'sous-manager')
            or (p_col = 'policiers' and v_role = 'police')) then
      raise exception 'repos_colonne_encadrement';
    end if;

  else
    -- Colonnes de MODÈLES : tout encadrant les remplit, le policier n'y a rien à faire (il n'est
    -- entré ici que par l'exception d'accès ci-dessus).
    if v_role = 'police' then
      raise exception 'repos_colonne_encadrement';
    end if;
    v_libre := true;
  end if;

  -- Édition bornée à soi : le delta (ajoutés ∪ retirés) ne doit contenir que l'appelant.
  if not v_libre then
    select chatter_ids into v_before
      from rest_planning_cells
     where week_start = p_week_start and day = p_day and col = p_col
       for update;
    v_before := coalesce(v_before, '{}');

    if exists (
      select 1
      from (
        (select unnest(p_chatter_ids) except select unnest(v_before))
        union
        (select unnest(v_before) except select unnest(p_chatter_ids))
      ) d(id)
      where d.id is distinct from (select auth.uid())
    ) then
      raise exception 'repos_encadrement_soi_meme';
    end if;
  end if;

  insert into rest_planning_cells (week_start, day, col, chatter_ids, names, updated_at, updated_by)
  values (p_week_start, p_day, p_col, p_chatter_ids, trim(coalesce(p_names, '')), now(), (select auth.uid()))
  on conflict (week_start, day, col) do update
    set chatter_ids = excluded.chatter_ids,
        names       = excluded.names,
        updated_at  = excluded.updated_at,
        updated_by  = excluded.updated_by;
end;
$$;

revoke execute on function public.save_repos_cell(date, smallint, text, uuid[], text) from public, anon;
grant execute on function public.save_repos_cell(date, smallint, text, uuid[], text) to authenticated;


-- ── B. UN MEMBRE PARTI N'A PLUS AUCUN DROIT ─────────────────────────────────────────────────
--
-- Jusqu'ici, désactiver quelqu'un reposait sur deux choses : le ban GoTrue posé par
-- `recordDeparture` (0101) et le `left_at` que `getProfile` teste côté app. Ça suffit pour
-- l'app — au chargement suivant la personne est dehors — mais PAS pour l'API.
--
-- LA FENÊTRE : le ban empêche de se connecter et de rafraîchir un jeton ; il ne révoque pas
-- l'access token DÉJÀ ÉMIS, valide jusqu'à son expiration (1 h par défaut). PostgREST ne vérifie
-- qu'une signature, il ne consulte jamais `auth.users` — et aucune policy ni fonction de droits
-- ne regardait `left_at`. Pendant cette heure, qui appelait l'API Supabase EN DIRECT, hors de
-- l'app, gardait tous ses droits.
--
-- LE CORRECTIF : les fonctions qui répondent à « qui est l'appelant ? » exigent un compte actif.
-- Le jeton reste valide, il ne donne simplement plus rien. Le verrou passe de l'applicatif à la
-- base, là où il tient vraiment.
--
-- PÉRIMÈTRE — uniquement l'APPELANT, jamais la CIBLE. `writable_todo_targets` continue donc de
-- LISTER les partis tant qu'ils sont dans `profiles` : filtrer les cibles est une décision
-- fonctionnelle (que voit-on d'un ancien ?), pas de sécurité, et elle appartient aux features.
--
-- COUVERTURE : `can_write_page` et `can_edit_planning_of` composent ces fonctions et sont donc
-- fermées sans être touchées. Les trois dernières ci-dessous relisent `profiles` pour l'appelant
-- sans passer par elles — d'où leur présence.
--
-- Aucun membre n'a `left_at` en production au moment de cette migration : personne n'est
-- verrouillé par son application.

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from profiles
    where id = auth.uid() and left_at is null and role in ('admin', 'superadmin')
  );
$function$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from profiles
    where id = auth.uid() and left_at is null and role = 'superadmin'
  );
$function$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from profiles
    where id = auth.uid() and left_at is null and role in ('manager', 'sous-manager')
  );
$function$;

create or replace function public.is_police()
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from profiles
    where id = auth.uid() and left_at is null and role = 'police'
  );
$function$;

create or replace function public.has_page(slug text)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and left_at is null
      and (role in ('admin', 'superadmin') or slug = any(pages))
  )
$function$;

create or replace function public.can_manage_planning_of(target uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1
    from profiles caller
    join profiles t on t.id = target
    where caller.id = (select auth.uid())
      and caller.left_at is null
      and caller.role = 'manager'
      and t.role = 'sous-manager'
      and t.manager_ids @> array[caller.id]
  );
$function$;

-- Branche « je gère MA to-do » : elle ne passe pas par can_edit_planning_of, elle relit le
-- profil de l'appelant. C'est le seul chemin par lequel un parti pouvait encore écrire chez lui.
create or replace function public.can_write_todo_of(target uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
      select 1 from profiles t
      where t.id = target
        and t.role in ('superadmin', 'admin', 'manager', 'sous-manager')
    )
    and (
      public.can_edit_planning_of(target)
      or (target = (select auth.uid()) and exists (
            select 1 from profiles p
            where p.id = (select auth.uid())
              and p.left_at is null
              and p.role in ('superadmin', 'admin', 'manager', 'sous-manager')
          ))
    );
$function$;

-- `me` vide (appelant parti) → la jointure ne produit aucune ligne : plus aucune cible.
create or replace function public.writable_todo_targets()
returns setof uuid language sql stable security definer set search_path to 'public'
as $function$
  with me as (
    select id, role from profiles where id = (select auth.uid()) and left_at is null
  )
  select t.id
  from profiles t, me
  where t.role in ('superadmin', 'admin', 'manager', 'sous-manager')
    and (
      (me.role in ('admin', 'superadmin')
        and (me.role = 'superadmin' or t.role not in ('admin', 'superadmin')))
      or (me.role = 'manager' and t.role = 'sous-manager' and t.manager_ids @> array[me.id])
      or (t.id = me.id and me.role in ('superadmin', 'admin', 'manager', 'sous-manager'))
    );
$function$;
