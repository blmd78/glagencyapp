-- 0116 — Formation : correctifs issus de l'audit complémentaire du 2026-08-21.
--
-- Cette migration est SÛRE À APPLIQUER AVANT le déploiement du code : elle n'enlève aucun droit et
-- ne change aucune signature. (La révocation de lecture sur `training_messages` vit à part, en
-- 0117, précisément parce qu'elle DOIT suivre le déploiement — voir son en-tête.)

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Le trigger de stats ne dépend plus du SEUL `scored_at`.
--
-- Pourquoi : la fenêtre du classement hebdomadaire (`training_weekly_ranking`) est bornée sur
-- `scored_at`, et ce classement distribue de vrais euros (tickets de roue). La re-notation admin
-- déplaçait `scored_at` à aujourd'hui : la session sortait d'une semaine DÉJÀ PAYÉE et entrait dans
-- la semaine en cours, où elle pouvait ouvrir un 2e ticket pour le même travail. Le code fige
-- désormais `scored_at` sur un rescore — il faut donc que le trigger se déclenche AUSSI quand seuls
-- `total` / `objective_reached` changent, sinon `training_case_bests` et `training_profile_stats`
-- ne seraient plus recalculés après une re-notation (une re-notation à la baisse resterait
-- invisible, à rebours de ce que promet le bouton « Re-noter »).
--
-- Effet voulu en prime : `training_refresh_stats` reçoit le jour d'ORIGINE de la partie, donc une
-- re-notation faite le lendemain n'incrémente plus la série (`streak_days`) ni les jours actifs.
drop trigger if exists trg_training_session_scored on public.training_sessions;
create trigger trg_training_session_scored
  after update of status, scored_at, total, objective_reached on public.training_sessions
  for each row
  when (new.status = 'scored' and (
           old.status is distinct from 'scored'
        or old.scored_at is distinct from new.scored_at
        or old.total is distinct from new.total
        or old.objective_reached is distinct from new.objective_reached))
  execute function public.training_on_session_scored();

comment on trigger trg_training_session_scored on public.training_sessions is
$cmt$UPDATE-only : session créée en 'active' puis passée 'scored' ; une re-notation admin NE déplace PAS scored_at (la fenêtre hebdo, donc l'argent de la roue, est bornée dessus) — le trigger se déclenche alors sur le changement de total/objective_reached$cmt$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Blocklist du recrutement : distinguer une décision d'ADMIN d'un blocage posé par le TEST.
--
-- Pourquoi : l'e-mail et le pseudo Discord d'un candidat ne sont JAMAIS vérifiés (aucune
-- confirmation dans le parcours `/postuler`). Une ligne posée automatiquement à la soumission
-- bloquait donc la VICTIME dont on avait saisi l'adresse, pas le tricheur — et elle ne le
-- découvrait qu'après avoir joué tout le test. Le `device`, lui, reste refusé quelle que soit
-- l'origine : c'est notre identifiant, pas une valeur déclarée par le candidat.
--
-- `source` plutôt que de déduire l'origine de `created_by` : cette colonne est en `on delete set
-- null` (départ d'un admin), la déduction se serait dégradée en silence.
alter table public.recruit_blocklist
  add column if not exists source text not null default 'test' check (source in ('test', 'admin'));

-- Rétroactif : les lignes existantes portant un auteur sont des décisions d'agence.
update public.recruit_blocklist set source = 'admin' where created_by is not null and source <> 'admin';

comment on column public.recruit_blocklist.source is
$cmt$qui a posé la ligne : « test » (soumission automatique, e-mail/Discord NON vérifiés) ou « admin » (décision d'agence). Seul « admin » refuse sur e-mail/Discord ; le device refuse dans les deux cas$cmt$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Boss final : le contexte annoncé au chatter décrit enfin le comportement réel.
--
-- Le texte du seed vient de Good Luck Agency, où il était exact : une faute grave sur UNE
-- conversation coupait l'examen entier. Notre moteur diverge DÉLIBÉRÉMENT (spec du 2026-08-18) —
-- la conversation fautive passe `lost` et vaut 0, les quatre autres continuent, la note du boss est
-- la moyenne des cinq. Le texte mentait donc au chatter et le poussait à abandonner après sa
-- première faute : on corrige le TEXTE, pas le moteur.
update public.training_cases
set    context    = 'Cinq fans t''écrivent en même temps, chacun avec son prénom, son caractère et son budget. Sur CHAQUE conversation tu dois tout dérouler en mode hard : setting → transition → sexting + pushs → rencontre → négo → relationnel. Ils répondent en décalé. Une faute à côté de la plaque et le fan te lâche : cette conversation-là est perdue et compte 0 — les autres continuent, ta note finale est la moyenne des cinq.',
       updated_at = now()
where  kind = 'boss'
  and  context like '%tout le boss recommence%';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Roue : l'octroi des tickets ne dépend plus de la visite d'une page.
--
-- Constat : `claimTicket` était le SEUL écrivain de `training_wheel_tickets`, et il n'était
-- déclenché qu'au montage de `/formation/roue`, pour la seule semaine précédente et pour le SEUL
-- visiteur. Un chatter du top 3 qui ne visitait pas la page cette semaine-là perdait son tour sans
-- aucune trace.
--
-- Correctif volontairement MINIMAL : pas de pg_cron (jamais installé ni recetté sur ce projet), mais
-- une fonction d'octroi GLOBALE et IDEMPOTENTE. La visite de n'importe quel chatter attribue les
-- tickets de TOUT LE MONDE — pour qu'un top 3 perde encore son tour, il faudrait que personne de la
-- face n'ouvre la page de la semaine.

-- Noyau du classement SANS la clause de visibilité de `training_weekly_ranking`.
-- POURQUOI un jumeau : `training_weekly_ranking` se termine par
-- `and ((select is_admin()) or (select has_page('formation')))` — une garde qui interroge le JWT de
-- l'appelant. Appelée depuis un contexte serveur sans JWT (service-role, ou un job), elle renvoie
-- ZÉRO ligne : l'octroi n'aurait jamais rien distribué, en silence. Ce jumeau est donc réservé au
-- serveur (exécution révoquée à tous les rôles clients), et il ne SORT rien : il n'est lu que par
-- `training_wheel_grant_week` ci-dessous.
create or replace function public.training_wheel_ranking_raw(p_week date)
returns table (profile_id uuid, points integer, rn bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bounds as (
    select (p_week::timestamp at time zone 'Europe/Paris') as t0,
           ((p_week + 7)::timestamp at time zone 'Europe/Paris') as t1
  ),
  best as (
    select s.profile_id, s.case_id, max(s.total) as best_total, min(s.scored_at) as first_at
    from training_sessions s
    join training_cases c on c.id = s.case_id
    cross join bounds b
    where s.status = 'scored' and s.total is not null and c.kind <> 'boss'
      and s.scored_at >= b.t0 and s.scored_at < b.t1
    group by s.profile_id, s.case_id
  ),
  agrege as (
    select b.profile_id,
           sum(b.best_total)::integer as points,
           round(avg(b.best_total), 2) as avg_total,
           min(b.first_at) as first_at
    from best b
    join profiles p on p.id = b.profile_id
    where p.left_at is null and p.role = 'chatteur'
    group by b.profile_id
  )
  -- Même ordre que `training_weekly_ranking` (points, puis moyenne, puis antériorité) : les deux
  -- classements doivent désigner les mêmes gagnants, sinon la page et l'octroi se contrediraient.
  select a.profile_id, a.points,
         row_number() over (order by a.points desc, a.avg_total desc nulls last, a.first_at asc)
  from agrege a;
$$;

revoke all on function public.training_wheel_ranking_raw(date) from public, anon, authenticated;

comment on function public.training_wheel_ranking_raw(date) is
$cmt$classement hebdo SANS clause de visibilité (celle de training_weekly_ranking lit le JWT et rendrait 0 ligne côté serveur) — usage interne à l'octroi de tickets, révoqué aux rôles clients$cmt$;

-- Octroi idempotent. `p_top` est passé par l'appelant (constante `WHEEL_TOP_N` du domaine) plutôt
-- que redéfini ici : une valeur en dur de plus se serait désynchronisée du reste.
create or replace function public.training_wheel_grant_week(p_week date, p_top integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  -- `on conflict do nothing` SANS cible : il absorbe les DEUX unicités — (profil, semaine) et
  -- l'index partiel « un seul ticket non utilisé par personne ». Un chatter qui a déjà un tour en
  -- attente n'en reçoit donc pas un second, ce qui est la règle voulue.
  -- `points > 0` : la MÊME porte que `training_wheel_pending` — un top 3 à 0 point n'a pas de tour.
  with insere as (
    insert into public.training_wheel_tickets (profile_id, week, reason)
    select r.profile_id, p_week, 'Top ' || r.rn || ' — semaine du ' || to_char(p_week, 'DD/MM')
    from public.training_wheel_ranking_raw(p_week) r
    where r.rn <= p_top and r.points > 0
    on conflict do nothing
    returning 1
  )
  select count(*) into v_count from insere;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.training_wheel_grant_week(date, integer) from public, anon, authenticated;

comment on function public.training_wheel_grant_week(date, integer) is
$cmt$octroie les tickets du top p_top d'une semaine (idempotent) — appelée par la Server Action de la roue pour TOUS les chatters, pas seulement le visiteur$cmt$;
