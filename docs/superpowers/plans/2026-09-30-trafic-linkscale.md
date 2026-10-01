# Trafic LinkScale — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** relever chaque nuit le trafic des liens LinkScale (visiteurs, bots, clics vers MYM),
l'attribuer à une modèle, un réseau et un profil, et l'afficher sur une page Marketing › Trafic qui
signale les profils qui décrochent.

**Architecture :**
- Les règles pures vivent dans `@glagency/core` et sont testées : parsing, attribution, plan
  d'écriture, signaux.
- Un job `marketing-linkscale` les appelle. Il est déclenché en fan-out du cron `5 23`, avec une
  CLI à côté pour remplir l'historique. Il écrit dans deux nouvelles tables (`0179`).
- La page suit le patron des pages marketing : `page.tsx` → service → `TraficTemplate` → vue
  client. L'agrégation est pure et testée.

**Tech Stack :** TypeScript, Vitest 3, Supabase (Postgres + RLS), Cloudflare Worker (ingestion),
Next.js 16 App Router, shadcn/ui, recharts, zod.

**Spec :** `docs/superpowers/specs/2026-09-30-trafic-linkscale-design.md`

## Global Constraints

- Tout est en français : UI, commentaires, messages d'erreur et de log.
- La migration porte le numéro **`0179`**. Vérifier avant de la créer qu'aucune autre session ne
  l'a prise (dossier `migrations/` + `schema_migrations` UAT). Colonnes `text` + `check`,
  **jamais** de `create type … enum`.
- RLS : même politique que `0170` : `for all to authenticated using/with check
  ((select public.can_write_page('marketing'::text)))`.
- **Aucune écriture dans LinkScale.** La clé est en lecture seule, dans `LINKSCALE_API_KEY`, en
  env uniquement (`.env` pour la CLI, `wrangler secret` pour le Worker).
- **Aucun nouveau cron** (5 au maximum par compte sur l'offre Free) : fan-out `?job=linkscale`
  dans le cron `5 23`.
- **MyPuls reste la seule source du CA** : ni abonnés ni CA dans cette V1.
- Visiteurs = `human_users` du mode par défaut (`unique_users`). Clics MYM = somme des
  `button_clicks` dont l'URL contient `mym.fans`. `mym_clicks` vaut `null` pour une redirection
  (`d_l`).
- Taux de clic = clics MYM / visiteurs **des liens à boutons** (hors redirections).
- Seuils « À regarder » :
  - **chute** : visiteurs < 50 % de la période précédente, qui en avait ≥ 30 ;
  - **éteint** : 0 visiteur, alors que la période précédente en avait ≥ 10 ;
  - **clic faible** : taux < 50 % du taux de référence, avec ≥ 30 visiteurs sur des liens à
    boutons ;
  - **bots** : `bots / (visiteurs + bots)` > 20 %, avec `visiteurs + bots` ≥ 30.
- UI : uniquement les composants existants (`KpiGrid`, `DataTable`, `Sortable`, `Tabs`, `Badge`,
  `ChartContainer`, `Dialog`, `Select`). Aucune nouveauté visuelle, aucun filet décoratif.
- **Pas de commit sans le mot « commit » de Benoit.** On fait alors `git add -- <chemins
  explicites>`, jamais `-A` ni `.`, parce que d'autres sessions travaillent dans le même dépôt.
- **Accord explicite de Benoit pour chacune de ces étapes** : appliquer `0179` sur l'UAT puis en
  prod, `wrangler secret put`, `wrangler deploy`, lancer le remplissage sur une base distante,
  ouvrir ou merger une PR.
- Droit d'accès : les autres pages marketing gardent leurs tables derrière
  `can_write_page('marketing')`. Un manager qui aurait `mkt-trafic` sans `marketing` verrait donc
  une page vide. C'est le comportement existant, on ne le change pas ici.

## Review Focus

1. **Lien présent dans les stats mais absent de la liste** (probablement supprimé côté
   LinkScale) : il est stocké avec `kind = 'inconnu'` et son trafic compte. Testé en Task 1
   (`planLinkscaleWrite`).
2. **Correction manuelle écrasée par le relevé suivant** : une ligne `manual` garde son
   attribution, nuit après nuit. Testé en Task 1.
3. **Dossier ou note au nom voisin d'une modèle** (« Carla (privé) », « julie cmo ig »,
   `TW JADE` alors que Jade est une modèle) : pas de fausse attribution. Testé en Task 1.
4. **Période sans période précédente** (avant le remplissage de mai, ou premiers jours) : aucun
   faux signal « chute », évolution « — ». Testé en Task 7.
5. **Plus de clics MYM que de visiteurs uniques** (taux > 1), et une modèle qui a aussi des
   redirections : taux calculé sur les seuls liens à boutons, sans signal parasite. Testé en
   Task 2 et Task 7.

---

## Préparation — isolation

L'arbre principal porte le chantier d'une autre session (`apps/web/src/features/agency/…` non
commités). On travaille donc dans un worktree.

- [ ] **P.1 — Worktree sur `develop` à jour**

```bash
cd /Users/benoitgasnier/Documents/glagencyapp
git fetch origin
git log --oneline origin/develop..develop   # doit être vide ; sinon s'arrêter et le signaler
git worktree add ../glagencyapp-trafic -b feature/trafic-linkscale-releve origin/develop
cd ../glagencyapp-trafic
ln -s ../glagencyapp/.env .env               # le .env racine (gitignoré) : loadEnv() le lit
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp ../glagencyapp/docs/superpowers/specs/2026-09-30-trafic-linkscale-design.md docs/superpowers/specs/
cp ../glagencyapp/docs/superpowers/plans/2026-09-30-trafic-linkscale.md docs/superpowers/plans/
pnpm install
```

Attendu : `git status` montre seulement la spec et le plan en non suivis.

- [ ] **P.2 — Le numéro 0179 est libre**

```bash
ls packages/db/supabase/migrations | tail -3
```

Attendu : le dernier fichier est `0178_releve_x_profil.sql`. S'il existe déjà un `0179_*`, prendre
le numéro suivant libre et le reporter partout dans ce plan.

---

# PR 1 — le relevé (branche `feature/trafic-linkscale-releve`)

### Task 1 : core — parsing, attribution, plan d'écriture

**Files :**
- Create : `packages/core/src/marketing/linkscale.ts`
- Create : `packages/core/src/marketing/linkscale.test.ts`
- Modify : `packages/core/src/index.ts` (après le bloc `x-profile`, vers la ligne 34)

**Interfaces :**
- Consumes : rien.
- Produces :
  - constantes : `LS_PLATFORMS`, `LS_PLATFORM_LABEL`, `type LsPlatform`, `type LsKind` ;
  - fonctions :
    - `kindOf(t) → LsKind`
    - `mymClicksOf(kind, n) → number | null`
    - `foldName(s) → string`
    - `splitNote(note) → { prefix: 'x' | 'instagram' | 'threads' | null; rest: string }`
    - `parseLinkscaleDay(payload: unknown) → LsDayLine[]`
    - `attributeLink(facts: LsLinkFacts, refs: { creators; accounts }) → LsAttribution`
    - `planLinkscaleWrite(input: LsPlanInput) → { links: LsLinkWrite[]; daily: LsDailyWrite[] }`
  - types : `LsTrafficRow`, `LsDayLine`, `LsListedLink`, `LsCreatorRef`, `LsAccountRef`,
    `LsLinkFacts`, `LsAttribution`, `LsKnownLink`, `LsLinkWrite`, `LsDailyWrite`, `LsPlanInput`.

- [ ] **Step 1 : écrire les tests qui échouent**

`packages/core/src/marketing/linkscale.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import {
  attributeLink,
  foldName,
  kindOf,
  mymClicksOf,
  parseLinkscaleDay,
  planLinkscaleWrite,
  splitNote,
  type LsAccountRef,
  type LsCreatorRef,
} from './linkscale'

const creators: LsCreatorRef[] = [
  { id: 'c-carla', name: 'Carla' },
  { id: 'c-carla-prive', name: 'Carla (privé)' },
  { id: 'c-julie', name: 'Julie' },
  { id: 'c-lena', name: 'Lena' },
  { id: 'c-jade', name: 'Jade' },
  { id: 'c-lucie', name: 'Lucie' },
]
const accounts: LsAccountRef[] = [
  { id: 'a-tardif', handle: 'Julietardifff', creatorId: 'c-julie' },
  { id: 'a-jadot', handle: 'Carla.Jadot', creatorId: 'c-carla' },
  { id: 'a-jul-a', handle: 'juliette_a', creatorId: null },
  { id: 'a-jul-b', handle: 'juliette_b', creatorId: null },
]
const refs = { creators, accounts }

describe('foldName', () => {
  it('retire casse, accents et ponctuation', () => {
    expect(foldName('Léna')).toBe('lena')
    expect(foldName('Carla.Jadot')).toBe('carlajadot')
    expect(foldName('Carla (privé)')).toBe('carlaprive')
  })
})

describe('splitNote', () => {
  it('reconnaît les préfixes collés, espacés, en toutes casses', () => {
    expect(splitNote('TW ARA CARLA')).toEqual({ prefix: 'x', rest: 'ARA CARLA' })
    expect(splitNote('TWJADE')).toEqual({ prefix: 'x', rest: 'JADE' })
    expect(splitNote('Tw JOSE')).toEqual({ prefix: 'x', rest: 'JOSE' })
    expect(splitNote('INLenaMonerro')).toEqual({ prefix: 'instagram', rest: 'LenaMonerro' })
    expect(splitNote('THREADS taprofcarlaoff')).toEqual({ prefix: 'threads', rest: 'taprofcarlaoff' })
  })
  it('ignore les suffixes entre crochets', () => {
    expect(splitNote('INLOLAMONROSE [duplicate]')).toEqual({ prefix: 'instagram', rest: 'LOLAMONROSE' })
  })
  it('laisse une note sans préfixe telle quelle', () => {
    expect(splitNote(' Lucie ')).toEqual({ prefix: null, rest: 'Lucie' })
  })
})

describe('kindOf / mymClicksOf', () => {
  it('traduit le type LinkScale', () => {
    expect(kindOf('l_p')).toBe('landing')
    expect(kindOf('d_l')).toBe('redirect')
    expect(kindOf('shortcut')).toBe('shortcut')
    expect(kindOf(undefined)).toBe('inconnu')
  })
  it('une redirection n’a pas de clics MYM mesurables', () => {
    expect(mymClicksOf('redirect', 12)).toBeNull()
    expect(mymClicksOf('landing', 12)).toBe(12)
    expect(mymClicksOf('inconnu', 0)).toBe(0)
  })
})

describe('parseLinkscaleDay', () => {
  it('rend visiteurs humains, bots et clics vers mym.fans seulement', () => {
    const lines = parseLinkscaleDay({
      trafficByUrls: [
        {
          id: 'l1',
          url: 'carlaprof.live/carla',
          note: ' TW ARA CARLA ',
          human_users: 14,
          bots: 2,
          button_clicks: [
            { url: 'https://mym.fans/app/t/abc', clicks: 7 },
            { url: 'https://example.com', clicks: 3 },
          ],
        },
        { id: 'l2', host: 'heyliiink.com', u: 'sarrah', human_users: 12, bots: 0 },
      ],
    })
    expect(lines).toEqual([
      { lsId: 'l1', url: 'carlaprof.live/carla', note: 'TW ARA CARLA', visitors: 14, bots: 2, mymClicks: 7 },
      { lsId: 'l2', url: 'heyliiink.com/sarrah', note: '', visitors: 12, bots: 0, mymClicks: 0 },
    ])
  })
  it('refuse un payload sans trafficByUrls', () => {
    expect(() => parseLinkscaleDay({ success: false })).toThrow(/trafficByUrls/)
  })
})

describe('attributeLink', () => {
  it('le dossier décide de la modèle ; TW JADE désigne l’opérateur, pas la modèle Jade', () => {
    expect(attributeLink({ note: 'TW JADE', folderNames: ['CARLA'], destination: null }, refs)).toEqual({
      creatorId: 'c-carla',
      platform: 'x',
      socialAccountId: null,
      operator: 'JADE',
    })
  })
  it('sans dossier, TW JADE reste sans modèle', () => {
    expect(attributeLink({ note: 'TW JADE', folderNames: [], destination: null }, refs).creatorId).toBeNull()
  })
  it('le prénom après l’opérateur donne la modèle', () => {
    const a = attributeLink({ note: 'TW RORO LENA', folderNames: [], destination: null }, refs)
    expect(a).toMatchObject({ creatorId: 'c-lena', operator: 'RORO', platform: 'x' })
  })
  it('Instagram : retrouve le compte au pseudo presque identique, et sa modèle', () => {
    const a = attributeLink({ note: 'IN JULIETARDIFF', folderNames: [], destination: null }, refs)
    expect(a).toEqual({ creatorId: 'c-julie', platform: 'instagram', socialAccountId: 'a-tardif', operator: null })
  })
  it('Instagram : deux comptes candidats = aucun compte', () => {
    const a = attributeLink({ note: 'IN juliette', folderNames: [], destination: null }, refs)
    expect(a.socialAccountId).toBeNull()
  })
  it('Snap : la destination donne le réseau, la note seule la modèle (accents ignorés)', () => {
    expect(
      attributeLink({ note: 'Léna', folderNames: ['TEST SNAP TWITTER'], destination: 'https://snapchat.com/t/x' }, refs),
    ).toEqual({ creatorId: 'c-lena', platform: 'snapchat', socialAccountId: null, operator: null })
  })
  it('un dossier au nom voisin ne vaut pas une modèle', () => {
    expect(attributeLink({ note: '', folderNames: ['julie cmo ig'], destination: null }, refs).creatorId).toBeNull()
    expect(attributeLink({ note: '', folderNames: ['CARLA'], destination: null }, refs).creatorId).toBe('c-carla')
  })
  it('sans rien de reconnaissable : réseau autre, rien d’attribué', () => {
    expect(attributeLink({ note: 'JULIE ferrier', folderNames: [], destination: null }, refs)).toEqual({
      creatorId: null,
      platform: 'autre',
      socialAccountId: null,
      operator: null,
    })
  })
})

describe('planLinkscaleWrite', () => {
  const base = {
    folderNames: { f1: 'CARLA' } as Record<string, string>,
    creators,
    accounts,
  }

  it('écrit les liens listés ET ceux vus seulement dans les stats', () => {
    const plan = planLinkscaleWrite({
      ...base,
      days: [
        {
          date: '2026-09-28',
          lines: [
            { lsId: 'lp', url: 'carlaprof.live/carla', note: 'TW ARA CARLA', visitors: 10, bots: 1, mymClicks: 6 },
            { lsId: 'gone', url: 'heyliiink.com/alicee', note: '', visitors: 4, bots: 0, mymClicks: 2 },
          ],
        },
        {
          date: '2026-09-29',
          lines: [{ lsId: 'dl', url: 'heyliiink.com/saraah', note: 'Tw JOSE', visitors: 3, bots: 0, mymClicks: 0 }],
        },
      ],
      listed: [
        { _id: 'lp', t: 'l_p', domain: 'carlaprof.live', u: 'carla', folders: ['f1'] },
        { _id: 'dl', t: 'd_l', domain: 'heyliiink.com', u: 'saraah', url: 'https://mym.fans/app/t/h1' },
      ],
      known: [],
    })
    const byId = new Map(plan.links.map((l) => [l.ls_id, l]))
    expect(byId.get('lp')).toMatchObject({
      kind: 'landing',
      folders: ['CARLA'],
      creator_id: 'c-carla',
      platform: 'x',
      operator: 'ARA',
      manual: false,
      first_seen: '2026-09-28',
      last_seen: '2026-09-28',
    })
    expect(byId.get('gone')).toMatchObject({ kind: 'inconnu', url: 'heyliiink.com/alicee', destination: null })
    expect(byId.get('dl')).toMatchObject({ kind: 'redirect', destination: 'https://mym.fans/app/t/h1' })
    expect(plan.daily).toEqual([
      { lsId: 'lp', date: '2026-09-28', visitors: 10, bots: 1, mym_clicks: 6 },
      { lsId: 'gone', date: '2026-09-28', visitors: 4, bots: 0, mym_clicks: 2 },
      { lsId: 'dl', date: '2026-09-29', visitors: 3, bots: 0, mym_clicks: null },
    ])
  })

  it('ne touche jamais à l’attribution d’un lien corrigé à la main', () => {
    const plan = planLinkscaleWrite({
      ...base,
      days: [{ date: '2026-09-29', lines: [{ lsId: 'lp', url: 'x/y', note: 'TW ARA CARLA', visitors: 1, bots: 0, mymClicks: 0 }] }],
      listed: [{ _id: 'lp', t: 'l_p', folders: ['f1'] }],
      known: [
        {
          lsId: 'lp',
          manual: true,
          creatorId: 'c-jade',
          platform: 'instagram',
          socialAccountId: 'a-jadot',
          operator: null,
          firstSeen: '2026-05-02',
          lastSeen: '2026-09-01',
        },
      ],
    })
    expect(plan.links[0]).toMatchObject({
      creator_id: 'c-jade',
      platform: 'instagram',
      social_account_id: 'a-jadot',
      operator: null,
      manual: true,
      first_seen: '2026-05-02',
      last_seen: '2026-09-29',
    })
  })
})
```

- [ ] **Step 2 : vérifier que les tests échouent**

Run : `pnpm --filter @glagency/core exec vitest run src/marketing/linkscale.test.ts`
Expected : FAIL (`Cannot find module './linkscale'` ou équivalent).

- [ ] **Step 3 : implémenter**

`packages/core/src/marketing/linkscale.ts` :

```ts
/**
 * Trafic LinkScale — règles pures du job `marketing-linkscale` et de la page Marketing › Trafic
 * (spec docs/superpowers/specs/2026-09-30-trafic-linkscale-design.md). LinkScale compte par LIEN :
 * le profil et la modèle se DÉDUISENT de la note et du dossier, tapés à la main par l'équipe
 * (`TW ARA CARLA`, `IN JULIETARDIFF`, dossier « CARLA »). Rien n'est inventé : ce qui ne se
 * reconnaît pas reste non attribué, et se corrige sur la page.
 */

export const LS_PLATFORMS = ['x', 'instagram', 'threads', 'snapchat', 'autre'] as const
export type LsPlatform = (typeof LS_PLATFORMS)[number]
export const LS_PLATFORM_LABEL: Record<LsPlatform, string> = {
  x: 'X',
  instagram: 'Instagram',
  threads: 'Threads',
  snapchat: 'Snapchat',
  autre: 'Autre',
}

/** `landing` = page à boutons (l_p), `redirect` = redirection directe (d_l). */
export type LsKind = 'landing' | 'redirect' | 'shortcut' | 'inconnu'

export function kindOf(t: string | null | undefined): LsKind {
  if (t === 'l_p') return 'landing'
  if (t === 'd_l') return 'redirect'
  if (t === 'shortcut') return 'shortcut'
  return 'inconnu'
}

/** Une redirection n'a pas de bouton : la visite EST le passage vers la destination, rien à compter. */
export const mymClicksOf = (kind: LsKind, clicks: number): number | null => (kind === 'redirect' ? null : clicks)

/** Une ligne de `trafficByUrls` (GET /api/v1/stats) — seuls les champs lus. */
export interface LsTrafficRow {
  id: string
  host?: string
  u?: string
  url?: string
  note?: string | null
  human_users?: number
  bots?: number
  button_clicks?: { url?: string | null; clicks?: number }[] | null
}

export interface LsDayLine {
  lsId: string
  url: string
  note: string
  visitors: number
  bots: number
  /** Clics de boutons vers mym.fans (0 si aucun). */
  mymClicks: number
}

const isMym = (url: string | null | undefined) => typeof url === 'string' && url.includes('mym.fans')

/** Une journée de stats → une ligne par lien. Lève une erreur si la forme n'est pas celle attendue. */
export function parseLinkscaleDay(payload: unknown): LsDayLine[] {
  const rows = (payload as { trafficByUrls?: unknown } | null)?.trafficByUrls
  if (!Array.isArray(rows)) throw new Error('payload LinkScale inattendu (trafficByUrls absent)')
  return (rows as LsTrafficRow[])
    .filter((r) => typeof r?.id === 'string' && r.id !== '')
    .map((r) => ({
      lsId: r.id,
      url: r.url ?? [r.host, r.u].filter(Boolean).join('/'),
      note: (r.note ?? '').trim(),
      visitors: r.human_users ?? 0,
      bots: r.bots ?? 0,
      mymClicks: (r.button_clicks ?? []).reduce((s, b) => s + (isMym(b?.url) ? (b.clicks ?? 0) : 0), 0),
    }))
}

/** Un lien de GET /api/v1/links — seuls les champs lus. `url` = destination (d_l, shortcut). */
export interface LsListedLink {
  _id: string
  t?: string
  domain?: string
  u?: string
  url?: string
  note?: string
  folders?: string[] | null
}

export interface LsCreatorRef {
  id: string
  name: string
}

/** Un compte INSTAGRAM du CRM (`mkt_social_accounts`). */
export interface LsAccountRef {
  id: string
  handle: string
  creatorId: string | null
}

export interface LsLinkFacts {
  note: string
  folderNames: string[]
  destination: string | null
}

export interface LsAttribution {
  creatorId: string | null
  platform: LsPlatform
  socialAccountId: string | null
  operator: string | null
}

/** Minuscules, sans accents ni rien d'autre que lettres et chiffres : « Carla.Jadot » → « carlajadot ». */
export const foldName = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

// `threads` avant `tw` et `in`. Le préfixe peut être collé (`TWJADE`, `INLenaMonerro`) : une note
// qui commencerait par « In… » sans être Instagram serait mal lue — aucun cas dans les données
// du 2026-09-30, et la correction manuelle rattrape.
const PREFIX = /^(threads|tw|in)(.*)$/i

export function splitNote(note: string): { prefix: 'x' | 'instagram' | 'threads' | null; rest: string } {
  const clean = note.replace(/\[[^\]]*\]/g, '').trim()
  const m = PREFIX.exec(clean)
  if (!m) return { prefix: null, rest: clean }
  const p = m[1]!.toLowerCase()
  return { prefix: p === 'tw' ? 'x' : p === 'in' ? 'instagram' : 'threads', rest: m[2]!.trim() }
}

/** En dessous, un début de pseudo (« carla ») désigne trop de comptes pour valoir un compte. */
const MIN_PREFIX = 6

/** Le compte Instagram de la note : pseudo identique, sinon UN SEUL pseudo qui prolonge (« Julietardifff »). */
function findAccount(rest: string, accounts: LsAccountRef[]): LsAccountRef | null {
  const f = foldName(rest)
  if (!f) return null
  const exact = accounts.filter((a) => foldName(a.handle) === f)
  if (exact.length === 1) return exact[0]!
  if (exact.length > 1 || f.length < MIN_PREFIX) return null
  const near = accounts.filter((a) => {
    const h = foldName(a.handle)
    return h.length >= MIN_PREFIX && (h.startsWith(f) || f.startsWith(h))
  })
  return near.length === 1 ? near[0]! : null
}

/**
 * Modèle, réseau, compte, opérateur d'un lien. Modèle, dans l'ordre : le dossier au nom EXACT
 * d'une modèle (« CARLA » → Carla, jamais « Carla (privé) ») ; la modèle du compte Instagram ; le
 * prénom APRÈS l'opérateur (`TW RORO LENA`) ; une note réduite à un prénom (`Lucie`). `TW JADE`
 * désigne l'opérateur JADE : le premier mot après `TW` n'est jamais lu comme une modèle.
 */
export function attributeLink(
  link: LsLinkFacts,
  refs: { creators: LsCreatorRef[]; accounts: LsAccountRef[] },
): LsAttribution {
  const { prefix, rest } = splitNote(link.note)
  const platform: LsPlatform = prefix ?? (link.destination?.includes('snapchat.com') ? 'snapchat' : 'autre')
  const creatorByName = (name: string): string | null => {
    const f = foldName(name)
    return f ? (refs.creators.find((c) => foldName(c.name) === f)?.id ?? null) : null
  }
  const words = rest.split(/\s+/).filter(Boolean)
  const operator = platform === 'x' && words[0] ? foldName(words[0]).toUpperCase() || null : null
  const account = platform === 'instagram' ? findAccount(rest, refs.accounts) : null

  let creatorId: string | null = null
  for (const folder of link.folderNames) {
    creatorId = creatorByName(folder)
    if (creatorId) break
  }
  if (!creatorId && account) creatorId = account.creatorId
  if (!creatorId && platform === 'x' && words[1]) creatorId = creatorByName(words[1])
  if (!creatorId && !prefix) creatorId = creatorByName(rest)
  return { creatorId, platform, socialAccountId: account?.id ?? null, operator }
}

/** Un lien déjà en base (`mkt_ls_links`) — ce que le plan doit préserver. */
export interface LsKnownLink {
  lsId: string
  manual: boolean
  creatorId: string | null
  platform: string
  socialAccountId: string | null
  operator: string | null
  firstSeen: string | null
  lastSeen: string | null
}

/** Une ligne `mkt_ls_links` à upserter (colonnes de 0179, sauf `id`). */
export interface LsLinkWrite {
  ls_id: string
  url: string
  note: string
  folders: string[]
  kind: LsKind
  destination: string | null
  creator_id: string | null
  platform: string
  social_account_id: string | null
  operator: string | null
  manual: boolean
  first_seen: string | null
  last_seen: string | null
}

/** Une ligne `mkt_ls_daily`, encore indexée par l'id LinkScale (le job la traduit en uuid). */
export interface LsDailyWrite {
  lsId: string
  date: string
  visitors: number
  bots: number
  mym_clicks: number | null
}

export interface LsPlanInput {
  days: { date: string; lines: LsDayLine[] }[]
  listed: LsListedLink[]
  /** id de dossier LinkScale → nom. */
  folderNames: Record<string, string>
  known: LsKnownLink[]
  creators: LsCreatorRef[]
  accounts: LsAccountRef[]
}

/**
 * Ce que le relevé écrit. Un lien = ceux de la LISTE + ceux vus dans les STATS (un lien supprimé
 * côté LinkScale garde son trafic, en `kind = 'inconnu'`). Un lien `manual` garde son attribution.
 */
export function planLinkscaleWrite(input: LsPlanInput): { links: LsLinkWrite[]; daily: LsDailyWrite[] } {
  const listed = new Map(input.listed.map((l) => [l._id, l]))
  const known = new Map(input.known.map((k) => [k.lsId, k]))
  const days = [...input.days].sort((a, b) => a.date.localeCompare(b.date))
  const seen = new Map<string, { note: string; url: string; first: string; last: string }>()
  for (const { date, lines } of days) {
    for (const line of lines) {
      const s = seen.get(line.lsId)
      seen.set(line.lsId, {
        note: line.note || s?.note || '',
        url: line.url || s?.url || '',
        first: s?.first ?? date,
        last: date,
      })
    }
  }

  const links: LsLinkWrite[] = []
  for (const lsId of new Set([...listed.keys(), ...seen.keys()])) {
    const l = listed.get(lsId)
    const s = seen.get(lsId)
    const k = known.get(lsId)
    const note = (s?.note || l?.note || '').trim()
    const folders = (l?.folders ?? []).map((id) => input.folderNames[id] ?? id)
    const destination = l?.url ?? null
    const attr: LsAttribution = k?.manual
      ? {
          creatorId: k.creatorId,
          platform: k.platform as LsPlatform,
          socialAccountId: k.socialAccountId,
          operator: k.operator,
        }
      : attributeLink({ note, folderNames: folders, destination }, input)
    const dates = [k?.firstSeen, k?.lastSeen, s?.first, s?.last].filter((d): d is string => !!d).sort()
    links.push({
      ls_id: lsId,
      url: s?.url || (l ? [l.domain, l.u].filter(Boolean).join('/') : ''),
      note,
      folders,
      kind: l ? kindOf(l.t) : 'inconnu',
      destination,
      creator_id: attr.creatorId,
      platform: attr.platform,
      social_account_id: attr.socialAccountId,
      operator: attr.operator,
      manual: k?.manual ?? false,
      first_seen: dates[0] ?? null,
      last_seen: dates.at(-1) ?? null,
    })
  }

  const kind = new Map(links.map((l) => [l.ls_id, l.kind]))
  const daily = days.flatMap(({ date, lines }) =>
    lines.map((line) => ({
      lsId: line.lsId,
      date,
      visitors: line.visitors,
      bots: line.bots,
      mym_clicks: mymClicksOf(kind.get(line.lsId) ?? 'inconnu', line.mymClicks),
    })),
  )
  return { links, daily }
}
```

Dans `packages/core/src/index.ts`, juste après le bloc `export type { … } from './marketing/x-profile'` :

```ts
export {
  LS_PLATFORMS,
  LS_PLATFORM_LABEL,
  attributeLink,
  foldName,
  kindOf,
  mymClicksOf,
  parseLinkscaleDay,
  planLinkscaleWrite,
  splitNote,
} from './marketing/linkscale'
export type {
  LsAccountRef,
  LsAttribution,
  LsCreatorRef,
  LsDailyWrite,
  LsDayLine,
  LsKind,
  LsKnownLink,
  LsLinkFacts,
  LsLinkWrite,
  LsListedLink,
  LsPlanInput,
  LsPlatform,
  LsTrafficRow,
} from './marketing/linkscale'
```

- [ ] **Step 4 : vérifier que les tests passent**

Run : `pnpm --filter @glagency/core exec vitest run src/marketing/linkscale.test.ts && pnpm --filter @glagency/core typecheck`
Expected : tous les tests PASS, typecheck sans erreur.

- [ ] **Step 5 : point de commit (uniquement si Benoit dit « commit »)**

```bash
git add -- packages/core/src/marketing/linkscale.ts packages/core/src/marketing/linkscale.test.ts packages/core/src/index.ts
git commit -m "feat(marketing-trafic): règles pures LinkScale — parsing, attribution, plan d'écriture"
```

---

### Task 2 : core — totaux et signaux « À regarder »

**Files :**
- Create : `packages/core/src/marketing/linkscale-flags.ts`
- Create : `packages/core/src/marketing/linkscale-flags.test.ts`
- Modify : `packages/core/src/index.ts` (après le bloc ajouté en Task 1)

**Interfaces :**
- Consumes : rien.
- Produces :
  - types : `LsTotals = { visitors: number; bots: number; mymClicks: number | null; mymVisitors: number }`,
    `LsFlag = 'chute' | 'eteint' | 'clic-faible' | 'bots'` ;
  - constantes : `LS_FLAGS`, `LS_FLAG_LABEL: Record<LsFlag, string>`, `LS_THRESHOLDS` ;
  - fonctions :
    - `emptyTotals() → LsTotals`
    - `addDaily(t, { visitors, bots, mymClicks: number | null }) → LsTotals`
    - `sumTotals(list) → LsTotals`
    - `clickRate(t) → number | null`
    - `botShare(t) → number | null`
    - `trafficFlags(cur, prev, referenceRate: number | null) → LsFlag[]`

- [ ] **Step 1 : écrire les tests qui échouent**

`packages/core/src/marketing/linkscale-flags.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { addDaily, botShare, clickRate, emptyTotals, sumTotals, trafficFlags, type LsTotals } from './linkscale-flags'

const t = (over: Partial<LsTotals> = {}): LsTotals => ({ visitors: 0, bots: 0, mymClicks: null, mymVisitors: 0, ...over })

describe('addDaily / sumTotals', () => {
  it('une redirection (mymClicks null) ne compte pas dans les visiteurs des liens à boutons', () => {
    let acc = emptyTotals()
    acc = addDaily(acc, { visitors: 10, bots: 1, mymClicks: 6 })
    acc = addDaily(acc, { visitors: 5, bots: 0, mymClicks: null })
    expect(acc).toEqual({ visitors: 15, bots: 1, mymClicks: 6, mymVisitors: 10 })
  })
  it('sans aucun lien à boutons, les clics MYM restent null', () => {
    expect(sumTotals([t({ visitors: 3 }), t({ visitors: 2 })]).mymClicks).toBeNull()
    expect(sumTotals([t({ mymClicks: 2, mymVisitors: 4 }), t()])).toEqual(t({ mymClicks: 2, mymVisitors: 4 }))
  })
})

describe('clickRate / botShare', () => {
  it('le taux se calcule sur les visiteurs des liens à boutons, et peut dépasser 1', () => {
    expect(clickRate(t({ visitors: 100, mymClicks: 30, mymVisitors: 20 }))).toBe(1.5)
    expect(clickRate(t({ visitors: 100 }))).toBeNull()
  })
  it('part de bots sur le total des visites', () => {
    expect(botShare(t({ visitors: 30, bots: 10 }))).toBe(0.25)
    expect(botShare(t())).toBeNull()
  })
})

describe('trafficFlags', () => {
  it('éteint : 0 visiteur alors que la période précédente en avait au moins 10', () => {
    expect(trafficFlags(t(), t({ visitors: 12 }), null)).toEqual(['eteint'])
    expect(trafficFlags(t(), t({ visitors: 5 }), null)).toEqual([])
  })
  it('chute : moins de la moitié, avec au moins 30 visiteurs avant', () => {
    expect(trafficFlags(t({ visitors: 10 }), t({ visitors: 40 }), null)).toEqual(['chute'])
    expect(trafficFlags(t({ visitors: 25 }), t({ visitors: 40 }), null)).toEqual([])
    expect(trafficFlags(t({ visitors: 5 }), t({ visitors: 20 }), null)).toEqual([])
  })
  it('sans période précédente, aucun signal de chute', () => {
    expect(trafficFlags(t({ visitors: 50 }), t(), null)).toEqual([])
  })
  it('clic faible : taux sous la moitié de la référence, avec assez de visiteurs à boutons', () => {
    const cur = t({ visitors: 50, mymVisitors: 50, mymClicks: 10 })
    expect(trafficFlags(cur, t({ visitors: 50 }), 1)).toEqual(['clic-faible'])
    expect(trafficFlags(t({ visitors: 50, mymVisitors: 20, mymClicks: 1 }), t({ visitors: 50 }), 1)).toEqual([])
    expect(trafficFlags(cur, t({ visitors: 50 }), null)).toEqual([])
  })
  it('un taux au-dessus de 1 n’est jamais « faible » face à une référence normale', () => {
    expect(trafficFlags(t({ visitors: 40, mymVisitors: 40, mymClicks: 60 }), t({ visitors: 40 }), 1.2)).toEqual([])
  })
  it('bots : plus de 20 % sur au moins 30 visites', () => {
    expect(trafficFlags(t({ visitors: 40, bots: 15 }), t({ visitors: 40 }), null)).toEqual(['bots'])
    expect(trafficFlags(t({ visitors: 10, bots: 5 }), t({ visitors: 10 }), null)).toEqual([])
  })
})
```

- [ ] **Step 2 : vérifier que les tests échouent**

Run : `pnpm --filter @glagency/core exec vitest run src/marketing/linkscale-flags.test.ts`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : implémenter**

`packages/core/src/marketing/linkscale-flags.ts` :

```ts
/**
 * Totaux et signaux « À regarder » de la page Marketing › Trafic (spec
 * docs/superpowers/specs/2026-09-30-trafic-linkscale-design.md). Le taux de clic ne compte que les
 * liens à BOUTONS : une redirection n'a pas de clic mesurable, ses visiteurs dilueraient le taux.
 */

export interface LsTotals {
  /** Visiteurs humains (uniques par jour, additionnés). */
  visitors: number
  bots: number
  /** Clics vers mym.fans ; null si aucun lien à boutons dans le total. */
  mymClicks: number | null
  /** Visiteurs des seuls liens à boutons — le dénominateur du taux. */
  mymVisitors: number
}

export const LS_FLAGS = ['chute', 'eteint', 'clic-faible', 'bots'] as const
export type LsFlag = (typeof LS_FLAGS)[number]
export const LS_FLAG_LABEL: Record<LsFlag, string> = {
  chute: 'Trafic en chute',
  eteint: 'Éteint',
  'clic-faible': 'Peu de clics MYM',
  bots: 'Beaucoup de bots',
}

export const LS_THRESHOLDS = {
  chuteRatio: 0.5,
  chuteMinPrev: 30,
  eteintMinPrev: 10,
  clicRatio: 0.5,
  minVolume: 30,
  botShare: 0.2,
} as const

export const emptyTotals = (): LsTotals => ({ visitors: 0, bots: 0, mymClicks: null, mymVisitors: 0 })

export function addDaily(t: LsTotals, d: { visitors: number; bots: number; mymClicks: number | null }): LsTotals {
  return {
    visitors: t.visitors + d.visitors,
    bots: t.bots + d.bots,
    mymClicks: d.mymClicks == null ? t.mymClicks : (t.mymClicks ?? 0) + d.mymClicks,
    mymVisitors: d.mymClicks == null ? t.mymVisitors : t.mymVisitors + d.visitors,
  }
}

export function sumTotals(list: LsTotals[]): LsTotals {
  return list.reduce(
    (acc, t) => ({
      visitors: acc.visitors + t.visitors,
      bots: acc.bots + t.bots,
      mymClicks: t.mymClicks == null ? acc.mymClicks : (acc.mymClicks ?? 0) + t.mymClicks,
      mymVisitors: acc.mymVisitors + t.mymVisitors,
    }),
    emptyTotals(),
  )
}

/** Clics MYM par visiteur des liens à boutons. Peut dépasser 1 : un visiteur clique parfois deux fois. */
export const clickRate = (t: LsTotals): number | null =>
  t.mymClicks != null && t.mymVisitors > 0 ? t.mymClicks / t.mymVisitors : null

export const botShare = (t: LsTotals): number | null => {
  const all = t.visitors + t.bots
  return all > 0 ? t.bots / all : null
}

/** Les raisons de regarder une ligne. `referenceRate` = le taux auquel la comparer (réseau ou global). */
export function trafficFlags(cur: LsTotals, prev: LsTotals, referenceRate: number | null): LsFlag[] {
  const T = LS_THRESHOLDS
  const flags: LsFlag[] = []
  if (cur.visitors === 0 && prev.visitors >= T.eteintMinPrev) flags.push('eteint')
  else if (prev.visitors >= T.chuteMinPrev && cur.visitors < prev.visitors * T.chuteRatio) flags.push('chute')
  const rate = clickRate(cur)
  if (
    rate != null &&
    cur.mymVisitors >= T.minVolume &&
    referenceRate != null &&
    referenceRate > 0 &&
    rate < referenceRate * T.clicRatio
  ) {
    flags.push('clic-faible')
  }
  const share = botShare(cur)
  if (share != null && cur.visitors + cur.bots >= T.minVolume && share > T.botShare) flags.push('bots')
  return flags
}
```

Dans `packages/core/src/index.ts`, après le bloc de la Task 1 :

```ts
export {
  LS_FLAGS,
  LS_FLAG_LABEL,
  LS_THRESHOLDS,
  addDaily,
  botShare,
  clickRate,
  emptyTotals,
  sumTotals,
  trafficFlags,
} from './marketing/linkscale-flags'
export type { LsFlag, LsTotals } from './marketing/linkscale-flags'
```

- [ ] **Step 4 : vérifier que les tests passent**

Run : `pnpm --filter @glagency/core test && pnpm --filter @glagency/core typecheck`
Expected : toute la suite core PASS, typecheck OK.

- [ ] **Step 5 : point de commit (uniquement si Benoit dit « commit »)**

```bash
git add -- packages/core/src/marketing/linkscale-flags.ts packages/core/src/marketing/linkscale-flags.test.ts packages/core/src/index.ts
git commit -m "feat(marketing-trafic): totaux et signaux « À regarder » du trafic LinkScale"
```

---

### Task 3 : migration `0179` + types

**Files :**
- Create : `packages/db/supabase/migrations/0179_trafic_linkscale.sql`
- Modify : `packages/db/src/types.ts` (régénéré)

**Interfaces :**
- Produces :
  - tables `mkt_ls_links`, dont les colonnes correspondent à `LsLinkWrite` plus `id uuid` et
    `created_at` ;
  - `mkt_ls_daily` (`link_id`, `date`, `visitors`, `bots`, `mym_clicks`) ;
  - types `Database['public']['Tables']['mkt_ls_links' | 'mkt_ls_daily']`.

- [ ] **Step 1 : écrire la migration**

`packages/db/supabase/migrations/0179_trafic_linkscale.sql` :

```sql
-- 0179 — Trafic LinkScale (spec docs/superpowers/specs/2026-09-30-trafic-linkscale-design.md).
--
-- Un lien LinkScale (lien de bio) = une ligne de `mkt_ls_links`, identifiée par son id LinkScale.
-- L'attribution (modèle, réseau, compte Instagram, opérateur X) est DÉDUITE par le relevé depuis la
-- note et le dossier ; `manual = true` la fige (correction depuis Marketing › Trafic) : le relevé
-- nocturne n'y touche plus. `kind = 'inconnu'` = vu dans les stats mais absent de la liste
-- (lien supprimé côté LinkScale) : son trafic reste.
--
-- `mkt_ls_daily` : une ligne par lien et par jour (heure de Paris). `visitors` = visiteurs humains
-- uniques du jour ; `mym_clicks` = clics de boutons vers mym.fans, NULL pour une redirection
-- directe (aucun bouton : rien à compter, et surtout pas un faux zéro).
--
-- Même porte que le reste des tables marketing (0018, resserrée en 0060 ; patron 0170). Le relevé
-- écrit en service-role.

create table if not exists public.mkt_ls_links (
  id                uuid primary key default gen_random_uuid(),
  ls_id             text not null unique,
  url               text not null default '',
  note              text not null default '',
  folders           text[] not null default '{}',
  kind              text not null default 'inconnu'
                    check (kind in ('landing', 'redirect', 'shortcut', 'inconnu')),
  destination       text,
  creator_id        uuid references public.creators(id) on delete set null,
  platform          text not null default 'autre'
                    check (platform in ('x', 'instagram', 'threads', 'snapchat', 'autre')),
  social_account_id uuid references public.mkt_social_accounts(id) on delete set null,
  operator          text,
  manual            boolean not null default false,
  first_seen        date,
  last_seen         date,
  created_at        timestamptz not null default now()
);
create index if not exists mkt_ls_links_creator_idx on public.mkt_ls_links (creator_id);
create index if not exists mkt_ls_links_account_idx on public.mkt_ls_links (social_account_id);

create table if not exists public.mkt_ls_daily (
  link_id    uuid not null references public.mkt_ls_links(id) on delete cascade,
  date       date not null,
  visitors   integer not null default 0 check (visitors >= 0),
  bots       integer not null default 0 check (bots >= 0),
  mym_clicks integer check (mym_clicks >= 0),
  primary key (link_id, date)
);
create index if not exists mkt_ls_daily_date_idx on public.mkt_ls_daily (date);

alter table public.mkt_ls_links enable row level security;
create policy mkt_ls_links_all on public.mkt_ls_links for all to authenticated
  using ((select public.can_write_page('marketing'::text)))
  with check ((select public.can_write_page('marketing'::text)));

alter table public.mkt_ls_daily enable row level security;
create policy mkt_ls_daily_all on public.mkt_ls_daily for all to authenticated
  using ((select public.can_write_page('marketing'::text)))
  with check ((select public.can_write_page('marketing'::text)));
```

- [ ] **Step 2 : ⛔ accord de Benoit, puis appliquer sur l'UAT**

Demander : « J'applique `0179` sur l'UAT ? ». Sans « oui » explicite, s'arrêter là.

```bash
UAT=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
cd packages/db && supabase db push --db-url "$UAT" --dry-run
```

Expected : une seule migration listée, `0179_trafic_linkscale.sql`. Si le dry-run en montre une
autre, **s'arrêter** : l'UAT est désaligné, c'est à signaler.

Si la commande échoue en « no route to host » (IPv6), passer par le pooler en mode session :
`postgresql://postgres.<ref-uat>:<mot-de-passe>@aws-0-<région>.pooler.supabase.com:5432/postgres`,
avec le mot de passe et la réf extraits de `DATABASE_URL_UAT` (CLAUDE.md § Migrations). La région
de l'UAT est à vérifier dans le dashboard Supabase.

Puis la même commande sans `--dry-run`.

- [ ] **Step 3 : régénérer les types depuis l'UAT**

```bash
supabase gen types typescript --db-url "$UAT" --schema public > src/types.ts
cd ../.. && git diff --stat packages/db/src/types.ts
```

Expected : le diff n'ajoute que `mkt_ls_links` et `mkt_ls_daily`. S'il touche autre chose, l'UAT
diverge du dépôt : revenir en arrière (`git checkout -- packages/db/src/types.ts`) et ajouter à
la main uniquement les deux blocs de tables générés.

- [ ] **Step 4 : vérifier**

Run : `pnpm -r typecheck`
Expected : aucune erreur (les tables ne sont encore lues par personne ; seul le fichier de types
doit compiler).

- [ ] **Step 5 : point de commit (uniquement si Benoit dit « commit »)**

```bash
git add -- packages/db/supabase/migrations/0179_trafic_linkscale.sql packages/db/src/types.ts
git commit -m "feat(marketing-trafic): tables mkt_ls_links et mkt_ls_daily (0179)"
```

---

### Task 4 : le job `marketing-linkscale` + CLI

**Files :**
- Create : `apps/ingestion/src/marketing-linkscale.ts`
- Create : `apps/ingestion/src/linkscale.ts`
- Modify : `apps/ingestion/package.json` (scripts : ajouter `"linkscale": "tsx src/linkscale.ts"` après `"x"`)
- Modify : `.env.example` (après le bloc `X_BEARER_TOKEN`, ligne ~58)
- Modify : `apps/ingestion/wrangler.toml` (bloc des secrets, après la ligne `X_BEARER_TOKEN`, ~84)

**Interfaces :**
- Consumes : `planLinkscaleWrite`, `parseLinkscaleDay`, `chunk`, `addDays`, `todayParis`, types
  `LsListedLink`, `LsDayLine` (core) ; `createAdminClient`, `fetchAll` (`@glagency/db`) ; tables
  de la Task 3.
- Produces :
  - `runMarketingLinkscale(opts?: { days?: string[] }) → Promise<LinkscaleRunSummary>` ;
  - `LinkscaleRunSummary = { status: 'ok' | 'degraded'; days: string[]; links: number; dailyRows: number; unattributed: number; warnings: string[] }` ;
  - `defaultDays(today?: string) → string[]` (J-2 et J-1).

- [ ] **Step 1 : écrire le job**

`apps/ingestion/src/marketing-linkscale.ts` :

```ts
import { createAdminClient, fetchAll } from '@glagency/db'
import {
  addDays,
  chunk,
  parseLinkscaleDay,
  planLinkscaleWrite,
  todayParis,
  type LsDayLine,
  type LsListedLink,
} from '@glagency/core'

/**
 * Pipeline MARKETING-LINKSCALE : trafic des liens de bio LinkScale → mkt_ls_links / mkt_ls_daily
 * (spec docs/superpowers/specs/2026-09-30-trafic-linkscale-design.md). Clé de projet en LECTURE
 * seule (`LINKSCALE_API_KEY`) : rien n'est jamais écrit chez LinkScale.
 *
 * Chaque nuit, en fan-out du cron de 23h05 UTC (`?job=linkscale`, aucun slot cron) :
 *   1. dossiers + liste des liens (type, dossiers, destination) ;
 *   2. un appel stats PAR JOUR — `dailyTraffic` revient vide, seul `trafficByUrls` porte le détail ;
 *      J-2 et J-1 à Paris (le cron tourne après minuit, heure de Paris) ;
 *   3. plan pur (`planLinkscaleWrite`) : attribution des liens non corrigés à la main ;
 *   4. upsert des liens, puis des lignes du jour.
 *
 * Budget sous-requêtes (Worker Free, 50/invocation) : 1 dossiers + ~7 pages de liens + 2 stats +
 * 3 lectures + 2 upserts ≈ 15. LinkScale limite à 2 requêtes/s : pause entre deux appels.
 */

export interface LinkscaleRunSummary {
  status: 'ok' | 'degraded'
  days: string[]
  links: number
  dailyRows: number
  /** Liens vus sur la fenêtre, sans modèle attribuée. */
  unattributed: number
  warnings: string[]
}

const LS_API = 'https://dashboard.linkscale.to/api/v1'
const PAGE = 50
const MAX_PAGES = 20
const PAUSE_MS = 600
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function lsGet(path: string, key: string): Promise<unknown> {
  const r = await fetch(`${LS_API}${path}`, { headers: { Authorization: `Bearer ${key}` } })
  if (!r.ok) throw new Error(`LinkScale ${path.split('?')[0]} : HTTP ${r.status}`)
  return r.json()
}

/** J-2 et J-1 à Paris : J-1 vient de se terminer quand le cron tourne. */
export function defaultDays(today: string = todayParis()): string[] {
  return [addDays(today, -2), addDays(today, -1)]
}

export async function runMarketingLinkscale(opts: { days?: string[] } = {}): Promise<LinkscaleRunSummary> {
  const warnings: string[] = []
  const days = [...(opts.days ?? defaultDays())].sort()
  const summary = (status: 'ok' | 'degraded'): LinkscaleRunSummary => ({
    status,
    days,
    links: 0,
    dailyRows: 0,
    unattributed: 0,
    warnings,
  })
  const key = process.env.LINKSCALE_API_KEY
  if (!key) {
    warnings.push('LINKSCALE_API_KEY absente — relevé LinkScale non lancé (secret Cloudflare / .env)')
    return summary('degraded')
  }

  // 1. Dossiers (id → nom) et liste des liens.
  const folderRes = (await lsGet('/folders', key)) as { folders?: { _id: string; name: string }[] }
  const folderNames: Record<string, string> = {}
  for (const f of folderRes.folders ?? []) folderNames[f._id] = f.name.trim()
  const listed: LsListedLink[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    await sleep(PAUSE_MS)
    const res = (await lsGet(`/links?limit=${PAGE}&offset=${page * PAGE}`, key)) as {
      links?: LsListedLink[]
      pagination?: { has_more?: boolean }
    }
    listed.push(...(res.links ?? []))
    if (!res.pagination?.has_more) break
    if (page === MAX_PAGES - 1) warnings.push(`liste des liens tronquée à ${MAX_PAGES * PAGE}`)
  }

  // 2. Un appel stats par jour.
  const byDay: { date: string; lines: LsDayLine[] }[] = []
  for (const date of days) {
    await sleep(PAUSE_MS)
    const q = `from=${date}&to=${addDays(date, 1)}&timezone=Europe/Paris&include_clicks=true`
    byDay.push({ date, lines: parseLinkscaleDay(await lsGet(`/stats?${q}`, key)) })
  }

  // 3. Références CRM + liens déjà connus (pour préserver les corrections manuelles).
  const db = createAdminClient()
  const [creatorsRes, accountsRes, knownRes] = await Promise.all([
    db.from('creators').select('id, name'),
    db.from('mkt_social_accounts').select('id, handle, creator_id').eq('platform', 'instagram'),
    fetchAll((f, t) =>
      db
        .from('mkt_ls_links')
        .select('id, ls_id, manual, creator_id, platform, social_account_id, operator, first_seen, last_seen')
        .order('id')
        .range(f, t),
    ),
  ])
  if (creatorsRes.error) throw new Error(`creators : ${creatorsRes.error.message}`)
  if (accountsRes.error) throw new Error(`mkt_social_accounts : ${accountsRes.error.message}`)
  if (knownRes.error) throw new Error(`mkt_ls_links lecture : ${knownRes.error.message}`)

  const plan = planLinkscaleWrite({
    days: byDay,
    listed,
    folderNames,
    creators: (creatorsRes.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    accounts: (accountsRes.data ?? []).map((a) => ({ id: a.id, handle: a.handle, creatorId: a.creator_id })),
    known: knownRes.data.map((k) => ({
      lsId: k.ls_id,
      manual: k.manual,
      creatorId: k.creator_id,
      platform: k.platform,
      socialAccountId: k.social_account_id,
      operator: k.operator,
      firstSeen: k.first_seen,
      lastSeen: k.last_seen,
    })),
  })

  // 4. Liens (on récupère leur uuid), puis lignes du jour.
  const idByLs = new Map<string, string>()
  for (const part of chunk(plan.links, 500)) {
    const { data, error } = await db.from('mkt_ls_links').upsert(part, { onConflict: 'ls_id' }).select('id, ls_id')
    if (error) throw new Error(`mkt_ls_links : ${error.message}`)
    for (const r of data ?? []) idByLs.set(r.ls_id, r.id)
  }
  const daily = plan.daily.flatMap((d) => {
    const linkId = idByLs.get(d.lsId)
    if (!linkId) {
      warnings.push(`ligne du ${d.date} sans lien écrit (${d.lsId})`)
      return []
    }
    return [{ link_id: linkId, date: d.date, visitors: d.visitors, bots: d.bots, mym_clicks: d.mym_clicks }]
  })
  for (const part of chunk(daily, 500)) {
    const { error } = await db.from('mkt_ls_daily').upsert(part, { onConflict: 'link_id,date' })
    if (error) throw new Error(`mkt_ls_daily : ${error.message}`)
  }

  const seen = new Set(plan.daily.map((d) => d.lsId))
  return {
    status: warnings.length ? 'degraded' : 'ok',
    days,
    links: plan.links.length,
    dailyRows: daily.length,
    unattributed: plan.links.filter((l) => seen.has(l.ls_id) && !l.creator_id).length,
    warnings,
  }
}
```

- [ ] **Step 2 : écrire la CLI**

`apps/ingestion/src/linkscale.ts` :

```ts
import { addDays, todayParis } from '@glagency/core'
import { loadEnv } from './env'
import { runMarketingLinkscale } from './marketing-linkscale'
import { recordRun } from './record-run'

// Charge le .env racine avant tout (client Supabase et LINKSCALE_API_KEY lisent process.env).
loadEnv()

/**
 * Relevé LinkScale à la main — mêmes briques que le fan-out nocturne (`?job=linkscale`).
 *
 *   pnpm --filter @glagency/ingestion linkscale                          # J-2 et J-1
 *   pnpm --filter @glagency/ingestion linkscale 2026-05-01 2026-09-29    # remplissage
 *
 * Une longue plage passe par ici et pas par le Worker : un appel LinkScale par jour, au-delà des
 * 50 sous-requêtes d'une invocation Free. Cibler l'UAT = surcharger en préfixe (cf. marketing-cli.ts) :
 *   SUPABASE_URL=$SUPABASE_URL_UAT SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY_UAT pnpm …
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/
const [from, to] = process.argv.slice(2)
let days: string[] | undefined
if (from || to) {
  if (!from || !to || !DAY.test(from) || !DAY.test(to) || from > to) {
    console.error('usage : pnpm --filter @glagency/ingestion linkscale [<AAAA-MM-JJ> <AAAA-MM-JJ>]')
    process.exit(1)
  }
  const lastDone = addDays(todayParis(), -1)
  if (to > lastDone) {
    console.error(`${to} n'est pas terminé à Paris : dernier jour possible = ${lastDone}`)
    process.exit(1)
  }
  days = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
}

const startedAt = new Date()
console.log(
  `[marketing-linkscale] relevé${days ? ` ${from} → ${to} (${days.length} j)` : ''} → ${process.env.SUPABASE_URL ?? '(SUPABASE_URL absente)'}`,
)
runMarketingLinkscale({ days })
  .then(async (summary) => {
    console.log(`[marketing-linkscale] ${summary.status.toUpperCase()}`, JSON.stringify(summary))
    await recordRun('local', startedAt, {
      summary: { job: 'marketing-linkscale', ...summary } as unknown as Parameters<typeof recordRun>[2]['summary'],
    })
    process.exit(0)
  })
  .catch(async (err: unknown) => {
    console.error('[marketing-linkscale] ÉCHEC', err)
    await recordRun('local', startedAt, { error: err })
    process.exit(1)
  })
```

Dans `apps/ingestion/package.json`, `scripts` : ajouter `"linkscale": "tsx src/linkscale.ts"` juste
après `"x": "tsx src/x.ts"` (attention à la virgule).

`.env.example`, après `X_BEARER_TOKEN=` :

```
# Trafic LinkScale — clé de PROJET en lecture seule (Dashboard LinkScale → projet → API Keys, lk_…)
LINKSCALE_API_KEY=
```

`apps/ingestion/wrangler.toml`, dans le bloc des secrets, après la ligne `X_BEARER_TOKEN` :

```
#   wrangler secret put LINKSCALE_API_KEY  # trafic LinkScale (clé projet lecture seule) — absent : job sauté, signalé
```

- [ ] **Step 3 : typecheck**

Run : `pnpm --filter @glagency/ingestion typecheck`
Expected : aucune erreur.

- [ ] **Step 4 : ⛔ accord de Benoit, puis essai réel sur l'UAT (deux jours)**

Demander : « Je lance le relevé LinkScale sur l'UAT pour le 28 et le 29/09 ? ». Sans « oui »,
s'arrêter.

```bash
# Extraction brute, jamais `source .env` (CLAUDE.md : ça corrompt les variables).
SUPABASE_URL_UAT=$(grep '^SUPABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
SUPABASE_SECRET_KEY_UAT=$(grep '^SUPABASE_SECRET_KEY_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
SUPABASE_URL=$SUPABASE_URL_UAT SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY_UAT \
  pnpm --filter @glagency/ingestion linkscale 2026-09-28 2026-09-29
```

Expected : `[marketing-linkscale] OK {"days":["2026-09-28","2026-09-29"],"links":…}`, avec `links`
d'au moins 300 et `dailyRows` supérieur à 0. Le 29/09 avait 35 liens actifs à la mesure du
2026-09-30.

Contrôle en base UAT (lecture seule) :

```bash
UAT=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$UAT" -At -c "select date, count(*), sum(visitors), sum(mym_clicks) from mkt_ls_daily group by 1 order by 1"
```

Expected pour le 29/09 : 35 lignes et environ 117 visiteurs, les valeurs relevées par l'API le
2026-09-30. Un petit écart est normal si LinkScale a consolidé ses chiffres depuis.

Relancer la même commande : elle doit être idempotente (mêmes totaux).

- [ ] **Step 5 : clé refusée = run en échec, tracé, sans rien écrire**

Run : `LINKSCALE_API_KEY=lk_invalide SUPABASE_URL=$SUPABASE_URL_UAT SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY_UAT pnpm --filter @glagency/ingestion linkscale`
Expected : `[marketing-linkscale] ÉCHEC Error: LinkScale /folders : HTTP 401`, code de sortie 1.
Le premier appel échoue avant toute écriture.

Note : on ne peut pas tester la branche « clé absente » par variable vide. `loadEnv()` remplit
toute clé vide depuis le `.env` (`env.ts:15`, `if (!process.env[k])`). Cette branche se lit dans
le code : elle renvoie `degraded` sans appel réseau.

- [ ] **Step 6 : point de commit (uniquement si Benoit dit « commit »)**

```bash
git add -- apps/ingestion/src/marketing-linkscale.ts apps/ingestion/src/linkscale.ts apps/ingestion/package.json .env.example apps/ingestion/wrangler.toml
git commit -m "feat(marketing-trafic): relevé LinkScale (job + pnpm linkscale)"
```

---

### Task 5 : fan-out `?job=linkscale` dans le Worker + docs de la PR 1

**Files :**
- Modify : `apps/ingestion/src/worker.ts`
  - imports : ajouter après `import { runMarketingX } from './marketing-x'` (~l. 9) ;
  - union `job` de `runJobAndLog` (~l. 275) ;
  - bloc fan-out après celui de X (~l. 490) ;
  - branche `fetch` après `?job=x` (~l. 539).
- Modify : `docs/CARTE.md` (tableau des commandes et ligne du cron `5 23`)
- Modify : `ARCHITECTURE.md` (§ 10 Domaines, nouvelle sous-section après « Comptes X »)
- Modify : `CHANGELOG.md` (« Non publié »)

**Interfaces :**
- Consumes : `runMarketingLinkscale` (Task 4).

- [ ] **Step 1 : câbler le Worker**

Import :

```ts
import { runMarketingLinkscale } from './marketing-linkscale'
```

Union du job (remplacer la ligne) :

```ts
  job: 'marketing' | 'marketing-social' | 'marketing-telegram' | 'marketing-x' | 'marketing-linkscale',
```

Après le bloc « Fan-out X », avant `if (chatterErr) throw chatterErr` :

```ts
    // ── Fan-out LinkScale (trafic des liens de bio) — même mécanique, aucun slot cron. Sans
    // LINKSCALE_API_KEY le job ne fait rien et le signale (run dégradé).
    try {
      const { SELF: self, WORKER_SELF_URL: selfUrl, TRIGGER_TOKEN: token } = env
      if (self && selfUrl && token) {
        const r = await self.fetch(`${selfUrl}?job=linkscale`, { headers: { Authorization: `Bearer ${token}` } })
        if (!r.ok) Sentry.captureMessage(`[marketing-linkscale] fan-out KO (HTTP ${r.status})`, 'warning')
      }
    } catch (err) {
      Sentry.captureException(err)
    }
```

Dans `fetch`, juste après la branche `?job=x` :

```ts
    // `?job=linkscale` : trafic LinkScale de J-2 et J-1 (idempotent).
    if (url.searchParams.get('job') === 'linkscale') {
      try {
        const summary = await runJobAndLog('marketing-linkscale', runMarketingLinkscale, 'http')
        return Response.json(summary)
      } catch (err) {
        Sentry.captureException(err)
        return new Response(`échec linkscale : ${err instanceof Error ? err.message : String(err)}\n`, { status: 500 })
      }
    }
```

- [ ] **Step 2 : vérifier**

Run : `pnpm --filter @glagency/ingestion typecheck`
Expected : aucune erreur.

Run : `grep -n "linkscale" apps/ingestion/src/worker.ts`
Expected : l'import, l'union, le fan-out et la branche `fetch`, soit 4 endroits.

- [ ] **Step 3 : docs**

`docs/CARTE.md`, tableau des commandes, après la ligne `pnpm x` :

```
| `pnpm linkscale [début fin]` | Relevé LinkScale : visiteurs, bots et clics MYM par lien, J-2 et J-1 par défaut, ou une plage pour le remplissage — mêmes briques que le fan-out `?job=linkscale` du cron `5 23` | `src/linkscale.ts` → `marketing-linkscale.ts` | tables `creators`, `mkt_ls_daily`, `mkt_ls_links`, `mkt_social_accounts` | `docs/superpowers/specs/2026-09-30-trafic-linkscale-design.md` |
```

Dans la ligne `cron 5 23 * * *`, remplacer « (liens de tracking, puis comptes X) » par
« (liens de tracking, puis comptes X, puis trafic LinkScale) ».

`ARCHITECTURE.md`, nouvelle sous-section juste avant `### Agence` :

```markdown
### Trafic LinkScale

Relevé nocturne du trafic des liens de bio **LinkScale** (projet « GoodLuck »), par leur API et une
clé de projet **en lecture seule** (secret `LINKSCALE_API_KEY`) — spec
`docs/superpowers/specs/2026-09-30-trafic-linkscale-design.md`. Job
`apps/ingestion/src/marketing-linkscale.ts`, en **fan-out `?job=linkscale`** du cron de 23h05,
après X (aucun slot cron) ; J-2 et J-1 à Paris, un appel stats par jour (`dailyTraffic` revient
vide). Remplissage : `pnpm --filter @glagency/ingestion linkscale <début> <fin>` (historique
disponible au moins depuis mai 2026). Écrit `mkt_ls_links` (un lien LinkScale = une ligne) et
`mkt_ls_daily` (visiteurs humains uniques, bots, clics de boutons vers mym.fans ; `null` pour une
redirection directe). **L'attribution se déduit** de la note et du dossier tapés par l'équipe :
dossier = modèle, `TW <opérateur> [modèle]`, `IN <pseudo Instagram>`, destination Snapchat ; un lien
corrigé à la main (`manual`) n'est plus touché. `TW JADE` = l'opérateur JADE, jamais la modèle Jade.
**Pas de CA** : LinkScale ne l'expose pas par API et MyPuls reste la source ; le raccord lien MYM →
lien de tracking MyPuls (V2) attend une page MyPuls qui donne l'URL de chaque lien.
```

`CHANGELOG.md`, sous `## Non publié` (créer `### Ajouté` s'il n'existe pas) :

```markdown
- Marketing : relevé quotidien du trafic LinkScale (visiteurs, bots et clics vers MYM par lien, attribués à une modèle, un réseau et un profil), avec `pnpm linkscale` pour remplir l'historique depuis mai — base de la page Trafic.
```

Run : `pnpm check:carte`
Expected : OK.

- [ ] **Step 4 : vérifications de la PR 1**

Run : `pnpm --filter @glagency/core test && pnpm -r typecheck`
Expected : tout vert.

- [ ] **Step 5 : point de commit (uniquement si Benoit dit « commit »)**

```bash
git add -- apps/ingestion/src/worker.ts docs/CARTE.md ARCHITECTURE.md CHANGELOG.md docs/superpowers/specs/2026-09-30-trafic-linkscale-design.md docs/superpowers/plans/2026-09-30-trafic-linkscale.md
git commit -m "feat(marketing-trafic): fan-out ?job=linkscale du cron 5 23 + docs"
```

Ouvrir la PR 1 `feature/trafic-linkscale-releve` → `develop` **seulement sur accord de Benoit**.
Le déploiement du Worker, le secret et `0179` en prod suivent la procédure de release et exigent
chacun un accord explicite (cf. Global Constraints).

---

# PR 2 — la page (branche `feature/trafic-linkscale-page`)

Créer la branche depuis `origin/develop` si la PR 1 y est mergée. Sinon, l'empiler sur
`feature/trafic-linkscale-releve`, dans le même worktree :

```bash
git switch -c feature/trafic-linkscale-page
```

### Task 6 : droit d'accès et entrée de nav

**Files :**
- Modify : `apps/web/src/config/workspaces.ts`
  - import lucide (l. 3-51) : ajouter `MousePointerClick` ;
  - nav marketing (~l. 233) : item après « Liens tracking » ;
  - `PAGE_SLUGS` (~l. 326) : `'mkt-trafic'` après `'mkt-liens'`.
- Modify : `apps/web/src/config/workspaces.test.ts` (nouveau `describe` après celui de la page
  Modèles, ~l. 280)

**Interfaces :**
- Produces : slug `'mkt-trafic'` dans `PageSlug`, item de nav `/marketing/trafic`.

- [ ] **Step 1 : écrire le test qui échoue**

Dans `apps/web/src/config/workspaces.test.ts`, après le bloc `describe('face Marketing — page Modèles', …)` :

```ts
describe('face Marketing — page Trafic', () => {
  const marketing = WORKSPACES.find((w) => w.id === 'marketing')!
  const trafic = () => marketing.nav.find((n) => n.href === '/marketing/trafic')!

  it('expose le slug mkt-trafic', () => {
    expect(PAGE_SLUGS).toContain('mkt-trafic')
  })

  it('range Trafic dans Réseaux, juste après Liens tracking, sans restriction admin', () => {
    expect(trafic().group).toBe('reseaux')
    expect(trafic().slug).toBe('mkt-trafic')
    expect(trafic().adminOnly).toBeUndefined()
    const hrefs = marketing.nav.map((n) => n.href)
    expect(hrefs.indexOf('/marketing/trafic')).toBe(hrefs.indexOf('/marketing/liens') + 1)
  })

  it('le slug appartient bien à la face marketing', () => {
    expect(slugFace('mkt-trafic')).toBe('marketing')
  })

  it('est une case à cocher de la page Membres du pôle marketing', () => {
    expect(pageChoicesFor('marketing').map((c) => c.slug)).toContain('mkt-trafic')
  })

  it("s'ouvre à qui porte le droit, pas aux autres", () => {
    expect(canAccessNav(trafic(), user(['mkt-trafic']))).toBe(true)
    expect(canAccessNav(trafic(), user(['mkt-liens']))).toBe(false)
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run : `pnpm --filter @glagency/web exec vitest run src/config/workspaces.test.ts`
Expected : FAIL sur « page Trafic » (le slug et l'item manquent).

- [ ] **Step 3 : implémenter**

Dans l'import lucide de `workspaces.ts`, ajouter `MousePointerClick,` (par exemple après `Link2,`).

Dans la nav marketing, juste après la ligne `{ href: '/marketing/liens', … }` :

```ts
      // Trafic des liens de bio LinkScale : d'où viennent les visiteurs, par profil, modèle et
      // réseau, et quels profils décrochent (docs/superpowers/specs/2026-09-30-trafic-linkscale-design.md).
      { href: '/marketing/trafic', label: 'Trafic', icon: MousePointerClick, slug: 'mkt-trafic', group: 'reseaux' },
```

Dans `PAGE_SLUGS`, insérer `'mkt-trafic'` juste après `'mkt-liens'`.

- [ ] **Step 4 : vérifier**

Run : `pnpm --filter @glagency/web exec vitest run src/config/workspaces.test.ts`
Expected : PASS.

- [ ] **Step 5 : point de commit (uniquement si Benoit dit « commit »)**

```bash
git add -- apps/web/src/config/workspaces.ts apps/web/src/config/workspaces.test.ts
git commit -m "feat(marketing-trafic): droit mkt-trafic et entrée de nav"
```

---

### Task 7 : agrégation pure de la page

**Files :**
- Create : `apps/web/src/features/marketing-trafic/types.ts`
- Create : `apps/web/src/features/marketing-trafic/aggregate.ts`
- Create : `apps/web/src/features/marketing-trafic/aggregate.test.ts`

**Interfaces :**
- Consumes : `LS_PLATFORM_LABEL`, `addDaily`, `botShare`, `clickRate`, `emptyTotals`,
  `sumTotals`, `trafficFlags`, types `LsFlag`, `LsPlatform`, `LsTotals` (core).
- Produces : `buildTrafic(input: TraficInput) → TraficData`, et les types de `types.ts`
  (`TraficTab`, `TraficEdit`, `TraficRow`, `TraficDay`, `TraficData`).

- [ ] **Step 1 : les types**

`apps/web/src/features/marketing-trafic/types.ts` :

```ts
import type { LsFlag, LsPlatform, LsTotals } from '@glagency/core'

export type TraficTab = 'profils' | 'modeles' | 'reseaux'

/** Ce que la fenêtre de correction lit et renvoie (une ligne de lien seulement). */
export interface TraficEdit {
  linkId: string
  creatorId: string | null
  platform: LsPlatform
  socialAccountId: string | null
  operator: string | null
  manual: boolean
}

export interface TraficRow {
  key: string
  label: string
  /** URL du lien, ou « N lien(s) » pour un regroupement. */
  sub: string | null
  creatorName: string | null
  platform: LsPlatform | null
  cur: LsTotals
  prev: LsTotals
  rate: number | null
  botShare: number | null
  /** Évolution des visiteurs vs période précédente, en % ; null sans période précédente. */
  deltaPct: number | null
  flags: LsFlag[]
  edit: TraficEdit | null
}

export interface TraficDay {
  date: string
  visitors: number
  mymClicks: number
}

export interface TraficData {
  periodLabel: string
  /** Dernier jour de la période (`YYYY-MM-DD`). */
  to: string
  totals: { cur: LsTotals; prev: LsTotals }
  daily: TraficDay[]
  links: TraficRow[]
  models: TraficRow[]
  networks: TraficRow[]
  creators: { id: string; name: string }[]
  accounts: { id: string; handle: string }[]
  /** Dernier jour relevé dans la période ; null si aucun. */
  lastDate: string | null
}
```

- [ ] **Step 2 : écrire les tests qui échouent**

`apps/web/src/features/marketing-trafic/aggregate.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { buildTrafic, type TraficDailyInput, type TraficLinkInput } from './aggregate'

const period = { from: '2026-09-15', to: '2026-09-28', label: '15 sept. – 28 sept. 2026' }
const link = (over: Partial<TraficLinkInput>): TraficLinkInput => ({
  id: 'l',
  url: 'heyliiink.com/x',
  note: '',
  creator_id: null,
  platform: 'autre',
  social_account_id: null,
  operator: null,
  manual: false,
  ...over,
})
const day = (link_id: string, date: string, visitors: number, mym_clicks: number | null, bots = 0): TraficDailyInput => ({
  link_id,
  date,
  visitors,
  bots,
  mym_clicks,
})

const creators = [
  { id: 'c-carla', name: 'Carla' },
  { id: 'c-julie', name: 'Julie' },
]
const accounts = [{ id: 'a-tardif', handle: 'Julietardifff' }]

describe('buildTrafic', () => {
  const data = buildTrafic({
    period,
    creators,
    accounts,
    links: [
      link({ id: 'ara', url: 'carlaprof.live/carla', note: 'TW ARA CARLA', creator_id: 'c-carla', platform: 'x', operator: 'ARA' }),
      link({ id: 'ig', url: 'heyliiink.com/jt', note: 'IN JULIETARDIFF', creator_id: 'c-julie', platform: 'instagram', social_account_id: 'a-tardif' }),
      link({ id: 'snap', url: 'heyliiink.com/snp', note: 'Carla', creator_id: 'c-carla', platform: 'snapchat' }),
      link({ id: 'dead', url: 'heyliiink.com/old', note: 'TW OLD' }),
    ],
    daily: [
      // période précédente (1er → 14/09)
      day('ara', '2026-09-05', 80, 90),
      day('ig', '2026-09-05', 10, 5),
      // période
      day('ara', '2026-09-20', 30, 40),
      day('ig', '2026-09-20', 40, 4, 20),
      day('snap', '2026-09-21', 25, null),
    ],
  })

  it('ne garde que les liens qui ont du trafic sur l’une des deux périodes', () => {
    expect(data.links.map((r) => r.key).sort()).toEqual(['ara', 'ig', 'snap'])
  })

  it('libellé du profil : compte Instagram, sinon opérateur, sinon note', () => {
    const label = Object.fromEntries(data.links.map((r) => [r.key, r.label]))
    expect(label).toEqual({ ara: 'ARA', ig: '@Julietardifff', snap: 'Carla' })
  })

  it('totaux : les redirections ne diluent pas le taux de clic', () => {
    expect(data.totals.cur).toEqual({ visitors: 95, bots: 20, mymClicks: 44, mymVisitors: 70 })
    expect(data.totals.prev.visitors).toBe(90)
  })

  it('signale la chute, le clic faible et les bots au bon endroit', () => {
    const flags = Object.fromEntries(data.links.map((r) => [r.key, r.flags]))
    expect(flags.ara).toEqual(['chute'])
    expect(flags.ig).toEqual(['clic-faible', 'bots'])
    expect(flags.snap).toEqual([])
  })

  it('les lignes signalées passent devant', () => {
    expect(data.links.at(-1)!.key).toBe('snap')
  })

  it('regroupe par modèle et par réseau', () => {
    const carla = data.models.find((r) => r.key === 'c-carla')!
    expect(carla.label).toBe('Carla')
    expect(carla.cur.visitors).toBe(55)
    expect(carla.sub).toBe('2 lien(s)')
    expect(data.networks.map((r) => r.label).sort()).toEqual(['Instagram', 'Snapchat', 'X'])
  })

  it('courbe : un point par jour relevé dans la période, dans l’ordre', () => {
    expect(data.daily).toEqual([
      { date: '2026-09-20', visitors: 70, mymClicks: 44 },
      { date: '2026-09-21', visitors: 25, mymClicks: 0 },
    ])
    expect(data.lastDate).toBe('2026-09-21')
  })

  it('sans période précédente : évolution « — », aucun signal de chute', () => {
    const fresh = buildTrafic({
      period,
      creators,
      accounts,
      links: [link({ id: 'n', platform: 'x', operator: 'NEW' })],
      daily: [day('n', '2026-09-20', 50, 20)],
    })
    expect(fresh.links[0]!.deltaPct).toBeNull()
    expect(fresh.links[0]!.flags).toEqual([])
  })

  it('porte de quoi corriger une ligne de lien, jamais un regroupement', () => {
    expect(data.links.find((r) => r.key === 'ig')!.edit).toEqual({
      linkId: 'ig',
      creatorId: 'c-julie',
      platform: 'instagram',
      socialAccountId: 'a-tardif',
      operator: null,
      manual: false,
    })
    expect(data.models.every((r) => r.edit === null)).toBe(true)
  })
})
```

**Règle de référence (à respecter dans l'implémentation)** : le signal « peu de clics MYM » d'une
ligne de lien se compare au taux de **son réseau s'il compte au moins 2 liens à boutons**, sinon au
taux global. Un réseau d'un seul lien ne peut pas se comparer à lui-même. Un regroupement (modèle,
réseau) se compare au taux global.

Valeurs attendues du jeu de test, pour relire les assertions :
- **Totaux de la période** : 30 + 40 + 25 = 95 visiteurs, 20 bots, 40 + 4 = 44 clics MYM, sur
  30 + 40 = 70 visiteurs à boutons (`snap` est une redirection). Taux global = 44/70 ≈ 0,63.
- **`ara`** passe de 80 à 30 visiteurs. 30 < 40 avec 80 ≥ 30 : **chute**. Son taux (40/30 ≈ 1,33)
  est au-dessus de 0,31 (la moitié de la référence), donc pas de clic faible. Pas de bots.
- **`ig`** : seul lien Instagram, donc référence globale 0,63. Taux 4/40 = 0,1 < 0,31, avec
  40 visiteurs à boutons : **clic faible**. Bots : 20/(40+20) = 33 % sur 60 visites : **bots**.
  Pas de chute, car la période précédente n'avait que 10 visiteurs.
- **`snap`** : redirection (taux nul), 0 bot, pas de période précédente : aucun signal.
- **Tri** : les signalées d'abord (`ig` 40, puis `ara` 30), puis `snap`.

- [ ] **Step 3 : vérifier l'échec**

Run : `pnpm --filter @glagency/web exec vitest run src/features/marketing-trafic/aggregate.test.ts`
Expected : FAIL (module `./aggregate` introuvable).

- [ ] **Step 4 : implémenter**

`apps/web/src/features/marketing-trafic/aggregate.ts` :

```ts
import {
  LS_PLATFORM_LABEL,
  addDaily,
  botShare,
  clickRate,
  emptyTotals,
  sumTotals,
  trafficFlags,
  type LsPlatform,
  type LsTotals,
} from '@glagency/core'
import type { TraficData, TraficDay, TraficRow } from './types'

export interface TraficLinkInput {
  id: string
  url: string
  note: string
  creator_id: string | null
  platform: string
  social_account_id: string | null
  operator: string | null
  manual: boolean
}

export interface TraficDailyInput {
  link_id: string
  date: string
  visitors: number
  bots: number
  mym_clicks: number | null
}

export interface TraficInput {
  /** Bornes incluses ; toute ligne AVANT `from` appartient à la période précédente. */
  period: { from: string; to: string; label: string }
  links: TraficLinkInput[]
  daily: TraficDailyInput[]
  creators: { id: string; name: string }[]
  accounts: { id: string; handle: string }[]
}

const deltaPct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null)

/** Lignes signalées d'abord, puis par visiteurs. */
const byAttention = (a: TraficRow, b: TraficRow) =>
  Number(b.flags.length > 0) - Number(a.flags.length > 0) || b.cur.visitors - a.cur.visitors

function finish(base: Omit<TraficRow, 'rate' | 'botShare' | 'deltaPct' | 'flags'>, referenceRate: number | null): TraficRow {
  return {
    ...base,
    rate: clickRate(base.cur),
    botShare: botShare(base.cur),
    deltaPct: deltaPct(base.cur.visitors, base.prev.visitors),
    flags: trafficFlags(base.cur, base.prev, referenceRate),
  }
}

/**
 * Le trafic de la période et de la précédente, par lien (profil), modèle et réseau. Référence du
 * signal « peu de clics MYM » : pour un lien, le taux de SON réseau s'il compte au moins deux liens
 * à boutons (un réseau d'un seul lien ne se compare pas à lui-même), sinon le taux global ; pour un
 * regroupement, le taux global.
 */
export function buildTrafic(input: TraficInput): TraficData {
  const { period } = input
  const crName = new Map(input.creators.map((c) => [c.id, c.name]))
  const handle = new Map(input.accounts.map((a) => [a.id, a.handle]))
  const cur = new Map<string, LsTotals>()
  const prev = new Map<string, LsTotals>()
  const days = new Map<string, TraficDay>()
  let lastDate: string | null = null

  for (const d of input.daily) {
    const inPeriod = d.date >= period.from && d.date <= period.to
    const target = inPeriod ? cur : prev
    target.set(d.link_id, addDaily(target.get(d.link_id) ?? emptyTotals(), { visitors: d.visitors, bots: d.bots, mymClicks: d.mym_clicks }))
    if (inPeriod) {
      const p = days.get(d.date) ?? { date: d.date, visitors: 0, mymClicks: 0 }
      p.visitors += d.visitors
      p.mymClicks += d.mym_clicks ?? 0
      days.set(d.date, p)
      if (!lastDate || d.date > lastDate) lastDate = d.date
    }
  }

  const active = input.links.filter((l) => cur.has(l.id) || prev.has(l.id))
  const curOf = (id: string) => cur.get(id) ?? emptyTotals()
  const prevOf = (id: string) => prev.get(id) ?? emptyTotals()
  const totals = { cur: sumTotals(active.map((l) => curOf(l.id))), prev: sumTotals(active.map((l) => prevOf(l.id))) }
  const globalRate = clickRate(totals.cur)

  const networkRate = new Map<string, number | null>()
  for (const p of new Set(active.map((l) => l.platform))) {
    const withButtons = active.filter((l) => l.platform === p && curOf(l.id).mymClicks != null)
    networkRate.set(p, withButtons.length >= 2 ? clickRate(sumTotals(withButtons.map((l) => curOf(l.id)))) : globalRate)
  }

  const links = active
    .map((l) =>
      finish(
        {
          key: l.id,
          label: (l.social_account_id && handle.has(l.social_account_id) ? `@${handle.get(l.social_account_id)}` : null) ?? l.operator ?? (l.note || l.url),
          sub: l.url,
          creatorName: l.creator_id ? (crName.get(l.creator_id) ?? null) : null,
          platform: l.platform as LsPlatform,
          cur: curOf(l.id),
          prev: prevOf(l.id),
          edit: {
            linkId: l.id,
            creatorId: l.creator_id,
            platform: l.platform as LsPlatform,
            socialAccountId: l.social_account_id,
            operator: l.operator,
            manual: l.manual,
          },
        },
        networkRate.get(l.platform) ?? globalRate,
      ),
    )
    .sort(byAttention)

  const group = (keyOf: (l: TraficLinkInput) => string, labelOf: (k: string) => string, platformOf: (k: string) => LsPlatform | null) => {
    const groups = new Map<string, TraficLinkInput[]>()
    for (const l of active) groups.set(keyOf(l), [...(groups.get(keyOf(l)) ?? []), l])
    return [...groups]
      .map(([k, ls]) =>
        finish(
          {
            key: k,
            label: labelOf(k),
            sub: `${ls.length} lien(s)`,
            creatorName: null,
            platform: platformOf(k),
            cur: sumTotals(ls.map((l) => curOf(l.id))),
            prev: sumTotals(ls.map((l) => prevOf(l.id))),
            edit: null,
          },
          globalRate,
        ),
      )
      .sort(byAttention)
  }

  return {
    periodLabel: period.label,
    to: period.to,
    totals,
    daily: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    links,
    models: group(
      (l) => l.creator_id ?? 'none',
      (k) => (k === 'none' ? 'Non attribuée' : (crName.get(k) ?? 'Modèle inconnue')),
      () => null,
    ),
    networks: group(
      (l) => l.platform,
      (k) => LS_PLATFORM_LABEL[k as LsPlatform] ?? k,
      (k) => k as LsPlatform,
    ),
    creators: [...input.creators].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    accounts: [...input.accounts].sort((a, b) => a.handle.localeCompare(b.handle, 'fr')),
    lastDate,
  }
}
```

- [ ] **Step 5 : vérifier**

Run : `pnpm --filter @glagency/web exec vitest run src/features/marketing-trafic/aggregate.test.ts`
Expected : PASS. En cas d'échec sur `flags`, recalculer à la main d'après la « Décision » du
Step 2. Ne pas affaiblir le test.

- [ ] **Step 6 : point de commit (uniquement si Benoit dit « commit »)**

```bash
git add -- apps/web/src/features/marketing-trafic/types.ts apps/web/src/features/marketing-trafic/aggregate.ts apps/web/src/features/marketing-trafic/aggregate.test.ts
git commit -m "feat(marketing-trafic): agrégation par profil, modèle et réseau"
```

---

### Task 8 : service, page, template, vue et graphique

**Files :**
- Create : `apps/web/src/features/marketing-trafic/services/get-trafic.ts`
- Create : `apps/web/src/features/marketing-trafic/TraficTemplate.tsx`
- Create : `apps/web/src/features/marketing-trafic/components/trafic-view.tsx`
- Create : `apps/web/src/features/marketing-trafic/components/trafic-chart.client.tsx`
- Create : `apps/web/src/features/marketing-trafic/components/trafic-skeleton.tsx`
- Create : `apps/web/src/app/(dash)/marketing/trafic/page.tsx`
- Create : `apps/web/src/app/(dash)/marketing/trafic/loading.tsx`

**Interfaces :**
- Consumes : `buildTrafic`, `TraficData` (Task 7) ; `requireAccess`, `hasWriteAccess`
  (`@/lib/auth`) ; `resolvePeriod`, `Period` (`@/lib/period`) ; slug `mkt-trafic` (Task 6).
- Produces : `getTrafic(period: Period) → Promise<TraficData>` ;
  `<TraficView data canEdit />`. Le composant `EditAttributionDialog` (Task 9) sera branché
  dans la colonne `edit`.

- [ ] **Step 1 : le service**

`apps/web/src/features/marketing-trafic/services/get-trafic.ts` :

```ts
import { addDays, daysBetween } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Period } from '@/lib/period'
import { buildTrafic } from '../aggregate'
import type { TraficData } from '../types'

/**
 * Trafic LinkScale de la période ET de la précédente, de même durée (évolution et signaux
 * « À regarder ») : une seule lecture de `mkt_ls_daily`, découpée par `buildTrafic`.
 */
export async function getTrafic(period: Period): Promise<TraficData> {
  const supabase = await createClient()
  const prevFrom = addDays(period.from, -(daysBetween(period.from, period.to) + 1))
  const [linksRes, creatorsRes, accountsRes, dailyRes] = await Promise.all([
    fetchAll((f, t) =>
      supabase
        .from('mkt_ls_links')
        .select('id, url, note, creator_id, platform, social_account_id, operator, manual')
        .order('id')
        .range(f, t),
    ),
    supabase.from('creators').select('id, name'),
    supabase.from('mkt_social_accounts').select('id, handle').eq('platform', 'instagram'),
    fetchAll((f, t) =>
      supabase
        .from('mkt_ls_daily')
        .select('link_id, date, visitors, bots, mym_clicks')
        .gte('date', prevFrom)
        .lte('date', period.to)
        .order('link_id')
        .order('date')
        .range(f, t),
    ),
  ])
  if (linksRes.error) throw new Error(linksRes.error.message)
  if (creatorsRes.error) throw new Error(creatorsRes.error.message)
  if (accountsRes.error) throw new Error(accountsRes.error.message)
  if (dailyRes.error) throw new Error(dailyRes.error.message)
  return buildTrafic({
    period,
    links: linksRes.data ?? [],
    daily: dailyRes.data ?? [],
    creators: creatorsRes.data ?? [],
    accounts: accountsRes.data ?? [],
  })
}
```

- [ ] **Step 2 : le graphique**

`apps/web/src/features/marketing-trafic/components/trafic-chart.client.tsx` :

```tsx
'use client'

import { frDayMonthShort } from '@glagency/core'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { TraficDay } from '../types'

// Mêmes teintes que la page Liens du marketing (violet / cyan).
const config = {
  visitors: { label: 'Visiteurs', color: '#8b5cf6' },
  mymClicks: { label: 'Clics MYM', color: '#06b6d4' },
} satisfies ChartConfig

/** Par jour, deux barres côte à côte : les visiteurs et les clics vers MYM (même unité, même axe). */
export function TraficChart({ days }: { days: TraficDay[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <BarChart data={days} barCategoryGap="20%" barGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(v: string) => frDayMonthShort(v)}
        />
        <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(v) => frDayMonthShort(String(v))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="visitors" fill="var(--color-visitors)" radius={[3, 3, 0, 0]} maxBarSize={24} />
        <Bar dataKey="mymClicks" fill="var(--color-mymClicks)" radius={[3, 3, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ChartContainer>
  )
}
```

- [ ] **Step 3 : la vue**

`apps/web/src/features/marketing-trafic/components/trafic-view.tsx` :

```tsx
'use client'

import { useState, type ReactNode } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { LS_FLAG_LABEL, LS_PLATFORM_LABEL, addDays, botShare, clickRate, frDateNumeric } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { num } from '@/lib/format'
import { todayLocal } from '@/lib/dates-client'
import { TraficChart } from './trafic-chart.client'
import type { TraficData, TraficRow, TraficTab } from '../types'

const rate2 = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)} %`)
const signedPct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v)} %`)

function kpi(
  key: string,
  label: string,
  cur: number | null,
  prev: number | null,
  fmt: (n: number) => string,
  info: string,
  withDelta = true,
): Kpi {
  return {
    key,
    label,
    value: cur == null ? '—' : fmt(cur),
    deltaPct: withDelta && cur != null && prev ? Math.round(((cur - prev) / prev) * 100) : null,
    trendLabel: 'vs période précédente',
    hint: `période précédente : ${prev == null ? '—' : fmt(prev)}`,
    info,
  }
}

/** Colonne chiffrée triable, alignée à droite. */
function numCol(id: string, label: string, value: (r: TraficRow) => number, show: (r: TraficRow) => string): ColumnDef<TraficRow> {
  return {
    id,
    accessorFn: value,
    header: ({ column }) => <Sortable column={column} label={label} className="justify-end" />,
    cell: ({ row }) => <span className="tabular-nums">{show(row.original)}</span>,
    meta: { align: 'right' },
  }
}

export function makeColumns(tab: TraficTab, edit: ((r: TraficRow) => ReactNode) | null): ColumnDef<TraficRow>[] {
  const cols: ColumnDef<TraficRow>[] = [
    {
      accessorKey: 'label',
      header: tab === 'profils' ? 'Profil' : tab === 'modeles' ? 'Modèle' : 'Réseau',
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-medium">{row.original.label}</span>
          {row.original.sub && <span className="block truncate text-xs text-muted-foreground">{row.original.sub}</span>}
        </div>
      ),
    },
  ]
  if (tab === 'profils') {
    cols.push(
      {
        id: 'modele',
        accessorFn: (r) => r.creatorName ?? '',
        header: ({ column }) => <Sortable column={column} label="Modèle" />,
        cell: ({ row }) => row.original.creatorName ?? <span className="text-muted-foreground">Non attribuée</span>,
      },
      {
        id: 'reseau',
        accessorFn: (r) => (r.platform ? LS_PLATFORM_LABEL[r.platform] : ''),
        header: 'Réseau',
      },
    )
  }
  cols.push(
    numCol('visitors', 'Visiteurs', (r) => r.cur.visitors, (r) => num(r.cur.visitors)),
    numCol('delta', 'Évol.', (r) => r.deltaPct ?? Number.NEGATIVE_INFINITY, (r) => signedPct(r.deltaPct)),
    numCol('mym', 'Clics MYM', (r) => r.cur.mymClicks ?? -1, (r) => (r.cur.mymClicks == null ? '—' : num(r.cur.mymClicks))),
    numCol('rate', 'Clics / visiteur', (r) => r.rate ?? -1, (r) => rate2(r.rate)),
    numCol('bots', '% bots', (r) => r.botShare ?? -1, (r) => pct(r.botShare)),
    {
      id: 'flags',
      header: 'À regarder',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.flags.map((f) => (
            <Badge key={f} variant="outline">
              {LS_FLAG_LABEL[f]}
            </Badge>
          ))}
        </div>
      ),
    },
  )
  if (edit) cols.push({ id: 'edit', header: '', cell: ({ row }) => edit(row.original) })
  return cols
}

export function TraficView({
  data,
  editCell = null,
}: {
  data: TraficData
  /** Rendu de la colonne de correction (onglet Profils) ; null = lecture seule. */
  editCell?: ((r: TraficRow) => ReactNode) | null
}) {
  const [tab, setTab] = useState<TraficTab>('profils')
  const rows = tab === 'profils' ? data.links : tab === 'modeles' ? data.models : data.networks
  const { cur, prev } = data.totals
  const kpis: Kpi[] = [
    kpi('visitors', 'Visiteurs', cur.visitors, prev.visitors, num, 'Visiteurs humains uniques par jour, additionnés, bots exclus (LinkScale).'),
    kpi('mym', 'Clics MYM', cur.mymClicks, prev.mymClicks, num, 'Clics sur les boutons qui mènent à mym.fans, sur les pages LinkScale à boutons.'),
    kpi(
      'rate',
      'Clics MYM par visiteur',
      clickRate(cur),
      clickRate(prev),
      (n) => rate2(n),
      'Clics MYM ÷ visiteurs des pages à boutons (redirections exclues). Peut dépasser 1 : un visiteur clique parfois deux fois.',
    ),
    kpi('bots', 'Part de bots', botShare(cur), botShare(prev), (n) => pct(n), 'Bots filtrés par LinkScale ÷ toutes les visites.', false),
  ]
  // Le relevé de 23h05 UTC écrit J-2 et J-1 (Paris) : au-delà de J-2, une nuit a sauté.
  const expected = addDays(todayLocal(), -2)
  const late = data.lastDate != null && data.to >= expected && data.lastDate < expected

  return (
    <>
      <KpiGrid kpis={kpis} />

      {data.lastDate == null ? (
        <p className="text-sm text-muted-foreground">Aucun relevé LinkScale sur la période.</p>
      ) : (
        late && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            Dernier relevé LinkScale : {frDateNumeric(data.lastDate)} — le relevé tourne chaque nuit ; un retard signale
            un souci (clé API LinkScale).
          </p>
        )
      )}

      {data.daily.length > 0 && <TraficChart days={data.daily} />}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TraficTab)}>
        <TabsList>
          <TabsTrigger value="profils">Profils</TabsTrigger>
          <TabsTrigger value="modeles">Modèles</TabsTrigger>
          <TabsTrigger value="reseaux">Réseaux</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable
        key={tab}
        data={rows}
        columns={makeColumns(tab, tab === 'profils' ? editCell : null)}
        filterColumnId="label"
        filterPlaceholder="Filtrer…"
        pageSize={20}
        getRowId={(r) => r.key}
        countLabel={(n) => `${n} ligne(s)`}
      />
    </>
  )
}
```

Note : `editCell` est une fonction. Elle ne peut pas traverser la frontière serveur → client en
prop. La Task 9 crée donc un petit composant client `TraficViewEditable` qui la fabrique. Dans
cette Task 8, le template rend `<TraficView data={data} />` en lecture seule.

- [ ] **Step 4 : squelette, template, page, loading**

`apps/web/src/features/marketing-trafic/components/trafic-skeleton.tsx` :

```tsx
import { Skeleton } from '@/components/ui/skeleton'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

/** Silhouette de Marketing › Trafic (KPIs, courbe, onglets, table) — partagée par loading.tsx et le Suspense. */
export function TraficSkeleton() {
  return (
    <>
      <KpiSkeleton />
      <Skeleton className="h-[260px] w-full" />
      <Skeleton className="h-9 w-64" />
      <TableSkeleton rows={8} />
    </>
  )
}
```

`apps/web/src/features/marketing-trafic/TraficTemplate.tsx` :

```tsx
import { num } from '@/lib/format'
import { TraficView } from './components/trafic-view'
import type { TraficData } from './types'

export function TraficTemplate({ data }: { data: TraficData; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {data.periodLabel} · {data.links.length} lien(s) LinkScale avec du trafic · {num(data.totals.cur.visitors)} visiteurs
      </p>
      <TraficView data={data} />
    </div>
  )
}
```

`apps/web/src/app/(dash)/marketing/trafic/page.tsx` :

```tsx
import { Suspense } from 'react'
import { getTrafic } from '@/features/marketing-trafic/services/get-trafic'
import { TraficTemplate } from '@/features/marketing-trafic/TraficTemplate'
import { TraficSkeleton } from '@/features/marketing-trafic/components/trafic-skeleton'
import { hasWriteAccess, requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { TraficData } from '@/features/marketing-trafic/types'

export default async function MktTraficPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const profile = await requireAccess('mkt-trafic')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await : le h1 s'affiche tout de suite, le reste streame dans sa boundary.
  const data = getTrafic(period)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Trafic</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <TraficSkeleton />
          </SectionFallback>
        }
      >
        <TraficContent data={data} canEdit={hasWriteAccess(profile, 'mkt-trafic')} />
      </Suspense>
    </div>
  )
}

async function TraficContent({ data, canEdit }: { data: Promise<TraficData>; canEdit: boolean }) {
  return <TraficTemplate data={await data} canEdit={canEdit} />
}
```

`apps/web/src/app/(dash)/marketing/trafic/loading.tsx` :

```tsx
import { RouteLoading } from '@/components/skeletons/route-loading'
import { TraficSkeleton } from '@/features/marketing-trafic/components/trafic-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-7 w-24">
      <TraficSkeleton />
    </RouteLoading>
  )
}
```

- [ ] **Step 5 : vérifier**

Run : `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint`
Expected : aucune erreur. Si `meta: { align: 'right' }` est refusé, reprendre exactement la
déclaration utilisée dans `social-view.tsx`.

Run : `pnpm --filter @glagency/web dev:uat`, puis ouvrir `http://localhost:3000/marketing/trafic`
avec un compte admin, sur une période qui couvre le 28-29/09 (données UAT de la Task 4).
Expected :
- les KPIs (visiteurs, clics MYM, clics par visiteur, part de bots) ;
- la courbe, avec deux jours ;
- l'onglet Profils avec des lignes du type « ARA · Carla » et des badges « À regarder » quand ils
  s'appliquent ;
- les onglets Modèles et Réseaux qui regroupent ;
- sur une période sans données, le texte « Aucun relevé LinkScale sur la période. ».

- [ ] **Step 6 : point de commit (uniquement si Benoit dit « commit »)**

```bash
git add -- apps/web/src/features/marketing-trafic apps/web/src/app/\(dash\)/marketing/trafic
git commit -m "feat(marketing-trafic): page Marketing › Trafic (KPIs, courbe, profils, modèles, réseaux)"
```

---

### Task 9 : correction de l'attribution d'un lien

**Files :**
- Create : `apps/web/src/features/marketing-trafic/actions.ts`
- Create : `apps/web/src/features/marketing-trafic/components/edit-attribution-dialog.client.tsx`
- Create : `apps/web/src/features/marketing-trafic/components/trafic-view-editable.client.tsx`
- Modify : `apps/web/src/features/marketing-trafic/TraficTemplate.tsx`

**Interfaces :**
- Consumes : `TraficEdit`, `TraficRow`, `TraficData` (Task 7) ; `TraficView` (Task 8) ;
  `LS_PLATFORMS`, `LS_PLATFORM_LABEL` (core) ; `runAction`, `managerPageGuard`,
  `BusinessError`, `ActionResult` (`@/lib/actions`).
- Produces :
  - `updateLsAttribution(raw: unknown) → Promise<ActionResult>` ;
  - `<EditAttributionDialog edit label creators accounts />` ;
  - `<TraficViewEditable data />`.

- [ ] **Step 1 : la Server Action**

`apps/web/src/features/marketing-trafic/actions.ts` :

```ts
'use server'

// Correction de l'attribution d'un lien LinkScale (Marketing › Trafic). `manual = true` fige la
// ligne : le relevé nocturne ne la recalcule plus (spec 2026-09-30-trafic-linkscale-design.md).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { LS_PLATFORMS } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { runAction, managerPageGuard, BusinessError, type ActionResult } from '@/lib/actions'

const attributionSchema = z.object({
  linkId: z.string().uuid(),
  creatorId: z.string().uuid().nullable(),
  platform: z.enum(LS_PLATFORMS),
  socialAccountId: z.string().uuid().nullable(),
  operator: z.string().trim().max(40).nullable(),
})

export async function updateLsAttribution(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: attributionSchema,
    input: raw,
    guard: managerPageGuard('mkt-trafic'),
    handler: async (v) => {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('mkt_ls_links')
        .update({
          creator_id: v.creatorId,
          platform: v.platform,
          // Un compte n'a de sens que pour Instagram, un opérateur que pour X.
          social_account_id: v.platform === 'instagram' ? v.socialAccountId : null,
          operator: v.platform === 'x' && v.operator ? v.operator.toUpperCase() : null,
          manual: true,
        })
        .eq('id', v.linkId)
        .select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new BusinessError('Lien introuvable, ou modification non autorisée.')
      revalidatePath('/marketing/trafic')
    },
  })
}
```

- [ ] **Step 2 : la fenêtre**

`apps/web/src/features/marketing-trafic/components/edit-attribution-dialog.client.tsx` :

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { LS_PLATFORMS, LS_PLATFORM_LABEL, type LsPlatform } from '@glagency/core'
import { Button } from '@/components/ui/button'
import { ActionButton } from '@/components/action-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateLsAttribution } from '../actions'
import type { TraficEdit } from '../types'

const NONE = 'none'

/**
 * Le crayon d'une ligne de lien : modèle, réseau, et compte Instagram ou opérateur X. Même modèle
 * de fenêtre que `edit-x-handle-dialog.client.tsx`. Enregistrer fige la ligne (`manual`).
 */
export function EditAttributionDialog({
  edit,
  label,
  creators,
  accounts,
}: {
  edit: TraficEdit
  label: string
  creators: { id: string; name: string }[]
  accounts: { id: string; handle: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [creatorId, setCreatorId] = useState(edit.creatorId ?? NONE)
  const [platform, setPlatform] = useState<LsPlatform>(edit.platform)
  const [accountId, setAccountId] = useState(edit.socialAccountId ?? NONE)
  const [operator, setOperator] = useState(edit.operator ?? '')
  const [pending, start] = useTransition()
  const id = `ls-${edit.linkId}`

  const reset = () => {
    setCreatorId(edit.creatorId ?? NONE)
    setPlatform(edit.platform)
    setAccountId(edit.socialAccountId ?? NONE)
    setOperator(edit.operator ?? '')
  }

  const save = () =>
    start(async () => {
      const res = await updateLsAttribution({
        linkId: edit.linkId,
        creatorId: creatorId === NONE ? null : creatorId,
        platform,
        socialAccountId: platform === 'instagram' && accountId !== NONE ? accountId : null,
        operator: platform === 'x' && operator.trim() ? operator.trim() : null,
      })
      if (!res.success) return void toast.error(res.error)
      toast.success('Attribution enregistrée : le relevé ne la recalculera plus.')
      setOpen(false)
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return
        if (o) reset()
        setOpen(o)
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          aria-label={`Corriger l’attribution de ${label}`}
          title="Corriger l’attribution"
        >
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <DialogHeader>
            <DialogTitle>Corriger l’attribution</DialogTitle>
            <DialogDescription>
              {label} — {edit.manual ? 'déjà corrigé à la main' : 'attribué automatiquement'}. Une fois enregistré, le
              relevé nocturne ne touche plus à ce lien.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-modele`}>Modèle</Label>
            <Select value={creatorId} onValueChange={setCreatorId} disabled={pending}>
              <SelectTrigger id={`${id}-modele`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Non attribuée</SelectItem>
                {creators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-reseau`}>Réseau</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as LsPlatform)} disabled={pending}>
              <SelectTrigger id={`${id}-reseau`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LS_PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {LS_PLATFORM_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {platform === 'instagram' && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-compte`}>Compte Instagram</Label>
              <Select value={accountId} onValueChange={setAccountId} disabled={pending}>
                <SelectTrigger id={`${id}-compte`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Aucun</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      @{a.handle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {platform === 'x' && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-operateur`}>Opérateur X</Label>
              <Input
                id={`${id}-operateur`}
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                disabled={pending}
                autoComplete="off"
                maxLength={40}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <ActionButton type="submit" pending={pending}>
              Enregistrer
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3 : la vue éditable et le template**

`apps/web/src/features/marketing-trafic/components/trafic-view-editable.client.tsx` :

```tsx
'use client'

import { TraficView } from './trafic-view'
import { EditAttributionDialog } from './edit-attribution-dialog.client'
import type { TraficData } from '../types'

/** La vue avec le crayon de correction : la fonction de cellule naît côté client (non sérialisable). */
export function TraficViewEditable({ data }: { data: TraficData }) {
  return (
    <TraficView
      data={data}
      editCell={(r) =>
        r.edit && (
          <EditAttributionDialog edit={r.edit} label={r.label} creators={data.creators} accounts={data.accounts} />
        )
      }
    />
  )
}
```

`apps/web/src/features/marketing-trafic/TraficTemplate.tsx`, remplacer tout le fichier :

```tsx
import { num } from '@/lib/format'
import { TraficView } from './components/trafic-view'
import { TraficViewEditable } from './components/trafic-view-editable.client'
import type { TraficData } from './types'

export function TraficTemplate({ data, canEdit }: { data: TraficData; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {data.periodLabel} · {data.links.length} lien(s) LinkScale avec du trafic · {num(data.totals.cur.visitors)} visiteurs
      </p>
      {canEdit ? <TraficViewEditable data={data} /> : <TraficView data={data} />}
    </div>
  )
}
```

- [ ] **Step 4 : vérifier**

Run : `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint`
Expected : aucune erreur.

Sur `dev:uat` (admin), sur `/marketing/trafic` :
1. Onglet Profils, crayon d'un lien X : passer la modèle à une autre et l'opérateur à `test`,
   puis Enregistrer. Expected : toast de succès, et la ligne affiche la nouvelle modèle.
2. Relancer `pnpm linkscale 2026-09-28 2026-09-29` sur l'UAT (accord déjà donné en Task 4 pour
   ces deux jours ; sinon redemander). Expected : la ligne garde la correction.
3. Remettre la vraie attribution à la main (le lien reste `manual`, c'est voulu).

Contrôle en base UAT :
`psql "$UAT" -At -c "select ls_id, operator, manual from mkt_ls_links where manual"`

- [ ] **Step 5 : point de commit (uniquement si Benoit dit « commit »)**

```bash
git add -- apps/web/src/features/marketing-trafic/actions.ts apps/web/src/features/marketing-trafic/components/edit-attribution-dialog.client.tsx apps/web/src/features/marketing-trafic/components/trafic-view-editable.client.tsx apps/web/src/features/marketing-trafic/TraficTemplate.tsx
git commit -m "feat(marketing-trafic): correction de l'attribution d'un lien LinkScale"
```

---

### Task 10 : docs de la PR 2 + vérifications finales

**Files :**
- Modify : `docs/CARTE.md` (tableau des features, après la ligne `marketing-staff`)
- Modify : `CHANGELOG.md` (« Non publié »)
- Modify : `ARCHITECTURE.md` (§ Trafic LinkScale : une phrase sur la page)

- [ ] **Step 1 : docs**

`docs/CARTE.md`, après la ligne `| marketing-staff | … |` :

```
| marketing-trafic | Trafic des liens LinkScale par profil, modèle et réseau, avec les signaux « À regarder » et la correction d'attribution d'un lien | `/marketing/trafic` (`TraficTemplate`) | `apps/web/src/features/marketing-trafic/` | tables `creators`, `mkt_ls_daily`, `mkt_ls_links`, `mkt_social_accounts` | `docs/superpowers/specs/2026-09-30-trafic-linkscale-design.md` · `ARCHITECTURE.md` § Domaines — Trafic LinkScale |
```

`CHANGELOG.md`, sous `## Non publié` → `### Ajouté` :

```markdown
- Marketing › Trafic : visiteurs, clics vers MYM, clics par visiteur et part de bots par profil, modèle et réseau, comparés à la période précédente, avec une colonne « À regarder » (trafic en chute, lien éteint, peu de clics MYM, beaucoup de bots) et la correction de l'attribution d'un lien.
```

`ARCHITECTURE.md`, à la fin du paragraphe « Trafic LinkScale » :

```markdown
Page **Marketing › Trafic** (`/marketing/trafic`, droit `mkt-trafic`) : période et période
précédente de même durée ; signaux « À regarder » calculés par `trafficFlags` (core) — le taux de
référence d'un lien est celui de son réseau s'il compte au moins deux liens à boutons, sinon le
taux global.
```

- [ ] **Step 2 : vérifications complètes**

```bash
pnpm --filter @glagency/core test
pnpm --filter @glagency/web test
pnpm -r typecheck
pnpm --filter @glagency/web lint
pnpm --filter @glagency/web build
pnpm check:carte
```

Expected : tout vert. Le build doit lister la route `/marketing/trafic`.

- [ ] **Step 3 : point de commit (uniquement si Benoit dit « commit »)**

```bash
git add -- docs/CARTE.md CHANGELOG.md ARCHITECTURE.md
git commit -m "docs(marketing-trafic): carte, changelog et architecture de la page Trafic"
```

Ouvrir la PR 2 → `develop` **seulement sur accord de Benoit**.

---

## Après les deux PR (hors plan, chaque étape sur accord explicite)

1. Appliquer `0179` en prod (`db push --db-url` prod, via le pooler) et mettre à jour la ligne
   « État au … » de `AGENTS.md` § Migrations.
2. Lancer `wrangler secret put LINKSCALE_API_KEY`, puis `wrangler deploy` du Worker d'ingestion
   (avec `CLOUDFLARE_API_TOKEN`).
3. Remplir la prod : `pnpm --filter @glagency/ingestion linkscale 2026-05-01 <J-1>`.
4. Déclencher `?job=linkscale` une fois pour vérifier le budget CPU du Worker (10 ms sur l'offre
   Free). Si l'invocation dépasse, sortir la lecture de la liste des liens dans un fan-out à part.
5. Release : `pnpm release:prepare` → PR `develop` → `main` → `pnpm release:tag`
   (`docs/git-workflow.md`).
