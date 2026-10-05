# Photos des modèles (partie A) — plan d'implémentation

> **Mise à jour 2026-10-02 (décision Benoit, après exécution des tâches 1 à 4)** : les photos prennent **`0180`** (appliquée sur l'UAT le 2026-10-02), la partie B (Agence) **`0181`**, et la suppression de la to-do **`0182`**, en dernier (elle reste dans `packages/db/supabase/pending/`). Le chantier « identité chatteur MyPuls » prendra le numéro libre suivant. L'étape 5 n'attend plus aucune autre migration.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** récupérer une fois la photo de chaque modèle depuis MyPuls et la stocker (bucket privé
+ `creators.avatar_path`), pour qu'Agence puisse l'afficher par défaut (partie B, plan séparé).

**Architecture :**
- Les règles pures vivent dans `@glagency/core` (`media/avatar.ts`) et sont testées : type d'image
  lu sur les octets, lecture de la réponse MyPuls, choix des modèles à traiter.
- Un script local `pnpm --filter @glagency/ingestion avatars` réutilise la session MyPuls stockée
  en base. Il range chaque photo dans le bucket privé `creator-avatars` et renseigne
  `creators.avatar_path`.
- Pas de cron.

**Tech Stack :** TypeScript, Vitest 3, Supabase (Postgres + Storage), tsx (scripts d'ingestion).

**Spec :** `docs/superpowers/specs/2026-10-02-photos-modeles-agence-design.md` (partie A)

## Global Constraints

- Tout est en français : commentaires, messages, logs.
- Migrations : séquence **contiguë** alignée sur `schema_migrations`.
  - Les photos prennent **`0181`** et la suppression de la to-do passe en **`0182`** (Task 1).
  - `0180` est réservée par le chantier « identité chatteur MyPuls » (session parallèle).
  - Colonnes `text`, **jamais** `create type … enum`.
- Bucket `creator-avatars` **privé**, 1 Mo maximum, `image/jpeg`, `image/png` et `image/webp`
  seulement. Aucune policy sur `storage.objects` (même patron que `agency-events`, 0176).
- Le type d'image se lit **sur les octets**, jamais sur l'en-tête HTTP : MyPuls annonce
  `image/jpeg` pour du WebP 100 × 100.
- La session vient de `loadCookie()`, **sans** renouvellement (le run de nuit s'en charge).
- **Pas de cron** : récupération unique, relancée à la main quand une nouvelle modèle arrive.
- **Pas de commit sans le mot « commit » de Benoit.** Ensuite `git add -- <chemins explicites>`,
  car d'autres sessions travaillent dans le même arbre.
- **Accord explicite de Benoit pour chacune de ces étapes** : appliquer une migration sur l'UAT
  ou en prod, lancer le script sur une base distante. Le garde-fou de Claude Code bloque souvent
  ces commandes : dans ce cas, donner la commande toute prête à lancer avec `!`.

## Review Focus

1. **Session MyPuls expirée** (redirection vers `/login`) : arrêt net, avec un message clair. Une
   photo de la page de connexion ne doit jamais être stockée. Testé en Task 2 (`avatarOutcome`).
2. **Réponse 200 qui n'est pas une image** (page HTML d'erreur), ou modèle sans photo (404) : la
   modèle est signalée et sautée, les autres continuent. Testé en Task 2.
3. **En-tête menteur** (`image/jpeg` pour du WebP) : type et extension viennent des octets.
   Testé en Task 2.
4. **Relance** : seules les modèles sans photo sont reprises, et toutes avec `--force`. Une modèle
   sans id MyPuls est ignorée. Testé en Task 2 (`avatarTargets`).
5. **Image de plus de 1 Mo** : refusée avant l'envoi, avec la raison. Le bucket la refuserait de
   toute façon. Testé en Task 2.

---

### Task 1 : renuméroter la suppression de la to-do (`0181` → `0182`)

**Files :**
- Rename : `packages/db/supabase/migrations/0181_drop_todos.sql` → `0182_drop_todos.sql`
  (fichier non suivi par git, simple `mv`)
- Modify : ce même fichier (en-tête) et `ARCHITECTURE.md` (§ To-do personnelle — supprimée)

**Interfaces :** libère le numéro `0181` pour la Task 3.

- [ ] **Step 1 : renommer et corriger les références**

```bash
cd /Users/benoitgasnier/Documents/glagencyapp
git ls-files --error-unmatch packages/db/supabase/migrations/0181_drop_todos.sql 2>/dev/null && echo "SUIVI : s'arrêter" || mv packages/db/supabase/migrations/0181_drop_todos.sql packages/db/supabase/migrations/0182_drop_todos.sql
```

Dans `0182_drop_todos.sql` :
- la 1re ligne devient `-- 0182 — Suppression de la to-do personnelle (décision Benoit, 2026-10-02).` ;
- la ligne `--   2. APRÈS 0180 (chantier identité chatteur MyPuls, en parallèle) — la séquence de`
  devient `--   2. APRÈS 0180 (identité chatteur MyPuls) et 0181 (photos des modèles) — la séquence de`.

Dans `ARCHITECTURE.md`, remplacer « table et fonctions supprimées par `0181` » par « table et
fonctions supprimées par `0182` ».

- [ ] **Step 2 : vérifier**

Run : `ls packages/db/supabase/migrations | tail -3 && grep -n "0181\|0182" ARCHITECTURE.md packages/db/supabase/migrations/0182_drop_todos.sql`
Expected : `0179_trafic_linkscale.sql` puis `0182_drop_todos.sql`. `ARCHITECTURE.md` cite `0182`.
L'en-tête de la migration dit `0182` et mentionne `0181 (photos des modèles)`.

---

### Task 2 : règles pures — `@glagency/core` `media/avatar.ts`

**Files :**
- Create : `packages/core/src/media/avatar.ts`
- Create : `packages/core/src/media/avatar.test.ts`
- Modify : `packages/core/src/index.ts` (à la fin du fichier)

**Interfaces :**
- Produces :
  - type `ImageMime = 'image/webp' | 'image/jpeg' | 'image/png'` ;
  - constantes `AVATAR_MAX_BYTES = 1_048_576` et `AVATAR_EXT: Record<ImageMime, string>` ;
  - fonctions :
    - `sniffImageType(bytes: Uint8Array): ImageMime | null`
    - `avatarOutcome(res: { status: number; location: string | null; bytes: Uint8Array }): AvatarOutcome`
    - `avatarTargets(creators: AvatarCreator[], force?: boolean): AvatarCreator[]`
  - types :
    - `AvatarOutcome = { kind: 'image'; mime: ImageMime; ext: string } | { kind: 'session' } | { kind: 'invalid'; reason: string }`
    - `AvatarCreator = { id: string; name: string; mypulsCreatorId: string | null; avatarPath: string | null }`

- [ ] **Step 1 : écrire les tests qui échouent**

`packages/core/src/media/avatar.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { AVATAR_MAX_BYTES, avatarOutcome, avatarTargets, sniffImageType, type AvatarCreator } from './avatar'

const bytes = (...b: number[]) => new Uint8Array(b)
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38)
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)
const HTML = new TextEncoder().encode('<!DOCTYPE html><html>')

describe('sniffImageType', () => {
  it('reconnaît WebP, JPEG et PNG sur leurs premiers octets', () => {
    expect(sniffImageType(WEBP)).toBe('image/webp')
    expect(sniffImageType(JPEG)).toBe('image/jpeg')
    expect(sniffImageType(PNG)).toBe('image/png')
  })
  it('refuse le reste, y compris un fichier vide ou une page HTML', () => {
    expect(sniffImageType(HTML)).toBeNull()
    expect(sniffImageType(bytes())).toBeNull()
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46))).toBeNull()
  })
})

describe('avatarOutcome', () => {
  it('une redirection vers /login = session expirée', () => {
    expect(avatarOutcome({ status: 302, location: 'https://mypuls.app/login', bytes: bytes() })).toEqual({ kind: 'session' })
  })
  it('une autre redirection, un 404 ou un 500 : modèle sautée, avec la raison', () => {
    expect(avatarOutcome({ status: 302, location: 'https://mypuls.app/autre', bytes: bytes() })).toEqual({
      kind: 'invalid',
      reason: 'redirection 302',
    })
    expect(avatarOutcome({ status: 404, location: null, bytes: bytes() })).toEqual({ kind: 'invalid', reason: 'HTTP 404' })
  })
  it('un 200 qui n’est pas une image est refusé', () => {
    expect(avatarOutcome({ status: 200, location: null, bytes: HTML })).toEqual({ kind: 'invalid', reason: 'pas une image' })
  })
  it('le type vient des octets, pas de l’en-tête : WebP → .webp', () => {
    expect(avatarOutcome({ status: 200, location: null, bytes: WEBP })).toEqual({ kind: 'image', mime: 'image/webp', ext: 'webp' })
    expect(avatarOutcome({ status: 200, location: null, bytes: JPEG })).toEqual({ kind: 'image', mime: 'image/jpeg', ext: 'jpg' })
  })
  it('une image de plus de 1 Mo est refusée avant l’envoi', () => {
    const big = new Uint8Array(AVATAR_MAX_BYTES + 1)
    big.set(JPEG)
    expect(avatarOutcome({ status: 200, location: null, bytes: big })).toEqual({ kind: 'invalid', reason: 'image de plus de 1 Mo' })
  })
})

describe('avatarTargets', () => {
  const c = (over: Partial<AvatarCreator>): AvatarCreator => ({ id: 'x', name: 'X', mypulsCreatorId: '1', avatarPath: null, ...over })
  const all = [
    c({ id: 'a', name: 'Alice' }),
    c({ id: 'b', name: 'Béa', avatarPath: 'b.webp' }),
    c({ id: 'z', name: 'Sans id', mypulsCreatorId: null }),
  ]
  it('seules les modèles sans photo, et jamais une modèle sans id MyPuls', () => {
    expect(avatarTargets(all).map((x) => x.id)).toEqual(['a'])
  })
  it('--force reprend toutes celles qui ont un id MyPuls', () => {
    expect(avatarTargets(all, true).map((x) => x.id)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run : `pnpm --filter @glagency/core exec vitest run src/media/avatar.test.ts`
Expected : FAIL (`Cannot find module './avatar'`).

- [ ] **Step 3 : implémenter**

`packages/core/src/media/avatar.ts` :

```ts
/**
 * Photos des modèles (spec docs/superpowers/specs/2026-10-02-photos-modeles-agence-design.md, A).
 * MyPuls sert `/creator/<id>/avatar` en WebP 100 × 100 tout en annonçant `image/jpeg` : le type se
 * lit sur les premiers octets, jamais sur l'en-tête.
 */

export type ImageMime = 'image/webp' | 'image/jpeg' | 'image/png'

/** Plafond du bucket `creator-avatars` (1 Mo) : une image plus lourde est refusée avant l'envoi. */
export const AVATAR_MAX_BYTES = 1_048_576

export const AVATAR_EXT: Record<ImageMime, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v)

/** WebP = « RIFF » + taille + « WEBP » ; JPEG = FF D8 FF ; PNG = 89 « PNG » 0D 0A 1A 0A. */
export function sniffImageType(b: Uint8Array): ImageMime | null {
  if (b.length >= 12 && starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
  if (b.length >= 3 && starts(b, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (b.length >= 8 && starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  return null
}

export type AvatarOutcome =
  | { kind: 'image'; mime: ImageMime; ext: string }
  | { kind: 'session' }
  | { kind: 'invalid'; reason: string }

/**
 * Ce que vaut une réponse de `/creator/<id>/avatar`, lue avec `redirect: 'manual'`. Une redirection
 * vers `/login` = session expirée : le script s'arrête plutôt que de ranger la page de connexion.
 */
export function avatarOutcome(res: { status: number; location: string | null; bytes: Uint8Array }): AvatarOutcome {
  if (res.status >= 300 && res.status < 400) {
    return /\/login\b/.test(res.location ?? '') ? { kind: 'session' } : { kind: 'invalid', reason: `redirection ${res.status}` }
  }
  if (res.status !== 200) return { kind: 'invalid', reason: `HTTP ${res.status}` }
  if (res.bytes.length > AVATAR_MAX_BYTES) return { kind: 'invalid', reason: 'image de plus de 1 Mo' }
  const mime = sniffImageType(res.bytes)
  return mime ? { kind: 'image', mime, ext: AVATAR_EXT[mime] } : { kind: 'invalid', reason: 'pas une image' }
}

export interface AvatarCreator {
  id: string
  name: string
  mypulsCreatorId: string | null
  avatarPath: string | null
}

/** Les modèles à traiter : avec un id MyPuls, et sans photo — toutes avec `force`. */
export function avatarTargets(creators: AvatarCreator[], force = false): AvatarCreator[] {
  return creators.filter((c) => !!c.mypulsCreatorId && (force || !c.avatarPath))
}
```

À la fin de `packages/core/src/index.ts` :

```ts

// Photos des modèles (spec 2026-10-02, partie A) — script `pnpm --filter @glagency/ingestion avatars`.
export { AVATAR_EXT, AVATAR_MAX_BYTES, avatarOutcome, avatarTargets, sniffImageType } from './media/avatar'
export type { AvatarCreator, AvatarOutcome, ImageMime } from './media/avatar'
```

- [ ] **Step 4 : vérifier**

Run : `pnpm --filter @glagency/core exec vitest run src/media/avatar.test.ts && pnpm --filter @glagency/core typecheck`
Expected : 9 tests PASS, typecheck OK.

- [ ] **Step 5 : point de commit (uniquement si Benoit dit « commit »)**

```bash
git add -- packages/core/src/media/avatar.ts packages/core/src/media/avatar.test.ts packages/core/src/index.ts
```

---

### Task 3 : migration `0181` + types

**Files :**
- Create : `packages/db/supabase/pending/0180_creator_avatars.sql` (ruling post-revue : hors de `migrations/` tant que `0180` n'est pas appliquée)
- Modify : `packages/db/src/types.ts` (bloc `creators` : `Row`, `Insert`, `Update`)

**Interfaces :**
- Produces : colonne `creators.avatar_path text` (null = pas de photo) et bucket `creator-avatars`.

- [ ] **Step 1 : la migration**

`packages/db/supabase/migrations/0180_creator_avatars.sql` :

```sql
-- 0181 — Photos des modèles (spec docs/superpowers/specs/2026-10-02-photos-modeles-agence-design.md,
-- partie A).
--
-- MyPuls sert la photo de chaque modèle (`/creator/<mypuls_creator_id>/avatar`, WebP 100 × 100) ;
-- le script `pnpm --filter @glagency/ingestion avatars` la récupère UNE fois et la range ici. Pas de
-- cron : on relance le script quand une nouvelle modèle arrive.
--
-- `avatar_path` = clé de l'objet dans le bucket ; null = pas (encore) de photo.
-- Bucket PRIVÉ, sans policy sur storage.objects : écriture en service-role (le script), lecture
-- par URLs signées générées côté serveur — même patron que `agency-events` (0176).
--
-- Après 0180 (identité chatteur MyPuls, session parallèle) : séquence contiguë.

alter table public.creators add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creator-avatars', 'creator-avatars', false, 1048576, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
```

- [ ] **Step 2 : les types (à la main, au format généré)**

Dans le bloc `creators: {` de `packages/db/src/types.ts`, ajouter `avatar_path` juste après la
ligne `active` de chacun des trois sous-blocs (les champs générés sont triés par ordre alphabétique) :
- `Row` : `avatar_path: string | null`
- `Insert` : `avatar_path?: string | null`
- `Update` : `avatar_path?: string | null`

```bash
python3 - <<'EOF'
p='packages/db/src/types.ts'; lines=open(p,encoding='utf-8').read().split('\n')
i=lines.index('      creators: {')
j=next(k for k in range(i+1,len(lines)) if lines[k]=='      }')
added=0
for k in range(j-1, i, -1):
    l=lines[k]
    if l.strip().startswith('active') and l.startswith('          active'):
        opt = '?' if '?:' in l else ''
        lines.insert(k+1, f'          avatar_path{opt}: string | null')
        added+=1
assert added==3, added
open(p,'w',encoding='utf-8').write('\n'.join(lines))
EOF
```

- [ ] **Step 3 : vérifier**

Run : `pnpm -r typecheck && git diff --stat packages/db/src/types.ts`
Expected : aucune erreur, et 3 lignes ajoutées à `types.ts`.

- [ ] **Step 4 : point de commit (uniquement si Benoit dit « commit »)**

```bash
git add -- packages/db/supabase/migrations/0180_creator_avatars.sql packages/db/src/types.ts
```

---

### Task 4 : le script `pnpm --filter @glagency/ingestion avatars`

**Files :**
- Create : `apps/ingestion/src/avatars.ts`
- Modify : `apps/ingestion/package.json` (script `"avatars": "tsx src/avatars.ts"`, après `"linkscale"`)

**Interfaces :**
- Consumes : `avatarOutcome`, `avatarTargets` (Task 2) ; colonne `avatar_path` (Task 3) ;
  `loadCookie(db)` (`apps/ingestion/src/session.ts:49`) ; `BASE_URL`, `UA` (`@glagency/mypuls`) ;
  `createAdminClient`, `fetchAll` (`@glagency/db`).

- [ ] **Step 1 : écrire le script**

`apps/ingestion/src/avatars.ts` :

```ts
import { createAdminClient, fetchAll } from '@glagency/db'
import { avatarOutcome, avatarTargets } from '@glagency/core'
import { BASE_URL, UA } from '@glagency/mypuls'
import { loadEnv } from './env'
import { loadCookie } from './session'

// Charge le .env racine avant tout (client Supabase).
loadEnv()

/**
 * Photos des modèles depuis MyPuls — récupération UNIQUE, pas de cron (spec 2026-10-02, partie A).
 *
 *   pnpm --filter @glagency/ingestion avatars            # les modèles sans photo
 *   pnpm --filter @glagency/ingestion avatars --force    # toutes : photos remplacées
 *
 * Session : `loadCookie()` lit `ingest_session` SANS la renouveler (le run de nuit s'en charge).
 * Une redirection vers /login arrête le script : on ne range jamais la page de connexion.
 * Cibler l'UAT = préfixer SUPABASE_URL / SUPABASE_SECRET_KEY (cf. marketing-cli.ts) ; la session
 * lue est alors celle de l'UAT, souvent périmée — l'arrêt propre le dira.
 */
const BUCKET = 'creator-avatars'
const force = process.argv.includes('--force')

async function main(): Promise<void> {
  const db = createAdminClient()
  const { data, error } = await fetchAll((f, t) =>
    db.from('creators').select('id, name, mypuls_creator_id, avatar_path').order('id').range(f, t),
  )
  if (error) throw new Error(`creators : ${error.message}`)
  const targets = avatarTargets(
    data.map((c) => ({ id: c.id, name: c.name, mypulsCreatorId: c.mypuls_creator_id, avatarPath: c.avatar_path })),
    force,
  )
  console.log(
    `[avatars] ${targets.length} modèle(s) à traiter${force ? ' (--force)' : ''} → ${process.env.SUPABASE_URL ?? '(SUPABASE_URL absente)'}`,
  )
  if (!targets.length) return

  const cookie = await loadCookie(db)
  const done: string[] = []
  const failed: string[] = []
  for (const c of targets) {
    const r = await fetch(`${BASE_URL}/creator/${c.mypulsCreatorId}/avatar`, {
      headers: { Cookie: cookie, 'User-Agent': UA },
      redirect: 'manual',
    })
    const bytes = new Uint8Array(await r.arrayBuffer())
    const out = avatarOutcome({ status: r.status, location: r.headers.get('location'), bytes })
    if (out.kind === 'session') {
      throw new Error(`session MyPuls expirée (redirection vers /login) — ${done.length} photo(s) déjà rangée(s), rien d'autre`)
    }
    if (out.kind === 'invalid') {
      failed.push(`${c.name} (${out.reason})`)
      continue
    }
    const path = `${c.id}.${out.ext}`
    const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: out.mime, upsert: true })
    if (up.error) {
      failed.push(`${c.name} (envoi : ${up.error.message})`)
      continue
    }
    const { error: uErr } = await db.from('creators').update({ avatar_path: path }).eq('id', c.id)
    if (uErr) {
      failed.push(`${c.name} (fiche : ${uErr.message})`)
      continue
    }
    done.push(c.name)
  }
  console.log(`[avatars] ${done.length} photo(s) rangée(s) : ${done.join(', ') || '—'}`)
  if (failed.length) {
    console.log(`[avatars] ${failed.length} échec(s) : ${failed.join(' · ')}`)
    process.exitCode = 1
  }
}

main().catch((err: unknown) => {
  console.error('[avatars] ÉCHEC', err instanceof Error ? err.message : err)
  process.exit(1)
})
```

Dans `apps/ingestion/package.json`, `scripts` : ajouter `"avatars": "tsx src/avatars.ts"` juste
après `"linkscale": "tsx src/linkscale.ts"` (attention à la virgule).

- [ ] **Step 2 : vérifier**

Run : `pnpm --filter @glagency/ingestion typecheck`
Expected : aucune erreur.

Run, sans écriture distante (base injoignable) :
`SUPABASE_URL=http://127.0.0.1:9 SUPABASE_SECRET_KEY=x pnpm --filter @glagency/ingestion avatars`
Expected : `[avatars] ÉCHEC creators : …` (la lecture échoue), code de sortie 1.

- [ ] **Step 3 : docs**

`docs/CARTE.md`, tableau des commandes, après la ligne `pnpm linkscale` :

```
| `pnpm avatars [--force]` | Photos des modèles depuis MyPuls (`/creator/<id>/avatar`), récupération UNIQUE — les modèles sans photo, ou toutes avec `--force` ; pas de cron | `src/avatars.ts` | table `creators` (`avatar_path`), table `ingest_session` (lecture), bucket `creator-avatars` | `docs/superpowers/specs/2026-10-02-photos-modeles-agence-design.md` |
```

`CHANGELOG.md`, sous `## Non publié` → `### Ajouté` (la rubrique existe déjà) :

```markdown
- Photos des modèles récupérées une fois depuis MyPuls (`pnpm avatars`), en préparation de leur affichage dans Agence.
```

Run : `pnpm check:carte`
Expected : OK.

- [ ] **Step 4 : point de commit (uniquement si Benoit dit « commit »)**

```bash
git add -- apps/ingestion/src/avatars.ts apps/ingestion/package.json docs/CARTE.md CHANGELOG.md
```

---

### Task 5 : ⛔ UAT puis prod (chaque étape sur accord explicite de Benoit)

- [ ] **Step 1 : préalable — `0180` appliquée**

Run (lecture seule) : `max(version)` de `supabase_migrations.schema_migrations` sur l'UAT, par
le pooler en mode session (CLAUDE.md § Migrations).
Expected : `0180`. Si c'est `0179`, **s'arrêter** : `0181` attend la `0180` de la session
parallèle. Le signaler à Benoit.

- [ ] **Step 2 : `0181` sur l'UAT**

D'abord `git mv packages/db/supabase/pending/0180_creator_avatars.sql packages/db/supabase/migrations/` (le dossier `pending/` n'est pas lu par `db push`).


```bash
cd packages/db && supabase db push --db-url "<URL pooler UAT>" --dry-run   # doit lister 0181 seule
cd packages/db && supabase db push --db-url "<URL pooler UAT>"
```

Si le garde-fou bloque, donner à Benoit la commande à lancer avec `!`. Le mot de passe est
extrait de `DATABASE_URL_UAT` par `$(grep … | sed …)`, comme pour `0179`.

- [ ] **Step 3 : le script sur l'UAT**

```bash
SUPABASE_URL=<SUPABASE_URL_UAT> SUPABASE_SECRET_KEY=<SUPABASE_SECRET_KEY_UAT> pnpm --filter @glagency/ingestion avatars
```

Expected : `20 photo(s) rangée(s)`, ou bien un arrêt propre « session MyPuls expirée » si la
session de l'UAT est périmée. Dans ce cas, c'est accepté : la vérification réelle se fait en prod.

- [ ] **Step 4 : prod (go prod explicite)**

Après `0180` en prod : `0181` en prod (`db push`), puis
`pnpm --filter @glagency/ingestion avatars`.
Expected : `20 photo(s) rangée(s)`.

Contrôle en lecture seule :
`select count(*), count(avatar_path) from creators` → `20 | 20`.

Mettre à jour la ligne « État au … » de `AGENTS.md` § Migrations.
