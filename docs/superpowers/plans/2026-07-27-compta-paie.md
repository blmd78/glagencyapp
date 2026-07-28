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
| `packages/db/supabase/migrations/0085_compta_paie.sql` | **Migration unique de la feature** (fusion 0085→0095 du 2026-07-28, prod restée à 0084) : re-cléage sur `profiles`, périodes de 14 jours, taux daté (`compta_rates`), instantané de paiement, barème setter, RLS cloisonnée — spec §5. |
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

-- AUCUN `default` — volontaire, arbitré le 2026-07-27. Un défaut rendrait ces colonnes
-- OPTIONNELLES dans le type `Insert` généré : un enregistrement de paiement omettant
-- `sanctions_amount` compilerait et écrirait 0 €, faisant disparaître une retenue sans bruit.
-- Sans défaut, TypeScript exige les 8 composantes à chaque paiement. La table est purgée
-- juste au-dessus, donc aucune ligne existante à remplir : le défaut ne servait à rien.
alter table public.compta_payments
  add column if not exists period            smallint not null,
  add column if not exists ca_reference      numeric(10,2) not null,
  add column if not exists mode_applied      text not null,
  add column if not exists rate_applied      numeric(5,2) not null,
  add column if not exists base_amount       numeric(10,2) not null,
  add column if not exists setter_amount     numeric(10,2) not null,
  add column if not exists bonus_amount      numeric(10,2) not null,
  add column if not exists malus_amount      numeric(10,2) not null,
  add column if not exists handoffs_amount   numeric(10,2) not null,
  add column if not exists prime_amount      numeric(10,2) not null,
  add column if not exists sanctions_amount  numeric(10,2) not null;

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
  // PAS `money` : c'est un TAUX en %, pas un montant, et la colonne est `numeric(5,2)` —
  // plafonnée à 999,99. Avec la borne des montants (99 999), un taux aberrant passait Zod
  // puis explosait en `numeric field overflow` Postgres brut, au lieu d'une erreur de
  // validation lisible.
  rateApplied: z.coerce.number().min(0, 'Taux positif attendu').max(999.99, 'Taux hors bornes'),
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
- Produces: `<ComptaTemplate data canEnter canPay />`, `<ComptaView data canEnter canPay />`, `<ComptaSkeleton />`.

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
export function ComptaView({ data, canEnter, canPay }: { data: ComptaData; canEnter: boolean; canPay: boolean }) {
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
            canEnter={canEnter}
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
export function ComptaTemplate({ data, canEnter, canPay }: { data: ComptaData; canEnter: boolean; canPay: boolean }) {
  return <ComptaView data={data} canEnter={canEnter} canPay={canPay} />
}
```

- [ ] **Step 4 : Écrire la page**

Remplacer `apps/web/src/app/(dash)/chatter/compta/page.tsx` :

```tsx
import { Suspense } from 'react'
import { hasWriteAccess, requireAccess } from '@/lib/auth'
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
        <ComptaContent
          month={month}
          period={period}
          // DEUX droits distincts (spec §6) : le manager SAISIT, seul l'admin PAIE.
          // `profile.role` ne vaut que 'admin' ou 'chatteur' — un manager y est mappé sur
          // 'chatteur' (lib/auth). Le tester ici priverait tout manager du formulaire.
          canEnter={hasWriteAccess(profile, 'compta')}
          canPay={profile.role === 'admin'}
        />
      </Suspense>
    </div>
  )
}

async function ComptaContent({
  month,
  period,
  canEnter,
  canPay,
}: {
  month?: string
  period?: string
  canEnter: boolean
  canPay: boolean
}) {
  return (
    <ComptaTemplate data={await getCompta({ month, period })} canEnter={canEnter} canPay={canPay} />
  )
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
- Produces: `<ComptaPayslip row fortnight mondays canEnter canPay />`.

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
  mondays,
  canEnter,
  canPay,
}: {
  row: ComptaRow
  /** Reste dans le type (l'appelant le passe, la tâche 9 le lira) sans être déstructuré ici. */
  fortnight: Fortnight
  /** Lundis des semaines rattachées — un formulaire de saisie par semaine. */
  mondays: string[]
  /** Le manager SAISIT — miroir applicatif de `managerPageGuard('compta')`. */
  canEnter: boolean
  /** Seul l'admin PAIE (les virements). Distinct de `canEnter` : `profile.role` ne vaut
   *  qu'`admin` ou `chatteur`, un manager y est mappé sur `chatteur` (lib/auth). */
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
              : // Le calcul réel est `fixedAmount × weekCount` (cf. payslip.ts) — afficher
                // « × plage de dates » multipliait un montant par un intervalle, ce qui ne
                // veut rien dire. `mondays.length` EST le nombre de semaines rattachées.
                `Fixe hebdomadaire — ${eur(row.fixedAmount)} × ${mondays.length} semaine${mondays.length > 1 ? 's' : ''}`
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
      {canEnter &&
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

> **Révisée avant exécution** (relecture du plan contre le code réel, 2026-07-27). Six défauts
> corrigés ici : absence de contrainte d'unicité en base, `net` négatif refusé par Zod, bouton
> de confirmation libellé « Supprimer » en rouge, `paid_at` calculé en UTC, prime soldée sans
> filtre de statut, et emplacement d'insertion inexistant. Détail dans chaque étape.

**Files:**
- Create: `packages/db/supabase/migrations/0087_compta_payments_no_overlap.sql`
- Modify: `apps/web/src/features/compta/schema.ts`
- Modify: `apps/web/src/features/compta/types.ts`
- Modify: `apps/web/src/features/compta/services/get-compta.ts`
- Modify: `apps/web/src/features/compta/actions.ts`
- Create: `apps/web/src/features/compta/components/compta-pay-dialog.tsx`
- Modify: `apps/web/src/features/compta/components/compta-payslip.tsx`
- Modify: `apps/web/src/features/compta/components/compta-view.tsx`

**Interfaces:**
- Consumes: `adminGuard` de `@/lib/actions`, `payInput` (Task 4), `daysIn` et `todayParis` de
  `@glagency/core`, `ConfirmDialog` de `@/components/confirm-dialog`.
- Produces: `payFortnight(raw: unknown): Promise<ActionResult>` ; `ComptaRow.paidAmount`.

- [ ] **Step 1 : Rendre le double paiement impossible en base**

> **Corrigé en cours d'exécution.** La première version posait un index unique sur
> `(chatter_id, month, period)`. C'était faux : `spec:77-78` et `spec:306` conçoivent le
> **paiement partiel** comme un cas nominal (`covered_days` ne couvre qu'une partie, la
> quinzaine reste « incomplète »). L'invariant réel n'est pas « un paiement par quinzaine »
> mais **« aucun jour payé deux fois »**. Signalé par l'implémenteur, vérifié contre la spec.

`compta_payments` n'a **aucune garde** contre le double paiement — vérifié sur l'UAT : seules
la PK sur `id` et trois index non uniques existent. Un garde applicatif « lire puis insérer »
ne suffit pas : entre les deux requêtes, un second clic ou un second admin insère un doublon,
et deux virements sont enregistrés. Sur de l'argent, la garde doit venir de la base.

Créer `packages/db/supabase/migrations/0087_compta_payments_no_overlap.sql` : un trigger
`before insert or update` qui refuse un `covered_days` chevauchant (`&&`) celui d'un paiement
existant du même chatteur, en `raise ... using errcode = '23505'` pour que `payFortnight` le
traduise en message métier. Un `pg_advisory_xact_lock(hashtext(chatter_id::text))` en tête
rend la garde réellement atomique — un `exists` seul, en READ COMMITTED, ne verrouille rien et
laisserait passer deux insertions concurrentes. `security definer` : la fonction doit voir les
paiements de tous pour détecter un doublon, ce que la RLS masquerait à un manager.

Appliquer sur l'**UAT seulement** (comme `0085` et `0086`) :

```bash
cd packages/db && supabase db push --db-url "$DATABASE_URL_UAT"
```

Vérifier **en base**, pas par déduction : qu'un paiement partiel suivi de son complément passe
tous les deux, et qu'un chevauchement lève bien un 23505. `packages/db/src/types.ts` reste
inchangé (un trigger ne touche pas les types générés).

- [ ] **Step 2 : Autoriser un net négatif**

`schema.ts` définit `money = z.coerce.number().min(0)`, et `payInput.amount` l'utilise. Or le
net **peut être négatif** : `net = base + setter + bonus − malus + handoffs + prime − sanctions`
(cf. `packages/core/src/compta/payslip.ts`). Un fixe de 50 €/semaine sur 2 semaines avec 150 €
de sanctions Police donne −50 €. Tel quel, l'action refuserait ce paiement avec « Montant
positif attendu », un message qui n'a aucun sens ici.

Dans `apps/web/src/features/compta/schema.ts`, à côté de `money`, ajouter :

```ts
/**
 * Le NET d'une quinzaine, seul montant SIGNÉ de la feature : malus et sanctions Police peuvent
 * dépasser les gains (`computePayslip`). Enregistrer un net négatif est un constat fidèle — le
 * traitement du solde dû relève de `compta_debts`, hors périmètre (spec §9). Toutes les autres
 * lignes (`base`, `bonus`, `sanctions`…) restent des `money` positifs : ce sont des composantes,
 * c'est leur combinaison qui porte le signe.
 */
const netMoney = z.coerce.number().min(-99999, 'Montant hors bornes').max(99999, 'Montant trop élevé')
```

et dans `payInput`, remplacer `amount: money,` par `amount: netMoney,`. Ne toucher à aucune
autre ligne du schéma.

- [ ] **Step 3 : Ajouter l'action de paiement**

Dans `apps/web/src/features/compta/actions.ts`, ajouter :

```ts
import { todayParis } from '@glagency/core'
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

      // On ne fige que des jours RÉVOLUS. Payer une quinzaine en cours gèlerait un CA encore
      // incomplet tout en marquant ses jours couverts — la perte serait définitive et jamais
      // signalée par le bandeau de retard, qui se déduit de la couverture. Ni la spec ni la
      // première version du plan ne traitaient ce cas.
      const today = todayParis()
      if (v.coveredDays.some((d) => d >= today)) {
        throw new BusinessError(
          "Cette quinzaine n'est pas terminée — elle ne peut être payée qu'à partir du lendemain de son dernier jour.",
        )
      }

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
        // `paid_at` a un défaut `CURRENT_DATE` — mais c'est la date du SERVEUR (UTC), pas le
        // jour métier. Un paiement enregistré à 00 h 30 à Paris en été serait daté de la
        // veille. `todayParis()` est le jour métier de toute l'app.
        paid_at: todayParis(),
      })
      // 23505 = le trigger de 0087 : au moins un de ces jours est déjà couvert par un autre
      // paiement. C'est la BASE qui l'arbitre, pas une lecture préalable — sinon deux clics
      // concurrents passent tous les deux et enregistrent deux virements.
      if (error?.code === '23505') {
        throw new BusinessError('Cette quinzaine a déjà été payée pour ce chatteur.')
      }
      if (error?.code === '42501') {
        throw new BusinessError("Vous n'avez pas le droit d'enregistrer ce paiement.")
      }
      if (error) throw new Error(error.message)

      // La prime n'est due qu'UNE fois : si elle entrait dans ce paiement, elle est soldée.
      // `status = 'due'` explicite : sans ce filtre, une prime déjà `skipped` (renoncée)
      // basculerait en `paid` alors qu'elle n'a rien versé.
      if (v.primeAmount > 0) {
        const { error: primeErr } = await supabase
          .from('compta_primes')
          .update({ status: 'paid', paid_at: todayParis(), updated_by: profile.id })
          .eq('chatter_id', v.chatterId)
          .eq('status', 'due')
        if (primeErr) throw new Error(primeErr.message)
      }

      revalidatePath('/chatter/compta')
    },
  })
}
```

Vérifier que `BusinessError`, `getProfile`, `createClient`, `revalidatePath` et `ActionResult`
sont déjà importés en tête du fichier (Task 8 les a posés) — n'ajouter que ce qui manque.

- [ ] **Step 4 : Exposer le montant réellement versé**

Le KPI « Déjà payé » (`compta-view.tsx:47`) somme `r.payslip.net`, c'est-à-dire le **recalcul
d'aujourd'hui**, pas ce qui a été versé. C'est exactement ce que l'instantané existe pour
éviter : après une ré-ingestion du CA, le total affiché ne correspondrait plus aux virements.

Dans `types.ts`, ajouter à `ComptaRow`, sous `paidOn` :

```ts
  /** Montant RÉELLEMENT versé (instantané `compta_payments.amount`), null si non payé. Distinct
   *  de `payslip.net`, qui est le recalcul du jour : c'est cette valeur-là qui fait foi. */
  paidAmount: number | null
```

Dans `get-compta.ts`, à côté du calcul de `paid` (autour de la ligne 197), ajouter :

```ts
    // `payments` couvre TOUTES les quinzaines (nécessaire à `overdue`) — restreindre à celle-ci.
    const thisPayment = myPayments.find(
      (p) => p.month === fortnight.month && p.period === fortnight.period,
    )
```

et dans l'objet retourné, après `paidOn: …` :

```ts
      paidAmount: thisPayment ? Number(thisPayment.amount) : null,
```

Dans `compta-view.tsx`, le KPI `'paid'` somme désormais l'instantané :

```ts
      value: eur(data.rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0)),
```

et le `hint` affiche le montant versé :

```tsx
          r.chatterId == null
            ? '⚠ non relié à MyPuls'
            : r.paid
              ? `payé le ${r.paidOn} — ${eur(r.paidAmount ?? 0)}`
              : `${eur(r.payslip.net)} à payer`
```

- [ ] **Step 5 : Écrire le dialog de confirmation**

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
      description={
        p.net < 0
          ? 'Le net est NÉGATIF : malus et sanctions dépassent les gains. Enregistrer ce paiement acte un solde dû, il ne déclenche aucun virement.'
          : 'Le détail du calcul sera figé : une correction du CA après coup ne modifiera plus ce paiement.'
      }
      // `ConfirmDialog` est d'abord un dialog de SUPPRESSION : sans ces deux props, le bouton
      // de confirmation d'un paiement s'appellerait « Supprimer » et serait rouge.
      confirmLabel="Marquer payé"
      destructive={false}
      trigger={
        <Button size="sm" className="self-end">
          Marquer payé
        </Button>
      }
      // `ConfirmDialog` affiche lui-même la string renvoyée et RESTE ouvert. Pas de `toast.error`
      // en plus : la même erreur apparaîtrait deux fois.
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
        if (!res.success) return res.error
        toast.success('Paiement enregistré')
      }}
    />
  )
}
```

- [ ] **Step 6 : Brancher dans la fiche**

⚠️ Le plan disait de remplacer un paragraphe « Le bouton de paiement arrive à la tâche 9. » —
**il n'existe pas** dans `compta-payslip.tsx`. Insérer plutôt le bloc juste **après** le
`<div>` « Net à payer » (`compta-payslip.tsx:106-109`) et **avant** le `{canEnter && …}` :

```tsx
      {row.paid && (
        <p className="text-xs text-muted-foreground">
          Payé le {row.paidOn} — {eur(row.paidAmount ?? 0)}
          {/* Écart possible avec le « Net à payer » ci-dessus : celui-ci est recalculé
              aujourd'hui, celui-là est l'instantané figé au virement. C'est l'instantané
              qui fait foi. */}
        </p>
      )}

      {canPay && !row.paid && isClosed && <ComptaPayDialog row={row} fortnight={fortnight} />}
```

Deux points sur ce gate :
- `canPay` est enfin **lu** — retirer le commentaire « pas encore lu ici » de sa doc de prop.
- `isClosed` (quinzaine échue) vient de `compta-view.tsx` : ne pas monter un bouton dont
  l'action échouerait toujours, la garde serveur ci-dessus étant l'autorité.
- ne PAS ajouter `row.chatterId != null` : le composant fait déjà un early-return complet quand
  `chatterId` est nul (`compta-payslip.tsx:46`), la condition serait morte.

`fortnight` redevient utilisé dans le corps → le déstructurer et retirer le commentaire
« Conservé dans la signature… plus utilisé dans le corps ».

- [ ] **Step 7 : Vérifier**

Run : `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build`
Expected : 0 erreur ; seuls les 3 warnings ESLint préexistants (`data-table.tsx`) subsistent.

- [ ] **Step 8 : Commit**

Ne PAS commiter depuis un subagent : `CLAUDE.md` soumet chaque commit à l'accord de Benoit.
Signaler que la tâche est prête et laisser la session principale commiter.

```bash
git add packages/db/supabase/migrations/0087_compta_payments_no_overlap.sql apps/web/src/features/compta
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

- **Le report (« RESTE SEMAINE PASSEE ») et la prime du mois (« PRIME TOP3 MOIS ») ont été
  RETIRÉS à la demande de Benoit le 2026-07-28** (construits aux tâches 21-24, retirés à la
  tâche 28, migration `0095`) : la prime du mois est un montant MENSUEL qui n'a pas de sens sur
  un écran de période de 2 semaines, et le « reste semaine passée » n'a jamais été élucidé
  (« ça existera pas, à part si on me le demande »). La prime setter (TOP15), calculée et non
  saisie, reste.
- `/marketing/compta` (paie du staff) reste un placeholder.
- `compta_debts` n'est pas exploité — registre indépendant de la paie (spec §9).
- Aucun taux par modèle : la base est calculée modèle par modèle pour le permettre plus tard,
  mais `compta_settings` n'a qu'un `rate`.
- Aucune saisie JOURNALIÈRE dans l'UI (`compta_day_entries` est lu et sommé, mais la saisie se
  fait à la semaine). À ajouter si le besoin apparaît.
- Aucun export comptable.
- Le DÉTAIL figé d'une quinzaine payée n'est pas affiché : seuls le montant versé et sa date le
  sont (Task 9, Step 6). Les 11 colonnes d'instantané sont écrites et exploitables, mais la
  fiche dépliée continue de montrer le recalcul du jour. À faire si un écart apparaît en usage.
- `0085`, `0086` et `0087` ne sont poussées QU'EN UAT par ce plan — jamais en production sans
  validation explicite de Benoit.

---

### Task 11 : Écran de réglages (taux, mode, setter, prime) — décidé après la revue finale

> **Ajoutée après coup.** La revue finale a établi qu'aucun écran n'écrit dans `compta_settings`
> ni `compta_primes` : tout le monde reste à 10 %, `mode: 'fixed'` est inatteignable, `is_setter`
> toujours faux (donc le champ « Fixe setter » jamais monté), et la prime — que la spec §2 dit
> « manuelle, l'admin décide » — ne peut pas être créée. La feature n'était pas utilisable sans
> écrire du SQL à la main. **Arbitré par Benoit : on construit l'écran maintenant.**

**Files:**
- Modify: `apps/web/src/features/compta/schema.ts`
- Modify: `apps/web/src/features/compta/actions.ts`
- Create: `apps/web/src/features/compta/components/compta-settings-form.tsx`
- Modify: `apps/web/src/features/compta/components/compta-payslip.tsx`
- Modify: `apps/web/src/features/compta/components/compta-view.tsx`
- Modify: `apps/web/src/features/compta/ComptaTemplate.tsx`
- Modify: `apps/web/src/app/(dash)/chatter/compta/page.tsx`
- Modify: `apps/web/src/features/compta/services/get-compta.ts` (règle de la prime)

**Aucune migration** — vérifié sur l'UAT (`pg_policy`) : `compta_settings_admin_write` et
`compta_primes_admin_write` sont déjà `for all` sous `is_admin()` en `using` ET `with check`,
et les policies de lecture sont cadrées `is_admin() or (is_manager() and manages(chatter_id))`.
Colonnes de `compta_settings` : `chatter_id` (PK), `mode` (`text`, défaut `'percent'`), `rate`
(`numeric`, défaut 10), `fixed_amount` (`numeric`, défaut 0), `is_setter` (`bool`, défaut false),
`updated_at`, `updated_by`.

- [ ] **Step 1 : Schémas**

`settingsInput` : `chatterId` (uuid), `mode` (`'percent' | 'fixed'`), `rate` (le TAUX, mêmes
bornes que `rateApplied` — `numeric(5,2)`, donc max 999,99, PAS `money`), `fixedAmount` (`money`),
`isSetter` (bool). `primeInput` : `chatterId`, `amount` (`money`), `status` (`'due' | 'skipped'`).

- [ ] **Step 2 : Actions**

`saveComptaSettings` et `savePrime`, toutes deux `guard: adminGuard` (la spec §6 réserve les
réglages, primes et paiements à l'admin ; les saisies seules sont ouvertes à l'encadrement).
Upsert sur `chatter_id` (PK des deux tables), `updated_by: profile.id` et `updated_at` posé à la
main (aucun trigger sur ces tables — même constat que `saveWeekEntry`). Convertir un refus RLS
`42501` en `BusinessError`.

- [ ] **Step 3 : Le formulaire**

`compta-settings-form.tsx`, sur le modèle exact de `compta-entry-form.tsx` : RHF + `zodResolver`,
**`'use no memo'` obligatoire** (le React Compiler casse `formState` — règle du dépôt), `z.input<>`
pour le générique. Le champ `rate` n'a de sens qu'en mode `percent`, `fixedAmount` qu'en mode
`fixed` : masquer celui qui ne s'applique pas plutôt que d'afficher un champ inerte.

- [ ] **Step 4 : Le droit**

`canConfigure` — nouveau booléen, **distinct de `canPay`** bien que dérivé du même
`profile.role === 'admin'` aujourd'hui : régler un taux et exécuter un virement sont deux gestes
différents, et les avoir confondus est exactement ce qui a produit le défaut `canEnter`/`canPay`.
Threadé `page.tsx` → `ComptaTemplate` → `ComptaView` → `ComptaPayslip`.

- [ ] **Step 5 : La prime s'affiche sur la quinzaine affichée**

**Arbitré par Benoit.** La règle actuelle (`myOldestOpen` : quinzaine ÉCHUE la plus ancienne non
couverte du membre) est conforme à la spec §4 mais inutilisable à l'amorçage — sans aucun
paiement, elle ancre la prime sur la plus vieille quinzaine de la fenêtre (juin sur l'UAT), que
personne n'ouvrira. Nouvelle règle : la prime s'affiche sur la **quinzaine affichée** si elle est
échue et que le membre n'en a jamais reçu.

`coverage.primePaid` (source de vérité = `compta_payments.prime_amount` figé) reste le garde :
elle ne peut être versée qu'une fois, quelle que soit la quinzaine par laquelle on passe.
`myOldestOpen` disparaît — vérifier qu'il n'a **aucun autre consommateur** avant de le supprimer.
Mettre la spec §4 à jour en même temps : c'est un écart assumé, pas un oubli.

- [ ] **Step 6 : Vérifier**

`pnpm --filter @glagency/web typecheck && lint && build`. Puis, sur l'UAT : régler un chatteur en
`fixed`, vérifier que sa fiche bascule sur « Fixe hebdomadaire — X € × N semaines » — **c'est le
seul chemin qui exerce la branche `fixed` de `computePayslip`**, jamais exécutée à ce jour.

- [ ] **Step 7 : Commit** — ne pas commiter depuis un subagent (accord de Benoit requis).

---

### Task 15 : La période de paie devient 2 semaines lundi→dimanche

> **Décidé par Benoit le 2026-07-27, après lecture de sa feuille Google Sheets de juillet.**
> C'est une correction d'une erreur d'interprétation de ma part, pas un changement d'avis :
> quand il a dit « il paye toutes les 2 semaines… 2 paiements par mois », j'ai traduit en
> quinzaines calendaires 1–15 / 16–fin. Sa feuille prouve que ce sont **14 jours calés sur les
> lundis**.

**Preuve, tirée de la feuille (onglet juillet, `gid=872644203`)** :
- Bloc S1 = lundi 06/07 → dimanche 12/07 ; S2 = lundi 13/07 → dimanche 19/07.
- Le bloc S2 porte « Net à payer 1 » (= le net de S1, vérifié au centime : Seth 809,3816 €),
  « Net à payer 2 » (= le net de S2) et « -NET TOTAL- » = leur somme. **Le paiement couvre
  donc 06/07 → 19/07.**
- La feuille « juillet » couvre en réalité **06/07 → 02/08** : elle ne suit pas le mois.
- Cadence : 26 périodes par an, pas 24.

**Ancre vérifiée** : le lundi 2026-07-06 démarre une période. Toute période démarre donc un
lundi `M` tel que `(M − 2026-07-06) mod 14 = 0` (2026-07-20 et 2026-06-22 le confirment).

**Files:**
- Modify: `packages/core/src/compta/periods.ts` + `periods.test.ts` + `packages/core/src/index.ts`
- Create: `packages/db/supabase/migrations/0088_compta_period_start.sql`
- Modify: toute la feature `apps/web/src/features/compta/` (types, schema, actions, services, composants)

- [ ] **Step 1 : Le domaine**

`Fortnight { month, period: 1|2, from, to, label }` devient une période de 14 jours identifiée
par **son lundi de départ**. `period: 1|2` disparaît : il n'a plus de sens (une période ne se
rattache plus à un mois — celle du 20/07 finit en août). `month` aussi.

Nouvelle forme suggérée : `PayPeriod { start, end, label }` où `start` est un lundi et
`end = start + 13`. `fortnightOf(day)` → `periodOf(day)` ; `recentFortnights(today, n)` →
`recentPeriods(today, n)` ; `mondaysIn` rend **exactement 2 lundis** (plus jamais 3 — c'est une
simplification, l'ancien modèle en avait 2 ou 3 selon le mois) ; `daysIn` rend **exactement
14 jours** (contre 15 ou 16). `fortnightsOfMonth` disparaît.

⚠️ `mondaysIn` rendant toujours 2 lundis, le libellé du mode fixe (`fixedAmount × N semaines`)
devient toujours « × 2 semaines ». Vérifier que `computePayslip` reçoit bien `weekCount = 2` et
que le test correspondant reste discriminant.

- [ ] **Step 2 : La base**

`compta_payments` porte `month date` + `period smallint check (period in (1,2))`. Avec des
périodes de 14 jours, **il peut y en avoir 3 qui démarrent dans le même mois** : la contrainte
`in (1,2)` deviendrait fausse, et stocker un lundi dans une colonne nommée `month` serait un
mensonge permanent.

Migration `0088` : renommer `month` → `period_start` et **supprimer** `period` (+ sa contrainte).
C'est sans risque : `compta_payments` est **vide** (0 ligne, vérifié le 2026-07-27 sur l'UAT et
la prod), et `0085`/`0087` ne sont pas en production. Régénérer `packages/db/src/types.ts`.

`compta_day_entries` (clé par date) et `compta_week_entries` (clé par lundi) ne bougent PAS :
elles sont déjà indépendantes du découpage.

- [ ] **Step 3 : La feature**

Propager partout : `?month=`/`?period=` dans l'URL → un seul `?debut=` (le lundi) ; le
`Combobox` du sélecteur ; `payInput` ; `payFortnight` ; `thisPayments` (filtre `(month, period)`
→ `period_start`) ; `coverage.ts` ; `overdueFortnights`. Le garde « on ne fige que des jours
révolus » et le trigger de non-chevauchement `0087` restent inchangés — ils raisonnent sur
`covered_days`, pas sur le découpage.

- [ ] **Step 4 : Vérifier contre la feuille**

Rejouer sur l'UAT la période **06/07 → 19/07** et comparer, chatteur par chatteur, avec la
colonne « -NET TOTAL- » du bloc S2 de la feuille. Les taux réels y sont : **86 à 10 %, 5 à 11 %**
(Seth, Néleck, Flo, Benj2p, Junior), **4 à 10,5 %** (Michel, kwasi, Alain, Juliot). Écarts
attendus et légitimes : les sanctions Police (absentes de la feuille) et les lignes non encore
implémentées (RESTE SEMAINE PASSEE, Divers, PRIME TOP15 SETTER, PRIME TOP3 MOIS).

- [ ] **Step 5 : Commit** — ne pas commiter depuis un subagent.

---

### Reste à faire, hors périmètre de la tâche 15

Relevé dans la feuille de juillet, absent de l'app :
- **PRIME TOP15 SETTER** et **PRIME TOP3 MOIS** — deux primes mensuelles.
- **RESTE SEMAINE PASSEE** — report d'une période sur la suivante.
- **Divers** — ligne d'ajustement libre, signée (observée à −20, −10, −5).
- Renommer « Prime nouveau chatteur » en **« Prime d'embauche »**, le terme de la feuille
  (montant identique : 100 €, versée à 10 personnes en juillet).

---

### Task 16 : Aligner le modèle sur la feuille — retrait du mode fixe, setter depuis Membres

> **Décidé par Benoit le 2026-07-27** : « je pense qu'il sert pas, ma référence c'est ce
> document ». La feuille de juillet est désormais la référence du modèle de paie.

**Constats mesurés sur la feuille (onglet juillet)** :
- **Personne n'est en mode « fixe au lieu du pourcentage »**. Les 95 chatteurs de la semaine S1
  ont tous un net = `CA × taux` : **86 à 10 %**, **5 à 11 %** (Seth, Néleck, Flo, Benj2p,
  Junior), **4 à 10,5 %** (Michel, kwasi, Alain, Juliot). Le mode `fixed` vient de l'ancienne
  branche et ne correspond à aucune pratique.
- **Le fixe setter s'AJOUTE au pourcentage**, il ne le remplace pas. Vérifié : Carl = 4,379 €
  (commission) + 75 € (fixe) + 19,20 € (handoffs) = 98,579 € ; Martin = 27,55 + 75 + 21 =
  123,55 € ; Julie = 0 + 40 + 3,60 = 43,60 €. C'est déjà ce que fait `computePayslip`.
- **Le fixe setter est versé UNE fois par période de paie**, pas par semaine : rempli
  uniquement dans le bloc S2 (celui qui porte le paiement), 59 personnes, montants **37,5 / 40
  / 75 €**. Le 37,5 prouve qu'il est ajustable au cas par cas.
- **« Divers » n'est pas une ligne d'ajustement libre** : c'est la somme
  `fixe setter + 0,60 × handoffs − malus`. Rien à construire — retirer cette ligne du reste-à-faire.

**Files:**
- Modify: `packages/core/src/compta/payslip.ts` + `payslip.test.ts`
- Create: `packages/db/supabase/migrations/0089_compta_settings_simplification.sql`
- Modify: `apps/web/src/features/compta/` (schema, actions, types, services, composants)
- Modify: `docs/superpowers/specs/2026-07-27-compta-paie-design.md` (§2, §4, §5)

- [ ] **Step 1 : Retirer le mode fixe du domaine**

`PayslipInput` perd `mode`, `fixedAmount` et `weekCount` (ce dernier ne servait qu'au mode
fixe). `base` devient toujours `Σ round2(ca_modèle × taux)`. Supprimer les tests du mode fixe et
**vérifier que les tests restants discriminent encore** — en réintroduisant temporairement la
régression, et en rapportant ce qui a été observé.

- [ ] **Step 2 : Le statut setter vient de Membres**

`compta_settings.is_setter` disparaît : la source de vérité est **`profiles.closing_role`**
(`check in ('setter','closer')`, réglé depuis Membres). Deux sources pour un même fait
finissent toujours par diverger.

⚠️ **Trou de données connu et assumé par Benoit** (« ils vont le faire ») : `closing_role` vaut
`'setter'` pour **1 seul** profil en prod (13 `closer`, 91 non renseignés) alors que la feuille
verse un fixe setter à 59 personnes. Tant que Membres n'est pas rempli, presque aucun fixe
setter ne s'appliquera. Ne pas « compenser » ça en code.

- [ ] **Step 3 : Le fixe setter devient un réglage, ajustable**

`compta_settings.fixed_amount` (qui portait le montant du mode fixe, désormais mort) est
**réutilisé** comme montant du fixe setter **par période**. Il s'applique automatiquement à
qui a `closing_role = 'setter'` — sinon il faudrait le retaper pour 59 personnes toutes les
deux semaines, ce que l'app doit justement éviter.

La saisie `compta_week_entries.fixe_setter` est conservée comme **ajustement** : non nulle, elle
REMPLACE le montant du réglage pour cette période (cas du 37,50 € observé). Elle ne s'y ajoute
pas — ce serait un double versement. La fiche doit dire lequel s'applique (« Fixe setter — 75 € »
vs « Fixe setter — 37,50 € (ajusté) »).

- [ ] **Step 4 : Le dialog de réglages**

Après retrait du mode et du statut setter, il reste **le taux, le fixe setter, la prime** — et
**UN SEUL bouton « Enregistrer »** (demande de Benoit). Les deux Server Actions
(`saveComptaSettings`, `savePrime`) peuvent rester distinctes côté serveur, mais l'écran n'a
qu'un bouton : au clic, les deux partent, et une erreur de l'une ne doit pas laisser croire que
l'autre a échoué.

- [ ] **Step 5 : La base**

Migration `0089` : supprimer `compta_settings.mode` (et son `check`), `compta_settings.is_setter`,
et `compta_payments.mode_applied` (colonne d'instantané devenue morte). Sans risque :
`compta_settings` et `compta_payments` sont **vides** (à revérifier avant d'agir), et
`0085`/`0087`/`0088` ne sont pas en production. Régénérer `packages/db/src/types.ts`.

- [ ] **Step 6 : Vérifier** — `core test`, `typecheck`, `lint`, `build`, puis rejouer la
comparaison avec la feuille (période 06→19/07).

- [ ] **Step 7 : Commit** — ne pas commiter depuis un subagent.

---

## Lot final — remplacer le tableur (tâches 21 à 24)

> **Demande de Benoit (2026-07-28)** : « implémente tout pour que tout colle à l'Excel, c'est le
> but de ne plus en avoir besoin. Pense que ça doit être simple et intuitif, pas plus chiant que
> le document. »

**Inventaire vérifié** de ce qui manque, relevé sur TOUS les onglets et TOUS les libellés :
`RESTE SEMAINE PASSEE`, `PRIME TOP15 SETTER`, `PRIME TOP3 MOIS`, `Nbre de handoff / Mois`,
`Total Mois`, l'onglet `CLASSEMENT SETTER`, l'onglet `SUIVI PRIMES NVX CHATTEURS` (41 primes en
attente), l'onglet `COMPTA CHATTEURS OFF ⛔`, et les rôles `nouveau` / `hybride` de la légende.

**Contrainte d'ergonomie, non négociable** : pas plus pénible que la feuille. La feuille se
parcourt d'un coup d'œil et se remplit au clavier. Trois onglets sur la page compta, qui
reprennent le découpage mental de Benoit — **Période** (l'existant), **Classement**,
**Suivi** — et rien de plus. Aucun nouvel écran ailleurs dans l'app.

### Task 21 : Le socle de données (migration `0090`)

- **`compta_period_entries`** — une ligne par `(chatter_id, period_start)` : `carryover`
  (`RESTE SEMAINE PASSEE`) et `top3_prime` (`PRIME TOP3 MOIS`, manuelle, règle inconnue).
  Une seule table pour les deux : ce sont les mêmes clés, le même écran, le même droit.
- **`compta_setter_scale`** — `rank smallint primary key`, `amount numeric(10,2)`. Le barème du
  TOP15, réglable (Benoit : « je veux pouvoir le régler »). Valeurs de juin en amorce :
  200, 175, 165, 140, 130, 120, 115, 110, 105, 100, 95, 90, 87, 84, 80.
- **`compta_debts`** — `amount` **text → numeric(10,2)** (défaut actuel `'100 €'`, valeurs vues
  `'10$'`, `'43$'`). Table **vide** (vérifié UAT et prod), conversion sans risque. Ajouter
  `settled_by uuid references profiles(id)`.
- **`profiles.closing_role`** — le `check` passe de `('setter','closer')` à
  `('setter','closer','nouveau','hybride')`, d'après la légende de la feuille (L96-98 :
  🟢 setter, 🔵 closer, 🔴 nouveau, plus « chatteurs hybrides »).
- RLS : mêmes régimes que l'existant — écriture admin sur les barèmes et les dettes, écriture
  encadrement cadrée sur `compta_period_entries` (c'est de la saisie, comme les semaines).

**UAT uniquement.** Vérifier que les tables sont vides avant d'agir.

### Task 22 : Le domaine (`packages/core`)

`PayslipInput` gagne `carryover`, `setterPrime` (TOP15) et `monthlyPrime` (TOP3). Les trois
s'ajoutent au net. `Payslip` les expose séparément — la fiche doit montrer chaque ligne, comme
la feuille.

**Le classement setter** est une fonction pure : `rankSetters(handoffsByMember, scale)` →
rang + montant. Ex æquo : rang partagé, montant du rang le plus favorable — à trancher et
justifier. Le classement porte sur les **handoffs de la période** (Benoit : « met en 2 semaines
tkt pas »).

⚠️ **Le comptage qui fait foi n'est pas tranché** : l'onglet CLASSEMENT SETTER de Benoit et les
handoffs de sa compta divergent (Godgive 86 contre 111 en juin). On prend **les handoffs saisis
dans l'app** — seule donnée dont on garantisse la provenance. À signaler à Benoit, pas à masquer.

### Task 23 : Les services et les actions

- `compta_period_entries` : lecture dans `compta-sources.ts`, saisie via une action cadrée
  `managerPageGuard`.
- Classement des setters sur la période, injecté dans les fiches.
- **Suivi des primes d'embauche** : `chatter_first_seen()` donne la date d'arrivée ;
  l'échéance est **arrivée + 1 mois** (colonnes `Début` / `Fin 1er mois` de la feuille, 100 $
  chacune). Un membre est **éligible** quand `first_seen + 1 mois <= aujourd'hui` et qu'aucun
  paiement ne porte encore sa prime.
- **Dettes** : CRUD admin sur `compta_debts`.

### Task 24 : L'écran — trois onglets, rien de plus

- **Période** — inchangé, plus les nouvelles lignes dans la fiche (report, prime setter,
  prime du mois) et deux champs de saisie (report, prime top 3).
- **Classement** — le tableau des setters de la période : rang, nom, handoffs, prime. Plus
  l'édition du barème pour l'admin.
- **Suivi** — deux listes : les primes d'embauche **échues et non versées** (avec la date
  d'éligibilité), et les **soldes des partants** (`compta_debts`), avec un bouton « soldé ».

**Ergonomie** : la saisie doit se faire au clavier sans quitter la ligne, comme la saisie hebdo
qui s'enregistre seule. Aucun bouton « Enregistrer » par ligne.
