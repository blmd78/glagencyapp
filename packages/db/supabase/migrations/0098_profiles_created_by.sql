-- 0098 — Membres : « Créé par » (demande Benoit 2026-07-29 soir).
--
-- `created_by` = le profil qui a créé le membre via la page Membres (rempli par
-- `createMember` côté app, client service-role). Les comptes nés du trigger allowlist
-- (superadmins) ou antérieurs à cette colonne restent à NULL → « — » à l'écran.
-- FK indexée (convention 0055), ON DELETE SET NULL (la fiche survit à son créateur).
alter table public.profiles add column created_by uuid references public.profiles(id) on delete set null;
create index profiles_created_by_idx on public.profiles (created_by);
