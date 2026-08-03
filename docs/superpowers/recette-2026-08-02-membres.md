# Recette — cycle de vie des membres (0101 → 0104)

**Date** : 2026-08-02
**Périmètre** : badge « nouvel arrivant », sortie & turnover, historique de vie
**Branche** : `develop`, 20 commits, **non poussés**
**Base** : migrations `0101` → `0104` appliquées **sur la préprod UAT uniquement**

## Comment tester

```bash
pnpm dev        # apps/web/.env.local pointe déjà sur l'UAT
```

⚠️ **Ne pas basculer sur `.env.local.prod`** : la prod n'a aucune des quatre migrations, l'app
planterait au premier `select`.

**Ce qui est déjà en place sur l'UAT** : deux chatteurs marqués nouveaux — **Aboubakar** (arrivé
le jour même → badge bleu) et **ADD** (il y a 40 jours → badge ambre). Aucun départ enregistré,
aucun événement d'historique : la table est vide, elle se remplira à ton premier geste.

**Pour tout remettre à zéro en fin de recette** :

```sql
update profiles set is_new = false, arrived_at = null,
       left_at = null, left_reason = null, left_note = null, left_by = null;
delete from member_events;
```

---

## Bloc 0 — Les six tests bloquants

Si l'un échoue, on ne merge pas. Ils couvrent ce qui touche à l'argent, aux accès et aux données
irrécupérables.

- [ ] **0.1 — Un parti reste payable.** Prends un chatteur avec du CA sur la période en cours,
      enregistre son départ. Il doit **rester** dans `/chatter/compta` avec un badge « Parti le … »
      et sa fiche de paie dépliable. *S'il disparaît, tu lui dois de l'argent et l'écran ne le
      montre plus.*
- [ ] **0.2 — Le planning passé reste lisible.** Pose quelqu'un en repos sur une semaine, puis
      enregistre son départ. Reviens sur cette semaine : **son nom doit toujours s'afficher**. Un
      `?` signifie que le filtre a été posé au mauvais endroit.
- [x] **0.3 — Un parti ne peut plus se connecter.** ✅ **VÉRIFIÉ EN BASE le 02/08** : le départ de
      « sam » (enregistré par Benoit via l'UI) a posé `auth.users.banned_until = 2126-07-06`. La
      chaîne dialog → action → écriture → ban GoTrue fonctionne de bout en bout. Reste facultatif :
      tenter une connexion OTP réelle pour confirmer que GoTrue refuse.
- [ ] **0.4 — La corbeille n'est plus le geste par défaut.** Sur une ligne membre, la porte de
      sortie et la corbeille rouge doivent être **deux boutons distincts**, la corbeille disant
      « Aucune trace ne sera conservée ».
- [ ] **0.5 — Un manager ne peut plus supprimer.** Avec un compte manager : il voit la porte de
      sortie, **pas** la corbeille. *(Retrait de droit assumé — à annoncer à l'équipe.)*
- [ ] **0.6 — L'historique n'écrit pas de bruit.** Ouvre la fiche d'un membre, clique
      « Enregistrer » **sans rien changer**. Son onglet Historique ne doit gagner **aucune ligne**.

---

## Bloc 1 — Badge « nouvel arrivant » (0101)

### Affichage — six écrans

- [ ] `/chatter/members` — Aboubakar en **bleu**, ADD en **ambre**, bouton `⚠ 1 à revoir` dans la
      toolbar. Le clic filtre la table sur ADD seul.
- [ ] `/chatter/chatters` — badge à côté du **nom** (pas dans la colonne Closing).
- [ ] `/chatter/organisation` — étincelle dans leur case (Aboubakar matin/Alice, ADD aprem).
- [ ] `/chatter/compta` — étincelle à côté du nom.
- [ ] `/chatter/rapport-police` — sélectionne un de leurs modèles, ajoute-les au suivi → étincelle
      sur la carte.
- [ ] `/chatter/repos` — pose-les en repos → étincelle sur la puce.

### Saisie

- [ ] Coche « Nouvel arrivant » sur un autre chatteur → le champ « Arrivé le » apparaît, pré-rempli
      à aujourd'hui.
- [ ] Vide la date, enregistre → **refus** « Renseigne la date d'arrivée ».
- [ ] Décoche, enregistre, rouvre, recoche → **la date précédente est revenue** (elle n'est jamais
      effacée : c'est la base du calcul d'ancienneté).
- [ ] Ouvre la fiche d'un **manager** → aucun des deux champs n'apparaît.

---

## Bloc 2 — Départ et réactivation (0102)

- [ ] Enregistre un départ : date + motif + commentaire → toast « Départ enregistré ».
- [ ] Il **disparaît de la liste**, un bouton `1 ancien` apparaît dans la toolbar.
- [ ] Le clic le ramène avec un badge gris **« Parti le … »**. Survole-le : motif, auteur,
      commentaire.
- [ ] Sur sa ligne : plus de « consulter en tant que », et la porte de sortie est devenue
      **↩️ Réactiver**.
- [ ] Il a disparu de **Organisation**, du sélecteur de **Repos**, et du sélecteur de chatteurs
      suivis du **Rapport police**.
- [ ] **Réactive-le** → il redevient normal partout, et peut se reconnecter.
- [ ] En base, vérifie que rien n'a été détruit :
      `select display_name, role, arrived_at, left_at from profiles where display_name = '<lui>';`

### Cas limites

- [ ] Enregistre un départ **sans motif** (si l'UI le permet) → refusé.
- [ ] Un chatteur parti **avant** le début de la période affichée en Compta **sort** de la liste
      (contrairement à 0.1, où il est parti pendant).

---

## Bloc 3 — Turnover (0103)

`/chatter/members` → onglet **Turnover**.

- [ ] Le **bandeau** annonce la période analysée et prévient que les arrivées passées ne sont pas
      renseignées.
- [ ] Change les dates dans le **sélecteur du header** → les chiffres suivent, et **tu restes sur
      l'onglet Turnover** (l'URL garde `?vue=turnover`).
- [ ] « Ancienneté moyenne » affiche **son dénominateur** (« sur N départs sur M »), ou dit qu'elle
      n'est pas mesurable si ton parti n'avait pas de date d'arrivée.
- [ ] Le graphe montre **une barre par mois** de la période — une seule sur le mois en cours.
- [ ] Le taux affiche `—` et non `∞ %` ou `NaN` si l'effectif est nul.

---

## Bloc 4 — Historique (0104)

### Fiche d'un membre

- [ ] Fais plusieurs changements sur un même membre : shift, modèle, rôle.
- [ ] Ouvre sa fiche → onglet **Historique** → les changements sont là, du plus récent au plus
      ancien, **avec ton nom** en auteur.
- [ ] Change un shift **depuis le board Organisation** → il apparaît dans sa fiche, également
      avec ton nom (chemin d'écriture différent).
- [ ] Coche « Afficher les changements de droits » → les lignes `Droits modifiés (N → M pages)`
      apparaissent. Elles sont masquées par défaut.
- [ ] Un membre sans historique affiche le message expliquant que le journal démarre aujourd'hui.

### Flux global

- [ ] `/chatter/members` → onglet **Activité** → tous les changements de l'agence, avec le nom du
      membre concerné sur chaque ligne.
- [ ] La période suit le sélecteur du header, comme le Turnover.

### Vérification en base (optionnel mais utile)

```sql
select kind, from_value, to_value,
       coalesce((select display_name from profiles where id = actor_id), 'système') as acteur
from member_events order by id desc limit 20;
```

- [ ] Les valeurs sont **en clair** (`Alice`, `soir`, `chatteur`), jamais des UUID.

---

## Bloc 5 — Non-régression

J'ai modifié des services partagés. Ces écrans ne sont pas le sujet, mais ils consomment le code
touché : un simple affichage sans erreur suffit.

| Écran | Pourquoi il est dans la liste |
|---|---|
| `/chatter/spenders` | consomme `getClosingByChatter`, dont j'ai élargi le type de retour |
| `/chatter/repos` | `getVisibleProfiles` filtre désormais les partis ; `CellChip` a gagné deux champs |
| `/chatter/organisation` | requête profils modifiée — vérifier qu'une case s'édite encore |
| `/chatter/compta` | **trois** services modifiés (période, mois, suivi) |
| `/chatter/chatters` | `ChatterRow` a gagné deux champs |
| `/chatter/rapport-police` | `getChattersByModel` filtre et transporte le drapeau |
| `/marketing/members` | **le Template a changé de signature** — la face marketing doit rester sans onglets |
| `/chatter/overview` | requête d'effectif modifiée |

- [ ] Chacun de ces écrans s'affiche sans erreur.
- [ ] Sur `/chatter/repos`, l'export PNG du planning fonctionne toujours (il dessine au canvas,
      il ne devrait pas être affecté).
- [ ] Sur `/chatter/organisation`, composer une case écrit toujours (shift + assignation).

---

## Ce que je n'ai pas pu vérifier

**Rien n'a jamais été rendu dans un navigateur.** `typecheck`, `lint`, `build` et le comportement
SQL sont verts, mais aucun de ces trois ne dit qu'un bouton est au bon endroit, qu'un dialog
s'ouvre, ou qu'une timeline est lisible. **Tout le bloc visuel de cette recette est à faire
entièrement.**

**Le ban GoTrue EST exercé** — vérifié le 02/08 sur le départ de « sam » : `banned_until` posé à
100 ans. Il ne reste qu'à confirmer qu'une tentative de connexion OTP est bien refusée côté GoTrue,
ce que la présence de `banned_until` rend très probable.

## ⚠️ ORDRE DE DÉPLOIEMENT — le seul risque grave trouvé

`getProfile` (`lib/auth/index.ts`) lit désormais `left_at`, et **n'y destructure pas l'erreur** :
`const { data } = await …`. Si le code arrive en prod **avant** la migration `0102`, la colonne
n'existe pas, la requête échoue, `data` vaut `null` — et les quatre gardes de page font toutes
`if (!profile) redirect('/login')`.

**Conséquence : l'application entière devient inaccessible**, pour tout le monde, avec une boucle
de login sans message d'erreur. 37 fichiers dépendent de cette fonction.

**Règle de merge, non négociable** : appliquer `0101` → `0104` sur la prod **AVANT** de déployer le
code.

```bash
cd packages/db
DBU=$(grep '^DATABASE_URL=' ../../.env | cut -d= -f2- | sed 's/^"//; s/"$//')
supabase db push --db-url "$DBU" --dry-run   # doit annoncer 0101, 0102, 0103, 0104
supabase db push --db-url "$DBU"
```

Puis seulement : merge de `develop` vers `main`.

## Risques connus, assumés

1. **L'historique démarre vide** — les mouvements antérieurs à aujourd'hui sont perdus.
2. **Les 109 chatteurs n'ont pas de date d'arrivée** — l'ancienneté moyenne ne portera que sur les
   départs de gens dont tu auras saisi l'arrivée.
3. **Un aller-retour (départ puis réactivation) efface le départ des stats** — `profiles` ne porte
   qu'un état courant. L'événement, lui, reste dans l'historique.
4. **La prod n'a aucune des quatre migrations** — elles partiront au merge, avec le code.
