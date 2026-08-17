-- 0112 — Un encadrant PORTE les modèles de ses sous-managers rattachés — invariant garanti en base.
--
-- L'INCIDENT (prod, 2026-08-17) : Rémi (manager) ne trouvait pas Lino dans « Ajouter une
-- sanction ». Lino est sur Juliette ; Juliette est portée par Marco, sous-manager rattaché à
-- Rémi ; mais `profile_creators` de Rémi = {Carla, Julie}. Le board Orga rangeait bien Juliette
-- sous Rémi (il agrège les modèles des sous-managers), le périmètre Police (creator-scope) et
-- Membres (`requireOwnCreators`) lisent les assignations PROPRES du manager → écart.
--
-- POURQUOI L'ÉCART EXISTE : la règle « le manager suit ses sous-managers » n'était appliquée que
-- sur UN chemin d'écriture — le « porteur jumeau » de `save_org_row` (0099), et seulement au
-- CHANGEMENT de modèle d'une ligne existante. Ajouter une ligne au board, poser un modèle sur la
-- fiche Membres d'un sous-manager (`syncAssignments`), ou déplacer un sous-manager vers un autre
-- manager (`move_org_team`) : aucun ne propageait. Rémi était le seul manager désaligné (vérifié
-- en prod : 5 managers avec sous-manager, 4 alignés).
--
-- LA RÈGLE (validée Benoit 2026-08-17) : encadrant ⊇ ∪ modèles de ses sous-managers rattachés,
-- chacun pouvant en avoir en plus (les directs du manager ne DESCENDENT pas). Propagation des
-- AJOUTS seulement : un retrait chez le sous-manager ne retire rien au manager (on ne sait pas
-- distinguer un direct d'un hérité, et « surplus temporaire OK, jamais un membre vidé » est la
-- philosophie de `syncAssignments`). Le retrait du manager reste manuel — comme aujourd'hui.
--
-- DEUX DÉCLENCHEURS, pour couvrir tous les chemins sans toucher au code web :
--   1. INSERT dans profile_creators d'un sous-manager en poste → même paire pour chacun de ses
--      encadrants (manager OU sous-manager, en poste). Transitif par construction : la ligne
--      insérée chez un sous-manager intermédiaire redéclenche vers SES encadrants ; `on conflict
--      do nothing` n'insère rien → pas de re-déclenchement → un cycle de rattachement (toléré
--      par 0092, borné à 6 par managed_subtree) termine de lui-même.
--   2. UPDATE de `profiles.manager_ids` ou `role` : si la ligne est un sous-manager en poste, TOUS
--      ses modèles vont à TOUS ses encadrants courants (idempotent, pas de diff old/new à tenir).
--      GARDE `when` obligatoire (audit 2026-08-17) : un `update of` se déclenche sur la PRÉSENCE
--      de la colonne dans le SET, pas sur un changement de valeur — or `updateMember` écrit
--      toujours `role`. Sans la garde, CHAQUE édition de fiche d'un sous-manager re-propageait
--      tous ses modèles et ressuscitait les retraits manuels du manager, que le contrat
--      ci-dessus promet pourtant de respecter.
-- Le trigger d'audit `trg_log_member_model_changes` (0101/0110) journalise chaque ligne propagée
-- sur la fiche du manager (« Modèle X ajouté ») — trace voulue.
--
-- SECURITY DEFINER : la RLS d'insertion sur profile_creators exige is_admin() ; les triggers
-- doivent écrire quel que soit l'appelant (Membres passe par le service role, l'orga par des RPC
-- definer). `search_path` figé (security-privileges).

create or replace function public.propagate_creator_to_managers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into profile_creators (profile_id, creator_id)
  select m.id, new.creator_id
  from profiles sm
  join profiles m on m.id = any(sm.manager_ids)
  where sm.id = new.profile_id
    and sm.role = 'sous-manager'
    and sm.left_at is null
    and m.role in ('manager', 'sous-manager')
    and m.left_at is null
  on conflict (profile_id, creator_id) do nothing;
  return null; -- AFTER trigger : la valeur de retour est ignorée.
end;
$$;

drop trigger if exists trg_propagate_creator_to_managers on public.profile_creators;
create trigger trg_propagate_creator_to_managers
  after insert on public.profile_creators
  for each row execute function public.propagate_creator_to_managers();

create or replace function public.propagate_creators_on_attach()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role = 'sous-manager' and new.left_at is null then
    insert into profile_creators (profile_id, creator_id)
    select m.id, pc.creator_id
    from profile_creators pc
    join profiles m on m.id = any(new.manager_ids)
    where pc.profile_id = new.id
      and m.role in ('manager', 'sous-manager')
      and m.left_at is null
    on conflict (profile_id, creator_id) do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_propagate_creators_on_attach on public.profiles;
create trigger trg_propagate_creators_on_attach
  after update of manager_ids, role on public.profiles
  for each row
  when (old.manager_ids is distinct from new.manager_ids or old.role is distinct from new.role)
  execute function public.propagate_creators_on_attach();

-- Backfill : aligne l'existant (prod : les 3 modèles de Rémi via Marco — idempotent si le
-- réalignement manuel du 2026-08-17 est déjà passé). Passe par le trigger d'audit comme le reste.
insert into profile_creators (profile_id, creator_id)
select distinct m.id, pc.creator_id
from profiles sm
join profiles m on m.id = any(sm.manager_ids)
join profile_creators pc on pc.profile_id = sm.id
where sm.role = 'sous-manager' and sm.left_at is null
  and m.role in ('manager', 'sous-manager') and m.left_at is null
on conflict (profile_id, creator_id) do nothing;
