-- 0073 — RPC transactionnelle pour l'upsert d'un rapport du soir + ses lignes chatteur.
-- Remplace le delete-then-insert non atomique côté application (si l'insert des lignes échouait
-- après le delete, le rapport restait momentanément sans lignes). Une fonction plpgsql = une
-- transaction : upsert de l'en-tête + remplacement complet des lignes deviennent tout-ou-rien.
-- SECURITY INVOKER → la RLS de 0071 s'applique aux statements (l'appelant ne peut écrire que son
-- propre rapport : `author_id = auth.uid()` + droit d'écriture de la page). L'auteur est pris de
-- `auth.uid()` (jamais du client). `p_lines` = tableau jsonb [{chatter_id, a_marche, a_regler}].
create or replace function public.upsert_police_report(
  p_creator_id   uuid,
  p_day          date,
  p_ca           integer,
  p_non_traitees integer,
  p_absents      integer,
  -- `default` sur les params optionnels → générés `optional` par supabase gen types (le TS peut
  -- passer `undefined` pour une alerte absente). En PG, un param à défaut impose un défaut aux
  -- suivants, d'où le défaut sur `p_lines` aussi.
  p_alerte       text  default null,
  p_lines        jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_report_id uuid;
begin
  insert into public.police_reports
    (author_id, creator_id, day, ca, non_traitees, absents, alerte, updated_at)
  values
    (auth.uid(), p_creator_id, p_day, p_ca, p_non_traitees, p_absents, p_alerte, now())
  on conflict (author_id, creator_id, day) do update set
    ca           = excluded.ca,
    non_traitees = excluded.non_traitees,
    absents      = excluded.absents,
    alerte       = excluded.alerte,
    updated_at   = now()
  returning id into v_report_id;

  -- Remplacement complet des lignes (la fiche du soir est renvoyée entière à chaque soumission).
  delete from public.police_report_lines where report_id = v_report_id;

  insert into public.police_report_lines (report_id, chatter_id, a_marche, a_regler)
  select
    v_report_id,
    (l ->> 'chatter_id')::uuid,
    nullif(l ->> 'a_marche', ''),
    nullif(l ->> 'a_regler', '')
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as l;

  return v_report_id;
end;
$$;

-- Convention 0060 : on ferme l'exécution à `public` puis on l'ouvre aux seuls authentifiés.
revoke all on function public.upsert_police_report(uuid, date, integer, integer, integer, text, jsonb) from public;
grant execute on function public.upsert_police_report(uuid, date, integer, integer, integer, text, jsonb) to authenticated;
