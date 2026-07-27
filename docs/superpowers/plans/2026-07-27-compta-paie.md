# Compta — paie des chatteurs : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire `/chatter/compta` — la page de paie des chatteurs par quinzaine, avec saisie des bonus/malus, récupération des sanctions Police, et paiement figé par instantané.

**Architecture:** Le calcul (découpage en quinzaines + formule de paie) vit dans `packages/core`, pur et testé sous Vitest — c'est le seul endroit du projet où de l'argent est calculé. La page suit la convention `app → feature(Template) → composants` : lecture par service dans un Server Component, mutations en Server Actions, RLS comme verrou réel. L'UI réutilise la pile de noms dépliables installée le 2026-07-26 (`MembersAccordion`, `CollapsibleSection`).

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, Tailwind v4, shadcn/ui, Supabase (`@supabase/ssr` + RLS), Zod v4 + React Hook Form, Vitest (`packages/core` uniquement).

**Spec de référence :** `docs/superpowers/specs/2026-07-27-compta-paie-design.md`

## Global Constraints

- **Migrations** : `packages/db/supabase/migrations/NNNN_slug.sql`, séquence contiguë. La dernière appliquée est `0084`. Convention : `text` + `check`, **jamais** `create type ... enum`. Appliquer ET enregistrer via `cd packages/db && supabase db push --db-url "$DATABASE_URL_UAT"`. Extraire l'URL en brut (`grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//'`), jamais `source .env`.
- **Aucun fetch dans une feature** : la donnée est récupérée dans `app/**/page.tsx` via `features/<f>/services/`, passée en props au `<Feature>Template.tsx`.
- **Lectures** : toute erreur Supabase destructurée et `throw new Error(error.message)`. `fetchAll` obligatoire sur `chatter_creator_daily` (table de faits journaliers, troncature silencieuse à 1000 lignes sinon), avec `.order()` sur la PK complète.
- **Jour métier** : `todayParis()` de `@glagency/core`, jamais `new Date()` ni `isoDate(new Date())`.
- **Mutations** : `runAction` de `@/lib/actions` (schéma Zod + garde + handler). Message métier = `throw new BusinessError('…')` ; `Error` nue = technique (Sentry + message générique). `revalidatePath('/chatter/compta')` après écriture. Toast `sonner` côté client depuis l'`ActionResult`.
- **Gardes** : `managerPageGuard('compta')` sur les saisies, `adminGuard` sur le paiement. Jamais `requireAdmin`/`requireAccess` comme `guard` de `runAction` (leur `redirect()` serait avalé par le `try/catch`).
- **Forms RHF** : `'use no memo'` en première ligne du composant (React Compiler casse `formState` sinon), `zodResolver`, schéma partagé dans `schema.ts`. Zod v4 : `z.uuid()`, `z.flattenError()`.
- **Fichiers > 300 lignes → split par responsabilité.**
- **Pas de barrel `index.ts`** dans les features ; imports directs. Aucun import cross-feature.
- **Vérification avant chaque commit** : `pnpm --filter @glagency/web lint && pnpm --filter @glagency/web typecheck`, plus `pnpm --filter @glagency/core test` si `packages/core` est touché.
- **Constante métier** : `HANDOFF_EUR = 0.6`.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `packages/core/src/compta/periods.ts` | Découpage en quinzaines, rattachement des semaines par leur lundi. Pur. |
| `packages/core/src/compta/periods.test.ts` | Tests du découpage. |
| `packages/core/src/compta/payslip.ts` | La formule de paie. Pur. |
| `packages/core/src/compta/payslip.test.ts` | Tests de la formule. |
| `packages/core/src/index.ts` | Ajout des exports compta. |
| `packages/db/supabase/migrations/0085_compta_profiles.sql` | Re-cléage sur `profiles`, prime en numeric, colonnes d'instantané, RLS cloisonnée. |
| `apps/web/src/features/compta/types.ts` | Contrat de domaine local. |
| `apps/web/src/features/compta/schema.ts` | Schémas Zod partagés RHF ↔ actions. |
| `apps/web/src/features/compta/services/get-compta.ts` | Lecture d'une quinzaine. |
| `apps/web/src/features/compta/actions.ts` | Saisies (manager) + paiement (admin). |
| `apps/web/src/features/compta/ComptaTemplate.tsx` | RSC racine, aucun fetch. |
| `apps/web/src/features/compta/components/compta-view.tsx` | Feuille client : KPI, sélecteur, pile de noms. |
| `apps/web/src/features/compta/components/compta-payslip.tsx` | La fiche dépliée. |
| `apps/web/src/features/compta/components/compta-entry-form.tsx` | Saisie bonus/malus/handoffs. |
| `apps/web/src/features/compta/components/compta-pay-dialog.tsx` | Confirmation de paiement (admin). |
| `apps/web/src/features/compta/components/compta-skeleton.tsx` | Silhouette partagée `loading.tsx` / `<Suspense>`. |
| `apps/web/src/app/(dash)/chatter/compta/page.tsx` | Garde, kickoff, Suspense. |
| `apps/web/src/app/(dash)/chatter/compta/loading.tsx` | Silhouette de route. |

---

### Task 1 : Découpage en quinzaines (`packages/core`)

**Files:**
- Create: `packages/core/src/compta/periods.ts`
- Test: `packages/core/src/compta/periods.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `addDays`, `mondayOf`, `startOfMonth`, `endOfMonth`, `frMonthLong` de `../domain/dates`.
- Produces: `interface Fortnight { month: string; period: 1 | 2; from: string; to: string; label: string }`, `fortnightOf(day: string): Fortnight`, `fortnightsOfMonth(month: string): [Fortnight, Fortnight]`, `recentFortnights(today: string, n?: number): Fortnight[]`, `mondaysIn(f: Fortnight): string[]`, `daysIn(f: Fortnight): string[]`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `packages/core/src/compta/periods.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { daysIn, fortnightOf, fortnightsOfMonth, mondaysIn, recentFortnights } from './periods'

describe('fortnightOf', () => {
  it('range un jour <= 15 en periode 1', () => {
    expect(fortnightOf('2026-07-01')).toEqual({
      month: '2026-07-01', period: 1, from: '2026-07-01', to: '2026-07-15',
      label: '1–15 juillet 2026',
    })
    expect(fortnightOf('2026-07-15').period).toBe(1)
  })

  it('range un jour >= 16 en periode 2, bornee a la fin du mois', () => {
    expect(fortnightOf('2026-07-16')).toEqual({
      month: '2026-07-01', period: 2, from: '2026-07-16', to: '2026-07-31',
      label: '16–31 juillet 2026',
    })
  })

  it('gere fevrier (28 jours)', () => {
    expect(fortnightOf('2027-02-20').to).toBe('2027-02-28')
    expect(fortnightOf('2027-02-20').label).toBe('16–28 février 2027')
  })
})

describe('fortnightsOfMonth', () => {
  it('renvoie les deux quinzaines dans l ordre', () => {
    const [p1, p2] = fortnightsOfMonth('2026-07-01')
    expect([p1.period, p2.period]).toEqual([1, 2])
    expect([p1.from, p1.to, p2.from, p2.to]).toEqual(
      ['2026-07-01', '2026-07-15', '2026-07-16', '2026-07-31'],
    )
  })
})

describe('mondaysIn — rattachement des semaines par leur lundi', () => {
  it('juillet 2026 P1 recupere les lundis 06 et 13', () => {
    expect(mondaysIn(fortnightOf('2026-07-01'))).toEqual(['2026-07-06', '2026-07-13'])
  })

  it('juillet 2026 P2 recupere les lundis 20 et 27', () => {
    expect(mondaysIn(fortnightOf('2026-07-16'))).toEqual(['2026-07-20', '2026-07-27'])
  })

  it('une semaine a cheval part avec son lundi, jamais decoupee', () => {
    // Sem. 13→19 juillet : 3 jours en P1, 4 en P2. Lundi en P1 → toute la semaine en P1.
    expect(mondaysIn(fortnightOf('2026-07-14'))).toContain('2026-07-13')
    expect(mondaysIn(fortnightOf('2026-07-17'))).not.toContain('2026-07-13')
  })

  it('une quinzaine peut contenir 3 lundis', () => {
    // Juin 2026 : lundis 01, 08, 15 → P1 en a trois.
    expect(mondaysIn(fortnightOf('2026-06-01'))).toEqual(['2026-06-01', '2026-06-08', '2026-06-15'])
  })
})

describe('daysIn', () => {
  it('enumere tous les jours bornes inclus', () => {
    const d = daysIn(fortnightOf('2026-07-01'))
    expect(d).toHaveLength(15)
    expect(d[0]).toBe('2026-07-01')
    expect(d[14]).toBe('2026-07-15')
  })

  it('P2 de juillet fait 16 jours', () => {
    expect(daysIn(fortnightOf('2026-07-16'))).toHaveLength(16)
  })
})

describe('recentFortnights', () => {
  it('renvoie n quinzaines, la plus recente d abord, sans trou', () => {
    const list = recentFortnights('2026-07-20', 4)
    expect(list.map((f) => `${f.from}→${f.to}`)).toEqual([
      '2026-07-16→2026-07-31',
      '2026-07-01→2026-07-15',
      '2026-06-16→2026-06-30',
      '2026-06-01→2026-06-15',
    ])
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run : `pnpm --filter @glagency/core test periods`
Expected : FAIL — `Failed to resolve import "./periods"`.

- [ ] **Step 3 : Écrire l'implémentation**

Créer `packages/core/src/compta/periods.ts` :

```ts
import { addDays, endOfMonth, frMonthLong, mondayOf, startOfMonth } from '../domain/dates'

/**
 * Quinzaine de paie : rang 1 = du 1er au 15, rang 2 = du 16 à la fin du mois.
 * Toujours deux par mois, sans trou ni recouvrement (spec §3).
 */
export interface Fortnight {
  /** 1er jour du MOIS — sert de clé avec `period` (colonnes `month`/`period`). */
  month: string
  period: 1 | 2
  from: string
  to: string
  /** « 1–15 juillet 2026 ». */
  label: string
}

const make = (month: string, period: 1 | 2, from: string, to: string): Fortnight => ({
  month,
  period,
  from,
  to,
  label: `${Number(from.slice(8, 10))}–${Number(to.slice(8, 10))} ${frMonthLong(from)}`,
})

/** Quinzaine contenant ce jour. */
export function fortnightOf(day: string): Fortnight {
  const month = startOfMonth(day)
  const ym = day.slice(0, 7)
  return Number(day.slice(8, 10)) <= 15
    ? make(month, 1, `${ym}-01`, `${ym}-15`)
    : make(month, 2, `${ym}-16`, endOfMonth(day))
}

/** Les deux quinzaines d'un mois, dans l'ordre. `month` = n'importe quel jour du mois. */
export function fortnightsOfMonth(month: string): [Fortnight, Fortnight] {
  const ym = month.slice(0, 7)
  return [fortnightOf(`${ym}-01`), fortnightOf(`${ym}-16`)]
}

/**
 * Lundis dont la SEMAINE est rattachée à cette quinzaine. Une semaine à cheval part
 * entièrement avec son lundi — jamais découpée (spec §3). Une quinzaine peut donc en
 * contenir 2 ou 3.
 */
export function mondaysIn(f: Fortnight): string[] {
  const out: string[] = []
  for (let d = f.from; d <= f.to; d = addDays(d, 1)) if (mondayOf(d) === d) out.push(d)
  return out
}

/** Tous les jours de la quinzaine, bornes incluses. */
export function daysIn(f: Fortnight): string[] {
  const out: string[] = []
  for (let d = f.from; d <= f.to; d = addDays(d, 1)) out.push(d)
  return out
}

/** Les `n` dernières quinzaines, la plus récente d'abord — alimente le sélecteur de période. */
export function recentFortnights(today: string, n = 12): Fortnight[] {
  const out: Fortnight[] = []
  let cur = fortnightOf(today)
  for (let i = 0; i < n; i++) {
    out.push(cur)
    cur = fortnightOf(addDays(cur.from, -1))
  }
  return out
}
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run : `pnpm --filter @glagency/core test periods`
Expected : PASS, 9 tests.

- [ ] **Step 5 : Exporter depuis le barrel de `core`**

Dans `packages/core/src/index.ts`, ajouter après le bloc `from './domain/dates'` :

```ts
export {
  fortnightOf,
  fortnightsOfMonth,
  recentFortnights,
  mondaysIn,
  daysIn,
  type Fortnight,
} from './compta/periods'
```

- [ ] **Step 6 : Vérifier typecheck + tests**

Run : `pnpm --filter @glagency/core typecheck && pnpm --filter @glagency/core test`
Expected : 0 erreur, tous les tests passent.

- [ ] **Step 7 : Commit**

```bash
git add packages/core/src/compta/periods.ts packages/core/src/compta/periods.test.ts packages/core/src/index.ts
git commit -m "feat(core): découpage en quinzaines de paie + rattachement des semaines par leur lundi"
```

---

### Task 2 : La formule de paie (`packages/core`)

**Files:**
- Create: `packages/core/src/compta/payslip.ts`
- Test: `packages/core/src/compta/payslip.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `round2` de `../domain/dates`.
- Produces: `HANDOFF_EUR`, `interface PayslipInput`, `interface Payslip`, `computePayslip(input: PayslipInput): Payslip`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `packages/core/src/compta/payslip.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { computePayslip, HANDOFF_EUR, type PayslipInput } from './payslip'

const base: PayslipInput = {
  mode: 'percent', rate: 10, fixedAmount: 0, isSetter: false, weekCount: 2,
  modelCa: {}, fixeSetter: 0, bonus: 0, malus: 0, handoffs: 0, primeDue: 0, sanctions: 0,
}

describe('computePayslip — base', () => {
  it('mode percent : somme le CA par modele puis applique le taux', () => {
    const r = computePayslip({ ...base, modelCa: { a: 2500, b: 1700 } })
    expect(r.ca).toBe(4200)
    expect(r.base).toBe(420)
    expect(r.net).toBe(420)
  })

  it('mode fixed : le fixe est HEBDOMADAIRE, multiplie par le nombre de semaines', () => {
    const r = computePayslip({ ...base, mode: 'fixed', fixedAmount: 200, weekCount: 2, modelCa: { a: 9999 } })
    expect(r.base).toBe(400)
    expect(r.ca).toBe(9999) // le CA reste affiche, mais n entre pas dans la base
  })

  it('mode fixed sur une quinzaine a 3 semaines', () => {
    expect(computePayslip({ ...base, mode: 'fixed', fixedAmount: 200, weekCount: 3 }).base).toBe(600)
  })
})

describe('computePayslip — composantes', () => {
  it('le fixe setter ne compte que si is_setter', () => {
    expect(computePayslip({ ...base, fixeSetter: 300, isSetter: false }).setter).toBe(0)
    expect(computePayslip({ ...base, fixeSetter: 300, isSetter: true }).setter).toBe(300)
  })

  it('les handoffs sont payes 0,60 EUR l unite', () => {
    expect(HANDOFF_EUR).toBe(0.6)
    expect(computePayslip({ ...base, handoffs: 12 }).handoffsAmount).toBe(7.2)
  })

  it('cumule le malus manuel ET les sanctions police', () => {
    const r = computePayslip({ ...base, modelCa: { a: 7200 }, malus: 20, sanctions: 45 })
    expect(r.base).toBe(720)
    expect(r.malus).toBe(20)
    expect(r.sanctions).toBe(45)
    expect(r.net).toBe(655)
  })

  it('ajoute la prime quand elle est due', () => {
    expect(computePayslip({ ...base, modelCa: { a: 7200 }, primeDue: 100 }).net).toBe(820)
  })

  it('une quinzaine entierement vide donne 0 partout', () => {
    const r = computePayslip(base)
    expect(r).toEqual({
      ca: 0, base: 0, setter: 0, bonus: 0, malus: 0,
      handoffsAmount: 0, prime: 0, sanctions: 0, net: 0,
    })
  })
})

describe('computePayslip — invariant', () => {
  it('net = base + setter + bonus - malus + handoffs + prime - sanctions', () => {
    const r = computePayslip({
      mode: 'percent', rate: 12.5, fixedAmount: 0, isSetter: true, weekCount: 2,
      modelCa: { a: 3333.33, b: 1111.11 }, fixeSetter: 150, bonus: 50, malus: 20,
      handoffs: 7, primeDue: 100, sanctions: 45,
    })
    const expected =
      r.base + r.setter + r.bonus - r.malus + r.handoffsAmount + r.prime - r.sanctions
    expect(r.net).toBeCloseTo(expected, 2)
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run : `pnpm --filter @glagency/core test payslip`
Expected : FAIL — `Failed to resolve import "./payslip"`.

- [ ] **Step 3 : Écrire l'implémentation**

Créer `packages/core/src/compta/payslip.ts` :

```ts
import { round2 } from '../domain/dates'

/** Tarif d'un passage de relais. Constante métier — jamais un nombre en dur dans un composant. */
export const HANDOFF_EUR = 0.6

/** Entrées de la formule, déjà agrégées sur UNE quinzaine pour UN chatteur. */
export interface PayslipInput {
  mode: 'percent' | 'fixed'
  /** Taux de commission en %, ex. 10 pour 10 %. */
  rate: number
  /** Montant fixe HEBDOMADAIRE (mode `fixed`) — hypothèse spec §4, à confirmer. */
  fixedAmount: number
  isSetter: boolean
  /** Semaines rattachées à la quinzaine (leur lundi y tombe) — 2 ou 3. */
  weekCount: number
  /** CA du chatteur par modèle sur la quinzaine (creatorId → €). */
  modelCa: Record<string, number>
  /** Σ des `fixe_setter` des semaines rattachées. */
  fixeSetter: number
  /** Σ bonus jour + semaine. */
  bonus: number
  /** Σ malus jour + semaine — SAISIS À LA MAIN, hors police. */
  malus: number
  /** Σ handoffs jour + semaine. */
  handoffs: number
  /** Montant de la prime si elle est due sur cette quinzaine, 0 sinon. */
  primeDue: number
  /** Σ `police_entries.amount_eur` (kind = 'malus') sur la quinzaine. */
  sanctions: number
}

export interface Payslip {
  /** CA total, tous modèles — affiché même en mode `fixed`. */
  ca: number
  base: number
  setter: number
  bonus: number
  malus: number
  handoffsAmount: number
  prime: number
  sanctions: number
  net: number
}

/**
 * Fiche de paie d'une quinzaine (spec §4). Fonction PURE : aucune date, aucun accès base —
 * l'appelant a déjà borné et agrégé. C'est ce qui la rend testable.
 *
 * Le pourcentage est appliqué MODÈLE PAR MODÈLE puis sommé : identique à un calcul sur le CA
 * total tant que le taux est unique, mais prêt pour un taux par modèle sans réécriture.
 */
export function computePayslip(i: PayslipInput): Payslip {
  const ca = Object.values(i.modelCa).reduce((s, v) => s + v, 0)
  const base =
    i.mode === 'percent'
      ? Object.values(i.modelCa).reduce((s, v) => s + (v * i.rate) / 100, 0)
      : i.fixedAmount * i.weekCount
  const setter = i.isSetter ? i.fixeSetter : 0
  const handoffsAmount = i.handoffs * HANDOFF_EUR
  const net = base + setter + i.bonus - i.malus + handoffsAmount + i.primeDue - i.sanctions

  return {
    ca: round2(ca),
    base: round2(base),
    setter: round2(setter),
    bonus: round2(i.bonus),
    malus: round2(i.malus),
    handoffsAmount: round2(handoffsAmount),
    prime: round2(i.primeDue),
    sanctions: round2(i.sanctions),
    net: round2(net),
  }
}
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run : `pnpm --filter @glagency/core test payslip`
Expected : PASS, 9 tests.

- [ ] **Step 5 : Exporter depuis le barrel**

Dans `packages/core/src/index.ts`, ajouter :

```ts
export { computePayslip, HANDOFF_EUR, type Payslip, type PayslipInput } from './compta/payslip'
```

- [ ] **Step 6 : Vérifier**

Run : `pnpm --filter @glagency/core typecheck && pnpm --filter @glagency/core test`
Expected : 0 erreur, tous les tests passent.

- [ ] **Step 7 : Commit**

```bash
git add packages/core/src/compta/payslip.ts packages/core/src/compta/payslip.test.ts packages/core/src/index.ts
git commit -m "feat(core): formule de paie d'une quinzaine (handoffs 0,60 €, sanctions déduites)"
```

---

### Task 3 : Migration `0085` — re-cléage sur `profiles`, prime numérique, instantané, RLS

**Files:**
- Create: `packages/db/supabase/migrations/0085_compta_profiles.sql`
- Modify: `packages/db/src/types.ts` (régénéré)

**Interfaces:**
- Produces: tables `compta_*` clées sur `profiles(id)` ; `compta_primes.amount numeric(10,2)` ; colonnes d'instantané sur `compta_payments` ; policies cloisonnées.

- [ ] **Step 1 : Écrire la migration**

Créer `packages/db/supabase/migrations/0085_compta_profiles.sql` :

```sql
-- 0085 — La compta bascule sur `profiles` et devient cloisonnée.
--
-- 1. RE-CLÉAGE. Les tables compta_* étaient clées sur `chatters` (MyPuls) alors que la Police,
--    Membres et le Planning travaillent sur `profiles`. Conséquence mesurée le 2026-07-27 :
--    338 chatteurs MyPuls actifs, dont seulement 72 ont un compte app — la page aurait listé
--    266 personnes sans compte, donc sans sanction possible. On paie les MEMBRES.
--    Les 5 lignes existantes sont vides ou aux valeurs par défaut (donnée de test) : supprimées.
-- 2. `compta_primes.amount` passe de `text` ('100 €') à `numeric` — on ne calcule pas de
--    l'argent en parsant une chaîne.
-- 3. INSTANTANÉ de paiement : le CA est ré-ingéré depuis MyPuls, donc un calcul à la volée
--    verrait un montant DÉJÀ VERSÉ changer rétroactivement. Le détail est figé au paiement.
-- 4. RLS : les policies actuelles donnent la lecture de TOUTE la compta à quiconque a la page.
--    Remplacées par admin = tout, manager/sous-manager = ses rattachés directs.

-- ── 1. Purge + re-cléage ─────────────────────────────────────────────────────────────────

delete from public.compta_payments;
delete from public.compta_day_entries;
delete from public.compta_week_entries;
delete from public.compta_primes;
delete from public.compta_settings;

alter table public.compta_settings     drop constraint compta_settings_chatter_id_fkey;
alter table public.compta_primes       drop constraint compta_primes_chatter_id_fkey;
alter table public.compta_day_entries  drop constraint compta_day_entries_chatter_id_fkey;
alter table public.compta_week_entries drop constraint compta_week_entries_chatter_id_fkey;
alter table public.compta_payments     drop constraint compta_payments_chatter_id_fkey;

alter table public.compta_settings
  add constraint compta_settings_chatter_id_fkey
  foreign key (chatter_id) references public.profiles(id) on delete cascade;
alter table public.compta_primes
  add constraint compta_primes_chatter_id_fkey
  foreign key (chatter_id) references public.profiles(id) on delete cascade;
alter table public.compta_day_entries
  add constraint compta_day_entries_chatter_id_fkey
  foreign key (chatter_id) references public.profiles(id) on delete cascade;
alter table public.compta_week_entries
  add constraint compta_week_entries_chatter_id_fkey
  foreign key (chatter_id) references public.profiles(id) on delete cascade;
alter table public.compta_payments
  add constraint compta_payments_chatter_id_fkey
  foreign key (chatter_id) references public.profiles(id) on delete cascade;

-- ── 2. Prime en numérique ────────────────────────────────────────────────────────────────

alter table public.compta_primes alter column amount drop default;
alter table public.compta_primes
  alter column amount type numeric(10,2) using (nullif(regexp_replace(amount, '[^0-9.]', '', 'g'), '')::numeric);
alter table public.compta_primes alter column amount set default 100;

-- ── 3. Instantané de paiement ────────────────────────────────────────────────────────────
-- `amount` reste le NET versé. Invariant applicatif :
--   amount = base + setter + bonus − malus + handoffs + prime − sanctions

alter table public.compta_payments
  add column if not exists period            smallint not null default 1,
  add column if not exists ca_reference      numeric(10,2) not null default 0,
  add column if not exists mode_applied      text not null default 'percent',
  add column if not exists rate_applied      numeric(5,2) not null default 0,
  add column if not exists base_amount       numeric(10,2) not null default 0,
  add column if not exists setter_amount     numeric(10,2) not null default 0,
  add column if not exists bonus_amount      numeric(10,2) not null default 0,
  add column if not exists malus_amount      numeric(10,2) not null default 0,
  add column if not exists handoffs_amount   numeric(10,2) not null default 0,
  add column if not exists prime_amount      numeric(10,2) not null default 0,
  add column if not exists sanctions_amount  numeric(10,2) not null default 0;

alter table public.compta_payments
  add constraint compta_payments_period_check check (period in (1, 2));
alter table public.compta_payments
  add constraint compta_payments_mode_check check (mode_applied in ('percent', 'fixed'));

-- ── 4. RLS cloisonnée ────────────────────────────────────────────────────────────────────
-- `manages(target)` (0054) = `profiles.manager_id = auth.uid()`. `is_manager()` (0059) couvre
-- manager ET sous-manager. Le chatteur n'a jamais la page : aucune policy ne le mentionne.

drop policy if exists day_entries_admin_all     on public.compta_day_entries;
drop policy if exists day_entries_member_read   on public.compta_day_entries;
drop policy if exists day_entries_member_insert on public.compta_day_entries;
drop policy if exists day_entries_member_update on public.compta_day_entries;
create policy compta_day_entries_scope on public.compta_day_entries for all to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))))
  with check ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));

drop policy if exists compta_week_entries_admin_all on public.compta_week_entries;
drop policy if exists week_entries_member_read      on public.compta_week_entries;
drop policy if exists week_entries_member_insert    on public.compta_week_entries;
drop policy if exists week_entries_member_update    on public.compta_week_entries;
create policy compta_week_entries_scope on public.compta_week_entries for all to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))))
  with check ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));

-- Réglages et primes : lecture pour l'encadrement, écriture admin seule.
drop policy if exists compta_settings_admin_all on public.compta_settings;
create policy compta_settings_read on public.compta_settings for select to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));
create policy compta_settings_admin_write on public.compta_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists compta_primes_admin_all on public.compta_primes;
create policy compta_primes_read on public.compta_primes for select to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));
create policy compta_primes_admin_write on public.compta_primes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Paiements : lecture pour l'encadrement, ÉCRITURE ADMIN SEULE (les virements).
drop policy if exists compta_payments_admin_all on public.compta_payments;
drop policy if exists payments_member_read      on public.compta_payments;
create policy compta_payments_read on public.compta_payments for select to authenticated
  using ((select public.is_admin()) or ((select public.is_manager()) and (select public.manages(chatter_id))));
create policy compta_payments_admin_write on public.compta_payments for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
```

- [ ] **Step 2 : Prévisualiser sur l'UAT**

```bash
cd packages/db
DBU=$(grep '^DATABASE_URL_UAT=' ../../.env | cut -d= -f2- | sed 's/^"//; s/"$//')
supabase db push --db-url "$DBU" --dry-run
```

Expected : « Would push these migrations: 0085_compta_profiles.sql ».

- [ ] **Step 3 : Appliquer sur l'UAT**

```bash
supabase db push --db-url "$DBU"
```

Expected : « Applying migration 0085_compta_profiles.sql… Finished ».

- [ ] **Step 4 : Vérifier la bascule**

```bash
psql "$DBU" -tAc "
select rel.relname||' -> '||confrel.relname
from pg_constraint con
join pg_class rel on rel.oid=con.conrelid
join pg_class confrel on confrel.oid=con.confrelid
where rel.relname like 'compta%' and con.contype='f' and con.conname like '%chatter_id%'
order by 1;
select 'primes.amount = '||data_type from information_schema.columns
where table_name='compta_primes' and column_name='amount';
"
```

Expected : les 5 tables pointent vers `profiles`, et `primes.amount = numeric`.

- [ ] **Step 5 : Régénérer les types**

```bash
cd packages/db
DBU=$(grep '^DATABASE_URL_UAT=' ../../.env | cut -d= -f2- | sed 's/^"//; s/"$//')
supabase gen types typescript --db-url "$DBU" --schema public > src/types.ts
```

Vérifier que `compta_payments` contient bien `period`, `base_amount`, `sanctions_amount`.

- [ ] **Step 6 : Commit**

```bash
git add packages/db/supabase/migrations/0085_compta_profiles.sql packages/db/src/types.ts
git commit -m "feat(db): compta clée sur profiles, prime numérique, instantané de paiement, RLS cloisonnée"
```

> **Prod** : ne PAS pousser `0085` en production sans validation explicite du propriétaire. Elle SUPPRIME des lignes (vides, mais tout de même) et remplace des policies.

---

### Task 4 : Contrat de domaine et schémas de la feature

**Files:**
- Create: `apps/web/src/features/compta/types.ts`
- Create: `apps/web/src/features/compta/schema.ts`

**Interfaces:**
- Consumes: `Fortnight`, `Payslip` de `@glagency/core`.
- Produces: `interface ComptaSanction`, `interface ComptaRow`, `interface ComptaData`, `dayEntryInput`, `weekEntryInput`, `payInput`, et les types inférés `DayEntryInput`, `WeekEntryInput`, `PayInput`.

- [ ] **Step 1 : Écrire `types.ts`**

```ts
import type { Fortnight, Payslip } from '@glagency/core'

/** Une sanction Police rattachée à la quinzaine — affichée avec son motif. */
export interface ComptaSanction {
  day: string
  /** Libellé du motif (`POLICE_ERRORS`), ou null pour un malus libre. */
  label: string | null
  /** 0 € pour un avertissement. */
  amount: number
  kind: 'warning' | 'malus'
}

/** Une ligne de la pile : un chatteur sur la quinzaine affichée. */
export interface ComptaRow {
  /** `profiles.id` — la compta est clée sur les MEMBRES depuis 0085. */
  id: string
  name: string
  role: string
  /** `profiles.chatter_id` — null = non relié à MyPuls, donc aucun CA calculable. */
  chatterId: string | null
  mode: 'percent' | 'fixed'
  rate: number
  fixedAmount: number
  isSetter: boolean
  handoffs: number
  /** CA par modèle (nom du modèle → €), pour la ventilation de la fiche. */
  modelCa: Record<string, number>
  sanctions: ComptaSanction[]
  /** Saisies hebdo existantes, indexées par lundi — alimente le formulaire de saisie. */
  weekEntries: Record<
    string,
    { bonus: number; malus: number; handoffs: number; fixeSetter: number; note: string | null }
  >
  payslip: Payslip
  /** Tous les jours de la quinzaine sont couverts par un paiement. */
  paid: boolean
  paidOn: string | null
}

export interface ComptaData {
  fortnight: Fortnight
  /** Quinzaines proposées au sélecteur, la plus récente d'abord. */
  choices: Fortnight[]
  rows: ComptaRow[]
  /** Quinzaines ÉCHUES dont un jour n'est couvert par aucun paiement. */
  overdue: Fortnight[]
}
```

- [ ] **Step 2 : Écrire `schema.ts`**

```ts
import { z } from 'zod'

/**
 * Compta — schémas PARTAGÉS entre les formulaires (RHF + zodResolver) et les Server Actions,
 * même patron que `features/planning/schema.ts`.
 */

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ')
const money = z.coerce.number().min(0, 'Montant positif attendu').max(99999, 'Montant trop élevé')

/** Saisie d'un JOUR (bonus/malus/handoffs). */
export const dayEntryInput = z.object({
  chatterId: z.uuid(),
  date: iso,
  bonus: money,
  malus: money,
  handoffs: z.coerce.number().int().min(0).max(999),
  note: z.string().trim().max(500, '500 caractères max').nullable(),
})
export type DayEntryInput = z.infer<typeof dayEntryInput>

/** Saisie d'une SEMAINE (idem + fixe setter). */
export const weekEntryInput = z.object({
  chatterId: z.uuid(),
  weekStart: iso,
  bonus: money,
  malus: money,
  handoffs: z.coerce.number().int().min(0).max(999),
  fixeSetter: money,
  note: z.string().trim().max(500, '500 caractères max').nullable(),
})
export type WeekEntryInput = z.infer<typeof weekEntryInput>

/** Paiement d'une quinzaine — porte l'INSTANTANÉ figé (spec §5.3). */
export const payInput = z.object({
  chatterId: z.uuid(),
  month: iso,
  period: z.union([z.literal(1), z.literal(2)]),
  coveredDays: z.array(iso).min(1, 'Au moins un jour couvert'),
  amount: money,
  caReference: money,
  modeApplied: z.enum(['percent', 'fixed']),
  rateApplied: money,
  baseAmount: money,
  setterAmount: money,
  bonusAmount: money,
  malusAmount: money,
  handoffsAmount: money,
  primeAmount: money,
  sanctionsAmount: money,
  note: z.string().trim().max(500, '500 caractères max').nullable(),
})
export type PayInput = z.infer<typeof payInput>
```

- [ ] **Step 3 : Vérifier**

Run : `pnpm --filter @glagency/web typecheck`
Expected : 0 erreur.

- [ ] **Step 4 : Commit**

```bash
git add apps/web/src/features/compta/types.ts apps/web/src/features/compta/schema.ts
git commit -m "feat(compta): contrat de domaine et schémas Zod partagés"
```

---

### Task 5 : Service de lecture d'une quinzaine

**Files:**
- Modify: `apps/web/src/features/compta/services/get-compta.ts` (remplace le stub)

**Interfaces:**
- Consumes: `fortnightOf`, `recentFortnights`, `mondaysIn`, `daysIn`, `computePayslip`, `todayParis` de `@glagency/core` ; `ComptaData`, `ComptaRow`, `ComptaSanction` de `../types` ; `fetchAll` de `@/lib/supabase/fetch-all` ; `POLICE_ERRORS` **dupliqué localement** (import cross-feature interdit).
- Produces: `getCompta(params: { month?: string; period?: string }): Promise<ComptaData>`.

- [ ] **Step 1 : Écrire le service**

Remplacer entièrement `apps/web/src/features/compta/services/get-compta.ts` :

```ts
import {
  computePayslip,
  daysIn,
  fortnightOf,
  mondaysIn,
  recentFortnights,
  todayParis,
  type Fortnight,
} from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { ComptaData, ComptaRow, ComptaSanction } from '../types'

/** Motifs de sanction — copie locale : `features/police` est une AUTRE feature, import interdit
 *  (ESLint `import-x/no-restricted-paths`). Garder aligné sur `features/police/types.ts`. */
const ERROR_LABEL: Record<string, string> = {
  media_argent: 'Parle de média/argent directement',
  reactivite: 'Réponse > 45 s par sub',
  media_rapide: 'Envoi de média trop rapide',
  fautes: "Fautes d'orthographe",
  setter_lent: 'Ne récupère pas vite les nouveaux (setter)',
  hors_script: "Ne suit pas l'histoire du script",
  sexu_faible: 'Sexualisation faible (ne fait pas baver)',
  promesse: 'Promesse non tenue (setter)',
  temps_media: "N'attend pas le temps du média",
  infos_non_transmises: 'Ne transmet pas les infos',
  infos_non_notees: 'Ne note pas les infos',
}

interface CcdRow {
  chatter_id: string
  creator_id: string
  date: string
  ca: number | null
}

/**
 * Compta d'UNE quinzaine. Le cloisonnement est porté par la RLS (0085) : admin → tout,
 * manager/sous-manager → ses rattachés directs. La population vient de `profiles` (rôle
 * chatteur), pas de `chatters` : c'est le membre qu'on paie.
 */
export async function getCompta({
  month,
  period,
}: {
  month?: string
  period?: string
}): Promise<ComptaData> {
  const supabase = await createClient()
  const today = todayParis()
  const choices = recentFortnights(today, 12)

  // `?month=`/`?period=` validés PAR APPARTENANCE à la fenêtre proposée, jamais par regex seule.
  const wanted = choices.find((f) => f.month === month && f.period === Number(period))
  const fortnight: Fortnight = wanted ?? choices[0]
  const days = daysIn(fortnight)
  const mondays = mondaysIn(fortnight)
  const from = fortnight.from
  const to = fortnight.to

  const [
    { data: members, error: membersErr },
    { data: settings, error: settingsErr },
    { data: primes, error: primesErr },
    { data: dayEntries, error: dayErr },
    { data: weekEntries, error: weekErr },
    { data: payments, error: payErr },
    { data: sanctions, error: sancErr },
    { data: creators, error: creatorsErr },
  ] = await Promise.all([
    supabase.from('profiles').select('id, display_name, email, role, chatter_id').eq('role', 'chatteur').order('display_name'),
    supabase.from('compta_settings').select('*'),
    supabase.from('compta_primes').select('*').eq('status', 'due'),
    supabase.from('compta_day_entries').select('*').gte('date', from).lte('date', to),
    supabase.from('compta_week_entries').select('*').in('week_start', mondays.length ? mondays : ['1970-01-01']),
    supabase.from('compta_payments').select('*'),
    supabase.from('police_entries').select('chatter_id, occurred_on, kind, error_key, amount_eur').gte('occurred_on', from).lte('occurred_on', to),
    supabase.from('creators').select('id, name'),
  ])
  if (membersErr) throw new Error(membersErr.message)
  if (settingsErr) throw new Error(settingsErr.message)
  if (primesErr) throw new Error(primesErr.message)
  if (dayErr) throw new Error(dayErr.message)
  if (weekErr) throw new Error(weekErr.message)
  if (payErr) throw new Error(payErr.message)
  if (sancErr) throw new Error(sancErr.message)
  if (creatorsErr) throw new Error(creatorsErr.message)

  // CA par (chatteur MyPuls, modèle) sur la quinzaine. `fetchAll` : table de faits journaliers,
  // troncature SILENCIEUSE à 1000 lignes sinon (guidelines-data-loading §2).
  const linked = (members ?? []).map((m) => m.chatter_id).filter((v): v is string => v != null)
  const { data: ccd, error: ccdErr } = linked.length
    ? await fetchAll<CcdRow>((f, t) =>
        supabase
          .from('chatter_creator_daily')
          .select('chatter_id, creator_id, date, ca')
          .in('chatter_id', linked)
          .gte('date', from)
          .lte('date', to)
          .order('chatter_id')
          .order('creator_id')
          .order('date')
          .range(f, t),
      )
    : { data: [], error: null }
  if (ccdErr) throw new Error(ccdErr.message)

  const creatorName = new Map((creators ?? []).map((c) => [c.id, c.name]))
  const caByChatter = new Map<string, Record<string, number>>()
  for (const r of ccd) {
    const m = caByChatter.get(r.chatter_id) ?? {}
    const name = creatorName.get(r.creator_id) ?? '—'
    m[name] = (m[name] ?? 0) + (r.ca ?? 0)
    caByChatter.set(r.chatter_id, m)
  }

  const settingsById = new Map((settings ?? []).map((s) => [s.chatter_id, s]))
  const primeById = new Map((primes ?? []).map((p) => [p.chatter_id, Number(p.amount)]))
  const daySet = new Set(days)

  // Jours couverts, TOUTES quinzaines confondues — sert à deux choses : décider si la
  // quinzaine affichée est soldée, et trouver la plus ancienne non couverte (règle de prime).
  const coveredAll = new Set<string>()
  for (const p of payments ?? []) {
    for (const d of (p.covered_days as string[] | null) ?? []) coveredAll.add(d)
  }
  // La prime ne s'affiche que sur la quinzaine ÉCHUE LA PLUS ANCIENNE non couverte (spec §4).
  // Sans ça, deux quinzaines impayées l'afficheraient chacune, laissant croire qu'elle est due
  // deux fois. `choices` est trié du plus récent au plus ancien → on prend la dernière.
  const oldestOpen = [...choices].reverse().find((f) => daysIn(f).some((d) => !coveredAll.has(d)))
  const primeApplies =
    oldestOpen != null &&
    oldestOpen.month === fortnight.month &&
    oldestOpen.period === fortnight.period

  const rows: ComptaRow[] = (members ?? []).map((m) => {
    const s = settingsById.get(m.id)
    const mine = (arr: { chatter_id: string }[]) => arr.filter((x) => x.chatter_id === m.id)

    const de = mine(dayEntries ?? [])
    const we = mine(weekEntries ?? [])
    const bonus = de.reduce((t, d) => t + Number(d.bonus), 0) + we.reduce((t, w) => t + Number(w.bonus), 0)
    const malus = de.reduce((t, d) => t + Number(d.malus), 0) + we.reduce((t, w) => t + Number(w.malus), 0)
    const handoffs = de.reduce((t, d) => t + d.handoffs, 0) + we.reduce((t, w) => t + w.handoffs, 0)
    const fixeSetter = we.reduce((t, w) => t + Number(w.fixe_setter), 0)

    const sancRows: ComptaSanction[] = mine(sanctions ?? []).map((e) => ({
      day: e.occurred_on,
      label: e.error_key ? (ERROR_LABEL[e.error_key] ?? e.error_key) : null,
      amount: Number(e.amount_eur),
      kind: e.kind === 'warning' ? 'warning' : 'malus',
    }))

    const modelCa = m.chatter_id ? (caByChatter.get(m.chatter_id) ?? {}) : {}
    const payslip = computePayslip({
      mode: s?.mode === 'fixed' ? 'fixed' : 'percent',
      rate: Number(s?.rate ?? 10),
      fixedAmount: Number(s?.fixed_amount ?? 0),
      isSetter: s?.is_setter ?? false,
      weekCount: mondays.length,
      modelCa,
      fixeSetter,
      bonus,
      malus,
      handoffs,
      primeDue: primeApplies ? (primeById.get(m.id) ?? 0) : 0,
      sanctions: sancRows.reduce((t, x) => t + x.amount, 0),
    })

    // Couverture : la quinzaine est payée si CHACUN de ses jours figure dans un `covered_days`.
    const covered = new Map<string, string>()
    for (const p of mine(payments ?? [])) {
      for (const d of (p.covered_days as string[] | null) ?? []) if (daySet.has(d)) covered.set(d, p.paid_at)
    }
    const paid = days.every((d) => covered.has(d))

    return {
      id: m.id,
      name: m.display_name ?? m.email ?? '—',
      role: m.role,
      chatterId: m.chatter_id,
      mode: s?.mode === 'fixed' ? 'fixed' : 'percent',
      rate: Number(s?.rate ?? 10),
      fixedAmount: Number(s?.fixed_amount ?? 0),
      isSetter: s?.is_setter ?? false,
      handoffs,
      modelCa,
      sanctions: sancRows,
      weekEntries: Object.fromEntries(
        we.map((w) => [
          w.week_start,
          {
            bonus: Number(w.bonus),
            malus: Number(w.malus),
            handoffs: w.handoffs,
            fixeSetter: Number(w.fixe_setter),
            note: w.note,
          },
        ]),
      ),
      payslip,
      paid,
      paidOn: paid ? (covered.get(days[0]) ?? null) : null,
    }
  })

  // Quinzaines ÉCHUES incomplètement couvertes — le retard se déduit de la couverture, pas
  // d'une échéance théorique (spec §7).
  const overdue = choices
    .filter((f) => f.to < today && !(f.month === fortnight.month && f.period === fortnight.period))
    .filter((f) => daysIn(f).some((d) => !coveredAll.has(d)))
    .slice(0, 6)

  return { fortnight, choices, rows, overdue }
}
```

- [ ] **Step 2 : Vérifier**

Run : `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint`
Expected : 0 erreur.

- [ ] **Step 3 : Commit**

```bash
git add apps/web/src/features/compta/services/get-compta.ts
git commit -m "feat(compta): lecture d'une quinzaine (CA par modèle, saisies, sanctions, couverture)"
```

---

### Task 6 : Page, Template et pile de noms (lecture seule)

**Files:**
- Modify: `apps/web/src/app/(dash)/chatter/compta/page.tsx`
- Modify: `apps/web/src/app/(dash)/chatter/compta/loading.tsx`
- Modify: `apps/web/src/features/compta/ComptaTemplate.tsx`
- Create: `apps/web/src/features/compta/components/compta-view.tsx`
- Create: `apps/web/src/features/compta/components/compta-skeleton.tsx`

**Interfaces:**
- Consumes: `getCompta` (Task 5), `ComptaData` (Task 4), `MembersAccordion` de `@/components/members-accordion`, `KpiGrid`/`Kpi` de `@/components/kpi-card`, `RowsSkeleton` de `@/components/skeletons/rows-skeleton`, `eur` de `@/lib/format`.
- Produces: `<ComptaTemplate data canPay />`, `<ComptaView data canPay />`, `<ComptaSkeleton />`.

- [ ] **Step 1 : Écrire le squelette**

Créer `apps/web/src/features/compta/components/compta-skeleton.tsx` :

```tsx
import { Skeleton } from '@/components/ui/skeleton'
import { RowsSkeleton } from '@/components/skeletons/rows-skeleton'

/** Silhouette de la page Compta — partagée par `loading.tsx` et le fallback `<Suspense>`
 *  (guidelines-standard-feature §2.4). `RowsSkeleton` porte déjà le `role="status"`. */
export function ComptaSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end" aria-hidden>
        <Skeleton className="h-9 w-56" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
      <RowsSkeleton count={6} />
    </div>
  )
}
```

- [ ] **Step 2 : Écrire la vue client**

Créer `apps/web/src/features/compta/components/compta-view.tsx` :

```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import type { Route } from 'next'
import { mondaysIn } from '@glagency/core'
import { MembersAccordion } from '@/components/members-accordion'
import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { Combobox } from '@/components/ui/combobox'
import { eur } from '@/lib/format'
import { ComptaPayslip } from './compta-payslip'
import type { ComptaData } from '../types'

/**
 * Vue interactive de la Compta : sélecteur de quinzaine, KPIs de la période, puis la pile de
 * noms dépliables (même grammaire que le Planning et le Dashboard). Le sélecteur pousse
 * `?month=`&`?period=` — la page, Server Component, se recharge sur la quinzaine choisie.
 */
export function ComptaView({ data, canPay }: { data: ComptaData; canPay: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const select = (value: string) => {
    const [month, period] = value.split('|')
    const params = new URLSearchParams(searchParams)
    params.set('month', month)
    params.set('period', period)
    startTransition(() => router.replace(`/chatter/compta?${params.toString()}` as Route, { scroll: false }))
  }

  const due = data.rows.filter((r) => !r.paid)
  const kpis: Kpi[] = [
    {
      key: 'due', label: 'À payer', value: eur(due.reduce((s, r) => s + r.payslip.net, 0)),
      deltaPct: null, trendLabel: data.fortnight.label, hint: `${due.length} chatteur${due.length > 1 ? 's' : ''}`,
    },
    {
      key: 'paid', label: 'Déjà payé', value: eur(data.rows.filter((r) => r.paid).reduce((s, r) => s + r.payslip.net, 0)),
      deltaPct: null, trendLabel: 'Quinzaine couverte', hint: `${data.rows.length - due.length} réglé${data.rows.length - due.length > 1 ? 's' : ''}`,
    },
    {
      key: 'ca', label: 'CA de la période', value: eur(data.rows.reduce((s, r) => s + r.payslip.ca, 0)),
      deltaPct: null, trendLabel: 'Base de commission', hint: 'tous modèles',
    },
    {
      key: 'sanctions', label: 'Sanctions', value: eur(-data.rows.reduce((s, r) => s + r.payslip.sanctions, 0)),
      deltaPct: null, trendLabel: 'Retenues Police', hint: `${data.rows.reduce((s, r) => s + r.sanctions.length, 0)} entrée(s)`,
    },
  ]

  return (
    <div className={pending ? 'flex flex-col gap-6 opacity-60' : 'flex flex-col gap-6'}>
      {/* `Combobox` et non `UrlSelect` : ce dernier est typé `param: 'day' | 'month'` et ne
          pilote qu'UN paramètre, alors qu'une quinzaine en demande deux (`month` + `period`). */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground">Quinzaine :</span>
        <Combobox
          value={`${data.fortnight.month}|${data.fortnight.period}`}
          onChange={select}
          disabled={pending}
          className="w-56"
          searchPlaceholder="Rechercher une quinzaine…"
          options={data.choices.map((f) => ({ value: `${f.month}|${f.period}`, label: f.label }))}
        />
      </div>

      <KpiGrid
        kpis={kpis}
        accents={['border-t-blue-500', 'border-t-green-500', 'border-t-violet-500', 'border-t-red-500']}
      />

      {data.overdue.length > 0 && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          {data.overdue.length} quinzaine{data.overdue.length > 1 ? 's' : ''} antérieure
          {data.overdue.length > 1 ? 's' : ''} incomplètement couverte
          {data.overdue.length > 1 ? 's' : ''} : {data.overdue.map((f) => f.label).join(' · ')}
        </p>
      )}

      <MembersAccordion
        items={data.rows}
        hint={(r) =>
          r.chatterId == null ? '⚠ non relié à MyPuls' : r.paid ? `payé le ${r.paidOn}` : `${eur(r.payslip.net)} à payer`
        }
      >
        {(r) => (
          <ComptaPayslip
            row={r}
            fortnight={data.fortnight}
            mondays={mondaysIn(data.fortnight)}
            canPay={canPay}
          />
        )}
      </MembersAccordion>
    </div>
  )
}
```

- [ ] **Step 3 : Écrire le Template**

Remplacer `apps/web/src/features/compta/ComptaTemplate.tsx` :

```tsx
import { ComptaView } from './components/compta-view'
import type { ComptaData } from './types'

/**
 * Compta — paie des chatteurs par quinzaine. Server Component, aucun fetch (données en props,
 * récupérées par `app/(dash)/chatter/compta/page.tsx`). Toute l'interactivité vit dans
 * `ComptaView` : sélecteur de période, pile de noms, saisies et paiement.
 */
export function ComptaTemplate({ data, canPay }: { data: ComptaData; canPay: boolean }) {
  return <ComptaView data={data} canPay={canPay} />
}
```

- [ ] **Step 4 : Écrire la page**

Remplacer `apps/web/src/app/(dash)/chatter/compta/page.tsx` :

```tsx
import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { getCompta } from '@/features/compta/services/get-compta'
import { ComptaTemplate } from '@/features/compta/ComptaTemplate'
import { ComptaSkeleton } from '@/features/compta/components/compta-skeleton'

/**
 * Compta = paie des chatteurs, par quinzaine (1–15 / 16–fin). L'admin voit tout et exécute les
 * virements ; manager et sous-manager gèrent les saisies de LEURS rattachés (RLS 0085). Le
 * chatteur n'a jamais la page.
 */
export default async function ComptaPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; period?: string }>
}) {
  const profile = await requireAccess('compta')
  const { month, period } = await searchParams

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Compta</h1>
      <Suspense fallback={<ComptaSkeleton />}>
        <ComptaContent month={month} period={period} canPay={profile.role === 'admin'} />
      </Suspense>
    </div>
  )
}

async function ComptaContent({
  month,
  period,
  canPay,
}: {
  month?: string
  period?: string
  canPay: boolean
}) {
  return <ComptaTemplate data={await getCompta({ month, period })} canPay={canPay} />
}
```

- [ ] **Step 5 : Écrire `loading.tsx`**

Remplacer `apps/web/src/app/(dash)/chatter/compta/loading.tsx` :

```tsx
import { Skeleton } from '@/components/ui/skeleton'
import { ComptaSkeleton } from '@/features/compta/components/compta-skeleton'

/** Silhouette de la route (préfetchable). Le vrai `h1` s'affiche dès que `page.tsx` rend. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton aria-hidden="true" className="h-8 w-40" />
      <ComptaSkeleton />
    </div>
  )
}
```

- [ ] **Step 6 : Vérifier**

Run : `pnpm --filter @glagency/web typecheck`
Expected : une seule erreur, `Cannot find module './compta-payslip'` — c'est la Task 7.

- [ ] **Step 7 : Commit (après la Task 7, qui débloque le typecheck)**

Ne pas commiter seul : enchaîner sur la Task 7 puis commiter les deux ensemble.

---

### Task 7 : La fiche de paie dépliée

**Files:**
- Create: `apps/web/src/features/compta/components/compta-payslip.tsx`

**Interfaces:**
- Consumes: `ComptaRow` (Task 4), `Fortnight` de `@glagency/core`, `eur` de `@/lib/format`, `frDayShort` de `@glagency/core`.
- Produces: `<ComptaPayslip row fortnight canPay />`.

- [ ] **Step 1 : Écrire le composant**

```tsx
'use client'

import { frDayShort, type Fortnight } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { eur } from '@/lib/format'
import { modelColor } from '@/lib/model-color'
import type { ComptaRow } from '../types'

/** Une ligne de la fiche : libellé à gauche, montant aligné à droite en tabulaire. */
function Line({ label, amount, muted }: { label: string; amount: number; muted?: boolean }) {
  return (
    <div className={muted ? 'flex justify-between text-sm text-muted-foreground' : 'flex justify-between text-sm'}>
      <span>{label}</span>
      <span className="tabular-nums">{eur(amount)}</span>
    </div>
  )
}

/**
 * Fiche de paie d'un chatteur sur une quinzaine — le détail de la formule, ligne à ligne, avec
 * les motifs de sanction en clair. Un chatteur non relié à MyPuls affiche un avertissement au
 * lieu d'un 0 € trompeur : sans lien, aucun CA n'est calculable (spec §7).
 */
export function ComptaPayslip({
  row,
  fortnight,
  mondays,
  canPay,
}: {
  row: ComptaRow
  fortnight: Fortnight
  /** Lundis des semaines rattachées — un formulaire de saisie par semaine (tâche 8). */
  mondays: string[]
  canPay: boolean
}) {
  const p = row.payslip

  if (row.chatterId == null) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Aucun chatteur MyPuls relié à ce membre — son CA ne peut pas être calculé. Le lien se
        pose dans <span className="font-medium text-foreground">Membres</span>.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Line
          label={
            row.mode === 'percent'
              ? `Commission — ${eur(p.ca)} × ${row.rate} %`
              : `Fixe hebdomadaire — ${eur(row.fixedAmount)} × ${fortnight.label}`
          }
          amount={p.base}
        />
        {row.isSetter && <Line label="Fixe setter" amount={p.setter} />}
        {p.bonus !== 0 && <Line label="Bonus" amount={p.bonus} />}
        {p.malus !== 0 && <Line label="Malus saisis" amount={-p.malus} />}
        {row.handoffs > 0 && <Line label={`Handoffs — ${row.handoffs} × 0,60 €`} amount={p.handoffsAmount} />}
        {p.prime !== 0 && <Line label="Prime nouveau chatteur" amount={p.prime} />}
      </div>

      {row.sanctions.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border-l-2 border-red-500 bg-muted/40 p-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
            Sanctions Police — {eur(-p.sanctions)}
          </span>
          {row.sanctions.map((s, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span>
                {frDayShort(s.day)} — {s.label ?? 'Malus'}
              </span>
              <span className="tabular-nums">
                {s.kind === 'warning' ? 'avertissement' : eur(-s.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {Object.keys(row.modelCa).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(row.modelCa)
            .sort(([, a], [, b]) => b - a)
            .map(([name, ca]) => (
              <Badge key={name} className={modelColor(name)}>
                {name} · {eur(ca)}
              </Badge>
            ))}
        </div>
      )}

      <div className="flex justify-between border-t pt-2 text-base font-semibold">
        <span>Net à payer</span>
        <span className="tabular-nums">{eur(p.net)}</span>
      </div>

      {canPay && !row.paid && (
        <p className="text-xs text-muted-foreground">
          Le bouton de paiement arrive à la tâche 9.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2 : Vérifier**

Run : `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint`
Expected : 0 erreur.

- [ ] **Step 3 : Commit**

```bash
git add apps/web/src/features/compta apps/web/src/app/\(dash\)/chatter/compta
git commit -m "feat(compta): page, pile de noms et fiche de paie détaillée (lecture)"
```

---

### Task 8 : Saisie des bonus, malus et handoffs

**Files:**
- Create: `apps/web/src/features/compta/actions.ts`
- Create: `apps/web/src/features/compta/components/compta-entry-form.tsx`
- Modify: `apps/web/src/features/compta/components/compta-payslip.tsx`

**Interfaces:**
- Consumes: `runAction`, `managerPageGuard`, `BusinessError`, `ActionResult` de `@/lib/actions` ; `weekEntryInput` (Task 4).
- Produces: `saveWeekEntry(raw: unknown): Promise<ActionResult>`.

- [ ] **Step 1 : Écrire l'action**

Créer `apps/web/src/features/compta/actions.ts` :

```ts
'use server'

// Server Actions de la Compta. Saisies = manager/sous-manager sur SES rattachés
// (`managerPageGuard` + RLS 0085) ; le paiement viendra avec `adminGuard` (tâche 9).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { runAction, managerPageGuard, BusinessError, type ActionResult } from '@/lib/actions'
import { weekEntryInput } from './schema'

/**
 * Crée ou met à jour la saisie HEBDOMADAIRE d'un chatteur (bonus, malus, handoffs, fixe
 * setter). Upsert sur la clé métier `(chatter_id, week_start)`. La RLS refuse la ligne si la
 * cible n'est pas un rattaché direct — la garde applicative n'est que la défense en profondeur.
 */
export async function saveWeekEntry(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: weekEntryInput,
    input: raw,
    guard: managerPageGuard('compta'),
    handler: async (v) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée')
      const supabase = await createClient()
      const { error } = await supabase.from('compta_week_entries').upsert(
        {
          chatter_id: v.chatterId,
          week_start: v.weekStart,
          bonus: v.bonus,
          malus: v.malus,
          handoffs: v.handoffs,
          fixe_setter: v.fixeSetter,
          note: v.note,
          updated_at: new Date().toISOString(),
          updated_by: profile.id,
        },
        { onConflict: 'chatter_id,week_start' },
      )
      // 42501 = violation RLS : la cible est hors périmètre. Message MÉTIER, pas Sentry.
      if (error?.code === '42501') throw new BusinessError("Ce chatteur n'est pas dans ton périmètre.")
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/compta')
    },
  })
}
```

- [ ] **Step 2 : Écrire le formulaire**

Créer `apps/web/src/features/compta/components/compta-entry-form.tsx` :

```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionButton } from '@/components/action-button'
import { saveWeekEntry } from '../actions'
import { weekEntryInput, type WeekEntryInput } from '../schema'

/**
 * Saisie hebdomadaire (bonus, malus, handoffs, fixe setter). Une semaine appartient
 * entièrement à la quinzaine de son lundi — elle n'est jamais découpée.
 */
export function ComptaEntryForm({
  chatterId,
  weekStart,
  weekLabel,
  initial,
  isSetter,
  onSaved,
}: {
  chatterId: string
  weekStart: string
  weekLabel: string
  initial: { bonus: number; malus: number; handoffs: number; fixeSetter: number; note: string | null }
  isSetter: boolean
  onSaved?: () => void
}) {
  'use no memo'

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<WeekEntryInput>({
    resolver: zodResolver(weekEntryInput),
    defaultValues: { chatterId, weekStart, ...initial },
  })

  const submit = handleSubmit(async (values) => {
    const res = await saveWeekEntry(values)
    if (!res.success) {
      setError('root.serverError', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success('Saisie enregistrée')
    onSaved?.()
  })

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Semaine du {weekLabel}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor={`bonus-${weekStart}`}>Bonus €</Label>
          <Input id={`bonus-${weekStart}`} type="number" step="0.01" {...register('bonus')} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`malus-${weekStart}`}>Malus €</Label>
          <Input id={`malus-${weekStart}`} type="number" step="0.01" {...register('malus')} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`handoffs-${weekStart}`}>Handoffs</Label>
          <Input id={`handoffs-${weekStart}`} type="number" {...register('handoffs')} />
        </div>
        {isSetter && (
          <div className="grid gap-1.5">
            <Label htmlFor={`fixe-${weekStart}`}>Fixe setter €</Label>
            <Input id={`fixe-${weekStart}`} type="number" step="0.01" {...register('fixeSetter')} />
          </div>
        )}
      </div>
      {errors.root?.serverError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errors.root.serverError.message}
        </p>
      )}
      <ActionButton type="submit" pending={isSubmitting} className="self-end">
        Enregistrer
      </ActionButton>
    </form>
  )
}
```

- [ ] **Step 3 : Brancher le formulaire dans la fiche**

Tout est déjà en place : `ComptaRow.weekEntries` est défini en tâche 4 et rempli en tâche 5,
`ComptaPayslip` reçoit déjà `mondays` en tâche 7, et `compta-view.tsx` le passe déjà. **Ne rien
ajouter à `types.ts` ni à `get-compta.ts`** — vérifier que les trois existent, puis une seule
modification dans `compta-payslip.tsx` : importer `ComptaEntryForm` et remplacer le paragraphe
« Le bouton de paiement arrive à la tâche 9. » par

```tsx
      {canPay &&
        mondays.map((m) => (
          <ComptaEntryForm
            key={m}
            chatterId={row.id}
            weekStart={m}
            weekLabel={frDayShort(m)}
            isSetter={row.isSetter}
            initial={
              row.weekEntries[m] ?? { bonus: 0, malus: 0, handoffs: 0, fixeSetter: 0, note: null }
            }
          />
        ))}
```

Pas de `onSaved` ici : `initial` vient des props SERVEUR, que `revalidatePath('/chatter/compta')`
rafraîchit déjà. C'est la différence avec le Dashboard, dont le panneau détient ses données en
état client — là-bas le rappel était indispensable.

- [ ] **Step 4 : Vérifier**

Run : `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint`
Expected : 0 erreur.

- [ ] **Step 5 : Commit**

```bash
git add apps/web/src/features/compta
git commit -m "feat(compta): saisie hebdomadaire des bonus, malus, handoffs et fixe setter"
```

---

### Task 9 : Paiement et instantané figé

**Files:**
- Modify: `apps/web/src/features/compta/actions.ts`
- Create: `apps/web/src/features/compta/components/compta-pay-dialog.tsx`
- Modify: `apps/web/src/features/compta/components/compta-payslip.tsx`

**Interfaces:**
- Consumes: `adminGuard` de `@/lib/actions`, `payInput` (Task 4), `daysIn` de `@glagency/core`.
- Produces: `payFortnight(raw: unknown): Promise<ActionResult>`.

- [ ] **Step 1 : Ajouter l'action de paiement**

Dans `apps/web/src/features/compta/actions.ts`, ajouter :

```ts
import { adminGuard } from '@/lib/actions'
import { payInput } from './schema'

/**
 * Enregistre le paiement d'une quinzaine avec son INSTANTANÉ (spec §5.3). `adminGuard` : les
 * virements sont le fait de l'admin seul, un manager ne fait que saisir. Le détail est figé
 * ici — le CA étant ré-ingéré depuis MyPuls, un recalcul ultérieur ferait bouger un montant
 * déjà versé.
 */
export async function payFortnight(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: payInput,
    input: raw,
    guard: adminGuard,
    handler: async (v) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée')
      const supabase = await createClient()

      const { data: existing, error: readErr } = await supabase
        .from('compta_payments')
        .select('id')
        .eq('chatter_id', v.chatterId)
        .eq('month', v.month)
        .eq('period', v.period)
        .maybeSingle()
      if (readErr) throw new Error(readErr.message)
      if (existing) throw new BusinessError('Cette quinzaine a déjà été payée pour ce chatteur.')

      const { error } = await supabase.from('compta_payments').insert({
        chatter_id: v.chatterId,
        month: v.month,
        period: v.period,
        covered_days: v.coveredDays,
        amount: v.amount,
        ca_reference: v.caReference,
        mode_applied: v.modeApplied,
        rate_applied: v.rateApplied,
        base_amount: v.baseAmount,
        setter_amount: v.setterAmount,
        bonus_amount: v.bonusAmount,
        malus_amount: v.malusAmount,
        handoffs_amount: v.handoffsAmount,
        prime_amount: v.primeAmount,
        sanctions_amount: v.sanctionsAmount,
        note: v.note,
        paid_by: profile.id,
      })
      if (error) throw new Error(error.message)

      // La prime n'est due qu'UNE fois : si elle entrait dans ce paiement, elle est soldée.
      if (v.primeAmount > 0) {
        const { error: primeErr } = await supabase
          .from('compta_primes')
          .update({ status: 'paid', paid_at: new Date().toISOString().slice(0, 10), updated_by: profile.id })
          .eq('chatter_id', v.chatterId)
        if (primeErr) throw new Error(primeErr.message)
      }

      revalidatePath('/chatter/compta')
    },
  })
}
```

- [ ] **Step 2 : Écrire le dialog de confirmation**

Créer `apps/web/src/features/compta/components/compta-pay-dialog.tsx` :

```tsx
'use client'

import { daysIn, type Fortnight } from '@glagency/core'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { eur } from '@/lib/format'
import { payFortnight } from '../actions'
import type { ComptaRow } from '../types'

/**
 * Confirmation de paiement — ADMIN seul (le bouton n'est même pas monté sinon, et `adminGuard`
 * refuse l'action côté serveur). Envoie l'INSTANTANÉ complet : le détail est figé au moment du
 * virement, une correction du CA après coup ne le modifiera plus.
 */
export function ComptaPayDialog({ row, fortnight }: { row: ComptaRow; fortnight: Fortnight }) {
  const p = row.payslip
  return (
    <ConfirmDialog
      title={`Payer ${row.name} — ${eur(p.net)} ?`}
      description="Le détail du calcul sera figé : une correction du CA après coup ne modifiera plus ce paiement."
      trigger={
        <Button size="sm" className="self-end">
          Marquer payé
        </Button>
      }
      // Renvoyer le message d'erreur garde le dialog ouvert et l'affiche.
      onConfirm={async () => {
        const res = await payFortnight({
          chatterId: row.id,
          month: fortnight.month,
          period: fortnight.period,
          coveredDays: daysIn(fortnight),
          amount: p.net,
          caReference: p.ca,
          modeApplied: row.mode,
          rateApplied: row.rate,
          baseAmount: p.base,
          setterAmount: p.setter,
          bonusAmount: p.bonus,
          malusAmount: p.malus,
          handoffsAmount: p.handoffsAmount,
          primeAmount: p.prime,
          sanctionsAmount: p.sanctions,
          note: null,
        })
        if (!res.success) {
          toast.error(res.error)
          return res.error
        }
        toast.success('Paiement enregistré')
      }}
    />
  )
}
```

- [ ] **Step 3 : Brancher dans la fiche**

Dans `compta-payslip.tsx`, importer `ComptaPayDialog` et remplacer le paragraphe provisoire
« Le bouton de paiement arrive à la tâche 9. » par :

```tsx
      {canPay && !row.paid && row.chatterId != null && (
        <ComptaPayDialog row={row} fortnight={fortnight} />
      )}
```

- [ ] **Step 4 : Vérifier**

Run : `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint`
Expected : 0 erreur.

- [ ] **Step 5 : Commit**

```bash
git add apps/web/src/features/compta
git commit -m "feat(compta): paiement d'une quinzaine avec instantané figé (admin seul)"
```

---

### Task 10 : Vérification finale

**Files:** aucun (vérification)

- [ ] **Step 1 : Vérifier l'ensemble**

```bash
pnpm --filter @glagency/core typecheck && pnpm --filter @glagency/core test
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint
pnpm --filter @glagency/web build
```

Expected : 0 erreur ; les warnings ESLint préexistants (`data-table.tsx`, `ComptaTemplate` n'en fait plus partie) subsistent.

- [ ] **Step 2 : Vérifier les requêtes contre l'UAT**

Rejouer les requêtes de `get-compta.ts` avec la clé service, comme fait le 2026-07-27 pour la
compta et les rapports : vérifier que `profiles` rôle chatteur, `chatter_creator_daily` sur la
quinzaine et `police_entries` renvoient des formes exploitables.

- [ ] **Step 3 : Faire tester la page**

`apps/web` n'a aucun harnais de test et l'extension navigateur n'est pas connectée : la
vérification fonctionnelle revient au propriétaire, sur la preview UAT. Points à éprouver :
sélecteur de quinzaine, ligne « non relié à MyPuls », saisie hebdo par un manager sur un
rattaché **et** sur un non-rattaché (doit être refusé), paiement par un admin, invisibilité du
bouton de paiement pour un manager, bandeau de retard.

- [ ] **Step 4 : Commit final**

```bash
git commit --allow-empty -m "chore(compta): vérification de bout en bout"
```

---

## Ce que ce plan ne fait pas

- `/marketing/compta` (paie du staff) reste un placeholder.
- `compta_debts` n'est pas exploité — registre indépendant de la paie (spec §9).
- Aucun taux par modèle : la base est calculée modèle par modèle pour le permettre plus tard,
  mais `compta_settings` n'a qu'un `rate`.
- Aucune saisie JOURNALIÈRE dans l'UI (`compta_day_entries` est lu et sommé, mais la saisie se
  fait à la semaine). À ajouter si le besoin apparaît.
- Aucun export comptable.
- `0085` n'est pas poussée en production par ce plan.
