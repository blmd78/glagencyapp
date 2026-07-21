-- 0071 — Rapport du soir (section Police). En-tête par (auteur, modèle, jour) + une ligne
-- d'observation par chatteur suivi. Partage la page `police` du Tracker (accès + écriture),
-- l'auteur peut être un police, un manager avec la page, ou un admin (author_id générique).
-- Le cloisonnement par modèle (on n'agit que sur ses modèles assignés) est fait CÔTÉ APP
-- (profile_creators / lib/scope), comme le tracker police_entries — pas en RLS.
create table public.police_reports (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.profiles(id) on delete cascade,
  creator_id   uuid not null references public.creators(id) on delete cascade,
  day          date not null,
  ca           integer not null default 0 check (ca >= 0),
  non_traitees integer not null default 0 check (non_traitees >= 0),
  absents      integer not null default 0 check (absents >= 0),
  alerte       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (author_id, creator_id, day)
);

create table public.police_report_lines (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.police_reports(id) on delete cascade,
  chatter_id  uuid not null references public.chatters(id) on delete cascade,
  observation text,
  unique (report_id, chatter_id)
);

alter table public.police_reports enable row level security;
alter table public.police_report_lines enable row level security;

-- Lecture : qui a la page « Police » voit tous les rapports (managers compris) ; admin/superadmin
-- tout, même sans la page cochée. Appels wrappés (select …) — pas d'argument de ligne (0057).
create policy police_reports_read on public.police_reports for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('police')));

-- Écriture : on ne rédige/modifie/supprime que SON rapport (author_id = auth.uid()), et il faut
-- le droit d'écriture de la page — même prédicat que le tracker (0070) : can_write_page couvre
-- admin + manager-avec-page ; is_police + has_page couvre le rôle fonctionnel.
create policy police_reports_write on public.police_reports for all to authenticated
  using (
    author_id = (select auth.uid())
    and ((select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police'))))
  )
  with check (
    author_id = (select auth.uid())
    and ((select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police'))))
  );

-- Lignes : héritent de l'en-tête (comme planning_blocks hérite de plannings, 0036).
create policy police_report_lines_read on public.police_report_lines for select to authenticated
  using (exists (select 1 from public.police_reports r where r.id = report_id));

create policy police_report_lines_write on public.police_report_lines for all to authenticated
  using (exists (
    select 1 from public.police_reports r
    where r.id = report_id and r.author_id = (select auth.uid())
      and ((select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police'))))
  ))
  with check (exists (
    select 1 from public.police_reports r
    where r.id = report_id and r.author_id = (select auth.uid())
      and ((select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police'))))
  ));

-- FK indexées (0055) — sauf celles déjà couvertes par une contrainte unique en tête.
create index police_reports_creator_day_idx on public.police_reports (creator_id, day);
create index police_report_lines_report_idx on public.police_report_lines (report_id);
create index police_report_lines_chatter_idx on public.police_report_lines (chatter_id);
-- `author_id` : couvert par l'unique (author_id, creator_id, day) en colonne de tête.
-- `report_id` de lines : couvert par l'index ci-dessus ; l'unique (report_id, chatter_id) le couvre aussi.
