-- Import de scripts intelligent (spec 2026-10-12) : ce que la préparation a lu, et le bilan des médias.
--   sources      : chaque source de la page (texte, PDF, page liée, Google Doc…) lue ou non, et pourquoi ;
--   source_text  : le texte rassemblé envoyé à la conversion — pour relire un rapport et rejouer ;
--   media_result : bilan des médias à l'envoi (rattachés, à rattacher, collection, raison).
-- `sources` et `source_text` font partie du rapport : figés comme lui (garde 0186 étendue).
alter table public.script_imports
  add column if not exists sources jsonb not null default '[]'::jsonb,
  add column if not exists source_text text,
  add column if not exists media_result jsonb;

comment on column public.script_imports.sources is
  'Sources lues ou non à la préparation : [{kind, label, status lu|non lu, reason}] (0191).';
comment on column public.script_imports.source_text is
  'Texte rassemblé (page, pages liées, Google Docs) envoyé à la conversion ; les PDF y sont nommés, pas recopiés (0191).';
comment on column public.script_imports.media_result is
  'Bilan des médias à l''envoi : {attached, pending, collection, reason} (0191).';

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
    or new.sources is distinct from old.sources
    or new.source_text is distinct from old.source_text
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
