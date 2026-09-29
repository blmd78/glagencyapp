-- 0177 — Relevé des comptes X (Twitter) par l'API officielle X v2 (spec
-- docs/superpowers/specs/2026-09-28-comptes-x-design.md ; demande Benoit 2026-09-29 : « faut
-- connecter l'API, qui va être appelée toutes les nuits en même temps que les autres crons »).
--
-- 1) `x_user_id` : l'identifiant X, stable. Un compte RENOMMÉ reste le même compte : le relevé le
--    retrouve par cet identifiant et met son `handle` à jour. Unique parmi les comptes X.
-- 2) `mkt_social_daily` reçoit ce que rend un profil X : abonnements, abonnés vérifiés, total de
--    tweets, lien de la bio, date du dernier tweet. Des totaux BRUTS : les variations de période se
--    calculent à la lecture. `posts_24h` (0018) = tweets publiés depuis le relevé précédent.
-- 3) `mkt_social_prev_snapshot` (0089) rend aussi `posts_total`. Son type de retour change, et
--    `create or replace` ne le permet pas : on la supprime et on la recrée. Les jobs Instagram et
--    Telegram n'en lisent que leurs colonnes.

alter table public.mkt_social_accounts add column if not exists x_user_id text;
create unique index if not exists mkt_social_accounts_x_user_id_key
  on public.mkt_social_accounts (x_user_id)
  where platform = 'twitter' and x_user_id is not null;

-- Un pseudo ne s'écrit qu'une fois par plateforme, SANS la casse : `unique (platform, handle)`
-- (0018) laisse passer `Carla_lovy` et `carla_lovy`, qui sont le même compte X — deux lignes
-- relevées, comptées deux fois, impossibles à retirer depuis l'écran. L'écran « Ajouter des
-- comptes » compare déjà sans la casse ; cet index ferme la course entre deux ajouts
-- simultanés. Aucun doublon de ce type en base (vérifié UAT et prod le 2026-09-29, 94 comptes).
create unique index if not exists mkt_social_accounts_platform_handle_ci_key
  on public.mkt_social_accounts (platform, lower(handle));

alter table public.mkt_social_daily
  add column if not exists following integer,
  add column if not exists verified_followers integer,
  add column if not exists posts_total integer,
  add column if not exists bio_url text,
  add column if not exists last_post_at timestamptz;

drop function if exists public.mkt_social_prev_snapshot(uuid[], date);
create function public.mkt_social_prev_snapshot(account_ids uuid[], before_date date)
returns table (account_id uuid, followers integer, views_total bigint, posts_total integer)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (account_id) account_id, followers, views_total, posts_total
  from mkt_social_daily
  where account_id = any(account_ids) and date < before_date
  order by account_id, date desc
$$;

-- Interne à l'ingestion (service_role) : même révocation que 0089.
revoke execute on function public.mkt_social_prev_snapshot(uuid[], date) from public, anon, authenticated;
