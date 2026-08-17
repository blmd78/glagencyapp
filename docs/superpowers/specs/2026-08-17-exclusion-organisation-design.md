# Exclusion de l'affichage Organisation — design

**Date** : 2026-08-17 · **Taille** : M · **Statut** : validé en chat (périmètre minimal)

## Problème

Jam est un manager transverse : il a tous les modèles assignés pour tout voir sur le CRM
(sans être admin). Conséquence : sur `/chatter/organisation`, il apparaît comme manager
sur **toutes** les lignes et pollue le board (cf. capture du 2026-08-17).

Précédent dans le code : `get-organisation.ts:146-158` skippe déjà les lignes directes
des **admins** (« un ADMIN est assigné à TOUS les modèles par nature »). Ce flag est la
généralisation propre de ce cas pour un rôle `manager`.

## Solution (périmètre volontairement minimal)

Un booléen sur le profil + un filtre à l'endroit unique où l'Organisation construit sa
liste de managers. **Rien d'autre ne change dans l'app** : ni droits, ni périmètre
modèles, ni autres pages.

### 1. Migration — fusionnée dans `0111_relance_par.sql` (décision Benoit : une seule migration à passer en prod avec la release ; « 0112 » désigne une autre migration, sans rapport)

```sql
alter table profiles
  add column if not exists org_excluded boolean not null default false;

comment on column profiles.org_excluded is
  'Exclu de l''affichage de la page Organisation (affichage pur — aucun effet sur les droits ni les assignations).';
```

- Pas d'index (table minuscule), pas de nouvelle policy RLS (policies row-level,
  écritures via client admin dans `updateMember`).
- Régénérer `packages/db/src/types.ts`.

### 2. Membres — édition du flag (chaîne standard, pattern `is_new`)

| Fichier | Changement |
|---|---|
| `features/members/schema.ts` | `orgExcluded: z.boolean()` dans `memberFields` |
| `features/members/components/member-defaults.ts` | défaut `false` (+ valeur du membre en édition) |
| `features/members/types.ts` | `orgExcluded` sur `Member` |
| `features/members/services/get-members.ts` | colonne dans le select + mapping |
| `features/members/actions.ts` | écriture dans `createMember` et `updateMember` |
| `features/members/components/member-access-fields.tsx` | checkbox « Exclure de l'affichage Organisation » |

- La checkbox vit dans `MemberAccessFields` → déjà **visible admin only**.
- Libellé d'aide : « N'apparaît plus comme manager sur le board Organisation.
  Droits, pages et modèles assignés inchangés. »
- Pas de badge/colonne dans la table Membres, pas de trace dans l'historique membre.

### 3. Organisation — le filtre

`features/organisation/services/get-organisation.ts` :

- Ajouter `org_excluded` au select `profiles` (L29).
- L125 :

```ts
const managers = profiles.filter(
  (p) => (p.role === 'manager' || p.role === 'admin') && !p.org_excluded,
)
```

C'est le seul point de filtre. `getOrganisation` n'a qu'un appelant
(`app/(dash)/chatter/organisation/page.tsx`) → aucun impact hors de cette page.

## Effets de bord acceptés (découlent mécaniquement du filtre, rien à coder)

1. **`managerOptions`** (L225, dérivé de `managers`) : Jam n'est plus sélectionnable
   comme manager d'une ligne depuis le board. Voulu : exclu = on ne le place pas.
2. **KPI « sans équipe »** : les modèles couverts uniquement par Jam remontent en
   `orphanModels`. Amélioration : aujourd'hui ce KPI est toujours à 0 puisque Jam
   couvre tout.
3. **Section « Sans manager »** : un sous-manager rattaché uniquement à un manager
   exclu y tombe (comportement existant pour les orphelins).

## Hors périmètre (explicite)

- Le flag n'est **jamais** lu par `lib/services/creator-scope.ts` ni
  `features/members/authz.ts` : affichage pur, pas un droit.
- Pas de filtre sur les sous-managers (L128) — à ajouter le jour où un sous-manager
  transverse existera.
- Le rôle « manager chef » reste un chantier séparé éventuel ; ce flag n'en préjuge pas.

## Test de validation

Cocher le flag sur Jam dans Membres → la page Organisation ne montre plus aucune
section/ligne « Jam » ; Jam garde son accès CRM complet (tracker, rapports, membres).
Décocher → il réapparaît.
