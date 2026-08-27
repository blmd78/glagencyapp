# Tracker de présence — Incrément 4 : l'ingest et la bascule

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Servir nous-mêmes `chatterstracker.duckdns.org`, pour que les 205 postes écrivent dans
notre base **sans qu'un seul soit touché**. À la fin de cet incrément, changer une ligne DNS suffit
à basculer tout le monde — et à revenir en arrière en une minute.

**Spec:** `docs/superpowers/specs/2026-08-25-tracker-presence-design.md` §4 (réécrit le 2026-08-26).

**État à l'ouverture :** les cinq écrans sont livrés (incrément 3) et vides. Le domaine appartient
encore au VPS. Les accès serveur sont fournis ; **le token DuckDNS ne l'est pas** — c'est la seule
pièce manquante, et rien ne bascule sans elle.

---

## Deux décisions prises avant d'écrire une ligne

### 1. Vercel, et non Cloudflare — la spec D8 est INVERSÉE

D8 choisissait un Worker Cloudflare sur un calcul de volume. Ce calcul reste vrai, mais il est hors
sujet : **techniquement, Cloudflare ne peut pas servir ce domaine.**

Un Worker s'attache à `workers.dev` ou à une zone qu'on possède *dans Cloudflare*. `duckdns.org`
n'est pas notre zone. La seule voie serait Cloudflare for SaaS (Custom Hostnames), qui impose un
**CNAME** vers l'origine de repli — or DuckDNS ne gère que des enregistrements **A/AAAA**.

Vercel, lui, se contente d'un champ A : on ajoute le domaine au projet, Vercel rend une IP, émet le
certificat par validation HTTP, et route sur le nom d'hôte. C'est exactement le geste que la
bascule demande.

Coût : ~8 à 10 M d'invocations/mois (≈ 3 à 4 requêtes/minute par poste actif, ~60 postes
simultanés), soit quelques dollars de dépassement au-delà du forfait Pro déjà payé. L'ordre de
grandeur est le même que chez Cloudflare ; ce n'est donc pas le prix qui tranche, c'est le routage.

### 2. Une application séparée, pas une route du CRM

L'ingest vit dans **`apps/tracker-gateway`**, projet Vercel distinct du CRM, avec son propre
domaine. Trois raisons :

- les agents appellent `/api/events`, `/api/me`, `/api/models` — des chemins qui **entreraient en
  collision** avec ceux du CRM s'ils partageaient un déploiement ;
- rayon de souffle : un mauvais déploiement du CRM ne doit pas couper le pointage de 205 personnes,
  et réciproquement ;
- le CRM sert des pages authentifiées derrière un `proxy.ts` ; la passerelle sert des requêtes
  machine sans cookie. Deux régimes, deux applications.

Écart assumé par rapport à la spec §4.3, qui plaçait l'ingest dans `apps/ingestion` : ce worker-là
est un **cron** de nuit sur le plan Free (10 ms CPU, 5 crons, 100 k requêtes/jour). Y greffer un
endpoint public à 300 k requêtes/jour le ferait sortir du forfait et coupler deux choses qui n'ont
rien à voir.

---

## Task 1 : Ce que l'agent attend de nous, relevé sur leur serveur

**Prérequis : l'accès SSH** (`ssh-copy-id` à lancer une fois). Sans lui, la tâche 3 se fait à
l'aveugle.

- [ ] Récupérer `/opt/tracker/src/db.js` — il contient **la fonction de hachage des jetons**. Sans
      elle, on ne peut pas reconnaître un agent qui se présente avec son jeton actuel.
- [ ] Récupérer la table `users` (205 lignes) : `name`, `discord_id`, `token_hash`, `role`,
      `daily_quota_minutes`, `workdays`, `active`. **Aucun évènement.**
- [ ] Récupérer `/etc/caddy/Caddyfile` — savoir exactement quels chemins sont servis et comment,
      avant de les reprendre.
- [ ] Copier `/opt/tracker/updates/` (canal `electron-updater` : `latest.yml`, `.blockmap`, `.exe`).
- [ ] Relever la taille réelle du canal : elle décide si on sert les binaires depuis Vercel ou
      depuis un stockage objet avec redirection.

---

## Task 2 : La passerelle — `apps/tracker-gateway`

Six routes, toutes déduites de leur `src/routes.js` (relevé, documenté §4.2 de la spec).

- [ ] `POST /api/events` — le cœur. Corps `{ machine, events[] }`, lots de 500 max, réponse
      `{ accepted, duplicates, rejected }`.
      **Reproduire à l'identique deux comportements**, sous peine de régression silencieuse :
      1. le **recalage d'horloge par lot** (`src/routes.js:558-565`) — l'écart entre l'évènement le
         plus récent et l'heure serveur est retranché à tout le lot ; au-delà de 5 min, la ligne est
         marquée `skewed` mais **jamais rejetée** ;
      2. l'**idempotence par `id` d'agent** — un doublon est ignoré sans erreur, c'est ce qui permet
         à l'agent de rejouer sa file après une coupure réseau.
- [ ] `GET /api/me` — nom, quota, minutes du jour, `serverTime`, `needsName`.
- [ ] `PATCH /api/me` — le chatteur pose son nom d'affichage.
- [ ] `GET /api/models` / `POST /api/models` — la liste déroulante des modèles.
- [ ] `POST /api/signup` — enregistrement d'un poste. **Les deux secrets partagés d'origine sont
      repris tels quels** pour la bascule : changer le protocole d'enregistrement le jour J
      ajouterait une inconnue à un moment où l'on veut zéro inconnue. Le code à usage unique (§4.4)
      viendra après, quand le système sera stable.
- [ ] `/updates/*` — servi ou redirigé vers le stockage objet, selon la taille relevée en tâche 1.
- [ ] Journal : chaque jeton inconnu est tracé avec son empreinte, pour être rattaché en trente
      secondes plutôt que découvert trois jours plus tard.

---

## Task 3 : Les identités

- [ ] Migration `0128` : `tracker_identities` (nom tracker, empreinte du jeton, rôle, quota, jours,
      `profile_id` nullable) — la table de correspondance entre leur monde et le nôtre.
- [ ] Script d'import de l'export de la tâche 1.
- [ ] **Écran d'admin « Identités tracker »** : les 205 lignes, appariement proposé sur le nom
      normalisé, le reste à la main. Compteur `n/205` bien visible.
- [ ] **Garde-fou de bascule : on ne change le DNS que quand le compteur affiche 205/205.** Tant
      que ce n'est pas le cas, rien ne coule et rien n'est perdu.
- [ ] Repli si l'export est refusé : servir `needsName: true` aux jetons inconnus — leur propre
      application affiche alors l'écran « choisis ton nom », sans qu'on la modifie. *(Déduit de
      `src/routes.js:601`, à vérifier sur deux postes avant de s'y fier.)*

---

## Task 4 : La bascule

- [ ] Deux postes de test repointés à la main (fichier `hosts`) sur la passerelle, une journée
      complète. Comparer chiffre à chiffre avec le board du VPS.
- [ ] **Token DuckDNS obtenu** — la pièce manquante.
- [ ] Créneau calme convenu. Changement du champ A vers l'IP Vercel.
- [ ] Vérification dans les dix minutes : les évènements arrivent, `tracker_live` se remplit, le
      board du CRM bouge.
- [ ] Le VPS reste allumé quelques jours en filet. Puis extinction — **qui exige le compte Hetzner,
      non transmis à ce jour.**
- [ ] Après bascule : régénérer le webhook Discord et les deux codes d'inscription, qui ont circulé
      en clair.

---

## Self-review

- [ ] Le recalage d'horloge est testé sur un lot volontairement décalé (avance ET retard).
- [ ] Un lot rejoué deux fois ne crée aucun doublon.
- [ ] Un jeton inconnu produit une réponse propre et une trace, jamais une erreur 500.
- [ ] Le retour arrière est écrit noir sur blanc : ancienne IP, délai de propagation, qui appelle qui.
