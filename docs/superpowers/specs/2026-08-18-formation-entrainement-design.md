# Formation — Entraînement (moteur IA, sessions, progression, overview) — design

Date : 2026-08-18 · Statut : validé en chat, à relire · Incrément 2 de la face **Formation**
(après le Catalogue, spec `2026-08-17-formation-catalogue-design.md`, branche
`feature/formation-catalogue` — on continue sur la même branche, rien n'est mergé).

## 1. Contexte et objectif

L'incrément 1 a porté le **catalogue** de Good Luck Agency (GLA) : modules, cours, 85 cas,
défis, boss. Il manque tout ce qui fait l'entraînement lui-même — routes GLA `/api/formation/bot`,
`/score`, `/sessions`, `/last`, `/session-detail`, `/boss-save`, `/myprogress`, `/me`, `/ranking`,
`/chatters`, `/progress`, `/health`, `/report`, `/reports`. Cet incrément les reprend **d'un coup**,
sur notre archi, avec quatre exigences de Benoit : **rapide à charger**, **sobre en tokens**,
**conforme à l'archi du CRM (face chatter + back)**, **sans over-engineering**. Le test de
recrutement public (`/api/bot`, `/score`, `/candidate`, `/status`…) reste sur GLA — à part, plus tard.

Décisions prises en chat (2026-08-18) :
- Périmètre : moteur IA + secrets durcis, sessions **solo + défi simultané + boss**, Ma formation
  complète (progression, streak, médailles, trophées, classement), Overview encadrant, signalement.
- **Overview non cloisonné** : chacun voit le sien ; manager, sous-manager et admin ont un
  sélecteur « par chatter / tous ».
- **Classement gardé** (base des récompenses / roue — l'attribution des récompenses est hors
  périmètre).
- **Statut « en formation » = le nouvel arrivant existant** (`is_new` / `arrived_at` de Membres) —
  rien à créer.
- Tous les modules visibles de tous ; **seul le boss est verrouillé** (moyenne < 60/100), pas de
  déblocage de modules par chatter (GLA le faisait ; simplifié).
- Trophées gardés en rendu sobre (liste, pas de médailles dorées).
- **Approche A** : Server Actions partout, pas de streaming ni de Route Handler ; fan **Haiku 4.5**,
  notation **Sonnet 5** en un appel structuré.

Ce que fait GLA (référence, `serveur.py` + `index.html`) et qu'on reproduit : boucle
lire le cours → jouer un cas contre un fan IA (messages texte ou **média verrouillé** avec un
prix en €) → fin par `tours_max` ou « Terminer » → **note par axe** (0-25 chacun, total /100),
`objectif_atteint`, **plafond 65** si l'objectif n'est pas atteint, **2-3 moments cités** mot pour
mot avec un indice, commentaire → meilleur score par cas, tentatives, jours d'entraînement (streak),
points, **boss verrouillé sous 60 de moyenne**, médailles Or ≥ 85 / Argent ≥ 75 / Bronze ≥ 60 /
sinon « À valider », trophées, classement, signalement d'une note.

## 2. Périmètre — livrables (PRs, chacune visible)

1. **Secrets + moteur IA** : migration `0116` (tables secrets, déplacement des colonnes), Catalogue
   adapté, `lib/ai/` (client, prompts, schéma de notation), `training_ai_calls`.
2. **Sessions solo** : `0117` (sessions, threads, messages, scores, reports, ai_calls, RLS,
   index), `startSession` / `sendMessage` / `endSession` / `scoreSession`, page session (jeu →
   résultat), bouton « Jouer » dans Modules.
3. **Défi simultané + boss** : threads multiples, révélation différée, chrono, élimination,
   notation par fan.
4. **Ma formation** : `0118` (agrégats + triggers + RPC), page complète, classement, trophées,
   médailles dans Modules.
5. **Overview encadrant + signalement** : sélecteur, KPIs, points faibles par axe, coût IA
   (admin), signalements ouverts / résolus, `rescoreSession` (admin).
6. **Docs + recette** : CLAUDE.md, spec, checklist UAT.

Hors périmètre : test de recrutement, roue des récompenses, streaming, notifications, reprise
d'un défi/boss interrompu (voir §5), export.

## 3. Modèle de données

Conventions : celles de 0113 (`uuid gen_random_uuid()`, `text + check`, `timestamptz`, RLS
wrappée `(select …)`, FK indexées sauf unique en tête, `create policy` simple, pas d'enum). Un
seul jsonb « document » assumé par table quand la structure est vraiment libre (`case_snapshot`,
`moments`).

### 3.1 Secrets du catalogue (migration `0116`)

La RLS 0113 est par ligne : tout membre Formation peut lire `fan_brief`, `expected`,
`scoring_notes` et les champs cachés des fans via PostgREST. On déplace ces colonnes dans des
tables **admin seul** ; le moteur IA les lit côté serveur avec le client service-role.

```sql
create table public.training_case_secrets (
  case_id   uuid primary key references public.training_cases(id) on delete cascade,
  fan_brief text,                 -- consigne du fan (solo)
  expected  text                  -- « ce qui était attendu » (solo)
);
create table public.training_module_secrets (
  module_id     uuid primary key references public.training_modules(id) on delete cascade,
  scoring_notes text              -- consigne de notation
);
create table public.training_boss_fan_secrets (
  fan_id         uuid primary key references public.training_case_boss_fans(id) on delete cascade,
  budget_cap     integer check (budget_cap >= 0),
  nego_threshold integer check (nego_threshold >= 0),
  nego_where     text, meet_when text, meet_where text, derails text
);
-- copie des données depuis 0113/0115, puis drop des colonnes sources ; le check
-- training_cases_solo_fields devient : kind='solo' ⇒ fan_name not null (fan_brief/expected
-- sont désormais dans secrets, obligatoires côté action pour un solo).
-- RLS : select/insert/update/delete = (select public.is_admin()) sur les 3 tables.
```

Catalogue : `saveCase` / `saveModule` / `duplicateCase` écrivent dans les tables secrets (upsert
par pk) ; `getCatalog` les joint (admin) ; le générateur de seed émet les inserts secrets (la
`0115` reste telle quelle : la 0116 déplace ses données). `features/training-modules` n'y touche
jamais.

### 3.2 Sessions (migration `0117`)

Une **session** = un cas joué par un chatter ; **N threads** (1 solo, 5 défi, 5 boss = un par fan) ;
chaque thread a ses messages et sa notation.

```sql
create table public.training_sessions (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references public.profiles(id) on delete cascade,
  case_id            uuid not null references public.training_cases(id) on delete restrict,
  module_id          uuid not null references public.training_modules(id) on delete restrict,
  kind               text not null check (kind in ('solo','arena','boss')),
  status             text not null default 'active' check (status in ('active','scored','failed','abandoned')),
                                       -- failed = solo éliminé (faute grave du chatter détectée par le fan, ou chrono) : non noté
  case_snapshot      jsonb not null,   -- PARTIE VISIBLE seulement : code, title, phase, difficulty,
                                       -- context, objective, objectiveLabel, targetLine, maxTurns,
                                       -- reactionMaxS, isSale (jamais fan_brief/expected)
  total              smallint check (total between 0 and 100),   -- moyenne des threads notés
  objective_reached  boolean,
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  scored_at          timestamptz
);
create index training_sessions_profile_started_idx on public.training_sessions (profile_id, started_at desc);
create index training_sessions_case_idx on public.training_sessions (case_id);
create index training_sessions_module_idx on public.training_sessions (module_id);
-- une seule session active par chatter
create unique index training_sessions_one_active_idx on public.training_sessions (profile_id) where status = 'active';

create table public.training_threads (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.training_sessions(id) on delete cascade,
  position      smallint not null,
  ref_case_id   uuid references public.training_cases(id) on delete restrict,   -- défi : le solo rejoué
  boss_fan_id   uuid references public.training_case_boss_fans(id) on delete restrict,
  fan_name      text not null,
  status        text not null default 'open' check (status in ('open','done','lost')),
  lost_reason   text check (lost_reason is null or lost_reason ~ '^(timeout|[a-z_]{2,20})$'),
                                    -- 'timeout' (chrono) ou le code de faute émis par le fan ([[ELIM:code]])
  turns_used    smallint not null default 0,
  max_turns     smallint not null,
  next_due_at   timestamptz,       -- chrono : réponse attendue avant (défi/boss)
  unique (session_id, position)
);
create index training_threads_ref_case_idx on public.training_threads (ref_case_id);
create index training_threads_boss_fan_idx on public.training_threads (boss_fan_id);

create table public.training_messages (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.training_threads(id) on delete cascade,
  position     smallint not null,
  speaker      text not null check (speaker in ('chatter','fan')),
  body         text not null check (length(body) between 1 and 1000),
  media_price  integer check (media_price is null or media_price between 1 and 10000),  -- média verrouillé
  visible_at   timestamptz not null default now(),   -- révélation différée (défi/boss)
  created_at   timestamptz not null default now(),
  unique (thread_id, position)
);

create table public.training_thread_scores (
  thread_id         uuid primary key references public.training_threads(id) on delete cascade,
  total             smallint not null check (total between 0 and 100),
  objective_reached boolean not null,
  capped            boolean not null default false,        -- plafond 65 appliqué
  comment           text not null,
  moments           jsonb not null default '[]'::jsonb,   -- [{cite,type:'good'|'bad',probleme,indice}] ≤ 3
  scored_at         timestamptz not null default now()
);
create table public.training_thread_axis_scores (
  thread_id uuid not null references public.training_threads(id) on delete cascade,
  axis_key  text not null,
  axis_name text not null,
  score     smallint not null check (score between 0 and 25),
  primary key (thread_id, axis_key)
);

create table public.training_reports (           -- signalement d'une notation
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.training_sessions(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  message     text not null check (length(message) between 1 and 2000),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);
create index training_reports_open_idx on public.training_reports (created_at desc) where resolved_at is null;
create index training_reports_session_idx on public.training_reports (session_id);
create index training_reports_resolved_by_idx on public.training_reports (resolved_by);

create table public.training_ai_calls (          -- traçabilité coût / latence
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.training_sessions(id) on delete cascade,
  thread_id     uuid references public.training_threads(id) on delete set null,
  kind          text not null check (kind in ('fan','score')),
  model         text not null,
  input_tokens  integer not null,
  output_tokens integer not null,
  cache_read_tokens integer not null default 0,
  latency_ms    integer not null,
  ok            boolean not null default true,
  created_at    timestamptz not null default now()
);
create index training_ai_calls_session_idx on public.training_ai_calls (session_id);
create index training_ai_calls_thread_idx on public.training_ai_calls (thread_id);
create index training_ai_calls_created_idx on public.training_ai_calls (created_at desc);
```

### 3.3 Agrégats pré-calculés (migration `0118`)

Perf : Ma formation, Overview et classement lisent 1-2 lignes au lieu de rejouer les sessions
(GLA recalcule tout à chaque appel). Maintenus par **trigger** `after insert or update on
training_sessions` quand `status` passe à `scored` (`security definer`, `search_path` figé).

```sql
create table public.training_case_bests (
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  case_id        uuid not null references public.training_cases(id) on delete cascade,
  best_total     smallint not null,
  best_objective boolean not null,
  attempts       integer not null default 1,
  last_at        timestamptz not null,
  primary key (profile_id, case_id)
);
create index training_case_bests_case_idx on public.training_case_bests (case_id);

create table public.training_profile_stats (
  profile_id      uuid primary key references public.profiles(id) on delete cascade,
  cases_done      integer not null default 0,     -- cas distincts notés (hors boss)
  avg_total       numeric(5,2),                   -- moyenne des meilleurs totaux (hors boss)
  points          integer not null default 0,     -- Σ meilleurs totaux (hors boss)
  boss_best       smallint,
  boss_done       boolean not null default false, -- boss réussi = objectif atteint
  active_days     integer not null default 0,
  streak_days     integer not null default 0,
  last_active_day date,                            -- Europe/Paris
  last_session_at timestamptz,
  updated_at      timestamptz not null default now()
);
```

Fonction `training_refresh_stats(p_profile uuid, p_case uuid, p_total int, p_objective bool,
p_kind text, p_at timestamptz)` appelée par le trigger : upsert du best (`greatest`, `attempts+1`),
recalcul des stats du profil (une requête sur `training_case_bests` du profil, ~85 lignes max),
streak = si `last_active_day` = aujourd'hui (Paris) inchangé ; = hier → +1 ; sinon 1.

RPC (lecture, `security invoker`) : `training_axis_profile(p_profile uuid)` → moyenne par
`axis_key/axis_name` des `training_thread_axis_scores` du chatter (Overview « points faibles »,
borné à un chatter) ; `training_ai_cost(p_since timestamptz)` → tokens par modèle et par jour
(admin).

### 3.4 RLS

| Table | Lecture | Écriture |
|---|---|---|
| `training_case_secrets`, `training_module_secrets`, `training_boss_fan_secrets` | admin | admin |
| `training_sessions`, `training_threads`, `training_messages`, `training_thread_scores`, `training_thread_axis_scores` | propriétaire (`profile_id = auth.uid()` via la session) OU `is_manager()` OU `is_admin()` | insert/update par le **propriétaire** (Server Actions, client session) ; les scores sont écrits en service-role par `scoreSession` (RLS conservée : aucune policy d'écriture pour `authenticated` sur les tables de scores) |
| `training_reports` | auteur OU `is_manager()` OU admin | insert auteur ; update (résolution) `is_manager()` / admin |
| `training_ai_calls` | admin | service-role uniquement |
| `training_case_bests` | propriétaire OU `is_manager()` OU admin | trigger uniquement |
| `training_profile_stats` | tout membre avec `has_page('formation')` (classement = agrégats, jamais de contenu) | trigger uniquement |

Les gardes applicatives miroir : `requirePageProfile('frm-entrainement')` pour jouer,
`frm-suivi` OU encadrant pour l'Overview, admin pour `rescoreSession` et le coût IA.

## 4. Moteur IA (`apps/web/src/lib/ai/`)

- **Client** : `@anthropic-ai/sdk` (nouvelle dépendance de `apps/web`), `new Anthropic()` lit
  `ANTHROPIC_API_KEY` (à ajouter à l'env web local + Vercel ; existe à la racine), `maxRetries: 2`,
  `timeout: 20_000` ms. Côté serveur uniquement (`server-only`).
- **Fan** (`replyAsFan`) : `claude-haiku-4-5`, `max_tokens` 200 (boss 260), pas de `thinking`,
  système = **transposition fidèle des prompts GLA** (`formation_bot_system` / `formation_boss_bot_system` :
  fiction entre adultes, règle de personnage absolue, règles de sécurité, prénom, consigne du fan
  lue dans `training_case_secrets` — ou fan du boss : persona + secrets `budget_cap`/paliers/négo/
  rencontre/dérives —, style SMS, mémoire infaillible, section MÉDIAS PAYANTS si `is_sale`, et les
  **fautes graves** : le fan peut terminer sa réponse par un token `[[ELIM:code]]` — codes GLA
  `interro`, `froid`, `brutal`, `saut`, `spam`, `gratuit`, `remise_prev`, `abandon`, `renc_date`,
  `force_stop`, `brushoff`, `revente` — que le serveur **retire du texte** et transforme en
  élimination du thread (`lost`, `lost_reason` = code) ; libellés FR des fautes repris de GLA
  (`BOSS_FAULTS`) dans `lib/types/training.ts`) ; messages = l'historique complet du thread
  (SMS ≈ 2 k tokens max) au format GLA (`to_messages_formation` : fan = assistant, chatter =
  user, tours consécutifs fusionnés, média → `[MEDIA VERROUILLE - X€]`, premier tour user
  « (début de la conversation) » si besoin). Le prompt est trop court pour le cache
  Haiku (minimum 4 096 tokens sur ce modèle) — sans conséquence : ~0,03 $ la session solo.
  Refus (`stop_reason: 'refusal'`, possible sur du sexting) → réponse de repli neutre (« … »)
  insérée, `training_ai_calls.ok = false`, jamais de crash.
- **Notation** (`scoreThread`) : `claude-sonnet-5`, `output_config.format` = schéma JSON
  **généré depuis les axes du module** (`{ [axis_key]: 0-25 }` + `total 0-100` +
  `objectif_atteint` + `plafond?` + `moments[]{cite,type,probleme,indice}` + `commentaire`),
  `messages.parse()` (SDK) + revalidation Zod des bornes ; **un appel par thread**, transcript
  formaté « Créatrice / Fan », `[MÉDIA VERROUILLÉ — X €]` ; consigne de notation
  (`training_module_secrets`) + attendu (`training_case_secrets`) ; boss : schéma boss
  (setting/transition/sexting/rencontre/nego/relationnel + note) via `formation_boss_score_system`
  transposé, un appel **par fan** — `objective_reached` d'un fan du boss = `note ≥ 60`
  (le schéma boss GLA n'a pas de champ objectif ; simplification assumée) ; `thinking: { type:
  'adaptive' }` + `output_config.effort: 'low'` (à réévaluer sur 10 sessions). Thread `lost` → 0
  sans appel.
- **Traçabilité** : chaque appel écrit `training_ai_calls` (modèle, tokens, `cache_read`,
  latence, ok) → coût réel visible dans l'Overview admin.
- **Robustesse** : échec fan → `BusinessError` « Le fan n'a pas répondu, réessaie » (le message du
  chatter reste, pas de double insertion : idempotence par `position`) ; échec notation → session
  reste `active`, bouton « Relancer la notation » ; refus/timeout tracés dans `training_ai_calls`.
- **Prompts** : `lib/ai/prompts.ts` (texte FR, tests unitaires sur l'assemblage), `lib/ai/schema.ts`
  (schéma structuré depuis les axes, testé).

Coût attendu (tarifs août 2026 : Haiku 1 $/5 $ par M tokens, Sonnet 5 3 $/15 $, promo 2 $/10 $
jusqu'au 31/08) : solo ≈ 0,03 $ (fan) + 0,02-0,03 $ (note) ; défi ≈ 5× ; boss ≈ 0,7 $ + 5 notes ≈
0,9 $ au pire (32 tours × 5 fans).

## 5. Sessions — flux (feature `training-session`, route `/formation/session/[id]`)

- **Démarrer** `startSession(caseId)` : garde `frm-entrainement` ; cas actif ; **boss verrouillé si
  `avg_total < 60`** (`training_profile_stats`) ; une seule session `active` par chatter (l'UI
  propose « Reprendre » ou « Abandonner » l'existante) ; crée session (snapshot visible) + threads
  (solo : 1 ; défi : 5, un par créneau, `ref_case_id`, `fan_name` = prénom du créneau, ouverture =
  messages d'ouverture du solo rejoué ; boss : 5, `boss_fan_id`, ouverture = `opening_message`) +
  messages d'ouverture (`visible_at` échelonnés en défi/boss : 0 s, +20 s, +45 s, +75 s, +110 s) ;
  redirige.
- **Jouer** (feuille client) : contexte + objectif (libellé du module) en tête ; fil ; saisie +
  bouton **média verrouillé** (prix €) ; `tour n / max` ; **chrono** de réponse affiché ;
  **Terminer**. `sendMessage(threadId, { body } | { mediaPrice })` : garde propriétaire + thread
  `open` + tour disponible + **chrono** (`now ≤ next_due_at` ; solo : **60 s** après chaque
  réponse du fan — constante `SOLO_REACTION_S`, comme GLA `TRAIN_LIMIT_MS` ; défi/boss :
  `reaction_max_s` du cas ; dépassé → thread `lost` (`timeout`), `BusinessError` « Trop lent —
  ce fan est parti ») ; insère le message chatter ; appelle le fan ; si la réponse porte
  `[[ELIM:code]]` → token retiré, réponse insérée, thread `lost` (`lost_reason` = code) ; sinon
  insère sa réponse avec
  `visible_at = now` (solo) ou `now + aléa(30-120 s)` (défi/boss) et `next_due_at = visible_at +
  reaction_max_s` ; `turns_used += 1` ; dernier tour → thread `done`. Renvoie les 2 messages
  (+ `visible_at`) : le client affiche le message chatter tout de suite (optimiste), « … » pendant
  l'appel, puis le fan (solo) ou programme la révélation (défi/boss, timer local ; à la révélation
  le compte à rebours démarre). Fin auto quand tous les threads sont `done`/`lost` ; **Terminer**
  = `endSession` (les threads `open` deviennent `done`) ; **Abandonner** = `abandonSession`
  (`abandoned`, non noté). **Solo éliminé** (timeout ou faute) → session `failed`, écran « Raté »
  (⏱️ Temps écoulé / 💀 Le fan t'a lâché + libellé et explication de la faute, « Recommencer »,
  « Retour ») — non noté, la conversation reste consultable ; défi/boss : le thread `lost` reste
  affiché figé, les autres continuent.
- **Noter** `scoreSession(sessionId)` : garde propriétaire + session terminée non notée ; par thread
  `done` un appel (`lost` = 0) ; écrit scores + axes ; `total` = moyenne des threads ;
  `objective_reached` = tous les threads notés objectif atteint (défi/boss) ; statut `scored` →
  trigger agrégats.
- **Résultat** (même route, vue résultat) : note /100 + médaille, objectif ✓ / plafond, axes en
  barres sobres, moments cités + indice, commentaire, **attendu révélé**, « Rejouer », « Retour au
  module », « Signaler cette note ». La page reste consultable ensuite (transcript + note) ;
  encadrant : même page en lecture.
- **Interruption** : solo reprend tel quel ; défi/boss dont tous les `next_due_at` sont dépassés
  au retour → `abandoned` (message clair « la session a expiré »).
- Réponses trop lentes / échecs : voir §4.

## 6. Ma formation (feature `training-me`, `/formation/ma-formation`, droit Entraînement)

Une lecture RLS (`training_profile_stats` + `training_case_bests` du chatter + catalogue actif) :
en-tête (session en cours → « Continuer », sinon « Reprendre où j'en étais » = 1er cas non validé du
1er module incomplet ; % global, moyenne, streak, points), modules (cartes : % fait, moyenne ;
détail = médaille par cas + « Jouer »), **Boss final** verrouillé si moyenne < 60 (« Ta moyenne :
54/100 — 60 requis »), historique (dernières sessions → résultat), **trophées** (liste sobre
gagné / à gagner : 1er cas validé, streak 3 j, streak 7 j, 5 Or, 15 Or, 1 module complet, tout
fait, boss réussi — `computeTrophies(stats)` dans `@glagency/core`, testé), **classement** (onglet
`?vue=classement` : tous les chatters Formation depuis `training_profile_stats` — points, % fait,
moyenne, boss ✓, mon rang en tête, tri par points).

Règles (dans `@glagency/core/training`, testées) : médailles Or ≥ 85 / Argent ≥ 75 / Bronze ≥ 60 /
« À valider » ; points = Σ meilleurs totaux ; moyenne = moyenne des meilleurs ; boss débloqué si
moyenne ≥ 60 ; streak = jours consécutifs (Paris) avec ≥ 1 notation.

Modules (lecture, déjà livrée) : médaille / meilleur score à côté de chaque cas + « Jouer » — seule
retouche.

## 7. Overview encadrant + signalement (feature `training-overview`, `/formation/overview`, droit Suivi)

- Sélecteur **« par chatter / tous »** pour manager, sous-manager, admin (un chatter avec le droit
  Suivi ne voit que lui). **Tous** : tableau (`training_profile_stats` + profil : nom, **nouveau**
  = en formation, modèle assigné) — % fait, moyenne, points, streak, boss ✓, dernière activité,
  sessions notées ; filtre « nouveaux » ; KPIs (chatters actifs 7 j, sessions 7 j, moyenne, boss
  réussis). **Par chatter** : progression par module, **points faibles par axe** (RPC
  `training_axis_profile`), historique des sessions → transcript + note. **Coût IA** (admin) :
  tokens × tarif sur 7/30 j (RPC `training_ai_cost`).
- **Signalement** : `reportScore(sessionId, message)` (chatter, une fois par session) ; l'Overview
  liste les signalements ouverts (badge), lien vers la session, `resolveReport(id)` (encadrant) ;
  `rescoreSession(sessionId)` (admin) relance la notation (nouvel appel IA, remplace les scores,
  recalcule les agrégats).

## 8. Architecture, perf, tests

- **Features** : `training-catalog` (retouché : secrets), `training-modules` (retouché : Jouer +
  médaille), `training-session`, `training-me`, `training-overview` ; partagé : `lib/ai/`
  (`client.ts`, `prompts.ts`, `schema.ts`, `fan.ts`, `score.ts`), `lib/types/training.ts`
  (élargi : `SessionStatus`, `ThreadStatus`, `FAULT_LABELS` — 12 codes + timeout, textes GLA —,
  `SOLO_REACTION_S`), `@glagency/core/training`
  (médailles, points, streak, trophées, déblocage boss). Routes : `/formation/session/[id]`,
  `/formation/ma-formation`, `/formation/overview` — `loading.tsx` partout, `error.tsx` de la face.
- **Patrons** : page = garde + kickoff sans await + `<Suspense>` ; Template RSC ; feuilles client ;
  services 1-3 requêtes, jamais de N+1 (`fetchAll` sur `training_messages` d'une session n'est pas
  nécessaire : ≤ 5 × 50 × 2 lignes) ; mutations `runAction` + `requirePageProfile` /
  `requireAdminProfile` + `BusinessError` + `revalidatePath` ; RLS = rempart réel ; les scores et
  `training_ai_calls` s'écrivent en service-role (`createAdminClient`) depuis les actions.
- **Perf / coût** : agrégats par trigger, snapshot visible dans la session, historique SMS court,
  un appel de notation, `training_ai_calls` pour mesurer, aucun polling (timers locaux à partir
  des `visible_at` renvoyés).
- **Tests** : `core` (règles) ; Vitest web (schémas Zod des actions, `prompts.ts`, `schema.ts` —
  schéma structuré depuis des axes) ; recette UAT (solo / défi / boss, signalement, overview).
- **Migrations** : `0116` secrets, `0117` sessions…, `0118` agrégats + triggers + RPC — UAT
  d'abord, prod avec la release (0110→0118 encore UAT-only).

## 9. Recette UAT (checklist)

1. Admin : Catalogue → éditer un solo (consigne + attendu = secrets) ; en tant que chatter, Modules
   ne montre rien de caché (payload RSC).
2. Chatter (Entraînement) : Ma formation → « Reprendre » → jouer un solo (texte + média verrouillé)
   → Terminer → note, moments, attendu révélé, médaille ; rejouer → tentatives 2, meilleur score.
3. Défi : 5 onglets, révélation différée, chrono, laisser un fan expirer → `lost`, note.
4. Boss verrouillé < 60 ; débloqué → 5 fans, notation par fan.
5. Classement, trophées, streak (2 jours).
6. Encadrant (Suivi) : Overview tous / par chatter, points faibles, coût IA (admin) ; signalement
   → résolution ; `rescoreSession`.
