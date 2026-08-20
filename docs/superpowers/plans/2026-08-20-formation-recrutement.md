# Formation — incrément 4 : Test de recrutement public — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porter le test de recrutement public de GLA : `/postuler` (QI → frappe → connexion → conversation fan IA → identité à la fin), verdict GLA (gates + global 70), dossiers dans le CRM (page Recrutement admin : valider/refuser/bloquer), config admin (banque QI, seuils, ouvert/fermé), groupe sidebar « Configuration », rattachement membre par e-mail.

**Architecture:** Branche `feature/formation-catalogue`. Migration **0126** (⚠️ vérifier le prochain numéro au démarrage : 0125 peut avoir été pris — la séquence réelle fait foi) : `recruit_config`, `recruit_attempts`, `recruit_messages`, `recruit_candidates`, `recruit_blocklist`, RPC `recruit_pending_count()`. **Conversation et corrections côté serveur** (tentative anonyme + messages en base, QI corrigé serveur, verdict serveur). Route publique `/postuler` (proxy : ajoutée aux routes publiques), feature `recruit-test` (client à états + Server Actions publiques service-role), feature `recruit-admin` (liste/dossier/config), prompts GLA transposés dans `lib/ai/recruit-prompts.ts` (bot Haiku 150 tokens, notation Sonnet structurée), règles pures `computeVerdict`/`gradeQi` dans `@glagency/core`.

**Tech Stack:** Next.js 16 (App Router, Server Actions publiques, `typedRoutes`, React Compiler → `'use no memo'` sur RHF), Supabase (service-role via `createAdminClient` ; RLS admin-only en lecture, aucune écriture anon/authenticated), Zod v4, RHF, shadcn/ui, `@anthropic-ai/sdk` via `lib/ai/client.ts`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-20-formation-recrutement-design.md`
**Textes GLA à transposer (source de vérité)** : le fichier d'extraction posé par le contrôleur dans le workspace SDD (`gla-recruit-extract.txt` : `PERSONAS`, `bot_system`, `SCORE_SYSTEM`, `CAND_SCORE_SCHEMA`, `to_messages`, `DEFAULT_CONFIG`, `QI_BANK`, textes frappe/connexion, `finishCandidate` avec raisons qualitatives). Transposition FIDÈLE (accents restaurés, sens inchangé), comme les prompts d'entraînement.

## Global Constraints

- Migration `packages/db/supabase/migrations/<NNNN>_recruit_test.sql` (numéro = suivant réel de la séquence). `text + check` (jamais d'enum), RLS `(select …)`, FK indexées sauf en tête d'unique/pk, colonnes de filtre indexées. Apply : `cd packages/db && supabase db push --db-url "$DB"` (dry-run avant/après), **UAT uniquement** (`DATABASE_URL_UAT`, extraction `grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//'`, jamais `source .env`, jamais `link`, jamais `psql -f`, jamais afficher l'URL). Régénérer `packages/db/src/types.ts` après.
- **Public = zéro accès direct à la base** : RLS lecture `is_admin()` sur toutes les tables `recruit_*`, aucune policy d'écriture anon/authenticated ; toutes les écritures via `createAdminClient()` dans les Server Actions, chacune revalidant (tentative existante, statut attendu, bornes, blocklist, rate-limit). La banque QI (bonnes réponses) et les seuils ne descendent jamais au client public.
- Actions publiques : PAS de `requirePageProfile` (pas de session) — gardes = validation Zod + état de la tentative + blocklist + rate-limit (5 tentatives/IP/24 h) + test ouvert. Messages FR (`BusinessError`).
- IA : bot **Haiku** (`FAN_MODEL` de `lib/ai/client.ts`, `max_tokens: 150`, sans thinking/temperature, historique GLA `to_messages` : candidat = user, client = assistant, tours consécutifs fusionnés, 1er tour user) ; notation **Sonnet** (`SCORE_MODEL`, `output_config json_schema` + Zod qui CLAMPE 0-25, `thinking adaptive`, `max_tokens 1500`, timeout 60 s par requête, garde `refusal`/`max_tokens`) ; total = somme recalculée serveur ; compteurs tokens sur `recruit_attempts`.
- Règles métier GLA : défauts config `{ open: true, bot_messages: 14, qi_timer: 30, frappe_min: 30, connexion_min: 10, qi_min: 3, global_threshold: 70, discord_link: '' }` ; verdict : `passed = wpm ≥ frappe_min ET mbps ≥ connexion_min ET qi ≥ qi_min ET global ≥ global_threshold` avec `global = round(qi/5×30 + botTotal/100×70)` ; raison qualitative de refus (épreuve fautive, textes GLA de `finishCandidate`) ; un seul essai (blocklist device+e-mail+Discord à la soumission) ; média verrouillé `[MEDIA VERROUILLE - X€]`.
- Web : guidelines standard (page = garde + kickoff + Suspense côté CRM ; la page publique a son propre layout minimal SANS la sidebar) ; RHF + Zod + `'use no memo'` ; fichiers < 300 lignes ; pas de cross-feature (partagé = `lib/`) ; copie FR ; DA sobre (la page publique reprend les tokens du thème, pas de fantaisie).
- Proxy (`apps/web/src/proxy.ts`) : `/postuler` rejoint les routes publiques (`isPublic`).
- Vérifs avant chaque commit : `pnpm --filter @glagency/web lint && typecheck && test`, `pnpm --filter @glagency/core test`, `pnpm --filter @glagency/db typecheck`. Commits autorisés (1/task), pas de push/merge. ⚠️ Une session Claude parallèle peut avoir des fichiers sales : `git status` d'abord, staging PAR CHEMIN uniquement, ne jamais toucher un fichier sale étranger.

**Écarts tranchés dans ce plan :**
1. Conversation/QI/verdict côté serveur (GLA faisait tout client) — anti-triche + coût maîtrisé.
2. Identité à la fin (GLA : au début) ; la tentative technique (device/IP/tokens) existe dès l'entrée pour le rate-limit.
3. `frappe`/`connexion` restent déclaratifs client (gates cachés — fidèle à GLA, assumé).
4. Pas de mot de passe admin GLA : les droits du CRM (`requireAdminProfile`) gardent la page Recrutement et la config.
5. `notifyRecruitBadge` : badge sidebar = RPC `recruit_pending_count()` streamée comme la roue/insights.

---

## Carte des fichiers

```
packages/db/supabase/migrations/<NNNN>_recruit_test.sql                        (T1)
packages/db/src/types.ts                                                        (T1 régénéré)
packages/core/src/recruit/rules.ts (+ rules.test.ts), src/index.ts              (T2)  gradeQi, computeVerdict, défauts GLA
apps/web/src/lib/ai/recruit-prompts.ts (+ .test.ts), recruit-score.ts           (T3)  bot_system/SCORE_SYSTEM GLA, schéma structuré
apps/web/src/features/recruit-test/{types,schema,schema.test}.ts, actions.ts, actions-bot.ts, mappers?                    (T4)
apps/web/src/features/recruit-test/TestFlow.tsx, components/{step-*.tsx…}, app/postuler/{layout,page}.tsx, proxy.ts       (T5)
apps/web/src/features/recruit-admin/{types,schema,actions}.ts, services/{get-candidates,get-config}.ts, templates + components, app/(dash)/formation/recrutement/{page,loading}.tsx + config/{page,loading}.tsx   (T6)
apps/web/src/config/workspaces.ts (item Recrutement + groupe Configuration), app-sidebar badge, lib/services/recruit-pending.ts, layout   (T7)
apps/web/src/features/members (rattachement à la création)                      (T7)
CLAUDE.md, spec (statut)                                                        (T8)
```

---

### Task 1: Migration `recruit_test` (tables + RLS admin + RPC badge)

**Files:** Create `packages/db/supabase/migrations/<NNNN>_recruit_test.sql` (numéro suivant réel), regenerate `packages/db/src/types.ts`.

**Interfaces — Produces:** tables `recruit_config` (1 ligne seedée défauts GLA + `typing_text` GLA + `qi_bank` GLA), `recruit_attempts`, `recruit_messages`, `recruit_candidates`, `recruit_blocklist` ; RPC `recruit_pending_count() → integer` (definer, `is_admin()` sinon 0).

- [ ] **Step 1: Écrire la migration** — colonnes de la spec §3, avec : checks `status in (…)`, `speaker in ('candidat','client')`, scores `between 0 and 25`, `global between 0 and 100` ; `recruit_attempts` index `(ip, created_at desc)` (rate-limit) + `(created_at desc)` ; `recruit_messages` unique (attempt_id, position) ; `recruit_candidates` : `attempt_id unique`, index `email`, index partiel `(created_at desc) where status = 'nouveau'`, index `profile_id` ; `recruit_blocklist` index `device`, `email`, `ip` ; RLS : enable partout, une policy `for select to authenticated using ((select public.is_admin()))` par table, `recruit_config` + `for all` admin ; AUCUNE policy anon. Seed `recruit_config` : défauts GLA (extract), `qi_bank` = QI_BANK GLA converti `[{ slot, variants: [{ q, opts: [4], a }] }]`, `typing_text` = texte GLA. RPC : `select case when (select public.is_admin()) then (select count(*)::integer from recruit_candidates where status = 'nouveau') else 0 end;` + revoke/grant.
- [ ] **Step 2: Dry-run (seul <NNNN> pending) → push UAT → dry-run (up to date)** ; contrôles : `select open, bot_messages, jsonb_array_length(qi_bank) from recruit_config;` (true | 14 | 5), 6 policies (`recruit_%`), RPC présente.
- [ ] **Step 3: Régénérer types.ts** ; `pnpm --filter @glagency/db typecheck && pnpm --filter @glagency/web typecheck`.
- [ ] **Step 4: Commit** — `feat(db): <NNNN> test de recrutement — config, tentatives, messages, dossiers, blocklist (RLS admin)`

### Task 2: `@glagency/core/recruit` — règles pures

**Files:** Create `packages/core/src/recruit/rules.ts` + `rules.test.ts` ; modify `src/index.ts`.

**Interfaces — Produces:** `RECRUIT_DEFAULTS` (GLA), `QiSlot`/`QiVariant` types, `pickQiQuestions(bank, rand)` (1 variante par slot, sans la bonne réponse : `{ slot, q, opts }[]` + la clé de correction séparée), `gradeQi(picked, answers): number` (0-5), `computeVerdict(input: { qi, wpm, mbps, botTotal, config }): { global, passed, refusalStep, refusalReason }` — textes de refus GLA (`finishCandidate`) verbatim ; TDD (gates, arrondis, raison = épreuve la plus faible du bot quand tout le reste passe).

- [ ] **Step 1-3: TDD → implémentation → vérif** (`core test`, typecheck core + web).
- [ ] **Step 4: Commit** — `feat(core): règles du test de recrutement — tirage/correction QI, verdict GLA (gates, global 70, raisons)`

### Task 3: `lib/ai/recruit-prompts.ts` + `recruit-score.ts`

**Files:** Create `apps/web/src/lib/ai/recruit-prompts.ts` (+ `.test.ts` — pur), `apps/web/src/lib/ai/recruit-score.ts` (`server-only`).

**Interfaces — Produces:** `RECRUIT_PERSONAS` (3, textes GLA accents restaurés), `recruitBotSystem(persona)` (bot_system GLA complet), `recruitToMessages(history)` (to_messages GLA), `RECRUIT_SCORE_SYSTEM` (SCORE_SYSTEM GLA), `recruitScoreSchema`/`recruitScoreZod` (4 axes, clamp 0-25 côté Zod comme l'entraînement) ; `replyAsRecruitBot({ persona, history })` (Haiku 150, garde refusal → '...', log compteurs rendus à l'appelant), `scoreRecruitTranscript(history)` (Sonnet structuré, timeout 60 s, total = somme serveur). Tests : personas nommés, système contient les 3 épreuves cachées + règles médias, to_messages fusion/1er tour user, clamps.

- [ ] **Step 1-3: TDD (prompts/schema) → implémentation → vérif.**
- [ ] **Step 4: Commit** — `feat(web): IA du test de recrutement — personas et notation GLA transposés (Haiku/Sonnet)`

### Task 4: Feature `recruit-test` — schémas + Server Actions publiques

**Files:** Create `apps/web/src/features/recruit-test/{types.ts, schema.ts, schema.test.ts, actions.ts, actions-bot.ts}`.

**Interfaces — Produces (actions, toutes PUBLIQUES service-role, `BusinessError` FR) :**
- `startAttempt({ device }) → { attemptId, persona, qi: { slot, q, opts }[], typingText, qiTimer, botMessages }` — test ouvert ? blocklist device/IP ? rate-limit IP (5/24 h — lecture `recruit_attempts`) ; crée la tentative (persona = rotation : `count % 3` sur les tentatives du jour ou aléatoire), tire les questions (`pickQiQuestions`) et stocke la CLÉ de correction dans `recruit_attempts.qi_answers` (clé serveur, jamais renvoyée). IP via headers (`x-forwarded-for` → helper).
- `saveQi({ attemptId, answers: (number|null)[] }) → { qiScore }` — corrige serveur (`gradeQi` contre la clé stockée), statut/étape vérifiés, écrit `qi_score`.
- `saveTyping({ attemptId, wpm, accuracy, seconds })`, `saveConnection({ attemptId, mbps })` — bornes Zod (wpm 0-250, mbps 0-10000), écrit.
- `sendToBot({ attemptId, body?, mediaPrice? }) → { reply, done }` (`actions-bot.ts`) — tentative `en_cours`, `bot_replies < bot_messages` ; insère message candidat (`[MEDIA VERROUILLE - X€]` si mediaPrice), historise serveur, `replyAsRecruitBot`, insère la réponse, incrémente compteurs/tokens ; `done` quand la limite est atteinte.
- `scoreAttempt({ attemptId }) → { total }` — toutes les épreuves renseignées, ≥ 1 échange ; idempotent (déjà noté → renvoie) ; `scoreRecruitTranscript` → 4 axes + total, statut `notee`.
- `submitCandidate({ attemptId, firstName, lastName, email, discord? }) → { passed, refusalReason?, discordLink? }` — statut `notee` ; blocklist e-mail/Discord → refus ; `computeVerdict` ; dossier créé (`repeat` si e-mail déjà en dossier) ; blocklist device+e-mail+Discord insérée (`oneAttempt`, reason 'test passé') ; tentative `soumise`.
Schemas Zod (identité : prénom/nom 1-60, e-mail `z.email()`, discord ≤ 60 optionnel ; réponses QI longueur 5) + tests.

- [ ] **Step 1-3: TDD schémas → implémentation → vérif** (`web test`, typecheck, lint).
- [ ] **Step 4: Commit** — `feat(formation): recrutement — actions publiques du test (tentative, QI serveur, bot, notation, soumission)`

### Task 5: UI publique `/postuler` + proxy

**Files:** Create `apps/web/src/app/postuler/{layout.tsx,page.tsx}`, `apps/web/src/features/recruit-test/TestFlow.tsx`, `components/{step-intro,step-qi,step-typing,step-connection,step-bot,step-identity,step-done,step-blocked,progress-dots}.tsx` ; modify `apps/web/src/proxy.ts` (`/postuler` public).

Contenus (fidèles à GLA, copie FR ; layout minimal : logo texte « GL Agency », fond thème, carte centrée, responsive) :
- intro : promesse du test (« ~10 minutes, 4 épreuves »), bouton Commencer → `startAttempt` (device UUID localStorage ; fermé/bloqué/limité → écrans dédiés).
- qi : 1 question à la fois, timer 30 s (barre), choix → suivante ; à la 5e → `saveQi`.
- typing : texte GLA à recopier, wpm live (mots corrects/min), collage bloqué, auto-fin ; → `saveTyping`.
- connection : bouton « Lancer le test », fetch `speed.cloudflare.com/__down?bytes=50000000` 12 s max, Mbps live ; → `saveConnection`.
- bot : chat (bulles, persona nommé avec sa couleur, « échange x / N »), composer texte + bouton média 📸 (prix €) ; à `done` → « Terminer » → `scoreAttempt` (« Analyse de ta conversation… ») → identité.
- identity : RHF (prénom, nom, e-mail, Discord optionnel) → `submitCandidate`.
- done : réussite (🎉 + lien Discord) / refus (raison qualitative, ton GLA bienveillant).
`TestFlow` : machine à états locale + `sessionStorage` (attemptId, step) pour survivre au refresh ; erreurs action → toast + rester sur l'étape.

- [ ] **Step 1-2: Implémenter + vérifier** (typecheck/lint/test ; `pnpm --filter @glagency/web build` pour la route publique).
- [ ] **Step 3: Commit** — `feat(formation): /postuler — parcours public du test (QI, frappe, connexion, fan IA, identité)`

### Task 6: Admin — page Recrutement + Config du test

**Files:** Create `apps/web/src/features/recruit-admin/{types.ts, schema.ts, actions.ts, services/get-candidates.ts, services/get-config.ts, RecruitTemplate.tsx, ConfigTemplate.tsx, components/{candidates-table,candidate-file,recruit-actions,config-form,qi-bank-editor,recruit-skeleton}.tsx}`, `app/(dash)/formation/recrutement/{page,loading}.tsx`, `app/(dash)/formation/recrutement/config/{page,loading}.tsx`.

- Liste : table (nouveaux d'abord ; nom, date, global + ✓/✗, 4 axes condensés, gates, repeat, statut, « devenu membre » si profile_id) ; bouton « Copier le lien du test » (URL absolue) ; `?dossier=<id>` → fiche (identité, épreuves + gates, axes, verdict + raison, transcription (messages), device/IP, actions : Valider / Refuser / Bloquer (device+e-mail+discord+ip) / Débloquer / Supprimer — ConfirmDialog, `requireAdminProfile` + refus impersonation, service-role).
- Config : RHF `'use no memo'` (toggles/seuils/liens/texte de frappe + éditeur banque QI : 5 slots × variantes en field arrays, bonne réponse par radio) → `saveRecruitConfig` (admin).
- Guards pages : `requireAdmin()`.

- [ ] **Step 1-2: Implémenter + vérifier.**
- [ ] **Step 3: Commit** — `feat(formation): page Recrutement (dossiers, verdicts, blocage) + Config du test (banque QI, seuils)`

### Task 7: Sidebar (groupe Configuration + badge) + rattachement membre

**Files:** Modify `apps/web/src/config/workspaces.ts` (item direct `{ href: '/formation/recrutement', label: 'Recrutement', icon: UserSearch, adminOnly: true }` après Roue ; groupe `{ id: 'config', label: 'Configuration', icon: Settings2 }` avec Catalogue (déplacé, `group: 'config'`) + `{ href: '/formation/recrutement/config', label: 'Config du test', icon: SlidersHorizontal, adminOnly: true, group: 'config' }` ; adapter `workspaces.test.ts` si besoin), create `apps/web/src/lib/services/recruit-pending.ts`, modify `app/(dash)/layout.tsx` + `app-sidebar.tsx` (badge `/recrutement` via `CountBadge`, promesse admin-only) ; modify `features/members` création (`createMember` action : lookup `recruit_candidates` par e-mail (admin client) → `update profile_id` + le dialog affiche « A passé le test le … — X/100 » via un service léger ; côté Recrutement le dossier montre « devenu membre »).

- [ ] **Step 1-2: Implémenter + vérifier** (attention : `workspaces.ts`/`app-sidebar.tsx` sont chauds — `git status` d'abord, ne pas embarquer de fichier sale étranger).
- [ ] **Step 3: Commit** — `feat(formation): sidebar — Recrutement + groupe Configuration (Catalogue, Config du test) ; rattachement membre par e-mail`

### Task 8: Docs + vérification globale

- [ ] CLAUDE.md (bloc Formation : Recrutement + `/postuler` public + migrations range) ; spec statut « implémenté, à recetter » ; vérification globale (lint/typecheck/tests web+core+db, build, dry-run up to date, tailles, grep : la banque QI/bonnes réponses et les seuils n'apparaissent dans aucun composant client public).
- [ ] **Commit** — `docs(formation): recrutement — CLAUDE.md, spec (statut)`

---

## Self-review
Spec §2 règles → T1 (schéma/seed), T2 (verdict/QI), T4 (gardes) ✓ ; §3 modèle → T1 ✓ ; §4 archi → T4/T5 (public), T6/T7 (admin/sidebar/membres), proxy → T5 ✓ ; §5 sécurité/coût/tests → Global Constraints + T2/T3/T4 tests ✓ ; §6 recette → T8 ✓. Types inter-tasks : `pickQiQuestions`/`gradeQi`/`computeVerdict` (T2) ← T4 ; `replyAsRecruitBot`/`scoreRecruitTranscript` (T3) ← T4 ; retours d'actions (T4) ← TestFlow (T5) ; `recruit_pending_count` (T1) ← T7 ✓. Placeholders : néant — le détail UI de T5/T6 est en prose complète, textes GLA dans l'extrait fourni.
