# Standard feature — Batches 2-5 (migration des 18 features) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development pour exécuter task par task. Chaque task réplique le pilote — **la source de vérité est `docs/guidelines-standard-feature.md`** (+ `docs/guidelines-data-loading.md`), PAS le plan du pilote (le § overrideTypes y est périmé). En cas de conflit doc ↔ pilote : le pilote (`/chatter/chatters`) fait foi.

**Goal:** Appliquer le standard validé par le pilote aux ~18 features restantes, par batches (lecture → interactif → spenders → marketing).

**Architecture:** 1 task = 1 feature (sauf exceptions notées). Chaque task suit la checklist « nouvelle feature » de la doc standard, avec les correctifs spécifiques listés ici (issus de l'inventaire vérifié du 2026-07-16). Branche : `feat/standard-feature` (accord commits global, zéro push). Review par task + review de branche par batch.

**Tech Stack:** inchangé (Next 16.2.10, Zod 4, RHF, sonner, `runAction`, skeletons).

## Global Constraints

- **Comportement métier et DOM inchangés** sauf éléments du standard (skeletons, toasts, messages d'erreur génériques). Aucun changement de design.
- **Messages utilisateur français U+2019** ; jamais de `error.message` Supabase brut à l'UI.
- **Pattern RPC** : appel typé (nom+args) + cast documenté du data pour les `Returns: Json` (`rpcRes.data as X | null` + commentaire pointant `docs/guidelines-data-loading.md §1`) ; `crm_spenders_tracker` est typé nativement (aucun cast). Toute erreur de query destructurée et thrown.
- **Mutations** : `runAction` + `ActionResult` (`@/lib/actions`), `revalidatePath` dans le handler après succès, toast sonner côté client. Supprimer les types `Result` locaux.
- **Pages** : h1 immédiat + kickoff sans await + `<Suspense fallback={sous-titre skeleton + TableSkeleton/KpiSkeleton}>` (recette pilote : sous-titre `-mt-4` dans le Template) ; `loading.tsx` silhouette de la page.
- **Splits** : fichier > 300 lignes → découpe par responsabilité (modèle : chatters-columns/sub-rows/download-ranking), DOM byte-identique.
- **Vérifs par task** : `pnpm typecheck` PASS, `pnpm --filter @glagency/web lint` exit 0 (9 warnings connus max — chaque disparition est un plus), `pnpm --filter @glagency/web build` PASS. Vérifs visuelles → checklist Benoit en fin de chantier.
- Commits français + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`, 1 commit/task.

---

# BATCH 2 — Lecture (health, models, overview, stats, bilan)

Features sans mutations : nettoyage des casts RPC + streaming par page. Pas de runAction/forms ici.

### Task B2-1: health
**Files:** `features/health/services/get-health.ts` (casts :59-63), `app/(dash)/chatter/health/{page,loading}.tsx`, `features/health/HealthTemplate.tsx`
- [ ] Service : retirer `as never`/`PromiseLike` du RPC `health_report` → appel typé + cast documenté du data (pattern doc §1) ; TOUTES les erreurs destructurées/thrown (vérifier les requêtes parallèles).
- [ ] Page : h1 immédiat + kickoff sans await + Suspense (fallback sous-titre + `KpiSkeleton`/`TableSkeleton` selon la silhouette réelle) ; Template ajusté (h1 sorti, `-mt-4`) ; loading.tsx silhouette.
- [ ] Vérifs + commit `refactor(health): standard pilote (RPC typé, streaming shell+Suspense)`.

### Task B2-2: models
**Files:** `features/models/services/get-models.ts` (casts :42-45), `app/(dash)/chatter/modeles/{page,loading}.tsx`, `features/models/ModelsTemplate.tsx`
- [ ] Même recette que B2-1 (RPC `models_report`).
- [ ] Commit `refactor(models): standard pilote (RPC typé, streaming shell+Suspense)`.

### Task B2-3: overview
**Files:** `features/overview/services/get-overview.ts` (casts :47-53), `app/(dash)/chatter/overview/{page,loading}.tsx`, `features/overview/OverviewTemplate.tsx`
- [ ] Même recette (RPC `overview_report`). Attention : OverviewTemplate a été retouché (U+2019) — rebase propre.
- [ ] Commit `refactor(overview): standard pilote (RPC typé, streaming shell+Suspense)`.

### Task B2-4: bilan
**Files:** `features/bilan/services/get-bilan.ts` (casts :77-84), `app/(dash)/chatter/bilan/{page,loading}.tsx`, `features/bilan/BilanTemplate.tsx`
- [ ] Même recette (RPC `bilan_report` + fetchAll existant conservé).
- [ ] Commit `refactor(bilan): standard pilote (RPC typé, streaming shell+Suspense)`.

### Task B2-5: stats
**Files:** `features/stats/services/*`, `app/(dash)/chatter/stats/{page,loading}.tsx`, `features/stats/StatsTemplate.tsx`
- [ ] Pas de RPC (sortie déjà au grain PK, fetchAll en place) : streaming uniquement (page + Suspense + skeleton + loading silhouette).
- [ ] Commit `refactor(stats): standard pilote (streaming shell+Suspense)`.

### Fin batch 2
- [ ] Vérif globale (typecheck/lint/build) + review de branche du batch (diff cumulé) + ledger.

---

# BATCH 3 — Interactif (insights, quotas, repos, planning, scripts, snap-codes, infos-modeles, police, members)

Le gros : mutations sur `runAction` + toasts, selects nus bornés, splits >300 l., schémas extraits.

**Recette commune à CHAQUE task du batch :**
- [ ] `actions.ts` → `runAction`/`ActionResult` (supprimer le type Result local ; erreurs techniques en throw ; garder les gardes métier existantes en `guard`).
- [ ] Composants mutants : toast sonner succès/erreur (message de l'action).
- [ ] Zod inline partagé client/serveur → `schema.ts` ; moderniser (`z.uuid()`, plus de `.flatten()`).
- [ ] Page : shell + Suspense + skeleton + loading silhouette (recette pilote).
- [ ] Vérifs standard + 1 commit/feature `refactor(<feature>): standard pilote (runAction+toasts, streaming, …)`.

**Spécificités par feature (inventaire vérifié) :**

### Task B3-1: insights
- Select nus NON bornés `services/get-insights.ts:63-64` (`insight_states`, `profiles`) → fetchAll ou bornes.
- Split `components/insight-card.tsx` (460 l.) ; disable react-hooks/set-state-in-effect posé au batch 0 → résoudre proprement (reset par key ou calcul au render) si trivial, sinon conserver le disable documenté.
- `actions.ts` : utilise déjà todayParis (fixé) ; `bilan-dialog.tsx:41` jour UTC client → `todayParis()` n'est PAS applicable côté client : utiliser la même recette Intl Europe/Paris que spenders (`PARIS_DAY`) ou accepter le TZ navigateur — trancher à l'implémentation avec justification.
### Task B3-2: quotas
- Zod inline `actions.ts:17-30` → schema.ts si consommé client, sinon inline conservé.
### Task B3-3: repos
- Select nu `services/get-repos.ts:55` (`rest_planning_cells.select('week_start')` non borné) → fetchAll/bornes.
- Split `components/planning-grid.tsx` (524 l. — le plus gros du repo).
### Task B3-4: planning
- Split `components/planning-view.tsx` (341 l.) ; `actions.ts:20,46` contrat déviant (`{...} | {error}`) → runAction.
- `sections.ts` à la racine de la feature → absorber (types.ts ou composant) ou justifier par commentaire d'en-tête.
### Task B3-5: scripts
- RAS spécifique : recette commune.
### Task B3-6: snap-codes
- Cast `'snap_codes' as never` (`services/get-snap-codes.ts:23`) → typé (table dans les types générés) ; select non borné → bornes/fetchAll.
### Task B3-7: infos-modeles
- Split `components/infos-modeles-view.tsx` (403 l.) ; zod inline `actions.ts:13` → schema.ts si partagé.
### Task B3-8: police
- RAS spécifique majeur (RHF déjà en place ×2) : recette commune, 4 revalidatePath à vérifier.
### Task B3-9: members
- Splits `components/member-dialog.tsx` (321 l.) ET `actions.ts` (304 l. — découper par opération si lisible, sinon garder).
- ⚠️ ZONE SENSIBLE : members a reçu les itérations manager/superadmin récentes (sessions parallèles) — relire le ledger section members-manager-access avant de toucher ; ne PAS altérer la logique d'autorisation (`authorizeRoleAndScope`, `managerIdPatch`) ; runAction doit WRAPPER ces gardes, pas les remplacer.

### Fin batch 3
- [ ] Vérif globale + review de branche du batch + ledger.

---

# BATCH 4 — Spenders (normalisation complète)

### Task B4-1: spenders
**Files:** `app/(dash)/chatter/spenders/*` (layout + 5 pages), `features/spenders/*`
- [ ] Fetch du `layout.tsx` → chaque `page.tsx` (pattern standard) ; supprimer l'encodage tuple `wire.ts` si possible (sinon commentaire d'en-tête justificatif).
- [ ] `loading.tsx` sur les 5 pages (silhouettes).
- [ ] RPC `crm_spenders_tracker` : typé nativement — vérifier qu'aucun cast n'est introduit.
- [ ] `revalidatePath('...', 'layout')` ×4 dans actions.ts → revoir après le passage du fetch aux pages (path simple probable) ; actions sur runAction + toasts.
- [ ] Disable react-hooks/purity de `spenders-auto-refresh.tsx` (batch 0) → résoudre proprement (lazy init) si trivial.
- [ ] `types.ts:30` `dayUTC(new Date())` : FAUX POSITIF vérifié (PARIS_DAY déjà correct) — ne pas toucher.
- [ ] Vérifs + commits (2-3 commits logiques acceptés : normalisation routes / actions / polish).

### Fin batch 4
- [ ] Vérif globale + review de branche + ledger.

---

# BATCH 5 — Marketing (éclatement en features par sous-domaine)

### Task B5-1: éclatement structurel
- [ ] `features/marketing/` → features alignées routes : `marketing-dashboard`, `marketing-liens`, `marketing-social` (instagram/twitter/telegram), `marketing-staff`, `marketing-va` — squelette canonique chacune. Frontières ESLint : la liste des zones se régénère seule (filesystem).
- [ ] Déplacements purs d'abord (git mv, DOM identique), puis standard par sous-feature.
### Task B5-2..B5-5: standard par sous-feature
- [ ] Recette commune batch 3 (runAction+toasts sur les ~8 actions, streaming par page, splits : `va-view.tsx` 442 l.).
- [ ] `social-entry-dialog.tsx:34` + `social-view.tsx:172` jour UTC client → même arbitrage que B3-1 (Intl Paris ou TZ navigateur justifié).
- [ ] `DashboardTemplate` + 4 autres templates → 1 Template par sous-feature.

### Fin batch 5
- [ ] Vérif globale + review de branche FINALE du chantier complet + mise à jour checklist Benoit + ledger.

---

# Hors scope (rappel)
teams/compta : stubs conservés, non migrés. Tests apps/web : hors chantier. TanStack Query, next-safe-action : non.
