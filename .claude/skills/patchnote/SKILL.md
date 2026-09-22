---
name: patchnote
description: >
  Use when Benoit demande un patchnote, des notes de version, un récap de mise à jour
  ou « ce qui change » à annoncer à l'équipe de l'agence — typiquement après une
  release ou un merge sur main.
---

# Patchnote pour l'équipe

Annonce de mise à jour destinée aux **chatteurs, managers et admins de l'agence** —
pas à des développeurs. Ils veulent savoir ce qui change dans leur travail
aujourd'hui, en trente secondes.

## Rassembler la matière

```bash
git log <dernière-release>..main --oneline    # ou main..develop avant merge
```

Ne garder que ce qui **se voit ou se fait** à l'écran. Écarter migrations, refactors,
tests, renommages internes : ils n'existent pas pour l'équipe.

Vérifier au passage s'il y a un **changement de droits** (qui peut faire quoi) — c'est
le point qu'on oublie et celui qui génère des questions.

## La forme

Un titre, puis **une ligne par changement**, et rien d'autre :

```markdown
# 🚀 CRM — mise à jour du 3 août

**✨ Nom du changement** — Ce qu'on fait, à l'impératif ou à l'infinitif. Ce qui se
passe ensuite. Un détail utile s'il évite une question.

**⚠️ Managers** — Vous ne pouvez plus supprimer un compte, seulement enregistrer un
départ. La suppression définitive est réservée aux admins (comptes créés par erreur).

**🔧 Correctif** — Le symptôme qu'ils ont vu. Réglé.
```

Règles de la ligne :
- **titre en gras avec un emoji**, puis un tiret cadratin, puis deux à trois phrases
- décrire le **geste** (« coche la case sur sa fiche »), pas la fonctionnalité
- une ligne = un changement ; six lignes maximum
- les changements de **droits** et les **correctifs** ont leur propre ligne, en fin

## Ce qui ne va pas dedans

Les mots `migration`, `RLS`, `trigger`, `RPC`, `commit`, `déploiement`, un nom de
fichier, un nom de table, un numéro de version. Si une phrase ne peut pas se dire à
voix haute devant un chatteur, elle sort.

Pas de section « détails techniques » en bas non plus : elle attire l'œil et personne
n'en a l'usage.

## Ce qu'on dit quand même

Ce qui **enregistre l'activité des gens** (historique, journal, traçabilité) se dit
franchement, en une phrase, avec la raison. Le cacher est pire : quelqu'un ouvrira
l'onglet et se demandera depuis quand.

Exemple validé : « À partir d'aujourd'hui, chaque modification sur un membre est
enregistrée avec son auteur. Ce n'est pas de la surveillance — c'est pour retrouver
qui a changé quoi quand une erreur se glisse quelque part. »

## Avant de rendre

Proposer à Benoit d'**avertir séparément** les personnes qui perdent un droit : elles
le découvriront sinon au premier geste bloqué.

Le patchnote se rend **dans la réponse**, prêt à copier-coller — pas dans un fichier,
sauf demande.
