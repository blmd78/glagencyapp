# Tracker de présence — conception

> **Statut** : conception, 2026-08-25 — à valider par Benoit avant implémentation. Décisions
> produit D1→D9 arrêtées en chat le 2026-08-25, non rediscutées ici.
>
> **Contexte** : « Chatter Tracker » est une application **en production**, indépendante de
> glagencyapp, qui mesure le temps de travail réel des chatters depuis leur poste Windows. Elle
> tourne sur un VPS Hetzner 2 Go (`178.105.220.54`, `chatterstracker.duckdns.org`) : serveur
> Fastify + `node:sqlite`, base **1,19 Go** (+ 69 Mo de WAL), servie par Caddy, `systemd` unit
> `tracker.service`. La source de la donnée est constituée de **deux applications Electron**
> — « GL Agency shift » (chatters, v1.0.12) et « GL Agency shift managers » (v1.0.10) — packagées
> avec `electron-updater` et distribuées depuis `/opt/tracker/updates/`.
>
> **Chiffres relevés sur la base de production le 2026-08-25** (fenêtre 2026-07-21 → 2026-08-25,
> soit 36 jours) :
> - **2 963 627 events**, soit **~82 300/jour**
> - répartition : `heartbeat` 1 670 418 · `focus` 1 173 351 · `idle_start` 48 236 ·
>   `idle_end` 47 461 · `shift_start` 5 476 · `shift_end` 5 298 · `model` 5 219 ·
>   `pause` 4 227 · `resume` 3 941
> - **207 chatters** (205 actifs hors alias) et **8 managers** ; **14 modèles** ; **12 comptes CRM**
>   (3 admin, 9 manager)
> - surfaces annexes quasi vides : **7 notes**, **12 sessions 1:1**, 114 rubriques, 408 tâches
>
> **Source des chiffres** : requêtes `node:sqlite` en lecture seule sur
> `/opt/tracker/data/tracker.db`, et `psql` sur les bases prod/UAT de glagencyapp. Toutes les
> ancres `fichier:ligne` de cette spec ont été relues dans les sources rapatriées.

---

## 0. Corrections préalables au brief

**0.1 — La prochaine migration est `0125`, pas `0114`.** `CLAUDE.md` affirme « prod encore à 0112
— prochaine migration = 0114 ». C'est périmé. Vérifié le 2026-08-25 :
`select version from supabase_migrations.schema_migrations order by version desc` renvoie
**`0124, 0123, 0122, 0121` sur la prod ET sur l'UAT**, et `packages/db/supabase/migrations/`
contient **124 fichiers** jusqu'à `0124_reprise_gla_login_holder.sql`. **Toute la spec parle donc
de la migration `0125`.** Le `CLAUDE.md` est corrigé dans l’incrément 1.

**0.2 — « Reprendre le design complet » veut dire le porter, pas le refaire.** Levée
d'ambiguïté en chat : *« on respecte l'archi de code et le chargement des données, on garde juste
le même front »*, puis *« intégrer ce design là complet jusqu'au style […] tout le front et
l'utilisation reste la même que leur truc »*. Il n'y a donc **aucun travail de conception
visuelle** dans ce chantier. Le rendu et les parcours sont ceux du tracker, à l'identique.

**0.3 — Le rendu d'images des rapports Discord est du code mort.** `buildReportImages`
(`src/render.js:179`) et `postDiscordImages` (`src/discord.js:4`) sont **déclarés et jamais
appelés** : `grep -rn "buildReportImages\|postDiscordImages" src/` ne renvoie que leurs propres
déclarations. Les rapports partent en **embeds JSON** via `postDiscord` (`src/discord.js:30`).
Conséquence directe : la dépendance `@resvg/resvg-js` — native Node, **incompatible avec le
runtime Workers** — ne bloque rien, et n'est pas portée.

---

## 1. La décision

### 1.1 Ce que fait le tracker aujourd'hui

Les deux apps Electron émettent 9 types d'events vers `POST /api/events`, authentifiés par un
Bearer token propre au poste. Le serveur rejoue ce flux (`src/compute.js:15`, `buildSegments`) et
en déduit des segments typés `active` / `pause` / `idle` / `off`, puis :

- **un verdict de conformité** par chatter et par fenêtre (`src/report.js:20`,
  `computeUserWindow`) : quota atteint ou non, pause au-delà de l'enveloppe (60 min par défaut),
  app jamais lancée, PC éteint en cours de shift ;
- **une attribution du temps actif par app et par domaine** (`src/focus.js:65`,
  `attributeApps`), croisée avec une liste blanche (`config/rules.json`) → le « hors tâche » ;
- **une attribution du temps actif par modèle** (`src/models.js:41`, `attributeModels`) ;
- **une détection d'écran figé** (`src/stagnant.js`) : longue plage active sans le moindre
  changement de fenêtre — le signal qui trahit un simulateur de souris ;
- **une détection multi-poste** (`src/devices.js`) : deux machines qui émettent en même temps.

Sorties : trois rapports Discord par jour (fins de shift 13 h / 21 h / 5 h, `src/index.js:29`) et
un CRM web maison (board du shift, fiche chatter, vue managers, notes de coaching, to-do hebdo,
récap, admin des comptes).

### 1.2 Les décisions

| # | Décision | Conséquence assumée |
|---|---|---|
| **D1** | **glagencyapp encaisse les events ; le VPS est éteint.** | Les deux `.exe` doivent être republiés repointés. Renversement explicite d'une première réponse (« le VPS reste collecteur »), reconfirmé en chat. |
| **D2** | **On repart de zéro.** Aucun import des 5 semaines d'historique. | Pas de comparaison avec le mois écoulé pendant les premières semaines. |
| **D3** | **L'identité est `profiles.id`.** | Les 205 comptes tracker (noms libres) ne sont pas rattachés. Chaque chatter ré-enregistre son poste depuis son profil CRM. Le rattachement rétroactif est un chantier ultérieur, s'il a lieu. |
| **D4** | **Port fidèle, jusqu'au style.** | Aucun redesign. Le rendu du tracker est reproduit ; l'apport de ce chantier est **exclusivement** l'architecture de code, le data-loading, le fetching et l'optimisation. |
| **D5** | **Les doublons fonctionnels sont portés tels quels.** | Les notes de coaching et la to-do hebdo font doublon avec la Formation et `todos`/`planning`. On ne fusionne pas, on ne supprime rien de l'existant. Arbitrage différé (« on verra pour supprimer ceux qu'on a déjà »). |
| **D6** | **Emplacement : face Chatteurs, à côté de Planning / To-do.** | Nouveau groupe de sidebar. Le libellé « Tracker » étant déjà pris par `/chatter/police`, le groupe s'appelle **« Présence »**. |
| **D7** | **Les rapports Discord sont reconstruits côté CRM.** | Le VPS ne poste plus rien après la bascule. |
| **D8** | ~~L'ingest vit dans `apps/ingestion`, Cloudflare ou Vercel à trancher.~~ **Tranché le 2026-08-27 : `apps/tracker-gateway` sur VERCEL.** | Ce n'est pas le prix qui décide, c'est le routage : un Worker Cloudflare ne peut s'attacher qu'à une zone qu'on possède, et DuckDNS ne gère que des champs A/AAAA — donc pas de CNAME, donc pas de Custom Hostname. Vercel se contente d'un champ A. Voir le plan de l'incrément 4. |
| **D9** | **Trois horizons de stockage.** | Voir §2 — c'est le principe qui rend D1 tenable. |

---

## 2. Le principe directeur : trois horizons

Porter le tracker tel quel dans Supabase signifierait y écrire **30 millions de lignes par an**.
C'est inutile : 96 % du volume est constitué de deux types d'events dont **aucun n'a besoin d'être
conservé brut**.

| Horizon | Contenu | Volume | Rétention |
|---|---|---|---|
| **Chaud — écrasé** | `tracker_live` : une ligne par poste, mise à jour à chaque battement | **~200 lignes**, stables | permanent |
| **Tiède — glissant** | `tracker_focus_raw` : les changements de fenêtre | **~32 600/jour**, ~456 k en régime | **purgé à 14 jours** |
| **Froid — définitif** | `tracker_events` (états), `tracker_shift_rows`, `tracker_focus_shift`, `tracker_model_time` | **~5 200/jour** | permanent |

**Le heartbeat (1 670 418 lignes, 46 400/jour) ne sert qu'à deux choses** : savoir qui est en ligne
maintenant, et détecter un poste qui a cessé d'émettre (`src/compute.js:82`, comparaison
`lastHeartbeat + staleMs < now`). Ni l'une ni l'autre ne demande d'historique : **un `UPDATE` d'une
ligne par poste suffit**. On passe de 17 M de lignes par an à 200 lignes écrasées.

**Le focus (1 173 351 lignes, 32 600/jour) ne sert qu'à l'attribution par app/domaine**, croisée
avec les segments actifs. Deux mesures faites sur la base réelle :

- fusionner les points consécutifs portant le même label ne gagne que **5 %** (227 311 intervalles
  pour 238 802 points sur 7 jours) — les chatters basculent en permanence entre labels
  *différents*, la fusion ne mord pas ;
- mais **agrégé** en `(chatter, jour, label)`, on tombe à **13,3 labels par chatter et par jour**,
  soit **11 411 lignes pour 7 jours → ~595 000 lignes/an**.

D'où l'horizon tiède : on garde les points bruts **14 jours** (assez pour auditer, corriger une
règle de liste blanche et recalculer), puis on ne garde que l'agrégat définitif.

**Restent les events d'état** — `shift_start`, `shift_end`, `pause`, `resume`, `idle_start`,
`idle_end`, `model` : **119 858 sur 36 jours = ~3 330/jour**, soit **1,2 M/an**. Trivial pour
Postgres, et **le calcul de `compute.js` reste rigoureusement identique** puisqu'il ne consomme
que ces types-là plus le dernier battement.

> **Bilan** : ~30 M lignes/an → **~1,9 M/an** (1,2 M d'états + 0,6 M de focus agrégé + 0,08 M de
> lignes de shift), avec une fenêtre glissante bornée de 456 k lignes. Aucune perte fonctionnelle.

### 2.1 Le point de vigilance : le dernier battement d'un shift clos

`buildSegments` a besoin du **dernier heartbeat** pour couper proprement un shift laissé ouvert par
un PC éteint. Comme les battements ne sont plus historisés, la valeur doit être figée au moment où
l'on constate la coupure : le job de fin de shift (§8) lit `tracker_live.last_heartbeat_at`, en
déduit la fin effective et l'écrit dans `tracker_shift_rows.ended_at` **avant** que la ligne live ne
soit écrasée par un nouveau shift. Une ligne de `tracker_events` de type `shift_end` synthétique,
marquée `meta->>'source' = 'server-stale'`, est également insérée pour que tout recalcul ultérieur
retrouve la même borne sans dépendre de la table live.

---

## 3. Modèle de données — migration `0125_tracking.sql`

Conventions maison respectées : `text` + `check` (**jamais** `create type … enum`), `timestamptz`,
RLS activée sur toutes les tables, écritures service-role après garde applicative.

### 3.1 `tracker_devices` — le poste, pas la personne

Remplace la table `users` du tracker **et** son mécanisme `alias_of` (multi-poste bricolé après
coup, `src/db.js:106`). Ici le multi-poste est natif : un profil peut avoir plusieurs postes.

```
id            uuid pk default gen_random_uuid()
profile_id    uuid not null references profiles(id) on delete cascade
role          text not null check (role in ('chatter','manager'))
label         text                       -- « PC bureau », « portable »
token_hash    text not null unique       -- sha256 du bearer, jamais le token en clair
machine_id    text                       -- empreinte du poste remontée par l'agent
active        boolean not null default true
created_at    timestamptz not null default now()
last_seen_at  timestamptz
```

`(profile_id, active)` indexé. Le token en clair n'est montré **qu'une fois**, à l'enregistrement.

### 3.2 `tracker_settings` — quota et jours travaillés

Le tracker portait `daily_quota_minutes` et `workdays` sur `users`. Ils appartiennent à la
personne, pas au poste — et n'ont rien à faire dans `profiles`, qui est déjà chargée.

```
profile_id           uuid pk references profiles(id) on delete cascade
daily_quota_minutes  int  not null default 480
workdays             text not null default '1,2,3,4,5'   -- ISO, 1 = lundi
```

### 3.3 `tracker_events` — les états seulement

```
id               bigint generated always as identity pk
client_event_id  text not null unique      -- idempotence, fourni par l'agent
profile_id       uuid not null references profiles(id) on delete cascade
device_id        uuid not null references tracker_devices(id) on delete cascade
session_id       text not null
type             text not null check (type in
                   ('shift_start','shift_end','pause','resume','idle_start','idle_end','model'))
at               timestamptz not null
local_date       date not null
received_at      timestamptz not null default now()
skewed           boolean not null default false
meta             jsonb
```

Index : `(profile_id, local_date)`, `(local_date)`, `(type, local_date)` — les trois que le tracker
a dû ajouter après coup pour la même raison (`src/db.js:42-52`, commentaire explicite sur les
relectures de table entière).

**`heartbeat` et `focus` sont volontairement absents du `check`.** C'est la contrainte qui garantit
que l'horizon froid ne se remplit pas par accident.

### 3.4 `tracker_live` — l'état courant, écrasé

```
device_id          uuid pk references tracker_devices(id) on delete cascade
profile_id         uuid not null references profiles(id) on delete cascade
state              text not null check (state in ('active','pause','idle','off'))
since              timestamptz
last_heartbeat_at  timestamptz not null
machine_id         text
current_model      text
```

Écrite en `insert … on conflict (device_id) do update`. **Jamais d'insert historique.**

Comme dans le tracker (`src/compute.js:106`, `liveFromEvents`), l'état « en ligne » se juge sur
l'heure de **réception serveur**, pas sur l'horloge du poste : un PC mal réglé ne doit pas
disparaître du board. `last_heartbeat_at` est donc rempli par le serveur, jamais par l'agent.

### 3.5 `tracker_focus_raw` — la fenêtre glissante

```
id          bigint generated always as identity pk
profile_id  uuid not null references profiles(id) on delete cascade
device_id   uuid not null references tracker_devices(id) on delete cascade
at          timestamptz not null
local_date  date not null
kind        text not null check (kind in ('app','domain'))
label       text not null
```

Index `(profile_id, local_date)` et `(local_date)` (pour la purge). La normalisation d'URL
(`src/focus.js:17`, `normalizeUrl`) reste **côté serveur** : elle jette query et fragment, qui
peuvent contenir des jetons. Ne jamais stocker l'URL brute.

### 3.6 Les tables de faits — l'horizon froid

`tracker_shift_rows`, clé `(profile_id, date, shift_key)`, une ligne par chatter et par shift
(**~205/jour**). Elle porte l'intégralité du verdict de `computeUserWindow` : minutes actives, de
pause, d'inactivité, pause comptée, minutes effectives, quota, minutes manquantes, nombre de
coupures, première/dernière activité, drapeaux `crashed` / `recovered` / `open_shift`, minutes hors
tâche, dépassement de seuil, minutes d'écran figé, alerte multi-poste, conformité et motifs.

`tracker_focus_shift`, clé `(profile_id, date, shift_key, kind, label)` — minutes et drapeau
`allowed` (**~1 630/jour**).

`tracker_model_time`, clé `(profile_id, date, shift_key, creator_id)` — minutes par modèle, plus
les minutes actives non attribuées (**~200/jour**).

> **Correction du 2026-08-25, sur objection de Benoit.** La première version de cette spec
> identifiait le modèle par un `model_key text` libre, repris du tracker. C'était incohérent :
> D3 impose l'identité forte `profiles.id` pour les personnes, et appliquer le texte libre aux
> modèles aurait obligé à rapprocher sur le nom — exactement le piège des doublons de casse déjà
> mesuré côté chatters (`Jerko`/`Jjerko`, `merito`/`Merito`). La colonne référence donc
> **`creators(id)`** (17 lignes en production), et l'agent enverra le `creator_id` du CRM comme il
> enverra le `profile_id`.
>
> Ce que ça débloque : la jointure directe avec `chatter_creator_daily` (CA par chatter × modèle ×
> jour), donc le **€/heure par modèle** — le croisement que ni l'un ni l'autre des deux systèmes ne
> peut produire seul. C'est la principale valeur nouvelle de l'intégration.

### 3.7 `tracker_rules` — la configuration, en base

Remplace `config/rules.json`, qui n'est pas éditable depuis l'UI et vit sur un disque qu'on va
éteindre. Une seule ligne (`id int pk check (id = 1)`), colonnes : seuils hors tâche et écran figé,
outil principal, minutes minimales sur l'outil, retard toléré, et deux `text[]` pour la liste
blanche des apps et des domaines.

> Contenu actuel à reprendre tel quel — il contient déjà `glagencyapp-web.vercel.app` et
> `gla-workflow-z5f2.vercel.app` dans les domaines autorisés.

### 3.8 Notes de coaching et to-do hebdo

Portées **à l'identique** (D5), préfixées `tracker_` pour ne pas entrer en collision avec les
tables existantes du CRM : `tracker_note_profiles`, `tracker_note_categories`, `tracker_notes`,
`tracker_sessions`, `tracker_session_topics`, `tracker_session_ratings`, `tracker_todo_templates`,
`tracker_todo_tasks`, `tracker_todo_skips`, `tracker_todo_sections`, `tracker_todo_links`,
`tracker_todo_dayoff`, `tracker_todo_weekplan`, `tracker_todo_daily`, `tracker_todo_week_notes`.

Toutes les références `user_id → users(id)` deviennent `profile_id → profiles(id)`, et les
références `account_id → crm_accounts(id)` deviennent `owner_id → profiles(id)`.

Les 6 rubriques de base (`src/notes.js:66`, `BASE_CATEGORIES`) sont reprises **mot pour mot**, y
compris leurs descriptions — ce sont celles de la Formation.

---

## 4. L'alimentation — l'ingest du CRM

> **Réécrit le 2026-08-26, deuxième fois.** La première version décrivait un contrat *poussé* vers
> un Worker ; la deuxième, un *pont* qui aspirait l'API du VPS. Les deux sont abandonnées. Décision
> de Benoit : **on refait le tracker à l'identique dans le CRM, et on n'utilise plus le VPS.** Pas de
> pont, pas de collecteur, pas de route ajoutée chez eux. **Aucune reprise d'historique** (D2).

### 4.1 Le seul point dur de tout le chantier

Les `.exe` installés sur les postes envoient leurs évènements à `chatterstracker.duckdns.org`. Tant
qu'ils pointent là, **le CRM n'a aucune donnée**, quelle que soit la qualité de ce qu'on construit à
côté. Il n'existe que deux façons d'en sortir :

1. lire le VPS — un pont, du travail jetable, et une dépendance à un tiers ; **abandonné** ;
2. **repointer les agents** — une URL à changer, puis le VPS s'éteint.

Donc les **sources du projet Electron sont le chemin critique**, pas une dépendance de fin de
parcours comme le disait le §12. Sans elles, le CRM se construit entièrement mais ne reçoit jamais
rien. C'est la seule chose à obtenir des gestionnaires du VPS ; tout le reste est déjà en main.

### 4.2 Le contrat est déjà connu — rien à demander à personne

`POST /api/events` (`src/routes.js:543-596`) est lu et documenté. L'agent envoie :

```jsonc
{
  "machine": "<identifiant de poste, optionnel>",
  "events": [
    { "id": "<uuid généré par l'agent>", "type": "shift_start", "at": "…", "sessionId": "…" },
    { "id": "…", "type": "focus", "at": "…", "sessionId": "…", "meta": { "app": "chrome", "host": "mypuls.app", "path": "/x" } },
    { "id": "…", "type": "model", "at": "…", "sessionId": "…", "meta": { "model": "CARLA" } }
  ]
}
```

`type` ∈ `shift_start | shift_end | pause | resume | idle_start | idle_end | heartbeat | focus |
model`. Lots de 500 maximum. La réponse rend `{ accepted, duplicates, rejected }` — c'est ce qui
permet à l'agent de vider sa file locale après une coupure réseau.

**Deux comportements du serveur à reproduire à l'identique**, sous peine de régression silencieuse :

1. **Le recalage d'horloge par lot** (`src/routes.js:558-565`). L'évènement le plus récent d'un lot a
   été produit ~à l'instant de l'envoi : l'écart entre son `at` et l'heure serveur donne la dérive
   de l'horloge du poste, et **tout le lot est décalé de cet écart**. Un PC à l'heure fausse ne
   fausse donc rien. Au-delà de 5 minutes d'écart, la ligne est marquée `skewed` mais **jamais
   rejetée**.
2. **L'idempotence par `id` d'agent.** L'`id` vient de l'agent ; un doublon est ignoré sans erreur.
   C'est ce qui rend la file locale rejouable. Il devient `tracker_events.client_event_id`.

### 4.3 `POST /tracker/events` — notre endpoint

Même corps, même réponse, même tolérance. Authentification par jeton de poste :
`Authorization: Bearer <token>` → `sha256` → `tracker_devices.token_hash`, `active = true`. Écriture
**service-role après vérification du jeton**, le patron déjà en place sur toute la face Formation.

Traitement, en une transaction :

1. recalage d'horloge du lot, puis pour chaque évènement :
   - états (`shift_start`, `shift_end`, `pause`, `resume`, `idle_start`, `idle_end`, `model`)
     → `tracker_events`, `on conflict (client_event_id) do nothing` ;
   - `focus` → `meta.host` (sinon `meta.app`) → `tracker_focus_raw`. L'agent envoie déjà
     `{ app, host, path }`, **jamais l'URL entière** : query et fragment, qui peuvent porter des
     jetons, ne transitent pas. `normalizeUrl` reste en garde-fou ;
   - `heartbeat` → **jeté** après mise à jour du live ;
2. `tracker_live` en `insert … on conflict (device_id) do update`, `last_heartbeat_at = now()`
   **serveur** — l'état « en ligne » se juge sur l'heure de réception, jamais sur l'horloge du poste
   (`src/compute.js:249`, `liveFromEvents`) ;
3. `tracker_devices.last_seen_at = now()`.

**Où il tourne** : ~~`apps/ingestion`~~ → **`apps/tracker-gateway`**, application Vercel distincte
(décision du 2026-08-27). Deux raisons de ne PAS le mettre dans `apps/ingestion` : ce worker-là est
un cron de nuit sur le plan Cloudflare Free (10 ms CPU, 100 k requêtes/jour) qu'un endpoint public à
~300 k requêtes/jour ferait sortir de son forfait ; et les chemins des agents (`/api/events`,
`/api/me`, `/api/models`) entreraient en collision avec ceux du CRM s'ils partageaient un
déploiement. Volume réel estimé : 3 à 4 requêtes/minute par poste actif, ~60 postes simultanés.

### 4.4 L'enregistrement d'un poste

Le tracker utilise deux secrets partagés (`SIGNUP_SECRET`, `MANAGER_SIGNUP_SECRET`) qui laissent
n'importe qui créer un compte au nom qu'il veut. Refaire ça à l'identique serait refaire un défaut.

À la place : le membre génère un **code d'enregistrement à usage unique et à durée limitée** depuis
sa page CRM, le saisit dans l'agent, l'agent reçoit son jeton de poste. C'est le **seul écart
fonctionnel volontaire** de tout le chantier, et il découle de D3 : sans identité CRM, un secret
partagé ne peut pas être remplacé.

> Si la modification de l'agent doit rester minimale, la solution de repli est de garder le secret
> partagé pour la première version et de basculer sur le code ensuite. À trancher quand les sources
> Electron seront en main, pas avant.

### 4.5 La transition, sans pont

L'agent repointé peut **envoyer aux deux adresses** pendant quelques jours : le VPS continue de
calculer, le CRM calcule de son côté, et on compare. C'est la recette parallèle du §9 — obtenue
gratuitement, puisqu'on modifie l'agent de toute façon, et **sans rien demander à personne**. Une
fois les chiffres concordants, on retire l'ancienne URL et le VPS s'éteint.

---

## 5. Le domaine — `packages/core/src/tracking/`

Le cœur de calcul du tracker est **déjà pur** : aucune I/O, aucune dépendance hors `luxon`. C'est un
portage, pas une réécriture.

| Fichier source | Destination | Rôle |
|---|---|---|
| `src/compute.js` | `core/tracking/segments.ts` | `buildSegments`, `summarize`, `liveFromEvents` |
| `src/focus.js` | `core/tracking/focus.ts` | `normalizeUrl`, `attributeApps` |
| `src/models.js` | `core/tracking/models.ts` | `attributeModels` |
| `src/stagnant.js` | `core/tracking/stagnant.ts` | écran figé |
| `src/devices.js` | `core/tracking/devices.ts` | multi-poste, `OVERLAP_ALERT_MINUTES` |
| `src/rules.js` | `core/tracking/rules.ts` | `isAllowedApp`, `isAllowedDomain` (le chargement passe en base) |
| `src/shifts.js` | `core/tracking/shifts.ts` | `SHIFTS`, `shiftWindow`, `currentShift` |
| `src/time.js` | `core/tracking/time.ts` | `dayBounds`, `fmtDuration`, `isoWeekday` |
| `src/report.js:20` | `core/tracking/verdict.ts` | `computeUserWindow` (le verdict, sans le Discord) |
| `src/managers.js` | `core/tracking/manager-day.ts` | `managerDay`, `managerCumul` — **des faits, aucun verdict** |

Typé TypeScript, testé Vitest. Les tests portent d'abord sur les cas que les commentaires du
tracker signalent comme durement acquis : horloge monotone, shift à cheval sur minuit rattaché en
entier à son jour de départ, idle horodaté au **début réel** de l'inactivité, temps actif sans
donnée de fenêtre laissé « inconnu » et **jamais** compté hors tâche.

---

## 6. Le front — port fidèle, architecture glagencyapp

### 6.1 Le thème scopé — le précédent existe déjà

`apps/web/src/app/formation-theme.css` (545 lignes) est **exactement ce cas** : reprise fidèle de
l'app Good Luck Agency, sombre en dur, sans variante claire, portée stricte sous `.gla` posée par
les pages de `/formation/*`. Son en-tête documente le principe qui nous intéresse :

> « Les tokens shadcn sont REMAPPÉS sur la palette GLA dans cette portée. C'est ce qui fait que
> tous les composants du kit prennent l'apparence GLA sans être réécrits. »

On applique le même patron : **`apps/web/src/app/tracker-theme.css`, portée `.trk`**, important le
design system du tracker (`src/detailpage.js:48-781`, 730 lignes) — fond `#0f1216`, surfaces
`#151a21`/`#1a212b`/`#222a36`, bordures `#28303c`, accent `#2fb374`, danger `#ec5a6a`, rayon 12 px,
titres en Space Grotesk, texte en Inter — puis remappant `--background`, `--foreground`, `--card`,
`--border`, `--muted`, `--destructive`… sur cette palette.

**Conséquence voulue** : on construit les écrans avec les composants shadcn du CRM (donc
l'architecture de code demandée) et ils s'affichent **exactement comme le tracker**. Les portails
(`Dialog`, `Select`) reçoivent la classe `.trk`, comme le fait déjà
`training-me/components/me-history-modal.tsx:30`.

### 6.2 Correspondance des primitives

Le front du tracker n'est pas du HTML statique : `src/detailpage.js:662` injecte un petit runtime
maison. Chacune de ses primitives a un équivalent natif dans glagencyapp — c'est **là** que se
trouve l'apport d'architecture et d'optimisation.

| Leur runtime | Équivalent glagencyapp | Gain |
|---|---|---|
| `window.go(url)` + `asFragment()` (`:648`) — navigation par fragments faite main | `<Link>` / App Router | prefetch, streaming, historique corrects, code supprimé |
| `window.post(url, body)` + `reload()` (`:677`, `:747`) | **Server Action** + `revalidatePath` | plus d'endpoint JSON à écrire ni à sécuriser une deuxième fois |
| `autoRefresh(sec)` (`:688`) | feuille client minuscule + `router.refresh()` | ne re-télécharge que le RSC payload, pas la page |
| `window.modal()` (`:763`) | `Dialog` shadcn, thémé `.trk` | accessibilité, focus trap |
| `window.saved(btn, sel)` (`:733`) | `useActionState` / `useFormStatus` | états de chargement et d'erreur réels |
| `<script>${RUNTIME}</script>` | — | supprimé |
| session cookie + `resolveViewer` (`src/auth.js`) | Supabase Auth + `requireAccess` | une seule authentification pour tout le CRM |
| `crm_accounts` + `account_models` | `profiles` + `creator-scope.ts` | un seul modèle de droits |

Les 32 attributs `onclick=` des pages notes et to-do deviennent des gestionnaires React dans des
**feuilles client**, la page restant un Server Component — convention
`app → feature(template) → composants`.

### 6.3 Routes et features

Sous `/chatter/presence/*` (D6) :

| Route | Écran d'origine | Feature |
|---|---|---|
| `/chatter/presence` | `/` et `/d/:shift/:date` (`:952`) | `tracking-board` |
| `/chatter/presence/[profileId]` | `/c/:id` (`:1188`) | `tracking-chatter` |
| `/chatter/presence/managers` | `/m/:date` (`:1090`, `:1112`) | `tracking-managers` |
| `/chatter/presence/notes` et `/notes/[id]` | `/notes` (`notespage.js:54`, `:163`) | `tracking-notes` |
| `/chatter/presence/todo` | `/todo` (`todopage.js:24`) | `tracking-todo` |
| `/chatter/presence/recap` | `/recap` (`recappage.js:19`) | `tracking-recap` |
| `/chatter/presence/config` | `/admin` (`:1250`) + `config/rules.json` | `tracking-config` |

Sidebar : nouveau `NavGroup` **« Présence »** dans la face `chatter` de `config/workspaces.ts`,
placé à côté de Planning / To-do. Le libellé « Tracker » n'est pas réutilisable : il désigne déjà
`/chatter/police`.

### 6.4 Data-loading

Conformément à `docs/guidelines-data-loading.md` :

- **La journée en cours se calcule à la volée.** Les events d'état d'un shift tiennent en quelques
  centaines de lignes et le focus brut en quelques milliers : `@glagency/core` recalcule à chaque
  rendu, comme le fait le tracker. Le live sort de `tracker_live` en lecture directe.
  **Il n'y a donc aucune latence sur le board** — c'est le bénéfice de D1 par rapport à une
  projection périodique.
- **L'historique se lit dans les tables de faits.** Au-delà du shift courant, on lit
  `tracker_shift_rows` / `tracker_focus_shift` / `tracker_model_time`, figées par le job de fin de
  shift. Aucun recalcul de 205 chatters × 90 jours à l'affichage.
- **Agrégations en RPC SQL `security invoker`.** Les vues de classement et de cumul (board du
  shift, récap hebdo, cumul managers) passent par des RPC, jamais par un `select` nu — la
  troncature à 1000 lignes est un piège documenté du repo.
- **`use cache` interdit ici** : toutes ces lectures sont bornées par la RLS et donc dépendantes du
  cookie.
- `loading.tsx` / `error.tsx` par route, `proxy.ts` inchangé.

---

## 7. Droits, RLS, périmètre

**Droit de page** : slug `presence` dans `config/workspaces.ts`. Le rapport du soir police a établi
le précédent d'un slug partagé par plusieurs pages d'un même groupe ; on fait de même ici pour que
« Présence » se coche d'une case.

**Périmètre par modèle** : on **réutilise `lib/services/creator-scope.ts`**, la règle déjà partagée
par le Tracker et la Police (manager / sous-manager / policier **avec modèles assignés** bornés à
leurs modèles via `profile_creators` ; admin, lecteurs et encadrant sans assignation voient tout).
Le tracker déduisait le périmètre en relisant les events `model` (`src/db.js:197`,
`userIdsOnModels`) — coûteux et redondant avec ce que le CRM sait déjà.

**RLS** :
- lecture de `tracker_*` : qui possède la page, plus les admins ; le cloisonnement fin par modèle
  reste **applicatif**, comme pour le rapport police ;
- un chatter lit **ses** lignes et **ses** postes ;
- écritures : service-role après garde applicative, comme toute la face Formation.

---

## 8. Rapports Discord et jobs

Trois crons Cloudflare restent libres sur les 5 du compte (2 sont pris par l'ingestion MyPuls). On
en consomme **2** :

- **`5 5,13,21 * * *`** — fin de shift. Fige `tracker_shift_rows`, `tracker_focus_shift`,
  `tracker_model_time` pour le shift écoulé (avec la borne du §2.1), puis poste le rapport Discord.
  Un seul trigger couvre les trois fins de shift, là où le tracker en planifiait trois
  (`src/index.js:29`).
- **`0 4 * * *`** — purge de `tracker_focus_raw` au-delà de 14 jours.

Le rapport reprend `buildDailyReport` (`src/report.js:157`) tel quel : deux blocs, conformes en vert
puis hors règles en rouge, barre de progression en blocs, détail des fenêtres, découpage en
plusieurs messages pour tenir les limites Discord. `postDiscord` porte déjà les reprises sur 429 et
5xx — à conserver. L'idempotence par `reports(date)` devient `tracker_reports(date, shift_key)`.

---

## 9. Bascule et extinction du VPS

La bascule est plus douce qu'annoncé : les apps sont packagées **`electron-updater`**
(`latest.yml` + `.blockmap` dans `/opt/tracker/updates/{chatters,managers}/`, servis par Caddy).
Publier une version repointée suffit — **personne ne réinstalle**.

1. Incréments 1→4 livrés ; notre endpoint d'ingest tourne, alimenté par deux postes de test.
2. Publication des `.exe` en **double envoi** (§4.5) : VPS *et* CRM. Déploiement automatique par
   l'updater, personne ne réinstalle.
3. **Recette en parallèle** : les deux systèmes reçoivent la même donnée et la calculent chacun de
   son côté ; on compare sur quelques jours. C'est le seul moment où l'on peut détecter un écart de
   calcul. Puis publication d'une version qui n'envoie plus qu'au CRM.
4. Bascule des rapports Discord sur le CRM ; le cron du VPS est désactivé.
5. Extinction du VPS.

**Réserve à traiter avant l'étape 5** : `/updates/*` est servi par le VPS. Éteindre le serveur
casse le canal de mise à jour des agents. Il faut d'abord déplacer les artefacts (R2 conviendrait,
la stack en dispose déjà) et publier une version dont l'updater pointe la nouvelle adresse.

**Hygiène à faire au passage** : `/root` contient **2,7 Go** de dumps `.db`
(`tracker-2026-08-19-1502.db`, `-1530.db`, `tracker-avant-liens.db`) sur un disque déjà chargé par
une base de 1,19 Go. À archiver ailleurs ou supprimer avant toute manipulation sur ce serveur.

---

## 10. Ce qu'on ne fait pas

- **Aucun import de données.** (D2)
- **Aucun rattachement** des 205 identités tracker aux profils CRM. (D3) — mesuré : 61 % seulement
  matchent sur le nom normalisé ; les 39 % restants sont des doublons de casse (`Jerko`/`Jjerko`,
  `merito`/`Merito`, `sam`/`sam26`/`sam2604`), des pseudos (`syd75015`, `omarion2.4_22777`), du
  mojibake (`Cité des Gamers ð¦`) et des non-chatters (`Taha - CMO`, `yan VA`).
- **Aucune fusion** avec la Formation, `todos` ou `planning`, et **aucune suppression** de
  l'existant. (D5)
- **Aucun redesign.** (D4)
- **Pas de portage des CLI** (`src/cli/*`) : leurs quatre usages sont couverts par les écrans.
- **Pas de portage du rendu d'images** — code mort. (§0.3)

---

## 11. Découpage en incréments

Comptés en PR, dans l'ordre.

1. **Socle** — migration `0125`, RLS, types régénérés, `@glagency/core/tracking` porté et testé.
2. **Ingest** — `POST /tracker/events` et `POST /tracker/register` dans `apps/ingestion`,
   `tracker_live`, enregistrement de poste côté CRM, migration `0126`. **Livrable inerte tant que
   les agents ne sont pas repointés** (§4.1).
3. **Board du shift + fiche chatter** — thème `.trk`, les deux écrans qui portent l'essentiel de la
   valeur.
4. **Fin de shift** — tables de faits, cron d'agrégation, rapports Discord, purge.
5. **Managers + récap + config des règles.**
6. **Notes de coaching.**
7. **To-do hebdo.**
8. **Bascule** — `.exe` repointés (double envoi pendant la recette, §4.5), `/updates` déplacé,
   extinction du VPS.

Les incréments 1→4 forment un système complet et utilisable ; 6 et 7 sont volontairement en fin de
file (D5).

---

## 12. Risques

| Risque | Portée | Parade |
|---|---|---|
| **Les sources Electron sont introuvables** — ni dans `~/Documents`, ni sur le VPS (qui n'héberge que les `.exe` compilés) | **Bloque la mise en service entière.** Sans elles, le CRM se construit mais ne reçoit jamais rien (§4.1) | Les demander aux gestionnaires du VPS **maintenant**, pas à la bascule. C'est la seule dépendance externe du chantier. |
| Écart de calcul entre l'ancien et le nouveau système | Fausse les verdicts, donc des sanctions | Recette parallèle (étape 3 du §9) sur plusieurs jours avant extinction. |
| Volume de requêtes sur l'ingest sous-estimé | Coût, ou throttling | ~3 requêtes/min par poste actif ; chiffre à confirmer sur les sources de l'agent. Le flush peut être ramené à 1/min au passage. |
| Croissance de `tracker_focus_raw` si la purge échoue | Disque Supabase | Purge idempotente + alerte Sentry sur le cron. |
| Le canal `/updates` meurt avec le VPS | Agents figés sur leur version | Déplacer `/updates` **avant** l'extinction (§9). |
| Deux systèmes de notes/to-do en parallèle | Confusion des utilisateurs | Assumé (D5) ; arbitrage à programmer une fois le tracking en service. |

---

## 13. À trancher plus tard

- Fusion ou suppression des doublons notes / to-do. (D5)
- Rattachement rétroactif des identités tracker. (D3)
- Rétention à long terme de `tracker_events` (1,2 M/an) — aucune purge prévue à ce stade.

---

## 14. Décisions prises pendant l'incrément 1, et ce qu'elles engagent

> Ajouté le 2026-08-25, après la revue finale de branche. Ces décisions ont été prises en cours
> d'exécution et consignées dans un journal de travail **non versionné** : elles sont repliées ici
> pour survivre à la fusion. Les ignorer coûterait cher aux incréments suivants.

### 14.1 Deux écarts VOLONTAIRES par rapport au tracker d'origine

Le portage est fidèle, **à deux exceptions près, toutes deux corrigeant un défaut qui accuse
quelqu'un à tort**. Le critère appliqué tout du long : on déroge à la fidélité quand le code
d'origine produit une **fausse accusation**, jamais pour en ajouter une.

**a) Détection d'écran figé — garde par segment de travail.** Dans le tracker en production, le
garde anti-absence-de-donnée compte les changements de fenêtre sur **toute la période**, pas par
segment. Deux notifications d'application pendant une pause suffisent donc à ouvrir la porte, après
quoi une plage de travail dépourvue de toute donnée est signalée « écran figé » sur sa durée
entière — mesuré : **240 minutes signalées** sur un segment sans la moindre trace. Le portage
applique le garde **par segment actif**.

> **Conséquence pour la recette en parallèle (§9, étape 3) : les deux systèmes DIVERGERONT sur ce
> point, volontairement.** Un écart sur les écrans figés n'est pas une erreur de portage. Un second
> faux positif de la même famille est corrigé au passage : un segment dont les changements de
> fenêtre tombent exactement sur ses bornes n'est plus signalé.

**b) `stagnantOver` reste hors du verdict automatique.** Conservé tel quel — le code d'origine
l'énonce : « un cas à vérifier, pas une règle automatique ». L'écran figé alerte un humain, il ne
sanctionne jamais seul.

### 14.2 Trois pièges pour l'incrément 3 (le front)

- **Ne jamais lire « aujourd'hui » isolément dans la vue des encadrants.** Un encadrant dont la
  session a démarré la veille et court toujours a une journée d'aujourd'hui **entièrement vide** —
  conséquence exacte de la règle « un shift appartient à son jour de départ ». Le seul champ qui le
  rattrape est `live`, le seul qui ne soit pas borné au jour. Sans ce croisement, une personne au
  travail s'affiche comme absente.
- **Ne pas afficher `switches` et `overlapMinutes` côte à côte sans filtre.** Une entrée
  « changement de poste » est produite pour **tout** chevauchement, pas seulement pour une vraie
  bascule. Les deux signaux sont justes séparément ; ensemble ils se contredisent. Le filtre est une
  décision d'affichage — masquer une bascule qui tombe dans une plage de chevauchement.
- **Ne jamais afficher `overlapMinutes` brut au-delà de deux postes.** Il additionne les
  chevauchements deux à deux : à trois postes il vaut 180 minutes là où le double comptage réel est
  de 120. Pour « temps compté en trop », utiliser `somme des minutes − unionMinutes`.

### 14.3 Deux corrections à porter dans la migration `0126` (incrément 4)

- **`untracked_minutes` est mal placé.** Il vit aujourd'hui sur `tracker_model_time`, dont la clé
  exige un `creator_id`. Un chatter qui ne sélectionne jamais de modèle ne produit donc **aucune
  ligne**, et ses minutes non attribuées sont perdues — alors que c'est précisément le cas qui
  intéresse un encadrant. Le champ appartient à `tracker_shift_rows`. Non corrigé dans `0125` :
  celle-ci est déjà appliquée sur la préproduction, et l'amender exigerait de dépiler l'historique
  à la main — le geste qui a déjà désaligné ce projet une fois.
- **`shift_key` accepte `'jour'` en base** mais le type `ShiftKey` ne couvre que les trois shifts.
  La vue journalière de l'incrément 4 exigera d'élargir le type.

### 14.4 Un garde-fou à prévoir sur l'écran de configuration (incrément 5)

Vider la liste blanche depuis l'interface basculerait **toute l'agence en « hors tâche »** : un
tableau vide est traité comme une liste valide, pas comme une absence. Mesuré : `normalizeRules`
avec des listes vides rend 470 minutes hors tâche sur l'outil de travail principal. **Critère
d'acceptation bloquant de l'écran de config** : la Server Action doit refuser d'enregistrer une
liste d'applications vide. Pas de contrainte en base — une configuration « aucune app, que des
domaines » reste légitime.

### 14.5 Un point de recette à ajouter au §9

**Vérifier sur un poste réel qu'une coupure d'alimentation en cours de shift ne se traduit pas par
du temps crédité.** Le code d'origine, porté fidèlement, ferme un shift resté ouvert **à l'instant
du redémarrage suivant**, sans contrôle de fraîcheur : un PC éteint à 10 h et rallumé à 16 h crédite
six heures de travail, sans aucun signal. La seule défense est que l'agent émette un `shift_end`
marqué `recovered` au relancement — comportement que les sources Electron, indisponibles à ce jour
(§12), n'ont pas permis de vérifier.

### 14.6 Correction d'une contradiction interne à cette spec

Le §5 nomme `managerCumul` et `computeUserWindow` ; le code livré expose `sumManagerDays` et
`computeWindowVerdict`. Le type `Verdict` y est devenu `TrackerVerdict` (`recruit/rules` exportait
déjà `Verdict` dans le barrel de `@glagency/core`).
