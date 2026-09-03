# glagencyapp — instructions projet

Dashboard de performance (chatters / créatrices / CA) — rebuild propre de l'ancien
« Chatters Performance Dashboard ». **MyPuls reste la source** ; on reconstruit la
couche analytics.

## Architecture web — skill `archi-web`

Ce projet suit **`.claude/skills/archi-web/SKILL.md`** (adapté Supabase). Invoque-le
dès que tu touches à `apps/web/`.

**Mode : 🅑 Standalone (Supabase)** — pas d'API externe ; Server Components query
supabase-js direct (RLS), **mutations en Server Actions** (`features/<f>/actions.ts`),
Route Handlers réservés aux cas spéciaux (IA, webhooks).

## Stack

- **Monorepo** : pnpm workspaces (pas de Turborepo). `apps/*` + `packages/*`.
- **Front** : Next.js 16 (App Router, RSC) + Tailwind v4 + shadcn/ui.
- **Données/Auth** : Supabase (Postgres + Auth **OTP email** + **RLS**), `@supabase/ssr`.
- **Domaine** : `@glagency/core` (pur, testé Vitest) — métriques + moteur d'insights (règles).
- **Ingestion** : `@glagency/mypuls` (adaptateur) + `apps/ingestion` (worker cron) → Supabase.

## Packages

| Package | Rôle |
|---|---|
| `@glagency/web` (`apps/web`) | dashboard Next.js |
| `@glagency/ingestion` (`apps/ingestion`) | worker cron MyPuls → Supabase |
| `@glagency/core` (`packages/core`) | domaine pur : métriques + insights + types |
| `@glagency/mypuls` (`packages/mypuls`) | scrape MyPuls (session `money-team` + `dashboard/stats`) = **source des chiffres** |
| `@glagency/db` (`packages/db`) | Supabase : migrations, RLS, types générés, client admin |

## Règles

- **Convention `app → feature(template) → composants`** : `app/**/page.tsx` récupère la
  donnée (via `features/<f>/services/`), passe en props à `<Feature>Template.tsx` qui
  appelle les composants. **Aucun fetch dans une feature.**
- **Frontière = tables Supabase.** `packages/core` ne dépend de rien (pur). Personne n'importe `web`.
- **Secrets en env uniquement** (cf. `.env.example`) — jamais en clair dans le code.
- **RLS = enforcement réel** du cloisonnement par modèle ; l'UI n'est qu'optimiste.
- **Data-loading & templates** : suivre `docs/guidelines-data-loading.md` — agrégation des
  tables de faits en RPC SQL `SECURITY INVOKER` (sinon `fetchAll` obligatoire, jamais de
  `select` nu → troncature à 1000 lignes), `Template` = Server Component + feuille client,
  `use cache` uniquement sur du global (jamais RLS cookie-bound), `proxy.ts` dans `src/`
  + `docs/guidelines-standard-feature.md` (squelette de feature, loading/erreurs/mutations/
  forms — checklist nouvelle feature) + `docs/guidelines-socle.md` (briques transverses du
  batch 0 : Sentry serveur, cache/`api/revalidate`, headers, `env`, config Next).
- **3 faces du CRM = préfixe d'URL** : `Chatteurs` (`/chatter/*`), `Marketing`
  (`/marketing/*`) et `Formation` (`/formation/*` — reprise de Good Luck Agency ; TOUTE la face tient dans la
  migration consolidée **`0113_formation.sql`** (fusion 2026-08-21 des ex-0113→0127 ; au 2026-09-02,
  prod à **0137 + 0141** (Release 2.21, hotfix formation) et UAT à **0140 + 0141** — `0138`/`0139`/
  `0140` (relevé MyPuls, CA Overview) ne sont PAS encore en prod : le jour où elles y vont,
  `db push` refusera des versions antérieures à 0141 déjà enregistrée → passer **`--include-all`** ;
  prochaine migration = **0142**) : **catalogue**
  `training_*` (schéma + index + seed généré par
  `packages/db/scripts/gen-training-seed.mjs` depuis `formation.json`), Catalogue admin
  `features/training-catalog`, Modules en lecture `features/training-modules` (projection
  publique — jamais `fan_brief`/`expected` côté chatter — projection APPLICATIVE seulement :
  la RLS du catalogue est par ligne, secrets durcis en tables admin-only `training_case_secrets` /
  `training_module_secrets` / `training_boss_fan_secrets`). **Entraînement** :
  sessions/threads/messages/scores/signalements/`training_ai_calls`, stats/classement — moteur IA en `lib/ai/` uniquement (fan Haiku 4.5, notation Sonnet 5, tracé
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
  service-role après garde admin (comme le reste de la formation). Droits
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
- **To-do personnelle** : 2e onglet de `/chatter/planning` (`?vue=todo`), une liste par
  encadrant (`todos`, RLS `can_write_todo_of`, migrations `0067`/`0068`). Chacun gère la
  sienne ; la hiérarchie peut y déposer une tâche (mêmes règles que le planning). Aucun slug
  dédié : le droit vient de « Planning ». **Une seule vue exposée** : liste en sections
  repliables par statut (badge de statut cliquable, priorité en icône, ajout rapide par
  section). Le kanban `dnd-kit` et le champ `release` sont construits mais **en pause**
  (blocs commentés, colonne `release` conservée en base). Claude y écrit en SQL direct
  (`created_by` null → « Claude »).
- **To-Do du tracker** (≠ la to-do personnelle ci-dessus) : `/chatter/presence/todo`, grille
  hebdo des encadrants reprise de GLA (`tracker_todo_*`, `0127`) — slug `presence`, partagé
  avec Suivi chatters et le Récap. **Aucune policy d'écriture** : tout passe en service-role
  après garde dans les Server Actions. Le travail reste celui de son titulaire (`assertOwner` :
  ni coche, ni déplacement, ni débrief par autrui, admin compris) ; **deux dérogations
  seulement** — déposer une tâche (`assertCanAssign`) et retirer **ce qu'on a déposé**
  (`assertCanUnassign`, `created_by = moi` pour un non-admin). Périmètre de la dérogation =
  `canAssignTodoOf` (`lib/tracking/todo-guards.ts`), **source unique** lue aussi par la page
  (validation de `?owner=` — sans elle, la RLS laisserait ouvrir la semaine de n'importe qui)
  et par `getTodoHolders` : admin → tous les encadrants, manager → **ses sous-managers
  rattachés** (`manager_ids`), personne d'autre. Une tâche « 1:1 » exige le périmètre modèles
  du **titulaire** (sinon elle est inclôturable) *et* du déposant. **Récap**
  (`/chatter/presence/recap`, `0137`) : RPC `tracker_todo_week_recap` en **`security definer`
  à dessein** — c'est le seul moyen de compter les débriefs sans les lire ; compteurs pour
  l'encadrement (chacun son périmètre), **verbatim pour l'admin et son propre journal
  seulement**. `tracker_todo_daily` (`0132`) et `tracker_todo_notes` (`0137`) restent fermées :
  journal personnel. Les autres tables `tracker_todo_*` sont lisibles par tout porteur de
  `presence` — assumé (`0127`).
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

- **Codes Snap** (`/chatter/codes-snap`, table `snap_codes`, mot de passe chiffré AES) : lecture pour
  tout porteur de la page (RLS `snap_codes_read`, 0063 — un encadrant ne voit que SES modèles via
  `creators_scoped_read`) ; **écriture admin sur tout, manager / sous-manager sur SES modèles assignés**
  (hotfix 2026-09-03, règle pure `features/snap-codes/access.ts`, garde `requireWriteProfileLive` +
  `getCreatorScope` en tête de `saveSnapCode`, écriture service-role — la RLS `snap_codes_admin_all`
  de 0047 reste admin-only et son commentaire SQL est périmé).

## Données MyPuls — workflow d'ajout

Benoit donne les URLs MyPuls **dans le chat** (pas de fichier d'inventaire). Pour chaque page :

1. `pnpm --filter @glagency/ingestion capture <url>` → sauvegarde le brut authentifié
   (login auto via `MYPULS_EMAIL`/`MYPULS_PASSWORD`) dans `apps/ingestion/raw/pages/`.
2. Inspecter le fichier capturé, écrire le parser dans `packages/mypuls/src/endpoints/`.
3. Brancher dans `apps/ingestion` (pipeline → Supabase), puis dans la feature web.

## Migrations (Supabase)

Migrations dans `packages/db/supabase/migrations/NNNN_slug.sql` — **séquence contiguë
`0001..NNNN` alignée sur `schema_migrations` en prod** (nettoyée au commit `36ae438`).
**Ne pas re-renuméroter** l'existant. Pas de `config.toml` (juste le dossier `migrations/`).

Ajouter une migration :
1. Créer `NNNN_slug.sql` (numéro suivant). Convention : `text` + `check`, **jamais
   `create type ... enum`**.
2. Appliquer **et** enregistrer en une étape :
   `cd packages/db && supabase db push --db-url "$DATABASE_URL"` (ajouter `--dry-run` pour
   prévisualiser — doit dire « Remote database is up to date » quand tout est à jour). Le
   `supabase link` est **cassé** sur ce projet → toujours `--db-url`, jamais `link`.
3. Régénérer `packages/db/src/types.ts` si le schéma change.

**Piège à l'origine du nettoyage `36ae438`** : appliquer une migration à la main
(`psql "$DATABASE_URL" -f …`) SANS l'enregistrer dans `schema_migrations` désaligne
l'historique et casse `db push`. Préférer `db push` (applique ET enregistre). Extraire l'URL
en brut (`grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/^"//; s/"$//'`), jamais
`source .env` (corrompt la variable) ; connexion directe port 5432, pas le pooler 6543.

## Design

Spec : `docs/superpowers/specs/2026-06-30-glagency-dashboard-design.md`.
