-- 0104 — Socle SQL de la pagination Spenders : une page de lignes, et les KPI à part.
--
-- 0103 a fait tomber `alertes` et `archive` à quelques lignes. Restent `liste` et `tracker`,
-- ~9 800 lignes et 4,4 Mo à chaque visite, que personne ne parcourt : on trie, on filtre, on
-- cherche. C'est ce que ces deux fonctions déplacent en base.
--
-- POURQUOI DEUX FONCTIONS. Les cartes KPI de la Liste (CA total, à relancer, alertes R10,
-- orphelins) portent sur TOUT le périmètre, pas sur la page affichée. Les calculer depuis une
-- page de 100 lignes donnerait des chiffres faux ; les recalculer côté client exigerait le jeu
-- complet, c'est-à-dire précisément ce qu'on supprime. Elles sont donc agrégées EN BASE, sur le
-- même périmètre (seuil, modèles), et ne transportent que huit nombres.
--
-- ── L'ORDRE TOTAL N'EST PAS UN DÉTAIL ───────────────────────────────────────────────────────
-- Un `order by ca_total desc` seul n'est PAS déterministe : deux spenders au même montant
-- peuvent sortir dans un ordre différent d'un appel à l'autre. Avec `offset`, ça se paie en
-- lignes vues deux fois et en lignes jamais vues — un bug d'infinite scroll invisible en
-- développement et permanent en production. Chaque tri se termine donc par la clé primaire
-- (creator_id, fan_id), qui rend l'ordre total.
--
-- Le tri est exprimé en `case` plutôt qu'en SQL dynamique : `language sql` reste INLINABLE, donc
-- STABLE et invoker — la RLS continue de s'appliquer ligne à ligne, comme pour `crm_spenders_
-- tracker`. Un `execute format(...)` aurait imposé plpgsql, coupé l'inlining, et ouvert une
-- surface d'injection sur un nom de colonne venu du client.
--
-- `p_models` vide = tous les modèles (le filtre de la barre d'outils, désormais serveur).
-- `p_search` cherche une sous-chaîne du pseudo, sans tenir compte de la casse.

create or replace function public.crm_spenders_page(
  p_seuil  numeric default 40,
  p_view   text    default 'liste',
  p_alerte int     default 10,
  p_models uuid[]  default '{}',
  p_search text    default '',
  p_sort   text    default 'ca',
  p_desc   boolean default true,
  p_limit  int     default 100,
  p_offset int     default 0
)
returns json
language sql
stable
set search_path to 'public'
as $function$
  with filtre as (
    select t.*
    from public.crm_spenders_tracker(p_seuil) t
    where case p_view
            when 'archive' then t.archived
            when 'alertes' then not t.archived and t.compteur_r >= p_alerte
            when 'tracker' then not t.archived and t.compteur_r <  p_alerte
            else not t.archived
          end
      and (coalesce(array_length(p_models, 1), 0) = 0 or t.creator_id = any(p_models))
      -- `strpos` plutôt qu'un `ilike '%…%'` : dans un motif LIKE, `%` et `_` sont des JOKERS.
      -- Chercher « _ » aurait ramené tous les pseudos, et « % » absolument tout — une recherche
      -- qui ment. Ici la saisie est du texte, pas un motif.
      and (coalesce(p_search, '') = '' or strpos(lower(t.username), lower(p_search)) > 0)
  ),
  page as (
    select *
    from filtre
    order by
      -- Un bloc par (colonne, sens) : les types diffèrent, ils ne peuvent pas partager un case.
      case when p_sort = 'ca'         and     p_desc then ca_total        end desc nulls last,
      case when p_sort = 'ca'         and not p_desc then ca_total        end asc  nulls last,
      case when p_sort = 'compteurR'  and     p_desc then compteur_r      end desc nulls last,
      case when p_sort = 'compteurR'  and not p_desc then compteur_r      end asc  nulls last,
      case when p_sort = 'lastMessage' and     p_desc then last_message_at end desc nulls last,
      case when p_sort = 'lastMessage' and not p_desc then last_message_at end asc  nulls last,
      case when p_sort = 'username'   and     p_desc then username        end desc nulls last,
      case when p_sort = 'username'   and not p_desc then username        end asc  nulls last,
      case when p_sort = 'model'      and     p_desc then model           end desc nulls last,
      case when p_sort = 'model'      and not p_desc then model           end asc  nulls last,
      -- Tri SECONDAIRE du tracker : à compteur égal, le plus gros CA d'abord (miroir de
      -- l'`initialSorting` de SpendersTable).
      case when p_sort = 'compteurR' then ca_total end desc nulls last,
      -- ORDRE TOTAL — voir l'avertissement en tête : sans ça, `offset` saute et répète des lignes.
      creator_id,
      fan_id
    limit greatest(0, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select json_build_object(
    -- `total` sert le libellé « N spender(s) » et la fin de scroll : il porte sur le périmètre
    -- filtré, pas sur la page.
    'total', (select count(*) from filtre),
    'rows',  (select coalesce(json_agg(row_to_json(page)), '[]'::json) from page)
  );
$function$;

revoke execute on function public.crm_spenders_page(numeric, text, int, uuid[], text, text, boolean, int, int) from public, anon;
grant execute on function public.crm_spenders_page(numeric, text, int, uuid[], text, text, boolean, int, int) to authenticated;


-- Cartes KPI de la Liste — mêmes définitions que le calcul client qu'elles remplacent :
--   à relancer  = actif, PAS déjà relancé aujourd'hui, compteur < alerte  (`isARelancer`)
--   alertes     = actif, compteur >= alerte
--   orphelins   = actif, sans chatteur résolu NI libellé d'assignation
-- Le périmètre suit le filtre modèle, comme les cartes le faisaient côté client.
create or replace function public.crm_spenders_kpis_json(
  p_seuil  numeric default 40,
  p_alerte int     default 10,
  p_models uuid[]  default '{}'
)
returns json
language sql
stable
set search_path to 'public'
as $function$
  with actifs as (
    select t.*
    from public.crm_spenders_tracker(p_seuil) t
    where not t.archived
      and (coalesce(array_length(p_models, 1), 0) = 0 or t.creator_id = any(p_models))
  )
  select json_build_object(
    'spenders',   count(*),
    'caTotal',    coalesce(sum(ca_total), 0),
    'aRelancer',  count(*) filter (where not coalesce(relance_today, false) and compteur_r < p_alerte),
    'alertesR10', count(*) filter (where compteur_r >= p_alerte),
    'orphelins',  count(*) filter (where chatter_name is null and assigned_label is null)
  )
  from actifs;
$function$;

revoke execute on function public.crm_spenders_kpis_json(numeric, int, uuid[]) from public, anon;
grant execute on function public.crm_spenders_kpis_json(numeric, int, uuid[]) to authenticated;
