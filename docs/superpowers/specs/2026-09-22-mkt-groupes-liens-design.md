# Groupes de liens marketing — design (2026-09-22)

## Demande

Benoit : « autre ne doit plus exister, pour ça que tous les groupes doivent être créés et
repérés et créés dynamiquement si besoin, et ajouter dans le bon groupe aussi dynamiquement,
et pouvoir les moove manuellement si une erreur arrive ».

## Le fait qui contraint tout

**La seule matière disponible pour classer un lien, c'est son NOM** — celui que le pôle
marketing tape dans MyPuls.

- 306 des 361 liens n'ont **aucune url** en base ;
- les 55 restantes pointent toutes vers `mym.fans/app/t/<hash>` : la destination, jamais la
  provenance.

Une trentaine de liens s'appellent `Alicedasilvaa`, `carl.alaprof`, `cours2carla`. Aucune règle
ne peut inventer leur plateforme, et « créer un groupe dynamiquement » pour eux fabriquerait un
groupe par pseudo — pire que pas de groupe.

**Conséquence assumée** : la case résiduelle ne disparaît pas, elle change de nature. « Autres »
devient **« À classer »** : une file d'attente qu'on vide d'un clic, pas un placard. Elle reste
vide tant que les liens sont nommés proprement — c'est une consigne d'équipe (préfixer `SNAP_`,
`TT_`, `IG_`), pas du code.

## Architecture

**`mkt_link_groups` (0167)** — un groupe est une LIGNE, plus une union TypeScript :

| Colonne | Rôle |
|---|---|
| `key` | ce que porte `mkt_links.type` (clé étrangère, `on update cascade`) |
| `label`, `color` | l'affichage ; la couleur se choisit dans une palette fermée |
| `pattern` | motif lisible **par Postgres (`~*`) et par JS** — pas de syntaxe propre à l'un |
| `priority` | ordre d'évaluation : c'est lui qui fait que `SNAP_TIKTOK` est un lien Snap |
| `is_fallback` | la file d'attente, une seule ligne, non supprimable |
| `auto` | né d'un motif repéré par l'ingestion — à relire |
| `deleted_at` | suppression douce : sans elle, l'auto-création ressusciterait au scrape suivant |

`mkt_links.type` perd son `check` figé. Ajouter une source ne demande plus ni migration ni
déploiement.

**La règle, pure et testée** (`@glagency/core`, `marketing/link-group.ts`) :

- `detectLinkGroup(name, groups)` — premier motif qui reconnaît le nom, par priorité croissante.
  Un motif **illisible est ignoré** plutôt que fatal : ces motifs se saisissent dans un écran,
  et une parenthèse oubliée ne doit pas coûter la nuit d'ingestion.
- `suggestLinkGroups(names, known, min = 3)` — les motifs récurrents que personne n'a déclarés.
  Exige un **préfixe alphabétique suivi d'un séparateur** (`REDDIT_x`, `CRM-y`) : sans cette
  contrainte, `Alicedasilvaa` et `Alicegabii` feraient naître un groupe par lien. `known` couvre
  les groupes supprimés.

**Ingestion** — lit les groupes, range les liens NEUFS (jamais les existants : un lien déplacé à
la main ne repart pas), puis relit la file d'attente et crée les groupes suggérés (priorité 500+,
après les règles écrites par un humain) en y basculant les liens concernés. Le run rend
`newGroups` et le journalise.

**Web** — les groupes descendent de la page jusqu'au menu de déplacement de chaque ligne. Le
sélecteur de type, qui ne proposait encore que les quatre types de 0018, liste désormais tous les
groupes. Écran de réglage hors sidebar : `/marketing/liens/groupes` (lien « Groupes » depuis
l'écran Liens, même parti pris que les Réglages du Relevé MyPuls).

## Couleurs

Le choix est **fermé à huit teintes** validées ensemble par le validateur dataviz (paires
adjacentes : ΔE 8,3 au pire sous protanopie, 20,5 en vision normale). Un sélecteur libre
laisserait choisir deux bleus indiscernables sans que rien ne prévienne. Un groupe sans couleur
en reçoit une **libre** (`withColors`, pure et testée) ; la file d'attente garde le neutre ; au
delà de huit, le neutre — une couleur répétée est moins grave qu'une couleur indiscernable.

L'anneau de répartition ne montre que les **4 premières sources**, le reste agrégé : sur 9
séries, le validateur mesure ΔE 1,3 entre bleu et violet en deutéranopie et 10,8 entre lime et
émeraude en vision normale (seuil 15).

## Droits

Lecture et déplacement lien par lien : le pôle marketing, comme avant. **Réglage des groupes :
admin** (`adminGuard`) — un motif range tous les liens à venir et une priorité peut basculer un
groupe entier. C'est de la structure, pas un geste quotidien.

## Écarts connus

- Les règles Telegram/Twitter ne sont pas rejouées sur l'existant (cf. 0166) : `CLEMENT_TG`
  reste dans la file d'attente jusqu'à ce que quelqu'un le déplace.
- Modifier le motif d'un groupe ne reclasse pas les liens déjà rangés — c'est dit dans le
  dialogue d'édition.
