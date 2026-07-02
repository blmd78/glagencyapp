-- Active la RLS sur toutes les tables `public` et autorise la LECTURE aux utilisateurs
-- AUTHENTIFIÉS uniquement. Contexte :
--   - le web lit via la session Supabase (@supabase/ssr) = rôle `authenticated` ;
--   - le web n'écrit JAMAIS (0 insert/update/delete) → aucune policy d'écriture nécessaire ;
--   - l'ingestion écrit via la clé service-role (BYPASS RLS) → inchangée.
-- Effet : la clé publishable (anon) ne peut plus rien lire (avant : toute la base — CA,
-- chatteurs, modèles — était lisible publiquement).
-- Étape suivante (P1) : cloisonner par modèle via profile_creators au lieu de `using (true)`.

do $$
declare
  t text;
begin
  foreach t in array array[
    'chatter_alias', 'chatter_creator_daily', 'chatter_creators', 'chatter_daily',
    'chatter_daily_reach', 'chatters', 'creator_daily', 'creators',
    'period_snapshot_kpi', 'profile_creators', 'profiles', 'teams'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_auth_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_auth_read', t
    );
  end loop;
end $$;
