# Sortie d'un membre & turnover — design

**Date** : 2026-07-30
**Statut** : validé (brainstorm Benoit, 2026-07-30)
**Suite de** : `2026-07-30-badge-nouveau-chatteur-design.md` (qui a posé `arrived_at`)

## Le besoin

Savoir **qui entre et qui sort**, pour mesurer le turnover de l'agence.

## Le problème, aujourd'hui

`profiles_id_fkey` est en **`ON DELETE CASCADE`**. Supprimer un membre efface son compte auth *et*
son profil : nom, rôle, modèles, date d'arrivée. Il ne reste **aucune trace** qu'il ait travaillé
ici. `deleteMember` (`features/members/actions.ts`) fait exactement ça.

Conséquence : **chaque départ traité avant ce chantier est perdu définitivement.** C'est la seule
urgence du lot — le reste se rattrape, ça non.

Côté entrées, `created_at` ne remplace pas une date d'arrivée : les 109 chatteurs de la prod ont
été créés entre le **17 et le 29 juillet 2026**, quand le CRM a été peuplé. Ces dates ne disent
rien de l'arrivée réelle des gens.

## Décisions

| Question | Décision |
|---|---|
| Le compte à la sortie | **Désactivé, profil conservé** — banni côté auth, la ligne `profiles` reste |
| Ce qu'on saisit | date de sortie, motif, commentaire libre, et qui a acté (automatique) |
| Motifs | **Viré / Démission / Fin d'essai / Abandon de poste / Autre** |
| Compta | le parti **reste visible tant qu'il n'est pas payé** |
| Les 109 sans `arrived_at` | **on démarre à vide**, saisie au fil de l'eau |

**Pourquoi « abandon de poste » est un motif à part** : le chatteur qui disparaît sans prévenir
n'est ni un renvoi ni une démission. C'est fréquent en agence, et le confondre avec l'un des deux
fausserait la lecture du taux.

## 1. Modèle de données — migration `0102`

```sql
alter table profiles
  add column if not exists left_at     date,
  add column if not exists left_reason text
    check (left_reason is null or left_reason in
      ('vire', 'demission', 'fin_essai', 'abandon', 'autre')),
  add column if not exists left_note   text,
  add column if not exists left_by     uuid references profiles(id) on delete set null;

-- Les trois détails n'ont de sens qu'avec une date de sortie : sans elle, un motif seul décrirait
-- un départ qui n'a pas eu lieu.
alter table profiles
  add constraint profiles_left_fields_need_left_at
    check (left_at is not null
           or (left_reason is null and left_note is null and left_by is null));

-- Un membre parti DOIT porter un motif : c'est la donnée qui distingue un turnover subi d'un
-- turnover choisi. Sans elle, le taux se calcule mais ne s'interprète pas.
alter table profiles
  add constraint profiles_left_needs_reason
    check (left_at is null or left_reason is not null);

create index if not exists profiles_left_at_idx on profiles (left_at) where left_at is not null;
```

`text` + `check` et jamais `create type ... enum` (convention projet). `left_by` en `on delete set
null` : si l'encadrant qui a acté le départ est lui-même supprimé un jour, le départ reste.

**Le membre parti garde son `role`.** C'est ce qui permettra de dire « 4 chatteurs et 1 manager
sont partis en août » — écraser le rôle à la sortie détruirait la statistique.

**`arrived_at` sert enfin à quelque chose** : ancienneté = `left_at − arrived_at`. Il vient de la
migration 0101 et n'était jusqu'ici qu'un support d'affichage.

## 2. La désactivation du compte

`admin.auth.admin.updateUserById(id, { ban_duration: '876000h' })` — vérifié disponible dans le SDK
installé (`@supabase/auth-js`, `AdminUserAttributes.ban_duration`).

**Pourquoi le ban et pas `deleteUser(id, true)` (soft delete)** : le ban ne touche pas à la ligne
`auth.users`, donc il ne peut pas déclencher la cascade qui nous a mis dans cette situation. Il est
aussi explicitement réversible (`ban_duration: 'none'`), ce qui n'est pas le contrat du soft delete.

Le ban invalide l'accès **au niveau de Supabase Auth** : session, API et RLS d'un coup. C'est le
vrai verrou. En ceinture-bretelles, `getProfile` (`lib/auth/index.ts:47`) — par où passent toutes
les gardes de page — lit `left_at` et retourne `null` quand il est posé : un membre parti dont la
session serait encore en cache atterrit sur `/login`.

## 3. La saisie — dialog de sortie

Le bouton corbeille de la table Membres (`members-columns.tsx`) ouvre désormais un dialog
**« Enregistrer un départ »** :

```
Départ de Mehdi

Parti le      [ 30/07/2026 ]
Motif         [ Viré ▾ ]           ← requis
Commentaire   [ ....................... ]   (optionnel)

⚠ Son compte sera désactivé : il ne pourra plus se connecter.
  Son profil et son historique sont conservés.

                          [ Annuler ]  [ Enregistrer le départ ]
```

- **`left_by` n'est pas saisi** : c'est l'appelant, capturé côté serveur (`caller.id`), comme
  `created_by` en 0098.
- Droits : ceux de `requireEditableTarget` — inchangés par rapport à la suppression actuelle
  (admin sur tout, manager sur un chatteur), plus la garde « mode consultation » déjà en place.
- **La suppression définitive ne disparaît pas** : elle reste, **admin et superadmin** (pas les
  managers), sous un libellé sans ambiguïté (« Supprimer définitivement — aucune trace
  conservée »). Elle sert au compte créé par erreur : doublon, faute de frappe dans l'email — un
  cas réel et récurrent, cf. l'incident Akari du 2026-07-19. **Ce sont les managers qui créent les
  comptes, et ils en ratent** (constat Benoit) ; ce sont donc les admins qui doivent pouvoir
  nettoyer, sans dépendre du propriétaire. Un doublon n'est pas un départ et ne doit pas polluer
  le turnover.

  Techniquement : `caller.role === 'admin'` (le superadmin y est mappé par `getProfile`) — les
  managers, eux, gardent le droit d'enregistrer un départ mais perdent celui de supprimer. C'est
  un RETRAIT de droit par rapport à aujourd'hui, où un manager peut supprimer un chatteur.

**Le retour d'un ancien** : rouvrir le dialog d'un membre parti propose « Réactiver ». L'action
lève le ban (`ban_duration: 'none'`) et remet les quatre colonnes à `null`. Le départ précédent
disparaît alors des stats — accepté : sans table d'événements, on ne garde qu'un état courant. Un
aller-retour multiple sera correctement historisé quand le chantier « historique » sera fait.

## 4. Effet sur les écrans

**Sept services filtrent aujourd'hui sur le rôle** (recensés) et verraient donc les partis. Règle
générale : **`left_at is null`** ajouté au filtre. Détail :

| Écran | Traitement |
|---|---|
| **Organisation** (`get-organisation.ts:28`) | exclu — un parti n'est plus dans l'organigramme |
| **Repos** (`get-repos.ts:56`) | exclu des options ; une cellule passée qui le nomme garde son nom (résolu par `chatterById`) |
| **Overview** (`get-overview.ts:82`) | exclu des effectifs |
| **Membres** (`get-members.ts`) | **visible avec un badge « Parti le … »**, mais masqué par défaut : bascule « Voir les anciens » dans la toolbar, à côté de « N à revoir » |
| **Tracker / Spenders** | inchangés — ils listent des fiches MyPuls et de l'activité passée, qui a bien eu lieu |
| **Rapport police** | exclu du sélecteur de chatteurs suivis |
| **Compta** | **cas particulier, ci-dessous** |

### Le cas Compta — le piège à ne pas rater

Un chatteur parti le 15 a travaillé quinze jours : **on lui doit de l'argent**. L'exclure de la
Compta reviendrait à effacer une dette de l'écran qui sert à la payer.

Règle : `compta-sources.ts` charge les chatteurs actifs **plus** les partis qui, sur la période
affichée, ont travaillé (`left_at >= period.start`) **ou** gardent un solde non réglé. Leur ligne
porte un badge « Parti le 15/08 » et reste dépliable jusqu'au dernier paiement. Une fois soldés,
ils sortent de la liste — la Compta ne s'allonge pas d'anciens payés mois après mois.

Cette règle vaut aussi pour `get-mois.ts:75` et `get-suivi.ts:54`.

## 5. Les stats de turnover

**Un onglet « Turnover » sur la page Membres**, pas une nouvelle route : aucun slug ni droit à
créer, et les stats RH vivent là où se gèrent les gens. La page Membres est déjà réservée aux
encadrants.

Contenu, dérivé de `arrived_at` / `left_at` / `left_reason` :

- **Entrées et sorties par mois** — barres, 12 derniers mois. La lecture de base.
- **Effectif en fin de mois** — la courbe qui dit si l'agence grossit ou se vide.
- **Répartition des motifs** sur la période — subi contre choisi.
- **Ancienneté moyenne à la sortie**, calculée **uniquement sur les départs dont l'arrivée est
  connue**, avec le compte affiché (« sur 7 départs sur 12 »). Une moyenne sur données partielles
  qui ne dit pas qu'elle est partielle est un chiffre faux.
- **Taux de turnover** de la période : sorties ÷ effectif moyen.

Agrégation en **RPC SQL `SECURITY INVOKER`** (`turnover_report(p_from, p_to)`), conformément à
`guidelines-data-loading.md` §1 — pas de `GROUP BY` en JS.

**Ce que les stats ne diront pas au début**, et qu'il faut afficher clairement : les entrées
d'avant aujourd'hui sont inconnues (`arrived_at` vide sur les 109). Le premier mois complet sera
août 2026. Un bandeau le dit sur l'onglet plutôt que de laisser croire à un creux d'activité.

## 6. Hors scope

- **L'historique des changements** (modèle, shift, rôle) — chantier suivant, avec son trigger. Il
  enrichira le turnover mais ne le débloque pas.
- **Reconstruire le passé** : impossible, et on ne le simule pas avec `created_at`.
- **Les sorties de modèles/créatrices** : `creators.active` existe déjà, ce n'est pas le même sujet.

## 7. Tests

- `@glagency/core` (Vitest, calcul pur) : ancienneté à la sortie (`left_at − arrived_at`), `null`
  si l'arrivée est inconnue ; sortie antérieure à l'arrivée → `null` et pas un négatif ; taux de
  turnover sur effectif nul → `null`, jamais une division par zéro.
- Contraintes SQL, en transaction annulée : motif sans date → refusé ; date sans motif → refusé ;
  départ complet → accepté ; réactivation → les quatre colonnes reviennent à `null`.
- Manuel (UAT) : enregistrer un départ, vérifier que le compte ne peut plus se connecter, que le
  membre disparaît d'Organisation/Repos/Police, qu'il **reste** en Compta avec son badge, et qu'il
  réapparaît dans Membres via « Voir les anciens ».

## 8. Vigilance

1. **Ne jamais réintroduire la cascade.** La suppression définitive reste possible, mais réservée
   aux admins/superadmins et explicitement libellée « aucune trace conservée ».
2. **Le ban est réversible, la suppression non.** En cas de doute sur un départ, enregistrer le
   départ — jamais supprimer.
3. **`left_by` peut être null** (départ posé en SQL direct) : l'écran affiche « — », pas « inconnu »
   ni un plantage.
4. **Migration sur `DATABASE_URL_UAT` d'abord** (on est sur `develop`), prod au merge.
5. **La RLS n'a pas besoin de changer** : un compte banni ne s'authentifie plus, donc aucune policy
   ne peut être atteinte par un parti. Ne pas ajouter de `left_at is null` dans les policies — ce
   serait du bruit qui ferait croire à une protection dont l'absence serait un trou.
