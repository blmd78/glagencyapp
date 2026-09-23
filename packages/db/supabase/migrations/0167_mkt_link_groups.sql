-- 0167 — Les groupes de liens vivent en BASE, plus dans le code (demande Benoit 2026-09-22 :
-- « autre ne doit plus exister, tous les groupes doivent être créés et repérés et créés
-- dynamiquement si besoin, et ajouter dans le bon groupe aussi dynamiquement, et pouvoir les
-- moove manuellement si une erreur arrive »).
--
-- Avant : une union TypeScript + un `check` SQL. Ajouter Snapchat demandait une migration ET un
-- déploiement. Désormais un groupe est une LIGNE : son motif de détection avec, si bien que le
-- prochain scrape range tout seul.
--
-- POURQUOI UN GROUPE DE REPLI SUBSISTE (« À classer ») : 306 des 361 liens n'ont AUCUNE url en
-- base, et les 55 restantes pointent toutes vers mym.fans — la destination, jamais la
-- provenance. Le seul indice disponible est le NOM tapé dans MyPuls, et une trentaine de liens
-- s'appellent « Alicedasilvaa » ou « carl.alaprof » : aucune règle ne peut inventer leur
-- plateforme. La case ne disparaît donc pas par magie, mais elle change de nature — ce n'est
-- plus un placard permanent, c'est une file d'attente à vider (menu de la ligne), qui reste vide
-- tant que les liens sont nommés proprement.

create table if not exists public.mkt_link_groups (
  id          uuid primary key default gen_random_uuid(),
  -- La clé PORTÉE par `mkt_links.type` : stable, référencée, jamais retapée à l'affichage.
  key         text not null unique,
  label       text not null,
  -- Couleur du graphe. Choisie dans la palette validée côté app (le validateur dataviz refuse
  -- les teintes trop proches) : la base stocke, l'app propose.
  color       text not null default '',
  -- Motif POSIX insensible à la casse, écrit pour être lu À LA FOIS par Postgres (`~*`) et par
  -- JavaScript (`new RegExp(p, 'i')`) — pas de syntaxe propre à l'un des deux. Vide = groupe
  -- jamais détecté automatiquement (le repli, ou un groupe qu'on ne remplit qu'à la main).
  pattern     text not null default '',
  -- Ordre d'ÉVALUATION, du plus spécifique au plus général : c'est lui qui décide que
  -- « SNAP_TIKTOK » est un lien Snap et non TikTok.
  priority    integer not null default 100,
  -- Le repli. Exactement une ligne (index partiel ci-dessous) ; l'app refuse de le supprimer.
  is_fallback boolean not null default false,
  -- Créé par l'ingestion (motif récurrent repéré) plutôt qu'à la main : l'app le signale, pour
  -- qu'un groupe deviné se relise et se renomme.
  auto        boolean not null default false,
  -- Suppression DOUCE : sans elle, l'auto-création ferait revenir au scrape suivant un groupe
  -- qu'on vient d'écarter. Une ligne supprimée n'est plus proposée ni détectée.
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);

create unique index if not exists mkt_link_groups_one_fallback
  on public.mkt_link_groups ((is_fallback)) where is_fallback and deleted_at is null;
create index if not exists mkt_link_groups_actifs
  on public.mkt_link_groups (priority) where deleted_at is null;

alter table public.mkt_link_groups enable row level security;
-- Même porte que `mkt_links` (0018, resserrée en 0060) : le pôle marketing lit et écrit.
create policy mkt_link_groups_all on public.mkt_link_groups for all to authenticated
  using ((select public.can_write_page('marketing'::text)))
  with check ((select public.can_write_page('marketing'::text)));

-- ── Les neuf groupes d'aujourd'hui, plus les deux que « Autres » cachait ────────────────────
-- Les motifs sont ceux de `detectLinkType` (0166), déplacés de la règle vers la donnée.
insert into public.mkt_link_groups (key, label, color, pattern, priority, is_fallback) values
  ('snapchat',     'Snapchat',      '#ca8a04', '(^|[_ .-])snap',                                  10, false),
  ('fb_ads',       'Facebook Ads',  '#3b82f6', 'fb[_ .-]?ads|facebook',                           20, false),
  ('seo',          'SEO',           '#65a30d', '(^|[_ .-])seo($|[_ .-]|[0-9])',                   30, false),
  ('tiktok_ads',   'TikTok Ads',    '#ea580c', 'tiktok[_ .-]?ads|ads[_ .-]?tiktok',               40, false),
  ('tiktok',       'TikTok',        '#059669', 'tiktok',                                          50, false),
  ('trafficstars', 'TrafficStars',  '#db2777', 'trafficstar',                                     60, false),
  ('telegram',     'Telegram',      '#06b6d4', '_tg($|_)|telegram|^tel[a-z]',                     70, false),
  ('twitter',      'Twitter / X',   '#8b5cf6', 'twitter|^tw[a-z_]|^roro|^keller|^ara[a-z]',       80, false),
  ('instagram',    'Instagram',     '#ec4899', 'insta|threads|(^|[_ .-])ig($|[_ .-])',            90, false),
  ('other',        'À classer',     '',        '',                                               999, true)
on conflict (key) do nothing;

-- ── `mkt_links.type` cesse d'être une énumération figée ─────────────────────────────────────
-- Le `check` part D'ABORD : il refuserait la ligne suivante, « trafficstars » n'étant pas dans
-- sa liste. L'ordre compte, et la migration a échoué une première fois dessus.
alter table public.mkt_links drop constraint if exists mkt_links_type_check;

-- Les liens « trafficstars » rejoignent leur groupe : ils étaient dans « Autres » à cause d'une
-- règle qui les y envoyait EXPRÈS, faute de groupe à eux.
update public.mkt_links set type = 'trafficstars' where type = 'other' and name ~* 'trafficstar';

alter table public.mkt_links add constraint mkt_links_type_fkey
  foreign key (type) references public.mkt_link_groups(key) on update cascade;
