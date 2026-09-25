# Architecture — glagencyapp

> Révision : 2026-09-25

**Ce fichier décrit le système.** Les règles pour coder dedans vivent dans `AGENTS.md` ; où vit chaque feature : `docs/CARTE.md` ; ce qui a changé : `CHANGELOG.md`.

---

## 1. Ce que c'est

CRM interne d'agence : dashboard de performance (chatters / créatrices / CA) — rebuild propre de l'ancien « Chatters Performance Dashboard ». **MyPuls reste la source** ; l'app reconstruit la couche analytics par-dessus.

Trois faces derrière un même dashboard, chacune un préfixe d'URL : **Chatteurs** (`/chatter/*`), **Marketing** (`/marketing/*`) et **Formation** (`/formation/*`, reprise de l'ancienne plateforme Good Luck Agency). Détail de chaque face : § 2 (structure des faces) et § 10 (règles par domaine).

## 2. Structure

```
apps/web           dashboard Next.js 16 (App Router, RSC) — @glagency/web
apps/ingestion      worker cron Cloudflare : MyPuls/Uncove → Supabase — @glagency/ingestion
packages/core       domaine pur : métriques + moteur d'insights (règles), testé Vitest — @glagency/core
packages/db         accès Supabase service-role, types générés, chiffrement — @glagency/db
packages/mypuls     client + parseurs MyPuls (scrape) — @glagency/mypuls
packages/uncove     client + parseurs Uncove (scrape) — @glagency/uncove
docs/               runbooks, guidelines, dettes ouvertes (ce fichier est à la racine)
```

Monorepo pnpm workspaces (`apps/*`, `packages/*`), pas de Turborepo. Le détail par feature (route, dossier, tables/RPC consommées) vit dans `docs/CARTE.md` — ne pas le recopier ici.

### Les 3 faces du CRM

- **3 faces du CRM = préfixe d'URL** : `Chatteurs` (`/chatter/*`), `Marketing`
  (`/marketing/*`) et `Formation` (`/formation/*` — reprise de Good Luck Agency ; TOUTE la face tient dans la
  migration consolidée **`0113_formation.sql`** (fusion 2026-08-21 des ex-0113→0127 ; au 2026-09-09,
  prod à **0152** — tout le relevé MyPuls y est passé avec les Releases 2.26→2.28, la mention
  `--include-all` n'a plus d'objet ; `0146`/`0147` sont passées avec la Release 2.36, `0148`
  (habitudes déposées) avec la 2.37, `0149`/`0150`/`0151` avec les 2.40-2.41, et `0152`
  (`mkt_creator_revenue`, le CA des modèles ouvert au pôle marketing) avec la release du
  2026-09-09, et `0153` (`profiles.discord` : le pseudo Discord devient le nom affiché dans
  TOUTE la Formation, classements compris — les 4 RPC rendent `coalesce(discord, display_name)`,
  et le fallback e-mail réintroduit par 0119 disparaît) avec celle du 2026-09-11, et `0154`→`0157`
  (analytics IA, `/formation/ia`) avec la Release 2.50 du 2026-09-14 — `0154`-`0156` avant le
  merge, `0157` APRÈS le déploiement (elle droppe `training_ai_cost(1 arg)`, qu'appelait l'ancienne
  Overview). **Prod = UAT = `0157`, prochaine migration = `0158`**) : **catalogue**
  `training_*` (schéma + index + seed généré par
  `packages/db/scripts/gen-training-seed.mjs` depuis `formation.json`), Catalogue admin
  `features/training-catalog`, Modules en lecture `features/training-modules` (projection
  publique — jamais `fan_brief`/`expected` côté chatter — projection APPLICATIVE seulement :
  la RLS du catalogue est par ligne, secrets durcis en tables admin-only `training_case_secrets` /
  `training_module_secrets` / `training_boss_fan_secrets`). **Entraînement** :
  sessions/threads/messages/scores/signalements/`training_ai_calls`, stats/classement — moteur IA en `lib/ai/` uniquement (fan Haiku 4.5 **puis Sonnet 5 à partir du lun.
  28/09/2026 00h00 Paris** — bascule datée `trainingFanModels`, l'autre modèle en repli ; chaque
  modèle reçoit SON prompt, celui de Sonnet avec garde-fous et partie fixe en cache 1 h : ne pas
  toucher l'un sans rejouer le banc, cf. `prompts.ts` ; le bot du recrutement reste sur Haiku —
  notation Sonnet 5, tracé
  dans `training_ai_calls`), **aucun streaming / Route Handler**, Server Actions partout.
  `startSession`, partagé par plusieurs features (Modules, écran de résultat de session), vit en
  `lib/training/start-session.ts` (frontière ESLint interdit le cross-feature) — précédent
  `lib/impersonation/actions.ts`. **Écritures des sessions (sessions/threads/messages/signalements)
  = service-role après vérification de propriété dans les Server Actions ; RLS = lecture
  (propriétaire, encadrant `frm-suivi`, admin).** Roue des récompenses
  (`/formation/roue`, incr. 3) : ticket = top 3 du classement hebdo
  (`training_weekly_ranking`, points de la semaine), tirage serveur (`pickWeighted`), gains
  stockés (`training_wheel_spins`, € nullable, `paid_at` pour la compta plus tard), config
  admin 1 ligne, journal `member_events` kind `recompense` ; écritures service-role, RLS
  lecture. Poussé
  **UAT seulement**, à recetter. **Roue des modules** (`/formation/ma-roue`, migration `0136`) : 2ᵉ
  roue, celle du CHATTER — un tour par module terminé (≥ 60 à tous les exos, **sur des sessions
  jouées ici** : l'historique GLA importé ne paie pas, cf. D5 et `0123:414`). Ticket en
  `training_wheel_tickets.module_id` (unicité `(profile_id, module_id)` = un module paie une
  fois), tirage dans le MÊME `training_wheel_spins` que la roue nº 1 (une seule compta), octroi
  dans le trigger `training_on_session_scored` — **jamais dans `training_refresh_stats`**, que
  l'import appelle en boucle. Pastille de tours sur la sidebar. **Recrutement** (reprise GLA, incr. 4) : page publique
  `/postuler` (proxy `isPublic`, parcours QI→frappe→connexion→fan IA→identité, anti-triche
  SERVEUR — clé de correction/tirages/verdict jamais côté client), tables `recruit_*` + RPC `recruit_pending_count`, e-mails en lower (check), profil candidat au formulaire de fin. Admin
  only : `/formation/recrutement` (dossiers, valider/refuser/bloquer/débloquer/supprimer) +
  `/formation/recrutement/config` (seuils, banque QI 5 slots, texte de frappe normalisé) ;
  sidebar = item direct Recrutement (badge en attente) + groupe repliable « Configuration »
  (Catalogue déplacé dedans + Config du test) ; blocage auto (device/email/discord,
  `created_by` null) ≠ blocage admin (+ IP). Rattachement membre→candidat par e-mail à la
  création (lookup `recruit_candidates`, non bloquant). Écritures `recruit_*` :
  service-role après garde admin (comme le reste de la formation).
  **« En formation »** (`profiles.in_training`, `0147`) : le drapeau qui décide de l'onglet où un
  chatteur apparaît sur l'Overview — la coupure se faisait avant sur `models.length === 0`, une
  déduction qui ne tenait que tant qu'« Intégrer » rattachait une modèle dans le même geste. Ce
  dialog est **supprimé** : intégrer = un clic (compte chatteur + droits + `is_new` + `in_training`,
  pas d'`integrated_at` — c'est `syncAssignments` qui le posera au premier rattachement). Coché par
  défaut à la création d'un chatteur dans Membres (`member-defaults.ts`, `?? true`) ; **décoché par
  TRIGGER** (`profile_creators_clear_in_training`) et non par du code applicatif — `profile_creators`
  s'écrit aussi depuis le board Organisation, via RPC SQL, qu'un décochage dans `authz.ts` raterait ;
  retirer une modèle **ne recoche pas** (même écart assumé que `integrated_at`). Journal
  `member_events` kind **`integration`** — surtout pas `formation`, déjà pris par la reprise GLA
  (0123) et libellé « Ancienne plateforme ». Overview en **2 onglets** (`UrlTabs`, `?vue=agence`),
  tableau à 6 colonnes (Points/Série/Notées sortis : ce sont des chiffres de classement), badge
  « sans accès » pour un intégré sans `frm-entrainement` — la RPC `training_overview_roster` les
  ramène depuis 0147 (`… or in_training`). Spec :
  `docs/superpowers/specs/2026-09-04-formation-en-formation-design.md`. Droits
  `frm-suivi` (Overview,
  encadrement) / `frm-entrainement` (Ma formation, chatter), Modules et session ouverts aux deux
  (`NavItem.anyOf`, `requireAccess([...])`). Une seule source : `config/workspaces.ts`
  (`WORKSPACES`, type `WorkspaceId`). La face active se déduit du `pathname`
  (`workspaceForPath`) ; la sidebar (`AppSidebar` + `WorkspaceSwitcher`) affiche la nav de
  cette face. Face secondaire = droit de face unique (`marketing`, `formation`) + slugs
  préfixés (`mkt-*`, `frm-*`), `slugFace(slug)` dit à quelle face appartient un slug, la page
  Membres de chaque face gère SES droits (`scope`, `pageChoicesFor`). Ajouter/remplir une
  face = éditer `WORKSPACES` + créer les routes sous son `basePath`. Ne pas réintroduire de
  routes à plat.

## 3. Données

Deux projets Supabase, réfs documentées dans `docs/git-workflow.md` :

| Environnement | Ref | Région | Accès direct |
| --- | --- | --- | --- |
| prod (`main`) | `cqmfpsnqaxymswijdnfz` | eu-west-3 (`docs/runbook-uncove.md`) | `db.<ref>.supabase.co` injoignable IPv6-only depuis un poste de dev — passer par le pooler `aws-0-eu-west-3.pooler.supabase.com:5432` |
| UAT (`develop`) | `ihkksdmgtrbbjugeboks` | eu-west-3 | même pooler |

174 migrations séquentielles au 2026-09-24 (`packages/db/supabase/migrations/0001..0174`), prod = UAT à cette date. Procédure, pièges réseau (`no route to host` sur le direct) et commande d'application : `AGENTS.md` § Migrations. RLS activée par table pour le cloisonnement par modèle ; l'UI reste optimiste — principe posé dans `AGENTS.md` § Règles (« RLS = enforcement réel »).

## 4. Hébergement et environnements

| App | Cible | Détail |
| --- | --- | --- |
| `apps/web` | **Vercel**, région `cdg1` (`apps/web/vercel.json`) | `main` → Production (DB prod), `develop` → Preview/préprod (DB UAT), `feature/*` → Preview par commit (`docs/git-workflow.md`) |
| `apps/ingestion` | **Cloudflare Worker** `glagency-ingestion`, compte verrouillé `091614e1…` (`apps/ingestion/wrangler.toml`) | 4 Cron Triggers UTC : `23h05` (pipeline chatteurs + fan-out marketing liens), `00h00` (fan-out spenders), `04h30` (contrôle des shifts MyPuls), `05h00` (relevé Uncove) — 4 des 5 slots Cron autorisés par compte sur le plan Free |

Le worker accepte aussi un déclenchement HTTP manuel (`fetch`), protégé par le secret `TRIGGER_TOKEN` (`Authorization: Bearer`) — sans lui, toujours 403 (`apps/ingestion/src/worker.ts`).

## 5. Déploiement

**`apps/web` se déploie automatiquement sur Vercel à chaque push** (`main` = prod, `develop`/`feature/*` = preview — `docs/git-workflow.md`). `apps/web/next.config.ts` documente Vercel comme SEULE cible depuis le passage à `cacheComponents: true` (non supporté par l'adaptateur OpenNext Cloudflare).

**`apps/ingestion` se déploie manuellement** : `pnpm --filter @glagency/ingestion deploy` (= `wrangler deploy`) — aucun fichier du repo ne montre de pipeline automatisé pour ce worker.

**Aucune CI** (décision de Benoît, commit `847dc3c`) : les vérifications sont locales, par task — détail § 8. Cycle de branches, hotfix, versioning et accord de mise en prod : `docs/git-workflow.md`. Release : `pnpm release:prepare` puis `pnpm release:tag` (`AGENTS.md` § Carte, changelog, release).

**Invalidation du cache après ingestion** : `apps/web` expose `POST /api/revalidate` (secret partagé `REVALIDATE_SECRET`, allow-list de tags fermée à `facts-daily`, comparaison timing-safe) — décrit dans `docs/guidelines-socle.md` § 2. Ce que l'appelle réellement en prod n'est pas prouvé : § 9.

## 6. Observabilité

Sentry est câblé aux deux apps :

- `apps/web` (`@sentry/nextjs`) : serveur (`instrumentation.ts`, `onRequestError` capture RSC/Route Handlers/Server Actions), client chargé paresseusement après idle (`instrumentation-client.ts` — ~38 Ko gzip évités du chunk critique), errors-only, pas de PII (`sentry.server.config.ts`/`sentry.edge.config.ts`). DSN `NEXT_PUBLIC_SENTRY_DSN`, actif seulement si `NODE_ENV === 'production'`.
- `apps/ingestion` : `@sentry/cloudflare` dans le Worker (`withSentry` capture les crashes), `@sentry/node` dans les CLI (`spenders.ts`, `shifts.ts`, `uncove.ts`). DSN `SENTRY_DSN` — absent, le SDK reste inactif. Un run dégradé (login KO, jour en échec, 0 ligne) part en `captureMessage` warning ; un cron manqué (missed check-in) est détecté par le **cron monitor Sentry** (slugs `ingestion-mypuls-nightly`, `ingestion-marketing-nightly`, et le monitor Uncove — alignés à la main sur les crons de `wrangler.toml`).

Historique durable indépendant de Sentry : chaque run d'ingestion insère une ligne dans la table Supabase `ingest_runs`, lisible depuis `/chatter/presence/reglages`.

`.env.example` déclare aussi `TG_BOT_TOKEN`/`TG_CHAT_ID` (« Alertes ingestion ») : aucune référence dans le code au 2026-09-25 — vestige probable, canal inactif (§ 9).

## 7. Variables d'environnement

Un seul `.env` à la racine (pas de fichier par app), modèle documenté dans `.env.example` : Supabase (web + migrations), MyPuls (cookie de session / identifiants), Good Luck Agency (lecture seule, reprise historique), IA (`ANTHROPIC_API_KEY`), alertes, Sentry, Uncove (`UNCOVE_TOKEN_SECRET` — chiffrement des `user_token`, même valeur web/ingestion).

- **Web (Vercel)** : secrets serveur et `NEXT_PUBLIC_*` posés dans le dashboard Vercel du projet (Production/Preview) — non vérifiable depuis le repo.
- **Ingestion (Cloudflare)** : secrets injectés en bindings (`wrangler secret put <VAR>`), jamais dans `wrangler.toml` (liste commentée en bas du fichier). Le code lit `process.env` : le handler recopie les bindings dedans au démarrage (`apps/ingestion/src/worker.ts`).
- **Local (`apps/ingestion` CLI)** : `loadEnv()` charge le `.env` racine (`apps/ingestion/src/env.ts`) — c'est ce même fichier qu'exploite `dev:uat` d'`apps/web` (extraction des clés `*_UAT`).

## 8. CI et contrôles

**Aucune CI GitHub** : pas de dossier `.github/`, décision assumée (§ 5). Les gates sont locaux :

| Où | Quoi | Bloquant |
| --- | --- | --- |
| local, avant PR `feature/*` → `develop` | `pnpm lint` / `pnpm typecheck` / `pnpm build` / tests `@glagency/core` (`docs/git-workflow.md`) | non techniquement — discipline manuelle |
| local, `pnpm release:prepare` (avant PR `develop` → `main`) | arbre git propre, section « Non publié » du `CHANGELOG.md` non vide, `node scripts/check-carte.mjs` | oui — le script lève une erreur et s'arrête (`scripts/release.mjs`) |
| local | `pnpm test:scripts` (`node --test scripts/*.test.mjs`) — teste `check-carte.mjs` et `release.mjs` eux-mêmes | à jouer à la main, non branché ailleurs |

Aucun hook git installé (pas de `core.hooksPath`, pas de dossier `.githooks`) — la protection de `main` (push direct refusé) est un ruleset GitHub, pas un hook local.

## 9. Ce qui n'est pas prouvé

| Sujet | État |
| --- | --- |
| Invalidation du cache après un run **cron** (prod) | `docs/guidelines-socle.md` dit qu'« `apps/ingestion` l'appelle en fin de run », mais le seul appel à `REVALIDATE_URL` trouvé dans le code est `pingRevalidate()` dans `apps/ingestion/src/main.ts` (le CLI **local**) — `apps/ingestion/src/worker.ts` (le cron réel de prod) n'y fait aucune référence (grep sur le fichier, 2026-09-25). Si confirmé, le tag `facts-daily` ne se rafraîchit en prod qu'à l'expiration de `cacheLife('hours')`, jamais sur événement |
| Déploiement `apps/ingestion` | manuel (`wrangler deploy`, § 5) — aucun fichier du repo ne prouve un pipeline automatisé (type Cloudflare Workers Builds) |
| `SENTRY_DSN` web en prod (Vercel) | non vérifiable depuis le repo (secret du dashboard Vercel) |
| `TG_BOT_TOKEN`/`TG_CHAT_ID` | déclarés dans `.env.example`, aucune référence dans le code (§ 6) |

Dettes fonctionnelles connues (bugs mesurés, assumés, non corrigés) : `docs/dettes-ouvertes.md`. Coût d'infra (incident de prefetch Vercel) : `docs/perf-vercel-prefetch.md`.

## 10. Domaines

Règles métier par domaine, déplacées mot pour mot depuis l'ancien `AGENTS.md` § Règles — à lire avant de toucher la feature concernée. `docs/CARTE.md` y renvoie depuis la ligne de chaque feature concernée.

La face **Formation** (catalogue, entraînement, recrutement, roues, drapeau « en formation ») n'a pas de sous-section ici : dans l'AGENTS.md d'origine, elle vivait dans le même bloc que la puce « 3 faces du CRM » (aucune séparation par ligne vide) — déplacée telle quelle, donc entière, en § 2 « Les 3 faces du CRM ».

### To-do personnelle

- **To-do personnelle** : 2e onglet de `/chatter/planning` (`?vue=todo`), une liste par
  encadrant (`todos`, RLS `can_write_todo_of`, migrations `0067`/`0068`). Chacun gère la
  sienne ; la hiérarchie peut y déposer une tâche (mêmes règles que le planning). Aucun slug
  dédié : le droit vient de « Planning ». **Une seule vue exposée** : liste en sections
  repliables par statut (badge de statut cliquable, priorité en icône, ajout rapide par
  section). Le kanban `dnd-kit` et le champ `release` sont construits mais **en pause**
  (blocs commentés, colonne `release` conservée en base). Claude y écrit en SQL direct
  (`created_by` null → « Claude »).

### Suivi chatters

- **Suivi chatters** (`/chatter/presence/suivi`, `tracker_*` de `0128`) : coaching, 1:1 notés,
  grille de compétences. **AUCUN cloisonnement par modèles** — décision Benoit 2026-09-05 :
  qui porte `presence` voit et note TOUS les chatteurs. Le périmètre repris de GLA se calculait
  sur `profile_creators`, un rattachement manuel et incomplet, et masquait à un encadrant les
  chatteurs de ses PROPRES modèles (cas Juliette : hors money-team, donc zéro rattachement
  automatique). Retiré aux 4 maillons — liste, fiche, écritures, clôture 1:1 — plus les 2 tests
  de la To-Do qui n'existaient que pour eux. Seul garde-fou restant : `assertIsChatter` (on ne
  se note pas soi-même, ni un pair). Les **modèles affichés** restent bornés par la RLS
  `creators_scoped_read` → une ligne hors de ses modèles s'affiche sans pastille, c'est voulu.
  **Police (sanctions) et Relevé de présence restent cloisonnés**, eux.

### To-Do du tracker

- **To-Do du tracker** (≠ la to-do personnelle ci-dessus) : `/chatter/presence/todo`, grille
  hebdo des encadrants reprise de GLA (`tracker_todo_*`, `0127`) — slug `presence`, partagé
  avec Suivi chatters et le Récap. **Aucune policy d'écriture** : tout passe en service-role
  après garde dans les Server Actions. La frontière est **ORGANISER / ATTESTER** (décision Benoit
  2026-09-07 : « les managers ont tous les droits sur leurs sous-managers, ils peuvent gérer leur
  emploi du temps comme ils veulent ») : **organiser** = le contenu du planning (déposer,
  déplacer, supprimer **n'importe quelle** tâche, sections, habitudes, jour de repos) →
  `assertCanOrganize`, ouvert au titulaire, à son encadrement et à l'admin ; **attester** = dire
  que c'est fait et avec quels mots (coche, débrief, bloc-notes, liens, clôture 1:1) →
  `assertOwner`, **le titulaire seul, admin compris** — cocher un « 1:1 » crée une session notée
  dans la fiche du chatteur, on ne la signe pas pour autrui. Côté UI le drapeau est
  `TodoWeek.canOrganize` (`canWrite` = attester) ; ne pas conditionner un geste d'organisation à
  `canWrite`. Prix assumé de l'ouverture : un retrait est **muet** (aucun journal sur
  `tracker_todo_*`). Une **habitude déposée reste verrouillée pour son
  titulaire** (`0148`, `tracker_todo_habits.created_by`) — il la voit avec le badge « déposée » et
  ne peut que sauter une occurrence (« juste aujourd'hui ») ; son encadrement, lui, touche à
  **toutes** les habitudes de la semaine. La règle vit UNE fois, pure et testée, en `lib/tracking/habit-rules.ts`
  (`canEditHabit`), lue par la garde ET par `getTodoWeek` (qui rend un `canEdit` par habitude, pour
  que le panneau n'affiche que des boutons qui marchent) ; `materialize()` recopie `created_by` du
  gabarit sur la tâche qu'il crée. **`category` est du texte libre** (`0127`), et la chaîne vide
  (« sans section », le défaut de `habitInput`) en est une valeur **légitime** : les schémas
  d'ajout et de déplacement doivent l'accepter, sinon le groupe qu'une habitude sans section fait
  apparaître devient un cul-de-sac où tout geste répond « Saisie invalide » (bug du 2026-09-07).
  **La POLICE a une to-do, et c'est un ORGANISATEUR** (décision Benoit 2026-09-08 : « policier
  c'est comme manager, ils peuvent faire pareil sur tous les sous-mana ») : le rôle `police` est
  entré dans `TODO_ROLES`, et son périmètre est **TOUS les sous-managers** — sans rattachement,
  puisqu'il n'en porte aucun (`ATTACHABLE_ROLES.police` est vide depuis 0095 et Benoit a refusé de
  le rouvrir pour 3 comptes). Conséquence : la garde d'écriture n'est plus `requireWriteProfileLive`
  (miroir de `can_write_page()`, qui ignore la police) mais **`requireTodoAccess`** →
  `canWriteTodo` ; ne pas élargir `hasWriteAccess`, dix-huit policies en dépendent. La règle vit
  UNE fois, pure et testée, en **`lib/tracking/todo-roles.ts`** (`TODO_ROLES`, `canWriteTodo`,
  `canOrganizeTodoOf`) et a **trois miroirs à garder alignés** : `canAssignTodoOf`
  (`todo-guards.ts`, la décision + la validation de `?owner=` — sans elle la RLS laisserait ouvrir
  la semaine de n'importe qui), `getTodoHolders` (le sélecteur, filtré EN SQL) et la RPC du Récap
  (`tracker_todo_week_recap`, **0151**). Périmètres : admin → tout le monde, manager → **ses
  sous-managers rattachés** (`manager_ids`), police → **tous les sous-managers**, personne d'autre.
  `can_manage_planning_of` (0102) reste `role = 'manager'` STRICT — l'élargir aurait donné au
  policier le planning journalier et les repos, qui n'ont pas été demandés. Le Récap s'ouvre au
  policier (`NavItem.policeAccess`, distinct de `managerAccess` — Membres, qui porte ce dernier,
  lui reste fermé) ; le **verbatim** des débriefs y reste fermé au policier (admin, soi, et le manager
  sur ses sous-managers rattachés depuis `0159`). Une tâche « 1:1 » ne demande **aucun périmètre
  modèles** (ni titulaire, ni déposant) depuis le 2026-09-05 : les deux tests n'existaient que
  pour éviter des tâches inclôturables, et la clôture ne teste plus rien (cf. Suivi chatters).
  **Récap**
  (`/chatter/presence/recap`, `0137` + `0151` + `0159`) : RPC `tracker_todo_week_recap` en **`security definer`
  à dessein** — c'est le seul moyen de compter les débriefs sans les lire ; compteurs pour
  l'encadrement (chacun son périmètre), **verbatim pour l'admin, son propre journal et — demande
  Benoit 2026-09-14, `0159` — le manager sur ses sous-managers rattachés** (`can_manage_planning_of`,
  jamais le policier). La RPC REND sa décision (`verbatim`) et l'heure (`updatedAt`) : l'app ne
  recopie plus la règle. `tracker_todo_daily` (`0132`) et `tracker_todo_notes` (`0137`) restent fermées :
  journal personnel. Les autres tables `tracker_todo_*` sont lisibles par tout porteur de
  `presence` — assumé (`0127`).

### Rapport du soir police

- **Rapport du soir police** : page `/chatter/rapport-police`, catégorie « Police », **sous**
  le Tracker (`config/workspaces.ts`, slug `police` partagé → un seul droit pour les deux).
  Rapport structuré par (auteur, modèle, jour) — chiffres du soir saisis à la main (CA, non
  traitées, absents, alerte) — dont le **cœur est le suivi par chatteur** : une carte par
  chatteur suivi, avec deux champs « 👍 a marché » / « 🔧 à régler » (`police_reports` +
  `police_report_lines.a_marche`/`a_regler`, migrations `0071`/`0072`). Upsert sur (auteur,
  modèle, jour). **Écriture** : police / manager avec la page / admin (miroir RLS + garde
  `requireReporter`) ; la saisie est masquée aux lecteurs seuls. **Lecture** : qui a la page +
  admins. **RLS non cloisonnée** depuis la migration `0078` (qui annule 0074/0075 et repointe
  `chatter_id` sur `profiles`), mais depuis 2026-08-06 un **périmètre APPLICATIF par rôle**
  (`lib/services/creator-scope.ts`, règle partagée avec le Tracker) borne manager /
  sous-manager / policier **avec modèles assignés** à leurs modèles (`profile_creators`) —
  sélecteur du formulaire, chatteurs groupés (`getChattersByModel`) et historique compris ;
  admin, lecteurs et encadrant sans assignation voient tout. Consultation = historique
  filtrable par modèle / par chatteur (suppression de son propre rapport uniquement).

### Relevé MyPuls (Présence)

- **Relevé MyPuls (Présence)** : la mesure de présence de l'app vient du scrape MyPuls
  « Contrôle des shifts », **pas** de l'agent Electron (`tracker_events` est vide en prod depuis
  l'origine). Tables `mypuls_shift_*` (`0138`), lectures par RPC `security invoker` rendant du
  `jsonb` (`0140`, `0142`, `0143` — jamais de `select` nu : un jour fait ~2 600 segments).
  **La clé d'identité est `chatters.id`** (`chatter_id`, migration `0144`) et NON `profiles.id` :
  le compte membre est l'exception (486 lignes `chatters` pour 110 profils rattachés en prod), et
  y clouer le relevé laissait 29 % du travail mesuré compté pour personne. `profile_id` reste à
  côté, pour ce qui exige un compte — créneau attendu, fiche d'activité, signalement. Le
  périmètre modèles se lit donc par les DEUX tables d'assignation (`allowedChatterIds` sur
  `chatter_creators` + `allowedProfileIds` sur `profile_creators`, `lib/services/creator-scope.ts`).
  **`chatter_creators` est FIGÉE depuis son import du 2026-07-01** (rien ne l'écrit : ni l'ingestion,
  ni Organisation) — les modèles créées depuis (Juliette, Elsa, Romy, comptes privés) y ont 0 ligne.
  C'est **Organisation** (`profile_creators`) qui fait foi : depuis le 2026-09-25, `allowedChatterIds`
  y ajoute les chatteurs MyPuls des comptes placés par Orga (`profiles.chatter_id`), ce qui rend le
  placement effectif sur tout l'historique du relevé. Condition : le compte doit être RELIÉ à son
  chatteur MyPuls (Compta › « Relier », admin) — sans ce lien, un chatteur placé dans Orga reste
  invisible au relevé de son manager (cas Juliette : 12 comptes non reliés, 9 reliés le 2026-09-25).
  Ingestion : 3 sous-requêtes par jour dans `apps/ingestion/src/shifts-core.ts`, cron
  **04h30 UTC** (l'heure n'est PAS négociable — le créneau du soir court jusqu'à 05h00 Paris et
  MyPuls plafonne sa couverture tant qu'il n'est pas fini) ; rattrapage manuel
  `pnpm --filter @glagency/ingestion shifts <du> <au>` (le CLI **plafonne à J-1**, arguments
  compris : ingérer le jour en cours écrit une couverture plafonnée à ~65 % et la marque `ok`).
  **UN écran dans la sidebar** — Relevé d'équipe (`/chatter/presence`) ; deux hors sidebar, la
  Fiche d'activité (`[profileId]`, lecture MyPuls **à la demande**, atteinte nominativement) et
  les Réglages (`/reglages` — maintenance : journal des runs, seuils, gens à rattacher ;
  atteints par le lien « Réglages » en haut à droite du Relevé). Les tuiles du Relevé sont **dérivées
  des lignes affichées** et non de `mypuls_day_kpi` (grain jour + agence) : sinon elles
  ignorent le créneau choisi ET le périmètre modèles. **Trois invariants** : (1) le verdict de
  couverture est celui de MyPuls, parsé, jamais recalculé (un recalcul dérive jusqu'à 20,7 pts) ;
  (2) un jour sans run `ok` affiche « relevé indisponible », **jamais des zéros** — sinon « le
  scrape a échoué » et « personne n'a travaillé » deviennent indiscernables, et ça produit des
  sanctions injustes ; (3) `mypuls_shift_settings.idle_minutes` décide du temps mesuré (3 → 10 min
  ajoute ~115 min médianes par chatteur et par jour) — écriture admin, valeurs recopiées sur
  chaque run. Périmètre modèles **applicatif** (`allowedProfileIds`, source unique dans
  `lib/services/creator-scope.ts`) ; le lien sanction passe par l'URL vers le dialog Police
  existant (`?chatteur&jour&creneau&motif`), jamais par un formulaire dupliqué. Spec :
  `docs/superpowers/specs/2026-09-01-releve-mypuls-design.md`.

### Équipes et quotas

- **Équipes et quotas : 100 % automatiques** (`0173`, demande Benoit 2026-09-24 : « à chaque
  création de modèle, tout auto »). Les quotas des Insights sont portés par l'ÉQUIPE
  (`creators.team_id` → `quotas`) ; une modèle sans équipe rendait ses chatteurs **sans carte**
  (bug Juliette : 11 chatteurs avec du CA, 1 seule carte). Désormais un **trigger**
  (`creators_assign_team`) donne à toute modèle insérée sans équipe celle de son **nom de base**
  (« Carla (privé) » → « Carla », `creator_base_name`), créée au besoin (`team_for_creator_name`) ;
  une équipe **créée** ainsi naît avec les **quotas de base** — 7 h · 300 s · 10 médias · 25 % ·
  80 €/j, la ligne commune à 6 équipes sur 13 et le plancher des autres — écrits en UN seul
  endroit, `team_default_quotas()` (les changer = nouvelle migration). Une équipe existante n'en
  reçoit **jamais** d'office : vider ses quotas dans Chatteurs › Quotas reste respecté. Ce cas
  garde une carte **« Sans quotas »** (gravité `unset`, `quotas-hebdo.ts`) : vrais chiffres, aucun
  verdict, hors du compteur d'alertes de la sidebar — jamais plus de chatteur sauté en silence.
  Ne répare PAS les chatteurs invisibles du Relevé d'équipe (scrape money-team, autre chaîne).
  **Présence des Insights = relevé MyPuls** (`0174`, bug du 2026-09-24 : « 0h » sur les 144 cartes) :
  `chatter_daily.presence_active_h` est VIDE depuis le 2026-09-03 (0149) et l'ingestion la lisait
  comme 0 → quota de présence manqué pour tout le monde. Cartes ET Classement lisent désormais
  `mypuls_presence_by_chatter` (somme des segments = le chiffre du Relevé d'équipe). Semaine dont
  un jour de stats n'a pas de run `ok` → aucun verdict de présence ; chatteur absent du relevé →
  « — », jamais 0. **`idle_minutes` passé de 3 à 10 min le 2026-09-24** (décision Benoit : attendre
  la réponse d'un fan, c'est travailler ; quota de 42 h/sem gardé), relevé rejoué du 14 au 23/09.
  Semaine du 14/09 : médiane 29,8 h → 38,8 h, présence atteinte 30 → 58 cartes sur 144. Le même
  réglage gouverne la couverture des créneaux (Police) — le changer change les sanctions.

### Codes Snap

- **Codes Snap** (`/chatter/codes-snap`, table `snap_codes`, mot de passe chiffré AES) : lecture pour
  tout porteur de la page (RLS `snap_codes_read`, 0063 — un encadrant ne voit que SES modèles via
  `creators_scoped_read`) ; **écriture admin sur tout, manager / sous-manager sur SES modèles assignés**
  (hotfix 2026-09-03, règle pure `features/snap-codes/access.ts`, garde `requireWriteProfileLive` +
  `getCreatorScope` en tête de `saveSnapCode`, écriture service-role — la RLS `snap_codes_admin_all`
  de 0047 reste admin-only et son commentaire SQL est périmé).

### Uncove

- **Uncove** (`/chatter/uncove`, `uncove_*` de `0163`/`0164`) : 2ᵉ plateforme de CA, **que MyPuls
  ne relève PAS**. Relevé quotidien Subs + CA par compte (cron 05h00 UTC, fenêtre 35 j) via l'API
  REST Uncove rejouée avec un `user_token` collé à la main (le login est sous Turnstile, non
  rejouable côté serveur) et chiffré en table admin-only ; rattrapage
  `pnpm --filter @glagency/ingestion uncove <jours>` — l'API rend ~400 jours en UNE requête, sans
  pagination. **Le CA entre dans l'Overview, pour l'ADMIN seul** (`0164`, demande Benoit
  2026-09-22) : 3 cartes `CA total` / `CA MyPuls` / `CA Uncove`, alimentées par le nouveau
  `totals {mypuls, uncove}` de `overview_report` — `uncove = null` veut dire « rien à montrer »
  (non-admin, aucun compte comptabilisé) et `0` veut dire « relevé, mais sans CA » : c'est cette
  distinction qui décide de l'affichage des deux cartes de détail. Deux réglages par compte dans
  Uncove › Modèles : **`creator_id`** (rattachement **MANUEL** — jamais par nom, « Carla » existe
  en 3 exemplaires côté `creators` ; **null est légitime**, le CA compte alors au global sans
  ligne au classement par modèle) et **`counts_in_ca`** (« CA hors MyPuls », l'interrupteur
  anti-double-comptage pour le jour où MyPuls relèvera Uncove). **Le CA Uncove est borné au
  premier jour de `creator_daily`** (`0165`, borne dynamique) : Uncove remonte au 18/08/2025 et
  MyPuls seulement au 01/06/2026 — sans elle, toute période antérieure à juin affichait un « CA
  total » composé à 100 % d'Uncove (94 563 € sur 9 mois), qui se lit comme le CA de l'agence
  alors qu'il ne décrit qu'une plateforme. La Compta et les commissions restent **100 % MyPuls** :
  ce CA n'est le travail d'aucun chatteur. Le rattachement d'un compte à une modèle ne sert donc
  **qu'aux chiffres de l'agence, jamais à un chatteur** (décision Benoit 2026-09-22) : l'API rend un
  total par jour et par compte, jamais par opérateur — tout CA imputé à un chatteur serait inventé.

### Groupes de liens marketing

- **Groupes de liens marketing** (`/marketing/liens`, `mkt_link_groups` de `0167`/`0168`) : les
  sources de trafic d'un lien sont des **LIGNES**, plus une union TypeScript — `mkt_links.type` est
  une clé étrangère vers `mkt_link_groups.key`, ajouter une source ne demande ni migration ni
  déploiement. Chaque groupe se reconnaît par **trois listes de mots** (`contains`, `starts_with`,
  `words` — jamais d'expression régulière exposée : `0167` en montrait, personne ne pouvait les
  relire) comparées sans majuscules, accents ni séparateurs ; `starts_with` et `words` existent
  parce que « contient » se trompe (« ara » attraperait Sarah, « ig » attraperait « hotgirl »).
  `priority` croissante départage (`SNAP_TIKTOK` → Snapchat). La règle vit UNE fois, pure et
  testée, en `@glagency/core` (`marketing/link-group.ts` : `detectLinkGroup`, `matchesLinkGroup`,
  `suggestLinkGroups`). Un lien **déplacé à la main** est épinglé
  (`mkt_links.type_manual`, `0169` — posé par `setLinkType`) et **ne bouge plus jamais** ; tous les
  autres suivent les règles, **rejouées sur eux à chaque création/modification de groupe**
  (`reappliquerRegles`). Avant `0169` seule la file « À classer » était relue, ce qui interdisait de
  DÉCOUPER un groupe (bug du 2026-09-23 : « SNAP + DA » restait vide, les SNAP_HAPPN étant dans
  Snapchat). Un groupe créé à la main part en **priorité 5**, devant les groupes d'origine (10-90) :
  c'est presque toujours un affinage. Deux groupes actifs ne peuvent pas porter le même nom.
  L'ingestion range les liens **neufs** et crée un groupe dès qu'un préfixe revient 3 fois dans
  « À classer » (`is_fallback`, non supprimable) — `auto`. « Autres » ne peut PAS disparaître : 306 des 361
  liens n'ont aucune url, les autres pointent vers mym.fans — le nom tapé dans MyPuls est la seule
  source, et un pseudo n'en dit rien. Suppression **douce** (`deleted_at`) : sans elle l'auto-création
  ressusciterait un groupe écarté. Réglage admin sur `/marketing/liens/groupes` (bouton en haut à
  droite des Liens), déplacement lien par lien depuis le badge de la ligne. Couleurs **fermées** à
  8 teintes validées ensemble (`lib/mkt-groups.ts`) ; l'anneau ne montre que les 4 premières
  sources. Spec : `docs/superpowers/specs/2026-09-22-mkt-groupes-liens-design.md`. **Notes par source**
  (`mkt_source_notes`, `0170`) : une note libre par (modèle × groupe), écrite depuis Marketing ›
  Modèles › Sources de trafic (crayon, admin), **en clair** — si l'équipe y met des identifiants,
  chiffrer comme les Codes Snap. Consultées en LECTURE côté Chatteurs sur **Équipe › Sources de
  trafic** (`/chatter/sources-trafic`, droit `sources-trafic`, `0171`) — et non dans Équipe ›
  Modèles, comparatif de CA ouvert à 2 chatteurs sur 403. Cloisonnement EN BASE par `creators`
  (un chatteur ne lit que ses modèles, comme Infos modèles) : vérifié sous l'identité d'un
  chatteur — 0 note sans le droit, la seule de sa modèle avec, aucune écriture possible. La page
  liste TOUTES les modèles visibles et TOUTES leurs sources (réseaux où elles ont des liens), note
  ou pas, une modèle par accordéon replié (`CollapsibleSection`, comme Infos modèles) ; une note s'ouvre en FENÊTRE (bouton œil encadré) — jamais en ligne, elle peut faire 20 000
  caractères. Les réseaux d'une modèle viennent de `mkt_model_sources()` (`0172`, `security
  definer`) : `mkt_links` reste fermée aux chatteurs, la fonction ne rend que des couples (modèle,
  groupe), cloisonnés par une règle MIROIR de `creators_scoped_read` — à faire suivre si elle change.
