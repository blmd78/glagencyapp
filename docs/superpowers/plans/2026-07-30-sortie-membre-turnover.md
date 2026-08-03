# Sortie d'un membre & turnover — plan d'implémentation

> **Pour l'exécutant :** spec de référence —
> `docs/superpowers/specs/2026-07-30-sortie-membre-turnover-design.md`. Étapes en cases à cocher.

**Goal :** enregistrer le départ d'un membre sans détruire son profil, désactiver son accès, et
mesurer le turnover de l'agence.

**Architecture :** quatre colonnes de sortie sur `profiles` (`0102`) ; le compte auth est **banni**
et non supprimé ; `getProfile` refuse un parti, ce qui verrouille toutes les pages d'un coup ; les
écrans opérationnels filtrent `left_at is null`, la Compta garde les partis non soldés ; les stats
sortent d'un RPC `SECURITY INVOKER` dans un onglet de la page Membres.

**Tech Stack :** Next.js 16 (RSC + Server Actions), Supabase (Postgres + RLS + GoTrue admin), Zod +
RHF, Vitest (`packages/core`).

## Contraintes globales

- **Route réelle : `/chatter/members`** (et non `/chatter/membres`).
- **Motifs — liste fermée** : `vire`, `demission`, `fin_essai`, `abandon`, `autre`. Une seule
  définition partagée client/serveur, dans `features/members/types.ts`.
- **Désactivation = `ban_duration`**, jamais `deleteUser`. La cascade
  `profiles_id_fkey ON DELETE CASCADE` est la cause du problème qu'on répare — ne pas la déclencher.
- **`left_by` n'est jamais saisi** : c'est `caller.id`, posé côté serveur.
- **Migrations sur `DATABASE_URL_UAT`** (on est sur `develop`) ; la prod au merge.
- **Jour de référence : `todayParis()`**, jamais `new Date()`.
- **Aucun commit sans accord de Benoit.**
- Après chaque tâche : `pnpm --filter @glagency/web lint && pnpm --filter @glagency/web typecheck`
  (2 warnings TanStack préexistants, 0 erreur attendue).

## Découpage en deux phases

- **Phase A (T1→T6) — enregistrer la sortie.** Livrable autonome et utile seul : à partir de là,
  plus aucun départ n'est perdu. C'est l'urgence.
- **Phase B (T7→T8) — les stats.** Ajoute la lecture. Peut attendre sans rien perdre, puisque la
  donnée est capturée depuis la phase A.

---

# PHASE A — enregistrer la sortie

## Task 1 : la migration `0102`

**Files :**
- Create : `packages/db/supabase/migrations/0102_profils_sortie.sql`
- Modify : `packages/db/src/types.ts` (colonnes de `profiles`)

**Interfaces :**
- Produit : `profiles.left_at: string | null`, `left_reason: string | null`, `left_note: string |
  null`, `left_by: string | null` dans les types générés.

- [ ] **Étape 1 : écrire la migration**

```sql
-- 0102 — SORTIE D'UN MEMBRE : on désactive, on ne détruit plus.
--
-- CE QU'ON RÉPARE. `profiles_id_fkey` est en ON DELETE CASCADE : supprimer le compte auth efface
-- le profil — nom, rôle, modèles, date d'arrivée. Aucune trace ne restait qu'une personne ait
-- travaillé ici, donc aucun turnover mesurable. Chaque départ traité avant cette migration est
-- définitivement perdu ; à partir d'ici, un départ est une DONNÉE.
--
-- Le membre parti GARDE son `role`. C'est ce qui permet de dire « 4 chatteurs et 1 manager sont
-- partis en août » — écraser le rôle à la sortie détruirait la statistique qu'on vient créer.
--
-- `arrived_at` (0101) trouve ici son usage réel : ancienneté = left_at − arrived_at.

alter table profiles
  add column if not exists left_at     date,
  add column if not exists left_reason text
    check (left_reason is null or left_reason in
      ('vire', 'demission', 'fin_essai', 'abandon', 'autre')),
  add column if not exists left_note   text,
  add column if not exists left_by     uuid references profiles(id) on delete set null;

comment on column profiles.left_at is
  'Date de sortie de l''agence (0102). Null = membre en poste. Le compte auth est banni en parallèle, jamais supprimé.';
comment on column profiles.left_reason is
  'Motif de sortie : vire | demission | fin_essai | abandon | autre. « abandon » (disparaît sans prévenir) n''est ni un renvoi ni une démission.';
comment on column profiles.left_by is
  'Profil qui a acté le départ. on delete set null : si cet encadrant part à son tour, le départ enregistré survit.';

-- Les détails n'ont de sens qu'avec une date : un motif seul décrirait un départ qui n'a pas eu lieu.
alter table profiles drop constraint if exists profiles_left_fields_need_left_at;
alter table profiles add constraint profiles_left_fields_need_left_at
  check (left_at is not null or (left_reason is null and left_note is null and left_by is null));

-- Et une sortie DOIT porter un motif : sans lui le taux se calcule mais ne s'interprète pas
-- (subi ou choisi ? c'est toute la question qu'on pose au turnover).
alter table profiles drop constraint if exists profiles_left_needs_reason;
alter table profiles add constraint profiles_left_needs_reason
  check (left_at is null or left_reason is not null);

create index if not exists profiles_left_at_idx on profiles (left_at) where left_at is not null;
```

- [ ] **Étape 2 : prévisualiser sur l'UAT**

```bash
cd packages/db
DBU=$(grep '^DATABASE_URL_UAT=' ../../.env | cut -d= -f2- | sed 's/^"//; s/"$//')
supabase db push --db-url "$DBU" --dry-run
```

Attendu : `0102_profils_sortie.sql` seule. Si d'autres apparaissent, **s'arrêter**.

- [ ] **Étape 3 : appliquer, puis vérifier les DEUX contraintes en transaction annulée**

```bash
cd packages/db && supabase db push --db-url "$DBU"
psql "$DBU" <<'SQL'
begin;
-- motif sans date → REFUSÉ
update profiles set left_reason = 'vire' where id = (select id from profiles limit 1);
rollback;
SQL
psql "$DBU" <<'SQL'
begin;
-- date sans motif → REFUSÉ
update profiles set left_at = current_date where id = (select id from profiles limit 1);
rollback;
SQL
psql "$DBU" <<'SQL'
begin;
-- départ complet → ACCEPTÉ, et le rôle survit
update profiles set left_at = current_date, left_reason = 'demission'
  where id = (select id from profiles where role = 'chatteur' limit 1);
select display_name, role, left_at, left_reason from profiles where left_at is not null;
rollback;
SQL
```

Attendu : deux `violates check constraint`, puis une ligne avec son rôle intact.

- [ ] **Étape 4 : types**

Ajouter à la main les 4 colonnes dans les trois blocs `profiles` (Row/Insert/Update) de
`packages/db/src/types.ts`, en ordre alphabétique — **ne pas régénérer en bloc** : la génération
depuis l'UAT embarque un schéma `graphql_public` absent du fichier (constaté en 0101). Vérifier
ensuite par diff contre une génération temporaire dans le scratchpad.

- [ ] **Étape 5 : demander à Benoit avant de commiter**

```bash
git add packages/db/supabase/migrations/0102_profils_sortie.sql packages/db/src/types.ts
git commit -m "feat(db): 0102 — sortie d'un membre (left_at, motif, note, acteur)"
```

---

## Task 2 : lecture + le verrou d'accès

**Files :**
- Modify : `apps/web/src/features/members/types.ts` (`Member`, `DEPARTURE_REASONS`)
- Modify : `apps/web/src/features/members/services/get-members.ts`
- Modify : `apps/web/src/lib/auth/index.ts` (`getProfile`)

**Interfaces :**
- Produit : `Member.leftAt/leftReason/leftNote/leftByName`, la constante `DEPARTURE_REASONS`
  (source unique des motifs) et le type `DepartureReason`.

- [ ] **Étape 1 : la source unique des motifs**

Dans `features/members/types.ts` :

```ts
/** Motifs de sortie — SOURCE UNIQUE (miroir du check SQL 0102). L'ordre est celui du sélecteur.
 *  « Abandon de poste » est distinct d'une démission : le chatteur disparaît sans prévenir, c'est
 *  fréquent en agence et ça ne se compte pas pareil dans le turnover. */
export const DEPARTURE_REASONS = [
  { value: 'vire', label: 'Viré' },
  { value: 'demission', label: 'Démission' },
  { value: 'fin_essai', label: "Fin de période d'essai" },
  { value: 'abandon', label: 'Abandon de poste' },
  { value: 'autre', label: 'Autre' },
] as const
export type DepartureReason = (typeof DEPARTURE_REASONS)[number]['value']
export const DEPARTURE_LABEL: Record<DepartureReason, string> = Object.fromEntries(
  DEPARTURE_REASONS.map((r) => [r.value, r.label]),
) as Record<DepartureReason, string>
```

Et sur l'interface `Member`, après `arrivedAt` :

```ts
  /** Date de sortie (0102). null = en poste. Un membre parti garde son rôle et son profil. */
  leftAt: string | null
  leftReason: DepartureReason | null
  leftNote: string | null
  /** Nom du profil qui a acté le départ — null : posé en SQL direct → l'écran affiche « — ». */
  leftByName: string | null
```

- [ ] **Étape 2 : les remonter dans le service**

Dans `get-members.ts` : ajouter `left_at, left_reason, left_note, left_by` au `select`, puis dans
le mapping (à côté de `arrivedAt`) — `leftByName` se résout avec la `nameById` **déjà construite**
pour `createdByName`, aucune requête de plus :

```ts
      leftAt: p.left_at ?? null,
      leftReason: (p.left_reason ?? null) as DepartureReason | null,
      leftNote: p.left_note ?? null,
      leftByName: p.left_by ? (nameById.get(p.left_by) ?? '—') : null,
```

**Ne pas filtrer les partis ici** : la page Membres est le seul écran qui doit pouvoir les
afficher (bascule « Voir les anciens », Task 4).

- [ ] **Étape 3 : le verrou d'accès — 2 lignes**

Dans `lib/auth/index.ts`, `getProfile` (ligne ~47) : ajouter `left_at` au `select`, puis juste
après le `if (!data) return null` :

```ts
  // MEMBRE PARTI = plus d'accès, partout. Toutes les gardes de page (`requireAccess`,
  // `requireAdmin`, `requireAdminOrManager`, `requireSuperadmin`) font `if (!profile)
  // redirect('/login')` : ce seul retour les verrouille toutes d'un coup.
  // CEINTURE ET BRETELLES : le vrai verrou est le BAN côté GoTrue (posé par `recordDeparture`),
  // qui invalide session, API et RLS ensemble. Celui-ci couvre la fenêtre d'une session déjà
  // rendue côté serveur, et rend le comportement lisible dans le code de l'app.
  if (data.left_at) return null
```

- [ ] **Étape 4 : vérifier**

Run : `pnpm --filter @glagency/web lint && pnpm --filter @glagency/web typecheck`

- [ ] **Étape 5 : demander à Benoit avant de commiter**

```bash
git add apps/web/src/features/members/types.ts apps/web/src/features/members/services/get-members.ts apps/web/src/lib/auth/index.ts
git commit -m "feat(membres): lecture des données de sortie + verrou d'accès d'un parti"
```

---

## Task 3 : les actions (départ, réactivation, suppression définitive)

**Files :**
- Modify : `apps/web/src/features/members/schema.ts` (`departureInput`)
- Modify : `apps/web/src/features/members/actions.ts`

**Interfaces :**
- Produit : `recordDeparture(input)`, `reactivateMember(id)`, et `deleteMember` **restreinte au
  superadmin** — toutes en `ActionResult`.

- [ ] **Étape 1 : le schéma**

Dans `schema.ts` :

```ts
// Départ d'un membre (0102). Le motif est REQUIS — c'est lui qui rend le turnover interprétable.
// `leftBy` n'est pas ici : il est posé côté serveur (caller.id), jamais envoyé par le client.
export const departureInput = z.object({
  id: z.uuid(),
  leftAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
  leftReason: z.enum(['vire', 'demission', 'fin_essai', 'abandon', 'autre']),
  leftNote: z.string().trim().max(500, 'Commentaire trop long'),
})
export type DepartureForm = z.infer<typeof departureInput>
```

- [ ] **Étape 2 : l'action de départ**

Dans `actions.ts`, sur le patron exact de `deleteMember` (garde `noGuard`, autorisation en tête de
handler — norme §4) :

```ts
/** 100 ans : GoTrue attend une DURÉE, pas une date de fin. Le ban se lève par 'none'. */
const BAN_FOREVER = '876000h'

export async function recordDeparture(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: departureInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      const caller = await requireCaller()
      if (!caller) throw new BusinessError('Accès refusé')
      const admin = createAdminClient()
      const target = await requireEditableTarget(admin, values.id, caller)
      if ('error' in target) throw new BusinessError(target.error)
      if (await readStateCookie())
        throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')

      // 1. La DONNÉE d'abord : si le ban échoue ensuite, le départ est enregistré et se rejoue.
      //    L'inverse (bannir puis échouer l'écriture) laisserait un compte muet sans trace.
      const { error: pErr } = await admin
        .from('profiles')
        .update({
          left_at: values.leftAt,
          left_reason: values.leftReason,
          left_note: values.leftNote || null,
          left_by: caller.id,
        })
        .eq('id', values.id)
      if (pErr) throw new Error(pErr.message)

      // 2. Le VERROU : ban GoTrue — session, API et RLS invalidées ensemble. Jamais `deleteUser`,
      //    dont la cascade `profiles_id_fkey` effacerait le profil qu'on vient de documenter.
      const { error: bErr } = await admin.auth.admin.updateUserById(values.id, {
        ban_duration: BAN_FOREVER,
      })
      if (bErr) throw new Error(bErr.message)
      revalidateMembers()
    },
  })
}

/** Retour d'un ancien : on lève le ban et on efface les 4 colonnes (le départ disparaît des
 *  stats — assumé tant qu'il n'y a pas de table d'événements, cf. spec §3). */
export async function reactivateMember(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: z.uuid(),
    input: raw,
    guard: noGuard,
    handler: async (id) => {
      const caller = await requireCaller()
      if (!caller) throw new BusinessError('Accès refusé')
      const admin = createAdminClient()
      const target = await requireEditableTarget(admin, id, caller)
      if ('error' in target) throw new BusinessError(target.error)
      if (await readStateCookie())
        throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')

      const { error: bErr } = await admin.auth.admin.updateUserById(id, { ban_duration: 'none' })
      if (bErr) throw new Error(bErr.message)
      const { error: pErr } = await admin
        .from('profiles')
        .update({ left_at: null, left_reason: null, left_note: null, left_by: null })
        .eq('id', id)
      if (pErr) throw new Error(pErr.message)
      revalidateMembers()
    },
  })
}
```

- [ ] **Étape 3 : réserver la suppression définitive aux admins**

Dans `deleteMember`, après la garde `requireEditableTarget`, ajouter :

```ts
      // La suppression DÉTRUIT (cascade `profiles_id_fkey`) : elle ne sert plus qu'au compte créé
      // par ERREUR — doublon, faute de frappe dans l'email (incident Akari, audit 2026-07-19). Un
      // départ n'est pas une erreur de saisie : il s'enregistre (`recordDeparture`).
      // ADMIN ET SUPERADMIN, pas les managers : ce sont eux qui créent les comptes et qui en
      // ratent (décision Benoit 2026-07-30), donc ceux qui nettoient doivent être au-dessus.
      // `caller.role === 'admin'` couvre le superadmin, que `getProfile` y mappe.
      if (caller.role !== 'admin')
        throw new BusinessError('Un départ s’enregistre — il ne se supprime pas')
```

⚠️ C'est un **RETRAIT de droit** : aujourd'hui `requireEditableTarget` laisse un manager supprimer
un chatteur. Après cette étape il ne peut plus qu'enregistrer un départ. À dire à l'équipe.

- [ ] **Étape 4 : vérifier**

Run : `pnpm --filter @glagency/web lint && pnpm --filter @glagency/web typecheck`

- [ ] **Étape 5 : demander à Benoit avant de commiter**

```bash
git add apps/web/src/features/members/schema.ts apps/web/src/features/members/actions.ts
git commit -m "feat(membres): enregistrer un départ (ban GoTrue) + réactivation"
```

---

## Task 4 : l'interface de la page Membres

**Files :**
- Create : `apps/web/src/features/members/components/member-departure-dialog.tsx`
- Modify : `apps/web/src/features/members/components/members-columns.tsx` (actions + badge)
- Modify : `apps/web/src/features/members/components/members-table.tsx` (bascule)
- Modify : `apps/web/src/features/members/MembersTemplate.tsx` (sous-titre)

**Interfaces :**
- Consomme : `recordDeparture`, `reactivateMember`, `DEPARTURE_REASONS`, `DEPARTURE_LABEL`.

- [ ] **Étape 1 : le dialog de départ**

`member-departure-dialog.tsx` — RHF + `zodResolver(departureInput)`, `'use no memo'`, date par
défaut `todayParis()`, motif en `Controller` (Radix Select), commentaire en `Textarea`, submit via
`ActionButton`, erreur globale sur `root.serverError`, toast sur le retour. Le texte de l'encart :

> Son compte sera désactivé : il ne pourra plus se connecter. Son profil et son historique sont
> conservés.

- [ ] **Étape 2 : les actions de ligne**

Dans `members-columns.tsx`, `RowActions` :

- membre **en poste** → l'icône corbeille ouvre `MemberDepartureDialog` (et non plus le
  `ConfirmDialog` de suppression) ;
- membre **parti** → un bouton « Réactiver » (`ConfirmDialog`) à la place ;
- **admin/superadmin uniquement** (`viewer === 'admin'`, prop déjà threadée jusqu'aux colonnes), en
  plus : « Supprimer définitivement » dans le `ConfirmDialog` existant, dont la description
  devient « Aucune trace ne sera conservée — à réserver à un compte créé par erreur (doublon,
  email erroné). Pour un départ, utilisez « Enregistrer un départ ». » Le bouton reste visuellement
  distinct de la corbeille de départ (variante destructive) pour que les deux gestes ne se
  confondent jamais.

- [ ] **Étape 3 : le badge « Parti »**

Dans la grappe de badges de la colonne Rôle, après `<NewBadge>` :

```tsx
              {row.original.leftAt && (
                <Badge
                  className={STATUS_COLORS.neutral}
                  title={`${DEPARTURE_LABEL[row.original.leftReason!]}${
                    row.original.leftByName ? ` — acté par ${row.original.leftByName}` : ''
                  }${row.original.leftNote ? ` · ${row.original.leftNote}` : ''}`}
                >
                  Parti le {FR_DATE_PARIS.format(new Date(`${row.original.leftAt}T00:00:00`))}
                </Badge>
              )}
```

Gris (`STATUS_COLORS.neutral`) : un départ n'est ni une alerte ni une information à mettre en
avant, c'est un état éteint.

- [ ] **Étape 4 : la bascule « Voir les anciens »**

Dans `members-table.tsx`, à côté de l'état `onlyStale` déjà en place :

```tsx
  // Les partis sont MASQUÉS par défaut : la page Membres sert d'abord à gérer les gens en poste.
  // Filtre de vue (useState, pas d'URL) — même règle que « N à revoir ».
  const [showLeft, setShowLeft] = useState(false)
  const left = members.filter((m) => m.leftAt)
  const base = showLeft ? members : members.filter((m) => !m.leftAt)
```

`base` remplace `members` dans le calcul de `rows` (le filtre `onlyStale` s'applique ensuite).
Bouton bascule « N ancien(s) » dans la toolbar, rendu seulement si `left.length > 0`.

⚠️ `stale` doit se calculer sur les membres **en poste** : un parti n'a plus de drapeau « nouveau »
à revoir, il ne doit pas gonfler le compteur.

- [ ] **Étape 5 : vérifier**

Run : `pnpm --filter @glagency/web lint && pnpm --filter @glagency/web typecheck`

- [ ] **Étape 6 : essai manuel sur l'UAT**

Enregistrer un départ ; vérifier le badge, la disparition de la liste par défaut, le retour via
« Voir les anciens », puis la réactivation. Vérifier en base que le rôle et `arrived_at` sont
intacts.

- [ ] **Étape 7 : demander à Benoit avant de commiter**

---

## Task 5 : exclure les partis des écrans opérationnels

**Files :**
- Modify : `apps/web/src/features/organisation/services/get-organisation.ts:28`
- Modify : `apps/web/src/features/repos/services/get-repos.ts:56`
- Modify : `apps/web/src/features/overview/services/get-overview.ts:82`
- Modify : `apps/web/src/features/police-reports/services/get-police-reports.ts`

- [ ] **Étape 1 : ajouter le filtre**

Sur chacune des quatre requêtes de profils : `.is('left_at', null)`.

- **Organisation** : un parti n'est plus dans l'organigramme. Ses assignations `profile_creators`
  ne sont PAS supprimées (elles racontent ce qui était vrai) — il n'est simplement plus rendu.
- **Repos** : disparaît des options. Une cellule passée qui le nomme garde son nom, résolu par
  `chatterById` — qui, lui, ne filtre pas : un planning d'août doit rester lisible en septembre.
- **Overview** : sort des effectifs.
- **Rapport police** : sort du sélecteur de chatteurs suivis. Les rapports déjà écrits sur lui sont
  conservés et restent lisibles dans l'historique.

**Tracker et Spenders : ne pas toucher.** Ils listent des fiches MyPuls et de l'activité passée,
qui a réellement eu lieu — la filtrer réécrirait l'histoire des chiffres.

- [ ] **Étape 2 : vérifier** — lint + typecheck, puis les 4 pages sur l'UAT avec un membre parti.

- [ ] **Étape 3 : demander à Benoit avant de commiter**

---

## Task 6 : le cas Compta

**Files :**
- Modify : `apps/web/src/features/compta/services/compta-sources.ts:62`
- Modify : `apps/web/src/features/compta/services/get-mois.ts:75`
- Modify : `apps/web/src/features/compta/services/get-suivi.ts:54`
- Modify : `apps/web/src/features/compta/types.ts` (`ComptaRow.leftAt`)
- Modify : `apps/web/src/features/compta/components/compta-columns.tsx` (badge)

**LE PIÈGE.** Un chatteur parti le 15 a travaillé quinze jours : **on lui doit de l'argent**.
L'exclure reviendrait à effacer une dette de l'écran qui sert précisément à la payer.

- [ ] **Étape 1 : la règle de chargement**

Remplacer `.eq('role', 'chatteur')` par `.eq('role', 'chatteur')` **+** un filtre qui garde :

```ts
    // En poste, OU parti mais concerné par la période affichée : il a travaillé dedans
    // (`left_at >= period.start`) — donc il reste dû. Une fois la période passée ET soldée, il
    // sort de la liste : la Compta ne s'allonge pas d'anciens payés mois après mois.
    .or(`left_at.is.null,left_at.gte.${period.start}`)
```

Puis, après le calcul des `payslip`/`thisPayments` de `compta-rows.ts` : **retirer un parti dont la
période est entièrement soldée** (aucun montant restant dû). Un parti non soldé reste, quelle que
soit l'ancienneté de sa dette — c'est le point entier de cette tâche.

- [ ] **Étape 2 : le badge de ligne**

`ComptaRow` gagne `leftAt: string | null` ; la colonne du nom affiche `Parti le 15/08` en
`STATUS_COLORS.neutral`, à côté de l'icône « nouveau ».

- [ ] **Étape 3 : vérifier sur l'UAT — le scénario complet**

Marquer parti un chatteur ayant du CA sur la période en cours, non payé : il **reste** dans la
Compta avec son badge et sa fiche de paie dépliable. Le régler : il sort de la liste à la période
suivante. Vérifier que le classement (`get-suivi`) ne plante pas sur une ligne partie.

- [ ] **Étape 4 : demander à Benoit avant de commiter**

---

# PHASE B — les stats

## Task 7 : la règle de turnover (domaine pur, testé)

**Files :**
- Create : `packages/core/src/domain/turnover.ts`
- Create : `packages/core/src/domain/turnover.test.ts`
- Modify : `packages/core/src/index.ts`

**Interfaces :**
- Produit : `tenureDays(arrivedAt, leftAt): number | null`,
  `turnoverRate(exits, avgHeadcount): number | null`.

- [ ] **Étape 1 : écrire les tests d'abord**

```ts
import { describe, expect, it } from 'vitest'
import { tenureDays, turnoverRate } from './turnover'

describe('tenureDays', () => {
  it('rend null si l’arrivée est inconnue', () => {
    // Le cas MAJORITAIRE au démarrage : 109 chatteurs sans date d'arrivée. La moyenne
    // d'ancienneté doit les EXCLURE, pas les compter zéro — ce serait un chiffre faux.
    expect(tenureDays(null, '2026-08-15')).toBeNull()
  })
  it('rend null si le membre est encore en poste', () => {
    expect(tenureDays('2026-01-01', null)).toBeNull()
  })
  it('compte les jours entre arrivée et sortie', () => {
    expect(tenureDays('2026-01-01', '2026-01-31')).toBe(30)
  })
  it('rend null si la sortie précède l’arrivée (saisie incohérente)', () => {
    expect(tenureDays('2026-08-01', '2026-07-01')).toBeNull()
  })
})

describe('turnoverRate', () => {
  it('rend null sur un effectif nul — jamais de division par zéro', () => {
    expect(turnoverRate(3, 0)).toBeNull()
  })
  it('rend le rapport sorties / effectif moyen', () => {
    expect(turnoverRate(5, 100)).toBeCloseTo(0.05)
  })
  it('rend 0 sans aucune sortie', () => {
    expect(turnoverRate(0, 40)).toBe(0)
  })
})
```

- [ ] **Étape 2** : `pnpm --filter @glagency/core test -- turnover` → ÉCHEC attendu.
- [ ] **Étape 3** : implémenter (réutiliser le calcul en jours UTC de `anciennete.ts` — même piège
      de changement d'heure ; factoriser si les deux fonctions convergent).
- [ ] **Étape 4** : test vert + export dans `index.ts`.
- [ ] **Étape 5 : demander à Benoit avant de commiter**

---

## Task 8 : le RPC et l'onglet Turnover

**Files :**
- Create : `packages/db/supabase/migrations/0103_turnover_report.sql`
- Create : `apps/web/src/features/members/services/get-turnover.ts`
- Create : `apps/web/src/features/members/components/members-tabs.tsx`
- Create : `apps/web/src/features/members/components/turnover-view.tsx`
- Modify : `apps/web/src/app/(dash)/chatter/members/page.tsx` (`?vue=`)
- Modify : `apps/web/src/features/members/MembersTemplate.tsx`

- [ ] **Étape 1 : le RPC**

`turnover_report(p_from date, p_to date)` en **`security invoker`** (norme data-loading §1 —
jamais `definer`, la RLS doit s'appliquer à l'appelant), renvoyant du `json` :

- `by_month` : par mois, `entrees` (comptés sur `arrived_at`), `sorties` (sur `left_at`),
  `effectif_fin` ;
- `by_reason` : le compte par `left_reason` sur la fenêtre ;
- `tenure` : somme des jours d'ancienneté ET nombre de départs **dont l'arrivée est connue** — les
  deux, pour que l'app affiche « moyenne sur 7 départs sur 12 » plutôt qu'une moyenne muette.

Bornes passées **en paramètres** calculés côté TS, jamais `current_date` en base (piège de fuseau,
norme §1). Appliquer sur l'UAT et régénérer/compléter les types.

- [ ] **Étape 2 : le service** — `get-turnover.ts`, erreurs destructurées et thrown, cast documenté
      du retour `Json` vers une interface locale (pas de `.overrideTypes`, cf. norme §1).

- [ ] **Étape 3 : les onglets** — `members-tabs.tsx` sur le patron **exact** de `compta-tabs.tsx` /
      `TodosTabs` : `?vue=` en `router.replace(..., { scroll: false })` dans un `startTransition`,
      vue par défaut (`liste`) non écrite dans l'URL pour que `/chatter/members` reste l'adresse de
      la page. `page.tsx` ne construit QUE l'onglet demandé — l'onglet Turnover ne fait pas payer
      son RPC à qui consulte la liste.

- [ ] **Étape 4 : la vue** — entrées/sorties par mois, effectif, motifs, ancienneté moyenne
      (avec son dénominateur), taux. **Bandeau obligatoire** en tête :

> Les arrivées antérieures au 30/07/2026 ne sont pas renseignées : le premier mois complet est
> août 2026.

Sans lui, un creux d'activité se lirait là où il n'y a qu'une absence de donnée.

- [ ] **Étape 5** : lint + typecheck + essai sur l'UAT.
- [ ] **Étape 6 : demander à Benoit avant de commiter**

---

## Recette finale

- [ ] `pnpm --filter @glagency/core test` — vert
- [ ] `pnpm --filter @glagency/web lint && typecheck` — 0 erreur
- [ ] `pnpm --filter @glagency/web build` — passe
- [ ] Un membre parti ne peut plus se connecter (essai réel avec un compte de test UAT)
- [ ] Il a disparu d'Organisation, Repos, Overview, Rapport police
- [ ] Il **reste** en Compta tant qu'il n'est pas soldé, avec son badge
- [ ] Il réapparaît dans Membres via « Voir les anciens », avec motif et acteur au survol
- [ ] Sa réactivation lui rend l'accès et vide les 4 colonnes
- [ ] `psql` : son `role` et son `arrived_at` n'ont jamais bougé
