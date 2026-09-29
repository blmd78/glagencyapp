-- 0178 — Le relevé X garde TOUT ce que rend le profil (demande Benoit 2026-09-29 : « je paye,
-- donc prends toutes les données »). Même appel, même prix : ces champs arrivaient déjà ou
-- s'ajoutent à la liste demandée (`X_USER_FIELDS`, @glagency/core).
--
-- Sur le COMPTE (valeur courante, réécrite chaque nuit) : nom affiché, photo, date de création
-- du compte X — de quoi reconnaître un compte et connaître son âge.
-- Sur le RELEVÉ du jour (historique, pour voir quand ça change) : nombre de listes, texte de la
-- bio, type de certification, pays où le compte est bridé (`withheld`).
--
-- Écarté : `subscription_type` (Premium) — X le rend toujours « None » hors du compte
-- authentifié (docs.x.com, data dictionary) ; `verified_followers_count` — vide pour tous nos
-- comptes avec un jeton applicatif (constaté au relevé du 2026-09-29).
--
-- `x_verified_type` reste du texte libre, sans `check` : X documente blue / business /
-- government, mais une valeur nouvelle ne doit pas faire échouer la nuit.

alter table public.mkt_social_accounts
  add column if not exists x_name text,
  add column if not exists x_avatar_url text,
  add column if not exists x_created_at timestamptz;

alter table public.mkt_social_daily
  add column if not exists listed integer,
  add column if not exists bio_text text,
  add column if not exists x_verified_type text,
  add column if not exists withheld_countries text[];
