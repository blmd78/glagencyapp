# Tracker de présence — Incrément 1 : le socle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser la migration `0125_tracking.sql` (tables, index, RLS, seed des règles) et porter le
cœur de calcul du tracker dans `@glagency/core/src/tracking/`, entièrement testé — sans aucune UI ni
ingest.

**Architecture:** Le domaine est **pur** : aucune I/O, aucun accès base, aucune dépendance runtime.
Il consomme des événements déjà désérialisés (camelCase, `meta` en objet) et rend des chiffres. La
base pose les tables selon le principe des **trois horizons** de la spec (§2) : `tracker_live`
écrasée, `tracker_focus_raw` purgée à 14 jours, tables de faits définitives. Rien de ce qui est
livré ici n'est encore branché — c'est volontaire : l'incrément est vérifiable par `vitest` et
`supabase db push --dry-run` seuls.

**Tech Stack:** TypeScript 5.7 (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`),
Vitest 3, Postgres/Supabase, `supabase db push`.

**Spec:** `docs/superpowers/specs/2026-08-25-tracker-presence-design.md`

## Global Constraints

- **Aucune dépendance runtime ajoutée à `@glagency/core`.** Le package n'en a aucune aujourd'hui.
  `luxon`, utilisé par le tracker d'origine, **n'est pas porté** — les helpers `Intl` de
  `packages/core/src/domain/dates.ts` le remplacent.
- **Migration `0125`.** Prod et UAT sont à `0124` (vérifié le 2026-08-25). Numéro suivant : `0125`.
  **Ne jamais renuméroter** l'existant.
- **`text` + `check`, jamais `create type … enum`.** Convention du repo.
- **Application des migrations** : `cd packages/db && supabase db push --db-url "$DATABASE_URL"`.
  Extraire l'URL en brut (`grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/^"//; s/"$//'`),
  **jamais** `source .env`. Connexion directe port 5432, **pas** le pooler 6543. `supabase link` est
  cassé sur ce projet.
- **UAT d'abord.** Cet incrément s'applique sur `DATABASE_URL_UAT` uniquement. La prod se fait à la
  release, pas ici.
- **Style de code** : pas de point-virgule, guillemets simples, indentation 2 espaces, commentaires
  en français expliquant le *pourquoi*. Voir `packages/core/src/training/wheel.ts`.
- **Style de migration** : commentaires en français en tête de bloc, `comment on column … is
  $cmt$…$cmt$`, `create index if not exists`. Voir `packages/db/supabase/migrations/0121_*.sql`.
- **Pas de commit sans accord de Benoit.** Les étapes « Commit » de ce plan préparent le message ;
  **demander avant d'exécuter `git commit`**.
- **Fuseau** : `Europe/Paris` partout. Un shift à cheval sur minuit appartient **en entier** au jour
  de son `shift_start`.

---

## Décisions de portage (à appliquer partout)

Trois écarts délibérés par rapport au JS d'origine. Ils valent pour **tous** les fichiers portés.

1. **`meta` est un objet, pas une chaîne.** Le tracker lit SQLite et fait `JSON.parse(ev.meta)`
   partout (`src/focus.js:39`, `src/models.js:14`). Nous lisons du `jsonb` : `meta` arrive
   désérialisé. Tout `JSON.parse` disparaît, remplacé par un accès direct **avec garde de type**.
2. **camelCase au niveau du domaine.** `ev.received_at` → `ev.receivedAt`, `ev.machine_id` →
   `ev.machineId`, `ev.session_id` → `ev.sessionId`. Le mapping colonne→domaine se fait dans la
   couche service (incrément 3), jamais ici.
3. **Le fuseau est injecté, pas lu d'une config globale.** Le tracker lit `config.tz` et
   `config.staleMs` depuis un module global (`src/config.js`). Un domaine pur ne lit aucune config :
   ces valeurs deviennent des **paramètres avec valeur par défaut**.

---

## File Structure

### Créés — `packages/core/src/tracking/`

| Fichier | Responsabilité | Porté depuis |
|---|---|---|
| `types.ts` | Les types partagés du domaine. Aucune logique. | — |
| `time.ts` | Heure murale Paris ↔ UTC, bornes de journée, formatage de durée. | `src/time.js` |
| `shifts.ts` | Les 3 shifts, leur fenêtre, le shift courant. | `src/shifts.js` |
| `segments.ts` | Rejoue le flux d'events → segments typés ; état live ; agrégation. | `src/compute.js` |
| `rules.ts` | Normalisation et test d'appartenance à la liste blanche. | `src/rules.js` |
| `focus.ts` | Normalisation d'URL, attribution du temps par app/domaine. | `src/focus.js` |
| `models.ts` | Attribution du temps par modèle. | `src/models.js` |
| `stagnant.ts` | Détection d'écran figé. | `src/stagnant.js` |
| `devices.ts` | Répartition par poste, chevauchement, bascules. | `src/devices.js` |
| `verdict.ts` | Le verdict de conformité sur une fenêtre. | `src/report.js:20` |
| `manager-day.ts` | Journée et cumul d'un manager — des faits, aucun verdict. | `src/managers.js` |

Un fichier `.test.ts` par module, à côté (convention du repo).

### Créés — base

- `packages/db/supabase/migrations/0125_tracking.sql`

### Modifiés

- `packages/core/src/index.ts` — ajout des exports du domaine `tracking`
- `packages/db/src/types.ts` — régénéré
- `CLAUDE.md` — correction du numéro de migration

> **Les sources d'origine** sont dans le scratchpad de la session :
> `/private/tmp/claude-501/-Users-benoitgasnier-Documents-glagencyapp/4b10ae5d-d58f-4188-b73f-3a3b9f4b04ca/scratchpad/tracker/src/`.
> Si le scratchpad a été purgé, les rapatrier depuis le VPS :
> `ssh root@178.105.220.54 "tar czf - -C /opt/tracker src"`.

---

## Task 1 : Types et socle temps

**Files:**
- Create: `packages/core/src/tracking/types.ts`
- Create: `packages/core/src/tracking/time.ts`
- Test: `packages/core/src/tracking/time.test.ts`

**Interfaces:**
- Consumes: `addDays` depuis `../domain/dates`
- Produces:
  - `type TrackerEventType`, `interface TrackerEvent`, `type SegmentKind`, `interface Segment`,
    `interface BuiltSegments`
  - `parisOffsetMs(at: Date): number`
  - `parisWallUtcMs(day: string, hour: number): number`
  - `parisDay(iso: string): string`
  - `dayBounds(day: string): { start: number; end: number }`
  - `isoWeekday(day: string): number`
  - `fmtClock(ms: number | null): string`
  - `fmtDuration(minutes: number): string`

> **Le point dur de cette tâche** : `shiftWindow` a besoin de « l'instant UTC de 13 h heure de Paris
> le 2026-08-25 ». `parisDayStartUtc` (existant) ne sait faire que minuit, et lui ajouter
> `hour × 3 600 000` est **faux les deux jours de changement d'heure** (la journée fait 23 h ou
> 25 h). D'où `parisWallUtcMs`, en deux passes : on estime le décalage, on corrige, on relit le
> décalage à l'instant corrigé. C'est le seul primitif réellement nouveau du portage.

- [ ] **Step 1: Écrire `types.ts`**

```ts
/** Types du domaine « tracker de présence ». Aucune logique ici. */

export type TrackerEventType =
  | 'shift_start'
  | 'shift_end'
  | 'pause'
  | 'resume'
  | 'idle_start'
  | 'idle_end'
  | 'model'
  | 'focus'
  | 'heartbeat'

/**
 * Un événement tel que le domaine le consomme : camelCase, `meta` DÉJÀ désérialisé.
 * Le tracker d'origine lisait du SQLite et faisait `JSON.parse(ev.meta)` partout ; nous lisons du
 * `jsonb`, donc l'objet arrive prêt. Le mapping colonne→domaine vit dans la couche service.
 */
export interface TrackerEvent {
  type: TrackerEventType
  /** Horodatage POSTE (ISO UTC). Peut être faux si l'horloge du PC dérive. */
  at: string
  /** Horodatage SERVEUR de réception (ISO UTC) — seule base fiable pour l'état « en ligne ». */
  receivedAt?: string | null
  sessionId?: string | null
  machineId?: string | null
  meta?: Record<string, unknown> | null
}

export type SegmentKind = 'active' | 'pause' | 'idle'

export interface Segment {
  kind: SegmentKind
  start: number
  end: number
  /** Heure du `shift_start` du shift courant — permet de rattacher un shift de nuit à son jour. */
  shiftStart: number | null
}

export interface BuiltSegments {
  segments: Segment[]
  firstStart: number | null
  lastStop: number | null
  /** Le shift n'a jamais été clos et plus rien n'arrive : PC éteint ou app tuée. */
  crashed: boolean
  /** App fermée puis rouverte : clôture propre mais anormale. */
  recovered: boolean
  openShift: boolean
  eventCount: number
  sessions: string[]
}

export type LiveState = 'active' | 'pause' | 'idle'

export interface LiveStatus {
  state: LiveState
  since: number
}
```

- [ ] **Step 2: Écrire le test de `time.ts` (il doit échouer)**

```ts
import { describe, expect, it } from 'vitest'
import { dayBounds, fmtClock, fmtDuration, isoWeekday, parisDay, parisWallUtcMs } from './time'

describe('parisWallUtcMs', () => {
  it('heure d’hiver : Paris = UTC+1', () => {
    // 2026-01-15 13:00 Paris = 12:00 UTC
    expect(new Date(parisWallUtcMs('2026-01-15', 13)).toISOString()).toBe('2026-01-15T12:00:00.000Z')
  })
  it('heure d’été : Paris = UTC+2', () => {
    // 2026-08-25 13:00 Paris = 11:00 UTC
    expect(new Date(parisWallUtcMs('2026-08-25', 13)).toISOString()).toBe('2026-08-25T11:00:00.000Z')
  })
  it('jour de bascule été→hiver : 25 h, la borne reste juste', () => {
    // Bascule le dernier dimanche d'octobre 2026 = 25/10. 05h00 Paris ce jour-là = 04:00 UTC
    // (on est déjà repassé en UTC+1 à 03h00 locale).
    expect(new Date(parisWallUtcMs('2026-10-25', 5)).toISOString()).toBe('2026-10-25T04:00:00.000Z')
  })
  it('jour de bascule hiver→été : 23 h', () => {
    // Bascule le dernier dimanche de mars 2026 = 29/03. 13h00 Paris = 11:00 UTC (déjà UTC+2).
    expect(new Date(parisWallUtcMs('2026-03-29', 13)).toISOString()).toBe('2026-03-29T11:00:00.000Z')
  })
  it('minuit coïncide avec le début de journée', () => {
    expect(parisWallUtcMs('2026-08-25', 0)).toBe(dayBounds('2026-08-25').start)
  })
})

describe('dayBounds', () => {
  it('borne la journée Paris, fin exclusive', () => {
    const { start, end } = dayBounds('2026-08-25')
    expect(new Date(start).toISOString()).toBe('2026-08-24T22:00:00.000Z')
    expect(new Date(end).toISOString()).toBe('2026-08-25T22:00:00.000Z')
  })
})

describe('parisDay', () => {
  it('un instant de 0h30 Paris appartient au jour Paris, pas au jour UTC', () => {
    // 2026-08-25T00:30+02:00 = 2026-08-24T22:30Z → jour UTC = 24, jour Paris = 25
    expect(parisDay('2026-08-24T22:30:00.000Z')).toBe('2026-08-25')
  })
})

describe('isoWeekday', () => {
  it('1 = lundi, 7 = dimanche', () => {
    expect(isoWeekday('2026-08-24')).toBe(1)
    expect(isoWeekday('2026-08-25')).toBe(2)
    expect(isoWeekday('2026-08-30')).toBe(7)
  })
})

describe('formatage', () => {
  it('fmtDuration', () => {
    expect(fmtDuration(487)).toBe('8h07')
    expect(fmtDuration(45)).toBe('45min')
    expect(fmtDuration(0)).toBe('0min')
    expect(fmtDuration(-5)).toBe('0min')
    expect(fmtDuration(120)).toBe('2h00')
  })
  it('fmtClock rend l’heure de Paris', () => {
    expect(fmtClock(Date.parse('2026-08-25T11:00:00Z'))).toBe('13:00')
    expect(fmtClock(null)).toBe('—')
  })
})
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/time.test.ts`
Expected: FAIL — `Failed to resolve import "./time"`.

- [ ] **Step 4: Écrire `time.ts`**

```ts
import { addDays } from '../domain/dates'

/**
 * Décalage Paris↔UTC (ms) À CET INSTANT. On formate l'instant en composantes horaires de Paris,
 * on relit ces composantes comme si elles étaient UTC, et la différence EST le décalage.
 */
export function parisOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0)
  // `hour12: false` rend « 24 » pour minuit sur certaines versions d'ICU — `% 24` neutralise.
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return asUtc - at.getTime()
}

/**
 * Instant UTC (ms) de l'heure MURALE `hour` du jour Paris `day`.
 *
 * Deux passes, et c'est indispensable : le décalage à appliquer est celui de l'instant VISÉ, pas
 * celui de minuit UTC. Les deux jours de bascule d'heure durent 23 h ou 25 h — une simple addition
 * de `hour × 3 600 000` sur le début de journée y décale toutes les bornes de shift d'une heure.
 */
export function parisWallUtcMs(day: string, hour: number): number {
  const naive = Date.parse(`${day}T00:00:00Z`) + hour * 3_600_000
  const firstPass = naive - parisOffsetMs(new Date(naive))
  return naive - parisOffsetMs(new Date(firstPass))
}

/** Jour civil Paris (YYYY-MM-DD) d'un instant ISO. */
export const parisDay = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))

/** Bornes UTC (ms) de la journée Paris `day`. `end` est EXCLUSIVE. */
export function dayBounds(day: string): { start: number; end: number } {
  return { start: parisWallUtcMs(day, 0), end: parisWallUtcMs(addDays(day, 1), 0) }
}

/** Numéro de jour ISO (1 = lundi, 7 = dimanche). Pure arithmétique de chaîne : pas de fuseau. */
export const isoWeekday = (day: string): number =>
  ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1

/** « 13:00 » — heure de Paris. */
export const fmtClock = (ms: number | null): string =>
  ms == null
    ? '—'
    : new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Europe/Paris',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(ms))

/** 487 → « 8h07 » ; 45 → « 45min ». */
export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rest = m % 60
  return h ? `${h}h${String(rest).padStart(2, '0')}` : `${rest}min`
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/time.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 6: Commit** *(demander l'accord de Benoit avant d'exécuter)*

```bash
git add packages/core/src/tracking/types.ts packages/core/src/tracking/time.ts packages/core/src/tracking/time.test.ts
git commit -m "feat(tracking): socle temps Paris du tracker, sans luxon"
```

---

## Task 2 : Les shifts

**Files:**
- Create: `packages/core/src/tracking/shifts.ts`
- Test: `packages/core/src/tracking/shifts.test.ts`

**Interfaces:**
- Consumes: `parisWallUtcMs`, `parisDay` depuis `./time` ; `addDays` depuis `../domain/dates`
- Produces:
  - `interface Shift { key: ShiftKey; label: string; startH: number; endH: number }`
  - `type ShiftKey = 'matin' | 'aprem' | 'nuit'`
  - `const SHIFTS: readonly Shift[]`
  - `shiftByKey(key: string): Shift | undefined`
  - `interface ShiftWindow { start: number; end: number; date: string; label: string; range: string }`
  - `shiftWindow(shift: Shift, nowMs?: number): ShiftWindow`
  - `currentShift(nowMs?: number): Shift`

- [ ] **Step 1: Écrire le test (il doit échouer)**

```ts
import { describe, expect, it } from 'vitest'
import { SHIFTS, currentShift, shiftByKey, shiftWindow } from './shifts'

const at = (iso: string): number => Date.parse(iso)

describe('SHIFTS', () => {
  it('trois shifts de 8 h couvrant 24 h', () => {
    expect(SHIFTS.map((s) => s.key)).toEqual(['matin', 'aprem', 'nuit'])
    expect(shiftByKey('nuit')?.startH).toBe(21)
    expect(shiftByKey('inconnu')).toBeUndefined()
  })
})

describe('shiftWindow', () => {
  it('matin, appelé juste après la fin : la fenêtre est celle du jour même', () => {
    // 13h05 Paris le 25/08 (= 11:05Z) → matin = 05h→13h Paris le 25
    const w = shiftWindow(shiftByKey('matin')!, at('2026-08-25T11:05:00Z'))
    expect(new Date(w.start).toISOString()).toBe('2026-08-25T03:00:00.000Z')
    expect(new Date(w.end).toISOString()).toBe('2026-08-25T11:00:00.000Z')
    expect(w.date).toBe('2026-08-25')
    expect(w.range).toBe('05h → 13h')
  })
  it('nuit, appelé à 05h05 : la fenêtre part de la VEILLE 21 h', () => {
    // 05h05 Paris le 25/08 (= 03:05Z) → nuit = 21h le 24 → 05h le 25
    const w = shiftWindow(shiftByKey('nuit')!, at('2026-08-25T03:05:00Z'))
    expect(new Date(w.start).toISOString()).toBe('2026-08-24T19:00:00.000Z')
    expect(new Date(w.end).toISOString()).toBe('2026-08-25T03:00:00.000Z')
    expect(w.date).toBe('2026-08-25')
  })
  it('si la fin est postérieure à maintenant, on recule d’un jour', () => {
    // 09h00 Paris le 25/08 : l'après-midi (fin 21 h) ne s'est pas encore terminé aujourd'hui
    // → c'est celui d'HIER qui vient de finir.
    const w = shiftWindow(shiftByKey('aprem')!, at('2026-08-25T07:00:00Z'))
    expect(w.date).toBe('2026-08-24')
    expect(new Date(w.end).toISOString()).toBe('2026-08-24T19:00:00.000Z')
  })
  it('nuit de bascule printemps : le shift dure 7 h réelles, pas 8', () => {
    // Sans ces deux cas, un `start` dérivé par `end - 8h` passe tous les autres tests.
    const w = shiftWindow(shiftByKey('nuit')!, at('2026-03-29T03:05:00Z'))
    expect(new Date(w.start).toISOString()).toBe('2026-03-28T20:00:00.000Z')
    expect(new Date(w.end).toISOString()).toBe('2026-03-29T03:00:00.000Z')
  })
  it('nuit de bascule automne : le shift dure 9 h réelles', () => {
    const w = shiftWindow(shiftByKey('nuit')!, at('2026-10-25T04:05:00Z'))
    expect(new Date(w.start).toISOString()).toBe('2026-10-24T19:00:00.000Z')
    expect(new Date(w.end).toISOString()).toBe('2026-10-25T04:00:00.000Z')
  })
})

describe('currentShift', () => {
  it('découpe la journée Paris en trois', () => {
    expect(currentShift(at('2026-08-25T05:00:00Z')).key).toBe('matin')  // 07h Paris
    expect(currentShift(at('2026-08-25T13:00:00Z')).key).toBe('aprem')  // 15h Paris
    expect(currentShift(at('2026-08-25T21:00:00Z')).key).toBe('nuit')   // 23h Paris
    expect(currentShift(at('2026-08-25T01:00:00Z')).key).toBe('nuit')   // 03h Paris
  })
  it('les bornes exactes appartiennent au shift qui COMMENCE', () => {
    expect(currentShift(at('2026-08-25T03:00:00Z')).key).toBe('matin')  // 05h00 pile
    expect(currentShift(at('2026-08-25T11:00:00Z')).key).toBe('aprem')  // 13h00 pile
    expect(currentShift(at('2026-08-25T19:00:00Z')).key).toBe('nuit')   // 21h00 pile
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/shifts.test.ts`
Expected: FAIL — `Failed to resolve import "./shifts"`.

- [ ] **Step 3: Écrire `shifts.ts`**

```ts
import { addDays } from '../domain/dates'
import { parisDay, parisWallUtcMs } from './time'

export type ShiftKey = 'matin' | 'aprem' | 'nuit'

export interface Shift {
  key: ShiftKey
  label: string
  startH: number
  endH: number
}

/** 3 shifts de 8 h qui couvrent 24 h. Heures en heure locale Paris. */
export const SHIFTS: readonly Shift[] = [
  { key: 'matin', label: 'Matin', startH: 5, endH: 13 },
  { key: 'aprem', label: 'Après-midi', startH: 13, endH: 21 },
  { key: 'nuit', label: 'Nuit', startH: 21, endH: 5 }, // franchit minuit
]

export const shiftByKey = (key: string): Shift | undefined => SHIFTS.find((s) => s.key === key)

/** Les 3 fins de shift : 13 h, 21 h, 05 h. */
export const BOUNDARIES: readonly number[] = SHIFTS.map((s) => s.endH)

export interface ShiftWindow {
  start: number
  end: number
  /** Date Paris de la FIN — c'est elle qui sert à requêter les événements. */
  date: string
  label: string
  range: string
}

/**
 * Fenêtre du shift qui vient de se TERMINER à `nowMs`.
 * Ex. à 13h05 pour « matin » → [aujourd'hui 05 h, aujourd'hui 13 h].
 *     à 05h05 pour « nuit »  → [hier 21 h, aujourd'hui 05 h].
 */
export function shiftWindow(shift: Shift, nowMs: number = Date.now()): ShiftWindow {
  const today = parisDay(new Date(nowMs).toISOString())
  let endDay = today
  // Si la fin de ce shift n'est pas encore passée aujourd'hui, c'est celui d'hier qui a fini.
  if (parisWallUtcMs(endDay, shift.endH) > nowMs) endDay = addDays(endDay, -1)
  const end = parisWallUtcMs(endDay, shift.endH)
  // Le `start` ne se DÉRIVE PAS de `end` par une durée fixe : les deux nuits de bascule d'heure
  // durent 7 h ou 9 h, pas 8. On repasse donc par l'heure murale du jour de départ — la veille
  // quand le shift franchit minuit (cas `nuit`).
  const startDay = shift.startH > shift.endH ? addDays(endDay, -1) : endDay
  const start = parisWallUtcMs(startDay, shift.startH)
  return {
    start,
    end,
    date: endDay,
    label: shift.label,
    range: `${String(shift.startH).padStart(2, '0')}h → ${String(shift.endH).padStart(2, '0')}h`,
  }
}

/** Le shift en cours à `nowMs` (heure de Paris). */
export function currentShift(nowMs: number = Date.now()): Shift {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })
      .format(new Date(nowMs)),
  ) % 24
  // Index littéraux : `noUncheckedIndexedAccess` ne déduit pas que SHIFTS a 3 entrées.
  if (hour >= 5 && hour < 13) return SHIFTS[0] as Shift
  if (hour >= 13 && hour < 21) return SHIFTS[1] as Shift
  return SHIFTS[2] as Shift
}
```

> **Écart assumé par rapport à `src/shifts.js:22`** : l'original calcule
> `now.set({hour: endH})` puis recule d'un jour si le résultat dépasse `now`. Le calcul ci-dessus
> fait la même chose, mais en passant par `parisWallUtcMs` — donc **correct les jours de bascule
> d'heure**, ce que la version luxon gérait via son moteur de fuseau.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/shifts.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit** *(demander l'accord avant)*

```bash
git add packages/core/src/tracking/shifts.ts packages/core/src/tracking/shifts.test.ts
git commit -m "feat(tracking): les 3 shifts et leurs fenêtres"
```

---

## Task 3 : Les segments — le cœur du calcul

**Files:**
- Create: `packages/core/src/tracking/segments.ts`
- Test: `packages/core/src/tracking/segments.test.ts`

**Interfaces:**
- Consumes: `TrackerEvent`, `Segment`, `BuiltSegments`, `LiveStatus` depuis `./types`
- Produces:
  - `const DEFAULT_STALE_MS: number` (180 000 — 3 min, `STALE_MINUTES=3` en prod)
  - `buildSegments(events: TrackerEvent[], opts?: { now?: number; staleMs?: number }): BuiltSegments`
  - `liveFromEvents(events: TrackerEvent[], now?: number, staleMs?: number): LiveStatus | null`
  - `interface DaySummary` et `summarize(built: BuiltSegments, dayStart: number, dayEnd: number): DaySummary`

> C'est le module le plus délicat du portage. Trois invariants que les commentaires du tracker
> signalent comme durement acquis, et que les tests doivent verrouiller :
> 1. **Horloge monotone** — un événement ne peut jamais remonter avant le précédent
>    (`src/compute.js:53`). Un PC à l'heure fausse ne doit pas créer de segment négatif.
> 2. **L'idle est horodaté au début RÉEL de l'inactivité** par l'agent, donc les minutes de
>    battement ne sont jamais comptées comme actives.
> 3. **`crashed` ≠ `openShift`** — un shift sans battement depuis `staleMs` est coupé au dernier
>    battement connu ; un shift qui bat encore court jusqu'à `now`.

- [ ] **Step 1: Écrire le test (il doit échouer)**

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_STALE_MS, buildSegments, liveFromEvents, summarize } from './segments'
import type { TrackerEvent } from './types'

const T0 = Date.parse('2026-08-25T07:00:00Z') // 09h00 Paris
const min = (n: number): number => n * 60_000
const ev = (type: TrackerEvent['type'], offsetMin: number, extra: Partial<TrackerEvent> = {}): TrackerEvent => ({
  type,
  at: new Date(T0 + min(offsetMin)).toISOString(),
  receivedAt: new Date(T0 + min(offsetMin)).toISOString(),
  sessionId: 's1',
  ...extra,
})

describe('buildSegments', () => {
  it('un shift simple : actif du début à la fin', () => {
    const b = buildSegments([ev('shift_start', 0), ev('shift_end', 60)], { now: T0 + min(120) })
    expect(b.segments).toHaveLength(1)
    expect(b.segments[0]).toMatchObject({ kind: 'active', start: T0, end: T0 + min(60) })
    expect(b.openShift).toBe(false)
    expect(b.crashed).toBe(false)
    expect(b.firstStart).toBe(T0)
    expect(b.lastStop).toBe(T0 + min(60))
  })

  it('pause puis reprise : trois segments', () => {
    const b = buildSegments(
      [ev('shift_start', 0), ev('pause', 20), ev('resume', 30), ev('shift_end', 60)],
      { now: T0 + min(120) },
    )
    expect(b.segments.map((s) => s.kind)).toEqual(['active', 'pause', 'active'])
    expect(b.segments[1]).toMatchObject({ start: T0 + min(20), end: T0 + min(30) })
  })

  it('inactivité : le temps idle ne compte pas comme actif', () => {
    const b = buildSegments(
      [ev('shift_start', 0), ev('idle_start', 10), ev('idle_end', 25), ev('shift_end', 40)],
      { now: T0 + min(120) },
    )
    expect(b.segments.map((s) => s.kind)).toEqual(['active', 'idle', 'active'])
  })

  it('horloge qui remonte : le temps n’est jamais négatif', () => {
    const events: TrackerEvent[] = [
      ev('shift_start', 0),
      { ...ev('pause', 0), at: new Date(T0 - min(30)).toISOString() }, // horloge faussée
      ev('shift_end', 60),
    ]
    const b = buildSegments(events, { now: T0 + min(120) })
    for (const s of b.segments) expect(s.end).toBeGreaterThanOrEqual(s.start)
  })

  it('shift jamais clos et plus aucun battement : crashed, coupé au dernier battement', () => {
    const b = buildSegments([ev('shift_start', 0), ev('heartbeat', 30)], { now: T0 + min(120) })
    expect(b.crashed).toBe(true)
    expect(b.openShift).toBe(false)
    expect(b.segments[0]?.end).toBe(T0 + min(30))
  })

  it('shift qui bat encore : ouvert, couru jusqu’à maintenant', () => {
    const now = T0 + min(40)
    const b = buildSegments([ev('shift_start', 0), ev('heartbeat', 39)], { now })
    expect(b.openShift).toBe(true)
    expect(b.crashed).toBe(false)
    expect(b.segments[0]?.end).toBe(now)
  })

  it('shift_end marqué `recovered` : clôture propre mais anormale', () => {
    const b = buildSegments(
      [ev('shift_start', 0), ev('shift_end', 60, { meta: { recovered: true } })],
      { now: T0 + min(120) },
    )
    expect(b.recovered).toBe(true)
    expect(b.crashed).toBe(false)
  })

  it('shift précédent jamais fermé : un nouveau shift_start le clôt', () => {
    const b = buildSegments([ev('shift_start', 0), ev('shift_start', 30), ev('shift_end', 60)], {
      now: T0 + min(120),
    })
    expect(b.segments).toHaveLength(2)
    expect(b.segments[1]?.shiftStart).toBe(T0 + min(30))
  })

  it('DEFAULT_STALE_MS vaut 3 minutes', () => {
    expect(DEFAULT_STALE_MS).toBe(180_000)
  })
})

describe('liveFromEvents', () => {
  it('se fie à receivedAt, pas à l’horloge du poste', () => {
    const now = T0 + min(10)
    const events: TrackerEvent[] = [
      { ...ev('shift_start', 0), at: new Date(T0 + min(9999)).toISOString() }, // horloge délirante
    ]
    expect(liveFromEvents(events, now)).toMatchObject({ state: 'active' })
  })
  it('rien reçu depuis staleMs → hors ligne', () => {
    expect(liveFromEvents([ev('shift_start', 0)], T0 + min(10))).toBeNull()
  })
  it('shift clos → hors ligne', () => {
    expect(liveFromEvents([ev('shift_start', 0), ev('shift_end', 1)], T0 + min(2))).toBeNull()
  })
  it('suit pause et inactivité', () => {
    expect(liveFromEvents([ev('shift_start', 0), ev('pause', 1)], T0 + min(2))?.state).toBe('pause')
    expect(liveFromEvents([ev('shift_start', 0), ev('idle_start', 1)], T0 + min(2))?.state).toBe('idle')
  })
})

describe('summarize', () => {
  it('agrège sur la fenêtre et compte les coupures', () => {
    const b = buildSegments(
      [ev('shift_start', 0), ev('pause', 20), ev('resume', 30), ev('idle_start', 40), ev('idle_end', 50), ev('shift_end', 60)],
      { now: T0 + min(120) },
    )
    const s = summarize(b, T0 - min(60), T0 + min(180))
    expect(s.activeMinutes).toBe(40)
    expect(s.pauseMinutes).toBe(10)
    expect(s.idleMinutes).toBe(10)
    expect(s.pauseCount).toBe(1)
    expect(s.idleCuts).toBe(1)
    expect(s.launched).toBe(true)
    expect(s.hasActivity).toBe(true)
  })
  it('hors fenêtre : firstStart et lastStop sont nuls', () => {
    const b = buildSegments([ev('shift_start', 0), ev('shift_end', 60)], { now: T0 + min(120) })
    const s = summarize(b, T0 + min(600), T0 + min(700))
    expect(s.firstStart).toBeNull()
    expect(s.lastStop).toBeNull()
    expect(s.activeMinutes).toBe(0)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/segments.test.ts`
Expected: FAIL — `Failed to resolve import "./segments"`.

- [ ] **Step 3: Écrire `segments.ts`**

```ts
import type { BuiltSegments, LiveState, LiveStatus, Segment, SegmentKind, TrackerEvent } from './types'

/** Un shift sans battement pendant 3 min est considéré coupé (STALE_MINUTES=3 en production). */
export const DEFAULT_STALE_MS = 3 * 60_000

type State = SegmentKind | 'off'

/**
 * Rejoue le flux d'événements et en déduit des segments typés.
 *
 * L'agent horodate `idle_start` au DÉBUT RÉEL de l'inactivité (now − idleSeconds) : les minutes de
 * battement ne sont donc jamais comptées comme du temps actif.
 */
export function buildSegments(
  events: TrackerEvent[],
  { now = Date.now(), staleMs = DEFAULT_STALE_MS }: { now?: number; staleMs?: number } = {},
): BuiltSegments {
  const segments: Segment[] = []
  let state: State = 'off'
  let segStart: number | null = null
  let lastTs = -Infinity
  let lastHeartbeat: number | null = null
  let firstStart: number | null = null
  let lastStop: number | null = null
  const sessions = new Set<string>()
  let curShiftStart: number | null = null
  let lastCloseRecovered = false

  const close = (end: number): void => {
    if (state !== 'off' && segStart != null && end > segStart) {
      segments.push({ kind: state, start: segStart, end, shiftStart: curShiftStart })
    }
  }
  const to = (next: State, t: number): void => {
    close(t)
    state = next
    segStart = next === 'off' ? null : t
  }

  for (const e of events) {
    // Horloge monotone : un événement ne peut pas remonter avant le précédent.
    const t = Math.max(Date.parse(e.at), lastTs)
    if (!Number.isFinite(t)) continue
    lastTs = t
    if (e.sessionId) sessions.add(e.sessionId)

    switch (e.type) {
      case 'shift_start':
        if (state !== 'off') to('off', t) // shift précédent jamais fermé
        curShiftStart = t
        to('active', t)
        lastHeartbeat = t
        if (firstStart == null) firstStart = t
        break
      case 'pause':
        if (state !== 'off') to('pause', t)
        break
      case 'resume':
        if (state !== 'off') to('active', t)
        break
      case 'idle_start':
        if (state === 'active') to('idle', t)
        break
      case 'idle_end':
        if (state === 'idle') to('active', t)
        break
      case 'shift_end':
        if (state !== 'off') {
          to('off', t)
          lastStop = t
          lastCloseRecovered = e.meta?.recovered === true
        }
        break
      case 'heartbeat':
        if (state !== 'off') lastHeartbeat = t
        break
      default:
        break // `focus` et `model` ne changent pas d'état
    }
  }

  // Shift encore ouvert : soit il tourne vraiment, soit l'app/le PC a planté.
  let crashed = false
  if (state !== 'off' && segStart != null) {
    const deadline = (lastHeartbeat ?? segStart) + staleMs
    if (deadline < now) {
      crashed = true
      close(Math.max(segStart, lastHeartbeat ?? segStart))
    } else {
      close(now)
    }
    if (crashed && lastStop == null) lastStop = lastHeartbeat
  }

  return {
    segments,
    firstStart,
    lastStop,
    crashed,
    recovered: lastCloseRecovered && !crashed,
    openShift: state !== 'off' && !crashed,
    eventCount: events.length,
    sessions: [...sessions],
  }
}

/**
 * État « en direct », calculé sur l'heure de RÉCEPTION serveur et non sur l'horloge du poste.
 * Un PC à l'heure fausse ne disparaît donc pas de « en ligne ».
 * `null` = hors ligne (rien reçu depuis `staleMs`) ou shift fermé.
 */
export function liveFromEvents(
  events: TrackerEvent[],
  now: number = Date.now(),
  staleMs: number = DEFAULT_STALE_MS,
): LiveStatus | null {
  let lastSeen = 0
  let state: LiveState | 'off' = 'off'
  let since: number | null = null

  for (const e of events) {
    const recv = Date.parse(e.receivedAt ?? e.at)
    if (Number.isFinite(recv) && recv > lastSeen) lastSeen = recv
    switch (e.type) {
      case 'shift_start': state = 'active'; since = recv; break
      case 'shift_end': state = 'off'; since = null; break
      case 'pause': if (state !== 'off') { state = 'pause'; since = recv } break
      case 'resume': if (state !== 'off') { state = 'active'; since = recv } break
      case 'idle_start': if (state !== 'off') { state = 'idle'; since = recv } break
      case 'idle_end': if (state !== 'off') { state = 'active'; since = recv } break
      default: break
    }
  }

  if (state === 'off') return null
  if (!lastSeen || now - lastSeen > staleMs) return null // app fermée / PC éteint
  return { state, since: Number.isFinite(since) && since != null ? since : lastSeen }
}

export interface DaySummary {
  activeMinutes: number
  pauseMinutes: number
  idleMinutes: number
  pauseCount: number
  idleCuts: number
  firstStart: number | null
  lastStop: number | null
  crashed: boolean
  recovered: boolean
  openShift: boolean
  launched: boolean
  hasActivity: boolean
}

const overlap = (s: Segment, a: number, b: number): number =>
  Math.max(0, Math.min(s.end, b) - Math.max(s.start, a))

/** Agrège les segments sur la fenêtre [dayStart, dayEnd). */
export function summarize(built: BuiltSegments, dayStart: number, dayEnd: number): DaySummary {
  const ms: Record<SegmentKind, number> = { active: 0, pause: 0, idle: 0 }
  for (const s of built.segments) ms[s.kind] += overlap(s, dayStart, dayEnd)

  const inDay = (t: number | null): boolean => t != null && t >= dayStart && t < dayEnd
  const countIn = (kind: SegmentKind): number =>
    built.segments.filter((s) => s.kind === kind && overlap(s, dayStart, dayEnd) > 0).length

  return {
    activeMinutes: Math.round(ms.active / 60_000),
    pauseMinutes: Math.round(ms.pause / 60_000),
    idleMinutes: Math.round(ms.idle / 60_000),
    pauseCount: countIn('pause'),
    idleCuts: countIn('idle'),
    firstStart: inDay(built.firstStart) ? built.firstStart : null,
    lastStop: inDay(built.lastStop) ? built.lastStop : null,
    // « app fermée » n'est vrai QUE si l'arrêt tombe dans la fenêtre : sinon on afficherait le
    // drapeau sans l'heure (« à — »). Cohérent avec lastStop.
    crashed: built.crashed && inDay(built.lastStop),
    recovered: built.recovered && inDay(built.lastStop),
    openShift: built.openShift,
    launched: built.eventCount > 0,
    hasActivity: ms.active + ms.pause + ms.idle > 0,
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/segments.test.ts`
Expected: PASS — 15 tests.

- [ ] **Step 5: Commit** *(demander l'accord avant)*

```bash
git add packages/core/src/tracking/segments.ts packages/core/src/tracking/segments.test.ts
git commit -m "feat(tracking): rejoue le flux d'events en segments actif/pause/idle"
```

---

## Task 4 : Règles et attribution par app/domaine

**Files:**
- Create: `packages/core/src/tracking/rules.ts`
- Create: `packages/core/src/tracking/focus.ts`
- Test: `packages/core/src/tracking/focus.test.ts`

**Interfaces:**
- Consumes: `BuiltSegments`, `TrackerEvent` depuis `./types`
- Produces:
  - `interface TrackerRules { offTaskThresholdMinutes; stagnantThresholdMinutes; mainTool; toolMinMinutes; latenessMaxMinutes; apps: Set<string>; domains: string[] }`
  - `normalizeRules(raw: RawRules): TrackerRules`
  - `isAllowedApp(proc: string, rules: TrackerRules): boolean`
  - `isAllowedDomain(host: string, rules: TrackerRules): boolean`
  - `normalizeUrl(raw: string | null | undefined): { host: string; path: string } | null`
  - `interface AppItem { label: string; kind: 'app' | 'domain'; minutes: number; allowed: boolean }`
  - `interface AppAttribution { items: AppItem[]; offTask: AppItem[]; offTaskMinutes: number; trackedMinutes: number }`
  - `attributeApps(built, events, windowStart, windowEnd, rules): AppAttribution`

- [ ] **Step 1: Écrire le test (il doit échouer)**

```ts
import { describe, expect, it } from 'vitest'
import { buildSegments } from './segments'
import { attributeApps, normalizeUrl } from './focus'
import { isAllowedDomain, normalizeRules } from './rules'
import type { TrackerEvent } from './types'

const T0 = Date.parse('2026-08-25T07:00:00Z')
const min = (n: number): number => n * 60_000
const rules = normalizeRules({ apps: ['chrome', 'discord'], domains: ['mypuls.app', 'onlyfans.com'] })

const focus = (offsetMin: number, meta: Record<string, unknown>): TrackerEvent => ({
  type: 'focus',
  at: new Date(T0 + min(offsetMin)).toISOString(),
  meta,
})
const state = (type: TrackerEvent['type'], offsetMin: number): TrackerEvent => ({
  type,
  at: new Date(T0 + min(offsetMin)).toISOString(),
})

describe('normalizeUrl', () => {
  it('extrait hôte et chemin, jette query et fragment', () => {
    expect(normalizeUrl('https://www.MyPuls.app/chat/42?token=secret#x')).toEqual({
      host: 'mypuls.app',
      path: '/chat/42',
    })
  })
  it('accepte une URL sans protocole', () => {
    expect(normalizeUrl('onlyfans.com/foo')?.host).toBe('onlyfans.com')
  })
  it('rejette ce qui n’est pas exploitable', () => {
    expect(normalizeUrl('')).toBeNull()
    expect(normalizeUrl(null)).toBeNull()
    expect(normalizeUrl('file:///C:/secret.txt')).toBeNull()
    expect(normalizeUrl('localhost')).toBeNull()   // pas de point → pas un hôte
  })
})

describe('isAllowedDomain', () => {
  it('accepte un sous-domaine d’un domaine autorisé', () => {
    expect(isAllowedDomain('app.mypuls.app', rules)).toBe(true)
    expect(isAllowedDomain('mypuls.app', rules)).toBe(true)
  })
  it('refuse un domaine qui se termine par le même texte sans en être un sous-domaine', () => {
    expect(isAllowedDomain('notmypuls.app', rules)).toBe(false)
    expect(isAllowedDomain('youtube.com', rules)).toBe(false)
  })
})

describe('attributeApps', () => {
  it('n’attribue que le temps ACTIF', () => {
    const events: TrackerEvent[] = [
      state('shift_start', 0),
      focus(0, { app: 'chrome', host: 'mypuls.app' }),
      state('pause', 30),
      focus(30, { app: 'chrome', host: 'youtube.com' }),  // pendant la pause : non attribué
      state('resume', 50),
      focus(50, { app: 'chrome', host: 'youtube.com' }),
      state('shift_end', 60),
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const a = attributeApps(built, events, T0, T0 + min(120), rules)
    const byLabel = Object.fromEntries(a.items.map((i) => [i.label, i.minutes]))
    expect(byLabel['mypuls.app']).toBe(30)
    expect(byLabel['youtube.com']).toBe(10)   // 50→60 seulement, pas 30→50 (en pause)
    expect(a.offTaskMinutes).toBe(10)
    expect(a.trackedMinutes).toBe(40)
  })

  it('le temps actif SANS donnée de fenêtre reste inconnu, jamais hors tâche', () => {
    const events: TrackerEvent[] = [state('shift_start', 0), state('shift_end', 60)]
    const built = buildSegments(events, { now: T0 + min(120) })
    const a = attributeApps(built, events, T0, T0 + min(120), rules)
    expect(a.items).toHaveLength(0)
    expect(a.offTaskMinutes).toBe(0)
    expect(a.trackedMinutes).toBe(0)
  })

  it('retombe sur l’app quand l’hôte est illisible', () => {
    const events: TrackerEvent[] = [
      state('shift_start', 0),
      focus(0, { app: 'discord' }),
      state('shift_end', 20),
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const a = attributeApps(built, events, T0, T0 + min(120), rules)
    expect(a.items[0]).toMatchObject({ label: 'discord', kind: 'app', allowed: true, minutes: 20 })
  })

  it('deux plages actives du MÊME label sont additionnées sous une seule entrée', () => {
    const events: TrackerEvent[] = [
      state('shift_start', 0),
      focus(0, { app: 'chrome', host: 'mypuls.app' }),
      focus(10, { app: 'chrome', host: 'youtube.com' }),
      focus(20, { app: 'chrome', host: 'mypuls.app' }),
      state('shift_end', 40),
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const a = attributeApps(built, events, T0, T0 + min(40), rules)
    // Sans regroupement par clé, on aurait 3 entrées (10 + 10 + 20) au lieu de 2.
    expect(a.items).toHaveLength(2)
    const byLabel = Object.fromEntries(a.items.map((i) => [i.label, i.minutes]))
    expect(byLabel['mypuls.app']).toBe(30)
    expect(byLabel['youtube.com']).toBe(10)
  })

  it('fenêtre qui COUPE les segments : seule la portion dans la fenêtre est attribuée', () => {
    // Sans clipping, une implémentation qui attribue le segment entier rendrait 30 et 10.
    const events: TrackerEvent[] = [
      state('shift_start', 0),
      focus(0, { app: 'chrome', host: 'mypuls.app' }),
      state('pause', 30),
      state('resume', 50),
      focus(50, { app: 'chrome', host: 'youtube.com' }),
      state('shift_end', 60),
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const a = attributeApps(built, events, T0 + min(15), T0 + min(55), rules)
    const byLabel = Object.fromEntries(a.items.map((i) => [i.label, i.minutes]))
    expect(byLabel['mypuls.app']).toBe(15)   // actif [15,30] seulement
    expect(byLabel['youtube.com']).toBe(5)   // actif [50,55] seulement
    expect(a.trackedMinutes).toBe(20)
  })

  it('trie par minutes décroissantes', () => {
    const events: TrackerEvent[] = [
      state('shift_start', 0),
      focus(0, { app: 'chrome', host: 'youtube.com' }),
      focus(5, { app: 'chrome', host: 'mypuls.app' }),
      state('shift_end', 60),
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const a = attributeApps(built, events, T0, T0 + min(120), rules)
    expect(a.items.map((i) => i.label)).toEqual(['mypuls.app', 'youtube.com'])
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/focus.test.ts`
Expected: FAIL — `Failed to resolve import "./focus"`.

- [ ] **Step 3: Écrire `rules.ts`**

```ts
/**
 * Règles de la liste blanche. Le tracker les lisait dans `config/rules.json` ; ici elles viennent
 * de la table `tracker_rules` (une ligne). Ce module ne fait que NORMALISER et TESTER — il ne
 * charge rien.
 */

export interface RawRules {
  offTaskThresholdMinutes?: number | null
  stagnantThresholdMinutes?: number | null
  mainTool?: string | null
  toolMinMinutes?: number | null
  latenessMaxMinutes?: number | null
  apps?: readonly string[] | null
  domains?: readonly string[] | null
}

export interface TrackerRules {
  /** Au-delà, le hors-tâche déclenche un signalement. */
  offTaskThresholdMinutes: number
  /** Plage active continue sans le moindre changement de fenêtre → écran figé. */
  stagnantThresholdMinutes: number
  /** Outil de chat principal : le temps passé dessus sert de référence. */
  mainTool: string
  /** En dessous de ce temps sur l'outil principal → volet Inactivité. */
  toolMinMinutes: number
  /** Premier pointage plus tard que N min après le début du créneau → Retard. */
  latenessMaxMinutes: number
  apps: Set<string>
  domains: string[]
}

// Le type se dérive de `TrackerRules` (déjà normalisé, sans `null`) et NON de `RawRules` :
// `Required<T>` retire le `?` mais CONSERVE le `| null`, donc `Required<Omit<RawRules, …>>`
// laisserait `number | null` et `num(v, fallback: number)` ne compilerait pas.
export const DEFAULT_RULES: Omit<TrackerRules, 'apps' | 'domains'> & {
  apps: string[]
  domains: string[]
} = {
  offTaskThresholdMinutes: 30,
  stagnantThresholdMinutes: 60,
  mainTool: 'mypuls.app',
  toolMinMinutes: 330, // 5 h 30
  latenessMaxMinutes: 10,
  apps: ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'discord', 'slack', 'telegram'],
  domains: ['mypuls.app', 'onlyfans.com', 'fansly.com', 'fanvue.com', 'discord.com', 'telegram.org'],
}

const list = (arr: readonly string[] | null | undefined, fallback: string[]): string[] =>
  (Array.isArray(arr) ? arr : fallback).map((s) => String(s).toLowerCase().trim()).filter(Boolean)

const num = (v: number | null | undefined, fallback: number): number =>
  Number.isFinite(Number(v)) ? Number(v) : fallback

export function normalizeRules(raw: RawRules = {}): TrackerRules {
  return {
    offTaskThresholdMinutes: num(raw.offTaskThresholdMinutes, DEFAULT_RULES.offTaskThresholdMinutes),
    stagnantThresholdMinutes: num(raw.stagnantThresholdMinutes, DEFAULT_RULES.stagnantThresholdMinutes),
    mainTool: String(raw.mainTool ?? DEFAULT_RULES.mainTool).toLowerCase().trim(),
    toolMinMinutes: num(raw.toolMinMinutes, DEFAULT_RULES.toolMinMinutes),
    latenessMaxMinutes: num(raw.latenessMaxMinutes, DEFAULT_RULES.latenessMaxMinutes),
    // Les navigateurs sont dans la liste des apps : quand l'URL n'est pas lisible, le temps
    // navigateur est mis au CRÉDIT du chatter plutôt que compté hors tâche.
    apps: new Set(list(raw.apps, DEFAULT_RULES.apps).map((a) => a.replace(/\.exe$/, ''))),
    domains: list(raw.domains, DEFAULT_RULES.domains),
  }
}

/** Un domaine est autorisé si lui-même ou un de ses parents est en liste blanche. */
export const isAllowedDomain = (host: string, rules: TrackerRules): boolean => {
  const h = String(host).toLowerCase()
  return rules.domains.some((d) => h === d || h.endsWith(`.${d}`))
}

export const isAllowedApp = (proc: string, rules: TrackerRules): boolean =>
  rules.apps.has(String(proc).toLowerCase().replace(/\.exe$/, ''))
```

- [ ] **Step 4: Écrire `focus.ts`**

```ts
import { isAllowedApp, isAllowedDomain, type TrackerRules } from './rules'
import type { BuiltSegments, TrackerEvent } from './types'

/**
 * Attribution du temps ACTIF par application / domaine.
 *
 * Chaque `focus` vaut jusqu'au `focus` suivant. On croise ces intervalles avec les segments ACTIFS
 * seulement : le temps en pause, inactif ou hors shift n'est jamais attribué. Le temps actif sans
 * donnée de fenêtre reste « inconnu » et n'est JAMAIS compté comme hors tâche — on ne pénalise
 * jamais sur une incertitude.
 */

const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number): number =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))

/** Normalise une URL brute en { host, path } ; `null` si inexploitable. */
export function normalizeUrl(raw: string | null | undefined): { host: string; path: string } | null {
  if (!raw) return null
  let s = String(raw).trim()
  if (!s) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if (!['http:', 'https:'].includes(u.protocol)) return null
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    if (!host.includes('.')) return null
    // On jette query et fragment : ils peuvent contenir des jetons de session.
    return { host, path: u.pathname && u.pathname !== '/' ? u.pathname : '' }
  } catch {
    return null
  }
}

interface Interval {
  start: number
  end: number
  app: string | null
  host: string | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

function buildIntervals(events: TrackerEvent[]): Interval[] {
  const points: { t: number; app: string | null; host: string | null }[] = []
  let last = -Infinity
  for (const e of events) {
    if (e.type !== 'focus') continue
    const t = Math.max(Date.parse(e.at), last)
    if (!Number.isFinite(t)) continue
    last = t
    points.push({ t, app: str(e.meta?.app), host: str(e.meta?.host) })
  }
  return points.map((p, i) => ({
    start: p.t,
    end: i + 1 < points.length ? (points[i + 1] as { t: number }).t : Infinity,
    app: p.app,
    host: p.host,
  }))
}

interface Key {
  id: string
  label: string
  kind: 'app' | 'domain'
  host: string | null
  app: string | null
}

function keyOf(iv: Interval): Key | null {
  if (iv.host) return { id: `d:${iv.host}`, label: iv.host, kind: 'domain', host: iv.host, app: null }
  if (iv.app) return { id: `a:${iv.app.toLowerCase()}`, label: iv.app, kind: 'app', host: null, app: iv.app }
  return null
}

export interface AppItem {
  label: string
  kind: 'app' | 'domain'
  minutes: number
  allowed: boolean
}

export interface AppAttribution {
  items: AppItem[]
  offTask: AppItem[]
  offTaskMinutes: number
  trackedMinutes: number
}

export function attributeApps(
  built: BuiltSegments,
  events: TrackerEvent[],
  windowStart: number,
  windowEnd: number,
  rules: TrackerRules,
): AppAttribution {
  const active = built.segments.filter((s) => s.kind === 'active')
  const intervals = buildIntervals(events)
  const byKey = new Map<string, Key & { ms: number }>()

  for (const seg of active) {
    const s = Math.max(seg.start, windowStart)
    const e = Math.min(seg.end, windowEnd)
    if (e <= s) continue
    for (const iv of intervals) {
      const ms = overlap(s, e, iv.start, iv.end)
      if (ms <= 0) continue
      const key = keyOf(iv)
      if (!key) continue
      const rec = byKey.get(key.id) ?? { ...key, ms: 0 }
      rec.ms += ms
      byKey.set(key.id, rec)
    }
  }

  const items: AppItem[] = [...byKey.values()]
    .map((r) => ({
      label: r.label,
      kind: r.kind,
      minutes: Math.round(r.ms / 60_000),
      allowed: r.kind === 'domain' ? isAllowedDomain(r.host as string, rules) : isAllowedApp(r.app as string, rules),
    }))
    .filter((i) => i.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)

  const offTask = items.filter((i) => !i.allowed)
  return {
    items,
    offTask,
    offTaskMinutes: offTask.reduce((n, i) => n + i.minutes, 0),
    trackedMinutes: items.reduce((n, i) => n + i.minutes, 0),
  }
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/focus.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 6: Commit** *(demander l'accord avant)*

```bash
git add packages/core/src/tracking/rules.ts packages/core/src/tracking/focus.ts packages/core/src/tracking/focus.test.ts
git commit -m "feat(tracking): liste blanche et attribution du temps par app/domaine"
```

---

## Task 5 : Attribution par modèle

**Files:**
- Create: `packages/core/src/tracking/models.ts`
- Test: `packages/core/src/tracking/models.test.ts`

**Interfaces:**
- Consumes: `BuiltSegments`, `TrackerEvent` depuis `./types`
- Produces:
  - `interface ModelTime { model: string; minutes: number }`
  - `interface ModelAttribution { perModel: ModelTime[]; main: string | null; untrackedMinutes: number }`
  - `attributeModels(built, events, windowStart, windowEnd): ModelAttribution`
  - `modelKey(name: string): string`

- [ ] **Step 1: Écrire le test (il doit échouer)**

```ts
import { describe, expect, it } from 'vitest'
import { attributeModels, modelKey } from './models'
import { buildSegments } from './segments'
import type { TrackerEvent } from './types'

const T0 = Date.parse('2026-08-25T07:00:00Z')
const min = (n: number): number => n * 60_000
const at = (offsetMin: number): string => new Date(T0 + min(offsetMin)).toISOString()

describe('modelKey', () => {
  it('insensible à la casse et aux espaces multiples', () => {
    expect(modelKey('  CARLA   Rose ')).toBe('carla rose')
    expect(modelKey('carla')).toBe(modelKey('CARLA'))
  })
})

describe('attributeModels', () => {
  it('répartit le temps actif entre les modèles, le principal en tête', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'model', at: at(0), meta: { model: 'CARLA' } },
      { type: 'model', at: at(40), meta: { model: 'LEA' } },
      { type: 'shift_end', at: at(60) },
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const r = attributeModels(built, events, T0, T0 + min(120))
    expect(r.perModel).toEqual([
      { model: 'CARLA', minutes: 40 },
      { model: 'LEA', minutes: 20 },
    ])
    expect(r.main).toBe('CARLA')
    expect(r.untrackedMinutes).toBe(0)
  })

  it('le temps actif avant tout choix de modèle est « non attribué »', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'model', at: at(20), meta: { model: 'CARLA' } },
      { type: 'shift_end', at: at(60) },
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const r = attributeModels(built, events, T0, T0 + min(120))
    expect(r.perModel).toEqual([{ model: 'CARLA', minutes: 40 }])
    expect(r.untrackedMinutes).toBe(20)
  })

  it('la pause n’est attribuée à aucun modèle', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'model', at: at(0), meta: { model: 'CARLA' } },
      { type: 'pause', at: at(20) },
      { type: 'resume', at: at(50) },
      { type: 'shift_end', at: at(60) },
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const r = attributeModels(built, events, T0, T0 + min(120))
    expect(r.perModel).toEqual([{ model: 'CARLA', minutes: 30 }])
  })

  it('fenêtre qui COUPE le segment : seule la portion dans la fenêtre est attribuée', () => {
    // Sans clipping, on rendrait CARLA 40 / LEA 20 comme sur la fenêtre pleine.
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'model', at: at(0), meta: { model: 'CARLA' } },
      { type: 'model', at: at(40), meta: { model: 'LEA' } },
      { type: 'shift_end', at: at(60) },
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const r = attributeModels(built, events, T0 + min(20), T0 + min(50))
    expect(r.perModel).toEqual([
      { model: 'CARLA', minutes: 20 },
      { model: 'LEA', minutes: 10 },
    ])
    expect(r.untrackedMinutes).toBe(0)
  })

  it('sans aucun event model : rien attribué, tout non attribué', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'shift_end', at: at(60) },
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const r = attributeModels(built, events, T0, T0 + min(120))
    expect(r.perModel).toEqual([])
    expect(r.main).toBeNull()
    expect(r.untrackedMinutes).toBe(60)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/models.test.ts`
Expected: FAIL — `Failed to resolve import "./models"`.

- [ ] **Step 3: Écrire `models.ts`**

```ts
import type { BuiltSegments, TrackerEvent } from './types'

/**
 * Attribution du temps ACTIF par modèle.
 *
 * L'app envoie un événement `model` à chaque changement de modèle. Chaque choix vaut jusqu'au
 * suivant. Comme pour les apps, seul le temps ACTIF est attribué.
 */

const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number): number =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))

/** Clé de dédoublonnage d'un nom de modèle : « CARLA » et « carla » sont le même modèle. */
export const modelKey = (name: string): string =>
  String(name).trim().toLowerCase().replace(/\s+/g, ' ')

interface Interval {
  start: number
  end: number
  model: string
}

function buildIntervals(events: TrackerEvent[]): Interval[] {
  const points: { t: number; model: string }[] = []
  let last = -Infinity
  for (const e of events) {
    if (e.type !== 'model') continue
    const t = Math.max(Date.parse(e.at), last)
    if (!Number.isFinite(t)) continue
    last = t
    const model = e.meta?.model
    if (typeof model === 'string' && model.trim()) points.push({ t, model: model.trim() })
  }
  return points.map((p, i) => ({
    start: p.t,
    end: i + 1 < points.length ? (points[i + 1] as { t: number }).t : Infinity,
    model: p.model,
  }))
}

export interface ModelTime {
  model: string
  minutes: number
}

export interface ModelAttribution {
  perModel: ModelTime[]
  /** Le modèle sur lequel le chatter a passé le plus de temps. */
  main: string | null
  untrackedMinutes: number
}

export function attributeModels(
  built: BuiltSegments,
  events: TrackerEvent[],
  windowStart: number,
  windowEnd: number,
): ModelAttribution {
  const active = built.segments.filter((s) => s.kind === 'active')
  const intervals = buildIntervals(events)
  // Regroupement par CLÉ normalisée — « CARLA » et « carla » sont le MÊME modèle — en gardant le
  // premier libellé rencontré pour l'affichage. Sans ça, une simple différence de casse scinde un
  // modèle en deux lignes et peut faire élire le mauvais `main`.
  const byModel = new Map<string, { label: string; ms: number }>()
  let attributed = 0

  for (const seg of active) {
    const s = Math.max(seg.start, windowStart)
    const e = Math.min(seg.end, windowEnd)
    if (e <= s) continue
    for (const iv of intervals) {
      const ms = overlap(s, e, iv.start, iv.end)
      if (ms <= 0) continue
      const key = modelKey(iv.model)
      const rec = byModel.get(key) ?? { label: iv.model, ms: 0 }
      rec.ms += ms
      byModel.set(key, rec)
      attributed += ms
    }
  }

  const activeMs = active.reduce((n, s) => n + overlap(s.start, s.end, windowStart, windowEnd), 0)

  const perModel = [...byModel.values()]
    .map((r) => ({ model: r.label, minutes: Math.round(r.ms / 60_000) }))
    .filter((m) => m.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)

  return {
    perModel,
    main: perModel[0]?.model ?? null,
    untrackedMinutes: Math.round(Math.max(0, activeMs - attributed) / 60_000),
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/models.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit** *(demander l'accord avant)*

```bash
git add packages/core/src/tracking/models.ts packages/core/src/tracking/models.test.ts
git commit -m "feat(tracking): attribution du temps actif par modèle"
```

---

## Task 6 : Écran figé

**Files:**
- Create: `packages/core/src/tracking/stagnant.ts`
- Test: `packages/core/src/tracking/stagnant.test.ts`

**Interfaces:**
- Consumes: `BuiltSegments`, `TrackerEvent` depuis `./types`
- Produces:
  - `interface StagnantStretch { minutes: number; from: number | null; to: number | null; tracked: boolean }`
  - `stagnantStretch(built, events, windowStart, windowEnd): StagnantStretch`

> Le compteur d'inactivité dit si quelqu'un est devant le PC, la liste blanche dit sur quoi. Aucun
> des deux ne voit un simulateur de souris laissé sur un onglet autorisé. Le signal qui reste est le
> **changement de fenêtre** : une longue plage active sans le moindre changement est anormale.
> **On ne conclut jamais d'une absence de donnée** : moins de 2 changements → `tracked: false`, on
> ne signale rien.

- [ ] **Step 1: Écrire le test (il doit échouer)**

```ts
import { describe, expect, it } from 'vitest'
import { buildSegments } from './segments'
import { stagnantStretch } from './stagnant'
import type { TrackerEvent } from './types'

const T0 = Date.parse('2026-08-25T07:00:00Z')
const min = (n: number): number => n * 60_000
const at = (offsetMin: number): string => new Date(T0 + min(offsetMin)).toISOString()
const focus = (offsetMin: number): TrackerEvent => ({ type: 'focus', at: at(offsetMin), meta: { app: 'chrome' } })

describe('stagnantStretch', () => {
  it('trouve la plus longue plage active sans changement de fenêtre', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      focus(0), focus(5), focus(10),      // activité normale
      focus(100),                          // 90 min sans le moindre changement
      { type: 'shift_end', at: at(120) },
    ]
    const built = buildSegments(events, { now: T0 + min(200) })
    const s = stagnantStretch(built, events, T0, T0 + min(200))
    expect(s.tracked).toBe(true)
    expect(s.minutes).toBe(90)
    expect(s.from).toBe(T0 + min(10))
    expect(s.to).toBe(T0 + min(100))
  })

  it('moins de 2 changements : on ne signale RIEN (donnée absente ≠ faute)', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      focus(0),
      { type: 'shift_end', at: at(120) },
    ]
    const built = buildSegments(events, { now: T0 + min(200) })
    expect(stagnantStretch(built, events, T0, T0 + min(200))).toEqual({
      minutes: 0, from: null, to: null, tracked: false,
    })
  })

  it('aucun segment actif : rien à signaler', () => {
    const built = buildSegments([], { now: T0 })
    expect(stagnantStretch(built, [], T0, T0 + min(200)).tracked).toBe(false)
  })

  it('la pause coupe la plage : elle n’est pas « active »', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      focus(0), focus(2),
      { type: 'pause', at: at(10) },
      { type: 'resume', at: at(70) },      // 60 min de pause, pas d'écran figé
      focus(75),
      { type: 'shift_end', at: at(80) },
    ]
    const built = buildSegments(events, { now: T0 + min(200) })
    const s = stagnantStretch(built, events, T0, T0 + min(200))
    expect(s.minutes).toBeLessThanOrEqual(10)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/stagnant.test.ts`
Expected: FAIL — `Failed to resolve import "./stagnant"`.

- [ ] **Step 3: Écrire `stagnant.ts`**

```ts
import type { BuiltSegments, TrackerEvent } from './types'

/**
 * Détection d'écran figé.
 *
 * Le compteur d'inactivité dit si quelqu'un est devant le PC ; la liste blanche dit sur quoi. Aucun
 * des deux ne voit un simulateur de souris laissé sur un onglet autorisé : le poste paraît actif,
 * sur un site légitime, pendant des heures.
 *
 * Le signal qui reste, et qu'on collecte déjà : le CHANGEMENT de fenêtre. Un chatter qui travaille
 * bascule sans arrêt. Une longue plage active sans le moindre changement est anormale.
 *
 * On ne conclut JAMAIS d'une absence de donnée : si le suivi des fenêtres n'a rien remonté (vieille
 * version de l'app, capture impossible), on ne signale rien.
 */

export interface StagnantStretch {
  minutes: number
  from: number | null
  to: number | null
  /** `false` = on n'a pas assez de données de fenêtre pour se prononcer. */
  tracked: boolean
}

export function stagnantStretch(
  built: BuiltSegments,
  events: TrackerEvent[],
  windowStart: number,
  windowEnd: number,
): StagnantStretch {
  const active = built.segments
    .filter((s) => s.kind === 'active')
    .map((s): [number, number] => [Math.max(s.start, windowStart), Math.min(s.end, windowEnd)])
    .filter(([s, e]) => e > s)
  if (!active.length) return { minutes: 0, from: null, to: null, tracked: false }

  // Instants où la fenêtre au premier plan a changé.
  const changes = events
    .filter((e) => e.type === 'focus')
    .map((e) => Date.parse(e.at))
    .filter((t) => Number.isFinite(t) && t >= windowStart && t <= windowEnd)
    .sort((a, b) => a - b)

  // Moins de 2 changements : soit l'app ne suit pas les fenêtres, soit elles sont illisibles.
  // Dans le doute, on ne signale pas.
  if (changes.length < 2) return { minutes: 0, from: null, to: null, tracked: false }

  let best: StagnantStretch = { minutes: 0, from: null, to: null, tracked: true }
  for (const [s, e] of active) {
    // Bornes des trous : début du segment, chaque changement dedans, fin du segment.
    const marks = [s, ...changes.filter((t) => t > s && t < e), e]
    for (let i = 1; i < marks.length; i++) {
      const to = marks[i] as number
      const from = marks[i - 1] as number
      const minutes = Math.round((to - from) / 60_000)
      if (minutes > best.minutes) best = { minutes, from, to, tracked: true }
    }
  }
  return best
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/stagnant.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit** *(demander l'accord avant)*

```bash
git add packages/core/src/tracking/stagnant.ts packages/core/src/tracking/stagnant.test.ts
git commit -m "feat(tracking): détection d'écran figé"
```

---

## Task 7 : Répartition par poste

**Files:**
- Create: `packages/core/src/tracking/devices.ts`
- Test: `packages/core/src/tracking/devices.test.ts`

**Interfaces:**
- Consumes: `buildSegments` depuis `./segments` ; `TrackerEvent` depuis `./types`
- Produces:
  - `const OVERLAP_ALERT_MINUTES: number` (10)
  - `interface MachineSlice { id: string | null; label: string; minutes: number; from: number; to: number; intervals: [number, number][] }`
  - `interface MachineBreakdown { machines: MachineSlice[]; multi: boolean; switches: { at: number; from: string; to: string }[]; overlapMinutes: number; overlapParts: [number, number][]; unionMinutes: number }`
  - `machineBreakdown(events, windowStart, windowEnd, now?): MachineBreakdown`

> **Changer d'ordinateur est légitime** : on l'affiche comme une information, pas comme une faute.
> Ce qui mérite une alerte, c'est **deux postes actifs en même temps** — là, le temps est compté
> deux fois et le total juste est l'union, pas la somme.
>
> **Écart assumé** : l'original appelle `buildSegments(evs, { now: Date.now() })` en dur
> (`src/devices.js:56`), ce qui rend la fonction non testable. Ici `now` est un paramètre.

- [ ] **Step 1: Écrire le test (il doit échouer)**

```ts
import { describe, expect, it } from 'vitest'
import { OVERLAP_ALERT_MINUTES, machineBreakdown } from './devices'
import type { TrackerEvent } from './types'

const T0 = Date.parse('2026-08-25T07:00:00Z')
const min = (n: number): number => n * 60_000
const NOW = T0 + min(500)
const ev = (type: TrackerEvent['type'], offsetMin: number, machineId: string | null): TrackerEvent => ({
  type,
  at: new Date(T0 + min(offsetMin)).toISOString(),
  machineId,
})

describe('machineBreakdown', () => {
  it('un seul poste : pas de multi, pas de chevauchement', () => {
    const events = [ev('shift_start', 0, 'A'), ev('shift_end', 60, 'A')]
    const r = machineBreakdown(events, T0, T0 + min(300), NOW)
    expect(r.machines).toHaveLength(1)
    expect(r.machines[0]).toMatchObject({ id: 'A', label: 'Poste 1', minutes: 60 })
    expect(r.multi).toBe(false)
    expect(r.overlapMinutes).toBe(0)
    expect(r.unionMinutes).toBe(60)
  })

  it('deux postes successifs : bascule signalée, pas de chevauchement', () => {
    const events = [
      ev('shift_start', 0, 'A'), ev('shift_end', 60, 'A'),
      ev('shift_start', 70, 'B'), ev('shift_end', 130, 'B'),
    ]
    const r = machineBreakdown(events, T0, T0 + min(300), NOW)
    expect(r.multi).toBe(true)
    expect(r.overlapMinutes).toBe(0)
    expect(r.unionMinutes).toBe(120)
    expect(r.switches).toHaveLength(1)
    expect(r.switches[0]).toMatchObject({ from: 'Poste 1', to: 'Poste 2' })
  })

  it('deux postes SIMULTANÉS : le chevauchement est compté, l’union corrige le total', () => {
    const events = [
      ev('shift_start', 0, 'A'), ev('shift_end', 60, 'A'),
      ev('shift_start', 30, 'B'), ev('shift_end', 90, 'B'),
    ]
    const r = machineBreakdown(events, T0, T0 + min(300), NOW)
    expect(r.multi).toBe(true)
    expect(r.overlapMinutes).toBe(30)          // 30→60
    expect(r.unionMinutes).toBe(90)            // et non 120 : le temps commun ne compte qu'une fois
  })

  it('fenêtre qui COUPE : `clip` borne chaque poste avant tout calcul', () => {
    // Sans clipping : 60/60, chevauchement 30, union 90 — comme sur la fenêtre pleine.
    const events = [
      ev('shift_start', 0, 'A'), ev('shift_end', 60, 'A'),
      ev('shift_start', 30, 'B'), ev('shift_end', 90, 'B'),
    ]
    const r = machineBreakdown(events, T0 + min(20), T0 + min(70), NOW)
    expect(r.machines.map((m) => m.minutes)).toEqual([40, 40])   // A [20,60], B [30,70]
    expect(r.overlapMinutes).toBe(30)                             // [30,60] inchangé
    expect(r.unionMinutes).toBe(50)                               // [20,70]
  })

  it('postes sans identifiant : historique d’avant la 1.0.3, on ne signale rien', () => {
    const events = [ev('shift_start', 0, null), ev('shift_end', 60, null)]
    const r = machineBreakdown(events, T0, T0 + min(300), NOW)
    expect(r.multi).toBe(false)
  })

  it('le seuil d’alerte est de 10 minutes', () => {
    expect(OVERLAP_ALERT_MINUTES).toBe(10)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/devices.test.ts`
Expected: FAIL — `Failed to resolve import "./devices"`.

- [ ] **Step 3: Écrire `devices.ts`**

```ts
import { buildSegments } from './segments'
import type { TrackerEvent } from './types'

/**
 * Répartition du temps actif par POSTE.
 *
 * Changer d'ordinateur est légitime : on le signale comme une information (« changement de poste à
 * 14h20 »), pas comme une faute. Ce qui mérite une alerte, c'est deux postes actifs EN MÊME TEMPS —
 * là, le temps est compté deux fois, et le total juste est l'union, pas la somme.
 */

export const OVERLAP_ALERT_MINUTES = 10

type Interval = [number, number]

const clip = (iv: Interval[], start: number, end: number): Interval[] =>
  iv
    .map(([s, e]): Interval => [Math.max(s, start), Math.min(e, end)])
    .filter(([s, e]) => e > s)

const total = (iv: Interval[]): number =>
  Math.round(iv.reduce((t, [s, e]) => t + (e - s), 0) / 60_000)

function unionOf(lists: Interval[][]): Interval[] {
  const all = lists.flat().sort((a, b) => a[0] - b[0])
  const merged: Interval[] = []
  for (const cur of all) {
    const last = merged[merged.length - 1]
    if (last && cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1])
    else merged.push([cur[0], cur[1]])
  }
  return merged
}

function overlapOf(a: Interval[], b: Interval[]): { minutes: number; parts: Interval[] } {
  let ms = 0
  const parts: Interval[] = []
  for (const [s1, e1] of a) {
    for (const [s2, e2] of b) {
      const o = Math.min(e1, e2) - Math.max(s1, s2)
      if (o > 0) {
        ms += o
        parts.push([Math.max(s1, s2), Math.min(e1, e2)])
      }
    }
  }
  return { minutes: Math.round(ms / 60_000), parts }
}

export interface MachineSlice {
  id: string | null
  label: string
  minutes: number
  from: number
  to: number
  intervals: Interval[]
}

export interface MachineBreakdown {
  machines: MachineSlice[]
  multi: boolean
  switches: { at: number; from: string; to: string }[]
  overlapMinutes: number
  overlapParts: Interval[]
  unionMinutes: number
}

export function machineBreakdown(
  events: TrackerEvent[],
  windowStart: number,
  windowEnd: number,
  now: number = Date.now(),
): MachineBreakdown {
  const groups = new Map<string | null, TrackerEvent[]>()
  for (const e of events) {
    const k = e.machineId ?? null
    const bucket = groups.get(k)
    if (bucket) bucket.push(e)
    else groups.set(k, [e])
  }

  const machines: MachineSlice[] = []
  for (const [id, evs] of groups) {
    const intervals = clip(
      buildSegments(evs, { now }).segments
        .filter((s) => s.kind === 'active')
        .map((s): Interval => [s.start, s.end]),
      windowStart,
      windowEnd,
    )
    if (!intervals.length) continue
    const first = intervals[0] as Interval
    const last = intervals[intervals.length - 1] as Interval
    machines.push({ id, label: '', minutes: total(intervals), from: first[0], to: last[1], intervals })
  }

  // Numérotés dans l'ordre d'apparition : « Poste 1 », « Poste 2 »…
  machines.sort((a, b) => a.from - b.from)
  machines.forEach((m, i) => { m.label = `Poste ${i + 1}` })

  // L'app n'envoyait pas d'identifiant avant la 1.0.3 : un seul groupe sans id n'est pas un
  // « poste », c'est juste de l'historique. On ne signale rien.
  const known = machines.filter((m) => m.id)
  if (machines.length < 2 || known.length < 2) {
    return {
      machines,
      multi: false,
      switches: [],
      overlapMinutes: 0,
      overlapParts: [],
      unionMinutes: total(machines.flatMap((m) => m.intervals)),
    }
  }

  let overlapMinutes = 0
  const overlapParts: Interval[] = []
  for (let i = 0; i < machines.length; i++) {
    for (let j = i + 1; j < machines.length; j++) {
      const o = overlapOf((machines[i] as MachineSlice).intervals, (machines[j] as MachineSlice).intervals)
      overlapMinutes += o.minutes
      overlapParts.push(...o.parts)
    }
  }

  const timeline = machines
    .flatMap((m) => m.intervals.map(([s, e]) => ({ s, e, label: m.label })))
    .sort((a, b) => a.s - b.s)
  const switches: { at: number; from: string; to: string }[] = []
  for (let i = 1; i < timeline.length; i++) {
    const cur = timeline[i] as { s: number; label: string }
    const prev = timeline[i - 1] as { label: string }
    if (cur.label !== prev.label) switches.push({ at: cur.s, from: prev.label, to: cur.label })
  }

  return {
    machines,
    multi: true,
    switches,
    overlapMinutes,
    overlapParts,
    unionMinutes: total(unionOf(machines.map((m) => m.intervals))),
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/devices.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit** *(demander l'accord avant)*

```bash
git add packages/core/src/tracking/devices.ts packages/core/src/tracking/devices.test.ts
git commit -m "feat(tracking): répartition par poste et alerte multi-poste"
```

---

## Task 8 : Le verdict de conformité

**Files:**
- Create: `packages/core/src/tracking/verdict.ts`
- Test: `packages/core/src/tracking/verdict.test.ts`

**Interfaces:**
- Consumes: `buildSegments`, `summarize`, `liveFromEvents`, `attributeApps`, `attributeModels`,
  `stagnantStretch`, `machineBreakdown`, `fmtDuration`, `isoWeekday`, `TrackerRules`
- Produces:
  - `const DEFAULT_PAUSE_ALLOWANCE_MINUTES: number` (60)
  - `interface TrackerVerdictInput { events; windowStart; windowEnd; queryDate; quotaMinutes; workdays; rules; now?; pauseAllowanceMinutes?; gateWorkday? }`
  - `interface TrackerVerdict` (voir le code)
  - `computeWindowVerdict(input: TrackerVerdictInput): Verdict`

> **La règle de la pause** : la pause compte dans le quota mais **plafonnée** (60 min par défaut).
> Au-delà, elle ne compte plus — et son dépassement devient un motif.
> **`gateWorkday`** : sur le rapport JOURNÉE, un jour non travaillé est conforme d'office ; sur un
> rapport de SHIFT, non.

- [ ] **Step 1: Écrire le test (il doit échouer)**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeRules } from './rules'
import { computeWindowVerdict } from './verdict'
import type { TrackerEvent } from './types'

// 05h00 Paris le mardi 25/08 (isoWeekday 2, donc dans « 1,2,3,4,5 »).
const T0 = Date.parse('2026-08-25T03:00:00Z')
const min = (n: number): number => n * 60_000
const at = (offsetMin: number): string => new Date(T0 + min(offsetMin)).toISOString()
const rules = normalizeRules({ apps: ['chrome'], domains: ['mypuls.app'] })

const base = {
  windowStart: T0,
  windowEnd: T0 + min(480),
  queryDate: '2026-08-25',
  quotaMinutes: 480,
  workdays: '1,2,3,4,5',
  rules,
  now: T0 + min(600),
}

describe('computeWindowVerdict', () => {
  it('quota atteint, tout sur la liste blanche → conforme', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'focus', at: at(0), meta: { app: 'chrome', host: 'mypuls.app' } },
      { type: 'shift_end', at: at(480) },
    ]
    const v = computeWindowVerdict({ ...base, events })
    expect(v.activeMinutes).toBe(480)
    expect(v.missingMinutes).toBe(0)
    expect(v.compliant).toBe(true)
    expect(v.reasons).toEqual([])
  })

  it('quota non atteint → motif « N manquantes »', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'shift_end', at: at(400) },
    ]
    const v = computeWindowVerdict({ ...base, events })
    expect(v.missingMinutes).toBe(80)
    expect(v.compliant).toBe(false)
    expect(v.reasons).toContain('1h20 manquantes')
  })

  it('app jamais lancée → motif dédié', () => {
    const v = computeWindowVerdict({ ...base, events: [] })
    expect(v.launched).toBe(false)
    expect(v.reasons).toContain("n'a jamais lancé l'app")
    expect(v.compliant).toBe(false)
  })

  it('la pause compte dans le quota, mais plafonnée à 60 min', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'pause', at: at(300) },
      { type: 'resume', at: at(420) },   // 120 min de pause
      { type: 'shift_end', at: at(480) },
    ]
    const v = computeWindowVerdict({ ...base, events })
    expect(v.pauseMinutes).toBe(120)
    expect(v.countedPauseMinutes).toBe(60)          // plafonné
    expect(v.effectiveMinutes).toBe(360 + 60)       // 360 actives + 60 comptées
    expect(v.reasons.some((r) => r.startsWith('pause 2h00'))).toBe(true)
    expect(v.compliant).toBe(false)
  })

  it('hors-tâche au-delà du seuil → non conforme', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'focus', at: at(0), meta: { app: 'chrome', host: 'youtube.com' } },
      { type: 'focus', at: at(40), meta: { app: 'chrome', host: 'mypuls.app' } },
      { type: 'shift_end', at: at(480) },
    ]
    const v = computeWindowVerdict({ ...base, events })
    expect(v.apps.offTaskMinutes).toBe(40)
    expect(v.offTaskOver).toBe(true)                // seuil par défaut = 30
    expect(v.compliant).toBe(false)
    expect(v.reasons).toContain('40min hors whitelist')
  })

  it('gateWorkday : un jour non travaillé est conforme d’office', () => {
    // 2026-08-30 est un dimanche (isoWeekday 7), hors '1,2,3,4,5'
    const v = computeWindowVerdict({
      ...base, events: [], queryDate: '2026-08-30', gateWorkday: true,
    })
    expect(v.isWorkday).toBe(false)
    expect(v.compliant).toBe(true)
  })

  it('sans gateWorkday, le même jour reste non conforme', () => {
    const v = computeWindowVerdict({
      ...base, events: [], queryDate: '2026-08-30', gateWorkday: false,
    })
    expect(v.compliant).toBe(false)
  })

  it('PC éteint en cours de shift → motif « app fermée / PC éteint »', () => {
    // Le dernier battement doit tomber STRICTEMENT dans la fenêtre : `summarize` teste
    // `t < dayEnd`, donc un arrêt pile sur la borne de fin ne lèverait pas le drapeau.
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'heartbeat', at: at(400) },
    ]
    const v = computeWindowVerdict({ ...base, events })
    expect(v.crashed).toBe(true)
    expect(v.activeMinutes).toBe(400)
    expect(v.reasons).toContain('app fermée / PC éteint')
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/verdict.test.ts`
Expected: FAIL — `Failed to resolve import "./verdict"`.

- [ ] **Step 3: Écrire `verdict.ts`**

```ts
import { machineBreakdown, type MachineBreakdown } from './devices'
import { attributeApps, type AppAttribution } from './focus'
import { attributeModels, type ModelAttribution } from './models'
import type { TrackerRules } from './rules'
import { DEFAULT_STALE_MS, buildSegments, liveFromEvents, summarize, type DaySummary } from './segments'
import { stagnantStretch, type StagnantStretch } from './stagnant'
import { fmtDuration, isoWeekday } from './time'
import type { LiveStatus, TrackerEvent } from './types'

/** Pause autorisée comptée dans le quota. Au-delà, la pause ne compte plus. */
export const DEFAULT_PAUSE_ALLOWANCE_MINUTES = 60

export interface TrackerVerdictInput {
  events: TrackerEvent[]
  windowStart: number
  windowEnd: number
  /** Date Paris servant à juger le jour travaillé. */
  queryDate: string
  quotaMinutes: number
  /** Jours ISO travaillés, ex. « 1,2,3,4,5 ». */
  workdays: string
  rules: TrackerRules
  now?: number
  staleMs?: number
  pauseAllowanceMinutes?: number
  /** Rapport JOURNÉE : un jour non travaillé est conforme d'office. Rapport SHIFT : non. */
  gateWorkday?: boolean
}

export interface TrackerVerdict extends DaySummary {
  quotaMinutes: number
  missingMinutes: number
  countedPauseMinutes: number
  effectiveMinutes: number
  pauseAllowanceMinutes: number
  offTaskOver: boolean
  isWorkday: boolean
  compliant: boolean
  reasons: string[]
  apps: AppAttribution
  models: ModelAttribution
  devices: MachineBreakdown
  stagnant: StagnantStretch
  stagnantOver: boolean
  live: LiveStatus | null
}

export function computeWindowVerdict(input: TrackerVerdictInput): TrackerVerdict {
  const {
    events, windowStart, windowEnd, queryDate, quotaMinutes, workdays, rules,
    now = Date.now(),
    staleMs = DEFAULT_STALE_MS,
    pauseAllowanceMinutes = DEFAULT_PAUSE_ALLOWANCE_MINUTES,
    gateWorkday = false,
  } = input

  const built = buildSegments(events, { now, staleMs })
  const sum = summarize(built, windowStart, windowEnd)
  const apps = attributeApps(built, events, windowStart, windowEnd, rules)
  const models = attributeModels(built, events, windowStart, windowEnd)

  // Postes utilisés : sert uniquement à lever une alerte. On ne corrige AUCUN chiffre — un chatter
  // sur deux PC est un cas à régler avec lui, pas à rattraper par un calcul.
  const devices = machineBreakdown(events, windowStart, windowEnd, now)

  // Écran figé : signalé sans rien recalculer — c'est un cas à vérifier, pas une règle automatique.
  const stagnant = stagnantStretch(built, events, windowStart, windowEnd)
  const stagnantOver = stagnant.tracked && stagnant.minutes >= rules.stagnantThresholdMinutes

  const isWorkday = workdays.split(',').map(Number).includes(isoWeekday(queryDate))

  // La pause compte dans le quota, mais plafonnée.
  const countedPause = Math.min(sum.pauseMinutes, pauseAllowanceMinutes)
  const effectiveMinutes = sum.activeMinutes + countedPause
  const missing = Math.max(0, quotaMinutes - effectiveMinutes)
  const offTaskOver = apps.offTaskMinutes > rules.offTaskThresholdMinutes

  const reasons: string[] = []
  if (!sum.launched) reasons.push("n'a jamais lancé l'app")
  else if (missing > 0) reasons.push(`${fmtDuration(missing)} manquantes`)
  if (offTaskOver) reasons.push(`${fmtDuration(apps.offTaskMinutes)} hors whitelist`)
  if (sum.pauseMinutes > pauseAllowanceMinutes) {
    reasons.push(`pause ${fmtDuration(sum.pauseMinutes)} (max ${fmtDuration(pauseAllowanceMinutes)})`)
  }
  if (sum.crashed) reasons.push('app fermée / PC éteint')

  const okMetrics = missing === 0 && !sum.crashed && !offTaskOver

  return {
    ...sum,
    quotaMinutes,
    missingMinutes: missing,
    countedPauseMinutes: countedPause,
    effectiveMinutes,
    pauseAllowanceMinutes,
    offTaskOver,
    isWorkday,
    compliant: gateWorkday ? !isWorkday || okMetrics : okMetrics,
    reasons,
    apps,
    models,
    devices,
    stagnant,
    stagnantOver,
    live: liveFromEvents(events, now, staleMs),
  }
}
```

> **Un écart de comportement corrigé volontairement** : l'original teste
> `stagnant.minutes >= rules.stagnantThresholdMinutes` **sans vérifier `tracked`**
> (`src/report.js:35`). Une absence totale de données de fenêtre rend `minutes: 0`, donc le bug ne
> se déclenche jamais en pratique — mais la garde `stagnant.tracked &&` rend l'intention explicite
> et protège d'un futur seuil à 0.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/verdict.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit** *(demander l'accord avant)*

```bash
git add packages/core/src/tracking/verdict.ts packages/core/src/tracking/verdict.test.ts
git commit -m "feat(tracking): verdict de conformité sur une fenêtre"
```

---

## Task 9 : La journée d'un manager

**Files:**
- Create: `packages/core/src/tracking/manager-day.ts`
- Test: `packages/core/src/tracking/manager-day.test.ts`

**Interfaces:**
- Consumes: `buildSegments`, `liveFromEvents` depuis `./segments` ; `parisDay` depuis `./time`
- Produces:
  - `interface ManagerDay` ; `managerDay(events, day, opts?): ManagerDay`
  - `interface ManagerCumul` ; `sumManagerDays(days: ManagerDay[]): ManagerCumul`

> **Des FAITS, aucun verdict.** Pas de quota, pas de seuil, pas de conformité. On restitue le début,
> la fin, les pauses et l'inactivité ; l'admin juge. C'est la différence de fond avec la vue
> chatters.
>
> **Un shift est rattaché EN ENTIER au jour où il a COMMENCÉ.** Un shift de nuit qui démarre le 16 à
> 22 h et finit le 17 à 4 h appartient au 16, sans coupure à minuit.
>
> **Écart assumé** : l'original fait ses I/O lui-même (`getEventsAround`, `aliasIdsOf`) et boucle
> sur les jours en relisant la base (`managerCumul`). Ici le module est pur : il reçoit les
> événements déjà chargés, et le cumul est une simple somme de `ManagerDay` — la boucle de
> chargement appartient à la couche service.

- [ ] **Step 1: Écrire le test (il doit échouer)**

```ts
import { describe, expect, it } from 'vitest'
import { managerDay, sumManagerDays } from './manager-day'
import type { TrackerEvent } from './types'

const min = (n: number): number => n * 60_000
// 2026-08-16 22h00 Paris = 20:00Z
const NIGHT = Date.parse('2026-08-16T20:00:00Z')
const at = (base: number, offsetMin: number): string => new Date(base + min(offsetMin)).toISOString()

describe('managerDay', () => {
  it('un shift de nuit est rattaché EN ENTIER à son jour de départ', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(NIGHT, 0) },        // 16/08 22h00 Paris
      { type: 'shift_end', at: at(NIGHT, 360) },        // 17/08 04h00 Paris
    ]
    const d16 = managerDay(events, '2026-08-16', { now: NIGHT + min(600) })
    expect(d16.hasActivity).toBe(true)
    expect(d16.workedMinutes).toBe(360)

    const d17 = managerDay(events, '2026-08-17', { now: NIGHT + min(600) })
    expect(d17.hasActivity).toBe(false)
    expect(d17.workedMinutes).toBe(0)
  })

  it('workedMinutes = actif + inactif (le chrono du manager), pauses déduites', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(NIGHT, 0) },
      { type: 'pause', at: at(NIGHT, 60) },
      { type: 'resume', at: at(NIGHT, 90) },            // 30 min de pause
      { type: 'idle_start', at: at(NIGHT, 120) },
      { type: 'idle_end', at: at(NIGHT, 140) },         // 20 min d'inactivité
      { type: 'shift_end', at: at(NIGHT, 200) },
    ]
    const d = managerDay(events, '2026-08-16', { now: NIGHT + min(600) })
    expect(d.pauseMinutes).toBe(30)
    expect(d.idleMinutes).toBe(20)
    expect(d.activeMinutes).toBe(150)                   // 200 − 30 − 20
    expect(d.workedMinutes).toBe(170)                   // actif + inactif
    expect(d.totalMinutes).toBe(200)                    // du début à la fin
  })

  it('shift ouvert : pas d’heure de fin inventée', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(NIGHT, 0) },
      { type: 'heartbeat', at: at(NIGHT, 59) },
    ]
    const d = managerDay(events, '2026-08-16', { now: NIGHT + min(60) })
    expect(d.openShift).toBe(true)
    expect(d.ended).toBeNull()
  })

  it('aucune activité ce jour-là', () => {
    const d = managerDay([], '2026-08-16', { now: NIGHT })
    expect(d.hasActivity).toBe(false)
    expect(d.started).toBeNull()
    expect(d.workedMinutes).toBe(0)
  })
})

describe('sumManagerDays', () => {
  it('ne compte que les jours avec activité', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(NIGHT, 0) },
      { type: 'shift_end', at: at(NIGHT, 120) },
    ]
    const days = [
      managerDay(events, '2026-08-16', { now: NIGHT + min(600) }),
      managerDay([], '2026-08-17', { now: NIGHT + min(600) }),
    ]
    const c = sumManagerDays(days)
    expect(c.days).toBe(1)
    expect(c.worked).toBe(120)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/manager-day.test.ts`
Expected: FAIL — `Failed to resolve import "./manager-day"`.

- [ ] **Step 3: Écrire `manager-day.ts`**

```ts
import { DEFAULT_STALE_MS, buildSegments, liveFromEvents } from './segments'
import { parisDay } from './time'
import type { LiveStatus, Segment, TrackerEvent } from './types'

/**
 * Journée d'un manager : des FAITS, aucun verdict.
 *
 * Pas de quota, pas de seuil, pas de conformité, pas de créneau. On restitue l'heure de début,
 * l'heure de fin, les pauses et l'inactivité ; l'admin juge lui-même.
 *
 * Un shift est rattaché EN ENTIER au jour où il a COMMENCÉ : un shift de nuit qui démarre le 16 à
 * 22 h et termine le 17 à 4 h appartient au 16, sans coupure à minuit.
 *
 * `workedMinutes` est exactement ce que le manager voit sur son chrono : le temps écoulé moins les
 * pauses. L'inactivité n'arrête pas le chrono — elle est relevée ici sans jamais lui être montrée.
 */

export interface ManagerSpan {
  start: number
  end: number
  minutes: number
}

export interface ManagerDay {
  date: string
  started: number | null
  ended: number | null
  openShift: boolean
  crashed: boolean
  recovered: boolean
  live: LiveStatus | null
  totalMinutes: number
  workedMinutes: number
  activeMinutes: number
  pauseMinutes: number
  idleMinutes: number
  pauses: ManagerSpan[]
  idles: ManagerSpan[]
  segments: Segment[]
  hasActivity: boolean
}

const span = (s: Segment): ManagerSpan => ({
  start: s.start,
  end: s.end,
  minutes: Math.round((s.end - s.start) / 60_000),
})

export function managerDay(
  events: TrackerEvent[],
  day: string,
  { now = Date.now(), staleMs = DEFAULT_STALE_MS }: { now?: number; staleMs?: number } = {},
): ManagerDay {
  const built = buildSegments(events, { now, staleMs })

  // Jour d'attribution d'un segment = jour Paris de son `shift_start`.
  const shiftDay = (s: Segment): string | null =>
    s.shiftStart != null ? parisDay(new Date(s.shiftStart).toISOString()) : null

  const segments = built.segments.filter((s) => shiftDay(s) === day).sort((a, b) => a.start - b.start)
  const of = (kind: Segment['kind']): Segment[] => segments.filter((s) => s.kind === kind)
  const mins = (list: Segment[]): number =>
    Math.round(list.reduce((t, s) => t + (s.end - s.start), 0) / 60_000)

  const pauses = of('pause')
  const idles = of('idle')
  const activeMinutes = mins(of('active'))
  const workedMinutes = activeMinutes + mins(idles) // le chrono du manager

  // Le shift ouvert / planté est-il celui de CE jour ? (dernier segment global)
  const lastGlobal = built.segments[built.segments.length - 1]
  const openHere = built.openShift && !!lastGlobal && shiftDay(lastGlobal) === day
  const crashedHere = built.crashed && !!lastGlobal && shiftDay(lastGlobal) === day
  const lastHere = segments[segments.length - 1]
  const recoveredHere = built.recovered && !!lastHere && shiftDay(lastHere) === day

  const first = segments[0]
  const started = first ? first.start : null
  const ended = openHere || crashedHere ? null : lastHere ? lastHere.end : null

  return {
    date: day,
    started,
    // Shift encore ouvert ou jamais clôturé : pas d'heure de fin fiable. On le dit au lieu d'en
    // inventer une.
    ended,
    openShift: openHere,
    crashed: crashedHere,
    recovered: recoveredHere,
    live: liveFromEvents(events, now, staleMs),
    totalMinutes:
      started != null && lastHere ? Math.round(((ended ?? lastHere.end) - started) / 60_000) : 0,
    workedMinutes,
    activeMinutes,
    pauseMinutes: mins(pauses),
    idleMinutes: mins(idles),
    pauses: pauses.map(span),
    idles: idles.map(span),
    segments,
    hasActivity: segments.length > 0,
  }
}

export interface ManagerCumul {
  days: number
  worked: number
  active: number
  pause: number
  idle: number
  total: number
}

/** Cumul sur une période : chaque shift compte une fois, rattaché à son jour de départ. */
export function sumManagerDays(days: ManagerDay[]): ManagerCumul {
  const acc: ManagerCumul = { days: 0, worked: 0, active: 0, pause: 0, idle: 0, total: 0 }
  for (const d of days) {
    if (!d.hasActivity) continue
    acc.days += 1
    acc.worked += d.workedMinutes
    acc.active += d.activeMinutes
    acc.pause += d.pauseMinutes
    acc.idle += d.idleMinutes
    acc.total += d.totalMinutes
  }
  return acc
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `pnpm --filter @glagency/core exec vitest run src/tracking/manager-day.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit** *(demander l'accord avant)*

```bash
git add packages/core/src/tracking/manager-day.ts packages/core/src/tracking/manager-day.test.ts
git commit -m "feat(tracking): journée et cumul d'un manager, sans verdict"
```

---

## Task 10 : Exports et vérification globale du domaine

**Files:**
- Modify: `packages/core/src/index.ts` (ajouter en fin de fichier)

**Interfaces:**
- Consumes: tous les modules des tâches 1 à 9
- Produces: le domaine `tracking` accessible via `import { … } from '@glagency/core'`

- [ ] **Step 1: Ajouter les exports à la fin de `packages/core/src/index.ts`**

```ts
// --- Tracker de présence (incrément 1) -------------------------------------
export type {
  TrackerEventType,
  TrackerEvent,
  SegmentKind,
  Segment,
  BuiltSegments,
  LiveState,
  LiveStatus,
} from './tracking/types'
export {
  parisOffsetMs,
  parisWallUtcMs,
  parisDay,
  dayBounds,
  isoWeekday,
  fmtClock,
  fmtDuration,
} from './tracking/time'
export { SHIFTS, BOUNDARIES, shiftByKey, shiftWindow, currentShift } from './tracking/shifts'
export type { Shift, ShiftKey, ShiftWindow } from './tracking/shifts'
export {
  DEFAULT_STALE_MS,
  buildSegments,
  liveFromEvents,
  summarize,
} from './tracking/segments'
export type { DaySummary } from './tracking/segments'
export { DEFAULT_RULES, normalizeRules, isAllowedApp, isAllowedDomain } from './tracking/rules'
export type { RawRules, TrackerRules } from './tracking/rules'
export { normalizeUrl, attributeApps } from './tracking/focus'
export type { AppItem, AppAttribution } from './tracking/focus'
export { attributeModels, modelKey } from './tracking/models'
export type { ModelTime, ModelAttribution } from './tracking/models'
export { stagnantStretch } from './tracking/stagnant'
export type { StagnantStretch } from './tracking/stagnant'
export { OVERLAP_ALERT_MINUTES, machineBreakdown } from './tracking/devices'
export type { MachineSlice, MachineBreakdown } from './tracking/devices'
export { DEFAULT_PAUSE_ALLOWANCE_MINUTES, computeWindowVerdict } from './tracking/verdict'
export type { TrackerVerdictInput, TrackerVerdict } from './tracking/verdict'
export { managerDay, sumManagerDays } from './tracking/manager-day'
export type { ManagerDay, ManagerSpan, ManagerCumul } from './tracking/manager-day'
```

> **Attention aux collisions** : `isoWeekday`, `dayBounds` et `modelKey` sont **nouveaux** dans le
> barrel — vérifier qu'aucun symbole du même nom n'y est déjà exporté (`domain/dates` exporte
> `isoDate`, pas `isoWeekday`). Si `tsc` signale un doublon, renommer l'export du tracking en le
> préfixant plutôt que de toucher à l'existant.

- [ ] **Step 2: Lancer la suite complète et le typecheck**

Run:
```bash
pnpm --filter @glagency/core exec vitest run
pnpm --filter @glagency/core typecheck
```
Expected: tous les tests passent (les 9 fichiers `tracking/*.test.ts` plus les tests existants) ;
`tsc --noEmit` sort sans erreur.

- [ ] **Step 3: Vérifier qu'aucune dépendance runtime n'a été ajoutée**

Run: `git diff --stat packages/core/package.json`
Expected: **aucune sortie** — le fichier ne doit pas avoir changé. Si `luxon` (ou quoi que ce soit)
y a été ajouté, le retirer et corriger le code : la contrainte globale l'interdit.

- [ ] **Step 4: Commit** *(demander l'accord avant)*

```bash
git add packages/core/src/index.ts
git commit -m "feat(tracking): expose le domaine du tracker dans @glagency/core"
```

---

## Task 11 : La migration `0125_tracking.sql`

**Files:**
- Create: `packages/db/supabase/migrations/0125_tracking.sql`

**Interfaces:**
- Consumes: `public.profiles(id)`, `public.is_admin()`, `public.has_page(slug text)` — **vérifiés
  présents en prod le 2026-08-25**
- Produces: 8 tables `tracker_*`, leurs index, leur RLS, et la ligne unique `tracker_rules`

> **Le droit de page est `presence`** (spec §7). La sidebar et les Server Actions viendront aux
> incréments suivants ; la RLS, elle, se pose maintenant.
>
> **Écritures** : aucune policy d'écriture pour `authenticated` sur les tables alimentées par
> l'ingest. Elles sont écrites en **service-role** (qui contourne la RLS) après vérification du
> token côté Worker — le patron de la face Formation. Seule `tracker_settings` reçoit une policy
> d'écriture admin, parce qu'elle s'édite depuis l'UI.

- [ ] **Step 1: Écrire la migration**

```sql
-- Tracker de présence — socle (incrément 1 de la reprise « Chatter Tracker »).
--
-- Trois horizons de données, et c'est TOUT le dimensionnement du chantier :
--   chaud   `tracker_live`      une ligne par poste, ÉCRASÉE   (~200 lignes)
--   tiède   `tracker_focus_raw` purgée à 14 jours              (~32 600/jour)
--   froid   le reste, définitif                                (~5 200/jour)
-- Les heartbeats (46 400/jour mesurés en production) ne sont JAMAIS historisés : ils ne servent
-- qu'à l'état « en ligne » et à la détection d'un poste éteint, deux usages sans historique.
--
-- PUREMENT ADDITIVE : aucune table existante n'est touchée. Sûre à appliquer avant déploiement.

-- ---------------------------------------------------------------------------
-- Postes
-- ---------------------------------------------------------------------------

-- Le POSTE, pas la personne. Un membre peut en avoir plusieurs (Mac + PC) : le multi-poste est
-- natif ici, là où le tracker d'origine le bricolait avec une colonne `alias_of` ajoutée après coup.
create table if not exists public.tracker_devices (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  role         text not null check (role in ('chatter', 'manager')),
  label        text,
  -- sha256 du bearer. Le token en clair n'est montré QU'UNE FOIS, à l'enregistrement.
  token_hash   text not null unique,
  machine_id   text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

comment on column public.tracker_devices.token_hash is
$cmt$sha256 du bearer du poste — le token en clair n'est jamais stocké$cmt$;

create index if not exists tracker_devices_profile_idx
  on public.tracker_devices (profile_id, active);

-- Quota et jours travaillés appartiennent à la PERSONNE, pas au poste. Table à part plutôt que
-- deux colonnes de plus sur `profiles`, déjà très chargée.
create table if not exists public.tracker_settings (
  profile_id          uuid primary key references public.profiles(id) on delete cascade,
  daily_quota_minutes int  not null default 480,
  workdays            text not null default '1,2,3,4,5'
);

comment on column public.tracker_settings.workdays is
$cmt$jours ISO travaillés, 1 = lundi (ex. « 1,2,3,4,5 »)$cmt$;

-- ---------------------------------------------------------------------------
-- Horizon FROID — les événements d'état
-- ---------------------------------------------------------------------------

-- `heartbeat` et `focus` sont VOLONTAIREMENT absents du check : c'est cette contrainte qui garantit
-- que l'horizon froid ne se remplit pas par accident. Ils ont leurs propres tables.
create table if not exists public.tracker_events (
  id              bigint generated always as identity primary key,
  client_event_id text not null unique,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  device_id       uuid not null references public.tracker_devices(id) on delete cascade,
  session_id      text not null,
  type            text not null check (type in
                    ('shift_start','shift_end','pause','resume','idle_start','idle_end','model')),
  at              timestamptz not null,
  local_date      date not null,
  received_at     timestamptz not null default now(),
  skewed          boolean not null default false,
  meta            jsonb
);

comment on column public.tracker_events.client_event_id is
$cmt$identifiant fourni par l'agent — porte l'idempotence du POST d'ingest$cmt$;
comment on column public.tracker_events.skewed is
$cmt$horloge du poste écartée de plus de 5 min de l'heure serveur — accepté, mais marqué$cmt$;

-- Les trois accès que le tracker d'origine a dû indexer après coup, pour la même raison : sans eux,
-- le menu des dates et le regroupement par modèle relisent la table entière à chaque page.
create index if not exists tracker_events_profile_date_idx
  on public.tracker_events (profile_id, local_date);
create index if not exists tracker_events_date_idx
  on public.tracker_events (local_date);
create index if not exists tracker_events_type_date_idx
  on public.tracker_events (type, local_date);

-- ---------------------------------------------------------------------------
-- Horizon CHAUD — l'état courant, écrasé
-- ---------------------------------------------------------------------------

-- Une ligne par poste, mise à jour à chaque battement. JAMAIS d'insert historique : c'est ce qui
-- remplace 17 M de lignes de heartbeat par an.
create table if not exists public.tracker_live (
  device_id         uuid primary key references public.tracker_devices(id) on delete cascade,
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  state             text not null check (state in ('active','pause','idle','off')),
  since             timestamptz,
  -- Rempli par le SERVEUR, jamais par l'agent : un poste à l'heure fausse ne doit pas disparaître
  -- de « en ligne ».
  last_heartbeat_at timestamptz not null,
  machine_id        text,
  current_model     text
);

create index if not exists tracker_live_profile_idx on public.tracker_live (profile_id);

-- ---------------------------------------------------------------------------
-- Horizon TIÈDE — les changements de fenêtre, purgés à 14 jours
-- ---------------------------------------------------------------------------

-- L'URL BRUTE n'est jamais stockée : query et fragment peuvent contenir des jetons de session.
-- Seuls l'hôte normalisé (kind='domain') ou le nom de process (kind='app') arrivent ici.
create table if not exists public.tracker_focus_raw (
  id         bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device_id  uuid not null references public.tracker_devices(id) on delete cascade,
  at         timestamptz not null,
  local_date date not null,
  kind       text not null check (kind in ('app','domain')),
  label      text not null
);

create index if not exists tracker_focus_raw_profile_date_idx
  on public.tracker_focus_raw (profile_id, local_date);
-- Sert la purge quotidienne.
create index if not exists tracker_focus_raw_date_idx
  on public.tracker_focus_raw (local_date);

-- ---------------------------------------------------------------------------
-- Horizon FROID — les tables de faits, figées à chaque fin de shift
-- ---------------------------------------------------------------------------

create table if not exists public.tracker_shift_rows (
  profile_id            uuid not null references public.profiles(id) on delete cascade,
  date                  date not null,
  shift_key             text not null check (shift_key in ('matin','aprem','nuit','jour')),
  active_minutes        int  not null default 0,
  pause_minutes         int  not null default 0,
  idle_minutes          int  not null default 0,
  counted_pause_minutes int  not null default 0,
  effective_minutes     int  not null default 0,
  quota_minutes         int  not null default 0,
  missing_minutes       int  not null default 0,
  pause_count           int  not null default 0,
  idle_cuts             int  not null default 0,
  started_at            timestamptz,
  ended_at              timestamptz,
  crashed               boolean not null default false,
  recovered             boolean not null default false,
  open_shift            boolean not null default false,
  launched              boolean not null default false,
  off_task_minutes      int  not null default 0,
  off_task_over         boolean not null default false,
  stagnant_minutes      int  not null default 0,
  stagnant_over         boolean not null default false,
  overlap_minutes       int  not null default 0,
  is_workday            boolean not null default true,
  compliant             boolean not null default false,
  reasons               text[] not null default '{}',
  computed_at           timestamptz not null default now(),
  primary key (profile_id, date, shift_key)
);

comment on column public.tracker_shift_rows.ended_at is
$cmt$fin effective — pour un shift coupé faute de battement, c'est le dernier battement connu (le
job de fin de shift le fige AVANT que tracker_live ne soit écrasée)$cmt$;

create index if not exists tracker_shift_rows_date_idx
  on public.tracker_shift_rows (date, shift_key);

create table if not exists public.tracker_focus_shift (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  date       date not null,
  shift_key  text not null check (shift_key in ('matin','aprem','nuit','jour')),
  kind       text not null check (kind in ('app','domain')),
  label      text not null,
  minutes    int  not null,
  allowed    boolean not null,
  primary key (profile_id, date, shift_key, kind, label)
);

create index if not exists tracker_focus_shift_date_idx
  on public.tracker_focus_shift (date, shift_key);

-- Le modèle est identifié par `creators(id)`, PAS par un nom libre : même règle que pour les
-- personnes (identité = `profiles.id`). C'est ce qui rend possible la jointure avec
-- `chatter_creator_daily` (CA par chatter × modèle × jour), donc le €/heure par modèle — le
-- croisement que ni le tracker ni le CRM ne peuvent produire seuls.
create table if not exists public.tracker_model_time (
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  date              date not null,
  shift_key         text not null check (shift_key in ('matin','aprem','nuit','jour')),
  creator_id        uuid not null references public.creators(id) on delete cascade,
  minutes           int  not null,
  untracked_minutes int  not null default 0,
  primary key (profile_id, date, shift_key, creator_id)
);

create index if not exists tracker_model_time_date_idx
  on public.tracker_model_time (date, shift_key);

-- Idempotence des rapports Discord : un rapport par (jour, shift), rejouable sans doublon.
create table if not exists public.tracker_reports (
  date      date not null,
  shift_key text not null check (shift_key in ('matin','aprem','nuit','jour')),
  sent_at   timestamptz not null default now(),
  payload   jsonb not null,
  primary key (date, shift_key)
);

-- ---------------------------------------------------------------------------
-- Configuration — remplace config/rules.json, qui vit sur un disque qu'on va éteindre
-- ---------------------------------------------------------------------------

create table if not exists public.tracker_rules (
  id                         int primary key default 1 check (id = 1),
  off_task_threshold_minutes int  not null default 30,
  stagnant_threshold_minutes int  not null default 60,
  main_tool                  text not null default 'mypuls.app',
  tool_min_minutes           int  not null default 330,
  lateness_max_minutes       int  not null default 10,
  apps                       text[] not null default '{}',
  domains                    text[] not null default '{}',
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references public.profiles(id) on delete set null
);

-- Reprise à l'identique de la liste blanche en production au 2026-08-25.
insert into public.tracker_rules (id, apps, domains)
values (
  1,
  array['chrome','msedge','firefox','brave','opera','vivaldi','discord','slack','telegram',
        'whatsapp','whatsapp.root','infloww','sunbrowser','adspower global','adspower','gologin',
        'gl agency shift','iremotech','chatgpt classic','explorer','shellexperiencehost',
        'applicationframehost','searchhost','startmenuexperiencehost','textinputhost',
        'snippingtool','notepad','msedgewebview2'],
  array['mypuls.app','onlyfans.com','fansly.com','fanvue.com','discord.com','telegram.org',
        'glagencyapp-web.vercel.app','gla-workflow-z5f2.vercel.app','chatgpt.com',
        'gemini.google.com','grok.com','claude.ai','translate.google.com','loom.com',
        'iremotech.com','google.com']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- LECTURE : qui possède la page « presence », plus les admins ; un membre lit toujours SES lignes.
-- Le cloisonnement fin par modèle reste APPLICATIF (lib/services/creator-scope.ts), comme pour le
-- rapport police — la RLS ne le porte pas.
-- ÉCRITURE : service-role après garde applicative. Aucune policy d'écriture pour `authenticated`,
-- SAUF tracker_settings, qui s'édite depuis l'UI admin.

alter table public.tracker_devices     enable row level security;
alter table public.tracker_settings    enable row level security;
alter table public.tracker_events      enable row level security;
alter table public.tracker_live        enable row level security;
alter table public.tracker_focus_raw   enable row level security;
alter table public.tracker_shift_rows  enable row level security;
alter table public.tracker_focus_shift enable row level security;
alter table public.tracker_model_time  enable row level security;
alter table public.tracker_reports     enable row level security;
alter table public.tracker_rules       enable row level security;

create policy tracker_devices_read on public.tracker_devices for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));

create policy tracker_settings_read on public.tracker_settings for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));
create policy tracker_settings_admin_write on public.tracker_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy tracker_events_read on public.tracker_events for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));

create policy tracker_live_read on public.tracker_live for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));

create policy tracker_focus_raw_read on public.tracker_focus_raw for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));

create policy tracker_shift_rows_read on public.tracker_shift_rows for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));

create policy tracker_focus_shift_read on public.tracker_focus_shift for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));

create policy tracker_model_time_read on public.tracker_model_time for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));

create policy tracker_reports_read on public.tracker_reports for select to authenticated
  using ((select public.is_admin()));

create policy tracker_rules_read on public.tracker_rules for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')));
create policy tracker_rules_admin_write on public.tracker_rules for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
```

- [ ] **Step 2: Prévisualiser sans appliquer**

Run:
```bash
cd packages/db && supabase db push --db-url "$(grep '^DATABASE_URL_UAT=' ../../.env | cut -d= -f2- | sed 's/^"//; s/"$//')" --dry-run
```
Expected: la sortie annonce `0125_tracking.sql` comme seule migration en attente. **Si elle en
annonce d'autres, s'arrêter et le signaler** — l'historique serait désaligné.

- [ ] **Step 3: Commit du fichier de migration** *(demander l'accord avant)*

```bash
git add packages/db/supabase/migrations/0125_tracking.sql
git commit -m "feat(tracking): migration 0125 — tables, index et RLS du tracker"
```

---

## Task 12 : Application sur l'UAT, types régénérés, `CLAUDE.md`

**Files:**
- Modify: `packages/db/src/types.ts` (régénéré)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Appliquer la migration sur l'UAT**

Run:
```bash
cd packages/db && supabase db push --db-url "$(grep '^DATABASE_URL_UAT=' ../../.env | cut -d= -f2- | sed 's/^"//; s/"$//')"
```
Expected: `Applying migration 0125_tracking.sql...` puis succès.

> **Ne PAS appliquer sur la prod.** La prod se fait à la release (contrainte globale).

- [ ] **Step 2: Vérifier que la migration est enregistrée**

Run:
```bash
/opt/homebrew/opt/postgresql@15/bin/psql "$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')" \
  -qAt -c "select version from supabase_migrations.schema_migrations order by version desc limit 2"
```
Expected: `0125` puis `0124`.

- [ ] **Step 3: Vérifier la RLS et la seed**

Run:
```bash
/opt/homebrew/opt/postgresql@15/bin/psql "$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')" -qAt -c "
select count(*)||' tables tracker_*' from pg_tables where schemaname='public' and tablename like 'tracker\_%';
select count(*)||' avec RLS' from pg_tables where schemaname='public' and tablename like 'tracker\_%' and rowsecurity;
select array_length(domains,1)||' domaines en liste blanche' from public.tracker_rules where id=1;"
```
Expected: `10 tables tracker_*`, `10 avec RLS`, `28 apps` et `16 domaines` en liste blanche.

- [ ] **Step 4: Régénérer les types**

Run:
```bash
cd packages/db && supabase gen types typescript \
  --db-url "$(grep '^DATABASE_URL_UAT=' ../../.env | cut -d= -f2- | sed 's/^"//; s/"$//')" \
  --schema public > src/types.ts
```
Expected: `src/types.ts` contient désormais les 10 tables `tracker_*`.

Vérifier : `grep -c "tracker_" packages/db/src/types.ts` doit être > 0.

- [ ] **Step 5: Corriger `CLAUDE.md`**

Remplacer dans la section « 3 faces du CRM » la mention périmée
« UAT alignée par `migration repair`, prod encore à 0112 — prochaine migration = 0114 »
par : « prod et UAT à **0125** (2026-08-25) — prochaine migration = 0126 ».

- [ ] **Step 6: Vérification finale de tout l'incrément**

Run:
```bash
pnpm --filter @glagency/core exec vitest run
pnpm --filter @glagency/core typecheck
pnpm --filter @glagency/db typecheck
```
Expected: tout passe.

- [ ] **Step 7: Commit** *(demander l'accord avant)*

```bash
git add packages/db/src/types.ts CLAUDE.md
git commit -m "chore(tracking): types régénérés après 0125, corrige le numéro de migration"
```

---

## Self-review

**Couverture de la spec.** L'incrément 1 correspond à la ligne 1 du §11 de la spec (« Socle —
migration `0125`, RLS, types régénérés, `@glagency/core/tracking` porté et testé »). Toutes les
tables du §3 sont créées (3.1 → 3.7), plus `tracker_reports` pour l'idempotence Discord du §8. Le
§5 (tableau des 10 modules à porter) est couvert par les tâches 1 à 9 — **`src/report.js` n'est
porté que pour son verdict** (`computeUserWindow`), la partie Discord relevant de l'incrément 4.

**Non couvert ici, et c'est voulu** : §3.8 (notes et to-do — incréments 6 et 7), §4 (ingest —
incrément 2), §6 (front — incrément 3), §8 (crons et Discord — incrément 4), §9 (bascule —
incrément 8).

**Écarts par rapport à l'original, tous documentés dans le plan** : `meta` en objet plutôt qu'en
chaîne ; camelCase au niveau du domaine ; fuseau et `staleMs` injectés plutôt que lus d'une config
globale ; `machineBreakdown` et `managerDay` rendus purs (`now` en paramètre, plus d'I/O) ;
`stagnantOver` gagne la garde `tracked` ; `parisWallUtcMs` remplace luxon et corrige au passage les
bornes de shift des deux jours de changement d'heure.

**Cohérence des types** : `TrackerRules` est produit par `normalizeRules` (tâche 4) et consommé par
`attributeApps` (tâche 4) et `computeWindowVerdict` (tâche 8) — même nom, même forme.
`BuiltSegments` est produit par `buildSegments` (tâche 3) et consommé par les tâches 4, 5, 6, 8.
`Segment` est consommé par `manager-day` (tâche 9). Le barrel (tâche 10) ré-exporte exactement les
symboles définis dans les tâches 1 à 9, sans en inventer.

**Risque connu** : `supabase gen types` n'est pas dans les scripts de `packages/db` — la commande
est donnée en toutes lettres à l'étape 12.4. Si le CLI Supabase local est trop ancien pour
`gen types --db-url`, régénérer via le dashboard et le signaler.
