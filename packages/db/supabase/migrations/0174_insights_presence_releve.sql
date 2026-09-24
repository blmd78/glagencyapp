-- Présence des Insights : le temps de chatting du RELEVÉ MyPuls, par chatteur, sur une période.
--
-- LE BUG. Les cartes Insights et le Classement lisaient `chatter_daily.presence_active_h`, que plus
-- rien n'alimente depuis que MyPuls a retiré la colonne « Présence » de son résumé money-team
-- (0149 : la colonne vaut `null`). L'ingestion des insights transformait ce `null` en 0 : chaque
-- carte affichait « Présence 0h », et le quota de présence était MANQUÉ pour tout le monde — une
-- alerte fabriquée sur chaque chatteur, alors que des rendez-vous se prennent sur ces cartes.
--
-- LA SOURCE. Le relevé « Contrôle des shifts » (`mypuls_shift_segments`, 0138), déjà la seule
-- mesure de présence que regarde l'encadrement. Même grandeur que la page Relevé d'équipe
-- (« chatting actif », somme des `active_minutes`, cf. 0145) : les deux écrans doivent dire le
-- même chiffre. Clé `chatter_id` (= `chatters.id`, 0144), la même que `chatter_daily`.
--
-- POURQUOI UNE FONCTION. Une semaine fait ~20 000 segments : les rapatrier pour les additionner
-- côté application coûterait une vingtaine d'allers-retours paginés. L'agrégat se fait ici, et
-- rend une ligne par chatteur (~170).
--
-- `security invoker` : la RLS de `mypuls_shift_segments` s'applique à l'appelant. Seuls le worker
-- d'ingestion et le Classement l'appellent, tous deux en service-role — d'où l'exécution réservée
-- à `service_role`.

create or replace function public.mypuls_presence_by_chatter(p_from date, p_to date)
returns table (chatter_id uuid, active_minutes integer)
language sql stable security invoker set search_path = public
as $$
  select s.chatter_id, sum(s.active_minutes)::int
  from mypuls_shift_segments s
  where s.day between p_from and p_to
    and s.chatter_id is not null
  group by s.chatter_id
$$;

revoke all on function public.mypuls_presence_by_chatter(date, date) from public;
grant execute on function public.mypuls_presence_by_chatter(date, date) to service_role;

comment on function public.mypuls_presence_by_chatter(date, date) is
  'Minutes de chatting actif (relevé MyPuls, somme des segments) par chatteur entre deux jours inclus. '
  'Source de la présence des Insights et du Classement depuis 0174 — chatter_daily.presence_active_h '
  'est vide depuis le 2026-09-03 (0149). Ne dit rien des jours sans relevé : vérifier mypuls_shift_runs.';
