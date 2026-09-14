# Limite d'essais par exercice — design

Date : 2026-09-14 · Demande : Benoit (avec Gourou) · Statut : validé, livré dans la même journée

## Pourquoi

Sur le 1er → 14 septembre, **80,8 % du coût IA de l'entraînement vient des rejeux** (411 $ sur
511 $) : un chatteur actif lance 28 sessions par jour en médiane, jusqu'à 187. Le classement
hebdomadaire additionne la meilleure note de chaque exercice : rejouer jusqu'à monter sa note est
payant. « Si il rejoue 10 fois, c'est qu'il n'a pas compris » — au lieu de spammer, un manager
vient expliquer, puis redonne des essais.

## La règle

- Chaque exercice (solo, défi, boss) porte un **maximum d'essais** en base :
  `training_cases.max_attempts`, **3 par défaut**, réglable exercice par exercice dans le Catalogue.
- **Un essai = une session terminée** : `scored`, `failed` (solo raté sur chrono ou faute
  éliminatoire), ou `abandoned` **sans thread ouvert** (défi/boss fermé par `expireSession`, tous
  chronos dépassés). Les abandons MANUELS du passé (threads encore `open`) ne comptent pas : ils
  étaient autorisés à l'époque.
- **L'historique compte**, sauf la reprise GLA (`legacy_id is not null`) — même règle que la roue.
- **Essais disponibles = `max_attempts` + essais redonnés** par un manager.
- Le bouton **« Abandonner » disparaît** : une session lancée va au bout (on la reprend si on
  quitte la page).

## Le manager

- Fiche chatteur de l'Overview Formation : par exercice, `utilisés / disponibles` et un champ
  « + N » (1 par défaut, 1 à 20) avec un bouton « Redonner ».
- Autorisés : porteurs de `frm-suivi` (managers, sous-managers) et admins, sur tous les chatteurs.
- Chaque déblocage est une ligne de `training_attempt_grants` : qui, quand, combien, pour qui, sur
  quel exercice.

## Données (migration 0161, additive)

- `training_cases.max_attempts smallint not null default 3 check (1..50)`.
- `training_attempt_grants(id, profile_id, case_id, extra 1..20, granted_by, created_at)` — RLS
  lecture : l'intéressé, `frm-suivi`, admin ; **aucune politique d'écriture** (service-role après
  garde, comme le reste de la Formation).
- `training_attempts(p_profile) → (case_id, used, granted)`, `security invoker` : lu par la page
  Modules, l'Overview et la garde de `startSession`.

## Où c'est appliqué

- **Serveur** : `lib/training/start-session.ts` refuse le lancement quand il ne reste aucun essai
  (après la reprise d'une session active, qui reste toujours possible).
- **Chatteur** : liste des exercices (`cases-list.tsx`) — « Essais 2/3 », bouton « Essais épuisés »
  désactivé et message « demande à ton manager ».
- **Règle pure** : `attemptState` dans `@glagency/core` (testée), lue par l'UI et la garde.

## Conséquences assumées

- Au lancement : 1 582 couples chatteur × exercice bloqués, 120 chatteurs sur 135 (médiane 5
  exercices, max 66). Les managers auront du déblocage à faire dès le premier jour.
- Un exercice bloqué sous 60 empêche le tour de roue du module tant qu'un manager n'a pas redonné
  d'essai — voulu.
- La migration 0161 passe en prod avant la 0160 (Récap, autre session) : celle-ci passera avec
  `--include-all`.
