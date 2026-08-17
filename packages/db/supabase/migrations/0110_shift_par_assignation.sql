-- 0110 — Placements multi-shift par (chatter × modèle) ; `profiles.shift` devient le shift PRINCIPAL.
--
-- ── POURQUOI ────────────────────────────────────────────────────────────────────────────────
-- Depuis 0099, `profiles.shift` portait UN créneau par personne et le board Organisation en
-- déduisait UNE case par modèle : poser quelqu'un dans une autre colonne l'ôtait de la précédente.
-- Or un chatteur tient des créneaux différents selon le modèle, et parfois plusieurs sur le MÊME
-- modèle (retour Benoit 2026-08-17 : « plus de cloisonnement — si je le passe de matin à
-- après-midi il reste dans les deux »). Il a par ailleurs un shift PRINCIPAL (son créneau normal) ;
-- tout placement sur un autre créneau est de l'HEURE SUP.
--
-- Modèle retenu :
--   • `profiles.shift`            = shift PRINCIPAL de la personne (inchangé de forme : c'est le
--                                   champ Shift de Membres). Un par personne.
--   • `profile_creators.shifts[]` = PLACEMENTS du chatteur sur ce modèle — 0, 1 ou plusieurs
--                                   créneaux, libres. Une case du board (modèle × shift) = les
--                                   lignes dont `shifts` contient ce shift, ni plus ni moins.
--   • `profile_creators.hs_shifts[]` ⊂ shifts = les placements marqués HEURE SUP ; les autres sont
--                                   des placements PRINCIPAUX. C'est une DONNÉE, éditable sur le
--                                   board (case ouverte, clic sur un nom : principal ⇄ heure sup,
--                                   bleu ⇄ rouge). Valeur par défaut à la pose : heure sup si la
--                                   personne a un shift principal différent, principal sinon.
--   • principal (personne) et placements sont DÉCOUPLÉS : changer le principal ne déplace ni ne
--     re-marque aucun placement. Seul lien : une personne SANS principal qui reçoit son premier
--     placement en hérite comme principal (défaut évident, jamais destructif).
--   • seuls les membres rôle chatteur ont des placements ; les lignes des encadrants restent `{}`.
--
-- ── REPRISE ─────────────────────────────────────────────────────────────────────────────────
-- `shifts = array[profiles.shift]` sur toutes les assignations des chatteurs qui ont un shift :
-- exactement ce que le board affichait la veille (une case par modèle, au créneau de la personne).
-- Les chatteurs avec shift SANS assignation gardent leur principal (12 en prod au 2026-08-17) — ils
-- n'ont simplement aucune case, comme avant.

-- ── 0. Forme canonique d'une liste de placements ────────────────────────────────────────────
-- Sans doublon, sans null, ordonnée matin → aprem → soir. IMMUTABLE : sert au check ci-dessous et
-- à toutes les écritures (RPC, Membres) — la colonne ne contient jamais deux fois « matin ».
create or replace function public.norm_shifts(p text[])
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    array(
      select d.x
      from (select distinct u.x from unnest(p) as u(x) where u.x is not null) d
      order by array_position(array['matin', 'aprem', 'soir'], d.x)
    ),
    '{}'::text[]
  )
$$;

-- ── 1. Colonnes ─────────────────────────────────────────────────────────────────────────────
alter table public.profile_creators
  add column if not exists shifts text[] not null default '{}'
    check (shifts <@ array['matin', 'aprem', 'soir']::text[] and shifts = public.norm_shifts(shifts));
alter table public.profile_creators
  add column if not exists hs_shifts text[] not null default '{}'
    check (hs_shifts <@ shifts and hs_shifts = public.norm_shifts(hs_shifts));

comment on column public.profile_creators.shifts is
  'Placements du chatteur SUR CE MODÈLE (matin/aprem/soir, plusieurs possibles, forme canonique norm_shifts) — 0110. Une case du board = les lignes qui contiennent ce shift. Toujours {} pour un encadrant.';
comment on column public.profile_creators.hs_shifts is
  'Sous-ensemble de shifts marqués HEURE SUP (rouge sur le board) ; les autres placements sont principaux (bleu). Éditable case par case — 0110.';
comment on column public.profiles.shift is
  'Shift PRINCIPAL du chatteur (matin/aprem/soir) — 0110 : tout placement (profile_creators.shifts) sur un autre créneau est de l''heure sup. Null = pas encore défini (le premier placement le pose).';

update public.profile_creators pc
set shifts = array[p.shift]
from public.profiles p
where p.id = pc.profile_id
  and p.role = 'chatteur'
  and p.shift is not null;

-- ── 2. RPC du board : composition d'une case (modèle × shift) ───────────────────────────────
-- Même signature qu'en 0099 (l'appelant TypeScript ne change pas), même garde
-- `can_write_page('organisation')`.
-- AJOUTÉ  → placement ajouté sur ce modèle (assignation créée si besoin) ; RIEN d'autre ne bouge :
--           ni ses autres colonnes de la ligne, ni ses autres modèles. Sans shift principal, la
--           personne reçoit celui-ci.
-- RETIRÉ  → ce placement retiré ; plus aucun placement sur ce modèle → assignation supprimée (le
--           board reste le lieu où l'on compose les équipes ; le périmètre d'accès suit).
create or replace function public.save_org_cell(
  p_creator_id uuid,
  p_shift text,
  p_chatter_ids uuid[],
  p_previous_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Ajouts / retraits calculés UNE fois. Puis, dans les deux sens, on ne touche QU'AUX MEMBRES RÔLE
  -- CHATTEUR EN POSTE : les lignes des porteurs (manager / sous-manager = structure du board ET
  -- périmètre RLS de l'encadrant) sont hors d'atteinte de cette RPC ouverte aux encadrants — un
  -- `p_previous_ids` forgé ne peut pas les effacer (0099 le garantissait par `p.shift = p_shift`,
  -- toujours faux pour un encadrant ; le filtre est désormais explicite).
  v_added   uuid[];
  v_removed uuid[];
begin
  if not public.can_write_page('organisation') then
    raise exception 'org_acces_refuse';
  end if;
  -- `is null` EXPLICITE : `null not in (…)` vaut null, donc ne lèverait pas.
  if p_shift is null or p_shift not in ('matin', 'aprem', 'soir') then
    raise exception 'org_shift_invalide';
  end if;
  if coalesce(array_length(p_chatter_ids, 1), 0) > 100
     or coalesce(array_length(p_previous_ids, 1), 0) > 100 then
    raise exception 'org_trop_de_lignes';
  end if;

  select coalesce(array_agg(p.id), '{}') into v_added
  from profiles p
  where p.role = 'chatteur' and p.left_at is null
    and p.id in (select id from unnest(p_chatter_ids) as t(id)
                 except select id from unnest(p_previous_ids) as t(id));
  select coalesce(array_agg(p.id), '{}') into v_removed
  from profiles p
  where p.role = 'chatteur'
    and p.id in (select id from unnest(p_previous_ids) as t(id)
                 except select id from unnest(p_chatter_ids) as t(id));

  -- AJOUTS : placement ajouté (assignation créée si besoin) ; rien d'autre ne bouge. Type PAR DÉFAUT
  -- du nouveau placement : heure sup si la personne a un shift principal DIFFÉRENT, principal sinon
  -- — modifiable ensuite (`set_org_placement_kind`). Un placement qui existait déjà garde son type.
  insert into profile_creators (profile_id, creator_id, shifts, hs_shifts)
  select p.id, p_creator_id, array[p_shift],
         case when p.shift is not null and p.shift <> p_shift then array[p_shift] else '{}'::text[] end
  from profiles p
  where p.id = any(v_added)
  on conflict (profile_id, creator_id) do update
    set shifts = public.norm_shifts(profile_creators.shifts || excluded.shifts),
        hs_shifts = case when p_shift = any(profile_creators.shifts) then profile_creators.hs_shifts
                         else public.norm_shifts(profile_creators.hs_shifts || excluded.hs_shifts) end;

  -- Premier placement d'une personne sans shift principal → il devient son principal.
  update profiles p
  set shift = p_shift
  where p.id = any(v_added) and p.shift is null;

  -- RETRAITS. D'ABORD l'assignation quand c'était son DERNIER placement (ou une ligne déjà vide :
  -- écran pas rafraîchi, l'intention « retirer de ce modèle » est claire) — dans cet ordre, le
  -- geste produit UN événement (« Modèle Emma · Soir retiré ») et non un « Shift retiré » suivi
  -- d'un « Modèle retiré ».
  delete from profile_creators pc
  where pc.profile_id = any(v_removed)
    and pc.creator_id = p_creator_id
    and (pc.shifts = array[p_shift] or pc.shifts = '{}');

  -- ENSUITE le placement seul (et sa marque heure sup), sur les lignes qui en gardent d'autres.
  update profile_creators pc
  set shifts = array_remove(pc.shifts, p_shift),
      hs_shifts = array_remove(pc.hs_shifts, p_shift)
  where pc.profile_id = any(v_removed)
    and pc.creator_id = p_creator_id
    and p_shift = any(pc.shifts);
end;
$$;
-- `create or replace` conserve les grants de 0099 (execute : authenticated ; révoqué : public, anon).

-- ── 2b. Type d'un placement : principal ⇄ heure sup ─────────────────────────────────────────
-- Même droit que la composition d'une case. Ne touche qu'un placement EXISTANT d'un membre rôle
-- chatteur ; ne crée rien, ne retire rien. `p_hs` = true → marqué heure sup (rouge), false →
-- principal (bleu).
create or replace function public.set_org_placement_kind(
  p_creator_id uuid,
  p_profile_id uuid,
  p_shift text,
  p_hs boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_write_page('organisation') then
    raise exception 'org_acces_refuse';
  end if;
  if p_shift is null or p_shift not in ('matin', 'aprem', 'soir') or p_hs is null then
    raise exception 'org_shift_invalide';
  end if;
  update profile_creators pc
  set hs_shifts = case when p_hs then public.norm_shifts(pc.hs_shifts || array[p_shift])
                       else array_remove(pc.hs_shifts, p_shift) end
  from profiles p
  where pc.profile_id = p_profile_id
    and pc.creator_id = p_creator_id
    and p.id = pc.profile_id and p.role = 'chatteur'
    and p_shift = any(pc.shifts);
  if not found then
    raise exception 'org_placement_inconnu';
  end if;
end;
$$;
revoke execute on function public.set_org_placement_kind(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.set_org_placement_kind(uuid, uuid, text, boolean) to authenticated;

-- ── 3. Historique : trigger `profile_creators` étendu à l'UPDATE des placements ─────────────
-- Format des valeurs : `<nom du modèle> · <codes séparés par ", ">`, un code marqué heure sup
-- portant le suffixe ` (HS)` (ex. `Emma · matin, soir (HS)`), ou le nom seul quand la ligne n'a
-- aucun placement. Les codes sont traduits côté domaine (`memberEventLabel`, @glagency/core) — le
-- SQL ne connaît pas les libellés (même règle que 0107).
--   INSERT                        → 'modele'  (null → 'Emma · matin')      « Modèle Emma · Matin ajouté »
--   UPDATE of shifts / hs_shifts  → 'shift'   ('Emma · matin' → 'Emma · matin, soir (HS)')
--   DELETE                        → 'modele'  ('Emma · matin' → null)      « Modèle Emma · Matin retiré »
-- Le shift PRINCIPAL de la personne, lui, reste journalisé par le trigger de `profiles` (0101).
create or replace function public.log_member_model_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid := coalesce(new.profile_id, old.profile_id);
  v_creator uuid := coalesce(new.creator_id, old.creator_id);
  v_actor   uuid;
  v_name    text;
  v_old     text;
  v_new     text;
begin
  select coalesce(auth.uid(), p.updated_by) into v_actor from profiles p where p.id = v_profile;
  select name into v_name from creators where id = v_creator;
  v_name := coalesce(v_name, '?');
  -- `Emma · matin, soir (HS)` ; `Emma` seul sans placement (INSERT/DELETE) ; null (UPDATE) sans.
  if tg_op <> 'INSERT' then
    select v_name || ' · ' || string_agg(x || case when x = any(old.hs_shifts) then ' (HS)' else '' end, ', ' order by ord)
      into v_old from unnest(old.shifts) with ordinality as t(x, ord);
  end if;
  if tg_op <> 'DELETE' then
    select v_name || ' · ' || string_agg(x || case when x = any(new.hs_shifts) then ' (HS)' else '' end, ', ' order by ord)
      into v_new from unnest(new.shifts) with ordinality as t(x, ord);
  end if;

  if tg_op = 'INSERT' then
    insert into member_events (profile_id, created_by, kind, to_value)
    values (v_profile, v_actor, 'modele', coalesce(v_new, v_name));
  elsif tg_op = 'UPDATE' then
    if new.shifts is distinct from old.shifts or new.hs_shifts is distinct from old.hs_shifts then
      insert into member_events (profile_id, created_by, kind, from_value, to_value)
      values (v_profile, v_actor, 'shift', v_old, v_new);
    end if;
  else
    insert into member_events (profile_id, created_by, kind, from_value)
    values (v_profile, v_actor, 'modele', coalesce(v_old, v_name));
  end if;
  return null; -- AFTER trigger : la valeur de retour est ignorée.
end;
$$;

drop trigger if exists trg_log_member_model_changes on public.profile_creators;
create trigger trg_log_member_model_changes
  after insert or update of shifts, hs_shifts or delete on public.profile_creators
  for each row execute function public.log_member_model_changes();
