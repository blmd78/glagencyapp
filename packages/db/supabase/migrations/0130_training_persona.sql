-- « Ta fiche modèle » — le persona d'entraînement affiché sur la page d'un module.
--
-- Reprise du CRM Good Luck Agency : `index.html:1532` insérait un <details> « Ta fiche modèle —
-- Alice » ENTRE la description du module et le cours, dont le contenu était la constante HTML
-- `FICHE_ALICE` (index.html:1080-1093) — une fiche UNIQUE, identique pour tous les modules et tous
-- les chatteurs. C'est un personnage d'entraînement, pas une vraie créatrice : elle n'entrait dans
-- aucun prompt IA (serveur.py n'en a aucune occurrence) et n'avait aucun lien avec `chatters.modele`,
-- qui ne servait qu'à marquer l'intégration en agence.
--
-- Pourquoi une TABLE et pas une constante comme chez eux : chez GLA, corriger une ligne de la fiche
-- demandait un déploiement. Ici le contenu du catalogue de formation est de la donnée (cf.
-- `training_modules.course_md`) — une ligne unique, sur le même patron que `training_wheel_config`.
--
-- Volontairement DÉCOUPLÉ de `creators.infos_cle` (0047) : la fiche des vraies créatrices est lue
-- sous la RLS `creators_scoped_read`, qui borne aux modèles de `profile_creators`. Un chatteur EN
-- FORMATION n'en a aucune assignée — il aurait vu un écran vide.
create table if not exists public.training_persona (
  -- Ligne unique (patron `training_wheel_config`) : la fiche est globale à la face Formation.
  id         smallint primary key default 1 check (id = 1),
  -- Prénom affiché dans le titre du volet : « Ta fiche modèle — Alice ».
  name       text not null check (length(name) between 1 and 40),
  -- Grille de champs + paragraphes, dans l'ORDRE d'affichage :
  --   { "base": [{ "label": "PRÉNOM", "value": "Alice" }, …],
  --     "sections": [{ "titre": "Famille", "contenu": "…" }, …] }
  -- `titre` vide = paragraphe sans intitulé (le 1ᵉʳ de la fiche GLA, celui du chat).
  infos      jsonb not null default '{"base": [], "sections": []}'::jsonb,
  active     boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.training_persona enable row level security;

-- Même paire que le reste du catalogue (`training_modules`, `training_wheel_config`) : lisible par
-- qui a la face Formation, modifiable par un admin seulement.
create policy training_persona_read on public.training_persona for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_persona_admin_write on public.training_persona for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Contenu repris MOT POUR MOT de `FICHE_ALICE` (index.html:1080-1093).
insert into public.training_persona (id, name, infos)
values (
  1,
  'Alice',
  jsonb_build_object(
    'base', jsonb_build_array(
      jsonb_build_object('label', 'PRÉNOM', 'value', 'Alice'),
      jsonb_build_object('label', 'ÂGE',    'value', '22 ans'),
      jsonb_build_object('label', 'VILLE',  'value', 'Créteil (région parisienne)'),
      jsonb_build_object('label', 'STATUT', 'value', 'Célibataire'),
      jsonb_build_object('label', 'ORIGINE','value', 'Française'),
      jsonb_build_object('label', 'MÉTIER', 'value', 'BTS commerce, au chômage')
    ),
    'sections', jsonb_build_array(
      jsonb_build_object(
        'titre', '',
        'contenu', 'Vit seule avec son chat Sushi (gris et blanc, trouvé abandonné derrière un Franprix, nourri au biberon 3 semaines — son « bébé », « plus fidèle que la plupart des mecs »).'
      ),
      jsonb_build_object(
        'titre', 'Famille',
        'contenu', 'mère Sandrine (46, vendeuse en parfumerie, très complice) · père Marc (49, chauffeur-livreur, blagueur, protecteur) · frère Lucas (18, lycéen, fan de techno).'
      ),
      jsonb_build_object(
        'titre', 'Personnalité',
        'contenu', 'séductrice assumée, adore plaire ; drôle, spontanée, un peu provocante ; très tactile ; aime les compliments, les défis, le flirt léger.'
      ),
      jsonb_build_object(
        'titre', 'Goûts',
        'contenu', 'mode, parfums, jeux vidéo (The Sims, GTA, Valorant), café glacé, crop-tops.'
      )
    )
  )
)
on conflict (id) do nothing;
