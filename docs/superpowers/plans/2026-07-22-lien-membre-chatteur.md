# Lien membre↔chatteur — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relier chaque membre (`profiles` role chatteur) à son chatteur MyPuls (`chatters`) et lire la désignation closing (rôle + équipe) DEPUIS le membre dans la page Chatteurs (badges read-only) et Spenders (badge équipe).

**Architecture:** Colonne `profiles.chatter_id` (unique, FK→chatters) posée par migration + backfill auto par nom 1↔1. Écriture du lien = sélecteur admin/superadmin dans `MemberDialog`. Lecture = map `chatterId → {closing_role, closing_team}` construite depuis `profiles`, jointe aux lignes dans `get-chatters` et `get-spenders`. L'édition du closing reste sur la fiche Membre (colonnes 0077) ; Chatteurs/Spenders ne font que lire.

**Tech Stack:** Next.js 16 (App Router, RSC), Server Actions (`runAction`/`BusinessError`), Supabase (Postgres + RLS, `@supabase/ssr`, client admin `createAdminClient`), Zod v4, react-hook-form, shadcn/ui (`Combobox`), Tailwind v4.

## Global Constraints

- **Lien** : `profiles.chatter_id uuid unique references chatters(id) on delete set null`, nullable.
- **Backfill** : uniquement les matches par nom **1↔1** (`lower(trim(display_name))` — membre matche 1 chatteur ET ce chatteur matche 1 membre). Jamais de violation d'unicité.
- **Sélecteur du lien** : `MemberDialog`, **admin/superadmin uniquement** (prop `superadmin`). Garde applicative d'écriture admin/superadmin dans l'action, en plus de la RLS. Unicité contrôlée côté action (`BusinessError` si le chatteur est déjà pris).
- **Lecture** : source = membre lié (`profiles.closing_role`/`closing_team` de 0077). Chatteur non lié → aucun badge.
- **Ne PAS** : dropper `chatters.role`/`team` ; toucher le RPC `crm_spenders_tracker` ; écrire dans `chatters`. Garder `shift` et `CRM_ROLES`/`CRM_TEAMS` intacts.
- **Migrations** : numérotation contiguë (`0079`), appliquées via `supabase db push --db-url` (UAT d'abord). Régénérer `packages/db/src/types.ts` au changement de schéma (ajout chirurgical, ne pas régénérer tout le fichier car `--schema public` seul supprimerait le bloc `graphql_public`).
- **Base de départ** : branche `feature/retrait-closing-chatteurs` (édition role/team déjà retirée de Chatteurs + badge équipe retiré de Spenders, non commité). Cette feature CONSTRUIT dessus.
- **Vérification** (ce codebase n'a pas de tests unitaires sur les features web — RSC + Supabase) : `pnpm --filter @glagency/web typecheck && lint && build` verts + vérifs SQL pour la migration + contrôles manuels. Pas de Vitest à écrire ici (aucun code `packages/core` touché).

---

## File Structure

| Fichier | Rôle | Tâche |
|---|---|---|
| `packages/db/supabase/migrations/0079_profiles_chatter_id_link.sql` | **Créer** — colonne + FK + unique + backfill | 1 |
| `packages/db/src/types.ts` | Modifier — `profiles.chatter_id` (Row/Insert/Update + Relationship) | 1 |
| `apps/web/src/features/members/schema.ts` | Modifier — `chatterId` sur les 2 schémas | 2 |
| `apps/web/src/features/members/types.ts` | Modifier — `Member.chatterId` | 2 |
| `apps/web/src/features/members/services/get-members.ts` | Modifier — charger `chatter_id` + options chatteurs | 2 |
| `apps/web/src/features/members/actions.ts` | Modifier — écrire `chatter_id` (admin/superadmin + unicité) | 2 |
| `apps/web/src/features/members/components/member-chatter-link-field.tsx` | **Créer** — Combobox « Chatteur lié », superadmin only | 2 |
| `apps/web/src/features/members/components/member-dialog.tsx` | Modifier — brancher le champ + defaults + submit | 2 |
| `apps/web/src/lib/types/chatters.ts` | Modifier — `ChatterRow.closingRole`/`closingTeam` | 3 |
| `apps/web/src/lib/services/get-chatters.ts` | Modifier — map lien→closing du membre | 3 |
| `apps/web/src/features/chatters/components/chatters-columns.tsx` | Modifier — badges read-only role/team | 3 |
| `apps/web/src/features/spenders/types.ts` | Modifier — ré-ajouter `chatterTeam` | 4 |
| `apps/web/src/features/spenders/services/get-spenders.ts` | Modifier — `chatterTeam` depuis le membre lié | 4 |
| `apps/web/src/features/spenders/components/spenders-table.tsx` | Modifier — ré-ajouter le badge équipe | 4 |

---

## Task 1 — Migration `0079` : colonne lien + backfill + types

**Files:**
- Create: `packages/db/supabase/migrations/0079_profiles_chatter_id_link.sql`
- Modify: `packages/db/src/types.ts` (bloc `profiles`)

**Interfaces:**
- Produces: colonne `profiles.chatter_id: string | null` (FK→chatters, unique) ; types `Database['public']['Tables']['profiles']['Row'].chatter_id`.

- [ ] **Step 1 : écrire la migration**

Créer `packages/db/supabase/migrations/0079_profiles_chatter_id_link.sql` :

```sql
-- 0079 — Lien membre↔chatteur. Chaque membre (profiles role chatteur) pointe SON chatteur MyPuls
-- (chatters). 1↔1 : `unique` garantit qu'un chatteur est lié à au plus un membre. `on delete set
-- null` : si le chatteur MyPuls disparaît, le lien se vide sans casser le membre. Permet de LIRE le
-- closing (role/team, colonnes 0077) du membre depuis la page Chatteurs et Spenders. Écriture du
-- lien = admin/superadmin (garde applicative) ; la colonne suit la RLS row-level existante de profiles.
alter table public.profiles
  add column chatter_id uuid unique references public.chatters(id) on delete set null;

-- Backfill : relier automatiquement les membres dont le match par nom est SANS AMBIGUÏTÉ dans les
-- deux sens (le membre matche exactement 1 chatteur ET ce chatteur matche exactement 1 membre).
-- Les ambigus / sans-match restent null (traités au sélecteur manuel admin). Jamais de doublon → ne
-- viole pas `unique`.
update public.profiles p set chatter_id = c.id
from public.chatters c
where p.role = 'chatteur' and p.chatter_id is null
  and lower(trim(p.display_name)) = lower(trim(c.display_name))
  and (select count(*) from public.chatters c2
       where lower(trim(c2.display_name)) = lower(trim(p.display_name))) = 1
  and (select count(*) from public.profiles p2
       where p2.role = 'chatteur' and lower(trim(p2.display_name)) = lower(trim(c.display_name))) = 1;
```

- [ ] **Step 2 : appliquer sur UAT + vérifier le backfill**

```bash
cd packages/db && supabase db push --db-url "$(grep '^DATABASE_URL_UAT=' ../../.env | cut -d= -f2- | sed 's/^"//; s/"$//')" --dry-run
# doit lister 0079 ; puis sans --dry-run pour appliquer
```
Puis vérifier (attendu ~74 liens, 0 doublon) :
```bash
UAT="$(grep '^DATABASE_URL_UAT=' ../../.env | cut -d= -f2- | sed 's/^"//; s/"$//')"
psql "$UAT" -c "select count(*) as lies from profiles where chatter_id is not null;
select count(*) as doublons from (select chatter_id from profiles where chatter_id is not null group by chatter_id having count(*)>1) x;"
```
Expected : `lies` ≈ 74 ; `doublons` = 0.

- [ ] **Step 3 : régénérer les types (ajout chirurgical)**

Dans `packages/db/src/types.ts`, bloc `profiles` (`Tables.profiles`), ajouter `chatter_id` en respectant l'ordre alphabétique (après `chatter`… il n'y en a pas → `chatter_id` vient avant `closing_role`) dans **Row**, **Insert**, **Update** :

```ts
// Row :
          chatter_id: string | null
          closing_role: string | null
// Insert :
          chatter_id?: string | null
          closing_role?: string | null
// Update :
          chatter_id?: string | null
          closing_role?: string | null
```
Et ajouter la Relationship dans `profiles.Relationships` :
```ts
          {
            foreignKeyName: "profiles_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: true
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
```

- [ ] **Step 4 : vérifier le typecheck db**

Run: `pnpm --filter @glagency/db typecheck`
Expected : pas d'erreur.

- [ ] **Step 5 : commit**

```bash
git add packages/db/supabase/migrations/0079_profiles_chatter_id_link.sql packages/db/src/types.ts
git commit -m "feat(db): lien profiles.chatter_id → chatters + backfill par nom [0079]"
```

---

## Task 2 — Sélecteur du lien dans la fiche Membre (admin/superadmin)

**Files:**
- Modify: `apps/web/src/features/members/schema.ts`, `types.ts`, `services/get-members.ts`, `actions.ts`, `components/member-dialog.tsx`
- Create: `apps/web/src/features/members/components/member-chatter-link-field.tsx`

**Interfaces:**
- Consumes: `profiles.chatter_id` (Task 1).
- Produces: `Member.chatterId: string` (''=aucun) ; `MembersData.chatters: { id: string; name: string }[]` ; `MemberForm.chatterId`.

- [ ] **Step 1 : schéma — ajouter `chatterId` aux 2 objets**

Dans `apps/web/src/features/members/schema.ts`, ajouter dans `memberInput` ET `memberUpdateInput`, après `closingTeam,` :
```ts
    // Lien vers le chatteur MyPuls (''=aucun) — posé uniquement par un admin/superadmin (garde action).
    chatterId: z.uuid().or(z.literal('')),
```

- [ ] **Step 2 : type Member + MembersData**

Dans `apps/web/src/features/members/types.ts`, ajouter à `interface Member` (après `closingTeam`) :
```ts
  /** Chatteur MyPuls lié ('' = aucun) — permet de lire le closing du membre côté Chatteurs/Spenders. */
  chatterId: string
```
et à `interface MembersData` :
```ts
  /** Chatteurs MyPuls sélectionnables pour le lien (admin/superadmin). */
  chatters: { id: string; name: string }[]
```

- [ ] **Step 3 : get-members — charger le lien + les options chatteurs**

Dans `apps/web/src/features/members/services/get-members.ts` :
- Ajouter `chatter_id` au `select` de `profiles` (après `closing_team`).
- Ajouter au `Promise.all` une requête admin des chatteurs (client admin car agence-wide). Importer `createAdminClient` de `@glagency/db`. Exemple :
```ts
  const admin = createAdminClient()
  // … dans Promise.all :
  admin.from('chatters').select('id, display_name').order('display_name'),
```
- Mapper `chatterId: p.chatter_id ?? ''` sur chaque `Member`.
- Retourner `chatters: (chattersData ?? []).filter((c) => c.display_name).map((c) => ({ id: c.id, name: c.display_name as string }))`.

- [ ] **Step 4 : composant du champ (superadmin only)**

Créer `apps/web/src/features/members/components/member-chatter-link-field.tsx` (patron `Combobox` + sentinelle 'none'↔'' comme le rattachement manager dans `member-access-fields.tsx`) :
```tsx
'use client'

import { Controller, type Control } from 'react-hook-form'
import { Combobox } from '@/components/ui/combobox'
import type { MemberForm } from '../schema'

/** Lien « Chatteur MyPuls » — SUPERADMIN uniquement (garde serveur en plus). Permet de lire le
 *  closing du membre côté Chatteurs/Spenders. Sentinelle 'none' ↔ '' (pas de lien). */
export function MemberChatterLinkField({
  control,
  chatters,
  isSubmitting,
}: {
  control: Control<MemberForm>
  chatters: { id: string; name: string }[]
  isSubmitting: boolean
}) {
  return (
    <Controller
      name="chatterId"
      control={control}
      render={({ field }) => (
        <div className="grid gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Chatteur MyPuls lié
          </label>
          <Combobox
            options={[{ value: 'none', label: 'Aucun' }, ...chatters.map((c) => ({ value: c.id, label: c.name }))]}
            value={field.value || 'none'}
            onChange={(v) => field.onChange(v === 'none' ? '' : v)}
            placeholder="Rechercher un chatteur…"
            disabled={isSubmitting}
          />
          <p className="text-xs text-muted-foreground">
            Lie ce membre à son chatteur MyPuls (rôle/équipe closing lus depuis ce membre).
          </p>
        </div>
      )}
    />
  )
}
```
> ⚠️ Avant d'écrire ce composant, LIRE `apps/web/src/components/ui/combobox.tsx` pour l'API réelle (`options`/`value`/`onChange` peuvent différer) et `chatter-crm-dialog.tsx`/`report-lines-editor.tsx` pour un exemple d'usage de `Combobox` dans le repo. Adapter les props à l'API réelle.

- [ ] **Step 5 : brancher dans MemberDialog**

Dans `apps/web/src/features/members/components/member-dialog.tsx` :
- Importer `MemberChatterLinkField` ; recevoir `chatters: { id: string; name: string }[]` en prop (passée depuis `MembersTemplate`).
- `defaultValues` : ajouter `chatterId: member?.chatterId ?? ''`.
- `submit` : ajouter `chatterId: values.chatterId` au payload `updateMember` ET `createMember` (déjà couvert par `{ ...values }` pour create).
- Rendu (uniquement superadmin) — après `MemberClosingFields` :
```tsx
          {superadmin && (
            <MemberChatterLinkField control={control} chatters={chatters} isSubmitting={isSubmitting} />
          )}
```
- Vérifier que `MembersTemplate.tsx` passe bien `chatters={data.chatters}` à chaque `MemberDialog`.

- [ ] **Step 6 : actions — écrire le lien (admin/superadmin + unicité)**

Dans `apps/web/src/features/members/actions.ts`, dans les handlers `createMember` ET `updateMember` :
- Extraire `chatterId` des `values`.
- **Avant** le `.update({...})`/après création du profil, poser le lien SEULEMENT si l'appelant est admin/superadmin ET (unicité OK). Helper à ajouter en tête de fichier :
```ts
/** Pose le lien profiles.chatter_id — réservé admin/superadmin, avec garde d'unicité (un chatteur
 *  ne peut être lié qu'à un membre). Un non-admin ne modifie jamais le lien (ignore silencieusement). */
async function applyChatterLink(
  admin: ReturnType<typeof createAdminClient>,
  caller: Profile,
  profileId: string,
  chatterId: string,
): Promise<void> {
  if (caller.role !== 'admin' && caller.role !== 'superadmin') return // non-admin : lien inchangé
  const value = chatterId === '' ? null : chatterId
  if (value) {
    const { data: taken, error } = await admin
      .from('profiles').select('id').eq('chatter_id', value).neq('id', profileId).maybeSingle()
    if (error) throw new Error(error.message)
    if (taken) throw new BusinessError('Ce chatteur est déjà lié à un autre membre.', { chatterId: ['Déjà lié ailleurs.'] })
  }
  const { error } = await admin.from('profiles').update({ chatter_id: value }).eq('id', profileId)
  if (error) throw new Error(error.message)
}
```
> Note : `caller.role` est le rôle applicatif (`getProfile`) ; `superadmin` y est mappé distinctement (cf. `get-members.ts`). Importer `BusinessError` (déjà importé dans police-reports/actions ; l'ajouter ici depuis `@/lib/actions`). Appeler `await applyChatterLink(admin, caller, <uid|id>, chatterId)` après le `.update` principal du profil, dans les deux handlers.

- [ ] **Step 7 : vérifier**

Run: `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build`
Expected : verts (4 warnings préexistants tolérés). Manuel : en superadmin, ouvrir un membre, lier un chatteur, enregistrer ; rouvrir → le lien est là ; tenter de lier le même chatteur à un 2e membre → message « déjà lié ». En admin non-superadmin : pas de champ. En manager : pas de champ.

- [ ] **Step 8 : commit**

```bash
git add apps/web/src/features/members
git commit -m "feat(membres): sélecteur de lien chatteur MyPuls (superadmin) + garde unicité"
```

---

## Task 3 — Lecture du closing depuis le membre : page Chatteurs

**Files:**
- Modify: `apps/web/src/lib/types/chatters.ts`, `apps/web/src/lib/services/get-chatters.ts`, `apps/web/src/features/chatters/components/chatters-columns.tsx`

**Interfaces:**
- Consumes: `profiles.chatter_id` + `closing_role`/`closing_team` (Tasks 1 & 0077).
- Produces: `ChatterRow.closingRole: CrmRole | null`, `ChatterRow.closingTeam: CrmTeam | null`.

- [ ] **Step 1 : type ChatterRow**

Dans `apps/web/src/lib/types/chatters.ts`, ajouter à `interface ChatterRow` (les champs `role`/`team` ont été retirés par la branche de retrait — on ajoute des champs distincts, lus du membre) :
```ts
  // Closing lu DEPUIS le membre lié (profiles.closing_role/closing_team via profiles.chatter_id) —
  // read-only ici ; l'édition est sur la fiche Membre. null = chatteur non lié / sans désignation.
  closingRole: CrmRole | null
  closingTeam: CrmTeam | null
```
(`CrmRole`/`CrmTeam` sont déjà exportés dans ce fichier.)

- [ ] **Step 2 : get-chatters — map lien→closing du membre**

Dans `apps/web/src/lib/services/get-chatters.ts` :
- Charger la map (client admin, à côté des autres résolutions) :
```ts
  // Membres liés à un chatteur → closing lu depuis le membre (source de vérité, cf. 0077/0079).
  const { data: linkedMembers, error: linkErr } = await admin
    .from('profiles').select('chatter_id, closing_role, closing_team').not('chatter_id', 'is', null)
  if (linkErr) throw new Error(linkErr.message)
  const closingByChatter = new Map<string, { role: CrmRole | null; team: CrmTeam | null }>()
  for (const m of linkedMembers ?? [])
    if (m.chatter_id) closingByChatter.set(m.chatter_id, {
      role: (m.closing_role ?? null) as CrmRole | null,
      team: (m.closing_team ?? null) as CrmTeam | null,
    })
```
- Sur chaque `ChatterRow`, poser `closingRole: closingByChatter.get(id)?.role ?? null` et `closingTeam: closingByChatter.get(id)?.team ?? null` (là où le row est construit — l'implémenteur LIT le fichier pour trouver l'endroit exact, l'ancien mapping `role`/`team` ayant été retiré).
- Importer `CrmRole`/`CrmTeam` depuis `@/lib/types/chatters` s'ils ne le sont plus.

- [ ] **Step 3 : chatters-columns — badges read-only**

Dans `apps/web/src/features/chatters/components/chatters-columns.tsx`, ré-afficher **role + team** en badges **read-only** (pas de crayon), lus de `row.original.closingRole`/`closingTeam`. Réutiliser les libellés (`closer→Closer`, `setter→Setter`, `rouge→Rouge`, `bleue→Bleue`) et le style de chip existant (le fichier gardait `shift` et un chip vert/rouge — LIRE le fichier pour le style courant). Exemple de cellule :
```tsx
{row.original.closingRole ? (
  <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-muted">
    {row.original.closingRole === 'closer' ? 'Closer' : 'Setter'}
  </span>
) : null}
{row.original.closingTeam ? (
  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${row.original.closingTeam === 'rouge' ? 'text-red-700' : 'text-blue-700'}`}>
    {row.original.closingTeam === 'rouge' ? 'Rouge' : 'Bleue'}
  </span>
) : null}
```
> Attention à l'alignement des sous-lignes (la branche de retrait a conservé la colonne pour préserver l'alignement 13 cellules). LIRE le fichier + `chatters-sub-rows.tsx` avant d'ajouter/retirer une colonne.

- [ ] **Step 4 : vérifier**

Run: `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build`
Expected : verts. Manuel (après un lien posé en Task 2 sur un membre ayant un closing_role/team) : le chatteur lié affiche les bons badges ; un chatteur non lié → aucun badge.

- [ ] **Step 5 : commit**

```bash
git add apps/web/src/lib/types/chatters.ts apps/web/src/lib/services/get-chatters.ts apps/web/src/features/chatters/components/chatters-columns.tsx
git commit -m "feat(chatters): affiche role/équipe closing lus depuis le membre lié (read-only)"
```

---

## Task 4 — Lecture de l'équipe depuis le membre : Spenders

**Files:**
- Modify: `apps/web/src/features/spenders/types.ts`, `apps/web/src/features/spenders/services/get-spenders.ts`, `apps/web/src/features/spenders/components/spenders-table.tsx`

**Interfaces:**
- Consumes: `profiles.chatter_id` + `closing_team` ; `spender_conversations.assigned_chatter_id`.
- Produces: le champ `chatterTeam: CrmTeam | null` réintroduit sur la ligne spender.

- [ ] **Step 1 : type**

Dans `apps/web/src/features/spenders/types.ts`, ré-ajouter (le champ avait été retiré par la branche de retrait) :
```ts
  /** Équipe closing (rouge/bleue) du chatteur assigné, lue DEPUIS son membre lié — null si non lié. */
  chatterTeam: 'rouge' | 'bleue' | null
```

- [ ] **Step 2 : get-spenders — équipe depuis le membre lié**

Dans `apps/web/src/features/spenders/services/get-spenders.ts` :
- Construire la même map que Task 3 mais team seule (client admin) :
```ts
  const { data: linkedMembers, error: linkErr } = await admin
    .from('profiles').select('chatter_id, closing_team').not('chatter_id', 'is', null)
  if (linkErr) throw new Error(linkErr.message)
  const teamByChatter = new Map<string, 'rouge' | 'bleue' | null>()
  for (const m of linkedMembers ?? [])
    if (m.chatter_id) teamByChatter.set(m.chatter_id, (m.closing_team as 'rouge' | 'bleue' | null) ?? null)
```
- Sur chaque ligne spender, poser `chatterTeam: teamByChatter.get(<assigned_chatter_id>) ?? null` (LIRE le fichier pour le nom exact du champ chatteur assigné — l'ancien `asTeam(chatter.team)` a été retiré).
- ⚠️ Vérifier qu'un `admin` (client) est déjà disponible dans ce service ; sinon `createAdminClient()`.

- [ ] **Step 3 : spenders-table — ré-ajouter le badge équipe**

Dans `apps/web/src/features/spenders/components/spenders-table.tsx`, ré-ajouter le badge Rouge/Bleue sur la colonne Chatteur (le retrait l'avait enlevé), lu de `row.original.chatterTeam` :
```tsx
{row.original.chatterTeam ? (
  <span className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${row.original.chatterTeam === 'rouge' ? 'text-red-700' : 'text-blue-700'}`}>
    {row.original.chatterTeam === 'rouge' ? 'Rouge' : 'Bleue'}
  </span>
) : null}
```
> LIRE le fichier pour retrouver l'emplacement exact (colonne Chatteur, rendu = nom) et le style cohérent avec l'ancien badge (avant retrait).

- [ ] **Step 4 : vérifier**

Run: `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build`
Expected : verts. Manuel : un spender dont le chatteur assigné est lié à un membre rouge/bleue → badge affiché ; chatteur non lié → pas de badge.

- [ ] **Step 5 : commit**

```bash
git add apps/web/src/features/spenders
git commit -m "feat(spenders): badge équipe closing lu depuis le membre du chatteur assigné"
```

---

## Self-Review

**1. Spec coverage :**
- Lien `profiles.chatter_id` (unique, FK, on delete set null) → Task 1. ✓
- Backfill auto par nom 1↔1 → Task 1 Step 1. ✓
- Sélecteur admin/superadmin dans la fiche Membre + unicité → Task 2. ✓
- Lecture Chatteurs (badges read-only) → Task 3. ✓
- Lecture Spenders (badge équipe) → Task 4. ✓
- Hors périmètre (drop colonnes, RPC) → non planifié (correct). ✓
- Réconciliation sur la branche de retrait → mentionnée (Global Constraints). ✓

**2. Placeholder scan :** pas de TBD/TODO ; les « LIRE le fichier » sont volontaires (fichiers modifiés par la branche de retrait dont l'état exact doit être lu — pas des placeholders de logique). Le code des parties nouvelles/critiques (migration, action lien+unicité, maps de lecture) est complet.

**3. Type consistency :** `chatterId` (schema/type/action/form) cohérent ; `closingRole`/`closingTeam` (ChatterRow) ; `chatterTeam` (spenders) ; `closingByChatter`/`teamByChatter` maps ; `CrmRole`/`CrmTeam` réutilisés. `caller.role` incluant `superadmin` (garde du lien) cohérent entre Task 2 Step 6 et get-members.

**Ordre d'exécution** : 1 → 2 → 3 → 4. Tasks 3 & 4 ne dépendent que de la colonne (Task 1) ; Task 2 aide à peupler des liens pour tester 3/4 manuellement.
