# Badge « Nouveau » sur un chatteur — design

**Date** : 2026-07-30
**Statut** : validé (brainstorm Benoit, 2026-07-30)

## Le besoin

Marquer **à la main** qu'un chatteur est nouveau dans l'agence, et le voir partout où il
apparaît. Manuel, et pas dérivé de `profiles.created_at`, parce que les deux dates divergent :
un chatteur peut être créé tardivement dans le CRM alors qu'il travaille depuis deux mois, ou
l'inverse (compte ouvert avant l'arrivée réelle).

Corollaire d'un drapeau manuel : **personne ne pense à le retirer**. Passé un mois, l'app doit
le réclamer — sinon la moitié de l'équipe reste « nouvelle » pour toujours et le badge ne veut
plus rien dire.

## Décisions

| Question | Décision |
|---|---|
| Portée | **Chatteurs uniquement** (`role = 'chatteur'`) |
| Date d'ancienneté | **Saisissable**, proposée à aujourd'hui, révisable |
| Warning | Badge ambre **+ compteur/filtre** sur la page Membres |
| Périmètre livré | Le badge seul. Le statut « viré / turnover » fera sa propre spec |
| Planning | **Pas de badge** : la page ne liste jamais de chatteur |

## 1. Modèle de données — migration `0101`

Deux colonnes sur `profiles`, à côté de `shift` (0099) et `closing_role` (0077) — même famille :
des données CRM saisies à la main, portées par le membre.

```sql
alter table profiles
  add column if not exists arrived_at date,
  add column if not exists is_new boolean not null default false;

alter table profiles
  add constraint profiles_is_new_needs_arrived_at
    check (not is_new or arrived_at is not null);

create index if not exists profiles_is_new_idx
  on profiles (is_new) where is_new;
```

**Pourquoi deux colonnes et pas une seule `new_since date`** : décocher « nouveau » ne doit pas
effacer la date d'arrivée. C'est la donnée d'entrée du chantier turnover à venir (ancienneté =
date de sortie − date d'arrivée) ; avec une colonne unique, chaque décochage la détruirait.

**RLS** : rien à faire. `profiles` n'a pas de policy par colonne — l'écriture suit les droits
d'édition d'un membre déjà en place (admin, ou manager sur un compte chatteur, cf. 0095), et
`authz.ts` reste la garde applicative.

**Pas de reprise de données** : aucun chatteur n'est marqué au départ, c'est une saisie humaine.

## 2. Saisie — dialog Membres

Dans `member-closing-fields.tsx` (déjà conditionné à `roleValue === 'chatteur'`, déjà ouvert à
tout éditeur du membre) :

```
Rôle closing [ Aucun ▾ ]   Équipe [ Aucune ▾ ]   Shift [ Aucun ▾ ]

[x] Nouvel arrivant     Arrivé le [ 30/07/2026 ]
```

- le champ date **n'apparaît qu'une fois la case cochée**, pré-rempli à la date du jour
- il reste modifiable : c'est le cas « nouveau sur le CRM mais pas dans la vraie vie »
- décocher conserve `arrived_at` en base (le champ redevient masqué, la valeur reste)

**Briques UI — deux écarts avec la demande initiale, tous deux pour rester dans l'existant :**

- **Case à cocher, pas interrupteur.** L'app n'a **aucun** composant `Switch` (vérifié :
  `components/ui/` n'en contient pas, zéro usage dans le code) ; `Checkbox` est là et servi
  partout. Ajouter une primitive Radix pour un seul champ n'en vaut pas le prix — mais
  `pnpm dlx shadcn@latest add switch` reste une ligne si tu tiens à l'interrupteur.
- **`<Input type="date">`, pas de popover calendrier.** C'est déjà la saisie de date de ce
  dialog même (`member-pay-form.tsx:178`, onglet Compta), et celle de Rapports et Insights. Le
  `Calendar` Radix n'est monté nulle part ailleurs que dans `date-range-picker.tsx`, pour des
  plages.

**Libellé « Nouvel arrivant » et pas « Nouveau »** : le sélecteur « Rôle closing » juste
au-dessus propose déjà une option `Nouveau` (`CRM_ROLES`, migration 0090, légende de la feuille
de paie). Deux champs « Nouveau » côte à côte seraient illisibles. Les deux notions restent
distinctes : le rôle closing dit *comment il est payé*, le drapeau dit *depuis quand il est là*.
Vérifié en prod le 2026-07-30 : **0 chatteur** porte `closing_role = 'nouveau'` (92 sans
closing, 16 closers, 1 setter) — la collision est de vocabulaire, pas de données.

Le badge affiché dans le reste de l'app dit bien **« Nouveau »**.

**Schéma Zod** (`features/members/schema.ts`, partagé client ↔ serveur) :

```ts
isNew: z.boolean(),
arrivedAt: z.string().nullable(),   // 'YYYY-MM-DD'
// + refine : isNew ⇒ arrivedAt non null   → « Renseigne la date d'arrivée »
```

**Écriture** (`features/members/actions.ts`, create et update) : même patron que `shift` —
`is_new: role === 'chatteur' ? values.isNew : false` et `arrived_at: role === 'chatteur' ?
values.arrivedAt : null`. Changer un chatteur de rôle purge donc le drapeau, comme pour le
closing et le shift.

**Rappel RHF** : le dialog est un form React Hook Form → `'use no memo'` obligatoire dans tout
composant client qui lit `formState` (le React Compiler casse `formState` sinon).

## 3. La brique d'affichage — `components/new-badge.tsx`

Jumelle de `shift-badge.tsx` : source unique du rendu, `null`/`false` → ne rend rien.

```ts
export function NewBadge({
  isNew, arrivedAt, variant = 'badge',
}: { isNew: boolean; arrivedAt: string | null; variant?: 'badge' | 'icon' })
```

- `variant="badge"` → `<Badge>Nouveau</Badge>`
- `variant="icon"` → une `Sparkles` de lucide en `size-3.5`, `aria-label` + `title`
- **ton normal** : bleu (code couleur chatter)
- **ton warning** : ambre au-delà de 30 jours

**Pourquoi ambre et pas orange** : l'orange est la couleur du rôle *police* dans le code couleur
de l'app (bleu chatter, vert encadrement, orange police, violet modèles) ; deux oranges de sens
différent sur la même ligne se liraient mal. L'ambre est déjà la couleur d'alerte de l'app
(`count-dot.tsx`, `kpi-card.tsx`).

**Le seuil** — helper pur dans `packages/core/src/domain/anciennete.ts` :

```ts
export const NEW_THRESHOLD_DAYS = 30
export function daysSinceArrival(arrivedAt: string | null, today?: string): number | null
export function isStaleNew(isNew: boolean, arrivedAt: string | null, today?: string): boolean
```

**Dans `core` et pas dans `apps/web`** pour deux raisons : `apps/web` n'a aucun test ni Vitest
configuré (vérifié — zéro `*.test.ts` sous `apps/web/src`), alors que `packages/core` est le
domaine pur déjà testé ; et « nouveau pendant 30 jours » est une règle d'agence, pas un détail
d'affichage. Ce module accueillera le calcul d'ancienneté du chantier turnover.

**Le jour de référence est `todayParis()`** (`packages/core/src/domain/dates.ts:218`), jamais
`new Date()` brut. Le commentaire de cette fonction documente précisément le piège : le serveur
tourne en UTC sur Vercel, donc entre minuit et 2 h du matin heure de Paris le jour UTC est encore
la veille — le serveur et le client conclueraient différemment et React signalerait un écart
d'hydratation sur le `title` et la classe. Le paramètre `today` optionnel rend la fonction
testable sans figer l'horloge.

Tooltip / `title` :
- < 30 j → « Nouveau — arrivé le 30/07/2026 »
- ≥ 30 j → « Nouveau depuis 47 jours — pense à décocher »

## 4. Les six emplacements

Chaque service transporte `isNew` + `arrivedAt` jusqu'au composant ; aucun ne recalcule le
seuil, tous appellent la même helper.

| # | Page | Fichiers | Rendu |
|---|---|---|---|
| 1 | **Membres** | `services/get-members.ts` (ajout au `select`), `types.ts`, `components/members-columns.tsx` | Badge texte, à côté de `RoleBadge`/`ShiftBadge` |
| 2 | **Tracker Chatteurs** | `lib/services/closing-by-chatter.ts` (helper partagé), `lib/services/get-chatters.ts`, `lib/types/chatters.ts`, `features/chatters/components/chatters-columns.tsx` | Badge texte |
| 3 | **Organisation** | `features/organisation/services/get-organisation.ts` (`OrgChatter`), `types.ts`, `components/org-table.tsx` | Icône |
| 4 | **Repos** | `features/repos/services/get-repos.ts`, `types.ts`, `components/planning-grid-rows.tsx` | Icône |
| 5 | **Rapport police** | `features/police-reports/services/get-police-reports.ts` (`getChattersByModel`), cartes chatteur du formulaire | Icône |
| 6 | **Compta** | `features/compta/services/compta-sources.ts` → `compta-rows.ts`, pile de noms | Icône |

**Emplacement 2 — pourquoi passer par `closing-by-chatter.ts`** : le Tracker liste des *fiches
MyPuls*, pas des membres. Le chemin `profiles.chatter_id → profiles` existe déjà là pour lire
`closing_role`/`closing_team` (0077/0079) et sert aussi Spenders. Le drapeau prend le même
wagon : une seule requête de plus nulle part, et Spenders l'obtient gratuitement s'il en veut.
Conséquence assumée : une fiche MyPuls **sans membre lié** n'affiche pas de badge — elle ne
correspond à personne dans l'équipe actuelle.

**Emplacement 6 — la pile de noms partagée** : `SelectableMember` (`lib/types/member.ts`) gagne
deux champs **optionnels** (`isNew?`, `arrivedAt?`). `MembersAccordion` rend l'icône quand ils
sont là. Planning, To-do et Dashboard s'y branchent aussi mais ne listent pas de chatteurs :
ils ne remplissent rien, l'icône n'apparaît pas, aucun de leurs services n'est touché.

## 5. Le point de contrôle — page Membres

Dans la `toolbar` de `MembersTable`, à gauche du bouton « Nouveau membre », **seulement s'il y a
au moins un cas** :

```
[ ⚠ 3 à revoir ]   [+ Nouveau membre]
```

Bouton bascule : actif, il filtre `data` sur `isStaleNew(...)`. Un simple `useState` +
un filtrage du tableau passé à `DataTable`, qui garde son filtre par nom.

Sans ce point unique, le warning n'existe que dispersé dans six vues et personne ne décoche
jamais. C'est ce bouton qui fait vivre la donnée.

## 6. Hors scope

- **Planning / To-do / Dashboard** : `getPlanningMembers` exclut explicitement les chatteurs
  (`get-planning.ts:110`). Rien à y afficher tant que le drapeau est réservé aux chatteurs.
- **Statut « viré » + désactivation de compte + taux de turnover** : chantier suivant, spec à
  part. Cette spec lui prépare le terrain avec `arrived_at`.
- **Aucune automatisation** : rien ne coche ni ne décoche tout seul. Le warning *demande*, il
  n'agit pas — décocher reste une décision humaine.

## 7. Tests

- `packages/core/src/domain/anciennete.test.ts` (Vitest, calcul pur, à côté de `dates.test.ts`) :
  `arrivedAt` null → pas de badge ; `isNew` false → jamais de warning quelle que soit la date ;
  29 j → normal ; 30 j → normal ; 31 j → warning ; date future → normal, jamais de compte
  négatif ; jour de référence injecté → verdict indépendant de l'horloge de la machine.
- Schéma Zod : `isNew: true` sans `arrivedAt` → rejeté, message sur le champ date.
- Manuel (UAT préprod) : cocher sur un chatteur, vérifier le badge sur les six pages ; poser
  une date à −40 j, vérifier l'ambre + le compteur ; changer le rôle du membre, vérifier la
  purge du drapeau.

## 8. Vigilance

1. **Migration** : `cd packages/db && supabase db push --db-url "$DATABASE_URL"` (jamais
   `psql -f`, jamais `link`), puis régénérer `packages/db/src/types.ts`.
2. **UAT d'abord** — `develop` pointe sur le projet de préprod ; la prod ne voit rien avant merge.
3. **Le `check` passe sur l'existant** : `is_new` arrive avec un défaut `false` et
   `arrived_at` à null — la contrainte `not is_new or arrived_at is not null` est donc
   satisfaite par toutes les lignes en place (109 chatteurs comptés en prod le 2026-07-30).
   Elle ne mordra que sur une écriture future posant `is_new` sans date.
4. **Deux notions « nouveau »** : le rôle closing `nouveau` (paie) et ce drapeau (ancienneté)
   coexistent. Ne pas fusionner sans décision explicite — ils ne répondent pas à la même question.
