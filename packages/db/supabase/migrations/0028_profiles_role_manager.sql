-- 0028 — Rôle intermédiaire `manager` sur profiles (préparation du CRM closing).
-- Mêmes droits effectifs qu'un `user` (pages + profile_creators) : is_admin() et
-- has_page() inchangés — étiquette d'organisation posée par les admins (page Membres).
alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin', 'manager', 'user'));
