-- To-Do hebdomadaire des encadrants — reprise du `/todo` du tracker GLA (incrément 3, tâche 5).
--
-- DÉCISION DE BENOIT, 2026-08-26 : on assume un SECOND système de to-do à côté de `todos`
-- (`/chatter/planning?vue=todo`). Celui du CRM sera supprimé plus tard. Cela annule la moitié
-- « aucune suppression » de la décision D5 de la spec ; les deux cohabitent en attendant.
--
-- Modèle repris tel quel de leur écran :
--   • une SEMAINE de sept colonnes, une par jour ;
--   • dans chaque jour, des SECTIONS par catégorie (« 1:1 », « Scripts », « Voc chatters »…) ;
--   • une section peut être RÉCURRENTE : elle réapparaît les jours de semaine choisis ;
--   • des TÂCHES dans une section, cochables et déplaçables d'un jour à l'autre ;
--   • des HABITUDES : des tâches qui se recréent aux jours choisis ;
--   • un JOUR DE REPOS qui neutralise la colonne ;
--   • un BLOC-NOTES par semaine, un DÉBRIEF par jour, des LIENS utiles.
--
-- NON PORTÉ : leur `/api/todo/weekplan` (« cap de la semaine à venir »). Le gestionnaire existe
-- dans leur JavaScript mais le formulaire n'apparaît dans AUCUNE page rendue : ses champs sont
-- inconnus, et les inventer serait pire que de ne rien faire.
--
-- Écritures : service-role après garde de rôle dans les Server Actions, comme toute la face
-- Formation. La RLS ci-dessous couvre la LECTURE.

-- ---------------------------------------------------------------------------- sections

create table if not exists public.tracker_todo_sections (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  -- Jours ISO de récurrence, ex. « 1,2,3,4,5 ». Vide = section ponctuelle, posée sur un seul jour.
  weekdays   text not null default '',
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);
create index if not exists tracker_todo_sections_owner_idx
  on public.tracker_todo_sections (owner_id, position);

-- ---------------------------------------------------------------------------- tâches

create table if not exists public.tracker_todo_tasks (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  date       date not null,
  -- Catégorie LIBRE et non clé étrangère : supprimer une section ne doit jamais faire disparaître
  -- des tâches (c'est explicitement ce que leur écran promet — « ses tâches sont conservées »).
  category   text not null,
  label      text not null,
  done       boolean not null default false,
  done_at    timestamptz,
  position   int not null default 0,
  -- Trace de qui a déposé la tâche : la hiérarchie peut en déposer chez un encadrant, comme sur
  -- le planning du CRM. `null` = déposée par le propriétaire lui-même.
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists tracker_todo_tasks_owner_date_idx
  on public.tracker_todo_tasks (owner_id, date);
create index if not exists tracker_todo_tasks_created_by_idx
  on public.tracker_todo_tasks (created_by);

-- ---------------------------------------------------------------------------- habitudes

create table if not exists public.tracker_todo_habits (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  category   text not null,
  label      text not null,
  weekdays   text not null default '',
  active     boolean not null default true,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists tracker_todo_habits_owner_idx
  on public.tracker_todo_habits (owner_id, active);

-- ---------------------------------------------------------------------------- jours de repos

create table if not exists public.tracker_todo_dayoff (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  date     date not null,
  primary key (owner_id, date)
);

-- ---------------------------------------------------------------------------- bloc-notes

create table if not exists public.tracker_todo_notes (
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  -- Lundi de la semaine concernée — une seule note par semaine, comme chez eux.
  week       date not null,
  body       text not null default '',
  updated_at timestamptz not null default now(),
  primary key (owner_id, week)
);

-- ---------------------------------------------------------------------------- débrief du jour

create table if not exists public.tracker_todo_daily (
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  date       date not null,
  focus      text not null default '',
  problem    text not null default '',
  positive   text not null default '',
  negative   text not null default '',
  notes      text not null default '',
  updated_at timestamptz not null default now(),
  primary key (owner_id, date)
);

-- ---------------------------------------------------------------------------- liens utiles

create table if not exists public.tracker_todo_links (
  id       uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  label    text not null,
  url      text not null,
  position int not null default 0
);
create index if not exists tracker_todo_links_owner_idx
  on public.tracker_todo_links (owner_id, position);

comment on table public.tracker_todo_tasks is
  $cmt$Tâches de la to-do hebdomadaire des encadrants (reprise du tracker GLA). `category` est du
texte libre, pas une clé étrangère vers les sections : supprimer une section conserve ses tâches.$cmt$;

-- ---------------------------------------------------------------------------- RLS
--
-- Lecture : admin, porteur de la page `presence`, ou son propre contenu. Même formule que les
-- tables de 0125 — un encadrant voit les to-do de l'équipe, c'est le principe du récap.
-- Écriture : AUCUNE politique. Tout passe par le service-role après garde dans les Server Actions,
-- comme la face Formation. Une politique d'écriture ici donnerait un second chemin à sécuriser.

alter table public.tracker_todo_sections enable row level security;
alter table public.tracker_todo_tasks    enable row level security;
alter table public.tracker_todo_habits   enable row level security;
alter table public.tracker_todo_dayoff   enable row level security;
alter table public.tracker_todo_notes    enable row level security;
alter table public.tracker_todo_daily    enable row level security;
alter table public.tracker_todo_links    enable row level security;

create policy tracker_todo_sections_read on public.tracker_todo_sections for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or owner_id = (select auth.uid()));
create policy tracker_todo_tasks_read on public.tracker_todo_tasks for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or owner_id = (select auth.uid()));
create policy tracker_todo_habits_read on public.tracker_todo_habits for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or owner_id = (select auth.uid()));
create policy tracker_todo_dayoff_read on public.tracker_todo_dayoff for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or owner_id = (select auth.uid()));
create policy tracker_todo_notes_read on public.tracker_todo_notes for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or owner_id = (select auth.uid()));
create policy tracker_todo_daily_read on public.tracker_todo_daily for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or owner_id = (select auth.uid()));
create policy tracker_todo_links_read on public.tracker_todo_links for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------- récap hebdomadaire
--
-- Agrégat du récap (tâche 6) : par encadrant, les tâches de la semaine et les débriefs déposés.
-- `jsonb` pour la même raison que `tracker_window` — pas de troncature possible à 1000 lignes.

create or replace function public.tracker_todo_week_recap(p_from date, p_to date)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with owners as (
    select distinct owner_id from tracker_todo_tasks where date between p_from and p_to
    union
    select distinct owner_id from tracker_todo_daily where date between p_from and p_to
  ),
  agg as (
    select o.owner_id,
           coalesce(count(t.id), 0)                                   as planned,
           coalesce(count(t.id) filter (where t.done), 0)             as done,
           coalesce(count(distinct d.date), 0)                        as debriefs
    from owners o
    left join tracker_todo_tasks t
      on t.owner_id = o.owner_id and t.date between p_from and p_to
    left join tracker_todo_daily d
      on d.owner_id = o.owner_id and d.date between p_from and p_to
     and (d.focus <> '' or d.problem <> '' or d.positive <> '' or d.negative <> '' or d.notes <> '')
    group by o.owner_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'profileId', a.owner_id,
    'name', coalesce(pr.display_name, pr.email, 'sans nom'),
    'role', pr.role,
    'planned', a.planned,
    'done', a.done,
    'debriefs', a.debriefs,
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', d.date,
        'focus', d.focus, 'problem', d.problem,
        'positive', d.positive, 'negative', d.negative, 'notes', d.notes
      ) order by d.date), '[]'::jsonb)
      from tracker_todo_daily d
      where d.owner_id = a.owner_id and d.date between p_from and p_to
    )
  ) order by a.done::numeric / greatest(a.planned, 1) desc, pr.display_name), '[]'::jsonb)
  from agg a
  join profiles pr on pr.id = a.owner_id
$$;

comment on function public.tracker_todo_week_recap(date, date) is
  $cmt$Récap hebdomadaire des to-do et débriefs des encadrants, en une ligne de jsonb.$cmt$;

grant execute on function public.tracker_todo_week_recap(date, date) to authenticated;
