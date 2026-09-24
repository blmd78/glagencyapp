-- 0173 — Toute modèle a une équipe, et un chatteur sans quotas garde sa carte Insights
-- (bug remonté par Benoit le 2026-09-24 : « aucune carte de chatteur » dans les Insights de
-- Juliette, qui a pourtant beaucoup de chatteurs).
--
-- CAUSE (mesurée sur la semaine du 14/09) : les quotas sont portés par l'ÉQUIPE d'une modèle
-- (`creators.team_id` → `quotas`, 0005). Les équipes ont été créées UNE fois, au démarrage ;
-- Juliette, Elsa et Romy, ajoutées ensuite à la main, n'en ont aucune — et aucun écran ni code
-- n'en crée. Le moteur des Insights sautait alors tout chatteur dont aucune modèle n'a de
-- quotas : 11 chatteurs ont fait du CA sur Juliette, UN seul avait une carte (il travaillait
-- aussi sur Julie). C'est la même racine que les chatteurs invisibles du Relevé d'équipe.
--
-- 1) Chaque modèle sans équipe en reçoit une, par son NOM DE BASE : « Carla (privé) » rejoint
--    l'équipe « Carla », comme les comptes privés d'origine. L'équipe est créée si elle n'existe
--    pas.
-- 2) Une équipe CRÉÉE ICI naît avec les quotas DE BASE (demande Benoit 2026-09-24 : « les mêmes
--    que les autres de base, à chaque création de modèle, tout auto ») : 7 h · 300 s · 10 médias ·
--    25 % · 80 €/j — la ligne commune à 6 équipes sur 13 (Claire, Emma, Jade, Maeva, Manon,
--    Mathilde), le plancher de toutes les autres. Ajustables ensuite dans Chatteurs › Quotas.
--    Une équipe existante n'en reçoit JAMAIS d'office : vider ses quotas dans l'écran reste un
--    choix respecté.
-- 3) La même règle s'applique à toute modèle créée plus tard (trigger) — c'est ce qui manquait.
-- 4) La gravité `unset` (« Sans quotas ») : la carte d'un chatteur qu'on ne peut pas juger (quotas
--    vidés à la main). Ses vrais chiffres, aucun verdict — plutôt que pas de carte du tout
--    (`quotas-hebdo.ts`). L'ancienne règle « une équipe sans quotas est ignorée par les cartes »
--    (0005) tombe.

-- ── Nom de base d'une modèle : sans le suffixe entre parenthèses ───────────────────────────
create or replace function public.creator_base_name(p_name text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(coalesce(p_name, ''), '\s*\([^)]*\)\s*$', ''));
$$;

-- ── Les quotas de base d'une équipe neuve ───────────────────────────────────────────────────
-- Seul endroit où vivent ces valeurs : les changer ici (nouvelle migration) si la base bouge.
create or replace function public.team_default_quotas(p_team uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into quotas (team_id, presence_h, reactivite_s, medias_proposes, conv_pct, ca_eur)
  values (p_team, 7, 300, 10, 25, 80)
  on conflict (team_id) do nothing;
$$;
revoke all on function public.team_default_quotas(uuid) from public;

-- ── L'équipe d'une modèle : trouvée par son nom de base, créée au besoin ────────────────────
create or replace function public.team_for_creator_name(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text := public.creator_base_name(p_name);
  v_id   uuid;
begin
  if v_base = '' then
    return null;
  end if;
  select id into v_id from teams where lower(name) = lower(v_base) limit 1;
  if v_id is null then
    insert into teams (name) values (v_base) on conflict (name) do nothing returning id into v_id;
    if v_id is not null then
      perform public.team_default_quotas(v_id);
    else
      -- Course avec une création concurrente : l'équipe existe maintenant, on la relit.
      select id into v_id from teams where name = v_base;
    end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.team_for_creator_name(text) from public;

-- ── Rattrapage : les modèles d'aujourd'hui sans équipe ──────────────────────────────────────
update public.creators
   set team_id = public.team_for_creator_name(name)
 where team_id is null;

-- Les équipes nées d'une première version de cette migration (UAT) n'avaient pas encore de quotas.
-- Aucune équipe d'origine n'est concernée : les 13 en ont toutes (vérifié en prod le 2026-09-24).
select public.team_default_quotas(t.id)
  from public.teams t
 where not exists (select 1 from public.quotas q where q.team_id = t.id)
   and exists (select 1 from public.creators c where c.team_id = t.id)
   and t.name in ('Juliette', 'Elsa', 'Romy');

-- ── Et toutes celles à venir ─────────────────────────────────────────────────────────────────
create or replace function public.creators_assign_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_id is null then
    new.team_id := public.team_for_creator_name(new.name);
  end if;
  return new;
end;
$$;

drop trigger if exists creators_assign_team on public.creators;
create trigger creators_assign_team
  before insert or update of team_id on public.creators
  for each row execute function public.creators_assign_team();

-- ── La gravité « Sans quotas » ──────────────────────────────────────────────────────────────
alter table public.insights drop constraint if exists insights_severity_check;
alter table public.insights add constraint insights_severity_check
  check (severity in ('critical', 'warning', 'ok', 'unset'));
