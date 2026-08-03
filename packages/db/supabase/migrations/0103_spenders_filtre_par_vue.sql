-- 0103 — Chaque vue Spenders ne rapatrie que SES lignes.
--
-- L'INCIDENT : `statement timeout` sur /chatter/spenders/alertes, 10 fois en trois jours
-- (Sentry, release 2.0/2.1). Le RPC n'est pas lent en soi — il est appelé trop souvent et
-- rapporte trop.
--
-- Les quatre pages (liste, tracker, alertes, archive) passent toutes par le MÊME
-- `getSpenders()`, donc la même agrégation, puis filtrent CÔTÉ CLIENT. Mesuré en production
-- sur les 9 814 lignes au-dessus du seuil :
--
--   vue      | lignes affichées | ce qui était rapatrié
--   ---------|------------------|----------------------
--   liste    |            9 814 | 9 814  (légitime)
--   tracker  |            9 780 | 9 814  (quasi tout, gain nul)
--   alertes  |               34 | 9 814  ← 289× trop
--   archive  |                0 | 9 814  ← une page vide qui coûte 4,4 Mo
--
-- Le filtre n'économise pas que du transfert : `crm_spenders_tracker` étant `language sql`
-- STABLE, elle est INLINABLE, donc le prédicat descend dans la requête. Mesuré :
--   json complet 260 ms / 4,4 Mo · filtre alertes 78 ms · filtre archive 75 ms.
--
-- CE QUE ÇA NE RÈGLE PAS : `liste` et `tracker` rapportent toujours ~9 800 lignes — pour
-- elles, le levier est la pagination serveur, un chantier à part. Cette migration retire deux
-- des quatre chargements lourds ; la sidebar a par ailleurs cessé de précharger ces pages en
-- boucle, ce qui était le multiplicateur.
--
-- LES SEUILS VIENNENT DU CLIENT, comme `p_seuil` le faisait déjà : `CA_TRACKING_SEUIL` et
-- `R_ALERTE` vivent dans features/spenders/types.ts. Les redéclarer ici créerait deux sources
-- de vérité pour un chiffre qui décide de ce qu'un chatteur voit.
--
-- RLS INCHANGÉE : `crm_spenders_tracker` reste STABLE non-DEFINER, donc invoker de bout en
-- bout — le cloisonnement par modèle continue de s'appliquer sous le filtre.
--
-- Les paramètres ajoutés ont un DEFAULT : l'ancien appel `{p_seuil}` reste valide pendant le
-- déploiement (le code part après la migration), et rend alors la vue `liste`, l'ancien
-- comportement à l'archivé près.

-- DROP D'ABORD, sans quoi `create or replace` avec des paramètres EN PLUS crée une SURCHARGE
-- au lieu de remplacer : les deux signatures coexisteraient et PostgREST, appelé avec le seul
-- `p_seuil`, ne saurait laquelle choisir (PGRST203). Les nouveaux paramètres ayant un DEFAULT,
-- l'ancien appel continue de résoudre vers celle-ci pendant la fenêtre migration → déploiement.
drop function if exists public.crm_spenders_tracker_json(numeric);

create function public.crm_spenders_tracker_json(
  p_seuil numeric default 40,
  p_view text default 'liste',
  p_alerte int default 10
)
returns json
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  from public.crm_spenders_tracker(p_seuil) t
  where case p_view
          when 'archive' then t.archived
          when 'alertes' then not t.archived and t.compteur_r >= p_alerte
          when 'tracker' then not t.archived and t.compteur_r <  p_alerte
          else not t.archived            -- 'liste' et toute valeur inattendue
        end;
$function$;

revoke execute on function public.crm_spenders_tracker_json(numeric, text, int) from public, anon;
grant execute on function public.crm_spenders_tracker_json(numeric, text, int) to authenticated;
