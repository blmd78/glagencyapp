-- 0108 — Journal des membres réservé aux ADMINS + durcissements relevés à l'audit 2026-08-06.
--
-- ── 1) member_events : lecture ADMIN seulement ──────────────────────────────────────────────
-- Décision Benoit 2026-08-06. Depuis 0101 la lecture était admin OU manager ; or le journal
-- porte désormais le contenu des sanctions/rapports supprimés (0106/0107) de TOUS les modèles,
-- alors que le Tracker et le Rapport sont cloisonnés par modèle pour les managers — le journal
-- était un canal de contournement du périmètre. Fermer la lecture aux admins règle la fuite à
-- la racine. Miroir UI : l'onglet Activité de Membres est masqué aux managers (members-tabs),
-- et un `?vue=activite` forgé retombe sur la liste (page.tsx).

drop policy member_events_read on public.member_events;
create policy member_events_read on public.member_events for select to authenticated
  using (public.is_admin());

-- ── 2) SECURITY DEFINER : `pg_temp` forcé en DERNIER dans le search_path ────────────────────
-- Doc Postgres (CREATE FUNCTION) : sans `pg_temp` explicite, le schéma temporaire est cherché
-- EN PREMIER — une fonction definer peut se faire ombrer ses tables/fonctions par des objets
-- temporaires. Exploitation improbable via PostgREST, mais le durcissement est standard et
-- GRATUIT : un `ALTER FUNCTION ... SET` ne touche pas les corps. Balayage de TOUTES les
-- fonctions definer du schéma public encore en `search_path=public` (dette répliquée par
-- copier-coller depuis les premières migrations — réglée d'un coup plutôt que fonction par
-- fonction au fil de l'eau).
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proconfig is not null
      and 'search_path=public' = any (p.proconfig)
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end;
$$;

-- ── 3) police_entries : la base cesse de croire l'app sur parole ────────────────────────────
-- `error_key` était un `text` libre et `note` sans borne : la validation ne vivait que dans
-- Zod, et un INSERT PostgREST direct pouvait forger la valeur — donc la phrase du journal
-- (0106) qui s'en compose. `NOT VALID` : les contraintes ne s'appliquent qu'aux NOUVELLES
-- écritures — les sanctions historiques (clés d'anciennes listes) ne bougent pas.
-- Miroir : `POLICE_ERRORS` (@glagency/core, domain/police-errors.ts) — toute clé ajoutée
-- là-bas doit l'être ici.
alter table public.police_entries add constraint police_entries_error_key_check
  check (error_key is null or error_key in (
    'media_argent', 'reactivite', 'media_rapide', 'fautes', 'setter_lent', 'hors_script',
    'sexu_faible', 'promesse', 'temps_media', 'infos_non_transmises', 'infos_non_notees',
    'relance_spendeur', 'relance_ppv', 'horaires'
  )) not valid;

alter table public.police_entries add constraint police_entries_note_check
  check (note is null or char_length(note) <= 500) not valid;
