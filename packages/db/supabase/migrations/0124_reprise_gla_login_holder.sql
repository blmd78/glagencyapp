-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 0124 — la normalisation d'un login GLA reste à Postgres, PARTOUT
-- Spec : docs/superpowers/specs/2026-08-24-formation-reprise-gla-design.md §3.1
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- §3.1 est catégorique : la mise en minuscules d'un login est faite PAR POSTGRES, jamais par
-- `String.toLowerCase()`. 7 logins GLA contiennent du non-ASCII et les deux implémentations ne
-- suivent pas les mêmes règles Unicode ; une divergence entre elles est l'un des trois chemins qui
-- mènent au mode d'échec silencieux de §3.9.
--
-- 0123 tient la règle sur le chemin de réclamation (`claim_begin` et `claim_settle` normalisent en
-- `lower(btrim(...))`). Le FILET ADMIN la contournait : pour dire « « xxx » est déjà rattaché à
-- Marie D. », `features/members/legacy-link.ts` abaissait la casse en JS avant un `.eq(login_key)`.
-- Aucune conséquence sur l'unicité — elle est tenue par la contrainte `login_key unique`, pas par
-- ce chemin de lecture — mais un message dégradé (« un autre membre » au lieu du nom) le jour où
-- les deux normalisations divergent, et une règle de sécurité à moitié appliquée n'est pas une
-- règle. D'où cette fonction : le seul lecteur de `login_key` par login BRUT, en SQL.
--
-- `security definer` + `service_role` uniquement, comme les trois RPC de 0123 : la table dit QUI a
-- réclamé QUEL ancien compte, et sa policy de lecture (0123:94) est déjà réservée au propriétaire
-- et aux admins. La garde applicative est celle de l'action appelante (`requireAdminProfileLive`).

create or replace function public.training_legacy_login_holder(p_login text)
returns table (profile_id uuid, display_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.profile_id, p.display_name
    from public.training_legacy_claims c
    join public.profiles p on p.id = c.profile_id
   where c.login_key = lower(btrim(p_login))
$$;

revoke all on function public.training_legacy_login_holder(text) from public, anon, authenticated;
grant execute on function public.training_legacy_login_holder(text) to service_role;
comment on function public.training_legacy_login_holder(text) is
  $cmt$qui détient ce login GLA — la normalisation (lower/btrim) est faite ICI, jamais en JS (§3.1). service-role uniquement$cmt$;
