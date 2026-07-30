# Badge « Nouveau » sur un chatteur — plan d'implémentation

> **Pour l'exécutant :** spec de référence —
> `docs/superpowers/specs/2026-07-30-badge-nouveau-chatteur-design.md`. Les étapes sont des
> cases à cocher (`- [ ]`), une par action.

**Goal :** marquer à la main un chatteur comme nouvel arrivant (avec sa date d'arrivée), afficher
un badge partout où il apparaît, et réclamer le décochage au-delà de 30 jours.

**Architecture :** deux colonnes sur `profiles` (`is_new`, `arrived_at`) saisies dans le dialog
Membres ; une règle de seuil pure dans `@glagency/core` ; une brique d'affichage unique
`components/new-badge.tsx` que six écrans consomment via leurs services respectifs.

**Tech Stack :** Next.js 16 (RSC + Server Actions), Supabase (Postgres + RLS), Zod + React Hook
Form, Tailwind v4 + shadcn/ui, Vitest (`packages/core` uniquement).

## Contraintes globales

- **Seuil : 30 jours.** Une seule définition, `NEW_THRESHOLD_DAYS` dans `@glagency/core`. Aucun
  écran ne recalcule ni ne code le nombre en dur.
- **Jour de référence : `todayParis()`**, jamais `new Date()` / `isoDate(new Date())`.
- **Chatteurs uniquement** : toute écriture force `is_new = false` / `arrived_at = null` si
  `role !== 'chatteur'`, comme `closing_role` et `shift`.
- **Couleur** : bleu (ton normal) / **ambre** (warning). Jamais orange — réservé au rôle police.
- **Libellés** : « Nouvel arrivant » dans le dialog Membres, « Nouveau » sur le badge affiché.
- **`'use no memo'`** obligatoire en tête de tout composant client lisant `formState` (RHF +
  React Compiler).
- **Migrations** : `cd packages/db && supabase db push --db-url "$DATABASE_URL"`. Jamais
  `psql -f`, jamais `supabase link` (cassé sur ce projet).
- **Aucun commit sans accord de Benoit** — les étapes « Commit » ci-dessous se demandent d'abord.
- Après chaque tâche : `pnpm --filter @glagency/web build` doit passer (aucun test dans `web`).

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `packages/core/src/domain/anciennete.ts` | **créé** — seuil + calcul en jours Paris |
| `packages/core/src/domain/anciennete.test.ts` | **créé** — Vitest du calcul pur |
| `packages/core/src/index.ts` | export des trois symboles |
| `packages/db/supabase/migrations/0101_profils_nouvel_arrivant.sql` | **créé** — colonnes + check + index |
| `packages/db/src/types.ts` | régénéré |
| `apps/web/src/components/new-badge.tsx` | **créé** — badge/icône, source unique du rendu |
| `apps/web/src/features/members/{schema,types,actions}.ts` | saisie + écriture |
| `apps/web/src/features/members/services/get-members.ts` | lecture |
| `apps/web/src/features/members/components/member-closing-fields.tsx` | les deux champs |
| `apps/web/src/features/members/components/member-dialog.tsx` | valeurs par défaut |
| `apps/web/src/features/members/components/members-columns.tsx` | badge texte |
| `apps/web/src/features/members/components/members-table.tsx` | bouton « N à revoir » |
| `apps/web/src/features/organisation/{types.ts,services/get-organisation.ts,components/org-table.tsx}` | icône |
| `apps/web/src/features/repos/{types.ts,services/get-repos.ts,components/planning-grid-rows.tsx}` | icône |
| `apps/web/src/lib/services/closing-by-chatter.ts` + `lib/services/get-chatters.ts` + `lib/types/chatters.ts` + `features/chatters/components/chatters-columns.tsx` | badge texte Tracker |
| `apps/web/src/features/compta/services/compta-rows.ts` + `features/compta/components/compta-table.tsx` | icône |
| `apps/web/src/features/police-reports/{types.ts,services/get-police-reports.ts,components/report-lines-editor.tsx}` | icône |

---

## Task 1 : la règle de seuil (domaine pur, testé)

**Files :**
- Create : `packages/core/src/domain/anciennete.ts`
- Create : `packages/core/src/domain/anciennete.test.ts`
- Modify : `packages/core/src/index.ts`

**Interfaces :**
- Consomme : `todayParis` de `packages/core/src/domain/dates.ts:218`
- Produit : `NEW_THRESHOLD_DAYS: number`, `daysSinceArrival(arrivedAt: string | null, today?:
  string): number | null`, `isStaleNew(isNew: boolean, arrivedAt: string | null, today?: string):
  boolean` — exportés depuis `@glagency/core`, utilisés par toutes les tâches suivantes.

- [ ] **Étape 1 : écrire le test qui échoue**

`packages/core/src/domain/anciennete.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { daysSinceArrival, isStaleNew, NEW_THRESHOLD_DAYS } from './anciennete'

const TODAY = '2026-07-30'

describe('daysSinceArrival', () => {
  it('rend null sans date d’arrivée', () => {
    expect(daysSinceArrival(null, TODAY)).toBeNull()
  })

  it('compte les jours écoulés', () => {
    expect(daysSinceArrival('2026-07-30', TODAY)).toBe(0)
    expect(daysSinceArrival('2026-07-01', TODAY)).toBe(29)
    expect(daysSinceArrival('2026-06-30', TODAY)).toBe(30)
  })

  it('traverse un changement d’heure sans dériver', () => {
    // 29/03/2026 = passage à l'heure d'été (UTC+1 → UTC+2). Un calcul en heures locales
    // rendrait 30,96 jours et arrondirait à 31 — le badge basculerait en warning un jour trop tôt.
    expect(daysSinceArrival('2026-03-01', '2026-03-31')).toBe(30)
  })

  it('ne compte jamais négatif sur une date future', () => {
    expect(daysSinceArrival('2026-08-15', TODAY)).toBe(0)
  })
})

describe('isStaleNew', () => {
  it('ne signale rien si le membre n’est pas marqué nouveau', () => {
    expect(isStaleNew(false, '2020-01-01', TODAY)).toBe(false)
  })

  it('ne signale rien sans date d’arrivée', () => {
    expect(isStaleNew(true, null, TODAY)).toBe(false)
  })

  it('laisse passer le seuil exact, signale au-delà', () => {
    expect(isStaleNew(true, '2026-07-01', TODAY)).toBe(false) // 29 j
    expect(isStaleNew(true, '2026-06-30', TODAY)).toBe(false) // 30 j = le seuil
    expect(isStaleNew(true, '2026-06-29', TODAY)).toBe(true) // 31 j
  })

  it('expose le seuil pour que personne ne le code en dur', () => {
    expect(NEW_THRESHOLD_DAYS).toBe(30)
  })
})
```

- [ ] **Étape 2 : lancer le test, vérifier qu'il échoue**

Run : `pnpm --filter @glagency/core test -- anciennete`
Attendu : ÉCHEC — `Failed to resolve import "./anciennete"`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

`packages/core/src/domain/anciennete.ts` :

```ts
import { todayParis } from './dates'

/**
 * ANCIENNETÉ D'UN MEMBRE — la règle « depuis quand est-il là ».
 *
 * Le drapeau « nouvel arrivant » est posé À LA MAIN (`profiles.is_new`, migration 0101) parce
 * que la date de création du compte CRM et l'arrivée réelle dans l'agence divergent souvent.
 * Un drapeau manuel, personne ne le retire : passé ce seuil, l'app le réclame.
 */
export const NEW_THRESHOLD_DAYS = 30

/**
 * Jours écoulés depuis l'arrivée, en JOURS CIVILS PARIS. `null` = pas de date d'arrivée.
 * Jamais négatif : une date d'arrivée future (embauche annoncée) compte 0 jour.
 *
 * Le calcul projette les deux bornes sur minuit UTC avant de soustraire — sans ça, un
 * changement d'heure (mars/octobre) glisserait d'une heure dans l'intervalle et l'arrondi
 * ferait basculer le verdict un jour trop tôt.
 *
 * `today` est injectable POUR LES TESTS et pour un rendu serveur qui a déjà son jour de
 * référence ; par défaut `todayParis()`, jamais `new Date()` brut (le serveur tourne en UTC
 * sur Vercel — cf. le commentaire de `todayParis`).
 */
export function daysSinceArrival(
  arrivedAt: string | null,
  today: string = todayParis(),
): number | null {
  if (!arrivedAt) return null
  const diff = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${arrivedAt}T00:00:00Z`)
  if (Number.isNaN(diff)) return null
  return Math.max(0, Math.round(diff / 86_400_000))
}

/** Marqué nouveau ET là depuis plus que le seuil = le drapeau est à retirer. */
export function isStaleNew(
  isNew: boolean,
  arrivedAt: string | null,
  today: string = todayParis(),
): boolean {
  if (!isNew) return false
  const days = daysSinceArrival(arrivedAt, today)
  return days !== null && days > NEW_THRESHOLD_DAYS
}
```

- [ ] **Étape 4 : lancer le test, vérifier qu'il passe**

Run : `pnpm --filter @glagency/core test -- anciennete`
Attendu : SUCCÈS, 8 tests.

- [ ] **Étape 5 : exporter depuis l'index du package**

Dans `packages/core/src/index.ts`, à la suite du bloc `export { isoDate, todayParis, … }` :

```ts
export { NEW_THRESHOLD_DAYS, daysSinceArrival, isStaleNew } from './domain/anciennete'
```

- [ ] **Étape 6 : vérifier la suite complète du package**

Run : `pnpm --filter @glagency/core test`
Attendu : tous les tests passent (aucune régression sur `dates.test.ts`).

- [ ] **Étape 7 : demander à Benoit avant de commiter**

```bash
git add packages/core/src/domain/anciennete.ts packages/core/src/domain/anciennete.test.ts packages/core/src/index.ts
git commit -m "feat(core): règle d'ancienneté — nouvel arrivant et seuil de 30 jours"
```

---

## Task 2 : la migration `0101`

**Files :**
- Create : `packages/db/supabase/migrations/0101_profils_nouvel_arrivant.sql`
- Modify : `packages/db/src/types.ts` (régénéré, jamais édité à la main)

**Interfaces :**
- Produit : `profiles.is_new: boolean` (non null, défaut `false`) et `profiles.arrived_at: string
  | null` dans les types générés — toutes les tâches suivantes lisent ces deux noms de colonnes.

- [ ] **Étape 1 : écrire la migration**

`packages/db/supabase/migrations/0101_profils_nouvel_arrivant.sql` :

```sql
-- 0101 — « Nouvel arrivant » : un drapeau MANUEL sur le membre, et sa date d'arrivée réelle.
--
-- POURQUOI MANUEL. `profiles.created_at` ne dit pas quand la personne est arrivée dans l'agence :
-- un chatteur peut être créé tardivement dans le CRM alors qu'il travaille depuis deux mois, ou
-- l'inverse. Dériver le badge de la date de création aurait donc affiché « nouveau » à des
-- anciens et rien à des nouveaux. C'est une saisie humaine, assumée comme telle.
--
-- POURQUOI DEUX COLONNES ET PAS UNE `new_since date`. Décocher le drapeau ne doit pas effacer la
-- date d'arrivée : c'est la donnée d'entrée du suivi de turnover (ancienneté = sortie − arrivée),
-- chantier suivant. Avec une colonne unique, chaque décochage la détruirait.
--
-- DROITS : inchangés. `profiles` n'a pas de policy par colonne — l'écriture suit les droits
-- d'édition d'un membre déjà en place (admin, ou manager sur un compte chatteur, cf. 0095), et
-- `authz.ts` reste la garde applicative. Même famille que `shift` (0099) et `closing_role`
-- (0077) : des données CRM saisies à la main, portées par le membre.

alter table profiles
  add column if not exists arrived_at date,
  add column if not exists is_new boolean not null default false;

comment on column profiles.arrived_at is
  'Date d''arrivée RÉELLE dans l''agence (saisie à la main, 0101). Conservée même après retrait du drapeau is_new — base du calcul d''ancienneté/turnover.';
comment on column profiles.is_new is
  'Drapeau manuel « nouvel arrivant » (0101). Chatteurs uniquement côté app. Au-delà de 30 jours, l''UI réclame son retrait.';

-- Un drapeau sans date ne pourrait ni s'afficher correctement ni déclencher le rappel de retrait :
-- l'écran serait « nouveau depuis on ne sait quand », c'est-à-dire nouveau pour toujours.
alter table profiles
  drop constraint if exists profiles_is_new_needs_arrived_at;
alter table profiles
  add constraint profiles_is_new_needs_arrived_at
    check (not is_new or arrived_at is not null);

-- Le compteur « N à revoir » de la page Membres interroge ce drapeau à chaque rendu ; partiel,
-- l'index ne pèse que le nombre de nouveaux (une poignée), pas les 109 chatteurs.
create index if not exists profiles_is_new_idx on profiles (is_new) where is_new;
```

- [ ] **Étape 2 : prévisualiser sur la préprod**

```bash
cd packages/db
DBU=$(grep '^DATABASE_URL=' ../../.env | cut -d= -f2- | sed 's/^"//; s/"$//')
supabase db push --db-url "$DBU" --dry-run
```

Attendu : la sortie annonce `0101_profils_nouvel_arrivant.sql` comme seule migration à appliquer.
Si elle en annonce d'autres, **s'arrêter** : l'historique est désaligné, ne pas forcer.

- [ ] **Étape 3 : appliquer**

```bash
cd packages/db && supabase db push --db-url "$DBU"
```

Attendu : `Finished supabase db push.`

- [ ] **Étape 4 : vérifier le schéma en base**

```bash
psql "$DBU" -c "\d profiles" | grep -E "is_new|arrived_at"
psql "$DBU" -c "select count(*) from profiles where is_new;"
```

Attendu : les deux colonnes présentes (`arrived_at | date`, `is_new | boolean | not null default
false`), et `0` membre marqué — la contrainte n'a rien cassé sur l'existant.

- [ ] **Étape 5 : régénérer les types**

```bash
cd packages/db && pnpm gen:types   # (ou la commande déclarée dans son package.json)
git diff --stat packages/db/src/types.ts
```

Attendu : le diff ne touche que `profiles` (Row/Insert/Update) avec `arrived_at` et `is_new`.

- [ ] **Étape 6 : demander à Benoit avant de commiter**

```bash
git add packages/db/supabase/migrations/0101_profils_nouvel_arrivant.sql packages/db/src/types.ts
git commit -m "feat(db): 0101 — nouvel arrivant (is_new + arrived_at) sur profiles"
```

---

## Task 3 : la saisie dans le dialog Membres (bout en bout, sans affichage)

**Files :**
- Modify : `apps/web/src/features/members/schema.ts`
- Modify : `apps/web/src/features/members/types.ts` (interface `Member`)
- Modify : `apps/web/src/features/members/services/get-members.ts` (`select` + mapping)
- Modify : `apps/web/src/features/members/actions.ts` (create + update)
- Modify : `apps/web/src/features/members/components/member-dialog.tsx` (valeurs par défaut)
- Modify : `apps/web/src/features/members/components/member-closing-fields.tsx` (les deux champs)

**Interfaces :**
- Consomme : rien de la Task 1 (pure saisie).
- Produit : `Member.isNew: boolean` et `Member.arrivedAt: string | null` — les Tasks 4 à 8 lisent
  ces deux noms. Champs de formulaire `isNew` et `arrivedAt` dans `MemberForm`.

- [ ] **Étape 1 : ajouter les deux champs au schéma Zod partagé**

Dans `schema.ts`, à l'intérieur de `memberFields`, à la suite de `shift` :

```ts
  // Nouvel arrivant : drapeau MANUEL + date d'arrivée réelle (0101). La date est exigée quand le
  // drapeau est posé — cf. le refine plus bas, miroir du `check` SQL.
  isNew: z.boolean(),
  arrivedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide')
    .nullable(),
```

Puis, avec les autres prédicats partagés (au-dessus de `memberInput`) :

```ts
// Miroir applicatif du check SQL `profiles_is_new_needs_arrived_at` : un drapeau sans date
// s'afficherait « nouveau depuis on ne sait quand », donc nouveau pour toujours.
const arrivalWhenNew = (d: { isNew: boolean; arrivedAt: string | null }) =>
  !d.isNew || d.arrivedAt !== null
```

Et sur **chacun** des deux schémas (`memberInput` et `memberUpdateInput`), après les refines
existants :

```ts
  .refine(arrivalWhenNew, { message: 'Renseigne la date d’arrivée', path: ['arrivedAt'] })
```

- [ ] **Étape 2 : étendre le contrat de lecture**

Dans `types.ts`, interface `Member`, juste après `shift` :

```ts
  /** Drapeau MANUEL « nouvel arrivant » (0101) — chatteurs uniquement, false pour les autres rôles. */
  isNew: boolean
  /** Date d'arrivée réelle dans l'agence ('YYYY-MM-DD') — CONSERVÉE après retrait du drapeau. */
  arrivedAt: string | null
```

- [ ] **Étape 3 : lire les colonnes**

Dans `get-members.ts` :
- ligne 53, ajouter `arrived_at, is_new` à la liste du `select` (après `shift`) ;
- dans le mapping (vers la ligne 188, à côté de `shift:`) :

```ts
      isNew: p.is_new ?? false,
      arrivedAt: p.arrived_at ?? null,
```

- [ ] **Étape 4 : écrire les colonnes**

Dans `actions.ts`, dans les **deux** `.update({…})` du membre (vers les lignes 110 et 186), à côté
de la ligne `shift: role === 'chatteur' ? values.shift : null,` :

```ts
          // Même règle que le closing et le shift : changer un membre de rôle purge ses
          // attributs de chatteur, plutôt que de laisser un drapeau orphelin sur un manager.
          is_new: role === 'chatteur' ? values.isNew : false,
          arrived_at: role === 'chatteur' ? values.arrivedAt : null,
```

- [ ] **Étape 5 : valeurs par défaut du formulaire**

Dans `member-dialog.tsx`, dans l'objet `defaultValues`, à côté de `shift` :

```ts
      isNew: member?.isNew ?? false,
      arrivedAt: member?.arrivedAt ?? null,
```

- [ ] **Étape 6 : les deux champs dans le dialog**

Dans `member-closing-fields.tsx` — le composant a déjà `'use no memo'` et son garde
`if (roleValue !== 'chatteur') return null`, les deux champs héritent donc de la bonne
condition. Ajouter les imports :

```tsx
import { useWatch } from 'react-hook-form'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { todayParis } from '@glagency/core'
```

Puis, à l'intérieur du composant, avant le `return` :

```tsx
  const isNew = useWatch({ control, name: 'isNew' })
```

Et, en **dernier** enfant du `<div className="flex flex-wrap gap-4">` :

```tsx
      <Controller
        name="isNew"
        control={control}
        render={({ field }) => (
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Arrivée
            </label>
            <div className="flex h-9 items-center gap-2">
              <Checkbox
                id="member-is-new"
                checked={field.value}
                disabled={isSubmitting}
                // Cocher PROPOSE la date du jour ; décocher garde la date en base (elle sert au
                // suivi d'ancienneté) mais masque le champ.
                onCheckedChange={(v) => {
                  const on = v === true
                  field.onChange(on)
                  if (on && !getValues('arrivedAt')) setValue('arrivedAt', todayParis())
                }}
              />
              {/* « Nouvel arrivant » et pas « Nouveau » : le sélecteur « Rôle closing » juste à
                  côté propose déjà une option `Nouveau` (paie, 0090). Deux « Nouveau » sur la
                  même ligne seraient illisibles — le badge affiché dans l'app, lui, dit bien
                  « Nouveau ». */}
              <label htmlFor="member-is-new" className="text-sm">
                Nouvel arrivant
              </label>
            </div>
          </div>
        )}
      />
      {isNew && (
        <Controller
          name="arrivedAt"
          control={control}
          render={({ field, fieldState }) => (
            <div className="grid gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Arrivé le
              </label>
              {/* `<Input type="date">` = la saisie de date de ce dialog même (onglet Compta,
                  `member-pay-form.tsx:178`) et de Rapports/Insights. Le Calendar Radix n'est
                  monté que pour des PLAGES (`date-range-picker.tsx`). */}
              <Input
                type="date"
                className="h-9 w-40 text-sm"
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value || null)}
                disabled={isSubmitting}
              />
              {fieldState.error && (
                <p className="text-xs text-destructive">{fieldState.error.message}</p>
              )}
            </div>
          )}
        />
      )}
```

`getValues` et `setValue` ne font pas encore partie des props du composant : les ajouter à sa
signature depuis `member-dialog.tsx` (le `useForm` y vit déjà), sur le modèle de `control`.

- [ ] **Étape 7 : vérifier que ça compile**

Run : `pnpm --filter @glagency/web build`
Attendu : succès. Une erreur `Property 'is_new' does not exist` signifie que la Task 2 étape 5
(régénération des types) n'a pas été faite.

- [ ] **Étape 8 : essai manuel**

Lancer `pnpm --filter @glagency/web dev`, ouvrir `/chatter/membres`, éditer un chatteur :
- la case « Nouvel arrivant » apparaît, le champ date est masqué ;
- cocher → « Arrivé le » apparaît, pré-rempli à aujourd'hui ;
- vider la date et enregistrer → refus, « Renseigne la date d'arrivée » sous le champ ;
- remettre une date, enregistrer, rouvrir → les valeurs sont là ;
- décocher, enregistrer, recocher → la date précédente est toujours en base ;
- éditer un **manager** → aucun des deux champs n'apparaît.

- [ ] **Étape 9 : demander à Benoit avant de commiter**

```bash
git add apps/web/src/features/members
git commit -m "feat(membres): saisie « nouvel arrivant » + date d'arrivée"
```

---

## Task 4 : la brique d'affichage + la page Membres

**Files :**
- Create : `apps/web/src/components/new-badge.tsx`
- Modify : `apps/web/src/features/members/components/members-columns.tsx`
- Modify : `apps/web/src/features/members/components/members-table.tsx`

**Interfaces :**
- Consomme : `isStaleNew`, `daysSinceArrival` de `@glagency/core` (Task 1) ; `Member.isNew` /
  `Member.arrivedAt` (Task 3).
- Produit : `<NewBadge isNew arrivedAt variant?="badge" | "icon" />` — les Tasks 5 à 8 ne font
  que l'appeler, aucune ne réimplémente le rendu ni le seuil.

- [ ] **Étape 1 : créer la brique**

`apps/web/src/components/new-badge.tsx` :

```tsx
import { Sparkles } from 'lucide-react'
import { daysSinceArrival, isStaleNew } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Badge « nouvel arrivant » (0101) — jumeau de `ShiftBadge`/`RoleBadge` : source unique du rendu,
 * `isNew` faux → ne rend rien (l'appelant n'a aucun cas à gérer).
 *
 * DEUX VARIANTES parce que les écrans n'ont pas la même place : `badge` sur Membres et le
 * Tracker (une ligne de tableau, de la place pour un mot), `icon` sur le board Organisation, le
 * planning Repos, le rapport Police et la Compta — des grilles denses où un badge texte de plus
 * casserait la lecture (demande Benoit : « juste une icône »).
 *
 * AMBRE AU-DELÀ DU SEUIL, et pas orange : l'orange est la couleur du rôle POLICE dans le code
 * couleur de l'app (bleu chatter, vert encadrement, orange police, violet modèles) — deux
 * oranges de sens différent sur une même ligne se liraient mal. L'ambre est déjà la couleur
 * d'alerte (`count-dot.tsx`, `kpi-card.tsx`).
 *
 * Le seuil n'est PAS calculé ici : `isStaleNew` vit dans `@glagency/core`, testée, et sert aussi
 * au compteur « N à revoir » de la page Membres. Deux calculs, c'est un drift assuré.
 */
export function NewBadge({
  isNew,
  arrivedAt,
  variant = 'badge',
}: {
  isNew: boolean
  arrivedAt: string | null
  variant?: 'badge' | 'icon'
}) {
  if (!isNew) return null
  const stale = isStaleNew(isNew, arrivedAt)
  const days = daysSinceArrival(arrivedAt)
  const title = stale
    ? `Nouveau depuis ${days} jours — pense à décocher`
    : arrivedAt
      ? `Nouveau — arrivé le ${arrivedAt.split('-').reverse().join('/')}`
      : 'Nouveau'

  if (variant === 'icon')
    return (
      <Sparkles
        aria-label={title}
        title={title}
        className={cn(
          'inline size-3.5 shrink-0',
          stale ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400',
        )}
      />
    )

  return (
    <Badge
      title={title}
      className={cn(
        'gap-1 text-xs',
        stale
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
          : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      )}
    >
      <Sparkles className="size-3" />
      Nouveau
    </Badge>
  )
}
```

- [ ] **Étape 2 : le badge dans la table Membres**

Dans `members-columns.tsx`, importer `NewBadge` puis l'ajouter à la grappe de badges de la
colonne **Rôle** (vers la ligne 250), juste après `<ShiftBadge … />` :

```tsx
              <NewBadge isNew={row.original.isNew} arrivedAt={row.original.arrivedAt} />
```

- [ ] **Étape 3 : le bouton « N à revoir » dans la toolbar**

Dans `members-table.tsx` : le composant est déjà `'use client'`. Ajouter les imports
(`useState` de react, `TriangleAlert` de lucide-react, `isStaleNew` de `@glagency/core`), puis
avant le `return` :

```tsx
  // LE point de contrôle du drapeau. Sans lui, le warning n'existe que dispersé dans six écrans
  // et personne ne décoche jamais — le badge finirait par ne plus rien vouloir dire.
  const [onlyStale, setOnlyStale] = useState(false)
  const stale = members.filter((m) => isStaleNew(m.isNew, m.arrivedAt))
  const rows = onlyStale ? stale : members
```

Remplacer `data={members}` par `data={rows}`, et mettre la `toolbar` sous cette forme :

```tsx
      toolbar={
        <div className="flex items-center gap-2">
          {stale.length > 0 && (
            <Button
              size="sm"
              variant={onlyStale ? 'default' : 'outline'}
              className="gap-1.5"
              aria-pressed={onlyStale}
              onClick={() => setOnlyStale((v) => !v)}
            >
              <TriangleAlert className="size-3.5" />
              {stale.length} à revoir
            </Button>
          )}
          <MemberDialog
            {/* …props inchangées… */}
          />
        </div>
      }
```

- [ ] **Étape 4 : vérifier que ça compile**

Run : `pnpm --filter @glagency/web build`
Attendu : succès.

- [ ] **Étape 5 : essai manuel des deux tons**

Sur `/chatter/membres` : marquer un chatteur nouveau avec la date du jour → badge **bleu**, pas
de bouton dans la toolbar. Passer sa date à 40 jours en arrière, recharger → badge **ambre**,
bouton `⚠ 1 à revoir` présent ; cliquer → la table ne montre que lui ; recliquer → tout revient.

- [ ] **Étape 6 : demander à Benoit avant de commiter**

```bash
git add apps/web/src/components/new-badge.tsx apps/web/src/features/members/components
git commit -m "feat(membres): badge « Nouveau » + compteur des drapeaux à revoir"
```

---

## Task 5 : le board Organisation (icône)

**Files :**
- Modify : `apps/web/src/features/organisation/types.ts` (`OrgChatter`, options)
- Modify : `apps/web/src/features/organisation/services/get-organisation.ts:27,66-70,186-188`
- Modify : `apps/web/src/features/organisation/components/org-table.tsx:136-155,246`

**Interfaces :**
- Consomme : `<NewBadge variant="icon">` (Task 4), colonnes `is_new`/`arrived_at` (Task 2).
- Produit : `OrgChatter.isNew` / `OrgChatter.arrivedAt`, et les mêmes deux champs sur les entrées
  de `chatterOptions`.

- [ ] **Étape 1 : étendre les types de la feature**

Dans `organisation/types.ts`, sur l'interface `OrgChatter` :

```ts
  /** Nouvel arrivant (0101) — l'icône du board, pas d'édition ici. */
  isNew: boolean
  arrivedAt: string | null
```

Et sur le type des entrées de `chatterOptions` (les deux mêmes champs) — c'est la liste que le
combobox des cases utilise, et la source de `nameById` côté table.

- [ ] **Étape 2 : les remonter dans le service**

Dans `get-organisation.ts` :
- ligne 27, ajouter `arrived_at, is_new` au `select` des profils ;
- dans la construction de `entry` (ligne ~66) :

```ts
      isNew: m.is_new ?? false,
      arrivedAt: m.arrived_at ?? null,
```

- dans `chatterOptions` (ligne ~186) :

```ts
    .map((m) => ({ id: m.id, name: nameOf(m), isNew: m.is_new ?? false, arrivedAt: m.arrived_at ?? null }))
```

- [ ] **Étape 3 : l'icône dans les cellules**

Dans `org-table.tsx`, la ligne 246 construit `nameById`. Ajouter à côté :

```tsx
  // Le drapeau suit le même chemin que le nom : une map dérivée des mêmes options, pour que la
  // cellule n'ait rien à aller chercher ailleurs.
  const newById = new Map(data.chatterOptions.map((o) => [o.id, o]))
```

Passer `newById` en prop au composant de cellule (à côté de `nameById`, lignes 136-144, 488-489),
puis remplacer le rendu de la ligne 152 :

```tsx
      {nameById.get(id) ?? '?'}
      <NewBadge
        isNew={newById.get(id)?.isNew ?? false}
        arrivedAt={newById.get(id)?.arrivedAt ?? null}
        variant="icon"
      />
```

- [ ] **Étape 4 : vérifier**

Run : `pnpm --filter @glagency/web build`
Puis `/chatter/organisation` : le chatteur marqué porte une étincelle dans sa case, au bon ton.
Vérifier qu'un déplacement de case (drag/combobox) fonctionne toujours et que l'icône suit.

- [ ] **Étape 5 : demander à Benoit avant de commiter**

```bash
git add apps/web/src/features/organisation
git commit -m "feat(organisation): icône « nouveau » sur les chatteurs du board"
```

---

## Task 6 : le planning Repos (icône)

**Files :**
- Modify : `apps/web/src/features/repos/types.ts` (`ReposData`, `CellChip`)
- Modify : `apps/web/src/features/repos/services/get-repos.ts:54,101-106`
- Modify : `apps/web/src/features/repos/components/planning-grid.tsx:106-115` (`cellChips`)
- Modify : `apps/web/src/features/repos/components/planning-grid-rows.tsx:104,157`

**Interfaces :**
- Consomme : `<NewBadge variant="icon">` (Task 4).
- Produit : `ReposData.newByChatter: Record<string, { isNew: boolean; arrivedAt: string | null }>`
  et `CellChip.isNew?` / `CellChip.arrivedAt?`.

**Ne pas toucher `EntityOption`** : ce type sert les options du combobox (chatteurs ET modèles),
et l'icône n'est demandée que dans les cases. Le chemin de la donnée est
`newByChatter` → `cellChips` → puce, exactement celui que `chatterById` emprunte déjà pour le nom.

- [ ] **Étape 1 : étendre les types de la feature**

Dans `repos/types.ts`, sur `ReposData` (à côté de `chatterById`) :

```ts
  /** Drapeau « nouvel arrivant » par id de MEMBRE (0101). Les fiches MyPuls legacy des cellules
   *  d'avant la bascule n'y figurent pas — elles ne correspondent à personne dans l'équipe. */
  newByChatter: Record<string, { isNew: boolean; arrivedAt: string | null }>
```

Et sur `CellChip` (deux champs optionnels — une puce peut être du TEXTE LIBRE legacy, qui n'a
aucun membre derrière) :

```ts
  isNew?: boolean
  arrivedAt?: string | null
```

- [ ] **Étape 2 : les remonter dans le service**

Dans `get-repos.ts` : ajouter `arrived_at, is_new` au `select` des profils (ligne 54). Puis, à
côté de la boucle qui construit `chatterById` (lignes 105-106) :

```ts
  // UNIQUEMENT depuis les profils : `chatterById` fusionne les fiches MyPuls legacy et les
  // membres, mais seul un MEMBRE porte le drapeau.
  const newByChatter: Record<string, { isNew: boolean; arrivedAt: string | null }> = {}
  for (const m of profileRows ?? [])
    newByChatter[m.id] = { isNew: m.is_new ?? false, arrivedAt: m.arrived_at ?? null }
```

Ajouter `newByChatter` à l'objet retourné par le service (à côté de `chatterById`).

- [ ] **Étape 3 : remplir les puces**

Dans `planning-grid.tsx`, la ligne 111 de `cellChips` devient :

```ts
    for (const id of c.chatterIds)
      chips.push({
        key: id,
        label: data.chatterById[id] ?? '?',
        over: over.ids.has(id),
        id,
        isNew: data.newByChatter[id]?.isNew ?? false,
        arrivedAt: data.newByChatter[id]?.arrivedAt ?? null,
      })
```

La boucle du texte libre juste en dessous (ligne 112-113) reste **inchangée** : un token n'a pas
de membre derrière, ses deux champs restent absents.

- [ ] **Étape 4 : l'icône sur les puces**

Dans `planning-grid-rows.tsx`, aux deux endroits qui rendent `{ch.label}` — la cellule éditable
(ligne ~104) et la cellule en lecture seule (ligne ~157) — ajouter juste après :

```tsx
                              <NewBadge isNew={ch.isNew ?? false} arrivedAt={ch.arrivedAt ?? null} variant="icon" />
```

Le `<span>` de la puce porte déjà `inline-flex`-compatible ; si l'icône saute à la ligne, ajouter
`inline-flex items-center gap-1` à son `className`.

- [ ] **Étape 4 : vérifier**

Run : `pnpm --filter @glagency/web build`
Puis `/chatter/repos` : le chatteur marqué porte l'icône dans les cases où il est posé. Poser et
retirer un repos, vérifier que l'icône suit et que la génération d'image du planning
(`planning-image.ts`) n'est pas cassée — elle rend du texte, elle ignore le badge.

- [ ] **Étape 5 : demander à Benoit avant de commiter**

```bash
git add apps/web/src/features/repos
git commit -m "feat(repos): icône « nouveau » sur les chatteurs du planning"
```

---

## Task 7 : le Tracker Chatteurs et la Compta

**Files :**
- Modify : `apps/web/src/lib/services/closing-by-chatter.ts`
- Modify : `apps/web/src/lib/services/get-chatters.ts:165-166`
- Modify : `apps/web/src/lib/types/chatters.ts` (`ChatterRow`)
- Modify : `apps/web/src/features/chatters/components/chatters-columns.tsx`
- Modify : `apps/web/src/features/compta/services/compta-sources.ts:61` et `compta-rows.ts:163`
- Modify : `apps/web/src/features/compta/components/compta-table.tsx`

**Interfaces :**
- Consomme : `<NewBadge>` (Task 4).
- Produit : la map de `getClosingByChatter` gagne deux clés — sa valeur devient
  `{ role, team, isNew, arrivedAt }`. **Spenders consomme déjà cette map** : vérifier qu'il
  compile (il ignore simplement les nouvelles clés).

- [ ] **Étape 1 : élargir le helper partagé**

Dans `closing-by-chatter.ts` : ajouter `arrived_at, is_new` au `select`, élargir le type de
retour en `Map<string, { role: CrmRole | null; team: CrmTeam | null; isNew: boolean; arrivedAt:
string | null }>` et remplir les deux clés dans la boucle. Mettre à jour la phrase du docblock
« Ne remonte QUE des champs closing » — c'est faux dès cette tâche ; écrire « Ne remonte que des
attributs CRM du membre (closing + nouvel arrivant), aucun email ni nom. »

- [ ] **Étape 2 : le Tracker**

Dans `lib/types/chatters.ts`, sur `ChatterRow`, après `closingTeam` :

```ts
  /** Nouvel arrivant lu DEPUIS le membre lié (0101) — false si la fiche n'a aucun membre. */
  isNew: boolean
  arrivedAt: string | null
```

Dans `get-chatters.ts`, à côté des lignes 165-166 :

```ts
        isNew: closingByChatter.get(id)?.isNew ?? false,
        arrivedAt: closingByChatter.get(id)?.arrivedAt ?? null,
```

Dans `chatters-columns.tsx`, ajouter `<NewBadge isNew={…} arrivedAt={…} />` à la grappe de badges
qui porte déjà `RoleBadge` (colonne d'identité du chatteur).

- [ ] **Étape 3 : la Compta**

Dans `compta-sources.ts:61`, ajouter `arrived_at, is_new` au `select` (la requête filtre déjà
`role = 'chatteur'`). Dans `compta-rows.ts`, dans l'objet retourné (ligne ~163, à côté de
`role: m.role`) :

```ts
      isNew: m.is_new ?? false,
      arrivedAt: m.arrived_at ?? null,
```

Ajouter les deux champs au type de ligne correspondant, puis rendre
`<NewBadge … variant="icon" />` à côté du nom dans `compta-table.tsx`.

- [ ] **Étape 4 : vérifier**

Run : `pnpm --filter @glagency/web build`
Attendu : succès, **y compris `features/spenders/services/get-spenders.ts`** qui consomme la même
map. Puis `/chatter/chatters` (badge sur la fiche du chatteur marqué, rien sur les fiches sans
membre lié) et `/chatter/compta` (icône dans la pile de noms).

- [ ] **Étape 5 : demander à Benoit avant de commiter**

```bash
git add apps/web/src/lib apps/web/src/features/chatters apps/web/src/features/compta
git commit -m "feat(tracker,compta): badge « nouveau » via le membre lié"
```

---

## Task 8 : le rapport Police (icône)

**Files :**
- Modify : `apps/web/src/features/police-reports/types.ts` (`ReportOption`)
- Modify : `apps/web/src/features/police-reports/services/get-police-reports.ts:108-126`
- Modify : `apps/web/src/features/police-reports/components/report-form.tsx:43`
- Modify : `apps/web/src/features/police-reports/components/report-lines-editor.tsx:29-36,45-47,88`

**Interfaces :**
- Consomme : `<NewBadge variant="icon">` (Task 4).
- Produit : `ReportOption.isNew?` / `ReportOption.arrivedAt?` (optionnels — le type sert aussi aux
  options de MODÈLES dans `report-form.tsx`).

**Ne pas étendre `ComboOption`** : il est PARTAGÉ (`components/ui/combobox.tsx:17`, consommé aussi
par `combobox-multiple.tsx`) — une primitive d'UI générique n'a rien à savoir des nouveaux
arrivants de l'agence. `report-lines-editor` reçoit donc une prop dédiée.

- [ ] **Étape 1 : étendre `ReportOption`**

Dans `police-reports/types.ts` :

```ts
export interface ReportOption {
  id: string
  name: string
  /** Nouvel arrivant (0101) — absent pour les options de modèles. */
  isNew?: boolean
  arrivedAt?: string | null
}
```

- [ ] **Étape 2 : le service**

Dans `getChattersByModel` (`get-police-reports.ts:108`) : ajouter `arrived_at, is_new` au `select`
des profils (ligne 112), remplacer la map `chatteurName` par une map d'objets, et pousser les
quatre champs (ligne 122) :

```ts
  const chatteur: Record<string, { name: string; isNew: boolean; arrivedAt: string | null }> = {}
  for (const p of profilesRes.data ?? [])
    if (p.role === 'chatteur' && p.id && p.display_name)
      chatteur[p.id] = {
        name: p.display_name,
        isNew: p.is_new ?? false,
        arrivedAt: p.arrived_at ?? null,
      }
  // …
    const c = chatteur[l.profile_id]
    if (!c) continue // le membre n'est pas un chatteur
    ;(byModel[l.creator_id] ??= []).push({ id: l.profile_id, ...c })
```

- [ ] **Étape 3 : l'icône sur les cartes**

Dans `report-lines-editor.tsx`, ajouter une prop à côté de `chatterOptions` (ligne ~36) :

```tsx
  /** Drapeau « nouvel arrivant » par id de chatteur — prop DÉDIÉE : `ComboOption` est une
   *  primitive d'UI partagée, elle n'a pas à porter une notion métier de l'agence. */
  newByChatter: Record<string, { isNew: boolean; arrivedAt: string | null }>
```

Puis, ligne ~88, juste après le `<span>` du nom :

```tsx
                      <span className="font-medium">{nameById.get(f.chatterId) ?? '—'}</span>
                      <NewBadge
                        isNew={newByChatter[f.chatterId]?.isNew ?? false}
                        arrivedAt={newByChatter[f.chatterId]?.arrivedAt ?? null}
                        variant="icon"
                      />
```

La `nameById` de la ligne 45 reste **inchangée**.

Dans `report-form.tsx`, dériver la prop des options déjà reçues (`chattersByModel`, ligne 43) et
la passer à `<ReportLinesEditor>` :

```tsx
  const newByChatter = Object.fromEntries(
    Object.values(chattersByModel)
      .flat()
      .map((o) => [o.id, { isNew: o.isNew ?? false, arrivedAt: o.arrivedAt ?? null }]),
  )
```

- [ ] **Étape 4 : vérifier**

Run : `pnpm --filter @glagency/web build`
Puis `/chatter/rapport-police` : ajouter un chatteur marqué au suivi → l'icône apparaît sur sa
carte. Enregistrer un rapport, vérifier qu'il se relit bien dans l'historique.

- [ ] **Étape 5 : demander à Benoit avant de commiter**

```bash
git add apps/web/src/features/police-reports
git commit -m "feat(police): icône « nouveau » sur les cartes chatteur du rapport"
```

---

## Recette finale (avant merge)

- [ ] `pnpm --filter @glagency/core test` — vert
- [ ] `pnpm --filter @glagency/web build` — vert
- [ ] Sur la préprod UAT, avec un chatteur marqué à J-0 et un autre à J-40 : parcourir Membres,
      Tracker, Organisation, Repos, Rapport police, Compta — badge bleu d'un côté, ambre de
      l'autre, aux six endroits.
- [ ] Décocher le drapeau du second, vérifier que l'icône disparaît **partout** et que
      `arrived_at` est toujours en base :
      `psql "$DBU" -c "select display_name, is_new, arrived_at from profiles where arrived_at is not null;"`
- [ ] Ouvrir le dialog d'un manager et d'un policier : aucun des deux champs n'apparaît.
- [ ] Vérifier qu'aucun écran hors périmètre n'a bougé : `/chatter/planning`, `/chatter/spenders`.
