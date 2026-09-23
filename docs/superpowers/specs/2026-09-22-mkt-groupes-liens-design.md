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

## Avenant 2026-09-23 — épingler le manuel, rejouer le reste (`0169`)

**Bug** : un groupe « SNAP + DA » créé pour séparer les liens `SNAP_HAPPN` restait vide, donc
absent de l'écran Liens (une section sans lien n'y est pas affichée) — recréé une seconde fois par
dessus. Deux causes cumulées :

1. Créer un groupe ne relisait que la file « À classer ». Les trois `SNAP_HAPPN`, rangés dans
   Snapchat **par la règle**, n'avaient aucune raison d'en sortir : la promesse « un lien rangé
   ailleurs ne bouge jamais » interdisait de découper un groupe.
2. Le nouveau groupe partait en priorité 100, derrière Snapchat (10) : même les liens à venir
   seraient restés dans Snapchat.

**Correctif** :
- `mkt_links.type_manual` : posé par le menu de la ligne. **Seuls les liens épinglés sont figés** ;
  les autres suivent les règles, rejouées sur eux à chaque création ou modification de groupe.
  La migration épingle les **13 liens** dont le groupe diffère de ce que donnent les règles
  (mesuré sur la prod) — `funnel_tiktok_tg` en Telegram alors que la règle dit TikTok, etc. : ce
  ne peut être qu'un choix humain.
- Priorité **5** par défaut pour un groupe créé à la main, devant les groupes d'origine.
- Nom unique parmi les groupes actifs.

**Vérifié par simulation sur les 361 liens de la prod** : un groupe « happn » en priorité 100
déplace 0 lien (le bug) ; en priorité 5, exactement les 3 `SNAP_HAPPN`, rien d'autre.
