-- 0157 — `training_ai_cost` apprend enfin à borner sa FIN.
--
-- Constaté le 2026-09-14 en relisant la page Analytics IA : le tableau « par modèle » — celui
-- qui porte le diagnostic de cache, c'est-à-dire la raison d'être de la page — ne comptait pas
-- la même chose que le reste de l'écran.
--
-- 0156 a recréé `training_ai_daily`, `training_ai_by_chatter` et `training_ai_by_case` avec
-- `p_until`, et a OUBLIÉ celle-ci : héritée de 0113 puis refaite en 0141, elle en était restée à
-- `where created_at >= p_since`, sans borne haute. Sur une période « août », le graphe montrait
-- 22 390 appels quand le tableau par modèle en affichait 168 696 — 7,5 fois plus, tout ce qui a
-- été consommé depuis, jusqu'à aujourd'hui. Deux chiffres contradictoires sur le même écran.
--
-- Même convention que 0156 : `[p_since, p_until)`, borne haute EXCLUE, pour qu'un appel de 23h59
-- le dernier jour compte et qu'aucun ne soit compté deux fois sur deux périodes adjacentes.
--
-- SIGNATURE CHANGÉE plutôt que surcharge ajoutée, comme 0156 l'a fait pour les trois autres :
-- deux fonctions de même nom laisseraient PostgREST résoudre l'appel sur les seuls noms de
-- paramètres, et un appelant qui oublie `p_until` retomberait en silence sur l'ancienne — le
-- bug qu'on est en train de corriger. D'où le `drop` préalable, qui emporte aussi ses grants.
--
-- DEUX APPELANTS à migrer dans le même commit : la page Analytics IA (`get-ai-usage.ts`), qui
-- passe désormais les bornes du sélecteur de dates, et l'Overview Formation
-- (`get-overview.ts`), dont la fenêtre glissante « N derniers jours » prend simplement DEMAIN
-- comme borne haute — sans quoi les appels de la minute en cours tomberaient hors fenêtre.

drop function if exists public.training_ai_cost(timestamptz);

create or replace function public.training_ai_cost(p_since timestamptz, p_until timestamptz)
returns table (
  day date,
  model text,
  kind text,
  calls integer,
  input_tokens bigint,
  output_tokens bigint,
  cache_read_tokens bigint,
  cache_write_tokens bigint
)
language sql stable security invoker set search_path = public, pg_temp
as $$
  -- Jour de PARIS et non UTC : une journée d'entraînement est une journée d'agence (0154).
  select (created_at at time zone 'Europe/Paris')::date, model, kind, count(*)::integer,
         sum(input_tokens), sum(output_tokens), sum(cache_read_tokens), sum(cache_write_tokens)
  from training_ai_calls
  where created_at >= p_since and created_at < p_until
  group by 1, 2, 3
  order by 1 desc, 2, 3;
$$;

-- `security invoker` : la RLS `training_ai_calls_admin_read` (is_admin) ferme la table, un
-- non-admin exécute la fonction et lit zéro ligne. Rien ici n'a besoin de contourner la RLS.
revoke all on function public.training_ai_cost(timestamptz, timestamptz) from public, anon;
grant execute on function public.training_ai_cost(timestamptz, timestamptz) to authenticated;

comment on function public.training_ai_cost(timestamptz, timestamptz) is
  'Usage IA par jour × modèle × sorte sur [p_since, p_until). Borne haute EXCLUE (0157).';
