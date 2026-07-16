-- 0028 — Assignations VA atomiques et cloisonnées (audit pré-push) :
--   1. ATOMIQUE : le delete-puis-insert de mkt_staff_links et le clear/set des comptes
--      se font dans UNE transaction (fonction) — plus de perte d'assignations si une
--      écriture échoue à mi-chemin.
--   2. ANTI-VOL : security INVOKER → le RLS du caller s'applique DANS la fonction.
--      Un lien/compte déjà assigné à une fiche que le caller ne voit pas (RLS owner_id,
--      migration 0027) = fiche d'un autre manager → refus explicite. L'admin voit tout,
--      donc réassigne librement.

create or replace function public.mkt_save_staff_assignments(
  p_staff uuid,
  p_links uuid[],
  p_accounts uuid[]
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- La fiche doit être visible du caller (RLS : la sienne, ou admin).
  if not exists (select 1 from mkt_staff where id = p_staff) then
    raise exception 'Fiche introuvable ou non autorisée';
  end if;
  -- Un lien assigné à une fiche invisible = VA d'un autre manager → double paye interdite.
  if exists (
    select 1 from mkt_staff_links sl
    where sl.link_id = any(p_links) and sl.staff_id <> p_staff
      and not exists (select 1 from mkt_staff s where s.id = sl.staff_id)
  ) then
    raise exception 'Un des liens est déjà assigné au VA d''un autre manager';
  end if;
  -- Même règle pour les comptes sociaux (paye vues + affichage).
  if exists (
    select 1 from mkt_social_accounts a
    where a.id = any(p_accounts) and a.staff_id is not null and a.staff_id <> p_staff
      and not exists (select 1 from mkt_staff s where s.id = a.staff_id)
  ) then
    raise exception 'Un des comptes est déjà assigné au VA d''un autre manager';
  end if;

  delete from mkt_staff_links where staff_id = p_staff;
  insert into mkt_staff_links (staff_id, link_id)
    select distinct p_staff, l from unnest(p_links) as l;
  update mkt_social_accounts set staff_id = null
    where staff_id = p_staff and not (id = any(p_accounts));
  update mkt_social_accounts set staff_id = p_staff where id = any(p_accounts);
end $$;

revoke all on function public.mkt_save_staff_assignments(uuid, uuid[], uuid[]) from public;
grant execute on function public.mkt_save_staff_assignments(uuid, uuid[], uuid[]) to authenticated;
