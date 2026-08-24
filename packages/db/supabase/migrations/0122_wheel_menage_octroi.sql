-- Ménage : suppression des fonctions d'octroi automatique de tours de roue.
--
-- ⚠️ À APPLIQUER **APRÈS** LE DÉPLOIEMENT DU CODE de 0121. Ces fonctions sont encore appelées par
-- la version actuellement en ligne (`getWheel` lève sur l'erreur de `training_wheel_pending` — la
-- page Roue planterait ; l'octroi du layout, lui, est déjà tolérant aux pannes).
--
-- Le graphe de dépendances est CLOS : les seules fonctions qui appellent `training_wheel_ranking_raw`
-- et `training_wheel_weeks_open` sont dans ce même lot (vérifié en base avant écriture). Rien
-- d'autre dans le schéma n'y touche. `training_weekly_ranking`, elle, RESTE — le classement hebdo
-- est toujours affiché dans « Ma formation », il ne donne simplement plus de tour.
--
-- `training_trophy_grant` (0120, livrée la veille) disparaît avec le reste : les trophées ne
-- paient plus de tour. Sa colonne `training_wheel_tickets.trophy_key` est conservée — inerte, mais
-- elle documente les tickets qui auraient été créés entre-temps.

-- Les appelantes d'abord, leurs dépendances ensuite.
drop function if exists public.training_wheel_grant_due(integer);
drop function if exists public.training_wheel_grant_open_weeks(integer);
drop function if exists public.training_wheel_grant_week(date, integer);
drop function if exists public.training_wheel_pending(uuid, integer);
drop function if exists public.training_wheel_pending(uuid);
drop function if exists public.training_trophy_grant(uuid, jsonb);
drop function if exists public.training_wheel_weeks_open();
drop function if exists public.training_wheel_ranking_raw(date);

-- Le throttle de l'octroi automatique n'a plus d'objet.
alter table public.training_wheel_config drop column if exists last_granted_at;
