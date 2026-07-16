# Guidelines — standard « feature » (glagencyapp)

Le contrat que toute feature `apps/web/src/features/<f>/` réplique (batches 2-5 de la
réorg). Établi + vérifié sur le pilote `/chatter/chatters` (spec
`docs/superpowers/specs/2026-07-16-standard-feature-design.md` §3-4). Complète
`docs/guidelines-data-loading.md` (lectures) et `.claude/skills/archi-web/SKILL.md`.

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
- **Règle actions** : erreur **métier/validation** = valeur de `return` typée (`ActionResult`,
  jamais `throw`) ; erreur **technique** = `Sentry.captureException(err)` + message générique
  — jamais un `error.message` Supabase brut affiché à l'utilisateur. `runAction`
  (`src/lib/actions.ts`) applique déjà cette règle : tout le pipeline est sous `try/catch`,
  donc même une garde qui `throw` est traitée comme technique.
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

- **RHF + `zodResolver` + schéma partagé dans `schema.ts`** — LE même objet Zod des deux
  côtés (`resolver` client, `runAction({ schema, ... })` serveur). Exemple pilote :
  `features/chatters/schema.ts` (`updateChatterCrmInput`) consommé par
  `features/chatters/components/chatter-crm-dialog.tsx` (resolver) et
  `features/chatters/actions.ts` (`runAction`).
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
- [ ] Forms : RHF + `zodResolver` + schéma partagé dans `schema.ts` (Zod v4 : `z.uuid()`, `z.flattenError()`)
- [ ] Aucun import d'une autre feature (ESLint le bloque) ; pas de barrel `index.ts`
- [ ] `pnpm --filter @glagency/web lint && typecheck` avant commit

---

## Désambiguïsation doc / pilote

En cas de conflit entre cette doc et le pilote `/chatter/chatters` : le pilote fait foi —
signaler l'écart pour correction de la doc.
