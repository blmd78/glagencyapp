-- 0111 — Tracker spenders : QUI a fait la dernière relance (demande Benoit 2026-08-17 :
-- « quand une relance est faite sur la journée, le nom du chatter qui l'a faite, pour tracker »).
--
-- La donnée existe depuis 0038 (`relances.created_by` = profil qui a cliqué) mais n'était jamais
-- remontée : le tracker ne disait que « ✓ fait ». On ajoute UNE colonne au RPC,
-- `derniere_relance_par` = `profiles.display_name` de l'auteur de la relance la plus récente.
--
-- POURQUOI `created_by` ET PAS `chatter_id` : `chatter_id` est le chatteur ASSIGNÉ au moment du
-- clic (déjà affiché dans la colonne « Chatter ») ; celui qui a réellement fait la relance est le
-- profil connecté — un manager peut relancer pour un chatteur, c'est lui qu'on veut voir.
--
-- ABSOLUE, comme `relance_today` (0091) : le badge « ✓ fait » regarde la dernière relance TOUTE
-- PÉRIODE (reset ou pas) — le nom qui l'accompagne doit suivre la même règle, sinon un reset
-- dans la journée afficherait « fait » sans auteur.
--
-- RLS INCHANGÉE (invoker) : `profiles_self_admin_or_team_read` (0097) laisse admin/encadrement
-- lire tous les noms ; un chatteur ne lit que le sien → pour lui, la relance d'un autre affiche
-- « ✓ fait » sans nom. Assumé : c'est l'encadrement qui tracke.
--
-- Un `create or replace` ne peut pas changer la table de retour → drop + create (comme 0080).
-- Les wrappers `crm_spenders_tracker_json` (0103), `crm_spenders_page` et `crm_spenders_kpis_json`
-- (0104) font `select t.*` + `row_to_json` : la colonne remonte sans les toucher.

drop function if exists public.crm_spenders_tracker(numeric);
create function public.crm_spenders_tracker(p_seuil numeric default 40)
returns table (
  creator_id uuid, fan_id bigint, username text, model text, ca_total numeric,
  status text, last_message_at timestamptz, last_message_is_mine boolean, has_unread boolean,
  assigned_chatter_id uuid, chatter_name text, assigned_label text,
  compteur_r int, derniere_relance_at timestamptz, relance_today boolean,
  conversion_pending boolean, archived boolean,
  derniere_relance_par text
)
language sql stable security invoker set search_path = public
as $$
  select
    sc.creator_id, sc.fan_id, sc.username, cr.name as model, sc.ca_total,
    sc.status, sc.last_message_at, sc.last_message_is_mine, sc.has_unread,
    sc.assigned_chatter_id, ch.display_name as chatter_name, sc.assigned_label,
    (coalesce(cm.compteur_base, 0) + coalesce(r.cnt, 0))::int as compteur_r,
    r.derniere_relance_at,
    (r.dernier_jour_abs = (now() at time zone 'Europe/Paris')::date) as relance_today,
    (r.derniere_relance_at is not null
       and sc.last_message_is_mine = false
       and sc.last_message_at > r.derniere_relance_at) as conversion_pending,
    coalesce(cm.archived, false) as archived,
    p.display_name as derniere_relance_par
  from spender_conversations sc
  join creators cr on cr.id = sc.creator_id
  left join chatters ch on ch.id = sc.assigned_chatter_id
  left join spender_crm cm on cm.creator_id = sc.creator_id and cm.fan_id = sc.fan_id
  left join lateral (
    select count(*) filter (where rl.created_at > coalesce(cm.compteur_reset_at, '-infinity'::timestamptz)) as cnt,
           max(rl.created_at) filter (where rl.created_at > coalesce(cm.compteur_reset_at, '-infinity'::timestamptz)) as derniere_relance_at,
           max(rl.jour_paris) as dernier_jour_abs,
           -- Auteur de la relance la plus récente (toute période) — dans le MÊME lateral :
           -- un seul parcours de l'index relances_conv_idx par conversation, pas un second.
           (array_agg(rl.created_by order by rl.created_at desc))[1] as dernier_par
    from relances rl
    where rl.creator_id = sc.creator_id and rl.fan_id = sc.fan_id
  ) r on true
  left join profiles p on p.id = r.dernier_par
  where sc.ca_total >= p_seuil
$$;
-- Revoke EXPLICITE (comme 0103/0104) : les default privileges posés par 0088 ne sont pas garantis
-- partout (constaté sur l'UAT : la fonction recréée ressortait exécutable par anon/PUBLIC).
revoke execute on function public.crm_spenders_tracker(numeric) from public, anon;
grant execute on function public.crm_spenders_tracker(numeric) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- 2) Exclusion de l'AFFICHAGE Organisation (demande Benoit 2026-08-17 — fusionnée ici pour
--    n'avoir qu'une migration à passer en prod avec la release).
--
-- Cas : un manager TRANSVERSE (ex. Jam) a tous les modèles assignés pour tout voir sur le
-- CRM sans être admin — le board Organisation lui rend alors une ligne par modèle et devient
-- illisible. Même symptôme que les admins, déjà traités en dur dans get-organisation.ts
-- (« un ADMIN est assigné à TOUS les modèles par nature ») ; ce drapeau en est la version
-- par membre, posée depuis le dialog Membres (admin only).
--
-- AFFICHAGE PUR : jamais lu par creator-scope ni authz — droits, pages et assignations
-- strictement inchangés. Pas d'index (table de l'ordre de la centaine de lignes), pas de
-- policy : colonne couverte par les policies row-level existantes, écrite via client admin.
alter table profiles
  add column if not exists org_excluded boolean not null default false;

comment on column profiles.org_excluded is
  'Exclu de l''affichage du board Organisation (affichage pur — droits et assignations inchangés).';
