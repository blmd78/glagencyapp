-- Planning journalier — resserre la LECTURE au périmètre de GESTION (miroir de l'écriture).
-- Avant (0036/0061) : is_admin() ouvrait la lecture de N'IMPORTE quel planning à un admin
-- non-superadmin (autres admins/superadmins inclus) — l'UI masquait ces cibles dans le
-- sélecteur, mais la RLS (le verrou RÉEL) les exposait via l'API PostgREST.
--
-- Règle : on lit un planning ssi on peut l'ÉDITER (can_edit_planning_of, 0061) OU c'est le
-- sien. Donc superadmin → tout ; admin → managers/sous-managers (pas les autres admins) ;
-- manager → ses sous-managers directs ; chacun → le sien. planning_blocks_read suit en
-- cascade (son exists s'appuie sur la RLS de plannings, 0036:52-53).

drop policy if exists plannings_read on plannings;
create policy plannings_read on plannings for select to authenticated
  using (
    profile_id = (select auth.uid())
    or public.can_edit_planning_of(profile_id)
  );
