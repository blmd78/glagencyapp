-- 0186 — Verrous de script_imports (revue du 2026-10-07 de l'import de scripts).
--
-- 0184 bornait l'écriture au périmètre de modèles (profile_creators) sans contrôle de RÔLE (des
-- chatteurs ont aussi des lignes dans profile_creators) et laissait un encadrant réécrire, par l'API,
-- le brouillon, le rapport ou le statut de ses imports — p. ex. remettre un import « sent » en
-- « prepared » pour le renvoyer. Désormais :
--   - écrire exige d'être admin, ou encadrant (is_manager : manager / sous-manager, en poste) ET
--     rattaché à la modèle ;
--   - une ligne naît « prepared », sans id MyPuls ni heure d'envoi ;
--   - le rapport et le brouillon ne se modifient plus (préparer à nouveau), et le statut ne suit que
--     prepared → sending → sent | failed (déclencheur, qui s'applique aussi au service role).
drop policy if exists script_imports_insert on public.script_imports;
drop policy if exists script_imports_update on public.script_imports;

create policy script_imports_insert on public.script_imports for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and status = 'prepared'
    and mypuls_script_id is null
    and sent_at is null
    and (
      (select public.is_admin())
      or (
        (select public.is_manager())
        and exists (
          select 1 from public.profile_creators pc
          where pc.profile_id = (select auth.uid()) and pc.creator_id = script_imports.creator_id
        )
      )
    )
  );

create policy script_imports_update on public.script_imports for update to authenticated
  using (created_by = (select auth.uid()))
  with check (
    created_by = (select auth.uid())
    and (
      (select public.is_admin())
      or (
        (select public.is_manager())
        and exists (
          select 1 from public.profile_creators pc
          where pc.profile_id = (select auth.uid()) and pc.creator_id = script_imports.creator_id
        )
      )
    )
  );

create or replace function public.script_imports_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.created_by is distinct from old.created_by
    or new.creator_id is distinct from old.creator_id
    or new.notion_page_id is distinct from old.notion_page_id
    or new.notion_title is distinct from old.notion_title
    or new.summary is distinct from old.summary
    or new.notes is distinct from old.notes
    or new.errors is distinct from old.errors
    or new.draft is distinct from old.draft
    or new.usage is distinct from old.usage
    or new.created_at is distinct from old.created_at
  then
    raise exception 'script_imports : le rapport et le brouillon ne se modifient pas — préparer le script à nouveau'
      using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'prepared' and new.status = 'sending')
    or (old.status = 'sending' and new.status in ('sent', 'failed'))
  ) then
    raise exception 'script_imports : passage de statut % → % interdit', old.status, new.status using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists script_imports_guard on public.script_imports;
create trigger script_imports_guard
  before update on public.script_imports
  for each row execute function public.script_imports_guard();
