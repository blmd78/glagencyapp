# Lien membre↔chatteur + lecture du closing depuis le membre — Design

**Date** : 2026-07-22
**Statut** : validé (Benoit)

## Objectif

Établir le lien manquant entre un **membre** de l'app (`profiles` role `chatteur`) et son
**chatteur MyPuls** (`chatters`), puis **lire** la désignation closing (rôle setter/closer +
équipe rouge/bleue) **depuis le membre** dans deux écrans qui n'affichent plus cette info
directement : la **page Chatteurs** (badges read-only) et **Spenders** (badge équipe).

L'**édition** du closing reste sur la fiche Membre (colonnes `profiles.closing_role` /
`closing_team`, migration 0077). Ce chantier remplace la « synchro » repoussée à plusieurs
reprises.

## Contexte / état actuel

- `chatters` (MyPuls, scrape) et `profiles` (comptes app) sont **deux espaces d'identité
  disjoints**, sans aucun lien (ni FK, ni email — 1/14 seulement matchent).
- Volumétrie prod : **318 chatteurs** (nom non vide) pour **96 membres role chatteur**. **242
  chatteurs n'ont aucun membre** (ex-chatteurs, inactifs, doublons MyPuls). Donc le lien est
  **membre → chatteur** (chacun des 96 membres pointe SON chatteur), pas l'inverse.
- Match par **nom** : **74** membres se relient sans ambiguïté (nom = 1 seul chatteur, ce
  chatteur = 1 seul membre), 2 ambigus, ~20 sans match.
- Sur la branche `feature/retrait-closing-chatteurs` (non commitée), l'**édition** role/team a
  déjà été retirée de la page Chatteurs, ainsi que l'affichage role/team (Chatteurs) et le badge
  équipe (Spenders). `shift` reste édité sur Chatteurs. Les constantes `CRM_ROLES`/`CRM_TEAMS`
  restent (utilisées par la fiche Membre). Ce chantier **construit sur cette branche** : on garde
  le retrait de l'édition, on **rajoute** le lien + les affichages **lus depuis le membre**.

## Architecture

### 1. Le lien — `profiles.chatter_id`

Colonne `chatter_id uuid unique references chatters(id) on delete set null`, nullable, sur
`profiles`. Un membre pointe au plus un chatteur ; l'`unique` garantit qu'un chatteur est lié à
au plus un membre. `on delete set null` : si un chatteur MyPuls disparaît, le lien se vide sans
casser le membre.

RLS : la colonne suit la RLS existante de `profiles` (row-level) — aucune policy à ajouter.
Écriture du lien = **admin/superadmin uniquement** (garde applicative dans l'action, cf. §3).

### 2. Auto-match (backfill, dans la migration)

La migration qui ajoute la colonne exécute un backfill : elle relie chaque membre role chatteur
dont le match par nom est **sans ambiguïté dans les deux sens** (le membre matche exactement 1
chatteur ET ce chatteur matche exactement 1 membre), en `lower(trim(display_name))`. Les ambigus
et les sans-match restent `null` (traités au sélecteur manuel).

```sql
update profiles p set chatter_id = c.id
from chatters c
where p.role = 'chatteur' and p.chatter_id is null
  and lower(trim(p.display_name)) = lower(trim(c.display_name))
  and (select count(*) from chatters c2
       where lower(trim(c2.display_name)) = lower(trim(p.display_name))) = 1
  and (select count(*) from profiles p2
       where p2.role = 'chatteur' and lower(trim(p2.display_name)) = lower(trim(c.display_name))) = 1;
```

Un faux match éventuel (deux personnes homonymes) se corrige au sélecteur (§3).

### 3. Sélecteur manuel — admin/superadmin, dans la fiche Membre

Un `Combobox` « Chatteur MyPuls lié » dans `MemberDialog`, **visible uniquement pour
admin/superadmin** (même gate que l'option rôle Admin, prop `superadmin`). Recherche sur les 318
chatteurs (nom). Sentinelle « aucun » ↔ `null`.

- **Options** : liste des chatteurs (`id, display_name`), via le client admin (agence-wide, comme
  les autres résolutions de la page Membres). Chargées côté service `get-members`.
- **Écriture** (`updateMember` / `createMember`) : pose `profiles.chatter_id`. **Unicité** : si le
  chatteur choisi est déjà le `chatter_id` d'un AUTRE membre, refus métier (`BusinessError`, message
  clair). Garde applicative **admin/superadmin** en plus de la RLS.
- Sert : les ~22 restants, les corrections d'auto-match, les futurs membres.

### 4. Lecture depuis le membre (le but)

Source unique : construire une map `chatterId → { closingRole, closingTeam }` à partir de
`profiles where chatter_id is not null` (`select id, chatter_id, closing_role, closing_team`).

- **Page Chatteurs** (`lib/services/get-chatters.ts` + `chatters-columns.tsx`) : ré-affiche
  **rôle + équipe** closing en **read-only** (badges), résolus via `byChatter[chatter.id]` (le
  membre lié). Nouveaux champs sur `ChatterRow` : `closingRole` / `closingTeam` (types `CrmRole`
  / `CrmTeam` | null). Aucun crayon d'édition sur ces badges (l'édition est sur le membre). Un
  chatteur non lié → pas de badge.
- **Spenders** (`get-spenders.ts` + `spenders-table.tsx`) : ré-affiche le **badge équipe**,
  résolu via le membre du `assigned_chatter_id` (même map). Champ `chatterTeam` (`CrmTeam` | null)
  ré-introduit, source = membre lié.

### 5. Réconciliation

L'implémentation continue sur `feature/retrait-closing-chatteurs` (édition déjà retirée).
On ajoute : la migration 0079 (colonne + backfill), le sélecteur admin dans `MemberDialog`
(+ options + action), et les affichages lus-du-membre (Chatteurs + Spenders). `shift` inchangé.

## Data flow

1. **Association** : auto-match (migration, backfill) OU sélecteur admin (fiche Membre) → pose
   `profiles.chatter_id`.
2. **Lecture** : `get-chatters` / `get-spenders` chargent la map `chatterId → closing du membre` et
   la joignent aux lignes → badges read-only.

## Gestion des erreurs / cas limites

- **Chatteur non lié** : aucun badge closing (Chatteurs) / aucune équipe (Spenders). Normal.
- **Unicité** : un chatteur ne peut être lié qu'à un membre (contrainte `unique` + refus métier
  côté action avec message). Le backfill n'écrit que des matches 1↔1 → ne viole jamais l'unicité.
- **Faux auto-match** (homonymes) : corrigeable au sélecteur (relier au bon chatteur / délier).
- **Membre non admin** : le sélecteur de lien est masqué ; l'action refuse une écriture du lien par
  un non-admin (garde applicative).

## Hors périmètre (à ne PAS faire ici)

- Dropper les colonnes `chatters.role` / `chatters.team` (nettoyage DB ultérieur, une fois le
  read-from-member en place et validé).
- Nettoyer le `chatter_team` encore renvoyé par le RPC `crm_spenders_tracker` (suivra le drop).
- Ré-écrire le closing du chatteur MyPuls DANS `chatters` (on ne fait que LIRE le membre ; la
  synchro descendante vers `chatters` n'est pas demandée).

## Tests

- **Backfill** (unitaire SQL / vérif prod-like) : après migration, les membres 1↔1 par nom sont
  liés ; aucun lien en double ; ambigus/sans-match restent null.
- **Unicité** : lier un chatteur déjà pris à un autre membre → refus métier.
- **Lecture** : un membre avec closing_role/team + lien → le chatteur affiche les bons badges ;
  un chatteur non lié → pas de badge ; Spenders idem sur le chatteur assigné.
- **Garde admin** : un non-admin ne voit pas le sélecteur et ne peut pas poser le lien.
- Vérif transverse : `typecheck` + `lint` + `build` verts ; aucune régression Membres/closing.
