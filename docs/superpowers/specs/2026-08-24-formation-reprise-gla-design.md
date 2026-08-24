# Reprise des données Good Luck Agency — conception

> **Statut** : conception, 2026-08-24 — à valider par Benoit avant implémentation. Décisions
> produit D1→D7 arrêtées en chat le 2026-08-24, non rediscutées ici.
> **Contexte** : Good Luck Agency (GLA) est la plateforme d'entraînement **encore en production**
> (17 260 sessions, 235 comptes, 82 chatters actifs sur 7 jours, ~996 sessions/jour la dernière
> semaine, historique du 2026-07-28 au 2026-08-24). La face Formation de glagencyapp reprend le
> même catalogue (7 modules, 85 cas) : **80/80 codes de cas joués sur GLA existent dans
> `training_cases`**, les **22 clés d'axes** et les **6 étapes de boss** sont identiques. Un chatter
> qui bascule sans reprise perd tout son historique (médiane 27 sessions, p90 216, max 399) et
> voit « Ma formation » à zéro alors qu'il a joué des centaines de fois.
> **Source des chiffres** : 5 rapports de cartographie du journal `wf_1be86420-dc2` + vérifications
> sur disque et sur la base UAT, 2026-08-24. Les ancres `fichier:ligne` ont été relues.

**Correction préalable au brief** : la prochaine migration n'est **pas 0115** mais **0123**.
`packages/db/supabase/migrations/` contient **122 fichiers** jusqu'à `0122_wheel_menage_octroi.sql`,
**tous appliqués sur l'UAT** (vérifié : `select version from supabase_migrations.schema_migrations
order by version desc` → 0122, 0121, 0120). Les migrations de recrutement citées « 0125/0126 » dans
les commentaires du code ont été **consolidées dans `0113_formation.sql`** (sections `[ex-01xx]`).
**Toute la spec parle donc de la migration 0123.**

**Correction préalable n°2 — le modèle de la roue a changé le jour même de la rédaction.**
`0121_wheel_tirage_encadrant.sql` et `0122_wheel_menage_octroi.sql` (commitées en `83ff4da`,
appliquées en UAT le 2026-08-24) posent une règle nouvelle : **« le tour n'est plus GAGNÉ, il est DONNÉ »**
— l'encadrant ouvre la roue, choisit un chatteur, lance le tirage. `0122` **supprime** tout
l'appareil d'octroi automatique : `training_wheel_grant_due`, `_grant_open_weeks`, `_grant_week`,
`training_wheel_pending`, **`training_trophy_grant`**, `training_wheel_weeks_open`,
`training_wheel_ranking_raw` (vérifié en UAT : les seules fonctions `training_wheel*` /
`training_trophy*` restantes sont `training_weekly_ranking` et `training_wheel_spin_journal`).
Côté web, `lib/services/trophy-grant.ts`, `wheel-grant.ts` et `wheel-pending.ts` sont supprimés et
les `after(grantWheelTicketsIfDue)` / `after(grantTrophyTickets)` ont disparu de
`formation/layout.tsx` et `ma-formation/page.tsx`.

**Conséquence structurante : D6 est désormais satisfaite par construction.** Il n'existe plus aucun
canal d'octroi automatique, donc **plus aucun ticket ne peut tomber sur du passé importé** — ni par
le classement hebdo, ni par les trophées. Toute la mécanique de neutralisation (calcul A / B \ A,
tickets pré-consommés, `trophy_key`, index `training_wheel_tickets_trophee_uidx`, le chiffrage
1 700–2 500 €) **est retirée de cette spec** : elle visait des fonctions qui n'existent plus, et une
0123 qui les `create or replace` les **ressusciterait**. Ce qui subsiste de D6 tient en une ligne et
une seule : **§3.6**.

**Ordre de bataille** : 0121 et 0122 sont commitées et déjà en UAT ; elles doivent être **déployées
en production AVANT** la première réclamation (0122 casse la page Roue de la version actuellement en
ligne — son propre en-tête l'indique). La reprise GLA se pose **par-dessus**, jamais avant.

---

## 1. Le problème et la décision

### 1.1 Le problème

**Instantané de référence : 2026-08-24 vers 11 h (Paris).** La base GLA est vivante — tout chiffre
de sessions dérive de quelques dizaines par heure. Les comptages de contrôle de §8 doivent donc
toujours être **recomptés à la source au moment du test**, jamais comparés aux chiffres figés ici.
Les trois dénominateurs qui circulent dans ce document (17 258 / 17 259 / 17 260) sont trois
instantanés successifs du même corpus ; à 11 h le compte était **17 312**.

| Fait | Mesure |
|---|---|
| Sessions GLA, corpus entier | **≈ 17 300** (17 312 à 11 h ; dérive mesurée 17 254 → 17 260 en 14 min) |
| dont **réclamables** (login présent dans `chatters`) | **≈ 16 580** — le reste est orphelin (§3.5) |
| Comptes GLA | **235**, dont **221 avec ≥ 1 session** et **14 sans aucune** ; **82 actifs sur 7 jours** |
| Logins distincts dans `sessions` | **229**, dont **8 sans compte** (les orphelins) |
| Volume par chatter | min 1 · p25 11 · **médiane 27** · p90 **216** · p99 353 · **max 399** · moyenne 75,4 |
| Lignes à écrire, **corpus réclamable** | **≈ 365–375 k** (16,6 k sessions + 16,8 k threads + ~300 k messages + 16,8 k scores + 60 k axes) |
| Poids source | **57 Mo** de JSON (`sessions.history` 23 Mo + `sessions.score` 23 Mo) |
| Catalogue commun | **7 modules, 85 cas** ; 80 cas joués ; **0 `case_id` inconnu du catalogue** |
| Profils glagencyapp | **201** (197 actifs, 176 chatteurs) · `training_sessions` en prod : **2** |

*(« 221 comptes avec ≥ 1 session » corrige une lecture fautive : les **229** logins distincts de
`sessions` incluent les 8 orphelins, ils ne comptent donc pas 229 comptes. Vérifié :
`select count(*) from chatters c where not exists (select 1 from sessions s where s.login = c.login)`
→ **14**.)*

Le catalogue est identique cas par cas : la reprise est une **traduction de format**, pas une
migration fonctionnelle. Ce qui la rend délicate, ce sont trois choses : (a) aucune clé de jointure
entre les deux bases, (b) des contraintes `check` de notre schéma que les données GLA violent,
(c) une base source **en production active** et **qui fait confiance à son client** (§5.11) — donc
une entrée hostile, pas un fichier de données.

### 1.2 Pourquoi pas un rattachement par e-mail

`chatters.extra` porte un e-mail sur **10 comptes sur 235** (4,3 %) — 10 identifiants Discord,
1 nom, 0 téléphone. Côté glagencyapp, 201/201 profils ont un e-mail, mais **aucun ne se recoupe**
avec GLA. Le rapprochement par nom est une heuristique : la mesure « 55 des 82 actifs GLA n'ont
pas de compte apparent dans glagencyapp » a été obtenue par normalisation alphanumérique des
logins contre `display_name` — **non fiable nominativement**, à ne pas utiliser comme clé.

### 1.3 Les décisions

**D1 — Le rattachement est une AUTO-RÉCLAMATION.** Le chatter, déjà connecté sur glagencyapp,
saisit son **ancien login GLA + son ancien mot de passe**. Vérification côté serveur.
*Justification* : c'est la seule preuve de propriété disponible et elle est solide —
`sha256(salt + ':' + password)` vérifié sur **235/235** comptes, sel de 16 hex et hash de 64 hex
sur 235/235, **0 collision de login insensible à la casse**, 0 login à espaces parasites. Le
mot de passe est la seule information que seul le propriétaire connaît.

**D2 — Les admins créent les comptes normalement.** Aucune collecte d'e-mails n'est organisée,
ce n'est pas notre rôle. La réclamation est simplement **disponible dès qu'un compte existe** :
on livre la fonctionnalité d'abord, les comptes suivent au fil de l'eau.
*Justification* : 92 comptes GLA authentiquement nouveaux depuis le 07/08, en vagues hebdo de 16
à 26 — le parc bouge trop vite pour figer une liste de correspondances.

**D3 — Pas de bascule, pas de gel, pas de copie préalable.** L'import est déclenché **au moment de
la réclamation**, en **lecture directe** sur la base GLA. L'import est **idempotent** : une
resynchronisation ultérieure est gratuite si le chatter a rejoué entre-temps.
*Justification* : la fenêtre de gel coûterait cher (le trafic ne descend jamais sous ~15 sessions/h,
même à 04 h ; choisir l'heure du gel vaut ~200 sessions) et n'apporte rien — le chatter **quitte**
une plateforme pour l'autre, ses données sont fraîches par construction. Corollaire : il n'existe
**pas d'« import unique »**, l'import est fractionné en N passes étalées dans le temps.

**D4 — Périmètre : TOUT l'historique du chatter réclamant.** Sessions, transcriptions, scores,
notes d'axes, moments (annotations pédagogiques). Rien de partiel, rien de « depuis telle date ».

**D5 — Fidélité 100 %, aucune troncature.** Deux contraintes sont relâchées dans la migration
0123 (détail §4.3) : le plafond de longueur de `training_messages.body`, et la borne basse de
`training_messages.media_price`.
*Justification* : 59 messages GLA dépassent 1 000 caractères (max **101 764**) et 196 médias ont
été envoyés gratuitement. Tronquer, c'est produire une transcription mensongère dans un outil dont
tout l'usage est pédagogique.

**Les exceptions à D5, énumérées.** « Aucune troncature » vaut pour les **transcriptions et les
notes**. Quatre pertes résiduelles subsistent, toutes chiffrées et toutes assumées — elles sont
listées ici parce qu'une spec qui dirait « seule exception » en aurait trois de trop :

| Perte | Volume | Pourquoi on l'accepte |
|---|---|---|
| Prix de média non entier (8,50 €) → **9** | **1 message** | `media_price` reste `integer` ; changer le type pour une ligne serait de la dette |
| `moments` stocké en **`string`** → `[]` | **111 sessions** | `training_thread_scores.moments` est un tableau lu par `.map()` : y ranger une chaîne casserait l'écran de score. La note et le commentaire, eux, sont conservés |
| Clés de moments **non canoniques** écartées (`cite2`, `type_field`, `probleme2`) | quelques unités | Aucun champ d'accueil ; les retenir polluerait `momentZod` |
| **4 clés fantômes** à la racine de `score` (`moments2`, `commentaire2`, `commentaire_fin`, `moments_note`) | **4 sessions** | Résidus d'un format mort côté GLA, sans équivalent chez nous |

**D6 — La roue ne paie JAMAIS l'historique importé.** Rien n'est distribué sur le passé repris.
**Depuis 0121/0122, D6 est satisfaite par construction** : il n'existe plus aucun octroi automatique
de tour — ni classement, ni trophées. Il reste **un seul canal indirect**, et il passe par un
humain : l'encadrant lance la roue en regardant le **classement hebdomadaire affiché**. Ce
classement doit donc exclure les sessions reprises (détail §3.6). C'est tout ce que D6 exige encore.

**D7 — Rattachement manuel admin.** Filet pour les **36 comptes `recovered` jamais reconnectés**,
dont le propriétaire ne connaît probablement pas le mot de passe régénéré. Il vit dans la page
**Membres**, à côté du rattachement de dossier de recrutement qui existe déjà
(`features/members/recruit-link.ts`).
*Justification* : 111 comptes GLA ont été fabriqués en masse avec un mot de passe aléatoire
`secrets.token_urlsafe(6)` rendu à l'admin dans la réponse HTTP (`serveur.py:1277-1284`) ; **75**
ont un `last_login` non nul (le propriétaire a reçu son mot de passe, l'auto-réclamation marchera),
**36** ne se sont jamais reconnectés.

---

## 2. Parcours utilisateur

### 2.1 Le chatter — où il voit l'entrée

Un **encart** en haut de `/formation/ma-formation`, au-dessus de l'historique, **visible uniquement
si le profil n'a encore rien réclamé** (`training_legacy_claims` absent pour ce profil) :

> **Vous veniez de l'ancienne plateforme ?**
> Récupérez votre historique d'entraînement : vos sessions, vos scores et vos conversations.
> [ Récupérer mon historique ]

**Trois états, pas deux.** L'encart en a un troisième, et c'est celui qu'on oublie :

| État en base | Ce que voit le chatter |
|---|---|
| Aucune ligne `training_legacy_claims` | l'encart d'appel ci-dessus |
| Ligne avec `last_sync_at` **non nul** | « Historique repris de l'ancienne plateforme le 24/08/2026 — 214 sessions. [ Resynchroniser ] » |
| Ligne avec `last_sync_at` **`null`** (import jamais mené à son terme) | « **Récupération interrompue** — votre historique n'est repris qu'en partie. [ Reprendre la récupération ] » |

Le troisième état est le mécanisme de reprise sur incident (§3.3) : il doit se **dire**, sinon un
import coupé s'affiche « repris — 0 sessions », ce qui est un mensonge. Tant que `last_sync_at` est
`null`, **`sessions_count` n'est pas affiché** (il ne veut rien dire) et le bouton porte le libellé
« Reprendre », pas « Resynchroniser ».

Pendant qu'un import est en cours (`sync_started_at` récent, §4.2), le bouton est **désactivé** avec
la mention « Récupération en cours… ».

**Un seul point d'entrée** dans toute l'application (pas de doublon sur `/formation/modules` ni
dans le menu). Droit requis : `frm-entrainement`.

*Cas assumé* : un porteur de `frm-suivi` **sans** `frm-entrainement` (encadrant ex-chatter) ne voit
jamais l'encart. C'est voulu — l'encart vit dans « Ma formation », qui est la page du chatter. Son
recours est le filet admin D7.

### 2.2 Le formulaire

Dialog, deux champs, un bouton. Aucun lien « mot de passe oublié » (GLA n'a pas de récupération
en libre-service).

| Champ | Contrainte | Fondement |
|---|---|---|
| **Identifiant sur l'ancienne plateforme** | 1 à **64** caractères, `trim()` appliqué côté client ET serveur | `max(length(login))` sur les 235 comptes = **17** — la borne est large exprès, elle n'est là que pour arrêter un envoi absurde |
| **Mot de passe sur l'ancienne plateforme** | 1 à **128** caractères, champ `type="password"` | `max(length(pw_plain))` sur les 235 = **16** (§7.2) |

Les deux bornes sont **très au-dessus du maximum réel mesuré** : c'est délibéré. Une borne serrée
refuserait un légitime derrière le message générique de §2.3, donc indébogable.

Le bouton passe en état de chargement (`ActionButton` piloté par `isSubmitting`) et le dialog
reste ouvert jusqu'au verdict. Un import de 399 sessions dure quelques secondes : l'attente est
annoncée dans le bouton (« Récupération en cours… »).

### 2.3 Les messages, mot pour mot

**La règle** : tout ce qui se produit **avant** la preuve du mot de passe rend **un seul et même
texte**. Sinon la réclamation devient un oracle qui permet d'énumérer les 235 logins existants,
puis de les attaquer (4 mots de passe GLA sont le login lui-même, 6 font ≤ 4 chiffres).

| Situation | Message affiché |
|---|---|
| Login inconnu de `chatters` | **« Identifiants introuvables. »** |
| Login connu, mot de passe faux | **« Identifiants introuvables. »** |
| Login connu mais `salt`/`pw_hash` vides (jamais observé, 0/235 — garde défensive) | **« Identifiants introuvables. »** |
| Trop de tentatives (fenêtre glissante, par profil) | « Trop de tentatives. Réessayez dans quelques minutes. » |
| **Login gelé** (`LEGACY_LOGIN_FROZEN`, §7.5) | **« Trop de tentatives. Réessayez dans quelques minutes. »** — le **même texte** que la ligne au-dessus, mot pour mot |
| Verrouillage après 10 échecs cumulés | « Récupération bloquée. Contactez un administrateur. » |
| GLA injoignable (base éteinte, réseau) | « L'ancienne plateforme est momentanément injoignable. Réessayez dans quelques minutes. » |
| **Resynchronisation trop rapprochée** (cooldown, §7.5) | « Historique déjà synchronisé récemment. Réessayez dans une heure. » |
| **Import interrompu** (dépassement de `maxDuration`, coupure réseau en cours d'écriture) | « Récupération interrompue — une partie de votre historique est déjà en place. Relancez pour terminer. » |
| **Preuve OK**, mais cet identifiant est déjà rattaché à **un autre profil** | « Cet identifiant est déjà rattaché à un autre compte. Contactez un administrateur. » |
| **Preuve OK**, mais ce profil est déjà rattaché à **un autre identifiant** | « Votre compte est déjà rattaché à l'identifiant « ancien-login ». Contactez un administrateur pour le modifier. » |
| **Preuve OK**, compte GLA **sans aucune session** (14 comptes concernés) | « Compte retrouvé — aucune session à reprendre. » L'encart passe en état « rattaché », `sessions_count = 0` |
| **Succès, première réclamation** | « Historique repris : **214 sessions**, **68 cas**, **3 812 messages**. » |
| **Succès, resynchronisation avec du neuf** | « **12 nouvelles sessions** reprises. » |
| **Succès, resynchronisation sans rien de neuf** | « Votre historique est déjà à jour. » |
| **Écart de comptage** (lu chez GLA ≠ écrit chez nous, §3.9) | « Récupération incomplète — un administrateur a été alerté. » — **jamais** « déjà à jour » |

**Pourquoi les deux lignes « Preuve OK » peuvent être explicites** : elles ne sont atteignables
qu'**après** avoir fourni le bon mot de passe. Elles ne divulguent donc rien qu'un attaquant ne
sache déjà, et elles évitent d'enfermer un utilisateur légitime dans un message opaque. Toutes les
autres restent strictement indifférenciées — **y compris le gel par login** : lui donner un texte
propre le transformerait en signal (« ce login est activement ciblé »), donc en outil de
reconnaissance.

**« Votre historique est déjà à jour » est un message dangereux** et n'est rendu qu'après la
vérification de §3.9. Sans elle, il est le message le plus rassurant de la liste servi à quelqu'un
dont l'historique est chez un autre profil — un vol indétectable par sa victime.

Les deux cas de collision partent aussi **en Sentry** et laissent une ligne dans
`training_legacy_claim_attempts` : ce sont les seules situations où quelqu'un de légitime peut
rester bloqué, l'admin doit les voir.

L'erreur serveur s'affiche sur la clé `'root'` du formulaire avec `role="alert"`
(`docs/guidelines-standard-feature.md:288-294`).

### 2.4 L'admin — le filet manuel (D7)

Dans le **dialog Membre** de la page Membres (face Chatteurs), un bloc **« Ancienne plateforme »**
placé à côté du bloc de rattachement de dossier de recrutement existant :

- si le membre n'a rien de rattaché : un champ « Identifiant Good Luck Agency » + bouton
  **Rattacher**. **Aucun mot de passe demandé** — l'admin est déjà l'autorité ;
- si le membre est rattaché : la ligne « Rattaché à « Login » le 24/08 — 214 sessions », un bouton
  **Resynchroniser** et un bouton **Détacher**.

**Le champ n'est pas un champ libre.** §1.2 établit qu'il n'existe ni e-mail ni nom fiable : sans
aide, l'admin tape à l'aveugle un login parmi 235, dont **151 ont des majuscules** et **6 du
non-ASCII**. Une faute de frappe donne un échec ; une faute *plausible* rattache le mauvais
historique **et brûle le `login_key`**, qui est unique. Donc, obligatoirement :

1. **Autocomplétion serveur** — `select login from chatters where login ilike $1 || '%' limit 10`,
   autorisée par le `grant select (login, …)` de §6.4, servie par une Server Action admin (jamais
   une route publique : c'est un annuaire de 235 logins attaquables).
2. **Aperçu de confirmation avant validation** — « `Axel93` — 214 sessions, dernière le 23/08 » ;
   ou « déjà rattaché à **Marie D.** ». L'admin confirme un fait, pas une chaîne de caractères.

**Messages du chemin admin** — distincts de ceux du chatter, et **explicites** : l'argument
d'oracle de §7.4 ne s'applique pas, l'admin est déjà l'autorité, et un message opaque le laisse
sans moyen de comprendre.

| Situation | Message |
|---|---|
| Login absent de `chatters` | « Aucun compte « xxx » sur l'ancienne plateforme. » |
| Login déjà rattaché à un autre profil | « « xxx » est déjà rattaché à **Marie D.** Détachez-le d'abord. » |
| Ce membre est déjà rattaché ailleurs | « Ce membre est déjà rattaché à « yyy ». Détachez-le d'abord. » |
| Compte sans session | « Compte rattaché — aucune session à reprendre. » |
| GLA injoignable | « L'ancienne plateforme est injoignable — réessayez plus tard. » |
| Import interrompu | « Récupération partielle (N sessions) — relancez « Resynchroniser » pour terminer. » |

**Le chemin admin exécute la chaîne d'import COMPLÈTE**, sans raccourci : mêmes bornes de validation
(§5.11), même vérification de comptage (§3.9), même recalcul d'agrégats (§3.8), même `UPDATE` de
streak (§3.7), même ordre §5.9. C'est le chemin qui traite les 36 comptes `recovered` : s'il
court-circuitait une étape, c'est par lui que la reprise fuirait.

Garde : `requireAdminProfileLive()` — **admin strict**, jamais « qui a la page Membres ». Un manager
porteur de la page Membres ne voit pas le bloc **et se le voit refuser côté serveur** ; le suffixe
`Live` refuse en outre l'action en mode « en tant que ».

Les trois opérations écrivent une ligne dans `member_events` avec un **nouveau `kind`**
(§4.7) — **surtout pas `'lien'`**, qui désigne le lien MyPuls et rien d'autre.

**Détacher** est destructif et le dit : « Supprime les 214 sessions reprises de l'ancienne
plateforme. Les sessions jouées ici ne sont pas touchées. » (mécanique §7.6). Il est **refusé si GLA
est injoignable** — sans la source, l'opération serait irréversible.

---

## 3. Règles fonctionnelles

### 3.1 Vérification d'identité

```
key      = login.trim()                                                        // trim côté JS
row      = select login, salt, pw_hash from chatters where lower(login) = lower($1)   // lower() côté SQL
candidat = sha256_hex(row.salt + ':' + password)            // UTF-8, 1 itération
ok       = timingSafeEqual(hex→Buffer(candidat), hex→Buffer(row.pw_hash))
```

**`login` est ramené EN MÊME TEMPS que le sel et le hash, et c'est structurant** : c'est le `login`
exact ainsi obtenu qui sert ensuite à lire les sessions (`where login = $1`, §6.4) — jamais un
`lower(login) = …` sur `sessions`, qui coûterait un balayage complet de 57 Mo à chaque réclamation
**sur une base en production**. C'est aussi lui qu'on stocke en `login_display` (§4.2) pour
l'affichage.

- **Algorithme exact de GLA** : `hashlib.sha256((salt + ":" + (pw or "")).encode("utf-8")).hexdigest()`
  — `serveur.py:579-580`. Séparateur `:` littéral, une seule itération, pas de HMAC, pas de KDF,
  pas de poivre, aucun repli legacy. `hash_pw` n'apparaît qu'aux lignes 579, 915, 1101, 1133, 1280.
- **`lower()` côté SQL, pas côté JS** : 6 logins contiennent du non-ASCII et 151 des majuscules ;
  `String.toLowerCase()` et `lower()` Postgres ne suivent pas les mêmes règles Unicode. GLA cherche
  déjà ainsi (`db.py:238-242`, index `idx_chatters_lower_login`, `db.py:139`). Le `trim()` reste
  côté JS (0 login à espaces en base, mais l'utilisateur peut coller).
- **`timingSafeEqual`, jamais `!==`.** GLA compare en clair (`serveur.py:915`) ; aucune raison de
  reproduire la faiblesse.
- **Coût constant** : si le login n'existe pas, calculer quand même un sha256 sur un sel factice
  avant de refuser. Sans ça, le temps de réponse est un oracle d'existence.
- **Garde défensive** : `salt` et `pw_hash` sont `text` **nullables** au schéma GLA
  (`db.py:127-129`). `if (!salt || !pw_hash) → échec générique`, même si le cas n'existe pas
  aujourd'hui (0/235).
- **Ne jamais lire ni copier `pw_plain`.** La colonne existe et contient les 235 mots de passe en
  clair côté GLA. Elle est inutile à la vérification et sa lecture ne ferait qu'élargir la surface
  de fuite. Le rôle Postgres dédié (§6.4) ne doit **pas** avoir le `select` dessus.

### 3.2 Unicité

Deux contraintes, tenues **par la base**, pas par le code :

1. **Un identifiant GLA n'est réclamé qu'une fois** — `training_legacy_claims.login_key` est
   `unique`.
2. **Un profil ne réclame qu'un identifiant** — `training_legacy_claims.profile_id` est la clé
   primaire.

Patron : `0079_profiles_chatter_id_link.sql:7` (`uuid unique references … on delete set null`,
confirmé en UAT : `profiles_chatter_id_key UNIQUE CONSTRAINT`).

**Règle normative : aucune lecture de `training_legacy_claims` avant le verdict de la preuve.**
Un pré-check applicatif en tête de handler est gratuit, tentant, et **ruine tout le travail
anti-énumération de §2.3** : il suffirait alors de saisir `sophie22` + n'importe quoi pour obtenir
« Cet identifiant est déjà rattaché à un autre compte » — l'attaquant énumère les 235 logins **et**
apprend lesquels restent à voler, sans même consommer une tentative d'échec. L'ordre est **figé** :

```
claim_begin (rate-limit)  →  lecture GLA  →  vérification du mot de passe  →  claim_settle
```

Le pré-check d'unicité **et** le rattrapage du `23505` vivent tous les deux **dans `claim_settle`**,
donc dans la même transaction, donc après la preuve — patron `lib/chatter-link.ts:31-50` : entre la
lecture et l'écriture, une autre réclamation peut avoir pris la place.

**La réservation est posée AVANT l'import**, pas après : sinon deux profils qui réclament le même
login en parallèle importeraient tous les deux 17 k lignes avant de découvrir le conflit.

### 3.3 Idempotence et resynchronisation

Deux leviers, **les deux nécessaires** :

- **UUID v5 déterministe** dérivé de l'identifiant GLA de la session, pour les identifiants
  primaires : `uuidv5(NS_GLA, 'gla:session:' + glaId)`, `… + ':t' + position`,
  `… + ':t0:m17'`. La PK devient la clé d'idempotence et `on conflict (id) do nothing` couvre
  sessions, threads et messages sans une seule requête de lecture préalable.
  `sessions.id` GLA est un **texte de 20 caractères** (7 vieilles lignes en 14), **unique sur les
  17 259**, jamais nul, **0 doublon** — bonne source. Node n'a pas d'UUID v5 natif : ~12 lignes de
  sha1 + masques de version/variante, aucune dépendance.
- **`training_sessions.legacy_id text`** + index unique partiel. Nécessaire parce que l'UUID v5
  ne rend **pas la provenance interrogeable en SQL** — or c'est le **seul levier du filtre
  du classement hebdo** (§3.6) **et du contrôle de comptage** (§3.9). Deux rapports sur cinq
  disaient `legacy_id` optionnel : c'est faux dès lors que D6 existe.

**Il n'existe aujourd'hui aucune unicité métier sur `training_sessions`** (vérifié : PK sur `id`,
index non uniques sur case/module/profil, unique partiel `status='active'` seulement). Rejouer un
import sans idempotence **double `attempts`** dans `training_case_bests` et fausse `active_days` —
un doublon n'est pas neutre.

**Resynchronisation** : le même bouton, le même code. Les sessions déjà importées sont ignorées
(`do nothing`), les nouvelles s'ajoutent, les agrégats sont recalculés. Elle est aussi le
**mécanisme de reprise sur incident** : si l'import s'interrompt au milieu (timeout, panne réseau),
la ligne `training_legacy_claims` existe déjà avec `last_sync_at` à `null`, l'utilisateur relance
et l'import termine ce qui manque (état affiché, §2.1).

**Vérifié, plus une déduction** : GLA n'expose **aucun** chemin de modification d'une session
existante. `db.py` ne contient que deux écritures sur `sessions` — `add_session` (`db.py:302`,
`INSERT … ON CONFLICT(id) DO NOTHING`) et `add_sessions_bulk` (`db.py:316`, même clause) — plus une
suppression, `delete_session` (`db.py:312`). `grep -in "update sessions" db.py serveur.py` ne rend
**aucune ligne**. Le `do nothing` ne peut donc pas figer une version périmée : chez GLA non plus, une
session ne change jamais après son écriture.

*Corollaire du `DELETE`* : une session supprimée côté GLA **après** notre import reste chez nous.
C'est assumé — la resynchronisation ajoute, elle ne réconcilie pas. Le détachement admin (§7.6) est
le seul geste destructif.

**Un import ne peut pas se chevaucher avec lui-même.** Double-clic, deux onglets, ou admin et
chatter qui lancent au même instant : les lignes sont protégées par le `do nothing`, mais les
recalculs d'agrégats et l'`UPDATE` de streak s'entrelaceraient sur deux états différents. Parade :
`training_legacy_claims.sync_started_at` (§4.2) est posé au démarrage et effacé à la fin ; un import
démarré depuis moins de **5 minutes** fait refuser le suivant (`LEGACY_SYNC_RUNNING`), et le bouton
est désactivé côté UI. Cinq minutes, pas plus : au-delà, c'est un import mort et il faut pouvoir
reprendre.

### 3.4 Ce qui est importé

Deux colonnes, et **c'est la seconde qui compte** : 730 sessions (4,2 %) sont orphelines et **ne
seront jamais réclamées par personne** (§3.5). Les tests de comptage de §8.3 se calent sur elle.

| Table cible | Corpus entier | **Réclamable** (ce qui sera réellement écrit) |
|---|---|---|
| `training_sessions` | ≈ 17 300 | **≈ 16 580** |
| `training_threads` | ≈ 15 500 (solo, 1/session) **+ 1 990** (398 boss × 5) | ≈ 14 900 **+ ~1 900** |
| `training_messages` | ≈ 282 300 hors boss **+ 28 921** dans le boss | ≈ **270 000** **+ ~27 700** |
| `training_thread_scores` | ≈ 15 500 **+ 1 990** | ≈ 14 900 **+ ~1 900** |
| `training_thread_axis_scores` | ≈ 62 200 | ≈ **59 700** |
| **Total** | ≈ 380–390 k lignes | **≈ 365–375 k lignes** |

*(La colonne « réclamable » applique la proportion mesurée des orphelines, 4,2 % : c'est de
l'arithmétique, pas une mesure par table. Elle n'a pas besoin d'être exacte — elle existe pour que
personne ne compare un import réel à un total qui inclut des lignes inatteignables.)*

Le compte exact des messages **n'est pas connu** : les cinq rapports donnent 282 224 / 282 249 /
282 273 / 282 373 / 282 425 / 282 765, sans consensus **y compris à l'intérieur d'un même
rapport**. Retenir l'ordre de grandeur et **recompter à l'import** — la réclamation compte ce
qu'elle écrit, elle n'a pas besoin d'un chiffre préalable.

### 3.5 Ce qui est perdu, et pourquoi

| Perte | Volume | Cause |
|---|---|---|
| **Sessions orphelines** | **730 (4,2 %)**, 8 logins | Le login existe dans `sessions` mais plus dans `chatters` — `db.py:250-253` fait `DELETE FROM chatters WHERE login <> ALL(...)` à chaque sauvegarde, sans FK vers `sessions`. **Ni sel ni hash** → personne ne pourra jamais les réclamer, quel que soit le mécanisme. Perte antérieure à nous, assumée. Sessions rattachables : **16 532** |
| **Transcriptions boss/arène vides** | **1 789 sessions**, dont **1 391** sans même `boss_details` | `serveur.py:1173` écrit `"history": []` en dur pour le boss. Sur les 1 789, seules **398** portent des `boss_details` exploitables. Les 1 391 autres existeront comme session notée (elles comptent dans `boss_best` / `boss_done`) mais **sans aucun thread ni message** — écran de résultat vide, **pas de crash** : `result-view.tsx` prend `const single = data.threads[0]` (`:26`) puis n'y touche qu'en `single?.` (`:88`), et la branche non-solo `.map()` sur un tableau vide (`:101`) |
| **704 arènes de module rangées sous le boss** | 704 = 622 + 82 | `arenaFinish()` (`index.html:2229`) appelle `/api/formation/boss-save` pour les **deux** modes, et `boss-save` (`serveur.py:1154-1176`) force en dur `caseId="boss_final"`. **Indiscernables ligne à ligne** → `boss_best` / `boss_done` seront **surévalués** pour qui a fait des arènes. Corollaire : les 5 codes d'arène (`set_arena`, `trans_arena`, `renc_arena`, `neg_arena`, `rel_arena`) sont exactement les 5 seuls codes du catalogue **jamais joués**, et **aucune session importée ne portera `kind = 'arena'`** |
| **Motif d'élimination** | toutes les sessions ratées | `training_threads.lost_reason` est absent de GLA : aucun token `[[ELIM:` dans les 282 k messages. Tous les **fils** importés seront donc `status = 'done'` (jamais `'lost'`) — les **sessions**, elles, sont insérées en `status = 'scored'`, §5.1. Les écrans « Raté » (`FailedView`, `FAULT_LABELS`) ne s'appliqueront à aucune |
| **Durées, horodatage des messages** | toutes | GLA n'horodate aucun message et ne mesure aucune durée de session. `ended_at = started_at`, tous les messages d'une session portent le même instant, **l'ordre vient de `position`** |
| **`metrics.wpm` / `latency` / `msgs`** | 14 198 objets | Détail §9.1 |
| **`chatters.modules`** | 235/235 à `'[]'` | Mécanisme de déblocage **mort** : court-circuité au login (`serveur.py:926-929`), à l'entrée admin (934-936) et sur `/api/formation/catalog` (942-943). Rien à importer |
| **`sessions.extra`** | 0 ligne non vide | Colonne fourre-tout jamais utilisée |
| **448 paires de « continuations »** (~2,9 %) | — | Session ultérieure dont l'historique **préfixe littéralement** une session antérieure du même couple (mécanisme de reprise, `index.html:1668-1692`). **Gonfle `attempts` et duplique du transcript.** Aucune heuristique fiable pour les distinguer d'un vrai rejeu → assumées |

### 3.6 Neutralisation de la roue (D6) — ce qu'il en reste

**Presque plus rien, et c'est une bonne nouvelle.** La version initiale de cette section décrivait
deux canaux d'octroi automatique à neutraliser — le classement hebdo rétroactif (≈ 31 €) et
l'octroi rétroactif des trophées (1 700 à 2 500 €). **Les deux ont été supprimés par 0122** le jour
même : `training_wheel_ranking_raw`, `training_wheel_weeks_open`, `training_wheel_grant_*`,
`training_wheel_pending` et `training_trophy_grant` sont `drop`ées, et les appels
`after(grantWheelTicketsIfDue)` / `after(grantTrophyTickets)` ont disparu du code web. Depuis 0121,
**un tour est donné par un encadrant**, jamais gagné par un agrégat.

Donc : **aucune insertion de session, si ancienne soit-elle, ne peut plus créer un ticket.** D6 est
tenue par le schéma, pas par une parade. Il ne reste **ni calcul A / B \ A, ni ticket pré-consommé,
ni `trophy_key`, ni plancher de semaine à relever**. Toute cette machinerie est retirée de la spec —
et une 0123 qui « corrigerait » ces fonctions les **ressusciterait**, ce qui serait le seul vrai
moyen de rouvrir la fuite.

#### Le canal qui subsiste : le classement hebdomadaire affiché

`training_weekly_ranking(p_week)` **reste** — 0122 le dit explicitement (« le classement hebdo est
toujours affiché dans Ma formation, il ne donne simplement plus de tour »). Elle ne paie plus rien
**mécaniquement**. Mais dans le nouveau modèle, **c'est l'écran que l'encadrant regarde pour décider
à qui donner un tour**. Un chatter qui importe 400 sessions apparaîtrait en tête d'un classement
hebdomadaire qu'il n'a pas disputé chez nous, et l'encadrant paierait — par la main, ce que la base
ne paie plus.

**C'est le seul geste D6 qui reste** : ajouter `and s.legacy_id is null` dans la CTE `best` de
`training_weekly_ranking(p_week)`.

- **La définition en vigueur est `0113_formation.sql:1778`** (section `[ex-0124]`), **pas** `:1694`
  qui est la version d'origine écrasée par un `create or replace` plus bas dans le même fichier.
  Reprendre la 1778 **à l'identique** (elle porte la clause `'frm-entrainement' = any(p.pages)` et
  la clause de visibilité, toutes deux indispensables) et n'y ajouter que le filtre.
- Cette fonction agrège **directement `training_sessions`** : aucun trigger n'est sollicité, elle
  change d'avis au simple INSERT. C'est ce qui rend le filtre nécessaire — et suffisant.

**Conséquence d'affichage, à trancher par Benoit (une ligne, pas un chantier).** Le filtre est
absolu : un chatter qui réclame un mercredi voit ses sessions GLA du lundi et du mardi **disparaître
du classement de la semaine en cours**, alors qu'elles comptaient sur GLA. C'est le prix de
l'équité — un classement à moitié importé n'est comparable à rien. L'alternative (ne filtrer que les
sessions antérieures à la réclamation) rouvre exactement la porte que D6 ferme. **Recommandation :
filtre absolu.** À confirmer.

**Ce qui n'est PAS filtré, et c'est voulu (D4)** : `training_refresh_stats` (points, `boss_best`,
`cases_done`, `active_days`), `training_module_ranking` (0119) et l'Overview des encadrants.
L'historique repris **doit** compter dans la progression et les meilleurs scores — c'est toute la
raison d'être de la reprise. Seul ce qui **décide d'un versement** est filtré.

**Corollaire à ne pas perdre de vue** : ces agrégats-là, eux, restent forgeables (§5.11 et §7.8) —
et depuis 0121, un classement forgé est un classement qui influence un encadrant.

*(Hors D6, décision séparée : offrir un tour « bienvenue » à chaque réclamant — §9.6.)*


### 3.7 Le streak — la parade obligatoire

`training_refresh_stats` (redéfinition en vigueur, `0113_formation.sql:1510-1578`) calcule le
streak **de façon incrémentale et dépendante de l'ordre** :

```sql
if    v_last is null or v_last < v_day - 1 then v_streak := 1;
elsif v_last = v_day - 1                   then v_streak := coalesce(v_streak, 0) + 1;
else  v_streak := coalesce(v_streak, 1);
```

Trois raisons pour lesquelles c'est faux sur un import :

1. **Ordre-dépendant** : rejouer les couples (profil, cas) dans l'ordre naturel de l'import produit
   une valeur **arbitraire**, jamais la plus longue série réelle.
2. **`last_active_day` ne recule jamais** : l'upsert écrit
   `greatest(coalesce(v_last, v_day), v_day)`. Importer une session ancienne après une récente ne
   rejoue jamais la série.
3. **La lecture « effective » filtre** :
   `case when s.last_active_day >= (now() at time zone 'Europe/Paris')::date - 1 then s.streak_days else 0 end`
   (`0113:1402, 1420, 1457`). Un historique dont le dernier jour actif est ancien affiche **0**
   quoi qu'il arrive.

**Parade** : après l'import, **un `UPDATE` dédié** de `training_profile_stats.streak_days` et
`last_active_day`, calculé en SQL depuis les **jours civils Europe/Paris distincts** de
`training_sessions` (`status = 'scored' and total is not null`) : plus longue série consécutive se
terminant au **dernier jour actif**, et `last_active_day` posé en cohérence.

**Ce qui n'est PAS affecté** : `active_days` est recalculé **depuis les faits** dans la même
fonction — `count(distinct (scored_at at time zone 'Europe/Paris')::date)` (`0113:1553-1555`),
correct quel que soit l'ordre. Idem `cases_done`, `avg_total`, `points`, `boss_best`, `boss_done`,
qui dérivent tous de `training_case_bests`.

**Pourquoi ça compte au-delà de l'affichage** : le streak alimente les trophées `streak_3` /
`streak_7` (`rules.ts:59-60`) et la fiche que l'encadrant regarde. Depuis 0122 un trophée ne paie
plus de tour, donc un streak faux ne coûte plus d'argent — il ment simplement sur quelqu'un, dans
l'outil dont c'est toute la fonction. La parade reste obligatoire pour cette raison-là.

### 3.8 Le recalcul des agrégats — sans lui, l'écran reste à zéro

La **version en vigueur** du trigger `trg_training_session_scored` est celle de
`0116_formation_audit.sql:21-31` (vérifiée par `pg_get_triggerdef` en UAT), pas celle de `0113:1240` :
`AFTER UPDATE OF status, scored_at, **total, objective_reached** ON public.training_sessions`. La
conclusion est inchangée et c'est elle qui compte : **`AFTER UPDATE` — un INSERT ne le déclenche
jamais.** Insérer 16 500 lignes `status = 'scored'` produit **0 déclenchement** :
`training_case_bests` et `training_profile_stats` restent vides, et **Ma formation, le classement et
l'Overview affichent zéro malgré 16 k sessions en base**.

C'est un **avantage** — on maîtrise le moment du recalcul — mais il doit être explicite :

```sql
select public.training_refresh_stats(p_profile := …, p_case := …, p_at := <max(scored_at) du couple>);
```

- Signature vérifiée : `(p_profile uuid, p_case uuid, p_at timestamptz)`, `security definer`,
  `set search_path = public, pg_temp`, `revoke … from public, anon, authenticated` (`0113:1226`)
  → service-role obligatoire.
- **Granularité : une fois par couple (profil, cas)**, avec `p_at = max(scored_at)` du couple.
  Pour un chatter médian (27 sessions) ≈ **20 appels** ; pour le maximum (399 sessions,
  ~150 couples distincts) ≈ **150 appels**. Sur tout le corpus, ≈ **7 000** (les rapports donnent
  6 877 / 6 981 / 6 983 — écart non expliqué, ordre de grandeur seulement, à recompter).
- **Ces appels ne partent PAS un par un depuis Node.** Chaque `rpc()` supabase-js est un
  aller-retour HTTP distinct, et chacun refait un
  `count(distinct (scored_at at time zone 'Europe/Paris')::date)` sur **toutes** les sessions notées
  du profil (`0113:1553-1555`) : 150 allers-retours séquentiels, c'est le budget de temps de §6.2 qui
  saute. **La migration 0123 livre donc une RPC d'enrobage :**

  ```sql
  training_legacy_refresh_all(p_profile uuid) returns integer
  -- boucle en SQL sur les couples (profile_id, case_id) distincts des sessions du profil,
  -- appelle training_refresh_stats(profile, case, max(scored_at)) pour chacun, rend le nombre
  -- de couples traités. security definer, service-role seulement.
  ```

  **Un seul aller-retour**, la boucle reste dans Postgres, et l'ordre de parcours devient
  déterministe (par `max(scored_at)` croissant) — ce qui ne suffit pas à réparer le streak (§3.7),
  mais évite d'ajouter de l'aléa.
- Coût unitaire négligeable : 3 agrégats bornés par `profile_id`, servis par
  `training_sessions_profile_started_idx`.
- **Importer les SESSIONS, jamais les agrégats** : `training_refresh_stats` fait le `max`. Une
  fusion « le dernier gagne » corromprait **6,7 % des couples** — 460 couples où le meilleur score
  **n'est pas** la dernière tentative.
- **Ne jamais écrire `training_case_bests` à la main.**

### 3.9 Ne jamais déduire le succès de ce qu'on croit avoir écrit

L'UUID v5 est dérivé du **seul** identifiant GLA (`uuidv5(NS_GLA, 'gla:session:' + glaId)`) : **il ne
contient pas le profil.** Combiné à `on conflict (id) do nothing`, toute situation où une session GLA
existe déjà **sous un autre profil** se solde par **0 ligne écrite et aucune erreur** — et
`sessions_count = 0` rend alors « Votre historique est déjà à jour » au propriétaire légitime qui
n'a rien. C'est le mode d'échec qui rend un vol **invisible pour sa victime**.

Trois chemins y mènent : un détachement partiel, un rattachement admin D7 mal ciblé puis corrigé,
ou une divergence de normalisation entre le `login_key` stocké (`lower()` Postgres) et la clé
utilisée côté JS pour les 6 logins non-ASCII.

**Parade, obligatoire, juste après l'écriture des sessions :**

```sql
select count(*) from training_sessions where profile_id = $1 and legacy_id is not null
```

comparé au **nombre de sessions lues chez GLA** pour ce login. Égalité ⇒ on continue. **Écart ⇒
`BusinessError` explicite** (« Récupération incomplète — un administrateur a été alerté. », §2.3),
ligne dans `training_legacy_claim_attempts`, `Sentry.captureException`, et **`last_sync_at` laissé à
`null`** : l'état reste « import inachevé », jamais « à jour ».

C'est aussi ce compte-là — et pas le nombre de lignes qu'on a tenté d'insérer — qui alimente
honnêtement `sessions_count` et le message de succès.

---

## 4. Modèle de données — migration 0123

`packages/db/supabase/migrations/0123_formation_reprise_gla.sql`. Convention `text` + `check`,
jamais `create type … enum`. Régénérer `packages/db/src/types.ts` après application.
**Ne jamais recréer les fonctions supprimées par 0122** (`training_wheel_ranking_raw`,
`training_wheel_weeks_open`, `training_trophy_grant`, `training_wheel_pending`, `training_wheel_grant_*`).

### 4.1 `training_sessions.legacy_id`

- Colonne **`legacy_id text`** nullable, plus un **index unique partiel** `where legacy_id is not
  null`. Elle porte l'identifiant de session GLA (texte de 20 caractères).
- **Trois rôles** : provenance interrogeable en SQL (indispensable au filtre du classement hebdo,
  §3.6), seconde barrière d'idempotence, et **base du contrôle de comptage de §3.9**.
- Commentaire de colonne obligatoire : « identifiant de la session sur l'ancienne plateforme
  (Good Luck Agency) — `null` = session jouée ici ; **le classement hebdomadaire
  (`training_weekly_ranking`) exclut les lignes non nulles** ».

### 4.2 `training_legacy_claims` — le lien profil ↔ ancien compte

`profiles` a 21 colonnes et **aucun emplacement** pour un ancien login. Deux options étaient
possibles : une colonne sur `profiles` (patron `0079`) ou une table dédiée. **Décision : table
dédiée**, parce qu'elle porte aussi l'état de resynchronisation et qu'elle garde la face Formation
hors de `profiles`.

| Colonne | Rôle |
|---|---|
| `profile_id` | **clé primaire**, FK `profiles(id)` on delete cascade → un profil ne réclame qu'un identifiant |
| `login_key` | `text not null` **`unique`**, stocké **en minuscules** (`check (login_key = lower(login_key))`) → un identifiant n'est réclamé qu'une fois |
| `login_display` | `text not null` — **le login dans sa casse d'origine**, tel que lu dans `chatters` |
| `claimed_at` | `timestamptz not null default now()` — pose de la **réservation**, avant l'import |
| `sync_started_at` | `timestamptz` **nullable** — posé au démarrage d'un import, effacé à la fin ; **verrou anti-concurrence** (§3.3), fenêtre 5 min |
| `last_sync_at` | `timestamptz` **nullable** — `null` = import jamais mené à son terme (reprise possible) |
| `sessions_count` | `integer not null default 0` — sessions **effectivement comptées en base** (§3.9), affiché au chatter et à l'admin |
| `linked_by` | `uuid` FK `profiles(id)` on delete set null — `null` = auto-réclamation, sinon l'admin (D7) |
| `detached_at` | `timestamptz` **nullable** — détachement **doux** (§7.6) : la ligne survit, l'identifiant reste réservé |

**`login_display` n'est pas cosmétique.** `login_key` est contraint en minuscules alors que **151
logins sur 235 portent des majuscules** : sans cette colonne, les messages « rattaché à
l'identifiant « ancien-login » » (§2.3) et « Rattaché à « login » » (§2.4) afficheraient une casse
fausse à deux tiers du parc, et l'admin chercherait dans GLA un login qui n'y figure pas sous cette
forme. Elle est remplie depuis le `login` ramené par la requête d'authentification (§3.1).

**RLS** : `select` pour le propriétaire (`profile_id = auth.uid()`), pour `has_page('frm-suivi')`
et pour `is_admin()`. **Aucune policy d'écriture** — service-role uniquement, comme tout le reste
de la face Formation.

### 4.3 Les deux relâchements de contrainte (D5)

Schéma actuel vérifié (`0113_formation.sql`, bloc `create table public.training_messages`) :
`body text not null check (length(body) between 1 and 1000)` et
`media_price integer check (media_price is null or media_price between 1 and 10000)`.

1. **`training_messages.body`** — le plafond passe de **1 000** à **200 000** caractères.
   *Justification* : 59 messages GLA dépassent 1 000 caractères, le plus long fait **101 764** ;
   200 000 laisse une marge sans ouvrir la porte à n'importe quoi. **La règle produit des 1 000
   caractères reste imposée** — mais par le schéma Zod du composer, précisément
   `features/training-session/schema.ts:18` (`body: z.string().trim().max(1000, '1000 caractères
   max')`), donc pour les **nouveaux** messages seulement. Le commentaire de contrainte doit le dire,
   sinon quelqu'un « corrigera » la régression dans six mois.
2. **`training_messages.media_price`** — la borne basse passe de **1** à **0**
   (`between 0 and 10000`). *Justification* : **196 médias** ont été envoyés gratuitement sur GLA.
   Max observé 2 000 €, médiane 6 € → la borne haute est déjà large.

**Le relâchement s'arrête au SQL — le produit ne bouge pas.** Deux gestes obligatoires côté
`features/training-session/schema.ts`, sans lesquels la borne 0 et les 200 000 caractères remontent
jusqu'au composer :

- **`MEDIA_PRICE_MIN` reste à `1`** (`schema.ts:10`) : un chatter ne doit pas pouvoir envoyer un
  média gratuit chez nous. Seul l'import écrit des 0.
- **L'en-tête du fichier devient faux** après la migration — il dit aujourd'hui, mot pour mot :
  « Miroirs des `check` SQL 0117 : `training_messages.body` 1-1000, `media_price` 1-10000 »
  (`schema.ts:5-6`). Le corriger **dans le même diff** : « le SQL est plus large depuis 0123 (reprise
  GLA) ; ces bornes-ci sont la règle **produit**, volontairement plus stricte ». C'est exactement le
  commentaire qui, laissé tel quel, fera « réparer » la régression dans six mois — celui que la
  migration prend soin de protéger côté SQL.

**Ce qui n'est PAS relâché** : `media_price` reste un `integer`. Le **seul** message à 8,50 € est
arrondi à **9** (`Math.round`), documenté dans le commentaire de la migration.

### 4.4 `training_legacy_claim_attempts` — trace et anti-abus

| Colonne | Rôle |
|---|---|
| `id` | PK uuid |
| `profile_id` | FK `profiles(id)` on delete cascade — qui tente |
| `login_key` | `text not null` — la cible visée, en minuscules |
| `ip` | `text` nullable — `clientIp()`, `null` en local |
| `ok` | `boolean not null` — succès ou échec de la preuve |
| `cleared_at` | `timestamptz` **nullable** — échec **neutralisé par un admin** (levée de verrou, §7.5) ; les comptages ignorent les lignes non nulles |
| `created_at` | `timestamptz not null default now()` |

Alimentée **en succès comme en échec** (c'est la trace d'audit). Index sur `(profile_id,
created_at desc)` et `(login_key, created_at desc)` — les deux fenêtres de comptage.

**`cleared_at` plutôt qu'un `delete`** : le déverrouillage admin (§7.5) ne doit pas effacer la trace
de ce qui a motivé le verrou. C'est la seule table qui dit qu'un compte a été ciblé.

**Table admin-only** : RLS activée, **aucune policy d'écriture**, et **une seule policy `select`,
`using ((select public.is_admin()))`** — patron `member_events_read`. Elle contient la carte des
tentatives sur des comptes dont **4 mots de passe sont le login lui-même** : elle n'est jamais
lisible par `authenticated`. La policy admin, elle, est **nécessaire** — sans elle, l'écran qui
permet de lever un verrou (§7.5) ne peut rien afficher, et le test 31 de §8.6 n'est pas exécutable.

**Aucune donnée GLA n'est copiée dans notre base** : ni `salt`, ni `pw_hash`, ni bien sûr
`pw_plain`. C'est un bénéfice direct de D3 (lecture directe, pas de snapshot) — il n'y a pas de
« table de secrets de premier ordre » à protéger, parce qu'il n'y a pas de table.

### 4.5 Les trois RPC, `security definer`, service-role uniquement

Modèle exact : `recruit_start_attempt` (`0115_recruit_hardening.sql:39-85`).

**`training_legacy_claim_begin(p_profile uuid, p_login_key text, p_ip text)` → uuid**
**DEUX `pg_advisory_xact_lock`, pas un**, pris **dans cet ordre fixe** (l'ordre évite l'interblocage
quand deux transactions visent les mêmes clés en sens inverse) :

```sql
perform pg_advisory_xact_lock(hashtext('legacy_login:' || p_login_key));  -- la CIBLE d'abord
perform pg_advisory_xact_lock(hashtext('legacy_claim:' || p_profile::text));
```

**puis** les comptages, **puis** l'insert de la tentative — **dans la même transaction**.

**Pourquoi le second verrou est indispensable** : §7.5 pose un plafond « par login cible, **tous
profils confondus** ». Un verrou par profil ne sérialise pas deux profils différents qui visent le
même login — chacun lit le même compte et insère. C'est mot pour mot le TOCTOU que `0115` a corrigé,
réintroduit sur l'autre dimension. Même raisonnement pour le plafond par IP, couvert par le verrou
de profil dans le cas nominal (un attaquant authentifié n'a qu'un profil).

Sans verrou du tout, compte et insert restent un TOCTOU même dans une seule fonction
(READ COMMITTED). C'est précisément le bug que `0115` a corrigé et qu'il ne faut pas réintroduire :

> « `enforceIpRateLimit` comptait les tentatives puis `startAttempt` insérait dans une requête
> SÉPARÉE : sans transaction ni verrou, une rafale concurrente depuis une même IP lit toutes le
> même compte et insère toutes. » — `0115_recruit_hardening.sql:6-13`

Refus levés en exceptions applicatives avec `errcode = 'P0001'`, reconnues par l'appelant pour
rendre un `BusinessError` français : `LEGACY_RATE_LIMITED`, `LEGACY_LOCKED`, `LEGACY_LOGIN_FROZEN`,
`LEGACY_SYNC_RUNNING`, `LEGACY_RESYNC_COOLDOWN`. **Les cinq n'ont que trois textes** : le gel par
login rend **exactement** le texte du plafond par profil (§2.3), sans quoi il devient un signal.

**`training_legacy_claim_settle(p_attempt uuid, p_ok boolean, p_login_display text)` → text**
Marque la tentative, et si `p_ok` **réserve** le couple dans `training_legacy_claims` dans la même
transaction — **c'est ici, et nulle part avant, que l'unicité est consultée** (§3.2). Pose
`sync_started_at = now()`. Rend `'new'` / `'resync'`, ou lève `LEGACY_TAKEN` (l'identifiant
appartient à un autre profil) / `LEGACY_OTHER_LOGIN` (ce profil est déjà rattaché ailleurs) /
`LEGACY_SYNC_RUNNING` (un import du même profil a démarré il y a moins de 5 min).

Les deux : `security definer`, `set search_path = public, pg_temp`,
`revoke all … from public, anon, authenticated`, `grant execute … to service_role`.

Plus **`training_legacy_refresh_all(p_profile uuid) → integer`** (§3.8), mêmes gardes.

### 4.6 Modifications de fonctions existantes

| Fonction | Modification |
|---|---|
| `training_weekly_ranking(p_week date)` — **version en vigueur `0113:1778`** (section `[ex-0124]`) | `and s.legacy_id is null` dans la CTE `best` — **seule modification de fonction de cette migration** |

**Une seule ligne, là où la version initiale de cette spec en prévoyait trois.** Les deux autres
cibles — `training_wheel_ranking_raw` (`0118:84`) et `training_wheel_weeks_open` (`0118:57`) —
**n'existent plus** : 0122 les a `drop`ées. Les patcher signifierait les recréer, donc rouvrir
l'octroi automatique que 0121/0122 viennent de fermer. **Ne pas le faire.**

**Ne pas patcher `training_wheel_pending` non plus** : elle est droppée elle aussi (vérifié en UAT).
La pastille d'éligibilité de la sidebar n'existe plus dans le modèle « le tour est donné ».

`training_module_ranking` (0119) et `training_refresh_stats` ne sont **pas** filtrés : l'historique
repris **doit** compter dans les points cumulés, les bests, la progression de module et le
classement par module (D4). Seul ce qui **décide d'un versement** est filtré — et depuis 0121, ce
qui décide, c'est le classement hebdo affiché à l'encadrant.

### 4.7 Un nouveau `kind` de `member_events` — surtout pas `'lien'`

`'lien'` **n'est pas un lien générique** : c'est **le lien MyPuls**, celui qui impute le CA donc la
paie. Il est posé par le trigger `trg_log_member_changes` (`0101:233`) sur `profiles.chatter_id`, et
rendu tel quel partout : badge « **Lien MyPuls** » (`features/members/components/event-kind.ts:25`),
phrases `Lié à la fiche MyPuls <to>` / `Lien MyPuls : from → to` / `Lien MyPuls retiré`
(`packages/core/src/domain/member-events.ts:177-182`). Une réclamation GLA afficherait donc
« **Lien MyPuls : Lié à la fiche MyPuls axel93** » dans le journal admin, et polluerait l'historique
du lien de paie.

**Et `member_events` n'est pas écrite depuis l'app** : « Alimentée **EXCLUSIVEMENT par trigger** —
n'écrire jamais depuis l'app, la table ne vaut que si elle est exhaustive »
(`0101_membres_cycle_de_vie.sql:118-119`). Aucun code applicatif n'y insère.

Donc, en 0123, **trois gestes solidaires** :

1. **Nouveau `kind = 'formation'`** ajouté à `member_events_kind_check` (`0113:1656-1659`) —
   `alter table … drop constraint` / `add constraint` avec la liste complète, comme 0113 l'a fait.
2. **Un trigger sur `training_legacy_claims`** (`after insert or update of last_sync_at, detached_at
   or delete`) qui écrit la ligne — patron **exact** : `training_wheel_spin_journal` (`0113:1661`),
   déjà un trigger `security definer` qui insère dans `member_events` avec `kind = 'recompense'`.
   L'app ne fait rien : elle écrit `training_legacy_claims`, le journal suit tout seul, et
   l'exhaustivité promise par le commentaire de 0101 est tenue.
   `to_value` lisible sans jointure : « Ancienne plateforme : rattaché à Axel93 — 214 sessions ».
3. **Côté TypeScript**, `'formation'` doit être ajouté à `EVENT_KINDS`
   (`packages/core/src/domain/member-events.ts:65`), à `memberEventLabel`, et à `KIND_LABEL` /
   `KIND_TONE` (`event-kind.ts`) qui sont des `Record<EventKind, …>` : **sans eux, ça ne compile
   pas** — c'est délibéré, le commentaire du fichier le revendique comme le lien entre le `check`
   SQL et le type du domaine.

---

## 5. Transformation GLA → glagencyapp

C'est le cœur du document. Tout ce qui suit est mesuré sur les 17 260 sessions.

### 5.0 Le discriminant de forme, et pourquoi le parseur doit être en liste blanche

`sessions.score` est **toujours** un objet (17 258/17 258). **Il n'y a pas de clé `type`
discriminante** : `type` n'apparaît que sur 100 lignes avec les valeurs `good`/`bad`, c'est une
**fuite d'un objet `moments` aplati à la racine**. **Le vrai discriminant est `sessions.module`**,
avec un mapping forme ↔ module **1:1 parfait** :

| Axes présents dans `score` | `module` | Sessions | Note moyenne |
|---|---|---|---|
| `naturel, lecture, personnalisation, progression` | `setting` | 6 705 | 51,7 |
| `tenue_prix, traitement, desir, closing` | `negociation` | 2 315 | 49,4 |
| `ecoute, connexion, profondeur, emprise` | `relationnel` | 2 185 | 53,7 |
| `coherence, liaison, patience, progression` | `transitions` | 1 954 | 51,3 |
| `boss_details` (ou rien) | `boss` | 1 789 | 25,3 |
| `validation, justification, compensation, maintien` | `rencontre` | 1 282 | 55,3 |
| `personnalisation, chaleur, non_vente, reouverture` | `relance` | 1 026 | 76,0 |

> **Le parseur lit une LISTE BLANCHE de clés, jamais « tout ce qui reste ».** **102 sessions**
> portent `type` / `cite` / `probleme` / `indice` **à la racine** de `score` (setting 46,
> relationnel 40, transitions 8, negociation 6, relance 2) et **4** portent des clés fantômes
> (`moments2`, `commentaire2`, `commentaire_fin`, `moments_note`). Un parseur permissif les
> prendrait pour des axes.

### 5.1 `training_sessions`

| Colonne cible | Contrainte | Origine / calcul | Piège |
|---|---|---|---|
| `id` | PK uuid | **UUID v5 de `sessions.id`** | `sessions.id` GLA est un texte de 20 car. (7 lignes en 14), **unique sur 17 259**, pas un uuid |
| `legacy_id` | nouveau, 0123 | `sessions.id` GLA tel quel | Clé du filtre du classement hebdo (§3.6) |
| `profile_id` | NOT NULL, FK cascade | **le profil réclamant, résolu par la garde** | **Jamais une valeur venue du client** — règle `start-session.ts:99` |
| `case_id` | NOT NULL, FK **restrict** | jointure `training_cases.code = sessions.case_id` | **80/80 codes joués existent**, 0 inconnu |
| `module_id` | NOT NULL, FK restrict | **`training_cases.module_id`**, PAS `sessions.module` | Les codes coïncident, mais la FK doit rester cohérente avec le cas |
| `kind` | check `solo\|arena\|boss` | `training_cases.kind` | **Conséquence** : les 1 789 lignes `boss_final` partent **toutes en `boss`**, les 704 arènes comprises |
| `status` | check | **`'scored'` DÈS L'INSERT** | Voir §5.8 — jamais `'active'` |
| `case_snapshot` | **NOT NULL** jsonb | reconstruit, §5.6 | — |
| `total` | smallint 0..100 | `score.total` **tel quel** | Mesuré 0..98, jamais nul, jamais hors bornes. **C'est déjà la valeur plafonnée — ne pas recalculer** (`total > Σaxes` = 0 ligne) |
| `objective_reached` | nullable | `score.objectif_atteint` | Présent sur 100 % des lignes ; `true` sur 6 466 |
| `started_at` | NOT NULL | **`to_timestamp(created_ms / 1000)`** | §5.7 |
| `ended_at` | nullable | **`= started_at`** | Aucune durée en GLA |
| `scored_at` | nullable | **`= started_at`, obligatoire en pratique** | `training_refresh_stats` et `active_days` lisent `scored_at` ; le laisser nul rend l'import invisible |

### 5.2 `training_threads`

**Solo** : 1 thread, `position = 0`. **Boss avec `boss_details`** : **5 threads**, `position` 0..4.
**Boss sans `boss_details`** : **0 thread** — il n'y a rien à écrire.

| Colonne | Contrainte | Origine |
|---|---|---|
| `id` | PK | UUID v5 : `'gla:session:' + glaId + ':t' + position` |
| `session_id` | NOT NULL, cascade | — |
| `position` | NOT NULL, **unique `(session_id, position)`** | 0 (solo) · 0..4 (boss) |
| `ref_case_id` | nullable, FK restrict | **`null`** — aucune session GLA ne porte un code d'arène (les 5 codes d'arène sont les seuls jamais joués) |
| `boss_fan_id` | nullable, FK restrict | boss : jointure sur `training_case_boss_fans.name` — les **5 noms GLA (Kevin, Thomas, Julien, Marc, Alex)** correspondent exactement aux 5 fans du cas `boss_final` en UAT. Pas de correspondance → `null`, on ne bloque pas l'import |
| `fan_name` | NOT NULL, longueur 1..30 | solo : `training_cases.fan_name` · boss : `boss_details[].fan` |
| `status` | check `open\|done\|lost` | **`'done'`** partout |
| `lost_reason` | check regex | **`null`** — information absente de GLA |
| `turns_used` | **NOT NULL ≥ 0** | **`count(history où who = 'me')`** — solo depuis `sessions.history`, boss depuis `boss_details[].history`. **Les messages `media` comptent** (ils sont tous `who = 'me'`) |
| `max_turns` | **NOT NULL**, 1..50 | `training_cases.max_turns` (solo 1..20 · boss 32) — absent de GLA |
| `next_due_at` | nullable | `null` |

### 5.3 `training_messages` — la table la plus contrainte

Deux formes de message GLA, **rien d'autre** :

```json
{ "who": "me" | "them", "t": "<texte>" }        // 279 643 éléments
{ "who": "me", "media": true, "price": 12 }     // 2 581 éléments (toujours who=me, media toujours true)
```

| Colonne | Origine | Piège |
|---|---|---|
| `id` | UUID v5 `… + ':t' + pos + ':m' + index` | — |
| `session_id` | la session | **NOT NULL même si redondant** avec `thread_id` (dénormalisation voulue : RLS à un niveau) |
| `thread_id` | le thread | — |
| `position` | **index dans le tableau `history`** | **Seul porteur de la chronologie** — GLA n'horodate rien |
| `speaker` | **`who = 'me'` → `'chatter'`** (le chatteur joue la créatrice, `index.html:1770`) · **`who = 'them'` → `'fan'`** (`index.html:1797`) | Contre-intuitif. Répartition mesurée : me **145 440** / them **136 809** |
| `body` | `h.t` | **59 messages > 1 000 car.** (max 101 764) sur 46 sessions → **conservés intégralement** grâce au relâchement §4.3, **aucune troncature** (D5). **2 581 messages « média » n'ont pas de champ `t`** (0/2 581) → `length ≥ 1` violé → **corps synthétisé** |
| `media_price` | `h.price` | **196 prix à 0** conservés à **0** (relâchement §4.3, fidélité) · **1 prix non entier (8,5)** → **9** (`Math.round`), colonne `integer` · max observé 2 000 |
| `visible_at` | **NOT NULL, `= started_at` EXPLICITEMENT** | Le défaut `now()` **vide les corps à l'affichage** : `get-session.ts:138` fait `body: Date.parse(m.visible_at) > revealNow ? '' : m.body` — une transcription entièrement blanche, sans erreur |
| `created_at` | `= started_at` | Tous les messages d'une session portent le même instant |

**Corps synthétisé des médias** : reprendre **exactement** la forme que l'application écrit
nativement — `` `Média verrouillé — ${d.mediaPrice} €` `` (`features/training-session/actions.ts`,
~ligne 109). Une session importée et une session jouée ici doivent être indiscernables à l'écran.
Pour les 196 médias gratuits : « Média verrouillé — 0 € ».

**0 message texte vide** côté GLA : les seuls corps vides sont les médias.

### 5.4 `training_thread_scores` — PK = `thread_id`

| Colonne | Contrainte | Origine / calcul |
|---|---|---|
| `total` | 0..100 | solo : `score.total` · **boss : `boss_details[].total`** (mesuré 0..73, moyenne 42,5) |
| `objective_reached` | **NOT NULL** | solo : `score.objectif_atteint` · **boss : `total ≥ 60`** (`BOSS_PASS`, `rules.ts:11`) — absent de GLA au niveau du fil |
| `capped` | **NOT NULL boolean** | **GLA stocke un NOMBRE (`plafond`, 0..89), pas un booléen** → formule ci-dessous. **Boss : `false`** (pas de plafond au niveau du fil) |
| `comment` | NOT NULL, aucune limite de longueur | `score.commentaire` → `coalesce(…, '')`. Longueur 19 → **1 272** car., moyenne 430. **37 sessions sans la clé** |
| `moments` | NOT NULL default `[]` | `score.moments`, nettoyé (§5.5) |
| `scored_at` | NOT NULL | **poser la date GLA**, pas `now()` |

**Formule de reconstruction de `capped`** :

```
capped = Σaxes > min( objectif_atteint ? 100 : 65 , plafond ?? 100 )
```

- Origine : le plafonnement serveur `serveur.py:1045-1052` — `total = min(Σaxes, plafond)` **et** la
  règle « objectif non atteint → cap à 65 ».
- **Vérifiée 5 125 / 5 125** sur les sessions `setting` à `plafond` numérique.
- Cohérence globale (15 468 sessions non-boss) : `total = Σaxes` sur **15 042 (97,2 %)**,
  `total < Σaxes` sur **426**, **`total > Σaxes` sur 0**. Les 426 écarts sont **entièrement
  expliqués** par le plafonnement (364 par `min(Σaxes, plafond)`, 215 par la règle des 65,
  ensembles recouvrants).
- **`plafond` présent sur ~10 840 sessions (62,6 %)**, dont **5 mal typées** — remesuré le 24/08 à
  11 h : `select jsonb_typeof(score->'plafond'), count(*) … group by 1` → **number 10 839, string 3,
  null 2**. (La spec annonçait 4 : c'était 3 chaînes, pas 2.) Les cinq sont **traitées comme
  absentes**, et les ~6 470 sessions sans la clé prennent `plafond = 100`.

**Qualité des `moments`** — c'est bien **ici** qu'ils vivent, dans `training_thread_scores.moments`
(`jsonb not null default '[]'`), et non dans la table d'axes de §5.5. Annotations pédagogiques, clés
canoniques `cite` / `type` / `probleme` / `indice`, conformes à `momentZod` (`lib/ai/schema.ts:38`) :

| Anomalie | Volume | Traitement |
|---|---|---|
| `moments` en **`string`** au lieu de tableau | **111 sessions** | → `[]` — **perte assumée, listée en D5** : la colonne est lue par `.map()`, y ranger une chaîne casserait l'écran de score |
| Clé `moments` absente | **2 067** (dont 1 789 boss → **278 non-boss anormales**) | → `[]` |
| Tableau vide | 9 | conservé |
| `mieux` au lieu d'`indice` | ~310 | **renommer** |
| `problème` accentué au lieu de `probleme` | 14 à ~32 selon le rapport | **renommer** |
| `type` absent | 188 à 499 selon le rapport | laisser absent — l'UI dégrade proprement (`score-panel.tsx:57` affiche 🔧 par défaut) |
| `cite2`, `type_field`, `probleme2` | quelques unités | **écarter** — perte assumée, listée en D5 |

**Aucun `check` SQL ne rejettera ces moments** et l'UI ne casse pas (`annotated-transcript.tsx:39`) :
le nettoyage est **recommandé, non bloquant**. Répartition du nombre de moments par session :
3 → **10 907** · 4 → 2 950 · 2 → 906 · 1 → 193 · 5+ → 113 · 0 → 9.

### 5.5 `training_thread_axis_scores` — PK `(thread_id, axis_key)`

**Solo** : les 4 clés d'axes du module. Les **22 clés d'axes GLA sont IDENTIQUES** à
`training_module_axes.key` en UAT — `tenue_prix, traitement, desir, closing, personnalisation,
chaleur, non_vente, reouverture, ecoute, connexion, profondeur, emprise, validation, justification,
compensation, maintien, naturel, lecture, progression, coherence, liaison, patience`. Valeurs
mesurées **0..25**, jamais non numériques, jamais hors bornes. *(`progression` et `personnalisation`
apparaissent dans deux modules chacun : la jointure doit se faire sur `(module_id, key)`, pas sur
`key` seule.)*

**Boss** : `boss_details[].axes` est un objet de **6 clés** — `setting, transition, sexting,
rencontre, nego, relationnel` — avec des valeurs **0..100** (**échelle différente !**), identiques
aux 6 étapes de `lib/ai/schema.ts:75-76` (`BOSS_STEPS`). Le barème /100 est conforme au commentaire
de la colonne (`0..25 pour les axes de module, 0..100 pour les étapes du boss`).

- **`axis_name` est NOT NULL et absent de GLA** → repiquer depuis `training_module_axes.name`
  (solo) ou depuis `BOSS_STEPS` (boss).
- **Axes boss `null` — règle non tranchée par les rapports, tranchée ici : ne PAS insérer la
  ligne.** Les axes boss sont souvent nuls parce que le fan n'a pas sollicité la compétence :
  `nego` null 1 432/1 974, `rencontre` 1 894, `relationnel` 1 684, `transition` 1 298, `sexting`
  1 295, `setting` 306 ; **16 éléments ont `axes: null` en bloc** (aucune ligne d'axe du tout).
  Insérer `0` mentirait — « non sollicité » n'est pas « raté » — et fausserait `training_axis_profile`
  (`0113:1247`), qui fait une moyenne sur les lignes existantes. La PK `(thread_id, axis_key)`
  autorise parfaitement l'absence.

*(Les `moments` ne sont pas dans cette table — ils vivent dans `training_thread_scores`, §5.4.)*

### 5.6 Reconstruction de `case_snapshot` (NOT NULL)

Forme attendue = le type `CaseSnapshot` (`lib/types/training.ts:68-76`), tel que l'écrit
`lib/training/start-session.ts:81-94` :

```
{ code, title, phase, difficulty, context, objective, objectiveLabel,
  maxTurns, reactionMaxS, isSale, moduleTitle, moduleCode }
```

- **Tout est reconstruit depuis `training_cases` + `training_modules` d'aujourd'hui**, pas depuis
  GLA.
- **Cette fonction n'existe pas encore** : le snapshot est assemblé **en ligne** dans `startSession`
  (`lib/training/start-session.ts:81-94`), et ce fichier commence par `'use server'` (ligne 1) —
  tout export d'un module `'use server'` devient un endpoint appelable depuis le navigateur, donc on
  ne peut rien en extraire tel quel. **Prérequis** : sortir l'assemblage dans un module neutre
  `lib/training/case-snapshot.ts` (`buildCaseSnapshot(row): CaseSnapshot`, pur, zéro I/O), que
  `start-session.ts` **et** `lib/legacy/transform.ts` importent tous les deux. Sans cette extraction,
  « réutiliser » signifie recopier — deux vérités qui divergeront.
- **Écart de nature assumé** : le snapshot est censé figer *ce qui a été joué ce jour-là*
  (`get-me.ts:120`, `get-chatter.ts:52`) ; pour un import on fige *le catalogue actuel*.
  **Sans risque** : le catalogue GLA **ne peut pas dériver** (`load_formation()`, `serveur.py:379`,
  lit un fichier ; aucune fonction d'écriture n'existe) et les deux catalogues sont identiques cas
  par cas (7 modules, 85 cas : setting 23, relationnel 18, transitions 11, rencontre 11,
  negociation 11, relance 10, boss 1).
- **Ne jamais y mettre `targetLine`** (`get-session.ts:37-38` la purge de toute façon) **ni
  `fan_brief` / `expected`** : ce sont des secrets, durcis en tables admin-only par 0116.
- `case_snapshot->>'title'` et `->>'moduleTitle'` sont **lus directement** par l'historique de Ma
  formation (`get-me.ts:72-79`) : un snapshot bâclé donne un historique illisible.

### 5.7 `created_ms` → `timestamptz`, et le piège `date_label`

- **Toujours `to_timestamp(created_ms / 1000)`.** `created_ms` est un **epoch UTC vrai**.
- **NE JAMAIS réutiliser `date_label`.** Vérifié : la dernière session porte
  `date_label = "24/08/2026 07:31"` alors qu'elle a été créée à **09:31 heure de Paris** —
  `date_label` est écrit avec `time.strftime` sur un serveur en **UTC**, alors que glagencyapp
  calcule tout en **Europe/Paris** (`0113_formation.sql:1184, 1340, 1369`).
- **Conséquences mesurées de l'erreur** : **774 / 17 260 sessions (4,5 %)** changent de jour civil
  et **99 changent de semaine ISO** → `active_days` faux, `streak_days` faux, classement hebdo
  faux — **donc tickets de roue faux**.
- Le format de `date_label` est propre (`JJ/MM/AAAA HH:MM` sur 17 258/17 258), il est simplement
  dans le mauvais fuseau. C'est exactement ce qui le rend piégeux.

### 5.8 Le boss — trois sous-formes, et pourquoi l'INSERT direct en `'scored'`

Trois sous-formes chronologiques de `score` pour `case_id = 'boss_final'` (**1 789 sessions**) :

| Sous-forme | Nb | Fenêtre | `objectif_atteint = true` | Threads à créer |
|---|---|---|---|---|
| Pas de clé `boss_details` (ancien code) | **180** | 30/07 → 07/08 | 82 | **0** |
| `boss_details: null` | **1 211** | 07/08 → 24/08 | 622 | **0** |
| `boss_details: [5 objets]` | **398** | 07/08 → 24/08 | 398 | **5** |

Structure de `boss_details[i]` — **1 990 éléments, tous la même forme** :

```json
{ "fan": "<string>", "total": 30,
  "axes": { "setting": 30, "transition": null, "sexting": null,
            "rencontre": null, "nego": null, "relationnel": null },
  "commentaire": "<string>",
  "history": [ /* mêmes messages que sessions.history */ ] }
```

- **398 × 5 = 1 990 threads**, **28 921 messages** (moyenne 14,5, max 64, **95 fils vides**).
- **`sessions.history = []` sur exactement les 1 789 sessions boss** (`serveur.py:1173` écrit
  `"history": []` en dur). Aucune autre session n'a un historique vide.
- Le boss = **5 conversations en parallèle**, éliminatoire si un fan attend > 2 min
  (`index.html:2196-2198` → `total: 0, validated: false`) ; en réussite, `total` est la **moyenne**
  des 5 notes (`index.html:2226-2229`). C'est ce qui explique les **713 sessions boss à
  `total = 0`** (sur 798 zéros au total ; hors boss, 85 vrais zéros dont 44 en négociation).

**Pourquoi insérer directement en `status = 'scored'`** : l'index
`training_sessions_one_active_idx` (`0113_formation.sql:987`) est un `unique (profile_id) where
status = 'active'`. La stratégie « insérer `active` puis UPDATE vers `scored` » (qui aurait
l'avantage de déclencher le trigger) **sérialiserait l'import par chatter**, déclencherait 17 k
recalculs inutiles et produirait un `streak_days` faux (§3.7). L'INSERT direct est le bon choix ;
le recalcul se fait explicitement (§3.8).

### 5.9 Ordre d'écriture — obligatoire

**Cette section est la source unique de l'ordre.** Toute autre énumération dans ce document (§6.2)
en est une paraphrase et doit lui être alignée, jamais l'inverse.

```
[validation §5.11 : tout le lot, AVANT la première écriture]
training_sessions → training_threads → training_messages
  → training_thread_scores → training_thread_axis_scores
  → [contrôle §3.9] count(legacy_id is not null) == sessions lues chez GLA  ← sinon on s'arrête ici
  → [recalcul] training_legacy_refresh_all(profile)          (une RPC, §3.8)
  → [UPDATE dédié] streak_days + last_active_day, §3.7
  → training_legacy_claims : last_sync_at, sessions_count, sync_started_at = null
       ↳ le trigger écrit member_events (kind = 'formation', §4.7)
```

**Plus d'étape de neutralisation de la roue** : depuis 0122 il n'y a plus rien à neutraliser (§3.6).
C'était la **seule étape non idempotente** de tout le parcours, et la seule qui pouvait coûter de
l'argent si l'import s'interrompait au mauvais moment. Elle a disparu avec les fonctions qu'elle
visait.

**Aucune transaction ne couvre l'ensemble** : `supabase-js` en service-role n'ouvre pas de
transaction multi-requêtes. C'est acceptable **parce que** l'ordre est croissant en dépendances et
que **toutes** les étapes sont désormais idempotentes : une interruption laisse un état partiel
cohérent, et la resynchronisation le complète. La ligne `training_legacy_claims` étant posée **en
premier** (§3.2) avec `last_sync_at = null`, l'état « import incomplet » est lisible **et affiché**
(§2.1).

**La validation passe AVANT la première écriture**, pas au fil de l'eau : une ligne hors bornes
découverte à la 300ᵉ session laisserait un import à moitié écrit qu'il faudrait ensuite expliquer.

### 5.10 Récapitulatif des contraintes qui cassent

| Contrainte | Ce qui la viole |
|---|---|
| `training_sessions.case_snapshot` **NOT NULL** | l'oubli pur et simple |
| `training_messages.body` `length between 1 and 1000` | 59 corps > 1 000 · 2 581 corps vides (médias) → relâchée §4.3 + corps synthétisé |
| `training_messages.media_price` `between 1 and 10000` | 196 prix à 0 · 1 prix non entier (8,5) → relâchée §4.3 + arrondi |
| `training_threads.max_turns` NOT NULL 1..50 | absent de GLA → depuis `training_cases` |
| `training_threads.fan_name` NOT NULL 1..30 | boss : `boss_details[].fan` |
| `training_threads.turns_used` NOT NULL ≥ 0 | à calculer, pas de valeur source |
| `training_thread_scores.*` tout NOT NULL | commentaire absent (37) → `''` · moments non-tableau (111) → `[]` · `capped` = formule |
| `training_thread_axis_scores.axis_name` NOT NULL | absent de GLA |
| `training_case_bests.*` NOT NULL | **ne jamais l'écrire à la main** |
| `training_messages` `unique (thread_id, position)` | rejeu sans idempotence |
| `training_sessions_one_active_idx` | l'aller-retour `active` → `scored` |

### 5.11 Les données GLA sont une ENTRÉE HOSTILE, pas un jeu de données

Tout ce qui précède est spécifié contre des **mesures** : « `total` mesuré 0..98, jamais hors
bornes », « 1 990 éléments, tous la même forme », « axes 0..25, jamais hors bornes ». Ces mesures
sont exactes **et elles ne prouvent rien sur demain**, parce que GLA écrit ce que son client lui
envoie.

**Ce qui est sûr** : les sessions **solo** sont notées côté serveur par l'IA, avec des clamps
explicites — `data[kk] = max(0, min(25, v))` puis `min(total, plafond)` puis `min(total, 65)`
(`serveur.py:1037-1052`). Axes et `total` d'une session solo ne sont **pas** forgeables.

**Ce qui ne l'est pas** :

- **`/api/formation/boss-save` fait confiance au client de bout en bout** (`serveur.py:1154-1176`) :
  `total = int(req.get("total") or 0) if validated else 0` — **aucun clamp haut** ;
  `details = details if isinstance(details, list) else None` — **aucune borne de taille**. `fan`,
  `axes`, `commentaire` et `history` de chaque `boss_details[i]` viennent du navigateur, tels quels.
  Le seul contrôle est la possession d'un jeton de chatter.
- **`history` n'est jamais borné**, ni pour le boss ni pour le solo. C'est ce qui explique le message
  de **101 764 caractères** que §4.3 cite comme une curiosité : ce n'est pas une curiosité, c'est la
  preuve qu'il n'y a aucune validation en amont.

Conséquences concrètes sur **notre** import : `total: 999999` viole
`training_sessions.total smallint between 0 and 100` et **casse l'import entier** ; un `details` de
40 000 éléments déborde `position smallint` ; un `fan` de 300 caractères viole
`fan_name … length between 1 and 30` ; une `history` de plusieurs centaines de Mo fait **OOM** la
Server Action, `transform.ts` étant pur et en mémoire. Et comme 4 mots de passe GLA sont le login
lui-même, quelqu'un peut se connecter **sur GLA** sous l'identité d'un collègue, y poster une session
poison, et faire échouer sa réclamation chez nous **à chaque essai, définitivement** — un grief
silencieux, sans aucune trace de notre côté.

**Règle normative** : `lib/legacy/transform.ts` **valide avant de transformer**, avec un schéma
**Zod** sur chaque objet GLA (session, `score`, `boss_details[]`, message) et des **bornes dures** :

| Borne | Valeur | Ce qu'elle arrête |
|---|---|---|
| `total` (session et fil) | `clamp(0, 100)` | `total: 999999` |
| axes de module / étapes de boss | `clamp(0, 25)` / `clamp(0, 100)` | valeurs forgées |
| `media_price` | `clamp(0, 10000)` | prix absurde |
| threads par session boss | ≤ **5** | `details` de 40 000 éléments |
| messages par fil | ≤ **500** (max mesuré : 64) | `history` gonflée |
| corps d'un message | ≤ **200 000** car. (= la borne SQL de §4.3) | le message de 101 764 reste intact |
| sessions par réclamation | ≤ **1 000** (max mesuré : 399) | fabrication de masse |
| **poids cumulé d'un import** | ≤ **20 Mo** | l'OOM — le relâchement §4.3 ouvre un plafond **par ligne** sans jamais poser de plafond **agrégé** |

Un **clamp** pour ce qui est bénin, un **rejet** pour ce qui ne l'est pas : dépasser une borne de
volume (threads, messages, sessions, poids) **arrête l'import** avec une `BusinessError` nommée
(`LEGACY_SOURCE_INVALID`), une ligne dans `training_legacy_claim_attempts` et un `Sentry` — **jamais
un 500 générique, jamais un silence**. Le chatter voit « Récupération impossible — un administrateur
a été alerté. »

Les bornes sont posées **très au-dessus des maxima mesurés** (5 vs 5, 500 vs 64, 1 000 vs 399) :
elles ne doivent jamais refuser un import légitime, seulement arrêter l'absurde.

---

## 6. Architecture

### 6.1 Où vit quoi

| Chemin | Rôle |
|---|---|
| `packages/db/supabase/migrations/0123_formation_reprise_gla.sql` | `legacy_id`, `training_legacy_claims`, `training_legacy_claim_attempts`, les 3 RPC, les 2 relâchements, `training_weekly_ranking` filtrée, le `kind` `'formation'` + son trigger |
| `apps/web/src/lib/legacy/gla-client.ts` | **module neutre** (pas de `'use server'`) — connexion Postgres lecture seule à GLA, ouverte et refermée par appel. **Seule frontière avec GLA** |
| `apps/web/src/lib/legacy/verify.ts` | module neutre — `sha256(salt + ':' + pw)`, `timingSafeEqual`, coût constant |
| `apps/web/src/lib/legacy/transform.ts` | module neutre, **pur et testable Vitest** — validation §5.11 puis GLA JSON → lignes de nos 5 tables. Zéro I/O |
| `apps/web/src/lib/legacy/import.ts` | module neutre — orchestration §5.9, prend le client service-role **en paramètre** |
| `apps/web/src/lib/training/case-snapshot.ts` | **extraction préalable** (§5.6) — `buildCaseSnapshot`, importé par `start-session.ts` **et** `transform.ts` |
| `apps/web/src/lib/http/client-ip.ts` | **déplacement préalable** de `clientIp()` (voir plus bas) |
| `apps/web/src/features/training-legacy/schema.ts` | Zod partagé client/serveur (`login`, `password`) |
| `apps/web/src/features/training-legacy/actions.ts` | `'use server'` — `claimLegacyAccount` (chatter) |
| `apps/web/src/features/training-legacy/components/legacy-claim-card.tsx` | l'encart + le dialog, `'use client'` |
| `apps/web/src/features/training-legacy/services/get-claim.ts` | lecture RLS de `training_legacy_claims` pour la page |
| `apps/web/src/features/members/actions-legacy.ts` | `'use server'` — `linkLegacyAccount` / `resyncLegacyAccount` / `unlinkLegacyAccount` / `releaseLegacyLogin` / `unlockLegacyClaim` (admin, D7) |
| `apps/web/src/features/members/services/search-gla-logins.ts` | autocomplétion admin du login (§2.4) |
| `apps/web/src/features/members/components/member-legacy-fields.tsx` | le bloc « Ancienne plateforme » du dialog Membre |

**Pourquoi `lib/legacy/` et pas `features/training-legacy/lib/`** : le code d'import est appelé par
**deux features** (l'auto-réclamation côté Formation et le filet admin côté Membres) et la
frontière ESLint interdit le cross-feature. Précédents exacts : `lib/training/start-session.ts` et
`lib/impersonation/actions.ts`.

**`clientIp()` doit DÉMÉNAGER avant d'être utilisée.** Elle vit aujourd'hui en
`features/recruit-test/shared.ts:40-48`, et `apps/web/eslint.config.mjs` génère une zone par feature
(`{ target: './src/features/${f}', from: './src/features', except: ['./${f}'] }`) :
`features/training-legacy/actions.ts` **ne peut pas l'importer**. Elle n'est pas « réutilisable telle
quelle » — il faut la sortir en `lib/http/client-ip.ts` et mettre `recruit-test` à jour dans le même
diff. La logique, elle, ne bouge pas (`x-real-ip` d'abord, XFF en repli et première entrée seulement).

**Corollaire de la même config** (`{ target: './src/lib', from: './src/features' }`) :
`lib/legacy/import.ts` **ne peut importer aucune feature**. Tout ce dont il a besoin doit vivre en
`lib/` ou lui être passé en paramètre — d'où l'extraction de `buildCaseSnapshot` (§5.6).

**Pourquoi des modules NEUTRES sans `'use server'`** : « l'exporter depuis un fichier `'use server'`
en ferait un point d'entrée appelable depuis le navigateur »
(`features/members/recruit-link.ts:8-12`, même patron que `lib/chatter-link.ts`). Une fonction qui
lit `salt` / `pw_hash` ne doit **jamais** être un point d'entrée HTTP.

`apps/web/src/app/(dash)/formation/ma-formation/page.tsx` récupère la donnée via
`features/training-legacy/services/get-claim.ts` et la passe **en props** au Template
(`MeTemplate.tsx`), conformément à la convention `app → feature(template) → composants`. **Aucun
fetch dans une feature.**

### 6.2 Le flux, d'un bout à l'autre

1. Le chatter ouvre `/formation/ma-formation`. La page lit `training_legacy_claims` (RLS) et passe
   `claim: null | {...}` en props → l'encart s'affiche ou non.
2. Il saisit login + mot de passe. RHF + `zodResolver` + `schema.ts` ; **`'use no memo'` en
   première ligne du corps du composant** (le React Compiler casse `formState`, donc le loading et
   les erreurs).
3. Server Action `claimLegacyAccount`, via `runAction({ schema, input, guard, handler })`.
   **Garde : `requirePageProfileLive('frm-entrainement')`** — le suffixe `Live` appelle
   `denyIfImpersonating()` (`lib/actions.ts:152-153`), **crucial** : un admin en « en tant que » ne
   doit pas pouvoir réclamer un ancien compte au nom d'un chatter. Précédent :
   `lib/training/start-session.ts:41`. La vérification métier se fait **une seule fois, en tête du
   `handler`**, jamais dans le `guard` (anti-patron documenté,
   `guidelines-standard-feature.md:187-205`).
4. `clientIp()` — depuis `lib/http/client-ip.ts` après déménagement (§6.1) : `x-real-ip` d'abord
   (posé par la plateforme), `x-forwarded-for` en **repli seulement** et **première entrée
   uniquement**, parce que la liste XFF peut être concaténée avec des valeurs **entrantes forgées**
   par le client, y compris en première position. `null` en local ⇒ la garde IP se neutralise seule.
5. RPC `training_legacy_claim_begin` (service-role) → rate-limit + trace, ou refus. **Aucune lecture
   de `training_legacy_claims` à ce stade** (§3.2).
6. Lecture GLA n°1 : `select login, salt, pw_hash from chatters where lower(login) = $1`.
   Vérification §3.1.
7. RPC `training_legacy_claim_settle` → marque la tentative, **réserve** le couple, pose
   `sync_started_at`, ou lève.
8. Lecture GLA n°2 : `select … from sessions where login = <le login EXACT de l'étape 6>` (§6.4).
9. Validation §5.11 du lot **entier**, puis transformation (`transform.ts`), puis écriture par lots
   service-role dans l'ordre §5.9.
10. **Contrôle de comptage §3.9** — écart ⇒ on s'arrête ici, `last_sync_at` reste `null`.
11. Recalcul en **une** RPC (`training_legacy_refresh_all`), puis `UPDATE` du streak.
12. `training_legacy_claims` : `last_sync_at`, `sessions_count`, `sync_started_at = null` — le
    trigger écrit `member_events` (`kind = 'formation'`) ; `revalidatePath('/formation/ma-formation')`.
13. La Server Action rend le compte de sessions/cas/messages → message §2.3.

*(Il n'y a plus d'étape « trophées » : §3.6.)*

**Les erreurs métier passent par `BusinessError`** (`lib/actions.ts:71-75`) : un `throw new Error`
est avalé en « Erreur inattendue » et fait du bruit dans Sentry.

**Budget de temps.** Le chatter maximal fait 399 sessions ≈ 6 500 messages ≈ **1,2 Mo** de JSON et
**~9 300 lignes** à écrire, soit **une dizaine d'allers-retours** par lots de 1 000 lignes, **plus
une** RPC de recalcul. Ce dernier point n'est pas un détail : la version initiale de cette spec
prévoyait ~150 appels `training_refresh_stats` séquentiels, chacun un aller-retour HTTP supabase-js
distinct **et** un `count(distinct …)` complet sur le profil — le budget aurait été faux d'un ordre
de grandeur. D'où la RPC d'enrobage de §3.8.

**`maxDuration` — valeur et emplacements.** `export const maxDuration = 300` (le patron du projet
sous `cacheComponents: true` : `formation/overview/page.tsx:16`, `formation/session/[id]/page.tsx:15`,
`postuler/page.tsx:12`), à poser sur **les deux** pages qui hébergent une action d'import :

- `app/(dash)/formation/ma-formation/page.tsx` — l'auto-réclamation ;
- `app/(dash)/chatter/members/page.tsx` — **le chemin admin D7 POSTe là, pas sur Ma formation.**

Aucune des deux n'en a aujourd'hui. Au dépassement, l'utilisateur reçoit le message « Récupération
interrompue » de §2.3 — **pas** « Erreur inattendue » : l'état est récupérable, et le dire est ce qui
transforme un incident en un clic.

C'est aussi pour ça que D3 (import fractionné par chatter) est structurellement plus sain qu'un
import global : personne n'écrit jamais 370 k lignes en une requête. Le filet reste l'idempotence —
un dépassement se rattrape par « Reprendre la récupération ».

### 6.3 Pas de Route Handler, pas de script

Les Route Handlers sont réservés aux cas spéciaux (IA, webhooks) ; la réclamation est une mutation
utilisateur → **Server Action**. Un script `packages/db/scripts/` serait justifié pour un import
global en une passe — **mais D3 dit qu'il n'y en a pas**. Le script reste possible plus tard, en
réutilisant `lib/legacy/transform.ts` et `import.ts` tels quels, si l'on décidait un jour de
rapatrier les comptes non réclamés.

### 6.4 La connexion lecture seule à GLA

- **Variable d'environnement `GLA_DATABASE_URL`**, ajoutée à `.env.example` (sans valeur) et posée
  dans Vercel. Jamais en clair dans le code. **Rôle DISTINCT pour Preview** (mot de passe séparé,
  révocable indépendamment) : une preview exécute du code de `develop` avec un accès en lecture à une
  **base de production tierce**, et l'URL atterrit dans le `.env` de chaque poste de dev. Vérifier
  que la Deployment Protection est active sur Preview, et prévoir la rotation des deux mots de passe.
- **Rôle Postgres dédié**, créé côté GLA (projet Supabase distinct, pooler `aws-0-eu-west-3`,
  dépôt `git@github.com:axel-vrnl/good-luck-agency.git`) :
  `create role gla_readonly login password '…' nosuperuser nocreatedb nocreaterole` ;
  `grant connect on database … ; grant usage on schema public ;`
  **`grant select (login, salt, pw_hash, recovered, last_login) on chatters`** — colonnes
  énumérées, **`pw_plain` volontairement exclu** — et `grant select on sessions`. Aucun droit
  d'écriture, aucun droit sur `candidates` / `blocked` / `config`.
  *(Vérifié côté GLA : `public.chatters` et `public.sessions` ont `relrowsecurity = false` — un rôle
  simple verra bien les lignes, sans policy à écrire.)*
- **Connexion** : client `pg` (dépendance **à ajouter** — aucun client Postgres n'existe
  aujourd'hui dans le monorepo ; `serverExternalPackages: ['pg']` dans `next.config`). Pooler en
  mode transaction (port 6543) côté Vercel serverless, pool `max: 1`, timeouts explicites,
  transaction `read only`. *(La règle « port direct 5432, jamais le pooler » de ce projet vise
  `supabase db push` sur NOTRE base, pas une lecture serverless sur une base tierce.)*
- **`statement_timeout` : PAS « posé par session ».** En transaction pooling (6543) un `SET` de
  session ne suit pas la connexion — il s'appliquerait à un client au hasard. Deux formes correctes,
  au choix : `options=-c statement_timeout=15000` **dans l'URI**, ou `SET LOCAL statement_timeout`
  **à l'intérieur** de la transaction `read only`. La première est préférable : elle vaut pour toute
  requête, y compris celles qu'on ajouterait plus tard sans y penser.

**Le plan de lecture — mesuré, pas supposé.** C'est le point qui décide si la réclamation coûte
quelques millisecondes ou un balayage complet de la production GLA :

| Requête | Index disponible | Verdict |
|---|---|---|
| `where lower(login) = $1` sur **`chatters`** | `idx_chatters_lower_login` (`db.py:139`) — index **fonctionnel** | ✅ utilisé |
| `where lower(login) = $1` sur **`sessions`** | **aucun** — le seul index est `idx_sessions_login ON sessions(login)`, sur la colonne **brute** (`db.py:155`) | ❌ **seq scan de 57 Mo** |
| `where login = $1` (valeur exacte) sur **`sessions`** | `idx_sessions_login` | ✅ utilisé |

**Donc : deux requêtes, jamais une.** L'authentification (§3.1) ramène le `login` **exact** depuis
`chatters` ; la lecture des sessions utilise cette valeur telle quelle. C'est correct par
construction : `storage_add_session` écrit `"login": c.get("login")` (`serveur.py:1055`), la casse
est donc identique — **vérifié en base : 0 session dont le `login` diffère de celui de `chatters`
autrement que par la casse, et 0 tout court**. Le rôle `gla_readonly` n'ayant que `select`, il ne
pourrait de toute façon pas créer l'index manquant.

Sans ce geste, chaque réclamation **et chaque resynchronisation** parcourent intégralement une table
de 57 Mo sur la base qui sert ~996 sessions/jour à de vrais utilisateurs. C'est une correction d'une
ligne pour un déni de service évité (§7.5 ajoute le cooldown qui borne la répétition).

- **Il n'y a pas de repli par `@supabase/supabase-js`.** Une version antérieure de cette spec en
  proposait un « moins bon, à n'utiliser que si nécessaire ». Il est **disqualifiant**, pas moins
  bon : lire `salt` / `pw_hash` malgré la RLS suppose la clé **`service_role`** de GLA, donc (a) le
  `grant select` par colonne s'effondre et **`pw_plain` — 235 mots de passe en clair — redevient
  lisible**, (b) notre application obtient le droit d'**écrire et de supprimer** sur une base en
  production active, (c) `candidates` et `blocked` (385 lignes de données personnelles, hors
  périmètre §9.3) deviennent accessibles. C'est le chemin de moindre effort si le rôle tarde : il
  faut donc qu'il soit écrit noir sur blanc qu'il est fermé.
  **Si `gla_readonly` n'est pas obtenable, la fonctionnalité n'est pas livrée** — on bascule
  directement sur le plan `pg_dump → schéma `gla_legacy`` décrit ci-dessous, qui est de toute façon
  sa fin de vie prévue et qui coupe la dépendance à une base tierce.

**Ce que la dépendance implique** :

- **Si GLA est indisponible, la réclamation échoue proprement** et **rien n'est écrit à moitié** :
  la lecture précède toute écriture (étapes 6 puis 9). Message dédié §2.3, `Sentry.captureException`,
  aucune ligne dans `training_legacy_claims`.
- **La fonctionnalité a une durée de vie liée à celle de GLA.** Tant que GLA vit, elle marche ; le
  jour où GLA doit mourir, on `pg_dump` les 2 tables utiles (`chatters` 235 lignes, `sessions`
  57 Mo) dans un schéma `gla_legacy` de notre projet Supabase, et **seul `gla-client.ts` change** —
  l'interface interne (`readAccount(loginKey)`, `readSessions(loginKey)`) reste identique, le
  transformateur et l'import ne bougent pas. **C'est la raison d'être de cette frontière à un seul
  fichier.**
- **La base GLA grossit** : 68 Mo aujourd'hui (dont `sessions` 57 Mo), croissance ~3,4 Ko/session à
  ~996 sessions/jour. Sur un plan Free (500 Mo), le plafond tombe vers le **18/11/2026** — le
  propriétaire réel et le plan de facturation du projet GLA **ne sont pas connus** et doivent être
  vérifiés avant de dépendre de cette base en production.

---

## 7. Sécurité

### 7.1 Les mots de passe GLA ne sont jamais lus en clair, ni copiés

`chatters.pw_plain` contient les **235 mots de passe en clair**. Il est **inutile à la
vérification** — on compare des hash. Le `grant select` du rôle dédié énumère les colonnes et
**exclut `pw_plain`** : même une erreur de code ne peut pas le lire. **Aucun `salt` ni `pw_hash`
n'est copié dans notre base** — bénéfice direct de D3 : il n'y a pas de snapshot, donc pas de table
de secrets à protéger. C'est aussi ce qui **ferme le repli `service_role`** de §6.4 : ce repli
rouvrirait `pw_plain` d'un coup.

**Le mot de passe saisi n'entre dans aucun log, aucun breadcrumb, aucun objet capturé.** `runAction`
ne capture que l'exception (`captureException(err)`, `lib/actions.ts:73`) et pas l'entrée : c'est
la bonne propriété, elle doit être **préservée** — ne jamais ajouter l'input au contexte Sentry de
cette action, ne jamais `console.log` l'objet du formulaire, ne jamais mettre le mot de passe dans
le message d'une `BusinessError`.

### 7.2 La qualité réelle des mots de passe dicte l'anti-abus

| Forme | Nombre |
|---|---|
| **Identique ou dérivé trivialement du login** | **4** |
| Chiffres uniquement | 23, dont **6 à ≤ 4 chiffres** |
| Longueur ≤ 4 | 15 |
| Longueur ≤ 6 | 42 |
| Longueur 8 (dont 111 générés aléatoirement) | 126 |
| Réutilisé entre deux comptes | 0 |
| Non-ASCII | 0 (minimum observé : 2 caractères) |
| **Longueur maximale** | **16** — et `max(length(login))` = **17** (fonde les bornes de §2.2) |

**42 mots de passe tombent en quelques secondes** en force brute hors ligne, et **4 comptes** sont
devinables **en une tentative** par quelqu'un qui connaît le login. L'attaquant ici est
**authentifié** (c'est un chatter de l'agence) : la clé de limitation la plus fiable est
`profile.id`, pas l'IP.

### 7.3 Comparaison à temps constant, coût constant

`timingSafeEqual` sur les buffers hex décodés, jamais `!==`. Et un sha256 sur un sel factice **même
quand le login n'existe pas**, sinon le temps de réponse dit à l'attaquant quels logins existent —
ce qui ruinerait tout le travail fait sur le message générique.

### 7.4 Message générique

**Un seul texte — « Identifiants introuvables. » — pour tout ce qui précède la preuve.** Précédent
maison : l'audit du 2026-07-19 sur Membres a conclu à masquer les erreurs GoTrue en générique pour
la même raison. Les deux exceptions explicites (§2.3) ne sont atteignables qu'**après** la preuve
et ne divulguent donc rien.

### 7.5 Rate-limit — quatre plafonds, deux verrous, et un compteur qu'on ne remet PAS à zéro

Une **seule RPC `SECURITY DEFINER`** sur le modèle de `recruit_start_attempt`
(`0115_recruit_hardening.sql:39-85`) : les **deux** `pg_advisory_xact_lock` de §4.5 (cible puis
profil), **puis** les comptages, **puis** l'écriture, **dans la même transaction**.

| Plafond | Règle | Rôle |
|---|---|---|
| **Par profil, glissant** | 5 échecs / 15 min → refus. **Un succès remet ce compteur-ci à zéro** | Absorbe le légitime qui se trompe |
| **Par profil, cumulé** | **10 échecs `cleared_at is null` → verrouillage**, levé **uniquement** par une action admin explicite. **Jamais remis à zéro par un succès** | **Le vrai verrou** |
| **Par IP** | 20 tentatives / 24 h via `clientIp()` ; **`p_ip is null` ⇒ aucune limite** (`0115:57-59`) | Filet. Ne bloque pas tout le monde derrière un `null` commun en dev |
| **Par login cible** | **6 échecs** / 24 h **glissantes**, tous profils confondus, en ne comptant **que les profils n'ayant pas déjà réclamé** → login gelé | Protège les 4 comptes dont le mot de passe est le login |

**Pourquoi « jamais remis à zéro par un succès » est le point qui tient tout.** Avec la règle
initiale (« le succès remet à zéro », tous compteurs confondus), un chatter authentifié disposant de
son propre compte GLA obtient une **force brute illimitée** : 4 tentatives sur la cible (sous le
seuil de 5), une resynchronisation de son propre login avec son vrai mot de passe → succès → tous
les compteurs à zéro → on recommence. Le verrou « définitif » à 10 n'est jamais atteint. Face à
**42 mots de passe de ≤ 6 caractères** et **6 de ≤ 4 chiffres**, c'est quelques heures de travail.

Trois conséquences de conception, solidaires :

1. **Deux compteurs distincts, pas un.** Le glissant (5/15 min) se remet à zéro sur succès — c'est
   son rôle. Le cumulé ne se remet à zéro que sur geste admin.
2. **Une resynchronisation n'est PAS une tentative de preuve.** La propriété est déjà établie ; elle
   ne prouve rien de neuf et ne doit donc **ni** compter comme succès, **ni** remettre un compteur à
   zéro. Elle a son propre plafond : **1 par heure et par profil** (`LEGACY_RESYNC_COOLDOWN`, message
   dédié §2.3), côté chatter **comme** côté admin. Sans lui, « Resynchroniser » est un bouton qui
   déclenche à volonté une lecture sur la production GLA (§6.4) — un utilisateur simplement impatient
   suffit à en faire un déni de service.
3. **Le gel par login ne doit pas devenir une arme.** À 10 échecs il était de toute façon
   inatteignable par un attaquant seul (verrouillé à 10 avant), donc il ne servait **qu'à griefer** :
   deux profils complices posent les échecs sur `sophie22` et empêchent la vraie Sophie de récupérer
   son historique. D'où : seuil **abaissé à 6** (atteignable par un attaquant seul, donc utile),
   fenêtre **glissante de 24 h** et non définitive (le grief s'épuise tout seul), échecs des profils
   **déjà rattachés non comptés** (ils ne sont pas des candidats au vol), **message identique** à
   celui du plafond par profil (§2.3), et **alerte admin** — parce qu'un login ciblé est une
   information, alors qu'un login bloqué est une victime.

**La levée du verrou est une action, pas un `delete`.** `unlockLegacyClaim(profileId)` en
`features/members/actions-legacy.ts`, garde `requireAdminProfileLive()`, qui pose
`cleared_at = now()` sur les échecs du profil — la trace reste (§4.4). Elle est appelée depuis le
bloc « Ancienne plateforme » du dialog Membre (§2.4), qui affiche « **Récupération bloquée** — 10
tentatives échouées. [ Débloquer ] » quand le cas se présente. Sans cette action **et** sans la
policy `select` admin de §4.4, « verrouillage jusqu'à intervention admin » désigne une intervention
qui n'existe pas.

`anyBlocklistMatch` (`features/recruit-test/shared.ts:241-262`) n'est **pas** réutilisable : elle
est conçue pour un candidat **anonyme** à identité déclarée (`device`, `email`, `discord`), d'où
sa prudence (`eq` séparés jamais concaténés, `adminPosedOnly` pour ne pas punir la victime). Ici
`profile.id` est une clé infiniment plus fiable.

### 7.6 Journalisation et réversibilité

- **Chaque tentative**, succès comme échec, laisse une ligne dans
  `training_legacy_claim_attempts` (table **admin-only**, aucune policy `select` pour
  `authenticated`).
- **Chaque rattachement, resynchronisation et détachement** écrit dans `member_events` avec le
  `kind = 'formation'` de §4.7 — **jamais `'lien'`**, qui est le lien MyPuls. Visible dans le journal
  admin (`POLICY member_events_read … USING (is_admin())`) et dans l'historique du membre. C'est la
  vraie parade aux 4 mots de passe devinables : une usurpation est **visible et réversible**, pas
  silencieuse.
- **Détachement (admin)** — l'ordre importe :
  0. **Refuser si GLA est injoignable, ou si le login n'y existe plus.** Le détachement supprime des
     lignes qu'on ne sait reconstruire **qu'en relisant GLA** ; sans la source, il est définitif. Or
     §6.4 mesure que la base GLA sature son plan Free vers le **18/11/2026** et que son propriétaire
     et sa facturation ne sont pas connus. Message : « Ancienne plateforme injoignable — le
     détachement serait irréversible. » ;
  1. `delete from training_sessions where profile_id = $1 and legacy_id is not null` — la cascade
     emporte threads, messages, scores et axes ;
  2. **supprimer explicitement les `training_case_bests`** des couples devenus vides :
     `training_refresh_stats` **ne touche à rien** quand aucune session notée ne subsiste
     (`if v_attempts > 0 then …`, `0113:1532`) — vérifié en lisant la fonction, pas déduit. Sans ce
     nettoyage, le membre garde des « meilleurs scores » fantômes ;
  3. rappeler `training_legacy_refresh_all` sur les couples restants, puis recalculer le streak.
     **Cas particulier obligatoire : zéro couple restant.** Un profil qui n'avait **que** des
     sessions reprises n'a plus aucun couple à rafraîchir — donc aucun appel, donc l'upsert de
     `training_profile_stats` (qui vit **dans** `training_refresh_stats`, `0113:1558-1578`) n'a jamais
     lieu, et `cases_done`, `points`, `avg_total`, `boss_best`, `boss_done`, `active_days`,
     `streak_days` **gardent les valeurs de l'import**. Il faut donc un **reset explicite** de la
     ligne (ou sa suppression) quand plus aucune session notée ne subsiste ;
  4. **`detached_at = now()` sur `training_legacy_claims` — la ligne SURVIT.** Pas de `delete`. Voir
     ci-dessous.
- **Le détachement est DOUX, et l'identifiant reste réservé.** Un détachement qui supprimait la ligne
  rendait le login immédiatement réclamable par n'importe qui — ce qui fait de « détacher puis
  réclamer » le vrai chemin de vol, en deux dialogues et deux lignes de journal non corrélées. Avec
  `detached_at` : la même personne peut **re-réclamer** son propre login (c'est une réparation), mais
  une réclamation par **un autre profil** exige une action admin séparée et tracée,
  `releaseLegacyLogin(loginKey)` (« Libérer l'identifiant »), qui dit explicitement ce qu'elle fait.
  Le journal garde la paire détachement → libération → nouvelle réclamation lisible d'un bloc.
- **Pas de notification au chatter détaché** : l'application n'a pas de canal de notification, en
  inventer un pour ce cas serait disproportionné. Ce qu'il voit : l'encart de réclamation revient
  (§2.1), et la ligne `member_events` explique pourquoi à qui la lit.
- **`denyIfImpersonating()`** sur les deux chemins (chatter et admin) : la consultation « en tant
  que » est en **lecture seule**, elle ne doit jamais réclamer ni détacher. Sa vraie valeur est
  l'imputation : sans elle, le journal ne saurait pas dire **qui** a agi.

### 7.7 Ce qui reste ouvert

- **Deux chatters qui se sont partagé un mot de passe GLA** peuvent se voler un historique. Pas de
  parade technique — la journalisation, l'alerte en cas de collision et le détachement admin
  couvrent : **détecter et défaire**, plutôt que prétendre empêcher.
- **Une personne avec deux comptes GLA** n'en réclamera qu'un : la PK `profile_id` l'interdit, et le
  seul recours est un détachement. L'ampleur n'est **pas mesurable** — c'est précisément le problème
  posé par §1.2, il n'existe aucune clé qui dise que deux logins sont la même personne. Traité au cas
  par cas par D7, en connaissance de cause.
- **D7 n'est pas borné, et c'est un choix.** Un admin peut rattacher n'importe lequel des 235 logins
  à n'importe quel membre, sans mot de passe. Le borner côté serveur aux seuls comptes qui le
  justifient (`recovered = true and last_login is null`) casserait sa raison d'être : D7 est un
  **filet**, il doit aussi couvrir le chatter qui a simplement oublié son mot de passe. Ce qui borne
  le risque est ailleurs, et c'est assumé : garde **admin strict** (§2.4), aperçu de confirmation
  avant validation, détachement doux, et journal `member_events`. Un admin malveillant reste un
  problème d'organisation, pas de schéma.

### 7.8 La racine de confiance est chez GLA — RISQUE ACCEPTÉ

> **Arbitrage Benoit, 2026-08-24 : « ignore, ça n'arrivera pas ».** Ce point ne bloque donc pas la
> mise en service. Il reste écrit ici parce qu'il décrit exactement ce que la reprise garantit — et
> ce qu'elle ne garantit pas — et parce qu'une décision assumée doit rester traçable. Ce qui est en
> jeu se limite à un historique d'entraînement : ni argent, ni identifiants, ni donnée client.


D1 délègue l'authentification à une base dont §6.4 et §9.4 admettent que **le propriétaire réel et
le plan de facturation ne sont pas connus**. Or, côté GLA :

- l'admin **réécrit n'importe quel mot de passe** (`serveur.py:1129-1133` : `salt`, `hash` et
  `pw_plain` réécrits d'un coup) et **lit `pw_plain`** pour les 235 comptes ;
- `admin_pw()` retombe sur la valeur littérale **`"admin1234"`** si la configuration est vide
  (`serveur.py:177-178`).

**Qui que ce soit qui détienne cet accès peut se rattacher l'historique de n'importe qui chez nous.**
Aucune parade de notre côté n'y change quoi que ce soit — c'est la définition d'une racine de
confiance. Ce n'est pas un motif pour renoncer à D1 (il n'existe pas d'autre preuve de propriété),
c'est un constat : la confiance qu'on accorde à un historique repris est exactement celle qu'on
accorde au détenteur de l'accès admin GLA.

**Ce que ça implique aussi** : les sessions importées ne sont pas plus fiables que la plateforme qui
les a produites (§5.11). L'historique repris se lit comme un historique **déclaré**, pas comme une
mesure — c'est vrai depuis toujours pour les données GLA, la reprise ne fait que les rendre visibles
chez nous.

---

## 8. Recette (préprod UAT, à la main, cas par cas)

**Prérequis** :
1. **0121 et 0122 commitées et déployées** (elles sont en UAT, pas en prod, et pas dans git) — la
   reprise se pose par-dessus le nouveau modèle de roue, jamais avant (§Correction préalable n°2) ;
2. migration **0123** appliquée sur UAT via
   `cd packages/db && supabase db push --db-url "$DATABASE_URL_UAT"` (jamais `psql -f` seul : cela
   désaligne `schema_migrations` et casse `db push` — piège à l'origine du nettoyage `36ae438`) ;
3. `packages/db/src/types.ts` régénéré ;
4. rôle `gla_readonly` créé côté GLA et `GLA_DATABASE_URL` **Preview** posée (rôle distinct de la
   prod, §6.4) ;
5. les trois **déménagements préalables** faits et compilant : `clientIp` → `lib/http/client-ip.ts`,
   `buildCaseSnapshot` → `lib/training/case-snapshot.ts`, `'formation'` ajouté à `EVENT_KINDS` /
   `KIND_LABEL` / `KIND_TONE`.

**Tous les comptages de contrôle se font contre la source AU MOMENT DU TEST** : la base GLA est
vivante (~996 sessions/jour), aucun chiffre figé de ce document n'est un oracle.

### 8.1 Vérification d'identité

1. **Login inexistant** (`zzzz-nexistepas`) → « Identifiants introuvables. » Chronométrer : le
   temps de réponse doit être **comparable** à celui d'un mauvais mot de passe sur un login réel.
2. **Login réel, mauvais mot de passe** → même message, mot pour mot.
3. **Login réel avec majuscules et/ou accents** (6 logins non-ASCII, 151 avec majuscules) → succès.
   Vérifier explicitement qu'un login saisi en casse différente fonctionne.
4. **Login avec espaces avant/après** collés depuis un presse-papier → succès (le `trim()` opère).
5. **Login réel, bon mot de passe** → succès. Comparer le compte de sessions annoncé avec
   `select count(*) from sessions where login = <login exact>` côté GLA. **Vérifier au passage le
   plan de lecture** : `explain (analyze)` sur la requête réellement émise doit montrer un
   `Index Scan using idx_sessions_login`, **jamais** un `Seq Scan` (§6.4) — c'est le test qui protège
   la production GLA.
5 bis. **Casse à l'affichage** : réclamer avec un login à majuscules (151 comptes concernés) et
   vérifier que le message de succès et la ligne admin affichent **`Axel93`**, pas `axel93`
   (`login_display`, §4.2).

### 8.2 Unicité et double réclamation

6. **Rejouer la même réclamation immédiatement** → « Votre historique est déjà à jour. » et
   **`select count(*) from training_sessions where profile_id = …` inchangé** (c'est le test
   d'idempotence : un doublon doublerait `attempts`).
7. **Un second profil réclame le même login** (avec le bon mot de passe) → « Cet identifiant est
   déjà rattaché à un autre compte. » ; **aucune ligne écrite** pour ce second profil ; une ligne
   dans `training_legacy_claim_attempts` avec `ok = true` et une alerte Sentry.
8. **Un profil déjà rattaché réclame un autre login** → « Votre compte est déjà rattaché à
   l'identifiant « … ». »
8 bis. **Oracle d'énumération** : saisir un login **réel et déjà rattaché à un autre profil** avec un
   **mauvais** mot de passe → **« Identifiants introuvables. »**, jamais « déjà rattaché ». C'est le
   test de la règle §3.2 (aucune lecture de `training_legacy_claims` avant la preuve) ; s'il échoue,
   les 235 logins sont énumérables.
8 ter. **Import concurrent** : lancer deux réclamations du même profil en parallèle (deux onglets)
   → la seconde est refusée (`LEGACY_SYNC_RUNNING`), et les comptes finaux sont **identiques** à ceux
   d'un import unique (ni doublon, ni agrégat recalculé deux fois).

### 8.3 Volume et cas limites de données

9. **Le chatter à 399 sessions** (le maximum du parc, ≈ 6 500 messages, 1,2 Mo) : mesurer la durée
   totale, vérifier qu'aucun timeout ne survient, puis compter **sessions, threads, messages,
   scores, axes** contre la source (`where login = <exact>`, recompté à l'instant du test).
9 bis. **Contrôle de comptage (§3.9)** : forcer l'écart en insérant à la main une session du login
   sous un **autre** profil, puis réclamer → message « Récupération incomplète », `last_sync_at`
   **resté `null`**, entrée Sentry. **Surtout pas** « Votre historique est déjà à jour ».
9 ter. **Entrée hostile (§5.11)** : fabriquer un lot GLA de test contenant `total: 999999`, un
   `boss_details` de 40 éléments et un `fan` de 300 caractères → l'import **s'arrête avant la
   première écriture**, message « Récupération impossible », **0 ligne** dans `training_sessions`.
10. **Un chatter avec une session boss `boss_details: [5]`** → 5 threads `position` 0..4, les 5 noms
    de fan résolus en `boss_fan_id` non nul, axes **absents** là où GLA a `null`, `objective_reached`
    du fil = `total ≥ 60`.
11. **Un chatter avec une session boss sans transcription** (1 391 lignes concernées) → la session
    existe, `total` correct, **0 thread, 0 message**, l'écran de résultat s'ouvre **sans crash** et
    affiche un état vide.
12. **Une des 46 sessions à message > 1 000 caractères** → le corps est **intégral**, pas tronqué.
13. **Une session contenant un média** → corps `Média verrouillé — X €`, rendu **identique** à un
    média envoyé nativement dans l'application. Vérifier aussi un média à **0 €**.
14. **Une des 111 sessions à `moments` en `string`** → `moments = []`, l'écran de score s'affiche.
15. **Une des 102 sessions à clés de moments échappées à la racine** (`type`, `cite`…) → aucun axe
    parasite créé, `training_thread_axis_scores` a bien **4 lignes**.
16. **Une session à `plafond` mal typé** (`"null"` ou `null` JSON, 4 au total) → `capped` calculé
    comme si le plafond était absent.
17. **Vérification globale de `capped`** sur le chatter importé :
    `capped = Σaxes > min(objectif_atteint ? 100 : 65, plafond ?? 100)` — 0 divergence attendue.

### 8.4 Fuseau, agrégats, affichage

18. **Une session dont le jour civil change entre UTC et Paris** (774 lignes concernées) : vérifier
    dans l'historique de Ma formation que la date affichée correspond à l'heure de Paris, pas à
    `date_label`.
19. **`active_days`** du profil = `select count(distinct (scored_at at time zone 'Europe/Paris')::date)`
    sur ses sessions notées.
20. **`streak_days`** = la plus longue série consécutive **réelle** se terminant au dernier jour
    actif (calculer à part en SQL et comparer). Vérifier aussi que la lecture « effective » affiche
    bien **0** si le dernier jour actif est vieux de plus d'un jour — c'est le comportement attendu,
    pas un bug.
21. **`training_case_bests`** : pour un couple à ≥ 2 tentatives (46 % des couples), `best_total` =
    le **maximum**, pas la dernière valeur. Prendre un des 460 couples où le meilleur **n'est pas**
    la dernière tentative.
22. **Ma formation, Modules, Overview, classement par module** affichent des chiffres non nuls
    après import (le trigger ne s'est pas déclenché : c'est le recalcul explicite qui doit avoir
    fait le travail).
23. **Écran de résultat d'une session importée** : titre du cas et titre du module lisibles (ils
    viennent de `case_snapshot`), transcription **visible et non vide** (le piège `visible_at`).

### 8.5 La roue — beaucoup plus court qu'avant

Trois tests suffisent désormais : l'octroi automatique n'existe plus (§3.6), il n'y a donc plus rien
à neutraliser ni à surveiller côté tickets.

24. **Avant / après import** : `select count(*) from training_wheel_tickets where profile_id = …`
    **inchangé**, et **aucune** ligne `training_wheel_spins`. Visiter `/formation`,
    `/formation/ma-formation` et `/formation/roue` entre les deux — plus aucun `after()` d'octroi
    n'existe, ce test vérifie qu'aucun n'a été réintroduit.
25. **`training_weekly_ranking(<semaine en cours>)` et `(<semaine passée>)`** ne comptent **aucune**
    session importée (filtre `and s.legacy_id is null`, §4.6). Vérifier aussi que le classement
    affiché dans « Ma formation » est cohérent avec la RPC — c'est le seul écran qui décide d'un
    versement, par la main de l'encadrant.
26. **Contre-épreuve** : jouer **une vraie session** chez nous après import → elle apparaît
    normalement dans le classement hebdo, et le tirage lancé par un encadrant fonctionne (`spun_by`
    renseigné, `ticket_id` nul — modèle 0121).

*(Les anciens tests « pastille `training_wheel_pending` », « tickets de neutralisation », « trophée
qui paie » n'ont plus d'objet : les fonctions visées sont droppées.)*

### 8.6 Anti-abus, admin, indisponibilité

27. **6 mauvais mots de passe d'affilée** depuis le même profil → refus au 6e avec le message de
    plafond, et non le message générique.
28. **Le succès ne déverrouille pas** — le test central de §7.5 : poser 4 échecs sur une cible,
    réussir une réclamation de son **propre** login, puis reposer 4 échecs sur la cible. Le compteur
    **cumulé** doit être à 8, pas à 4 : au 10ᵉ échec le verrouillage tombe. Si le succès a remis à
    zéro, la force brute est illimitée.
29. **10 échecs cumulés** → verrouillage ; l'admin le lève depuis le dialog Membre
    (`unlockLegacyClaim`) → `cleared_at` renseigné, **lignes d'échec conservées**, le chatter peut
    réessayer.
30. **6 échecs sur un même login depuis des profils différents** → login gelé, avec **exactement**
    le texte « Trop de tentatives. Réessayez dans quelques minutes. » (§2.3), et alerte admin.
    Vérifier que le gel **expire** après 24 h glissantes.
31. **Cooldown de resynchronisation** : deux « Resynchroniser » à une minute d'intervalle → le second
    est refusé avec son message dédié, **et aucune requête n'est partie vers GLA**.
32. **Rattachement admin (D7)** sur un compte `recovered` jamais reconnecté → import complet, ligne
    `member_events` `kind = 'formation'` (**pas** `'lien'`) visible dans l'historique du membre et
    dans le journal admin, avec le libellé et la teinte du nouveau `kind`.
32 bis. **Autocomplétion et aperçu admin** : taper `axe` propose les logins correspondants, et
    l'aperçu annonce le nombre de sessions et la date de la dernière **avant** validation.
32 ter. **Manager avec la page Membres, non admin** → le bloc « Ancienne plateforme » n'est pas
    affiché **et** l'action est refusée côté serveur (`requireAdminProfileLive`).
33. **Détachement admin** → les sessions `legacy_id is not null` disparaissent, celles jouées ici
    restent, `training_case_bests` n'a **pas** de reliquat fantôme, et la ligne
    `training_legacy_claims` **existe toujours** avec `detached_at` renseigné.
33 bis. **Détachement d'un profil qui n'avait QUE des sessions reprises** → `training_profile_stats`
    est **remis à zéro** (`points`, `cases_done`, `boss_best`, `active_days`, `streak_days`), pas figé
    sur les valeurs de l'import (§7.6 étape 3).
33 ter. **Après détachement**, un **autre** profil qui réclame le même login est **refusé** tant que
    l'admin n'a pas cliqué « Libérer l'identifiant » ; le **même** profil, lui, peut re-réclamer.
34. **Détachement avec GLA injoignable** → refusé, avec le message d'irréversibilité (§7.6 étape 0).
35. **Mode « en tant que »** : un admin qui consulte sous l'identité d'un chatter voit l'encart
    mais **l'action est refusée** avec le message d'impersonation. Idem sur le chemin admin.
36. **GLA injoignable** : couper `GLA_DATABASE_URL` (valeur invalide) → message dédié, **0 ligne
    écrite**, exception dans Sentry.
37. **Sessions orphelines** : tenter la réclamation d'un des 8 logins présents dans `sessions` mais
    absents de `chatters` → « Identifiants introuvables. » (ils n'ont ni sel ni hash — c'est le
    comportement attendu, pas un bug à corriger).
38. **Compte sans session** (14 comptes) → « Compte retrouvé — aucune session à reprendre. »,
    l'encart passe en état rattaché avec `sessions_count = 0`, et **aucune erreur**.
39. **Import interrompu** : couper le réseau en cours d'écriture → au retour, l'encart affiche
    « Récupération interrompue », **pas** « repris — 0 sessions » ; « Reprendre » termine le travail
    et les comptes finaux sont ceux d'un import nominal.

---

## 9. Hors périmètre

### 9.1 Les métriques `wpm`, `latency`, `msgs` — jetées

`sessions.metrics` existe sur ~14 195 sessions (une seule combinaison de clés `{wpm, latency, msgs}`,
3 062 valeurs nulles, nulles sur 100 % des sessions boss et sur 1 273 sessions antérieures au 04/08).

- **`wpm` est cassé** : médiane 34, p75 53, p95 **2 822**, p99 **9 094**, max **1 657 714** ;
  **2 170 sessions (15,3 %) dépassent 200 mots/min**. Cause : `typeMs` part de la première frappe,
  donc un copier-coller donne `typeMs ≈ 0` (`index.html:1586-1601`). **Inexploitable.**
- **`msgs` est sous-compté** : exact dans **907 cas sur 14 198** seulement — les envois `media` ne
  passent pas par `trainTrackMsg` et `train._m` n'est pas restauré à la reprise
  (`index.html:1688-1692`). Et il est **recalculable exactement** depuis `history`, donc inutile.
- **`latency` est fiable** (médiane 11 s, p95 28 s, max 58 s, aucun 0) **mais n'a aucune colonne
  d'accueil** : `training_ai_calls.latency_ms` mesure la latence **de l'IA**, et `typing_wpm`
  (`0113:1953`) appartient au **test de recrutement**. Créer une colonne pour une donnée qu'aucun
  écran n'affiche serait de la dette sèche.

**On ne fabrique aucune ligne `training_ai_calls`** : c'est la seule mesure du coût IA de la face
(`training_ai_cost`). Y injecter des appels qui n'ont jamais eu lieu chez nous fausserait la
comptabilité du poste le plus cher.

### 9.2 Les 15 signalements — optionnel, pas dans le premier jet

`reports` compte **15 lignes** (11 logins, 05/08 → 22/08, message de 4 à 126 caractères, moyenne
68, **0 résolue**). Un rapport les avait déclarées « structurellement pas importables » à cause du
`training_reports.session_id NOT NULL` ; un autre a **mesuré** qu'une jointure sur
`(login, case_id, score identique)` retrouve **15/15 sessions, 0 ambiguïté**. La mesure l'emporte :
c'est **importable**. Mais 15 lignes non résolues ne justifient pas d'ajouter une étape au chemin
critique de la réclamation. **À faire en second temps, si Benoit le veut** — auquel cas ne pas
importer les snapshots `score` / `history` du signalement, ils sont redondants avec la session, et
respecter `training_reports_session_uidx` (un seul signalement par session).

### 9.3 Le recrutement GLA

`candidates` (35 lignes) et `blocked` (350 lignes) **ne sont pas repris**. La face Recrutement de
glagencyapp est déjà livrée avec son propre parcours public (`/postuler`), sa propre blocklist et
ses propres mesures ; importer 35 dossiers d'un format différent, pour des candidats déjà traités,
n'apporte rien.

### 9.4 Mise en service, et l'échéance que D2 crée sans le dire

**L'ordre de bataille** (les trois premiers points sont des prérequis durs, §8) :

1. commiter et déployer **0121 + 0122** — le nouveau modèle de roue passe **avant** ;
2. obtenir `gla_readonly` (accès Postgres en lecture seule à GLA) — seul prérequis dur de cette
   étape ; la question du propriétaire de GLA est un risque accepté (§7.8) ;
3. appliquer **0123**, régénérer les types, recetter sur UAT (§8) ;
4. déployer en production. **La fonctionnalité est disponible dès qu'un compte existe** (D2) : il n'y
   a ni date de bascule, ni gel, ni communication de masse à organiser. Un chatter réclame quand son
   compte est créé, et pas avant.

**L'échéance implicite, à dire une fois.** D2 fait arriver les comptes **au fil de l'eau**, sans
date. §6.4 mesure que la base GLA sature son plan Free (500 Mo) vers le **18/11/2026**. La
conjonction des deux crée une **date limite de réclamation qui n'a été décidée par personne** : un
chatter dont le compte est créé en décembre pourrait n'avoir plus rien à réclamer. Trois issues
possibles, à trancher par Benoit : (a) faire passer GLA en payant, (b) `pg_dump` des 2 tables utiles
dans un schéma `gla_legacy` de notre projet **avant** l'échéance — ce qui rend la reprise
indépendante de GLA et ne change que `gla-client.ts` (§6.4), (c) accepter la perte pour les retards.
**(b) est la seule qui ne dépende de personne d'autre que nous**, et elle est de toute façon la fin
de vie prévue de cette frontière.

**L'extinction de GLA elle-même, rien dans cette spec ne l'organise.** Sa date, la communication aux
chatters et le sort des comptes non réclamés sont des sujets **produit**, à trancher séparément.

### 9.5 Les pertes définitivement assumées

Rappelées ici pour qu'aucune ne soit prise plus tard pour un bug : les **730 sessions orphelines**
(4,2 %, 8 logins sans compte), les **1 789 transcriptions boss/arène vides à la source** (dont
1 391 sans le moindre détail), les **704 arènes de module indiscernables du boss**, les **448 paires
de continuations** qui gonflent `attempts`, l'absence de `lost_reason`, de durée et d'horodatage des
messages. **Toutes ces pertes sont antérieures à nous** : elles existent déjà dans GLA, la reprise
ne les crée pas, elle ne peut simplement pas les réparer.

### 9.6 Le tour de bienvenue

Offrir un tour de roue à chaque réclamant (≈ 5,20 € l'espérance × N ≈ **430 €** pour 82 chatters) est
une **décision produit séparée**, sans rapport avec D6.

**Le mécanisme a changé** : depuis 0121, un tour est **donné par un encadrant** — `spun_by`
renseigné, `ticket_id` devenu nullable (`0121:13`, `:22-23`). Il n'y a donc **rien à construire** :
si Benoit veut offrir un tour à chaque réclamant, l'encadrant le lance depuis la page Roue, comme
pour tout le reste. *(La spec disait « mécanisme déjà existant, aucune modification de schéma » en
parlant du ticket `granted_by` — c'était vrai la veille ; ça l'est encore plus aujourd'hui, mais
pour une autre raison.)*

### 9.7 La date de coupure — une question ouverte, posée à Benoit

D3 dit explicitement qu'une resynchronisation ultérieure est gratuite « **si le chatter a rejoué
entre-temps sur GLA** » : la reprise **suit** GLA aussi longtemps que GLA vit. C'est une décision
produit, elle n'est pas rediscutée ici. Mais §5.11 en montre le coût, et il faut qu'il soit dit :

`/api/formation/boss-save` n'impose **aucun plafond** sur `total` (`serveur.py:1157-1160`). Un
chatter peut donc, en quelques minutes de script, poster 200 sessions boss à `total: 100,
validated: true` sur GLA, puis cliquer « Resynchroniser » chez nous. La roue ne paie pas
directement (§3.6), mais `training_case_bests`, `points`, `boss_best`, le **classement global**, le
**classement par module** et l'**Overview des encadrants** encaissent des chiffres inventés — de
façon permanente et **indiscernable** d'un historique légitime après coup. Et depuis 0121, un
classement forgé est un classement qui **influence l'encadrant qui donne les tours**.

Le lever, si Benoit le veut : une constante d'environnement **`GLA_CUTOFF_MS`** posée à la mise en
service, appliquée en `where created_ms <= $cutoff`. Elle borne le corpus, rend l'import réellement
fini, ferme la fenêtre de fabrication **et** borne le coût de chaque resynchronisation. Son prix est
exactement ce que D3 a choisi d'acheter : un chatter qui continue de jouer sur GLA après sa
réclamation ne récupère plus rien.

**Par défaut, `GLA_CUTOFF_MS` n'est pas posée** — D3 fait autorité. La variable existe pour pouvoir
la poser en une ligne le jour où l'on décide que GLA n'est plus une source vivante (ce qui arrivera
de toute façon, §9.4). En attendant, ce qui borne le risque est en §5.11 (bornes dures par import)
et une **alerte admin sur toute resynchronisation anormale** — plus de 50 sessions nouvelles d'un
coup, ou une session boss `total ≥ 90` sans `boss_details` : ça ne prouve rien, mais ça se regarde.
