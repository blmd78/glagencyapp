# To-do — pile de noms dépliables : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher la to-do comme le planning journalier — tous les noms consultables empilés et dépliables — en extrayant au passage la machine à états « charger à l'ouverture » aujourd'hui dupliquée entre le planning et le dashboard.

**Architecture:** Un hook `useMemberPanel` porte l'état du panneau ouvert, le jeton de course et le `try/catch` de transport. Les trois piles (planning, dashboard, to-do) s'y branchent et ne gardent que leur repère, leur squelette et leur composant de panneau. La to-do gagne un service d'agrégat (`getTodoCounts`) pour le repère de la ligne repliée et une Server Action (`loadTodos`) pour le contenu du panneau.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Tailwind v4, shadcn/ui (Radix), Supabase (`supabase-js` + RLS).

**Spec:** `docs/superpowers/specs/2026-07-28-todos-accordeons-membres-design.md`

## Global Constraints

- **Aucune migration, aucune modification de RLS, aucune modification de garde.** `can_write_todo_of` (0067) et `requireCanWriteTodo` restent intactes.
- **Aucun test unitaire à écrire.** `apps/web` n'a ni script `test` ni configuration vitest (vérifié : `package.json` n'expose que `dev`, `build`, `lint`, `typecheck`). Ce n'est pas un oubli du plan — ce chantier n'introduit aucune logique de domaine, et le projet ne teste que `packages/core`. **La porte de sortie de chaque tâche est `typecheck` + `lint`**, et une vérification manuelle pour les tâches qui changent le rendu.
- **Convention de la page :** `app/**/page.tsx` récupère la donnée, la passe en props à `<Feature>Template.tsx`. **Aucun fetch dans une feature.**
- **Jamais de `select` nu sur une agrégation multi-personnes** : `fetchAll` obligatoire avec `.order()` sur la PK complète (cf. `docs/guidelines-data-loading.md`). PostgREST tronque à 1000 lignes **en silence**.
- **Libellé du repère : `« N à traiter »` / `« Rien »`.** Jamais « en cours » — c'est déjà le libellé du statut `in_progress`.
- **Tout composant react-hook-form doit porter `'use no memo'`** (React Compiler casse `formState`). Ce plan ne crée aucun formulaire RHF, mais ne retire jamais cette directive d'un fichier existant.
- **Pas de commit automatique vers `main`.** Travail sur `feature/todos-pile` depuis `develop`.

## File Structure

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `apps/web/src/hooks/use-member-panel.ts` | **Créé.** État du panneau ouvert + jeton de course + erreur de transport. Aucune connaissance métier. | 1 |
| `apps/web/src/features/planning/components/planning-members.tsx` | **Modifié.** Perd sa machine à états, garde repère + squelette + `PlanningView`. | 1 |
| `apps/web/src/features/reports/components/reports-members.tsx` | **Modifié.** Idem, avec `ReportPanel`. | 2 |
| `apps/web/src/features/todos/services/get-todo-counts.ts` | **Créé.** Compteur de tâches non terminées par personne. | 3 |
| `apps/web/src/features/todos/schema.ts` | **Modifié.** Ajout de `todoLoadInput`. | 3 |
| `apps/web/src/features/todos/actions.ts` | **Modifié.** Ajout de `loadTodos`. | 3 |
| `apps/web/src/features/todos/types.ts` | **Modifié.** Ajout de `TodoEntry`. | 3 |
| `apps/web/src/features/todos/components/todos-view.tsx` | **Modifié.** `label` devient optionnel, ajout de `onChanged`. | 4 |
| `apps/web/src/features/todos/components/todo-dialog.tsx` | **Modifié.** Ajout de `onSaved`. | 4 |
| `apps/web/src/features/todos/components/todos-members.tsx` | **Créé.** La pile de la to-do. | 5 |
| `apps/web/src/features/todos/TodosTemplate.tsx` | **Modifié.** Pile ou vue à plat, calqué sur `PlanningTemplate`. | 5 |
| `apps/web/src/app/(dash)/chatter/planning/page.tsx` | **Modifié.** `TodoTab` construit les entrées ; le sélecteur devient un filtre sur les deux onglets. | 6 |

---

### Task 0 : Préparer la branche

- [ ] **Step 1 : Partir de `develop` à jour**

```bash
cd /Users/benoitgasnier/Documents/glagencyapp
git checkout develop
git pull --ff-only origin develop
git checkout -b feature/todos-pile
```

- [ ] **Step 2 : Vérifier le point de départ**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint
```

Attendu : 0 erreur. **Si ça échoue ici, arrêter** — la base est cassée avant toute modification, et on ne saurait plus attribuer les erreurs suivantes.

---

### Task 1 : Le hook partagé, prouvé par le planning

**Files:**
- Create: `apps/web/src/hooks/use-member-panel.ts`
- Modify: `apps/web/src/features/planning/components/planning-members.tsx`

**Interfaces:**
- Consumes: `ActionResult<T>` de `@/lib/actions`.
- Produces: `useMemberPanel<T>(load)` → `{ panel: MemberPanel<T> | null, open: (id: string) => void }` et le type `MemberPanel<T> = { id: string; loading: boolean; data?: T; error?: string }`. **`open` sert AUSSI de rechargement** : le rappeler sur la même personne relance la requête et invalide la précédente.

- [ ] **Step 1 : Créer le hook**

Pas de directive `'use client'` — le fichier n'est importé que par des composants client, et `hooks/use-mobile.tsx` établit déjà cette convention dans ce projet.

```ts
import { useRef, useState } from 'react'
import type { ActionResult } from '@/lib/actions'

/** Panneau ouvert : une seule ligne à la fois, donc un seul état à porter. */
export interface MemberPanel<T> {
  id: string
  loading: boolean
  data?: T
  error?: string
}

/**
 * Chargement à l'ouverture d'une ligne de `MembersAccordion`, partagé par le Planning, le
 * Dashboard et la To-do. Ces trois piles écrivaient la même machine à états — le jeton de
 * course en particulier, dont l'oubli est invisible en test manuel et se paie en données
 * périmées à l'écran.
 *
 * `open(id)` sert à l'OUVERTURE comme au RECHARGEMENT (après une mutation dans le panneau) :
 * c'est le même geste, relancer la requête pour cette personne.
 */
export function useMemberPanel<T>(
  load: (input: { profileId: string }) => Promise<ActionResult<T>>,
) {
  const [panel, setPanel] = useState<MemberPanel<T> | null>(null)
  const reqRef = useRef(0)

  const open = (id: string) => {
    // Jeton par REQUÊTE, pas par personne : deux appels sur la MÊME personne (rouvrir vite, ou
    // recharger après mutation pendant qu'un chargement vole encore) ne doivent pas laisser
    // gagner le plus ancien. Seule la dernière requête émise a le droit d'écrire.
    const token = ++reqRef.current
    setPanel({ id, loading: true })
    const settle = (next: MemberPanel<T>) =>
      setPanel((p) => (token !== reqRef.current ? p : next))

    void (async () => {
      try {
        const res = await load({ profileId: id })
        settle(
          res.success
            ? { id, loading: false, data: res.data }
            : { id, loading: false, error: res.error },
        )
      } catch {
        // Échec de TRANSPORT : `runAction` n'a pas pu renvoyer d'`ActionResult`. Sans ce
        // catch, la promesse rejette sans être captée et le panneau reste en squelette à vie.
        settle({ id, loading: false, error: 'Chargement impossible — vérifie ta connexion.' })
      }
    })()
  }

  return { panel, open }
}
```

- [ ] **Step 2 : Réécrire `planning-members.tsx` par-dessus**

Remplacer **tout** le contenu du fichier :

```tsx
'use client'

import { MembersAccordion } from '@/components/members-accordion'
import { Skeleton } from '@/components/ui/skeleton'
import { useMemberPanel } from '@/hooks/use-member-panel'
import { loadPlanning } from '../actions'
import { PlanningView } from './planning-view'
import type { PlanningData, PlanningEntry } from '../types'

/**
 * Branchement du planning sur la pile de noms partagée (`components/members-accordion.tsx`) :
 * un repère « Aucun planning » lisible sans déplier, et l'emploi du temps dans le panneau.
 * `nested` : le nom est déjà porté par la ligne qui ouvre le panneau, l'en-tête ne le répète
 * pas et descend d'un niveau de titre.
 *
 * Les blocs sont chargés À L'OUVERTURE — le premier rendu ne transporte que « qui a un
 * planning ». Et rechargés APRÈS CHAQUE MUTATION (`onChanged`) : `revalidatePath` ne repatche
 * que l'arbre serveur, le panneau vient d'une Server Action et resterait sur l'instantané
 * d'avant. C'est le défaut trouvé sur le Dashboard à l'audit du 2026-07-27.
 *
 * L'état, le jeton de course et l'erreur de transport vivent dans `useMemberPanel`.
 */
export function PlanningMembers({ entries }: { entries: PlanningEntry[] }) {
  const { panel, open } = useMemberPanel<PlanningData>(loadPlanning)

  return (
    <MembersAccordion
      items={entries}
      onOpen={(e) => open(e.id)}
      hint={(e) => (e.hasPlanning ? null : 'Aucun planning')}
    >
      {(e) => {
        const p = panel?.id === e.id ? panel : null
        if (!p || p.loading)
          return (
            <div role="status" className="flex flex-col gap-3">
              <span className="sr-only">Chargement…</span>
              <Skeleton aria-hidden="true" className="h-5 w-64" />
              <Skeleton aria-hidden="true" className="h-9 w-full max-w-lg" />
              <Skeleton aria-hidden="true" className="h-16 w-full rounded-xl" />
            </div>
          )
        if (p.error)
          return (
            <p role="alert" className="text-sm text-destructive">
              {p.error}
            </p>
          )
        if (!p.data) return null
        return (
          <PlanningView data={p.data} canEdit={e.canEdit} nested onChanged={() => open(e.id)} />
        )
      }}
    </MembersAccordion>
  )
}
```

- [ ] **Step 3 : Vérifier**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint
```

Attendu : 0 erreur. Le typecheck valide en particulier que `loadPlanning`, dont la signature est `(input: unknown) => Promise<ActionResult<PlanningData>>`, est bien acceptée par le paramètre `load` du hook (contravariance : `{ profileId: string }` est assignable à `unknown`).

- [ ] **Step 4 : Vérifier à la main**

```bash
pnpm --filter @glagency/web dev
```

Sur `/chatter/planning` : déplier un nom (le planning arrive), replier, déplier un autre, **rouvrir vite deux noms à la suite** (le panneau doit afficher celui du dernier ouvert, jamais celui du premier), puis modifier un bloc et vérifier que le panneau reflète la modification sans rechargement de page.

- [ ] **Step 5 : Commit**

```bash
git add apps/web/src/hooks/use-member-panel.ts apps/web/src/features/planning/components/planning-members.tsx
git commit -m "refactor(planning): extrait la machine à états du panneau dans useMemberPanel

Le jeton de course, l'état du panneau ouvert et le try/catch de transport
vivaient à l'identique dans planning-members et reports-members. Ils passent
dans hooks/use-member-panel.ts ; le planning n'en garde que son repère, son
squelette et PlanningView. Aucun changement de comportement.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 : Rebrancher le dashboard

**Files:**
- Modify: `apps/web/src/features/reports/components/reports-members.tsx`

**Interfaces:**
- Consumes: `useMemberPanel<Report[]>` (Task 1), `loadReports` de `../actions`, `ReportPanel` de `./report-panel`.
- Produces: rien de nouveau.

- [ ] **Step 1 : Réécrire le fichier**

Remplacer **tout** le contenu :

```tsx
'use client'

import { MembersAccordion } from '@/components/members-accordion'
import { Skeleton } from '@/components/ui/skeleton'
import { useMemberPanel } from '@/hooks/use-member-panel'
import { loadReports } from '../actions'
import { ReportPanel } from './report-panel'
import type { Report, ReportEntry } from '../types'

/**
 * Branchement du Dashboard sur la pile de noms partagée (`components/members-accordion.tsx`).
 * Le repère de droite répond SANS déplier à la question du dashboard — « qui n'a rien écrit
 * aujourd'hui ? » — sinon il faudrait ouvrir dix panneaux pour la poser. La liste ne contient
 * que l'encadrement : les chatteurs sont écartés en amont (`getReportMembers`).
 *
 * Le contenu est chargé à l'ouverture ET rechargé après un enregistrement (`onSaved`). Sans
 * ça, `revalidatePath` ne repatche que l'arbre serveur — le panneau resterait sur l'instantané
 * d'avant l'écriture, et re-sauvegarder écraserait le texte qu'on vient d'écrire (audit
 * 2026-07-27).
 *
 * L'état, le jeton de course et l'erreur de transport vivent dans `useMemberPanel`.
 */
export function ReportsMembers({ entries, today }: { entries: ReportEntry[]; today: string }) {
  const { panel, open } = useMemberPanel<Report[]>(loadReports)

  return (
    <MembersAccordion
      items={entries}
      onOpen={(e) => open(e.id)}
      hint={(e) => (e.days.includes(today) ? 'Compte rendu du jour' : "Rien aujourd'hui")}
    >
      {(e) => {
        const p = panel?.id === e.id ? panel : null
        if (!p || p.loading)
          return (
            <div role="status" className="flex flex-col gap-3">
              <span className="sr-only">Chargement…</span>
              <Skeleton aria-hidden="true" className="h-9 w-40" />
              <Skeleton aria-hidden="true" className="h-28 w-full rounded-xl" />
            </div>
          )
        if (p.error)
          return (
            <p role="alert" className="text-sm text-destructive">
              {p.error}
            </p>
          )
        return (
          <ReportPanel
            reports={p.data ?? []}
            today={today}
            canWrite={e.canWrite}
            idSuffix={e.id}
            nested
            onSaved={() => open(e.id)}
          />
        )
      }}
    </MembersAccordion>
  )
}
```

**Attention au renommage :** l'ancien fichier stockait les comptes rendus dans un champ `reports` du panneau ; le hook les expose sous `data`. Le `p.reports ?? []` d'origine devient `p.data ?? []`.

- [ ] **Step 2 : Vérifier**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint
```

Attendu : 0 erreur.

- [ ] **Step 3 : Vérifier à la main**

Sur `/chatter/dashboard` : déplier un nom, écrire un compte rendu, enregistrer, **changer de jour puis revenir** — le formulaire doit montrer le texte enregistré, pas l'ancien. C'est exactement la régression que `onSaved` empêche.

- [ ] **Step 4 : Commit**

```bash
git add apps/web/src/features/reports/components/reports-members.tsx
git commit -m "refactor(dashboard): reports-members passe sur useMemberPanel

Deuxième et dernière copie de la machine à états supprimée. Le champ de payload
du panneau passe de \`reports\` à \`data\` (nom du hook). Aucun changement de
comportement.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 : La couche données de la to-do

**Files:**
- Create: `apps/web/src/features/todos/services/get-todo-counts.ts`
- Modify: `apps/web/src/features/todos/types.ts`
- Modify: `apps/web/src/features/todos/schema.ts`
- Modify: `apps/web/src/features/todos/actions.ts`

**Interfaces:**
- Consumes: `fetchAll` de `@/lib/supabase/fetch-all`, `createClient` de `@/lib/supabase/server`, `getTodos` de `./get-todos`, `requireCanWriteTodo` et `noGuard` (internes à `actions.ts`).
- Produces:
  - `getTodoCounts(profileIds: string[]): Promise<Map<string, number>>` — une entrée par id demandé, même à 0.
  - `TodoEntry { id: string; name: string; role: string; openCount: number; hasPlanningPage: boolean }`
  - `loadTodos(raw: unknown): Promise<ActionResult<Todo[]>>`
  - `todoLoadInput` (schéma zod)

- [ ] **Step 1 : Créer le service d'agrégat**

`apps/web/src/features/todos/services/get-todo-counts.ts` :

```ts
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'

/** Ligne réduite au strict nécessaire du repère « N à traiter ». */
interface CountRow {
  profile_id: string
}

/**
 * Nombre de tâches NON TERMINÉES par personne, sans le contenu — c'est tout ce dont la ligne
 * repliée a besoin. Une entrée par id demandé, même à 0 (le repère affiche alors « Rien »).
 *
 * `fetchAll` : N personnes × leurs tâches peut dépasser la limite PostgREST de 1000 lignes,
 * qui tronque EN SILENCE (cf. docs/guidelines-data-loading.md). L'ordre porte sur
 * (profile_id, id) — déterministe, comme l'exige `fetchAll`.
 *
 * S'exécute sous RLS (`todos_select` → `can_write_todo_of`, 0067) : une personne dont la
 * to-do n'est pas lisible ne remonte aucune ligne et ressort à 0. Dégradation silencieuse
 * ASSUMÉE — le roster du planning est inclus dans le périmètre écrivable de la to-do pour
 * chaque rôle (cf. spec §6), donc le cas ne se produit pas. Si les deux périmètres divergent
 * un jour, le symptôme sera « tout le monde à Rien », pas une erreur.
 */
export async function getTodoCounts(profileIds: string[]): Promise<Map<string, number>> {
  const byProfile = new Map<string, number>(profileIds.map((id) => [id, 0]))
  if (!profileIds.length) return byProfile

  const supabase = await createClient()
  const { data, error } = await fetchAll<CountRow>((f, t) =>
    supabase
      .from('todos')
      .select('profile_id')
      .in('profile_id', profileIds)
      .neq('status', 'done')
      .order('profile_id')
      .order('id')
      .range(f, t),
  )
  if (error) throw new Error(error.message)

  for (const r of data) byProfile.set(r.profile_id, (byProfile.get(r.profile_id) ?? 0) + 1)
  return byProfile
}
```

- [ ] **Step 2 : Ajouter `TodoEntry` à `types.ts`**

À la suite de l'interface `Todo` :

```ts
/**
 * Une ligne de la pile de noms de la to-do. Porte le strict nécessaire à la ligne REPLIÉE ;
 * les tâches elles-mêmes partent à l'ouverture (`loadTodos`). Conforme structurellement à
 * `SelectableMember` (id, name, role), comme l'exige `MembersAccordion`.
 */
export interface TodoEntry {
  id: string
  name: string
  /** Rôle brut, pour le badge — '' = soi-même (pas de badge). */
  role: string
  /** Tâches non terminées (`todo` + `in_progress`) — repère « N à traiter » / « Rien ». */
  openCount: number
  /**
   * La personne peut-elle ouvrir la page Planning ? Sinon elle ne verra jamais la liste qu'on
   * lui écrit — l'avertissement est affiché dans SON panneau.
   */
  hasPlanningPage: boolean
}
```

- [ ] **Step 3 : Ajouter le schéma d'entrée**

Dans `apps/web/src/features/todos/schema.ts`, à la suite des schémas existants :

```ts
/** Entrée de `loadTodos` — chargement du panneau d'une personne dans la pile. */
export const todoLoadInput = z.object({ profileId: z.uuid() })
```

- [ ] **Step 4 : Ajouter la Server Action**

Dans `apps/web/src/features/todos/actions.ts` — ajouter `todoLoadInput` à l'import depuis `./schema`, ajouter les imports `getTodos` et le type `Todo`, puis l'action à la suite de `deleteTodo` :

```ts
/**
 * Contenu de la liste d'UNE personne, pour le panneau de la pile. Lecture seule : le droit est
 * vérifié en tête de handler comme partout dans ce fichier (`noGuard` + `requireCanWriteTodo`),
 * la RLS `todos_select` restant l'enforcement réel. Sur `todos`, lecture = écriture (0067).
 */
export async function loadTodos(raw: unknown): Promise<ActionResult<Todo[]>> {
  return runAction({
    schema: todoLoadInput,
    input: raw,
    guard: noGuard,
    handler: async ({ profileId }) => {
      const res = await requireCanWriteTodo(profileId)
      if ('error' in res) throw new BusinessError(res.error)
      return getTodos(profileId)
    },
  })
}
```

Imports à ajouter en tête de `actions.ts` :

```ts
import { getTodos } from './services/get-todos'
import type { Todo } from './types'
```

- [ ] **Step 5 : Vérifier**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint
```

Attendu : 0 erreur. Rien n'est encore visible à l'écran — cette tâche ne fait que poser la couche données.

- [ ] **Step 6 : Commit**

```bash
git add apps/web/src/features/todos/services/get-todo-counts.ts apps/web/src/features/todos/types.ts apps/web/src/features/todos/schema.ts apps/web/src/features/todos/actions.ts
git commit -m "feat(todos): couche données de la pile — compteurs et chargement à l'ouverture

getTodoCounts (fetchAll, ordre sur la PK complète) sert le repère de la ligne
repliée ; loadTodos sert le contenu du panneau. Droits inchangés : le contrôle
reste requireCanWriteTodo en tête de handler, la RLS 0067 est l'enforcement réel.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 : Ouvrir `TodosView` au mode pile

**Files:**
- Modify: `apps/web/src/features/todos/components/todos-view.tsx`
- Modify: `apps/web/src/features/todos/components/todo-dialog.tsx`

**Interfaces:**
- Produces : `TodosView` accepte désormais `label?: string` et `onChanged?: () => void` ; `TodoDialog` accepte `onSaved?: () => void`.

En mode pile, le contenu du panneau vient d'une Server Action, pas de l'arbre serveur : `revalidatePath` ne le rafraîchit pas. Chaque mutation réussie doit donc appeler `onChanged`. En mode à plat, `onChanged` est absent et le comportement actuel (`revalidatePath` + `useOptimistic`) est conservé à l'identique.

- [ ] **Step 1 : `TodoDialog` prévient son appelant**

Dans `todo-dialog.tsx`, ajouter `onSaved` à la signature :

```tsx
export function TodoDialog({
  profileId,
  todo,
  open,
  onOpenChange,
  onSaved,
}: {
  profileId: string
  todo: Todo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Mode pile : le panneau vient d'une Server Action, `revalidatePath` ne le rafraîchit pas. */
  onSaved?: () => void
}) {
```

Puis, à l'endroit où le succès ferme le dialog (actuellement `onOpenChange(false)` autour de la ligne 109), appeler le rappel juste avant :

```tsx
      onSaved?.()
      onOpenChange(false)
```

- [ ] **Step 2 : `TodosView` accepte le rappel et le libellé optionnel**

Modifier la signature :

```tsx
export function TodosView({
  todos,
  profileId,
  targetHasAccess,
  label,
  onChanged,
}: {
  todos: Todo[]
  /** Porteur de la liste — jamais le spectateur. */
  profileId: string
  targetHasAccess: boolean
  /**
   * Ligne d'en-tête (« Ma to-do » / « To-do de X »). ABSENT en mode pile : la ligne qui ouvre
   * le panneau porte déjà le nom, le répéter serait du bruit.
   */
  label?: string
  /**
   * Mode pile : recharge le panneau après chaque mutation. `revalidatePath` ne repatche que
   * l'arbre serveur, or le panneau vient d'une Server Action — sans ça il resterait sur
   * l'instantané d'avant (le défaut trouvé sur le Dashboard, audit 2026-07-27).
   */
  onChanged?: () => void
}) {
```

- [ ] **Step 3 : Appeler `onChanged` sur chaque chemin de mutation**

Dans `move()`, après la réponse (succès **comme** échec — un échec resynchronise) :

```tsx
      const res = await setTodoStatus({ id: todo.id, profileId, status })
      if (!res.success) {
        toast.error(res.error)
        router.refresh()
      }
      onChanged?.()
```

Dans `remove()`, sur les deux chemins :

```tsx
  const remove = async (todo: Todo) => {
    const res = await deleteTodo({ id: todo.id, profileId })
    if (res.success) {
      onChanged?.()
      return
    }
    router.refresh()
    onChanged?.()
    return res.error
  }
```

Dans `quickAdd()`, enchaîner sur le résultat sans changer le type de retour (`TodosList` attend `Promise<ActionResult>`) :

```tsx
  const quickAdd = async (title: string, status: TodoStatus) => {
    const res = await createTodo({
      profileId, title, description: null, type: null, priority: 2, release: null, status,
    })
    if (res.success) onChanged?.()
    return res
  }
```

- [ ] **Step 4 : Rendre le libellé conditionnel et brancher le dialog**

Dans le JSX, remplacer la ligne du libellé et l'appel au dialog :

```tsx
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
```

```tsx
      <TodoDialog
        profileId={profileId}
        todo={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={onChanged}
      />
```

- [ ] **Step 5 : Vérifier**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint
```

Attendu : 0 erreur.

- [ ] **Step 6 : Vérifier la non-régression à la main**

Sur `/chatter/planning?vue=todo` (encore en mode à plat à ce stade — `onChanged` est absent) : créer une tâche, la passer en « terminé », la supprimer. Tout doit se comporter **exactement** comme avant. Cette tâche ne change rien de visible ; elle ouvre seulement des points d'accroche.

- [ ] **Step 7 : Commit**

```bash
git add apps/web/src/features/todos/components/todos-view.tsx apps/web/src/features/todos/components/todo-dialog.tsx
git commit -m "feat(todos): TodosView accepte un rappel de rechargement et un libellé optionnel

Points d'accroche du mode pile : onChanged (appelé après chaque mutation réussie,
et après resynchronisation en cas d'échec) et label optionnel (la ligne de la pile
porte déjà le nom). Sans onChanged, comportement strictement identique.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5 : La pile de la to-do

**Files:**
- Create: `apps/web/src/features/todos/components/todos-members.tsx`
- Modify: `apps/web/src/features/todos/TodosTemplate.tsx`

**Interfaces:**
- Consumes: `useMemberPanel<Todo[]>` (Task 1), `loadTodos` et `TodoEntry` (Task 3), `TodosView` avec `onChanged` (Task 4).
- Produces: `TodosMembers({ entries: TodoEntry[] })` ; `TodosTemplate({ entries: TodoEntry[], todos: Todo[] | null, profileId: string })`.

- [ ] **Step 1 : Créer `todos-members.tsx`**

```tsx
'use client'

import { MembersAccordion } from '@/components/members-accordion'
import { Skeleton } from '@/components/ui/skeleton'
import { useMemberPanel } from '@/hooks/use-member-panel'
import { loadTodos } from '../actions'
import { TodosView } from './todos-view'
import type { Todo, TodoEntry } from '../types'

/**
 * Branchement de la to-do sur la pile de noms partagée (`components/members-accordion.tsx`),
 * comme le Planning et le Dashboard. Le repère répond SANS déplier à « qui a de la charge » ;
 * « Rien » couvre autant la liste vide que la liste entièrement terminée.
 *
 * « à traiter » et non « en cours » : « En cours » est déjà le libellé du statut
 * `in_progress` et une section de la liste — le même mot ne doit pas désigner deux ensembles.
 *
 * Les tâches partent à l'ouverture (`loadTodos`) et sont rechargées après chaque mutation
 * (`onChanged`) : le panneau vient d'une Server Action, `revalidatePath` ne le rafraîchit pas.
 */
export function TodosMembers({ entries }: { entries: TodoEntry[] }) {
  const { panel, open } = useMemberPanel<Todo[]>(loadTodos)

  return (
    <MembersAccordion
      items={entries}
      onOpen={(e) => open(e.id)}
      hint={(e) => (e.openCount > 0 ? `${e.openCount} à traiter` : 'Rien')}
    >
      {(e) => {
        const p = panel?.id === e.id ? panel : null
        if (!p || p.loading)
          return (
            <div role="status" className="flex flex-col gap-3">
              <span className="sr-only">Chargement…</span>
              <Skeleton aria-hidden="true" className="h-9 w-40" />
              <Skeleton aria-hidden="true" className="h-24 w-full rounded-xl" />
            </div>
          )
        if (p.error)
          return (
            <p role="alert" className="text-sm text-destructive">
              {p.error}
            </p>
          )
        if (!p.data) return null
        return (
          <TodosView
            todos={p.data}
            profileId={e.id}
            targetHasAccess={e.hasPlanningPage}
            onChanged={() => open(e.id)}
          />
        )
      }}
    </MembersAccordion>
  )
}
```

- [ ] **Step 2 : Réécrire `TodosTemplate.tsx`**

Remplacer **tout** le contenu, sur le modèle exact de `PlanningTemplate` :

```tsx
import { TodosMembers } from './components/todos-members'
import { TodosView } from './components/todos-view'
import type { Todo, TodoEntry } from './types'

/**
 * To-do personnelle — Server Component, aucun fetch (données en props). TOUS les noms
 * consultables sont posés sur la page, un par ligne, dépliables sur leur liste. Le sélecteur
 * `?membre=` reste au-dessus des onglets pour se restreindre à UNE personne : dans ce cas la
 * page ne passe qu'une entrée, avec sa liste DÉJÀ chargée (`todos`), affichée à plat sans
 * accordéon ni aller-retour. En pile, le contenu part à l'ouverture.
 *
 * Droits INCHANGÉS : chacun gère sa liste, la hiérarchie peut y déposer une tâche. La RLS
 * `can_write_todo_of` (0067) reste l'enforcement réel.
 */
export function TodosTemplate({
  entries,
  todos,
  profileId,
}: {
  entries: TodoEntry[]
  /** Liste de la personne affichée à plat — `null` en mode pile (chargée à l'ouverture). */
  todos: Todo[] | null
  /** Le SPECTATEUR — sert à distinguer « Ma to-do » de « To-do de X ». */
  profileId: string
}) {
  // Une seule personne (filtre `?membre=`, ou sous-manager qui n'a personne à consulter) :
  // pas d'accordéon à une seule ligne, sa liste directement.
  if (entries.length === 1 && todos) {
    const e = entries[0]
    return (
      <TodosView
        key={e.id}
        todos={todos}
        profileId={e.id}
        targetHasAccess={e.hasPlanningPage}
        label={e.id === profileId ? 'Ma to-do' : `To-do de ${e.name}`}
      />
    )
  }
  return <TodosMembers entries={entries} />
}
```

- [ ] **Step 3 : Vérifier**

```bash
pnpm --filter @glagency/web typecheck
```

Attendu : **échec** sur `app/(dash)/chatter/planning/page.tsx` — `TodosTemplate` ne reçoit plus les props qu'il attendait (`todos`, `targetName`, `isSelf`, `targetHasAccess`). C'est normal et voulu : la Task 6 recâble l'appelant. Ne rien corriger dans `page.tsx` à cette étape.

- [ ] **Step 4 : Ne pas committer seul**

Cette tâche laisse volontairement l'arbre non compilable. Elle est committée **avec la Task 6**, dont elle est indissociable.

---

### Task 6 : Câbler la page

**Files:**
- Modify: `apps/web/src/app/(dash)/chatter/planning/page.tsx`

**Interfaces:**
- Consumes: `getTodoCounts` (Task 3), `TodoEntry` (Task 3), `TodosTemplate` (Task 5), `applyFilter` de `@/lib/roster` (existant).

- [ ] **Step 1 : Ajouter les imports**

```ts
import { getTodoCounts } from '@/features/todos/services/get-todo-counts'
import type { TodoEntry } from '@/features/todos/types'
```

- [ ] **Step 2 : Le sélecteur devient un filtre sur les deux onglets**

Dans `PlanningContent`, remplacer le bloc de résolution de la cible. **Supprimer** `target`, `targetMember` et `targetName` (la to-do n'a plus de cible unique) :

```tsx
  // `?membre=` est un FILTRE sur les DEUX onglets depuis 2026-07-28 : absent = tout le monde
  // empilé, présent = cette personne seule, affichée à plat. Avant, la to-do s'en servait pour
  // désigner sa cible — les deux onglets se comportent désormais pareil.
  const filterId = resolveFilter(roster, membre)
  const shown = applyFilter(roster, filterId)
```

Remplacer la construction de `todoNode` :

```tsx
  const todoNode =
    vue === 'todo' ? (
      <Suspense fallback={<TodosSkeleton />}>
        <TodoTab members={shown} profileId={profileId} />
      </Suspense>
    ) : null
```

Et dans le JSX du sélecteur, `allowAll` et `value` deviennent identiques pour les deux onglets :

```tsx
          <MemberSelect members={roster} value={filterId} allowAll />
```

- [ ] **Step 3 : Réécrire `TodoTab`**

Remplacer entièrement la fonction, sur le modèle exact de `PlanningTab` :

```tsx
/**
 * Contenu de l'onglet To-do — même raison d'être que `PlanningTab`.
 *
 * Une seule personne à afficher → rendu à plat : on charge SA liste tout de suite, il n'y a pas
 * d'accordéon à déplier. Sinon on ne charge que les COMPTEURS (repère de la ligne repliée) ;
 * les tâches partent à l'ouverture (`loadTodos`). Sans ça, dérouler 19 noms embarquerait les
 * tâches des 19 dans le premier rendu.
 */
async function TodoTab({
  members,
  profileId,
}: {
  members: PlanningMember[]
  profileId: string
}) {
  const single = members.length === 1
  const [todos, counts] = await Promise.all([
    single ? getTodos(members[0].id) : Promise.resolve([]),
    single ? Promise.resolve(new Map<string, number>()) : getTodoCounts(members.map((m) => m.id)),
  ])
  const entries: TodoEntry[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    openCount: counts.get(m.id) ?? 0,
    hasPlanningPage: m.hasPlanningPage,
  }))
  return <TodosTemplate entries={entries} todos={single ? todos : null} profileId={profileId} />
}
```

- [ ] **Step 4 : Mettre à jour le commentaire d'en-tête du fichier**

Le bloc de documentation en tête de `PlanningPage` décrit l'ancienne asymétrie. Remplacer sa dernière phrase :

```
 * et le sélecteur `?membre=` reste COMMUN aux deux — et depuis 2026-07-28 il y joue le MÊME
 * rôle : un FILTRE sur une pile de noms dépliables (sans filtre, tout le monde est empilé ;
 * avec, la personne seule, à plat). Droits distincts en revanche : on n'édite pas SON planning
 * (sauf superadmin), mais on gère toujours SA to-do (spec 2026-07-20).
```

- [ ] **Step 5 : Vérifier**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint
```

Attendu : 0 erreur. Si `targetName` ou `isSelf` subsistent quelque part, le typecheck les signale — les supprimer.

- [ ] **Step 6 : Vérifier à la main**

```bash
pnpm --filter @glagency/web dev
```

Sur `/chatter/planning?vue=todo` :
1. Sans filtre : tous les noms sont empilés, **tous repliés**, soi en tête avec « (moi) ».
2. Le repère de chaque ligne affiche « N à traiter » ou « Rien ».
3. Déplier une ligne : la liste arrive. Créer une tâche → **le panneau la montre sans rechargement de page**. La passer en « terminé », la supprimer : idem.
4. Refermer, rouvrir : la liste est à jour.
5. Choisir quelqu'un dans le sélecteur : sa liste s'affiche **à plat**, avec l'en-tête « To-do de X » ; se choisir soi-même donne « Ma to-do ».
6. Revenir à « Tous les membres » : la pile revient, et **les compteurs reflètent les mutations** faites à l'étape 3.

- [ ] **Step 7 : Commit (Tasks 5 et 6 ensemble)**

```bash
git add apps/web/src/features/todos/components/todos-members.tsx apps/web/src/features/todos/TodosTemplate.tsx "apps/web/src/app/(dash)/chatter/planning/page.tsx"
git commit -m "feat(todos): pile de noms dépliables, comme le planning journalier

Tous les noms consultables sont empilés, un par ligne, dépliables sur leur liste ;
repère « N à traiter » / « Rien » lisible sans déplier. Le sélecteur ?membre=
devient un FILTRE sur la to-do aussi (il désignait la cible) : les deux onglets de
la page se comportent enfin pareil. Droits inchangés, aucune migration.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7 : Vérification complète

**Files:** aucun (porte de sortie).

- [ ] **Step 1 : Le build complet**

```bash
pnpm --filter @glagency/web build
```

Attendu : succès. C'est la **seule** commande qui attrape les erreurs de prerender de Next 16 (`cacheComponents`/PPR) — ni `typecheck` ni `lint` ne les voient. Ce plan ne touche aucune page racine prérendue, mais la règle du projet est de ne jamais pousser sans elle.

- [ ] **Step 2 : Repasser les TROIS piles**

La refacto touche deux composants livrés en production le 2026-07-27, et **il n'existe aucun test automatique**. Rejouer à la main, sur le serveur de dev :

| Page | Geste | Attendu |
|---|---|---|
| `/chatter/planning` | Déplier, modifier un bloc | Le panneau reflète la modification |
| `/chatter/planning` | Ouvrir vite deux noms à la suite | Le panneau montre le **dernier** ouvert |
| `/chatter/dashboard` | Écrire un compte rendu, changer de jour, revenir | Le texte enregistré, pas l'ancien |
| `/chatter/planning?vue=todo` | Créer / terminer / supprimer une tâche | Le panneau se met à jour, le compteur suit |

- [ ] **Step 3 : Pousser la branche**

```bash
git push -u origin feature/todos-pile
```

- [ ] **Step 4 : Demander à Benoit avant d'aller plus loin**

**Ne pas ouvrir de PR ni merger sans son accord** (règle projet : pas de commit ni de livraison automatique). Lui signaler que la branche est poussée, que les trois piles ont été repassées, et lui laisser décider du passage sur `develop` → préprod UAT.

---

## Notes d'exécution

**Ordre imposé.** Les tâches 1 → 2 → 3 → 4 → 5+6 → 7 se suivent. Les tâches 5 et 6 sont **indissociables** : la 5 laisse volontairement l'arbre non compilable, la 6 le referme, et elles partagent un seul commit.

**Ce qui n'est pas dans ce plan, volontairement :**
- le kanban et le champ `release` restent en pause (blocs commentés, colonne conservée en base) ;
- aucune modification du contenu du panneau (`TodosList`, `todo-row`, `todo-quick-add`) ;
- aucune migration, aucune RLS, aucune garde.

**Si le typecheck échoue sur la contravariance du hook** (`loadX` typée `(input: unknown) => …` refusée par `load`), ne pas élargir le type du hook à `unknown` : ce serait perdre la vérification du nom de champ côté appelant. Vérifier d'abord que l'action retourne bien `Promise<ActionResult<T>>` et non `Promise<ActionResult>`.
