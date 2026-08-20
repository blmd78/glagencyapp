-- 0125 — Test de recrutement public (reprise Good Luck Agency) : config (1 ligne, défauts +
-- banque QI + texte de frappe GLA), tentatives techniques, messages de la conversation IA,
-- dossiers candidats, liste de blocage. Spec : docs/superpowers/specs/2026-08-20-formation-
-- recrutement-design.md §3.
--
-- Le candidat n'a AUCUNE session : la page /postuler est publique, toutes les écritures passent
-- par createAdminClient() (service-role) depuis les Server Actions publiques — RLS n'accorde
-- donc que de la LECTURE, réservée à is_admin() (recrutement = admin seulement, cf. spec §1).
-- Aucune policy anon ni authenticated non-admin : l'anon key ne lit rien, un profil non-admin
-- authentifié non plus.

create table public.recruit_config (
  id             smallint primary key default 1 check (id = 1),
  open           boolean not null default true,
  bot_messages   smallint not null default 14 check (bot_messages between 1 and 50),
  qi_timer       smallint not null default 30 check (qi_timer between 5 and 300),
  frappe_min     smallint not null default 30 check (frappe_min >= 0),
  connexion_min  smallint not null default 10 check (connexion_min >= 0),
  qi_min         smallint not null default 3 check (qi_min between 0 and 5),
  global_threshold smallint not null default 70 check (global_threshold between 0 and 100),
  discord_link   text not null default '',
  -- texte fixe recopié à l'épreuve de frappe (GLA render.frappe, TXT).
  typing_text    text not null,
  -- banque QI : [{ "slot": "<thème>", "variants": [{ "q", "opts": [4], "a": <index bonne réponse> }] }]
  -- une variante tirée au hasard par emplacement à chaque tentative ; la bonne réponse (`a`) ne
  -- descend jamais au client (cf. recruit_attempts.qi_answers).
  qi_bank        jsonb not null,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null
);
create index recruit_config_updated_by_idx on public.recruit_config (updated_by);

insert into public.recruit_config (id, typing_text, qi_bank) values (
  1,
  'le chatting est un metier ou la rapidite et la qualite comptent beaucoup un bon chatter sait engager la conversation creer du lien et donner envie a son interlocuteur de continuer a discuter avec lui chaque jour tout en restant naturel et souriant',
  '[
    {"slot":"Suite logique","variants":[
      {"q":"Quelle est la suite : 2, 4, 8, 16, … ?","opts":["24","32","30","18"],"a":1},
      {"q":"Quelle est la suite : 3, 6, 9, 12, … ?","opts":["13","15","16","14"],"a":1}
    ]},
    {"slot":"Intrus","variants":[
      {"q":"Trouve l''intrus :","opts":["pomme","banane","carotte","cerise"],"a":2},
      {"q":"Trouve l''intrus :","opts":["lundi","mars","mercredi","vendredi"],"a":1}
    ]},
    {"slot":"Raisonnement","variants":[
      {"q":"Pierre est plus grand que Paul mais plus petit que Jacques. Qui est le plus petit ?","opts":["Jacques","Paul","Pierre","On ne peut pas savoir"],"a":1},
      {"q":"Main est à gant ce que pied est à…","opts":["chaussette","chaussure","jambe","sol"],"a":1}
    ]},
    {"slot":"Lecture du client","variants":[
      {"q":"Un client répond juste « ok. » avec un point. Ça traduit plutôt…","opts":["de la joie","de la froideur / un désintérêt","de l''excitation","une question"],"a":1},
      {"q":"Un client écrit « je m''ennuie ce soir… ». La meilleure réaction ?","opts":["répondre « ok »","lui poser une question pour le faire parler","changer de sujet","ne rien répondre"],"a":1}
    ]},
    {"slot":"Vente","variants":[
      {"q":"« J''ai trop envie de toi, tu me proposes quoi ? »","opts":["« Viens chez moi »","Entretenir le désir + rediriger vers du contenu privé","« Je suis occupée, plus tard »","« Désolée, je ne fais pas ça »"],"a":1},
      {"q":"« Tout gratuit, sinon je me désabonne. »","opts":["Tout envoyer pour le garder","Refuser avec le sourire + proposer une petite offre","« Au revoir alors »","L''ignorer"],"a":1}
    ]}
  ]'::jsonb
);

-- Tentative technique : créée dès l'entrée sur /postuler (device + IP, pour le rate-limit et le
-- coût IA visible même sur les abandons), avant toute identité. Statuts : en_cours → notee (bot
-- scoré) → soumise (dossier créé) ; abandonnee = jamais soumise.
create table public.recruit_attempts (
  id               uuid primary key default gen_random_uuid(),
  device           text not null,
  ip               text,
  persona          text not null,
  status           text not null default 'en_cours'
                     check (status in ('en_cours', 'notee', 'soumise', 'abandonnee')),
  -- QI : score serveur (0-5) + clé de correction posée au tirage (slot/variante/bonne réponse
  -- pour CETTE tentative) — comparée aux réponses envoyées par le client, ne descend JAMAIS au
  -- client (aucune policy anon/authenticated ne lit cette table).
  qi_score         smallint check (qi_score between 0 and 5),
  qi_answers       jsonb,
  -- { wpm, accuracy, seconds } — déclaratif client (comme GLA), gate caché.
  typing           jsonb,
  connection_mbps  numeric(7,1) check (connection_mbps is null or connection_mbps >= 0),
  bot_replies      int not null default 0 check (bot_replies >= 0),
  input_tokens     int not null default 0 check (input_tokens >= 0),
  output_tokens    int not null default 0 check (output_tokens >= 0),
  orthographe      smallint check (orthographe between 0 and 25),
  coherence        smallint check (coherence between 0 and 25),
  relance          smallint check (relance between 0 and 25),
  vente            smallint check (vente between 0 and 25),
  bot_total        smallint check (bot_total between 0 and 100),
  created_at       timestamptz not null default now()
);
-- Rate-limit (5 tentatives / IP / 24h) : couvert par le premier index (ip en tête).
create index recruit_attempts_ip_created_at_idx on public.recruit_attempts (ip, created_at desc);
create index recruit_attempts_created_at_idx on public.recruit_attempts (created_at desc);

-- Transcription de la conversation fan IA, tenue CÔTÉ SERVEUR (pas de transcription forgée par
-- le client). speaker 'candidat' = le chatter testé, 'client' = le bot (persona GLA).
create table public.recruit_messages (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   uuid not null references public.recruit_attempts(id) on delete cascade,
  position     smallint not null check (position >= 0),
  speaker      text not null check (speaker in ('candidat', 'client')),
  body         text not null,
  -- prix € d'un média verrouillé envoyé par le candidat (mécanique GLA [MEDIA VERROUILLE - X€]).
  media_price  numeric(8,2) check (media_price is null or media_price >= 0),
  created_at   timestamptz not null default now(),
  unique (attempt_id, position)
);
-- attempt_id couvert par l'unique (attempt_id, position) en tête.

-- Dossier candidat, créé UNIQUEMENT à la soumission finale (identité à la fin, cf. spec §1) —
-- toutes les mesures sont donc connues et figées à la création (snapshot de la tentative notée).
create table public.recruit_candidates (
  id                uuid primary key default gen_random_uuid(),
  attempt_id        uuid not null unique references public.recruit_attempts(id) on delete cascade,
  first_name        text not null check (length(first_name) between 1 and 60),
  last_name         text not null check (length(last_name) between 1 and 60),
  -- stockée en minuscules par l'app (normalisation avant écriture, cf. blocklist).
  email             text not null,
  discord           text check (discord is null or length(discord) between 1 and 60),
  qi_score          smallint not null check (qi_score between 0 and 5),
  typing_wpm        smallint not null check (typing_wpm >= 0),
  connection_mbps   numeric(7,1) not null check (connection_mbps >= 0),
  orthographe       smallint not null check (orthographe between 0 and 25),
  coherence         smallint not null check (coherence between 0 and 25),
  relance           smallint not null check (relance between 0 and 25),
  vente             smallint not null check (vente between 0 and 25),
  bot_total         smallint not null check (bot_total between 0 and 100),
  global            smallint not null check (global between 0 and 100),
  passed            boolean not null,
  -- raison qualitative de refus (épreuve la plus faible, jamais les chiffres — GLA finishCandidate).
  refusal_step      text,
  refusal_reason    text,
  -- e-mail déjà porteur d'un dossier à la soumission (2e passage, cf. blocklist oneAttempt).
  repeat            boolean not null default false,
  status            text not null default 'nouveau' check (status in ('nouveau', 'valide', 'refuse')),
  profile_id        uuid references public.profiles(id) on delete set null,
  reviewed_by       uuid references public.profiles(id) on delete set null,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),
  constraint recruit_candidates_refusal_consistency
    check (passed = (refusal_step is null and refusal_reason is null))
);
-- attempt_id déjà indexé par l'unique en tête.
create index recruit_candidates_email_idx on public.recruit_candidates (email);
create index recruit_candidates_status_nouveau_idx on public.recruit_candidates (created_at desc)
  where status = 'nouveau';
create index recruit_candidates_profile_id_idx on public.recruit_candidates (profile_id);
create index recruit_candidates_reviewed_by_idx on public.recruit_candidates (reviewed_by);

-- Un seul essai (oneAttempt GLA) : device + e-mail (+ Discord) rejoignent cette liste à la
-- soumission ; device/IP vérifiés à l'ENTRÉE du test, e-mail/Discord à la SOUMISSION.
create table public.recruit_blocklist (
  id          uuid primary key default gen_random_uuid(),
  device      text,
  -- stocké en minuscules par l'app.
  email       text,
  discord     text,
  ip          text,
  reason      text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint recruit_blocklist_has_target
    check (device is not null or email is not null or discord is not null or ip is not null)
);
create index recruit_blocklist_device_idx on public.recruit_blocklist (device);
create index recruit_blocklist_email_idx on public.recruit_blocklist (email);
create index recruit_blocklist_ip_idx on public.recruit_blocklist (ip);
create index recruit_blocklist_created_by_idx on public.recruit_blocklist (created_by);

alter table public.recruit_config enable row level security;
alter table public.recruit_attempts enable row level security;
alter table public.recruit_messages enable row level security;
alter table public.recruit_candidates enable row level security;
alter table public.recruit_blocklist enable row level security;

create policy recruit_config_read on public.recruit_config for select to authenticated
  using ((select public.is_admin()));
create policy recruit_config_admin_write on public.recruit_config for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy recruit_attempts_read on public.recruit_attempts for select to authenticated
  using ((select public.is_admin()));
create policy recruit_messages_read on public.recruit_messages for select to authenticated
  using ((select public.is_admin()));
create policy recruit_candidates_read on public.recruit_candidates for select to authenticated
  using ((select public.is_admin()));
create policy recruit_blocklist_read on public.recruit_blocklist for select to authenticated
  using ((select public.is_admin()));
-- Aucune autre policy : ni anon (le test public n'a pas de session), ni authenticated non-admin.
-- Toutes les écritures (candidat public + actions admin de la page Recrutement) passent par
-- createAdminClient() côté serveur, hors RLS.

-- Badge sidebar (item « Recrutement », admin seulement) : nombre de dossiers 'nouveau'.
create or replace function public.recruit_pending_count()
returns integer
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
    when (select public.is_admin()) then (select count(*)::integer from recruit_candidates where status = 'nouveau')
    else 0
  end;
$$;
revoke execute on function public.recruit_pending_count() from public, anon;
grant execute on function public.recruit_pending_count() to authenticated;
