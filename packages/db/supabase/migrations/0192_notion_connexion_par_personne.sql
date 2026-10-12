-- 0192 — Chacun connecte son Notion (demande Benoit, 2026-10-12).
--
-- Admins ET encadrement connectent leurs espaces Notion. Une ligne par espace ET PAR PERSONNE : reconnecter
-- un espace remplace SA ligne (unique (workspace_id, connected_by)), deux personnes peuvent connecter le
-- même espace chacune pour soi. Visibilité (appliquée par le serveur, la table reste service-role only) :
--   - `shared` = connecté par un admin → partagé avec toute l'équipe (le Notion d'agence) ;
--   - sinon → visible par la seule personne qui l'a connecté (son Notion perso), admins compris.
-- Les connexions existantes ont été faites par un admin (0184..0191 : admin seul) → partagées.
-- L'id de ligne devient opaque (uuid) pour les nouvelles connexions ; les lignes existantes gardent l'id
-- de leur espace. Inchangé : clés chiffrées, RLS sans policy.
alter table public.notion_connection drop constraint if exists notion_connection_id_is_workspace;
alter table public.notion_connection alter column id set default gen_random_uuid()::text;
alter table public.notion_connection add column if not exists shared boolean not null default false;
update public.notion_connection set shared = true;
create unique index if not exists notion_connection_workspace_person_key
  on public.notion_connection (workspace_id, connected_by);

comment on column public.notion_connection.shared is
  'Connecté par un admin : partagé avec toute l''équipe ; sinon visible par la seule personne qui l''a connecté (0192).';
comment on table public.notion_connection is
  'Connexions OAuth aux espaces Notion (import de scripts), une ligne par espace et par personne — clé chiffrée, service-role only (0184, 0188, 0192).';
