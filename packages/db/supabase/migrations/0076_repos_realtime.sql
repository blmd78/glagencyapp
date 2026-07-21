-- 0076 — Planning des repos : temps réel + écriture des cases réservée aux admins.
-- Un seul lot logique (la même évolution : les managers voient le planning COMPLET en direct mais
-- en lecture seule ; seul l'admin pose/retire un repos).
--
-- 1) TEMPS RÉEL (Supabase Realtime / postgres_changes) — les porteurs de la page « repos »
--    (managers + admins) voient les changements EN DIRECT sans rafraîchir. La RLS existante
--    (`rest_cells_read`/`rest_weeks_read` = has_page('repos')) filtre déjà qui reçoit les
--    événements → aucun changement de policy de LECTURE nécessaire.
--    `replica identity full` : le row COMPLET est publié pour UPDATE/DELETE (sinon seule la PK
--    l'est) — nécessaire pour que le filtre d'abonnement `week_start=eq.…` matche sur tous les
--    types d'événements, et robuste si la PK évolue.
alter table public.rest_planning_cells replica identity full;
alter table public.rest_planning_weeks replica identity full;

alter publication supabase_realtime add table public.rest_planning_cells;
alter publication supabase_realtime add table public.rest_planning_weeks;

-- 2) ÉCRITURE DES CASES = ADMIN uniquement, en RLS (enforcement réel, aligne la base sur la règle
--    app `saveReposCell → adminGuard`). Les managers voient tout mais ne posent plus de repos.
--    Asymétrie voulue : la case « envoyé Telegram » (`rest_planning_weeks.sent_telegram`) reste
--    cochable par les managers (c'est Marco, un manager, qui envoie sur Telegram) → les policies
--    `rest_weeks_write`/`rest_weeks_update` restent en `can_write_page('repos')`, INCHANGÉES.
--    Pas de policy `delete` sur les cases (l'action fait un upsert insert/update, jamais de delete)
--    → le delete reste refusé par défaut, rien à resserrer.
alter policy "rest_cells_write" on public."rest_planning_cells"
  with check ((select public.is_admin()));
alter policy "rest_cells_update" on public."rest_planning_cells"
  using ((select public.is_admin())) with check ((select public.is_admin()));
