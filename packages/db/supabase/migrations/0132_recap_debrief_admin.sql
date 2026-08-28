-- Le débrief quotidien redevient ADMIN-ONLY en lecture — comme le Récap du tracker d'origine.
--
-- `tracker_todo_daily` porte les cinq champs du débrief : ce sur quoi la personne s'est concentrée,
-- ce qui a coincé, ce qui a marché, ce qui n'a pas marché, ses notes. C'est un journal personnel.
-- Le tracker d'origine réservait sa lecture agrégée aux admins (`requireAdminView`, routes.js.txt:436).
--
-- La page `/chatter/presence/recap` a été refermée sur `requireAdmin()`, mais 0127:150-151 laissait
-- la lecture ouverte à TOUT porteur du slug `presence` : un sous-manager lisait en direct, via
-- PostgREST, le journal de ses pairs. La garde applicative ne vaut rien sans celle-ci — « RLS =
-- enforcement réel, l'UI n'est qu'optimiste » (CLAUDE.md).
--
-- On garde `owner_id = auth.uid()` : chacun lit TOUJOURS son propre débrief, c'est la moitié de
-- l'écran To-Do.
drop policy if exists tracker_todo_daily_read on public.tracker_todo_daily;

create policy tracker_todo_daily_read on public.tracker_todo_daily for select to authenticated
  using ((select public.is_admin()) or owner_id = (select auth.uid()));

comment on table public.tracker_todo_daily is
  $cmt$Débrief quotidien d'un encadrant (5 champs). Lecture : son auteur, et les admins seuls — le
Récap en agrège le verbatim de toute l'équipe. Repris de `requireAdminView` du tracker d'origine.$cmt$;
