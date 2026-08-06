-- 0106 — Tracker sanctions : la SUPPRESSION s'ouvre aux écrivains… et s'inscrit au journal.
--
-- Deux faces du même geste (demandes Benoit 2026-08-06), livrées ensemble :
--
-- A. LE DROIT. Depuis 0022, `police_delete` = is_admin() seul : un manager (ou le policier qui
--    a saisi) qui voulait retirer une sanction — « mon chatteur s'est bien comporté sur le
--    reste du mois » — devait passer par un admin. Décision : quiconque peut SAISIR une
--    sanction peut aussi la retirer. La policy reprend l'expression EXACTE de
--    `police_insert`/`police_update` (0078). Miroir app : `deletePoliceEntry`
--    (features/police/actions.ts) passe d'adminGuard à `requirePoliceProfile`, et le bouton
--    corbeille de `isAdmin` à `canWrite`.
--
-- B. LA TRACE. Ouvrir la suppression efface un fait (et potentiellement un malus de paie)
--    sans laisser de trace — donc journal de vie du membre (0101), même doctrine :
--    `member_events` est alimentée EXCLUSIVEMENT par trigger. L'événement est écrit par la
--    base au DELETE, pas par l'app — il capte aussi un ménage en SQL direct (created_by null
--    → « système » à l'écran). Seule la SUPPRESSION est journalisée : la pose et l'édition se
--    lisent déjà dans le Tracker (la ligne est là, avec son contrôleur).
--
--    `from_value` = fait supprimé en une valeur parseable, format miroir de celui de `sortie`
--    (« date (détail) ») : '2026-08-06 (malus 25 € — media_argent)' ou
--    '2026-08-06 (avertissement — horaires)'. La clé d'erreur reste BRUTE ici (le SQL ne
--    connaît pas les libellés) ; c'est `memberEventLabel` (@glagency/core, testé) qui traduit.

-- ── A. Le droit de supprimer = celui de saisir ───────────────────────────────────────────────

drop policy police_delete on public.police_entries;
create policy police_delete on public.police_entries for delete to authenticated
  using (
    (select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police')))
  );

-- ── B. La suppression s'inscrit au journal de vie du membre ─────────────────────────────────

alter table public.member_events drop constraint member_events_kind_check;
alter table public.member_events add constraint member_events_kind_check
  check (kind in ('creation','role','shift','closing','modele','manager','pages','nouveau',
                  'arrivee','sortie','lien','identite','sanction'));

create or replace function public.log_police_entry_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Garde-fou : si la cible n'est plus un profil (ligne legacy, purge), pas d'événement — la
  -- FK de member_events refuserait l'insert et ferait échouer le DELETE lui-même.
  if not exists (select 1 from profiles where id = old.chatter_id) then
    return old;
  end if;

  insert into member_events (profile_id, created_by, kind, from_value)
  values (
    old.chatter_id,
    (select auth.uid()),  -- null hors app (SQL direct) → « système », comme 0101.
    'sanction',
    to_char(old.occurred_on, 'YYYY-MM-DD') || ' ('
      || case when old.kind = 'malus'
              then 'malus ' || to_char(old.amount_eur, 'FM999990.##') || ' €'
              else 'avertissement'
         end
      || coalesce(' — ' || old.error_key, '')
      || ')'
  );
  return old;
end;
$$;

drop trigger if exists police_entries_log_delete on public.police_entries;
create trigger police_entries_log_delete
  after delete on public.police_entries
  for each row execute function public.log_police_entry_delete();
