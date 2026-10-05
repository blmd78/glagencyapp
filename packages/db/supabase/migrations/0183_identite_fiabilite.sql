-- 0183 — Identité chatteur par id MyPuls + contrôles de fiabilité nocturnes.
-- Spec : docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md (version fiabilité)
-- Test : packages/db/supabase/tests/0183_identite_fiabilite.test.sql (UAT, transaction annulée)
--
-- Livre les OUTILS, pas la donnée : les fusions passent par un lot validé par Benoit
-- (`pnpm identity-backfill --lot=… --apply`) ; rien ici ne dépend de l'état de la prod.
--
-- 1. `chatter_identity_issues` : anomalies d'identité (ingestion + rattrapage, service role), lues
--    par l'admin (Membres › Fiches MyPuls). Une fusion efface celles de la fiche vidée.
-- 2. `ingest_day_checks` : UNE ligne par jour ingéré — statut ok / a_verifier et détail des trois
--    contrôles (a résumé = ventes par compte, b totaux, c une fiche = un compte). Upsert : rejouer
--    un jour remplace son verdict.
-- 3. `apply_chatter_identity` : pose d'ids sur des fiches qui n'en ont pas (collision refusée et
--    RENDUE) + upsert des anomalies.
-- 4. `finish_chatter_day` : fin d'une journée d'ingestion, en UN appel (budget Worker) — ids et
--    anomalies, puis b1/b2 calculés EN BASE (Σ chatter_daily, Σ chatter_creator_daily du jour)
--    contre ce qui a été lu, puis verdict du jour.
-- 5. `merge_chatters` : reprise ligne à ligne de la v2 du script de fusion du 2026-10-01
--    (/tmp/fusion/fusion.sh). La fiche vidée est GARDÉE (écart à trancher en revue de PR).
-- 6. `delete_empty_chatter` : supprime une fiche que rien ne référence (fiches corrompues).
-- 7. Lectures de l'onglet (SECURITY INVOKER, la RLS s'applique) : `unattributed_sales` (ventes
--    sans chatteur), `unranked_chatters_ca` (CA sans membre « chatteur » = absent du classement
--    Stat chatter), `reliability_days` (statut des N derniers jours ingérés).
--
-- DROITS. Les sept fonctions sont SECURITY INVOKER, `search_path` figé. Les quatre d'écriture (3 à
-- 6) sont réservées à `service_role` : il a déjà les droits sur les tables et passe la RLS, un
-- SECURITY DEFINER n'ajouterait qu'un risque d'élévation de privilèges ; elles écrivent dans des
-- tables de faits et ne doivent jamais être appelables depuis le navigateur. Les default
-- privileges Supabase donnent EXECUTE à anon/authenticated/service_role à la création de chaque
-- fonction (0088) ; 0088 a retiré anon et PUBLIC du défaut, mais ce n'est pas garanti partout
-- (constaté sur l'UAT, cf. 0111) et authenticated le garde : on révoque donc explicitement.
-- Les trois lectures (7) sont ouvertes à `authenticated` (la RLS s'applique).

-- ─── 1. Anomalies d'identité ─────────────────────────────────────────────────────────────────
-- `kind` : miroir EXACT de `IdentityIssueKind` (packages/core/src/ingest/identity-types.ts) —
-- toute valeur ajoutée d'un côté doit l'être de l'autre. Les noms de clés étrangères par défaut
-- (`chatter_identity_issues_chatter_id_fkey`, `…_other_chatter_id_fkey`) sont lus par l'onglet.
create table if not exists public.chatter_identity_issues (
  id               uuid primary key default gen_random_uuid(),
  issue_key        text not null unique,
  kind             text not null check (kind in ('doublon', 'membres_multiples', 'homonyme', 'conflit_id',
                                                 'fiche_creee', 'resume_mis_de_cote', 'ecart_invariant')),
  mypuls_user_id   text,
  label            text,
  chatter_id       uuid references public.chatters(id) on delete cascade,
  other_chatter_id uuid references public.chatters(id) on delete cascade,
  day              date,
  amount           numeric(12,2),
  detail           text not null,
  source           text not null default 'ingestion' check (source in ('ingestion', 'rattrapage')),
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by      uuid references public.profiles(id) on delete set null
);
create index if not exists chatter_identity_issues_open_idx
  on public.chatter_identity_issues (last_seen_at desc) where resolved_at is null;
create index if not exists chatter_identity_issues_chatter_idx on public.chatter_identity_issues (chatter_id);
create index if not exists chatter_identity_issues_other_idx on public.chatter_identity_issues (other_chatter_id);
-- Clé étrangère indexée, comme les autres (0055).
create index if not exists chatter_identity_issues_resolved_by_idx on public.chatter_identity_issues (resolved_by);

-- Lecture et « Vu » : admin seulement (comme member_events, 0108). Écriture : service role.
alter table public.chatter_identity_issues enable row level security;
create policy chatter_identity_issues_admin_read on public.chatter_identity_issues
  for select to authenticated using ((select public.is_admin()));
-- `with check` : le « Vu » est signé par l'admin connecté lui-même, jamais au nom d'un autre.
create policy chatter_identity_issues_admin_ack on public.chatter_identity_issues
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and (resolved_by is null or resolved_by = (select auth.uid())));
-- Le « Vu » ne touche QUE ces deux colonnes : la policy UPDATE seule ouvrirait aussi `kind`,
-- `detail`, les fiches… (même parti pris que 0029, grant de colonnes).
revoke update on public.chatter_identity_issues from anon, authenticated;
grant update (resolved_at, resolved_by) on public.chatter_identity_issues to authenticated;

-- ─── 2. Contrôles par jour ingéré ────────────────────────────────────────────────────────────
-- `checks` : [{code, ok, detail}]. Codes : `a_resume_ventes`, `b_total_page`, `c_fiche_compte`
-- (calculés par dayChecks, @glagency/core, reçus dans `p_checks`) ; `b_resume_ecrit`,
-- `b_ventes_ecrites`, `c_lien_refuse` (calculés ici, en base). Un jour sans ligne ressort
-- « non_verifie » à la lecture (`reliability_days`), jamais stocké.
create table if not exists public.ingest_day_checks (
  day        date primary key,
  status     text not null check (status in ('ok', 'a_verifier')),
  checks     jsonb not null default '[]'::jsonb,
  totals     jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);
alter table public.ingest_day_checks enable row level security;
create policy ingest_day_checks_admin_read on public.ingest_day_checks
  for select to authenticated using ((select public.is_admin()));

-- ─── 3. Pose d'ids + anomalies ───────────────────────────────────────────────────────────────
-- `p_links` : [{chatter_id, mypuls_user_id}] — n'écrit l'id que sur une fiche qui n'en a pas.
-- Refusé et RENDU : id vide, déjà porté par une AUTRE fiche, ou fiche introuvable / porteuse
-- d'un autre id. Déjà porté par CETTE fiche (rejeu) : rien, ni posé ni refusé.
-- `p_issues` : lignes `IdentityIssueDbRow` (core), upsert sur `issue_key` ; un « Vu » reste vu.
-- Une même clé deux fois dans l'appel : la DERNIÈRE l'emporte (sinon l'upsert échouerait en entier,
-- « ON CONFLICT DO UPDATE command cannot affect row a second time »).
create or replace function public.apply_chatter_identity(p_links jsonb, p_issues jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_linked  int := 0;
  v_refused jsonb := '[]'::jsonb;
  v_link    record;
begin
  for v_link in
    select l.chatter_id, l.mypuls_user_id
      from jsonb_to_recordset(coalesce(p_links, '[]'::jsonb)) as l(chatter_id uuid, mypuls_user_id text)
  loop
    if exists (select 1 from chatters c
                where c.id = v_link.chatter_id and c.mypuls_user_id = v_link.mypuls_user_id) then
      continue;
    end if;
    if v_link.chatter_id is null or coalesce(v_link.mypuls_user_id, '') = ''
       or exists (select 1 from chatters c where c.mypuls_user_id = v_link.mypuls_user_id) then
      v_refused := v_refused || jsonb_build_object('chatter_id', v_link.chatter_id,
                                                   'mypuls_user_id', v_link.mypuls_user_id);
      continue;
    end if;
    update chatters c set mypuls_user_id = v_link.mypuls_user_id
     where c.id = v_link.chatter_id and c.mypuls_user_id is null;
    if found then
      v_linked := v_linked + 1;
    else
      v_refused := v_refused || jsonb_build_object('chatter_id', v_link.chatter_id,
                                                   'mypuls_user_id', v_link.mypuls_user_id);
    end if;
  end loop;

  insert into chatter_identity_issues
    (issue_key, kind, mypuls_user_id, label, chatter_id, other_chatter_id, day, amount, detail, source)
  select distinct on (x.e->>'issue_key')
         x.e->>'issue_key', x.e->>'kind', x.e->>'mypuls_user_id', x.e->>'label',
         (x.e->>'chatter_id')::uuid, (x.e->>'other_chatter_id')::uuid, (x.e->>'day')::date,
         (x.e->>'amount')::numeric, x.e->>'detail', coalesce(x.e->>'source', 'ingestion')
    from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb)) with ordinality as x(e, o)
   order by x.e->>'issue_key', x.o desc
  on conflict (issue_key) do update
    set last_seen_at = now(), day = excluded.day, amount = excluded.amount, detail = excluded.detail;

  return jsonb_build_object('linked', v_linked, 'refused', v_refused);
end $$;

-- ─── 4. Fin d'une journée : identité + contrôles b1/b2 en base + verdict ──────────────────────
-- `p_expected` (centimes) : summary_cents, sales_cents, sales_count, page_net_cents,
-- page_sales_count — gardés tels quels dans `totals`. `summary_cents` = Σ (PPV + tips) de TOUTES
-- les lignes du résumé lues, mises de côté comprises ; `sales_cents` = Σ de TOUTES les ventes lues,
-- indéterminées et écartées (modèle inconnu) comprises : c'est ce qui fait échouer b1/b2 quand une
-- ligne n'a pas été écrite.
-- FERMÉ PAR DÉFAUT (spec : un total ou un contrôle manquant compte comme un échec) :
--   - total attendu absent → son contrôle échoue ;
--   - `p_checks` doit contenir les trois contrôles du client (a_resume_ventes, b_total_page,
--     c_fiche_compte) : chacun absent est ajouté en échec, « contrôle non transmis » ;
--   - un code hors des six connus, ou un `ok` absent / non booléen, compte comme un échec.
create or replace function public.finish_chatter_day(
  p_day date, p_links jsonb, p_issues jsonb, p_expected jsonb, p_checks jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ident     jsonb;
  v_cd        bigint;
  v_ccd       bigint;
  -- `round` : un total en centimes arrivé en flottant (700.0000001) ne fait pas planter la nuit.
  v_exp_sum   bigint := round((p_expected->>'summary_cents')::numeric)::bigint;
  v_exp_sales bigint := round((p_expected->>'sales_cents')::numeric)::bigint;
  v_checks    jsonb;
  v_status    text;
  -- Les six codes connus (miroir de dayChecks, @glagency/core, pour les trois du client).
  k_known     constant text[] := array['a_resume_ventes', 'b_resume_ecrit', 'b_ventes_ecrites',
                                       'b_total_page', 'c_fiche_compte', 'c_lien_refuse'];
  k_required  constant text[] := array['a_resume_ventes', 'b_total_page', 'c_fiche_compte'];
begin
  v_ident := public.apply_chatter_identity(p_links, p_issues);

  -- Contrôles du client : un code inconnu devient un échec (son détail est gardé) …
  select coalesce(jsonb_agg(
           case when x.e->>'code' = any (k_known) then x.e
                else jsonb_build_object('code', coalesce(x.e->>'code', '?'), 'ok', false,
                       'detail', 'code de contrôle inconnu' || coalesce(' : ' || (x.e->>'detail'), ''))
           end order by x.o), '[]'::jsonb)
    into v_checks
    from jsonb_array_elements(case when jsonb_typeof(p_checks) = 'array' then p_checks else '[]'::jsonb end)
         with ordinality as x(e, o);
  -- … et chacun des trois contrôles attendus du client qui manque est ajouté en échec.
  select v_checks || coalesce(jsonb_agg(jsonb_build_object('code', r.code, 'ok', false,
                                                           'detail', 'contrôle non transmis') order by r.n), '[]'::jsonb)
    into v_checks
    from unnest(k_required) with ordinality as r(code, n)
   where not exists (select 1 from jsonb_array_elements(v_checks) c where c->>'code' = r.code);

  -- L'état RÉEL de la base, pas ce que le code croit avoir écrit.
  select coalesce(round(sum(cd.ca) * 100), 0) into v_cd from chatter_daily cd where cd.date = p_day;
  select coalesce(round(sum(ccd.ca) * 100), 0) into v_ccd from chatter_creator_daily ccd where ccd.date = p_day;
  v_checks := v_checks || jsonb_build_array(
    jsonb_build_object('code', 'b_resume_ecrit', 'ok', coalesce(v_cd = v_exp_sum, false), 'detail',
      format('chatter_daily : %s € en base, %s au résumé MyPuls.',
             replace(to_char(v_cd / 100.0, 'FM9999999990.00'), '.', ','),
             coalesce(replace(to_char(v_exp_sum / 100.0, 'FM9999999990.00'), '.', ',') || ' € lus',
                      'aucun total transmis'))),
    jsonb_build_object('code', 'b_ventes_ecrites', 'ok', coalesce(v_ccd = v_exp_sales, false), 'detail',
      format('chatter_creator_daily : %s € en base, %s (indéterminées comprises).',
             replace(to_char(v_ccd / 100.0, 'FM9999999990.00'), '.', ','),
             coalesce(replace(to_char(v_exp_sales / 100.0, 'FM9999999990.00'), '.', ',') || ' € de ventes lues',
                      'aucun total de ventes transmis'))));
  if jsonb_array_length(v_ident->'refused') > 0 then
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('code', 'c_lien_refuse', 'ok', false, 'detail',
      format('%s id(s) MyPuls non posé(s) : id déjà porté par une autre fiche, fiche déjà identifiée par un autre id, ou lien incomplet.',
             jsonb_array_length(v_ident->'refused'))));
  end if;

  v_status := case when exists (select 1 from jsonb_array_elements(v_checks) e
                                 where not coalesce((e->>'ok')::boolean, false))
                   then 'a_verifier' else 'ok' end;
  insert into ingest_day_checks (day, status, checks, totals, checked_at)
  values (p_day, v_status, v_checks,
          coalesce(p_expected, '{}'::jsonb)
            || jsonb_build_object('chatter_daily_cents', v_cd, 'chatter_creator_daily_cents', v_ccd),
          now())
  on conflict (day) do update
    set status = excluded.status, checks = excluded.checks, totals = excluded.totals,
        checked_at = excluded.checked_at;

  return v_ident || jsonb_build_object('status', v_status, 'checks', v_checks);
end $$;

-- ─── 5. Fusion (v2 de fusion.sh) ─────────────────────────────────────────────────────────────
-- Une transaction (l'appel) : le moindre garde-fou qui échoue annule tout. Mêmes étapes, même
-- ordre que la v2 : garde-fous, photo AVANT, déplacements, Spenders, id MyPuls, contrôle APRÈS.
-- En plus de la v2 : effacement des anomalies de la fiche vidée (spec § 5) ; refus d'un id
-- demandé invalide ou que la fiche gardée ne peut pas porter (garde du brief) ; verrou des deux
-- fiches avant les contrôles ; refus des pseudo-fiches « Indéterminé » ; contrôle final des ids
-- MyPuls (gardée et vidée). La sauvegarde CSV reste au CLI
-- (`identity-backfill --apply`). Tables repérées par (schéma, nom) lus dans le catalogue — la
-- comparaison ne dépend pas du `search_path`.
create or replace function public.merge_chatters(p_keep uuid, p_old uuid, p_mypuls_id text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  -- Colonnes (clés étrangères vers chatters, schéma public) que la fusion traite elle-même ; toute
  -- AUTRE référence à la fiche vidée arrête la fusion. Liste HANDLED de la v2, plus les deux
  -- colonnes de `chatter_identity_issues` (effacées plus bas). `insights` reste sur la fiche vidée
  -- (calculé, régénéré). `chatter_creators` et `chatter_daily_reach` ne sont PAS dans la liste,
  -- comme dans la v2 : une référence → arrêt.
  v_handled constant text[] := array[
    'chatter_daily.chatter_id', 'chatter_creator_daily.chatter_id', 'chatter_alias.chatter_id',
    'relances.chatter_id', 'mypuls_shift_segments.chatter_id', 'mypuls_shift_coverage.chatter_id',
    'insights.chatter_id', 'profiles.chatter_id', 'spender_conversations.assigned_chatter_id',
    'spender_assignment_events.from_chatter_id', 'spender_assignment_events.to_chatter_id',
    'chatter_identity_issues.chatter_id', 'chatter_identity_issues.other_chatter_id'];
  v_keep_mid     text;
  v_old_mid      text;
  v_ref          record;
  v_tab          text;
  v_found        boolean;
  v_keep_profile uuid;
  v_holder       uuid;
  v_ev_old       uuid[];
  b_cd_n bigint; b_cd_ca numeric; b_ccd_n bigint; b_ccd_ca numeric; b_conv bigint;
  a_cd_n bigint; a_cd_ca numeric; a_ccd_n bigint; a_ccd_ca numeric; a_conv bigint;
begin
  -- Garde-fous
  if p_keep = p_old then raise exception 'même fiche'; end if;
  -- Un id MyPuls est un entier > 0 écrit en décimal (0001_schema : `text`) ; vide = pas demandé.
  if coalesce(p_mypuls_id, '') <> '' and p_mypuls_id !~ '^[1-9][0-9]*$' then
    raise exception 'id MyPuls demandé invalide (%) : un entier positif est attendu', p_mypuls_id;
  end if;
  -- Les deux fiches sont verrouillées AVANT les contrôles, dans un ordre fixe (pas d'interblocage
  -- entre deux fusions) : rien ne peut s'y rattacher, ni leur id changer, d'ici la fin.
  perform 1 from public.chatters c where c.id in (p_keep, p_old) order by c.id for update;
  if (select count(*) from chatters c where c.id in (p_keep, p_old)) <> 2 then
    raise exception 'fiche introuvable';
  end if;
  -- Pseudo-fiche « Indéterminé (<modèle>) » : les ventes sans chatteur de TOUT un modèle, jamais
  -- fusionnée (spec Q1/D9) — garde au plus près, le futur bouton « Fusionner » appellera ceci.
  if exists (select 1 from chatters c where c.id in (p_keep, p_old) and c.display_name ~ '^Indéterminé \(') then
    raise exception 'pseudo-fiche « Indéterminé (…) » : jamais fusionnée';
  end if;
  if exists (select 1 from profiles p where p.chatter_id = p_old) then
    raise exception 'la fiche à vider est rattachée à un membre';
  end if;
  if exists (select 1 from chatter_daily a join chatter_daily b on a.date = b.date
              where a.chatter_id = p_keep and b.chatter_id = p_old) then
    raise exception 'jours en commun (chatter_daily)';
  end if;
  if exists (select 1 from chatter_creator_daily a join chatter_creator_daily b
                on a.date = b.date and a.creator_id = b.creator_id
              where a.chatter_id = p_keep and b.chatter_id = p_old) then
    raise exception 'jours en commun (chatter_creator_daily)';
  end if;
  select c.mypuls_user_id into v_keep_mid from chatters c where c.id = p_keep;
  select c.mypuls_user_id into v_old_mid from chatters c where c.id = p_old;
  if v_keep_mid is not null and v_old_mid is not null and v_keep_mid <> v_old_mid then
    raise exception 'ids MyPuls différents (% / %) : pas le même compte', v_keep_mid, v_old_mid;
  end if;
  -- Id demandé (en plus de la v2, qui l'ignorait sans rien dire) : la fiche gardée doit pouvoir le
  -- porter. Déjà le sien, ou celui de la fiche vidée (il passera sur la gardée) : rien à faire.
  -- La gardée finirait avec un AUTRE id, ou une troisième fiche le porte déjà : refus.
  if coalesce(p_mypuls_id, '') <> '' then
    if coalesce(v_keep_mid, v_old_mid, p_mypuls_id) <> p_mypuls_id then
      raise exception 'ids MyPuls différents (% demandé / % porté) : pas le même compte',
        p_mypuls_id, coalesce(v_keep_mid, v_old_mid);
    end if;
    select c.id into v_holder from chatters c
     where c.mypuls_user_id = p_mypuls_id and c.id not in (p_keep, p_old);
    if v_holder is not null then
      raise exception 'id MyPuls % déjà porté par une autre fiche (%) : fusion refusée', p_mypuls_id, v_holder;
    end if;
  end if;
  -- 1) Toute clé étrangère vers chatters non traitée ici → arrêt (décision manuelle)
  for v_ref in
    select n.nspname::text as sch, cl.relname::text as tab, a.attname::text as col
      from pg_constraint k
      join pg_class cl on cl.oid = k.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
     where k.contype = 'f' and k.confrelid = 'public.chatters'::regclass
  loop
    if not (v_ref.sch = 'public' and (v_ref.tab || '.' || v_ref.col) = any (v_handled)) then
      execute format('select exists (select 1 from %I.%I where %I = $1)', v_ref.sch, v_ref.tab, v_ref.col)
         into v_found using p_old;
      if v_found then raise exception 'fiche référencée dans %.% → fusion manuelle', v_ref.tab, v_ref.col; end if;
    end if;
  end loop;
  -- 2) Filet : colonnes nommées chatter_id SANS clé étrangère (compta, police, tracker…). Lues dans
  --    le catalogue et non dans information_schema, qui masque les tables où l'appelant n'a aucun
  --    droit : une table illisible fait échouer la requête ci-dessous au lieu d'être sautée.
  for v_tab in
    select cl.relname::text
      from pg_attribute a
      join pg_class cl on cl.oid = a.attrelid
      join pg_namespace n on n.oid = cl.relnamespace
     where n.nspname = 'public' and cl.relkind in ('r', 'p', 'v', 'f')
       and a.attname = 'chatter_id' and a.attnum > 0 and not a.attisdropped
       and not ((cl.relname::text || '.chatter_id') = any (v_handled))
  loop
    execute format('select exists (select 1 from public.%I where chatter_id = $1)', v_tab)
       into v_found using p_old;
    if v_found then raise exception 'fiche référencée dans %.chatter_id → fusion manuelle', v_tab; end if;
  end loop;

  -- Photo AVANT (lignes + CA des deux fiches réunies, conversations Spenders)
  select count(*), coalesce(sum(cd.ca), 0) into b_cd_n, b_cd_ca
    from chatter_daily cd where cd.chatter_id in (p_keep, p_old);
  select count(*), coalesce(sum(ccd.ca), 0) into b_ccd_n, b_ccd_ca
    from chatter_creator_daily ccd where ccd.chatter_id in (p_keep, p_old);
  select count(*) into b_conv from spender_conversations sc where sc.assigned_chatter_id in (p_keep, p_old);
  select coalesce(array_agg(e.id), '{}') into v_ev_old
    from spender_assignment_events e where e.from_chatter_id = p_old or e.to_chatter_id = p_old;
  select p.id into v_keep_profile from profiles p where p.chatter_id = p_keep;

  -- Déplacements
  update chatter_daily         set chatter_id = p_keep where chatter_id = p_old;
  update chatter_creator_daily set chatter_id = p_keep where chatter_id = p_old;
  update chatter_alias         set chatter_id = p_keep where chatter_id = p_old;
  update relances              set chatter_id = p_keep where chatter_id = p_old;
  update mypuls_shift_segments
     set chatter_id = p_keep, profile_id = coalesce(profile_id, v_keep_profile)
   where chatter_id = p_old;
  update mypuls_shift_coverage
     set chatter_id = p_keep, profile_id = coalesce(profile_id, v_keep_profile)
   where chatter_id = p_old;
  update rest_planning_cells set chatter_ids = array_replace(chatter_ids, p_old, p_keep)
   where p_old = any (chatter_ids);

  -- Spenders. Le trigger 0034 journalise une « réassignation » OLD → KEEP pour chaque conversation
  -- déplacée : artefact de la fusion (même personne), supprimé (horodaté now() = cette transaction).
  update spender_conversations set assigned_chatter_id = p_keep where assigned_chatter_id = p_old;
  delete from spender_assignment_events e
   where e.from_chatter_id = p_old and e.to_chatter_id = p_keep and e.changed_at = now()
     and not (e.id = any (v_ev_old));
  update spender_assignment_events set from_chatter_id = p_keep where from_chatter_id = p_old;
  update spender_assignment_events set to_chatter_id   = p_keep where to_chatter_id   = p_old;
  -- Les « réassignations » entre les deux libellés d'un même compte n'en étaient pas (KEEP → KEEP).
  delete from spender_assignment_events e
   where e.id = any (v_ev_old) and e.from_chatter_id = p_keep and e.to_chatter_id = p_keep;

  -- Anomalies de la fiche vidée (spec § 4 : une fusion les efface).
  delete from chatter_identity_issues i where i.chatter_id = p_old or i.other_chatter_id = p_old;

  -- Id MyPuls : porté par la fiche conservée (l'id demandé a passé la garde : plus d'abandon muet)
  if v_old_mid is not null and v_keep_mid is null then
    update chatters set mypuls_user_id = null where id = p_old;
    update chatters set mypuls_user_id = v_old_mid where id = p_keep;
  end if;
  if coalesce(p_mypuls_id, '') <> ''
     and (select c.mypuls_user_id from chatters c where c.id = p_keep) is null
     and not exists (select 1 from chatters c where c.mypuls_user_id = p_mypuls_id) then
    update chatters set mypuls_user_id = p_mypuls_id where id = p_keep;
  end if;

  -- Contrôle APRÈS : plus AUCUNE référence à la fiche vidée (hors insights), mêmes lignes, même CA
  for v_ref in
    select n.nspname::text as sch, cl.relname::text as tab, a.attname::text as col
      from pg_constraint k
      join pg_class cl on cl.oid = k.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
     where k.contype = 'f' and k.confrelid = 'public.chatters'::regclass
  loop
    if not (v_ref.sch = 'public' and v_ref.tab = 'insights' and v_ref.col = 'chatter_id') then
      execute format('select exists (select 1 from %I.%I where %I = $1)', v_ref.sch, v_ref.tab, v_ref.col)
         into v_found using p_old;
      if v_found then raise exception 'il reste une référence dans %.%', v_ref.tab, v_ref.col; end if;
    end if;
  end loop;
  if exists (select 1 from rest_planning_cells r where p_old = any (r.chatter_ids)) then
    raise exception 'il reste une référence dans rest_planning_cells';
  end if;
  select count(*), coalesce(sum(cd.ca), 0) into a_cd_n, a_cd_ca from chatter_daily cd where cd.chatter_id = p_keep;
  select count(*), coalesce(sum(ccd.ca), 0) into a_ccd_n, a_ccd_ca
    from chatter_creator_daily ccd where ccd.chatter_id = p_keep;
  select count(*) into a_conv from spender_conversations sc where sc.assigned_chatter_id = p_keep;
  if a_cd_n <> b_cd_n or a_cd_ca <> b_cd_ca or a_ccd_n <> b_ccd_n or a_ccd_ca <> b_ccd_ca or a_conv <> b_conv then
    raise exception 'lignes, CA ou conversations différents après déplacement';
  end if;
  -- Ids MyPuls : l'id demandé est sur la gardée ; la gardée porte le sien, sinon celui de la vidée,
  -- sinon l'id demandé ; la vidée n'en porte plus aucun.
  if coalesce(p_mypuls_id, '') <> ''
     and (select c.mypuls_user_id from chatters c where c.id = p_keep) is distinct from p_mypuls_id then
    raise exception 'id MyPuls demandé (%) absent de la fiche gardée après fusion', p_mypuls_id;
  end if;
  if (select c.mypuls_user_id from chatters c where c.id = p_keep)
       is distinct from coalesce(v_keep_mid, v_old_mid, nullif(p_mypuls_id, '')) then
    raise exception 'id MyPuls inattendu sur la fiche gardée après fusion (% au lieu de %)',
      (select c.mypuls_user_id from chatters c where c.id = p_keep), coalesce(v_keep_mid, v_old_mid, nullif(p_mypuls_id, ''));
  end if;
  if (select c.mypuls_user_id from chatters c where c.id = p_old) is not null then
    raise exception 'la fiche vidée porte encore un id MyPuls (%)',
      (select c.mypuls_user_id from chatters c where c.id = p_old);
  end if;

  return jsonb_build_object(
    'keep', p_keep, 'old', p_old,
    'chatter_daily', a_cd_n, 'chatter_daily_ca', a_cd_ca,
    'chatter_creator_daily', a_ccd_n, 'chatter_creator_daily_ca', a_ccd_ca,
    'conversations', a_conv,
    'mypuls_user_id', (select c.mypuls_user_id from chatters c where c.id = p_keep));
end $$;

-- ─── 6. Suppression d'une fiche que rien ne référence ────────────────────────────────────────
-- Même recensement que la fusion (toutes les clés étrangères vers chatters + filet `chatter_id`),
-- hors alias et anomalies, qui partent avec la fiche (cascade). Une fiche reliée à un membre est
-- référencée par `profiles.chatter_id` : refusée. La ligne est verrouillée d'abord : rien ne peut
-- s'y rattacher entre le recensement et la suppression.
create or replace function public.delete_empty_chatter(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ref   record;
  v_tab   text;
  v_found boolean;
begin
  perform 1 from chatters c where c.id = p_id for update;
  if not found then raise exception 'fiche % introuvable', p_id; end if;
  if exists (select 1 from chatters c where c.id = p_id and c.display_name ~ '^Indéterminé \(') then
    raise exception 'pseudo-fiche « Indéterminé (…) » : jamais supprimée';
  end if;

  for v_ref in
    select n.nspname::text as sch, cl.relname::text as tab, a.attname::text as col
      from pg_constraint k
      join pg_class cl on cl.oid = k.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
     where k.contype = 'f' and k.confrelid = 'public.chatters'::regclass
  loop
    if not (v_ref.sch = 'public' and (v_ref.tab || '.' || v_ref.col) in
              ('chatter_alias.chatter_id', 'chatter_identity_issues.chatter_id',
               'chatter_identity_issues.other_chatter_id')) then
      execute format('select exists (select 1 from %I.%I where %I = $1)', v_ref.sch, v_ref.tab, v_ref.col)
         into v_found using p_id;
      if v_found then raise exception 'fiche % encore référencée dans %.%', p_id, v_ref.tab, v_ref.col; end if;
    end if;
  end loop;
  for v_tab in
    select cl.relname::text
      from pg_attribute a
      join pg_class cl on cl.oid = a.attrelid
      join pg_namespace n on n.oid = cl.relnamespace
     where n.nspname = 'public' and cl.relkind in ('r', 'p', 'v', 'f')
       and a.attname = 'chatter_id' and a.attnum > 0 and not a.attisdropped
       and cl.relname::text not in ('chatter_alias', 'chatter_identity_issues')
  loop
    execute format('select exists (select 1 from public.%I where chatter_id = $1)', v_tab)
       into v_found using p_id;
    if v_found then raise exception 'fiche % encore référencée dans %.chatter_id', p_id, v_tab; end if;
  end loop;
  if exists (select 1 from rest_planning_cells r where p_id = any (r.chatter_ids)) then
    raise exception 'fiche % encore référencée dans rest_planning_cells', p_id;
  end if;

  delete from chatters c where c.id = p_id;
end $$;

-- ─── 7. Lectures de l'onglet Fiches MyPuls (SECURITY INVOKER) ───────────────────────────────
-- Ventes sans chatteur, par modèle (pseudo-fiches « Indéterminé (…) »).
create or replace function public.unattributed_sales(p_from date, p_to date)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(json_agg(t order by t.ca desc, t.creator_name), '[]'::json)
  from (
    select ccd.creator_id, cr.name as creator_name, c.display_name as label, round(sum(ccd.ca), 2) as ca
      from chatter_creator_daily ccd
      join chatters c on c.id = ccd.chatter_id
      join creators cr on cr.id = ccd.creator_id
     where c.display_name like 'Indéterminé (%' and ccd.date between p_from and p_to
     group by ccd.creator_id, cr.name, c.display_name
  ) t
$$;

-- Fiches avec du CA sans membre au rôle `chatteur` : celles que le classement Stat chatter ignore
-- (`closing-by-chatter.ts` : isChatter = role 'chatteur' ; CA = chatter_daily, comme chatters_report).
create or replace function public.unranked_chatters_ca(p_from date, p_to date)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(json_agg(t order by t.ca desc, t.display_name), '[]'::json)
  from (
    select c.id as chatter_id, c.display_name, c.mypuls_user_id, round(sum(cd.ca), 2) as ca,
           p.display_name as member_name, p.role as member_role
      from chatter_daily cd
      join chatters c on c.id = cd.chatter_id
      left join profiles p on p.chatter_id = c.id
     where cd.date between p_from and p_to and (p.id is null or p.role <> 'chatteur')
     group by c.id, c.display_name, c.mypuls_user_id, p.display_name, p.role
    having sum(cd.ca) > 0
  ) t
$$;

-- Statut des N derniers jours INGÉRÉS (dernier jour de creator_daily, écrit avant le pas chatteur) :
-- un jour sans ligne de contrôle (pas chatteur en échec) ressort « non_verifie ». N borné à 1..366
-- (14 si null) : un appel ne peut pas générer une série sans fin.
create or replace function public.reliability_days(p_days int)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with dernier as (select max(cd.date) as d from creator_daily cd),
       jours as (
         select (dr.d - g.n)::date as day
           from dernier dr, generate_series(0, least(greatest(coalesce(p_days, 14), 1), 366) - 1) as g(n)
          where dr.d is not null)
  select coalesce(json_agg(json_build_object(
           'day', j.day,
           'status', coalesce(k.status, 'non_verifie'),
           'checks', coalesce(k.checks, '[]'::jsonb),
           'checked_at', k.checked_at) order by j.day desc), '[]'::json)
  from jours j left join ingest_day_checks k on k.day = j.day
$$;

-- ─── Droits ──────────────────────────────────────────────────────────────────────────────────
revoke execute on function public.apply_chatter_identity(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_chatter_identity(jsonb, jsonb) to service_role;
revoke execute on function public.finish_chatter_day(date, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.finish_chatter_day(date, jsonb, jsonb, jsonb, jsonb) to service_role;
revoke execute on function public.merge_chatters(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.merge_chatters(uuid, uuid, text) to service_role;
revoke execute on function public.delete_empty_chatter(uuid) from public, anon, authenticated;
grant execute on function public.delete_empty_chatter(uuid) to service_role;
revoke execute on function public.unattributed_sales(date, date) from public, anon;
grant execute on function public.unattributed_sales(date, date) to authenticated;
revoke execute on function public.unranked_chatters_ca(date, date) from public, anon;
grant execute on function public.unranked_chatters_ca(date, date) to authenticated;
revoke execute on function public.reliability_days(int) from public, anon;
grant execute on function public.reliability_days(int) to authenticated;
