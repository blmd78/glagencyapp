-- Groupe « Accès » (porté de gla-workflow) : Codes Snap + Infos modèles.

-- 1) Fiche « infos clés » par modèle — JSONB { base: {prenom, age, ville, statut,
--    anniversaire, origine, metier, extra}, sections: [{ titre, contenu }] }.
--    La lecture est déjà cloisonnée par creators_scoped_read (modèles assignés) ;
--    l'écriture par creators_admin_update (is_admin). Le GRANT colonne est nécessaire :
--    0006 a révoqué UPDATE sur creators et ne ré-ouvre que (excluded, excluded_reason).
alter table creators add column if not exists infos_cle jsonb;
grant update (infos_cle) on creators to authenticated;

-- 2) Identifiants Snapchat par modèle (1 par modèle — parité legacy codes_snap).
--    Page ADMIN uniquement (comme dans gla-workflow).
create table if not exists snap_codes (
  creator_id uuid primary key references creators(id) on delete cascade,
  pseudo     text not null default '',
  mdp        text not null default '',
  statut     text not null default 'actif'
             check (statut in ('actif', 'banni', 'en pause', 'à recréer')),
  notes      text not null default '',
  updated_at timestamptz not null default now()
);
alter table snap_codes enable row level security;
create policy snap_codes_admin_all on snap_codes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
