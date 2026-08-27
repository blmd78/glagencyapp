-- Suivi chatters — reprise du `/notes` du tracker GLA (incrément 3, tâche 7).
--
-- C'est un système de COACHING, pas un carnet de notes : une grille de compétences notées en
-- étoiles, des sessions 1:1 avec une note sur 20 saisie par l'encadrant, un historique par
-- compétence, et des notes libres.
--
-- CE QUI N'EST PAS REPRIS : les **sanctions** (les cinq croix « avertissements » de leur en-tête,
-- `/api/notes/sanction`). Décision de Benoit du 2026-08-27 : les avertissements relèvent de la
-- partie tracker, pas du coaching. Le CRM a déjà son Tracker police pour ça.
--
-- Le score sur 20 n'est PAS calculé : il est saisi à la main pendant le 1:1 (leur champ `bs`,
-- repère « ex. 13,5 »). La moyenne affichée en tête de fiche est la moyenne des sessions notées.
--
-- Écritures : service-role après garde dans les Server Actions, comme le reste de la face.
-- La RLS couvre la lecture.

-- ---------------------------------------------------------------------------- grille de compétences

create table if not exists public.tracker_skills (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  position    int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists tracker_skills_position_idx
  on public.tracker_skills (active, position);

comment on table public.tracker_skills is
  $cmt$Grille de compétences du suivi chatters (« Setting & Qualification »…). Référentiel partagé,
modifiable par les admins ; jamais supprimé quand des notes y pointent — on désactive.$cmt$;

-- ---------------------------------------------------------------------------- sessions 1:1

create table if not exists public.tracker_sessions (
  id         uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references public.profiles(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  date       date not null,
  -- Note sur 20, SAISIE par l'encadrant pendant l'appel. `null` = session tenue sans note.
  score      numeric(4,2) check (score is null or (score >= 0 and score <= 20)),
  summary    text not null default '',
  -- « Tout ce qui n'entre dans aucune compétence » — leur champ `gen`.
  general    text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists tracker_sessions_chatter_idx
  on public.tracker_sessions (chatter_id, date desc);
create index if not exists tracker_sessions_author_idx
  on public.tracker_sessions (author_id);

-- ---------------------------------------------------------------------------- notes par compétence

create table if not exists public.tracker_ratings (
  id         uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references public.profiles(id) on delete cascade,
  skill_id   uuid not null references public.tracker_skills(id) on delete cascade,
  -- Rattachée à une session quand elle a été posée pendant un 1:1 ; libre sinon.
  session_id uuid references public.tracker_sessions(id) on delete set null,
  stars      int  not null check (stars between 1 and 5),
  comment    text not null default '',
  author_id  uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
-- L'HISTORIQUE est le sujet : on n'écrase jamais une note, on en ajoute une. La note « courante »
-- d'une compétence est simplement la plus récente.
create index if not exists tracker_ratings_chatter_skill_idx
  on public.tracker_ratings (chatter_id, skill_id, created_at desc);
create index if not exists tracker_ratings_session_idx
  on public.tracker_ratings (session_id);
create index if not exists tracker_ratings_author_idx
  on public.tracker_ratings (author_id);
create index if not exists tracker_ratings_skill_idx
  on public.tracker_ratings (skill_id);

-- ---------------------------------------------------------------------------- notes libres

create table if not exists public.tracker_chatter_notes (
  id         uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references public.profiles(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists tracker_chatter_notes_chatter_idx
  on public.tracker_chatter_notes (chatter_id, created_at desc);
create index if not exists tracker_chatter_notes_author_idx
  on public.tracker_chatter_notes (author_id);

-- ---------------------------------------------------------------------------- RLS (lecture)

alter table public.tracker_skills        enable row level security;
alter table public.tracker_sessions      enable row level security;
alter table public.tracker_ratings       enable row level security;
alter table public.tracker_chatter_notes enable row level security;

-- La grille est un référentiel : lisible par tout porteur de la page.
create policy tracker_skills_read on public.tracker_skills for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')));

-- Le suivi d'un chatteur : l'encadrement, et le chatteur lui-même sur SON suivi.
create policy tracker_sessions_read on public.tracker_sessions for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or chatter_id = (select auth.uid()));
create policy tracker_ratings_read on public.tracker_ratings for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or chatter_id = (select auth.uid()));

-- Les notes libres, elles, ne sont PAS visibles du chatteur : c'est le bloc-notes de
-- l'encadrement, où l'on écrit ce qu'on ne dirait pas encore à l'intéressé.
create policy tracker_chatter_notes_read on public.tracker_chatter_notes for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')));

-- ---------------------------------------------------------------------------- la liste

create or replace function public.tracker_coaching_list()
returns jsonb
language sql stable security invoker set search_path = public
as $$
  select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'profileId', p.id,
      'name', coalesce(p.display_name, p.email, 'sans nom'),
      'models', coalesce((
        select jsonb_agg(c.name order by c.name)
        from profile_creators pc join creators c on c.id = pc.creator_id
        where pc.profile_id = p.id
      ), '[]'::jsonb),
      -- Moyenne des sessions NOTÉES ; null si aucune — « jamais noté » chez eux.
      'score', (select round(avg(s.score), 2) from tracker_sessions s
                where s.chatter_id = p.id and s.score is not null),
      'sessions', (select count(*) from tracker_sessions s where s.chatter_id = p.id),
      'lastSeen', (select max(s.date) from tracker_sessions s where s.chatter_id = p.id)
    ) as x
    from profiles p
    where p.role = 'chatteur' and p.left_at is null
  ) t
$$;

comment on function public.tracker_coaching_list() is
  $cmt$Liste du suivi chatters : moyenne des sessions, date du dernier 1:1, modèles. Une ligne de
jsonb — hors de portée de la troncature à 1000 lignes de PostgREST.$cmt$;

grant execute on function public.tracker_coaching_list() to authenticated;

-- ---------------------------------------------------------------------------- grille de départ
--
-- Une seule compétence est visible dans ce qu'on a relevé de leur écran (« Setting &
-- Qualification », avec sa description exacte). Les six autres existent chez eux mais leurs
-- libellés ne figurent nulle part dans les pages capturées : les inventer donnerait une grille
-- fausse. Elles se créent depuis l'écran d'administration de la grille.

insert into public.tracker_skills (name, description, position)
select 'Setting & Qualification',
       'Qualifier l''abonné (KYC) en douceur, faire monter l''envie, puis closer le tout premier média payant à 6 €.',
       1
where not exists (select 1 from public.tracker_skills);
