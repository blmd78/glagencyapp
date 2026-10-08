-- 0188 — Plusieurs espaces Notion, plus de page racine (demande Benoit, 2026-10-08).
--
-- Notion délivre une clé PAR ESPACE : chaque « Connecter Notion » ajoute désormais l'espace choisi au
-- lieu de remplacer le précédent — une ligne par espace, id = id de l'espace (reconnecter un espace
-- remplace SA ligne). La page racine disparaît : le CRM liste toutes les pages partagées avec la
-- connexion (le choix des pages se fait déjà dans Notion, au moment de connecter).
-- `root_page_id` est CONSERVÉE, inutilisée : la migration reste compatible avec le code déjà déployé
-- (qui la lit encore) comme avec le nouveau — à supprimer par une migration de nettoyage une fois la
-- release passée (docs/dettes-ouvertes.md).
-- Inchangé : clé et jeton de renouvellement chiffrés, RLS sans policy (service role seul).
alter table public.notion_connection drop constraint if exists notion_connection_id_check;
alter table public.notion_connection alter column id drop default;
update public.notion_connection set id = workspace_id where id = 'agence';
alter table public.notion_connection add constraint notion_connection_id_is_workspace check (id = workspace_id);
comment on table public.notion_connection is
  'Connexions OAuth aux espaces Notion (import de scripts), une ligne par espace — clé chiffrée, service-role only (0184, 0188).';
