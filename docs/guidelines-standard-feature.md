# Guidelines — standard « feature » (glagencyapp)

Le contrat que toute feature `apps/web/src/features/<f>/` réplique (batches 2-5 de la
réorg). Établi + vérifié sur le pilote `/chatter/chatters` (spec
`docs/superpowers/specs/2026-07-16-standard-feature-design.md` §3-4). Complète
`docs/guidelines-data-loading.md` (lectures), `docs/guidelines-socle.md` (briques
transverses du batch 0 : Sentry serveur, cache/`api/revalidate`, headers, `env`, config Next)
et `.claude/skills/archi-web/SKILL.md`.

---

## 1. Squelette canonique

```
features/<f>/
├── <Feature>Template.tsx   # RSC racine — le seul fichier PascalCase (convention projet)
├── actions.ts              # mutations ('use server') — si la feature en a
├── schema.ts               # schémas Zod partagés client/serveur — si forms
├── types.ts                # contrat domaine local (types + constantes de domaine)
├── services/               # lectures — get-<entité>.ts, un fichier par lecture
└── components/             # composants de la feature (feuilles client, kebab-case)
```

- Fichiers absents si non pertinents ; pas de fichier surnuméraire à la racine (un cas type
  `planning/sections.ts` doit être absorbé dans `types.ts`/un composant, ou justifié par un
  commentaire d'en-tête).
- **Un type/service réutilisé par ≥ 2 features** est promu top-level (`lib/services/`,
  `lib/types/`) — jamais importé cross-feature. Exemple réel : `getChatters` vit dans
  `lib/services/get-chatters.ts` (pas dans `features/chatters/`) parce que `features/insights`
  le consomme aussi ; `ChatterRow`/`ChattersData` vivent dans `lib/types/chatters.ts`.
- **Frontières enforced par ESLint** (`import-x/no-restricted-paths`,
  `apps/web/eslint.config.mjs`) : `lib → features → app`, cross-feature interdit, personne
  n'importe `app/`. Violation = erreur de lint, pas une convention informelle.
- **Pas de barrel `index.ts`** — imports directs.
- **Fichiers > 300 lignes → split par responsabilité.** Le pilote a splitté
  `chatters-table.tsx` (351 l. avant) en `chatters-columns.tsx` (défs colonnes),
  `chatters-sub-rows.tsx` (rendu des sous-lignes) et `download-ranking.ts` (util Blob/DOM,
  hors composant) ; `chatters-table.tsx` (89 l.) ne garde que la composition + le filtre local.

---

## 2. Loading UX

1. **`loading.tsx` sur chaque route** (`app/**/loading.tsx`) — rend la route dynamique
   préfetchable par `<Link>` (skeleton au survol/viewport, prod). Reprend la silhouette de la
   page (mêmes dimensions que le contenu réel, anti-CLS). Exemple pilote :
   `app/(dash)/chatter/chatters/loading.tsx` — deux `Skeleton` pour le `h1`/sous-titre +
   `<TableSkeleton />`.
2. **`<Suspense>` granulaire par section**, pattern *kickoff sans `await`* : dans `page.tsx`,
   on lance la promise de données SANS l'attendre, le shell (titre, filtres déjà connus)
   s'affiche immédiatement, la section lente streame dans son `<Suspense>` dès qu'elle résout.
   Illustré par le pilote (`app/(dash)/chatter/chatters/page.tsx`) :

   ```tsx
   export default async function ChattersPage({ searchParams }: { searchParams: Promise<...> }) {
     const profile = await requireAccess('chatters')
     const period = resolvePeriod(await searchParams)
     // Kickoff SANS await : le shell (h1) s'affiche immédiatement, la table streame
     // dans son boundary quand le RPC répond.
     const data = getChatters(period, { restricted: profile.role !== 'admin' })

     return (
       <div className="flex flex-col gap-6">
         <h1 className="text-2xl font-semibold tracking-tight">Chatteurs</h1>
         <Suspense
           fallback={
             <div className="flex flex-col gap-6">
               <Skeleton className="-mt-4 h-4 w-72" />
               <TableSkeleton />
             </div>
           }
         >
           <ChattersContent data={data} />
         </Suspense>
       </div>
     )
   }

   async function ChattersContent({ data }: { data: Promise<ChattersData> }) {
     return <ChattersTemplate data={await data} />
   }
   ```

   Requêtes **indépendantes** consommées par le même composant : `Promise.all` (pas de
   waterfall). Sections indépendantes : boundaries `<Suspense>` sœurs. Vraie dépendance
   séquentielle : composant async imbriqué derrière son propre `<Suspense>`.
3. **Skeletons dimensionnés**, partagés dans `components/skeletons/` (`table-skeleton.tsx`,
   `kpi-skeleton.tsx`, …) — pas le `PageSkeleton` générique. A11y intégrée une fois pour
   toutes : conteneur `role="status"` + `<span className="sr-only">Chargement…</span>`,
   squelettes `aria-hidden`. Ne pas dupliquer cette a11y dans chaque feature.
4. **Silhouette spécifique d'une page = petit composant dédié, jamais dupliqué.** Si le
   contenu de la feature dépasse une brique générique unique (`TableSkeleton`/`KpiSkeleton`
   seuls) — ex. une composition jauge + KPIs + cartes — extraire un composant
   `features/<f>/components/<f>-skeleton.tsx` (Server Component simple, ex. `HealthSkeleton`)
   qui compose les briques génériques. `loading.tsx` **et** le fallback `<Suspense>` de
   `page.tsx` l'importent tous deux — jamais de markup de skeleton dupliqué byte-à-byte entre
   les deux. `loading.tsx` garde en propre son bloc titre (`h1`/sous-titre skeleton, absent du
   composant dédié car `page.tsx` affiche le vrai `h1` immédiatement). Exemple :
   `features/health/components/health-skeleton.tsx` (`HealthSkeleton`, composant les cartes
   modèles + `KpiSkeleton`), consommé par `app/(dash)/chatter/health/loading.tsx` et le
   fallback de `app/(dash)/chatter/health/page.tsx`.
5. **Piège — sous-titre du Template quand le `h1` remonte dans la page** : le `<p>` sous-titre
   du `<Feature>Template.tsx` prend `-mt-4` pour compenser le double `gap-6` page/Template (le
   `flex flex-col gap-6` de `page.tsx` espace déjà `h1` et contenu streamé) — rendu identique à
   un layout sans split page/Suspense. Recette du pilote, `ChattersTemplate.tsx`.

---

## 3. Erreurs & Sentry

- **Règle services** : toute erreur de query Supabase est **destructurée et thrown** — jamais
  avalée. `const { data, error } = await supabase.from(...)…; if (error) throw new
  Error(error.message)`. Une erreur non catchée dans un service remonte à la boundary
  `error.tsx` la plus proche (workspace ou `(dash)`) via React.
- **Règle actions — ligne de partage NETTE** : **tout message métier écrit PAR NOUS (en
  français) = `throw new BusinessError('...')`** (`src/lib/actions.ts`) ; `runAction` le
  renvoie tel quel comme retour typé (`ActionResult`), pas de Sentry. **Une `Error` nue = TOUJOURS
  technique** — `Sentry.captureException(err)` + message générique, y compris quand on est
  tenté d'y mettre un message français ou un `error.message` Supabase brut : ces deux cas sont
  avalés par `runAction` en « Erreur inattendue » et polluent Sentry de faux positifs (vécu :
  `createUser` → `email_exists` non catché, `features/members/actions.ts`, audit 2026-07-19).
  Il n'y a **pas** de zone grise « ce message est presque métier » : soit c'est nous qui
  l'écrivons (→ `BusinessError`), soit c'est un message externe qu'on ne maîtrise pas (→
  `Error`, jamais affiché brut).
  `BusinessError` n'est **pas** réservée aux seuls conflits que SEULE la base peut trancher —
  contrairement à ce que sa présentation laissait penser jusqu'ici. Elle couvre aussi bien un
  conflit détecté par une lecture DB (`features/marketing-staff/actions.ts`,
  `saveStaffAssignments`, conflit anti-vol RPC) qu'un refus détecté SANS aucune lecture DB, par
  un code d'erreur structuré renvoyé par une API (`features/members/actions.ts`, `createMember`
  — `error.code === 'email_exists'` sur le retour de `admin.auth.admin.createUser`, code
  `ErrorCode` de `@supabase/auth-js`, pas un `message.includes(...)` fragile). Second argument
  optionnel `fieldErrors` (mêmes clés que le schéma zod) : pose le message sur le champ fautif
  du formulaire plutôt que sur le seul message global — cf. `member-dialog.tsx` /
  `todo-dialog.tsx`, qui remappent `res.fieldErrors` champ par champ.
- **`ErrorFallback` partagé** (`src/components/error-fallback.tsx`) : capture
  `Sentry.captureException(error)` dans un `useEffect([error])`, affiche un `role="alert"` +
  bouton « Réessayer » branché sur `unstable_retry` (Next 16.2 — re-fetch + re-render du
  segment ; `reset()` ne re-fetch pas). Chaque `error.tsx` (workspace ou route) ne fait que le
  brancher :

  ```tsx
  // app/(dash)/chatter/error.tsx
  export default function ChatterError({ error, unstable_retry }: {
    error: Error & { digest?: string }
    unstable_retry: () => void
  }) {
    return <ErrorFallback error={error} retry={unstable_retry} />
  }
  ```

  Boundaries existantes : `(dash)/chatter/error.tsx`, `(dash)/marketing/error.tsx`, le filet
  `(dash)/error.tsx` et `global-error.tsx`. Une nouvelle feature n'a **pas** à créer son propre
  `error.tsx` — elle hérite de la boundary du workspace.

---

## 4. Mutations

- **`ActionResult<T>`** partagé (`src/lib/actions.ts`) — jamais de contrat local redéclaré :

  ```ts
  export type ActionResult<T = void> =
    | { success: true; data: T }
    | { success: false; error: string; fieldErrors?: Record<string, string[]> }
  ```

- **`runAction`** (même fichier) enchaîne, le tout sous `try/catch` : (a) garde d'auth
  (fonction passée, ex. `requireAccess`/`getProfile`) → échec = `ActionResult` en erreur
  métier, (b) `schema.safeParse(input)` → échec = `fieldErrors` via `z.flattenError(...)`,
  (c) le handler. Le `try/catch` englobant capture aussi une garde qui `throw` (ex. échec
  Supabase dans `getProfile`) comme une erreur technique — `Sentry.captureException` +
  message générique. Chaque `actions.ts` l'utilise ; la RLS reste le garde-fou réel (défense
  en profondeur, pas le seul rempart). Exemple pilote : `features/chatters/actions.ts`
  (`updateChatterCrm`).
- **Vérification métier — UNE SEULE FOIS, en tête du `handler`.** Quand un message précis
  dépend d'une lecture DB ou d'un droit fin (« Bloc introuvable », « Cette tâche n'existe
  plus », cible hors périmètre du manager…), la vérification vit **exclusivement dans le
  `handler`**, jamais dans le `guard`. Un refus lève `throw new BusinessError('message',
  fieldErrors?)`. Le `guard` associé est `noGuard` (`const noGuard = async () => ({ ok: true as
  const })` — `runAction` exige un `guard`, `noGuard` le satisfait sans rien vérifier).
  Exemples canoniques : `features/todos/actions.ts` (`requireCanWriteTodo`),
  `features/planning/actions.ts` (`requireCanEdit`, `saveBlock`).

  **Ancien patron — NE PLUS ÉCRIRE, et ne pas « re-optimiser » vers lui.** On a longtemps fait
  vivre cette vérification dans le `guard` (avec un `safeParse` DÉFENSIF du `raw` capturé en
  closure, car le `guard` s'exécute AVANT le `schema.safeParse` officiel de `runAction`), puis
  le `handler` la **re-dérivait** derrière un commentaire du genre « Mémoïsé par requête
  (`cache()`, lib/auth) — pas de round-trip DB supplémentaire ». C'est **faux** : `cache()`
  (React) ne mémoïse QUE dans le rendu d'un Server Component
  (react.dev/reference/react/cache : « cache is for use in Server Components only ») — appelée
  depuis le `guard`/`handler` d'une Server Action, qui n'est PAS un rendu RSC, la fonction
  s'exécute mais ne lit ni n'alimente jamais le cache. Deux dégâts concrets : (1) une requête
  Supabase doublée à CHAQUE mutation ; (2) surtout, le second passage dans le `handler`
  redécouvrait le même refus mais le levait souvent en `throw new Error(message)` NU au lieu du
  `{ ok: false, error }` typé du `guard` — `runAction` l'avale alors en « Erreur inattendue »
  et l'envoie à Sentry, alors que c'était un refus métier normal. C'est exactement le bug vécu
  sur `createMember` (`email_exists` non catché, `features/members/actions.ts`, audit
  2026-07-19) : le `guard` ne pouvait pas pré-vérifier l'email (seul `createUser` le sait), et
  le `throw new Error(...)` générique du `handler` a avalé le message métier. Supprime aussi le
  `safeParse` défensif du `guard` en migrant vers ce patron : il n'avait de sens QUE pour
  nourrir un `guard` qui lisait `values` avant validation officielle — le `handler`, lui, reçoit
  déjà des `values` validées par `runAction`.

  Nuances qui restent valables, migrées du `guard` vers le `handler` : (1) l'`error` d'un
  SELECT de pré-check est **destructurée et thrown** (un échec technique ne doit pas se
  déguiser en message métier ni passer sous silence) ; (2) `.single()` erre AUSSI sur 0 ligne
  (`PGRST116`) — ce cas-là est MÉTIER, ne thrower que si `error.code !== 'PGRST116'` (cf.
  `features/planning/actions.ts`, `loadTargetProfile`) ; `maybeSingle()`/`count` n'ont pas ce
  piège. (3) Un 0-row résiduel APRÈS la vérification métier (course ultra-serrée entre la
  lecture et l'écriture) reste un throw technique.

  **Contre-piège — NE PAS retirer `cache()` de `lib/auth` (`getProfile`/`getUser`) ou
  `lib/supabase/server` (`createClient`).** Le paragraphe ci-dessus ne
  dit PAS que `cache()` est inutile : ces fonctions sont aussi appelées depuis des **Server
  Components** (layout, gardes de page) — LÀ, dans un rendu RSC, la mémoïsation par requête est
  réelle et load-bearing (un layout + une page qui appellent chacun `getProfile()` ne paient
  qu'UNE requête). Un `grep cache(` qui retirerait ces `cache()` casserait le rendu de toutes
  les pages. Ce qui est faux, c'est de compter sur ce même `cache()` pour économiser un appel
  fait DEPUIS une Server Action (`guard`/`handler` de `runAction`) — deux contextes d'exécution
  différents, une seule des deux mémoïse.

  État du code (2026-07) : `todos/actions.ts` et `planning/actions.ts` suivent déjà ce patron ;
  `members/actions.ts`, `insights/actions.ts`, `police/actions.ts`, `quotas/actions.ts`,
  `scripts/actions.ts`, `repos/actions.ts`, `spenders/actions.ts` (`addRelance`) et
  `marketing-staff/actions.ts` montrent encore l'ancien — migration au coup par coup (chantier
  séparé par feature, avec test manuel), pas un find-and-replace en masse.
- **Gardes de `runAction` — ne jamais passer un helper `redirect()` de `lib/auth`.** LE piège :
  `requireAdmin`/`requireAccess` (`lib/auth`) font un `redirect()` qui serait AVALÉ par le
  `try/catch` de `runAction`. Comme `guard`, utiliser une garde qui **retourne** un résultat :
  les gardes partagées de `lib/actions` (`adminGuard`, `pageGuard(slug)`,
  `managerPageGuard(slug)`), ou une garde LOCALE renvoyant `{ ok }`/`{ profile }` (jamais un
  `redirect`). Le suffixe `Guard` est réservé aux **wrappers d'un helper `lib/auth`**
  (`requireAdminGuard`) ; une garde locale qui ne redirige pas peut garder un nom métier
  (`requireCanEdit`, `requirePoliceProfile`, `requireRepos`…) — l'essentiel est qu'elle **ne
  redirige pas**.
- **Écriture réservée par rôle — triade miroir (chatteur = lecture seule).** Un chatteur ne
  peut pas écrire, sauf exceptions (relances). Le contrôle tient sur **3 niveaux à garder
  alignés** : (1) **RLS `can_write_page(slug)`** = enforcement réel en base (migration 0060) ;
  (2) **serveur** — la Server Action prend `guard: managerPageGuard(slug)` dans `runAction`
  (`lib/actions.ts`, miroir de la RLS via `hasWriteAccess`, `lib/auth`), **pas** `pageGuard`
  (qui autorise le chatteur — réservé aux lectures/relances) ; (3) **UI** — `page.tsx` calcule
  `const canWrite = profile.role === 'admin' || profile.manager` et le **threade en prop**
  `page → <Feature>Template → <Feature>View → composants` pour masquer/désactiver les commandes
  d'écriture (optimiste ; la RLS reste le vrai rempart). Variantes fines : `planning` thread un
  `canEdit` (calcul superadmin/cible) ; `spenders` un `readOnly` local pour la vue liste.
  **Toute nouvelle feature à écritures pose les 3 niveaux.** (Introduit au chantier rôles,
  post-refacto standard.)
- **Chaque Server Action revalide la route affectée** : `revalidatePath('/chatter/...')`
  après le `update`. Si la donnée mutée alimente un cache taggé (`use cache` +
  `cacheTag(...)`, ex. `get-ranking`), ajouter `updateTag(tag)` (stable Next 16, Server
  Actions only, read-your-own-writes dans la même requête) — pas encore d'exemple dans le
  repo (aucune mutation ne touche pour l'instant une lecture taggée), mais le pattern est le
  standard dès que ce cas se présente.
- **Toasts `sonner`** (`<Toaster>` monté au root layout) : chaque mutation cliente affiche
  `toast.success`/`toast.error` à partir de l'`ActionResult` reçu — le message d'erreur vient
  toujours du `return` de l'action, jamais d'un `throw` intercepté côté client.

---

## 5. Forms

- **RHF + `zodResolver` + schéma partagé dans `schema.ts`** — le même objet Zod des deux
  côtés (`resolver` client, `runAction({ schema, ... })` serveur). Exemple pilote :
  `features/chatters/schema.ts` (`updateChatterCrmInput`) consommé par
  `features/chatters/components/chatter-crm-dialog.tsx` (resolver) et
  `features/chatters/actions.ts` (`runAction`). Idem `members` (`memberInput`).
- **Paire form-variant / server-variant** quand la saisie client diffère du contrat serveur
  (montant en texte, `bulletsText`/`annexesText` → tableau…) : co-localiser les DEUX dans
  `schema.ts` — le schéma de form (resolver client) ET le schéma d'input transformé (passé à
  `runAction`). Ex. `planning` (`blockForm`/`blockInput`), `marketing-staff`, `police`,
  `scripts`. La règle « même objet » ne vaut littéralement que pour un form sans transformation.
- **Exception — éditeur contrôlé / autosave (non-RHF).** Certaines surfaces ne sont pas des
  forms RHF mais des éditeurs à inputs contrôlés / autosave appelant l'action directement
  (`infos-modeles`, `quotas`, `repos`, `snap-codes`, + `scripts`/`moveInput`). Leur schéma Zod
  reste **inline dans `actions.ts`** (validation serveur-only mono-usage, aucun resolver client
  à partager) — pas de `schema.ts`. Ne pas forcer RHF ni un `schema.ts` sur ces cas ; commenter
  l'inline en en-tête.
- **Erreur serveur globale** : `form.setError('root.serverError', { message: res.error })`
  sur un `ActionResult` en échec, affichée dans un `role="alert"`. Une erreur de **champ**
  posée par le serveur (`res.fieldErrors`) est effacée dès que le champ repasse la validation
  client — voulu, les erreurs non exprimables côté client (ex. unicité) sont re-mappées à
  chaque submit.
- **Zod v4** : `z.uuid()` (pas `z.string().uuid()`), `z.url()` (pas `z.string().url()`),
  `z.flattenError(...)` pour les schémas plats de forms (pas `.flatten()`, déprécié).
- **`ActionButton`** (`src/components/action-button.tsx`) pour le bouton de submit : spinner +
  `disabled` piloté par `pending` (ex. `form.formState.isSubmitting`).

**Pièges** (retour du pilote) :

- Un `Select` Radix refuse `value=""` (chaîne vide) → sentinelle `NONE = 'none'` + mapping vers
  `null` à la lecture/écriture (cf. `chatter-crm-dialog.tsx`, `CrmSelect`).
- Un `Select` Radix dans RHF passe par `Controller` — pas `register` (le composant ne wrappe pas
  un `<input>` natif, `register` n'a rien à câbler dessus).
- Les `defaultValues` du form doivent être reset à la RÉOUVERTURE du dialog (`onOpenChange` →
  `form.reset(...)`), sinon un vieux brouillon reste affiché — c'est aussi ce qui resynchronise
  le form avec la donnée après un `revalidatePath`.

---

## 6. Filtres — `searchParams` pour l'état partageable, `useState` pour un filtre de vue

État de filtre **partageable par URL** (période, onglet, etc. — ce que l'utilisateur voudrait
retrouver via un lien ou au retour arrière) → `searchParams` + `useTransition`/`isPending` +
`router.replace`. Pattern déjà en place, ex. `src/components/date-range-picker.tsx` :

- lire l'état depuis `useSearchParams()`, avec un défaut si absent ;
- écrire via `router.replace(\`${pathname}?${params}\`, { scroll: false })` (pas `push` — pas
  d'entrée d'historique parasite) ;
- envelopper la navigation dans `startTransition` → `isPending` alimente l'indicateur de
  chargement, l'ancienne UI reste affichée pendant le refetch (stale-while-revalidate, pas de
  flash).

**Distinction avec un filtre de VUE interne à une table** (tri, filtre rapide non persistant —
ex. le sélecteur de modèle de `features/chatters/components/chatters-table.tsx:26`) : il reste en
`useState` local, il ne change pas la donnée récupérée côté serveur (juste ce qui est affiché
d'un jeu déjà chargé) et n'a pas vocation à être partagé par lien. Règle de tri : un état que
l'utilisateur voudrait partager/retrouver via l'URL (période, onglet) va en `searchParams` ; un
filtre de vue interne à une table reste en `useState` local. Idem pour un état purement local à
un composant (ex. `open` d'un `Dialog`, `draft` d'un calendrier avant validation).

---

## 7. Images (convention — rien à faire aujourd'hui)

L'app n'affiche aujourd'hui aucune image. Pour le jour où (avatars, logos créatrices…) :

- Petites images (< 10 Ko, avatars 32-64 px) : bucket Supabase **public** +
  `<Image unoptimized width height loading="lazy">` (reco Vercel — l'optimisation facturée ne
  se justifie pas sur des petites images) ; `width`/`height` obligatoires (anti-CLS).
- Pas de `placeholder="blur"` sur les petites images ; pas de signed URLs éphémères dans un
  `next/image` optimisé (chaque URL unique = cache MISS facturé).
- Grandes images à optimiser un jour : loader custom Supabase `render/image` (plan Pro) plutôt
  que les transformations Vercel.

---

## 8. Pilote de référence

`/chatter/chatters` est l'implémentation canonique de ce standard — s'y référer en cas de
doute :

- `apps/web/src/app/(dash)/chatter/chatters/page.tsx` — kickoff sans await + Suspense.
- `apps/web/src/app/(dash)/chatter/chatters/loading.tsx` — skeleton de route.
- `apps/web/src/lib/services/get-chatters.ts` — RPC typé + cast documenté, erreurs thrown
  (règle détaillée dans `docs/guidelines-data-loading.md`).
- `apps/web/src/features/chatters/ChattersTemplate.tsx` — Template RSC, aucun fetch.
- `apps/web/src/features/chatters/actions.ts` + `schema.ts` — `runAction` + schéma partagé.
- `apps/web/src/features/chatters/components/chatter-crm-dialog.tsx` — RHF + zodResolver +
  toasts + `root.serverError`.
- `apps/web/src/features/chatters/components/chatters-table.tsx` +
  `chatters-columns.tsx` + `chatters-sub-rows.tsx` + `download-ranking.ts` — split > 300 l.

---

## Checklist nouvelle feature

- [ ] Squelette : `<Feature>Template.tsx` + `services/` + `components/` (+ `actions.ts`/`schema.ts` si mutations/forms)
- [ ] `page.tsx` : garde d'accès + kickoff sans await + `<Suspense fallback={skeleton dimensionné}>`
- [ ] `loading.tsx` avec la silhouette de la page (route préfetchable)
- [ ] Lectures : RPC `SECURITY INVOKER` (agrégats) ou `fetchAll` ; TOUTE erreur destructurée et thrown ; « aujourd'hui » = `todayParis()`
- [ ] Mutations : `runAction` + `revalidatePath` (+ `updateTag` si cache taggé) + toast
- [ ] Aucune garde ne s'exécute deux fois par mutation (vérification métier dans le `handler`
      uniquement, `guard` = `noGuard` ou auth générique — jamais les deux qui re-dérivent le
      même résultat)
- [ ] Écritures gatées rôle : `guard: managerPageGuard(slug)` (serveur) + `canWrite` threadé page→composants (UI) — miroir RLS `can_write_page`
- [ ] Forms : RHF + `zodResolver` + schéma partagé dans `schema.ts` (Zod v4 : `z.uuid()`, `z.flattenError()`)
- [ ] Aucun import d'une autre feature (ESLint le bloque) ; pas de barrel `index.ts`
- [ ] `pnpm --filter @glagency/web lint && typecheck` avant commit

---

## Désambiguïsation doc / pilote

En cas de conflit entre cette doc et le pilote `/chatter/chatters` : le pilote fait foi —
signaler l'écart pour correction de la doc.
