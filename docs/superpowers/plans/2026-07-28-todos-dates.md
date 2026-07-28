# To-do — dates de vie et transitions verrouillées : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher la vie d'une tâche sur sa ligne — date d'ajout en « À faire », « depuis N j » en « En cours », « début → fin · N j » en « Terminé » — et verrouiller les transitions en sens unique (anti-reset du chrono).

**Architecture:** Une colonne `started_at` posée exclusivement par le trigger `todos_touch` (étendu par la migration 0086, qui interdit aussi le retour en « À faire » par exception). Le calcul des jours vit dans `packages/core` (testé, Europe/Paris) ; l'affichage est une fonction pure `todoDateMeta` branchée dans `todo-row`. L'ajout rapide se replie sur la seule section « À faire ».

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (Postgres + trigger plpgsql), Vitest (packages/core uniquement).

**Spec:** `docs/superpowers/specs/2026-07-28-todos-dates-design.md`

## Global Constraints

- **`packages/core` = TDD obligatoire** (Vitest est en place, 119 tests verts) : test rouge → implémentation → vert. **`apps/web` = aucun test** (ni script ni config — fait du projet, pas un oubli) : porte de sortie `typecheck` + `lint` (4 warnings préexistants attendus : data-table.tsx ×2, ComptaTemplate.tsx, TeamsTemplate.tsx), `build` en fin de branche.
- **Le client n'écrit jamais une date de vie** (`created_at`, `started_at`, `done_at`) : le trigger recalcule tout. Aucun de ces champs n'entre dans `schema.ts`.
- **Chrono = temps en « En cours » uniquement.** `started_at` est **monotone** : posé à la première entrée en « En cours », jamais effacé ni réécrit.
- **Transitions interdites : `in_progress → todo` et `done → todo`** — trois couches (menu UI, `BusinessError` française, exception trigger). Message exact : `Une tâche commencée ne revient pas dans « À faire ».`
- **Rien n'est retiré de l'affichage** : l'auteur reste sur la ligne, l'œil (`todo-peek`) est inchangé.
- **Les commentaires sont du contenu** : deux commentaires existants deviennent FAUX avec ce chantier (la justification de l'ajout rapide par section dans `todos-list.tsx`, l'en-tête de `todo-quick-add.tsx`) — les réécrire fait partie du travail, pas du nettoyage optionnel.
- **Base de données : UAT UNIQUEMENT dans ce plan.** La prod se fera à la release, avec `--dry-run` d'abord et coordination compta (si `0085_compta_paie` est pendante en prod, `db push` l'embarquerait). Garde-fou : l'URL prod contient `cqmfpsnqaxymswijdnfz` — toute URL utilisée ici doit ne PAS le contenir.
- Kanban et `release` restent en pause. Pas de commit vers `main`, pas de merge sans l'accord de Benoit.

## File Structure

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `packages/core/src/domain/dates.ts` + `dates.test.ts` | **Modifiés.** `frDayMonthParis`, `daysBetweenParis` — le seul calcul, testé | 1 |
| `packages/core/src/index.ts` | **Modifié.** Export des deux helpers | 1 |
| `packages/db/supabase/migrations/0086_todos_started_at.sql` | **Créé.** Colonne + trigger étendu + interdiction | 2 |
| `packages/db/src/types.ts` | **Modifié.** `started_at` dans Row/Insert/Update de `todos` | 2 |
| `apps/web/src/features/todos/actions.ts` | **Modifié.** Garde de transition dans `setTodoStatus` | 3 |
| `apps/web/src/features/todos/types.ts` | **Modifié.** `Todo.startedAt` + `todoDateMeta` | 4 |
| `apps/web/src/features/todos/services/get-todos.ts` | **Modifié.** Sélection de `started_at` | 4 |
| `apps/web/src/features/todos/components/todo-row.tsx` | **Modifié.** Méta de date + filtre du menu de statut | 4 |
| `apps/web/src/features/todos/components/todo-quick-add.tsx` | **Modifié.** Perd la prop `status` | 4 |
| `apps/web/src/features/todos/components/todos-list.tsx` | **Modifié.** Ajout rapide en « À faire » seul + état vide | 4 |
| `apps/web/src/features/todos/components/todos-view.tsx` | **Modifié.** `quickAdd` sans statut + optimiste `startedAt` + note kanban | 4 |

---

### Task 0 : Préparer la branche

- [ ] **Step 1 : Partir de `develop` à jour**

```bash
cd /Users/benoitgasnier/Documents/glagencyapp
git checkout develop && git pull --ff-only origin develop
git checkout -b feature/todos-dates
```

- [ ] **Step 2 : Vérifier le point de départ**

```bash
pnpm --filter @glagency/core test 2>&1 | tail -3
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint
```

Attendu : core vert, typecheck 0 erreur, lint 0 erreur (4 warnings préexistants). **Si ça échoue ici, arrêter.**

---

### Task 1 : Les helpers de dates dans core (TDD)

**Files:**
- Modify: `packages/core/src/domain/dates.ts`
- Modify: `packages/core/src/domain/dates.test.ts`
- Modify: `packages/core/src/index.ts` (bloc d'export `./domain/dates`, ~ligne 47)

**Interfaces:**
- Consumes: `todayParis(now?: Date): string` (existant, même fichier — l'astuce `en-CA` + `Europe/Paris`).
- Produces: `frDayMonthParis(iso: string): string` (« 12/07 ») et `daysBetweenParis(fromIso: string, toIso: string): number` (jours calendaires Paris, 0 = même jour, négatif si inversé) — consommés par la Task 4 via `import { … } from '@glagency/core'`.

- [ ] **Step 1 : Écrire les tests (rouges)**

À la suite des `describe` existants de `dates.test.ts` (ajouter `daysBetweenParis, frDayMonthParis` à l'import depuis `./dates`) :

```ts
describe('frDayMonthParis', () => {
  it('affiche jour/mois du jour PARIS, pas UTC (été : 22:30Z le 11/07 = 12/07 à Paris)', () => {
    expect(frDayMonthParis('2026-07-11T22:30:00Z')).toBe('12/07')
  })
  it('reste sur le même jour quand minuit Paris n’est pas franchi', () => {
    expect(frDayMonthParis('2026-07-11T14:00:00Z')).toBe('11/07')
  })
})

describe('daysBetweenParis', () => {
  it('0 le même jour Paris, quel que soit l’écart en heures', () => {
    expect(daysBetweenParis('2026-07-15T06:00:00Z', '2026-07-15T20:00:00Z')).toBe(0)
  })
  it('1 dès que minuit Paris est franchi, même à 90 minutes d’écart', () => {
    // 21:00Z = 23:00 Paris ; 22:30Z = 00:30 Paris le lendemain (été, UTC+2)
    expect(daysBetweenParis('2026-07-11T21:00:00Z', '2026-07-11T22:30:00Z')).toBe(1)
  })
  it('compte des jours CALENDAIRES, pas des blocs de 24 h', () => {
    // 13/07 01:00 Paris → 15/07 07:00 Paris = 2 jours calendaires (54 h)
    expect(daysBetweenParis('2026-07-12T23:00:00Z', '2026-07-15T05:00:00Z')).toBe(2)
  })
  it('traverse le passage à l’heure d’été sans dériver (29/03/2026)', () => {
    expect(daysBetweenParis('2026-03-28T12:00:00Z', '2026-03-30T12:00:00Z')).toBe(2)
  })
  it('négatif si l’ordre est inversé', () => {
    expect(daysBetweenParis('2026-07-15T06:00:00Z', '2026-07-14T06:00:00Z')).toBe(-1)
  })
})
```

- [ ] **Step 2 : Vérifier qu'ils échouent**

Run: `pnpm --filter @glagency/core test 2>&1 | tail -8`
Attendu : FAIL — `frDayMonthParis is not a function` (ou import inexistant).

- [ ] **Step 3 : Implémenter dans `dates.ts`**

À la suite de `frDateTimeParis` (~ligne 92) :

```ts
/** « 12/07 » — jour/mois courts fr d'un timestamptz, fuseau Europe/Paris (même piège de TZ
 *  serveur que `frDateTimeParis` : jamais la TZ de Vercel). */
export const frDayMonthParis = (iso: string): string =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Europe/Paris',
  })

/**
 * Jours CALENDAIRES Europe/Paris entre deux instants — 0 = même jour Paris, négatif si `to`
 * précède `from`. PAS des blocs de 24 h : à minuit Paris le compteur avance, quel que soit
 * l'écart en heures. Réutilise `todayParis` (en-CA → YYYY-MM-DD) pour projeter chaque
 * instant sur son jour Paris.
 */
export function daysBetweenParis(fromIso: string, toIso: string): number {
  const day = (iso: string): string => todayParis(new Date(iso))
  return Math.round(
    (Date.parse(`${day(toIso)}T00:00:00Z`) - Date.parse(`${day(fromIso)}T00:00:00Z`)) / 86_400_000,
  )
}
```

Puis ajouter `daysBetweenParis` et `frDayMonthParis` à la liste d'export de `packages/core/src/index.ts` (bloc `} from './domain/dates'`), en ordre alphabétique comme le reste du bloc.

- [ ] **Step 4 : Vérifier que tout passe**

Run: `pnpm --filter @glagency/core test 2>&1 | tail -4`
Attendu : PASS, 126 tests (119 + 7).

- [ ] **Step 5 : Commit**

```bash
git add packages/core/src/domain/dates.ts packages/core/src/domain/dates.test.ts packages/core/src/index.ts
git commit -m "feat(core): frDayMonthParis + daysBetweenParis — jours calendaires Europe/Paris

Le chrono de la to-do compte des jours calendaires Paris, pas des blocs de
24 h : autour de minuit, jour Paris ≠ jour UTC (même piège que todayParis,
dont l'astuce en-CA est réutilisée). Testé : minuit franchi à 90 min d'écart,
54 h = 2 jours, passage à l'heure d'été, ordre inversé.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2 : Migration 0086 — colonne, trigger, interdiction (UAT)

**Files:**
- Create: `packages/db/supabase/migrations/0086_todos_started_at.sql`
- Modify: `packages/db/src/types.ts` (bloc `todos`, ~lignes 2248-2295)

**Interfaces:**
- Produces: colonne `todos.started_at timestamptz` (nullable) ; trigger qui refuse `* → 'todo'` avec le message français exact.

- [ ] **Step 1 : Écrire la migration**

`0086_todos_started_at.sql` — remplace intégralement `todos_touch`. **Le corps en place vient de `0069`** (0067 modifiée par 0068 — épinglage propriétaire/auteur — puis 0069 — `updated_by`) ; seules les parties commentées « NOUVEAU » changent, tout le reste est conservé à l'identique — vérifié contre `pg_get_functiondef` sur l'UAT :

```sql
-- 0086 — To-do : date de début (started_at) + transitions à sens unique.
--
-- Le chrono d'une tâche = son temps en « En cours » (spec 2026-07-28-todos-dates-design) :
-- started_at est posé par le trigger à la PREMIÈRE entrée en « En cours », puis MONOTONE —
-- jamais effacé ni réécrit ; rouvrir une tâche terminée reprend le chrono d'origine.
-- « À faire » = la tâche est juste posée là : created_at suffit, aucun chrono.
--
-- Anti-triche : une tâche sortie de « À faire » n'y revient JAMAIS (revenir remettrait le
-- chrono à zéro) — l'interdiction couvre aussi « Terminé → À faire », sinon le détour par
-- Terminé rouvrirait la triche. Enforcement DUR ici même (exception) : un correctif manuel
-- légitime devra désactiver le trigger le temps du fix :
--   alter table public.todos disable trigger todos_touch_trg;
--   -- … correction …
--   alter table public.todos enable trigger todos_touch_trg;

alter table public.todos add column started_at timestamptz;

create or replace function public.todos_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' then
    -- Épinglés : jamais réécrivables, y compris par un admin/manager que la RLS autorise à
    -- éditer la tâche (le droit d'ÉDITER le contenu n'est pas le droit de reparenter/réattribuer).
    new.created_at := old.created_at;
    new.profile_id := old.profile_id;
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    -- NOUVEAU — sens unique : sortie de « À faire » définitive (0086).
    if old.status <> 'todo' and new.status = 'todo' then
      raise exception 'Une tâche commencée ne revient pas dans « À faire ».';
    end if;
  end if;
  -- NOUVEAU (0086) — started_at : première entrée en « En cours », monotone ensuite. Jamais
  -- fourni par le client (recalculé ici, comme done_at). La branche INSERT est défensive :
  -- l'UI ne crée qu'en « À faire », mais une insertion SQL directe reste cohérente.
  new.started_at := coalesce(
    case when tg_op = 'UPDATE' then old.started_at end,
    case when new.status = 'in_progress' then now() end
  );
  new.done_at := case
    when new.status = 'done'
      then coalesce(
        case when tg_op = 'UPDATE' then old.done_at end,
        new.done_at,
        now()
      )
    else null
  end;
  return new;
end;
$$;
```

- [ ] **Step 2 : Appliquer sur l'UAT — jamais la prod ici**

```bash
cd /Users/benoitgasnier/Documents/glagencyapp
UAT=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
echo "$UAT" | grep -q cqmfpsnqaxymswijdnfz && { echo "!!! URL PROD DETECTEE — STOP"; exit 1; }
cd packages/db && supabase db push --db-url "$UAT" --dry-run
```

Attendu : le dry-run liste `0086_todos_started_at.sql` (et rien d'autre, sauf si l'UAT a du retard — dans ce cas le signaler dans le rapport avant de pousser). Puis :

```bash
supabase db push --db-url "$UAT"
```

- [ ] **Step 3 : Tester la matrice des transitions sur l'UAT**

`psql "$UAT"` (connexion directe : la RLS ne s'applique pas au rôle admin, **les triggers si** — c'est exactement ce qu'on teste). Remplacer `<PROFILE_ID>` par un id encadrant réel (`select id from profiles where role in ('admin','manager') limit 1;`) :

```sql
insert into todos (profile_id, title) values ('<PROFILE_ID>', 'test-0086')
  returning status, started_at, done_at;            -- todo, null, null
update todos set status='in_progress' where title='test-0086'
  returning started_at;                             -- posé (now)
update todos set status='todo' where title='test-0086';
  -- DOIT ÉCHOUER : « Une tâche commencée ne revient pas dans « À faire ». »
update todos set status='done' where title='test-0086'
  returning started_at, done_at;                    -- started_at INCHANGÉ, done_at posé
update todos set status='in_progress' where title='test-0086'
  returning started_at, done_at;                    -- started_at INCHANGÉ, done_at null
update todos set status='todo' where title='test-0086';
  -- DOIT ÉCHOUER (depuis « en cours » après réouverture)
insert into todos (profile_id, title, status) values ('<PROFILE_ID>', 'test-0086b', 'in_progress')
  returning started_at;                             -- posé dès l'insert (branche défensive)
delete from todos where title in ('test-0086', 'test-0086b');
```

Consigner les 8 résultats dans le rapport. Un seul écart = STOP, corriger la migration
(`db push` a déjà enregistré 0086 : corriger via une 0087, ne jamais réécrire une migration
appliquée).

- [ ] **Step 4 : Mettre à jour `packages/db/src/types.ts`**

Dans le bloc `todos` : ajouter `started_at: string | null` au `Row`, entre `release` et `status` (le bloc est trié alphabétiquement), et `started_at?: string | null` aux blocs `Insert` et `Update` à la même place.

- [ ] **Step 5 : Vérifier et committer**

```bash
pnpm --filter @glagency/web typecheck
git add packages/db/supabase/migrations/0086_todos_started_at.sql packages/db/src/types.ts
git commit -m "feat(db): todos.started_at + transitions à sens unique [0086]

started_at posé par todos_touch à la première entrée en « En cours », monotone
(rouvrir reprend le chrono d'origine). Retour en « À faire » interdit par
exception — depuis « En cours » comme depuis « Terminé » (le détour rouvrirait
le reset du chrono). Appliquée et testée sur l'UAT (matrice des 8 cas).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3 : La garde de transition dans `setTodoStatus`

**Files:**
- Modify: `apps/web/src/features/todos/actions.ts` (fonction `setTodoStatus`)

**Interfaces:**
- Consumes: `BusinessError`, `requireCanWriteTodo`, `createClient` (existants dans le fichier).
- Produces: rien de nouveau — même signature, refus métier en plus.

- [ ] **Step 1 : Ajouter la lecture + le refus avant l'update**

Dans le handler de `setTodoStatus`, après `requireCanWriteTodo` et avant l'`update` existant :

```ts
      // Sens unique (spec 2026-07-28-todos-dates) : une tâche sortie de « À faire » n'y
      // revient jamais — revenir remettrait le chrono à zéro. Lecture préalable pour un
      // message métier propre ; la fenêtre lecture→écriture est couverte par le trigger
      // 0086, qui lève sur la même transition (enforcement réel — ici on ne fait que
      // choisir le message).
      if (values.status === 'todo') {
        const { data: current, error: readError } = await supabase
          .from('todos')
          .select('status')
          .eq('id', values.id)
          .eq('profile_id', values.profileId)
          .maybeSingle()
        if (readError) throw new Error(readError.message)
        if (!current) throw new BusinessError('Cette tâche n’existe plus ou n’a pas pu être modifiée.')
        if (current.status !== 'todo') {
          throw new BusinessError('Une tâche commencée ne revient pas dans « À faire ».')
        }
      }
```

Note : la lecture n'a lieu que si la cible est `'todo'` — les passages vers « En cours »/« Terminé » ne paient pas d'aller-retour supplémentaire. Le commentaire existant du handler (« done_at et updated_at sont posés par le trigger ») reste vrai ; le compléter : `started_at` aussi (0086).

- [ ] **Step 2 : Vérifier**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint
```

Attendu : 0 erreur.

- [ ] **Step 3 : Commit**

```bash
git add apps/web/src/features/todos/actions.ts
git commit -m "feat(todos): setTodoStatus refuse le retour en « À faire »

Message métier français ; l'enforcement réel est le trigger 0086 (la fenêtre
lecture→écriture lui revient). Lecture préalable seulement quand la cible est
« À faire » — les transitions permises ne paient rien.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4 : Affichage, menu, ajout rapide, optimiste

**Files:**
- Modify: `apps/web/src/features/todos/types.ts`
- Modify: `apps/web/src/features/todos/services/get-todos.ts`
- Modify: `apps/web/src/features/todos/components/todo-row.tsx`
- Modify: `apps/web/src/features/todos/components/todo-quick-add.tsx`
- Modify: `apps/web/src/features/todos/components/todos-list.tsx`
- Modify: `apps/web/src/features/todos/components/todos-view.tsx`

**Interfaces:**
- Consumes: `frDayMonthParis`, `daysBetweenParis` de `@glagency/core` (Task 1) ; `Todo.startedAt` s'appuie sur la colonne de la Task 2.
- Produces: `Todo.startedAt: string | null` ; `todoDateMeta(t: Todo): string | null` ; `TodoQuickAdd({ onQuickAdd }: { onQuickAdd: (title: string) => Promise<ActionResult> })` ; `TodosList.onQuickAdd: (title: string) => Promise<ActionResult>`.

- [ ] **Step 1 : `types.ts` — le champ et la méta**

Dans l'interface `Todo`, après `createdAt: string` :

```ts
  /** Première entrée en « En cours » — posé par le trigger (0086), monotone. */
  startedAt: string | null
```

En tête de fichier, ajouter l'import :

```ts
import { daysBetweenParis, frDayMonthParis } from '@glagency/core'
```

À la suite de `groupByStatus` :

```ts
/**
 * Méta de date d'une ligne, selon sa section (spec 2026-07-28-todos-dates). Le chrono compte
 * UNIQUEMENT le temps en « En cours » (jours calendaires Paris) — l'attente en « À faire »
 * n'entre jamais dans le compte. `null` = rien à afficher (tâches d'avant la migration 0086,
 * ou finies sans être passées par « En cours » : elles n'ont jamais eu de chrono).
 */
export function todoDateMeta(t: Todo): string | null {
  switch (t.status) {
    case 'todo':
      return `ajouté le ${frDayMonthParis(t.createdAt)}`
    case 'in_progress': {
      if (!t.startedAt) return null
      const days = daysBetweenParis(t.startedAt, new Date().toISOString())
      return days <= 0 ? 'depuis aujourd’hui' : `depuis ${days} j`
    }
    case 'done': {
      if (!t.doneAt) return null
      if (!t.startedAt) return `fini le ${frDayMonthParis(t.doneAt)}`
      const days = daysBetweenParis(t.startedAt, t.doneAt)
      return `${frDayMonthParis(t.startedAt)} → ${frDayMonthParis(t.doneAt)} · ${days} j`
    }
  }
}
```

- [ ] **Step 2 : `get-todos.ts` — sélectionner la colonne**

Dans le `select(...)`, ajouter `started_at` après `release` ; dans le mapping, après `createdAt` :

```ts
    startedAt: t.started_at,
```

- [ ] **Step 3 : `todo-row.tsx` — méta + menu filtré**

Ajouter `todoDateMeta` à l'import depuis `../types`. En tête du composant, après `PriorityIcon` :

```ts
  const dateMeta = todoDateMeta(todo)
```

Dans la zone méta (le `div` `text-muted-foreground`), juste AVANT `{todo.createdByName && …}` :

```tsx
        {/* Vie de la tâche selon sa section — « ajouté le », « depuis N j », « début → fin ».
            Jours calendaires PARIS (core), jamais des blocs de 24 h. */}
        {dateMeta && <span className="whitespace-nowrap">{dateMeta}</span>}
```

Dans le `DropdownMenuRadioGroup`, remplacer `{STATUSES.map((s) => (` par :

```tsx
              {/* Sens unique (0086) : sortie de « À faire » définitive — l'option disparaît
                  du menu. L'action et le trigger refusent de toute façon ; ceci n'est que
                  l'optimiste UI. */}
              {STATUSES.filter((s) => s.value !== 'todo' || todo.status === 'todo').map((s) => (
```

- [ ] **Step 4 : `todo-quick-add.tsx` — perd la prop `status`**

Remplacer l'en-tête de doc et la signature :

```tsx
/**
 * Ajout rapide — dans la SEULE section « À faire » depuis la spec 2026-07-28-todos-dates :
 * une tâche naît toujours en « À faire » (le chrono ne démarre qu'au passage en « En cours »,
 * et une création directe ailleurs le fausserait). Un champ, un titre, Entrée. `onQuickAdd`
 * appelle `createTodo` côté `TodosView` : ce composant n'appelle lui-même aucune Server Action.
 */
export function TodoQuickAdd({
  onQuickAdd,
}: {
  onQuickAdd: (title: string) => Promise<ActionResult>
}) {
```

Dans `submit()` : `onQuickAdd(title)` (sans `status`). L'`aria-label` devient la constante
`"Créer une tâche — À faire"` (plus qu'un seul champ sur la page, mais le libellé reste
explicite). Retirer les imports devenus inutiles (`statusLabel`, `TodoStatus`).

- [ ] **Step 5 : `todos-list.tsx` — ajout rapide en « À faire » seul + état vide**

Remplacer le bloc quick-add (et son commentaire, désormais faux) par :

```tsx
            {/* « + Créer » dans la SEULE section « À faire » (spec 2026-07-28-todos-dates,
                remplace le « point 5 » de la spec 2026-07-20) : une tâche naît toujours en
                « À faire », le chrono ne démarre qu'au passage en « En cours ». Les autres
                sections gardent un état vide explicite — le quick-add en tenait lieu. */}
            {s.value === 'todo' ? (
              <TodoQuickAdd onQuickAdd={onQuickAdd} />
            ) : (
              columns[s.value].length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">Rien ici</p>
              )
            )}
```

Mettre à jour le type de la prop : `onQuickAdd: (title: string) => Promise<ActionResult>`.

- [ ] **Step 6 : `todos-view.tsx` — `quickAdd` et l'optimiste**

`quickAdd` ne prend plus de statut (mettre à jour son commentaire : le statut n'est plus
porté par la section — création toujours « À faire ») :

```ts
  const quickAdd = async (title: string) => {
    const res = await createTodo({
      profileId, title, description: null, type: null, priority: 2, release: null, status: 'todo',
    })
    if (res.success) await onChanged?.()
    return res
  }
```

Dans le réducteur `useOptimistic`, ajouter après `doneAt` :

```ts
              // Miroir du trigger 0086 : posé à la première entrée en « En cours »,
              // monotone ensuite — jamais effacé (le retour en « À faire » n'existe plus).
              startedAt:
                move.status === 'in_progress' && !t.startedAt
                  ? new Date().toISOString()
                  : t.startedAt,
```

Dans le bloc commenté « KANBAN EN PAUSE » (2026-07-20), ajouter une ligne :

```
    ⚠️ À la réactivation : filtrer les cibles de drag selon la matrice de transitions
    (spec 2026-07-28-todos-dates) — plus de retour en « À faire ».
```

- [ ] **Step 7 : Vérifier**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint
```

Attendu : 0 erreur, 4 warnings préexistants.

- [ ] **Step 8 : Commit**

```bash
git add apps/web/src/features/todos
git commit -m "feat(todos): dates de vie sur les lignes + création en « À faire » seul

« ajouté le 12/07 » / « depuis 3 j » / « 12/07 → 15/07 · 3 j » selon la section —
jours calendaires Paris (helpers core testés). Le menu de statut n'offre plus le
retour en « À faire », l'ajout rapide ne vit plus que dans « À faire » (les autres
sections gagnent un état vide), l'optimiste pose startedAt en miroir du trigger.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5 : Vérification complète

**Files:** aucun (porte de sortie).

- [ ] **Step 1 : Build complet**

```bash
pnpm --filter @glagency/web build
```

Attendu : succès (seule commande qui attrape les erreurs de prerender Next 16).

- [ ] **Step 2 : Passe navigateur sur le dev local ou la préprod (UAT déjà migrée en Task 2)**

| Geste | Attendu |
|---|---|
| Créer une tâche (ajout rapide, dialog) | naît en « À faire », méta `ajouté le <aujourd'hui>` |
| Sections « En cours »/« Terminé » | plus d'ajout rapide ; « Rien ici » si vides |
| Passer en « En cours » | méta `depuis aujourd'hui` **immédiatement** (optimiste), stable après le settle |
| Ouvrir le menu d'une tâche en cours / terminée | « À faire » absent des choix |
| Terminer | `<début> → <fin> · 0 j` (même jour) |
| Rouvrir depuis « Terminé » | revient en « En cours », `depuis N j` compté depuis le début D'ORIGINE |
| Tâche d'avant la migration en « En cours » | aucune méta (pas de chrono inventé) |

- [ ] **Step 3 : Pousser la branche et s'arrêter**

```bash
git push -u origin feature/todos-dates
```

**Ne pas merger, ne pas ouvrir de PR** sans l'accord de Benoit. Lui rappeler au rapport final :
la prod n'a PAS la migration 0086 — elle se fera à la release (`--dry-run` d'abord ;
coordination compta si `0085` y est pendante).

---

## Notes d'exécution

- Ordre imposé : 0 → 1 → 2 → 3 → 4 → 5. La Task 4 ne compile pas sans la Task 2 (types DB) ni la Task 1 (helpers).
- La passe navigateur locale utilise la base UAT (`.env` → `_UAT`) : la migration y est déjà (Task 2).
- Hors périmètre (ne pas toucher) : `todo-peek`, `todo-dialog`, `updateTodo`, RLS, kanban/release en pause, backfill.
