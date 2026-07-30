# Historique de vie d'un membre — design

**Date** : 2026-07-30
**Statut** : validé (brainstorm Benoit, 2026-07-30)
**Suite de** : `2026-07-30-badge-nouveau-chatteur-design.md` (0101) et
`2026-07-30-sortie-membre-turnover-design.md` (0102/0103)

## Le besoin

Savoir **ce qui est arrivé à un membre** depuis son arrivée : changements de modèle, de shift, de
rôle, de rattachement, de droits, et les moments d'entrée/sortie. Aujourd'hui chaque écriture
écrase la précédente — déplacer quelqu'un d'Emma vers Sarah ne laisse aucune trace.

Deux questions distinctes à servir avec la même donnée :

- **« Qu'est-il arrivé à Mehdi ? »** → onglet Historique dans le dialog du membre.
- **« Qui a bougé quoi cette semaine ? »** → onglet Activité sur la page Membres.

## Décisions

| Question | Décision |
|---|---|
| Capture | **Trigger Postgres**, jamais un log applicatif |
| Portée | Tous les membres, tous les changements listés ci-dessous |
| Droits (pages) | **Capturés**, mais repliés derrière un filtre à l'affichage |
| Affichage | Onglet par membre **+** onglet « Activité » global |
| Démarrage | À vide — le passé n'est pas reconstituable |

## 1. Pourquoi un trigger, et pas un log dans les Server Actions

Les shifts et les modèles s'écrivent depuis **quatre sources** :

1. le dialog Membres (`updateMember`, client service-role) ;
2. les RPC du board Organisation (`save_org_cell`, `save_org_row`, `move_org_team`) ;
3. le planning Repos (`save_repos_cell`) ;
4. les requêtes SQL directes (Claude, corrections manuelles).

Un log applicatif en raterait la moitié. Le projet a déjà tranché la question pour les spenders :
`0033_spender_assignment_events` — *« alimenté par TRIGGER → robuste quelle que soit la source
d'écriture »*. On reprend ce patron.

## 2. Le modèle — migration `0104`

```sql
create table member_events (
  id         bigserial primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  at         timestamptz not null default now(),
  actor_id   uuid references profiles(id) on delete set null,
  kind       text not null check (kind in
    ('creation','role','shift','closing','modele','manager','pages','nouveau','arrivee','sortie')),
  from_value text,
  to_value   text
);
create index member_events_profile_idx on member_events (profile_id, at desc);
create index member_events_at_idx       on member_events (at desc);
```

**Générique (`kind` + `from`/`to`) et pas une colonne par type de changement** : une timeline se
rend de la même façon quelle que soit la nature du changement, et un nouveau type d'événement
demain n'imposera pas de migration de schéma. Les valeurs sont stockées en texte lisible (nom du
modèle, `matin`, `chatteur`) — pas des UUID : un historique doit rester lisible même après la
suppression du modèle ou du manager auquel il fait référence.

**`on delete cascade` sur `profile_id`** : si un compte est vraiment supprimé (la corbeille admin,
réservée aux erreurs de saisie), son historique part avec — il n'a jamais existé. Les vrais
départs, eux, ne suppriment plus rien depuis 0102.

**`actor_id` en `on delete set null`** : l'auteur d'un changement peut partir ; le changement reste.

### RLS

Lecture : même périmètre que la page Membres — admin et encadrants. Écriture : **aucune policy**,
le trigger est `security definer` et personne n'écrit dans cette table à la main. Même patron que
`spender_assignment_events` (0033).

## 3. Le point dur — qui a fait le changement

`auth.uid()` suffirait si toutes les écritures venaient d'un client authentifié. Ce n'est pas le
cas : **la page Membres écrit en service role** (`createAdminClient`, exigé par `auth.admin.*`), où
`auth.uid()` est NULL. Les RPC du board, elles, passent par le client authentifié.

Solution en deux temps, dans le trigger :

```sql
coalesce(auth.uid(), new.updated_by)   -- pour profiles
```

avec une colonne `profiles.updated_by` posée par les actions Membres — exactement le patron de
`created_by` (0098), déjà en place.

**Pour `profile_creators` (les modèles), l'astuce qui rend l'acteur connu** : le trigger lit
`coalesce(auth.uid(), (select updated_by from profiles where id = new.profile_id))`. C'est valide
parce que **`updateMember` écrit le profil AVANT les assignations** (vérifié :
`actions.ts:190` puis `:241`) — `updated_by` est donc déjà à jour quand le trigger tire.

Sans cette astuce, tout changement de modèle fait depuis Membres serait attribué à « système »,
c'est-à-dire la moitié des lignes de l'historique.

`actor_id` null reste possible (SQL direct) : l'écran affiche **« système »**, jamais « inconnu ».

## 4. Ce qui est capturé

| `kind` | Déclencheur | `from` → `to` |
|---|---|---|
| `creation` | insert sur `profiles` | → rôle initial |
| `role` | `profiles.role` change | `chatteur` → `sous-manager` |
| `shift` | `profiles.shift` | `matin` → `soir` |
| `closing` | `closing_role`/`closing_team` | `setter` → `closer` |
| `modele` | insert/delete `profile_creators` | → `Emma` / `Sarah` → |
| `manager` | `profiles.manager_ids` | noms des managers |
| `pages` | `profiles.pages` | nombre de pages (pas la liste : illisible) |
| `nouveau` | `is_new` | `false` → `true` |
| `arrivee` | `arrived_at` | → `2026-07-30` |
| `sortie` | `left_at` | → `2026-08-15 (viré)` |

**Un seul trigger `after update` sur `profiles`** compare les colonnes une à une et insère 0 à n
lignes. Un `update` qui ne change rien n'écrit rien (`is distinct from` sur chaque champ) — sinon
chaque enregistrement du dialog, même sans modification, polluerait la timeline.

**Un trigger `after insert or delete` sur `profile_creators`** pour les modèles.

## 5. L'affichage

### Onglet « Historique » du dialog membre

Troisième onglet, à côté de Général et Compta. Timeline anti-chronologique, chargée **à
l'ouverture de l'onglet** via une Server Action (patron `useMemberPanel` / `loadPlanning`) — le
dialog ne paie rien tant qu'on ne va pas sur cet onglet.

```
30/07/2026   Modèle Sarah retiré                    Axel
28/07/2026   Shift  Matin → Soir                    Dorian
17/07/2026   Compte créé (chatteur)                 Axel
```

Les événements `pages` sont **masqués par défaut**, derrière une case « voir les changements de
droits » : cocher/décocher des pages est fréquent et noierait les mouvements de modèle et de shift.

### Onglet « Activité » de la page Membres

Troisième onglet à côté de Comptes et Turnover. Tous les changements de l'agence, du plus récent
au plus ancien, **sur la période du datepicker** (comme le Turnover, 0103). Filtres : par type
d'événement et par membre. Pagination simple — 100 lignes, « charger plus ».

## 6. Volume

Estimation à partir de l'existant : ~110 membres, quelques dizaines de mouvements par semaine sur
le board Organisation. Soit **quelques milliers de lignes par an** — aucune purge nécessaire, et
l'index `(profile_id, at desc)` sert la fiche membre, `(at desc)` le flux global.

## 7. Ce que ça ne fait pas

- **Le passé n'est pas reconstitué.** L'historique démarre au déploiement du trigger. Chaque jour
  sans lui est du mouvement définitivement perdu — c'est l'argument pour le poser vite.
- **Pas de restauration.** L'historique montre, il ne rejoue pas. Revenir en arrière se fait à la
  main.
- **Pas de diff sur les listes de pages** : on note qu'elles ont changé et combien il y en a, pas
  lesquelles. La liste complète serait illisible dans une timeline, et le droit courant est de
  toute façon visible dans l'onglet Général.

## 8. Tests

- Contraintes SQL et trigger, en transaction annulée : un `update` sans changement n'écrit rien ;
  un changement de shift écrit exactement une ligne ; un changement simultané de rôle et de shift
  en écrit deux ; ajout puis retrait de modèle → deux lignes `modele`.
- L'acteur : un changement via SQL direct → `actor_id` null → « système » ; un changement
  simulant le chemin Membres (avec `updated_by` posé) → l'acteur est retrouvé.
- Suppression définitive d'un compte → son historique disparaît (cascade).
- Manuel : changer un shift depuis le board Organisation, vérifier que la fiche du membre le
  montre avec le bon auteur.

## 9. Vigilance

1. **Ne jamais écrire dans `member_events` depuis l'app.** La table n'a de valeur que si elle est
   exhaustive, et elle ne peut l'être que par trigger.
2. **`updated_by` doit être posé par toutes les actions Membres**, sinon l'acteur retombe à
   « système ». À vérifier à chaque nouvelle mutation sur `profiles`.
3. **Le trigger tourne dans la transaction de l'écriture** : le garder rapide et sans requête
   inutile — une lecture de `creators` par changement de modèle est acceptable, une boucle ne le
   serait pas.
4. **Migration sur `DATABASE_URL_UAT` d'abord** ; prod au merge.
