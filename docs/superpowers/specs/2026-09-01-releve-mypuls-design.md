# Contrôle des shifts MyPuls — conception

> **Statut** : conception, 2026-09-01 — à valider par Benoit avant implémentation. Décisions
> produit **D1→D12** arrêtées en chat le 2026-09-01, non rediscutées ici.
>
> **En une phrase** : on reprend **tout** ce que MyPuls expose sur `/stats/shifts`, on l'éclate en
> quatre features lisibles à la DA de l'app, et on le branche sur les sanctions.

---

## 0. Ce que MyPuls expose, et ce que ça coûte

Tout est capturé et vérifié le 2026-09-01. Trois sources, trois coûts très différents — et c'est
cette différence qui commande l'architecture.

| Source | Contenu | Coût |
|---|---|---|
| `GET /stats/shifts` | Le sélecteur `reportCreators` : **la liste des modèles qui fait autorité** (18 chez MyPuls, 17 au CRM — `Elsamdd` est inconnu). Et les fenêtres de créneau configurées. | 1 appel, ~180 ko |
| `GET /stats/shifts/report.csv` | Une ligne par **segment d'activité** : `Chatteur ; ID chatteur ; Jour ; Début ; Fin ; Jour de fin ; Temps actif ; Messages ; Modèles` | **1 appel pour toute l'agence sur une plage.** ~2 600 segments/jour, ~175 ko/jour |
| `GET /stats/shifts/report` | Fragment HTML : 6 KPI d'agence + la **couverture des créneaux** (jour × créneau × chatteur, %) + le détail par chatteur | ~206 lignes de couverture/jour. Le tableau finit à **432 ko sur 1,2 Mo** → flux coupé après le premier `</table>` |
| `GET /stats/shifts?tab=activity&chatter=<id>&start=&end=` | **14 KPI** d'un chatteur + le graphe **minute par minute** (1 point/min sur la plage demandée) + les pauses détectées | ~186 ko, **1 appel par chatteur et par plage** |

**Les trois premières sont ingérées par cron** — elles couvrent toute l'agence pour 3 appels.
**La quatrième est chargée à la demande**, au moment où quelqu'un ouvre la fiche d'un chatteur
(D3). C'est ce qui permet d'avoir *tout* sans payer 155 appels par jour : ingérer la fiche de
chacun coûterait ~1 400 appels et ~250 Mo pour un rattrapage de 14 jours, pour une information que
personne ne regarde tant qu'il n'a pas cliqué.

### 0.1 Les 14 KPI de la fiche chatteur, relevés sur une capture réelle

| KPI | Sous-titre MyPuls | Exemple (Michel, 29/08 00:00 → 30/08 05:00) |
|---|---|---|
| Premier message | Heure de démarrage observée | 29/08 00:00 |
| Dernier message | Heure de fin observée | 30/08 05:00 |
| Messages envoyés | Total de messages sur la période | 1 817 |
| PPV proposés | Messages avec média (gratuit + payant) | 267 |
| PPV gratuit / payant | — | 49 gratuit · 218 payant |
| Golden ratio | PPV payants proposés / messages envoyés | 12 % |
| Comptes liés | Créateurs agrégés pour ce chatteur | 2 |
| **Temps connecté MyPuls** | Durée totale connectée (session app) | 893 min, **ventilé par modèle** dans l'infobulle |
| Temps actif MyPuls | Indice d'activité sur présence app | 100 % |
| Temps inactif MyPuls | Périodes sans activité détectée app | 0 min |
| Sessions MyPuls | Nombre de connexions sur la période | 5 |
| **Chatting actif** | Minutes avec activité messages régulière | 794 min |
| Chatting inactif | Pause détectée si ≥ 3 min sans message | 947 min |
| Messages / heure active | Intensité pendant les phases actives | 122 |

Le balisage est propre (`kpi-title` / `kpi-subtitle` / `kpi-value`) : parsing direct.

### 0.2 Quatre mesures faites sur la donnée réelle, qui commandent la suite

**`break` ne change rien à la mesure.** Sur le 29/08 (jour clos), `break=3` et `break=60` donnent
**exactement** le même temps actif pour **137 chatteurs sur 137** — seul le découpage change
(5 205 segments contre 443 vacations). C'est un paramètre d'affichage.

**`idle` décide de tout.** Le passer de 3 à 10 min ajoute **115 minutes médianes par chatteur et par
jour** (maximum relevé : +402). C'est lui, et lui seul, qui fixe le temps mesuré : **celui qui
touche `idle` touche les sanctions**. Figé en base et enregistré sur chaque run.

**Le créneau de nuit exige `reportEnd = D+1`.** Fenêtre 31/08→31/08 : Michel affiche **37,1 %** de
couverture. Fenêtre 31/08→01/09 : **97,5 %**. La Soirée court jusqu'à 05:00 le lendemain, et la
troncature ressemble trait pour trait à une faute.

**Les deux sources disent la même chose.** Bornés à la même fenêtre, le CSV donne 810 min /
1 838 msg pour Michel, la fiche 794 min / 1 817 msg. L'écart est exactement le segment
`04:08→05:16` que le CSV compte entier et que la fiche coupe à 05:00. **Le « Temps actif » du CSV
est le « Chatting actif » de la fiche** — même grandeur, même règle `idle`. On peut donc afficher
les deux sans se contredire.

### 0.3 Deux points d'identité

Le nombre entre parenthèses de la colonne `Modèles` (`Lolafps (322) | Claire_sps (310)`) est le
**nombre de messages**, pas un identifiant : la somme des parenthèses égale la colonne `Messages`
sur **4 218 lignes sur 4 218**.

Le couple **nom ↔ `ID chatteur`** est **bijectif** dans le CSV (0 collision sur 155 personnes et
7 jours). C'est ce qui rend sûre la jointure du tableau de couverture — qui ne porte que le nom —
aux segments, qui portent l'ID.

### 0.4 L'état de l'existant

`tracker_events`, `tracker_shift_rows` et `tracker_settings` sont **vides en production** (relevé le
2026-09-01) : les applications Electron n'ont jamais été repointées, et les trois écrans construits
pour elles sont hors sidebar depuis l'origine (`apps/web/src/config/workspaces.ts:132`). **Personne
n'a jamais rien vu de ces écrans.** Ce chantier ne remplace donc rien : il met en service, avec la
donnée MyPuls, une surface qui n'a jamais fonctionné.

---

## 1. Les décisions

| # | Décision | Conséquence assumée |
|---|---|---|
| **D1** | **On reprend tout ce que MyPuls expose** sur `/stats/shifts`. | Les 14 KPI, le graphe minute par minute, les 6 KPI d'agence, la couverture des créneaux, le détail des vacations et les fenêtres de créneau. Rien n'est laissé de côté. |
| **D2** | **Quatre features, une par surface**, pour la lisibilité (§5). | Relevé d'équipe · Vacations · Fiche d'activité · Créneaux & réglages. Un dossier par feature, pas un écran fourre-tout. |
| **D3** | **Agrégats agence par cron, fiche chatteur à la demande.** | 3 appels par nuit pour toute l'agence ; 1 appel au clic pour une fiche. C'est ce qui rend « tout reprendre » abordable. |
| **D4** | **Signalement à valider, jamais de sanction automatique.** | Le relevé pré-remplit le dialog Police existant. Aucune écriture dans `police_entries` depuis l'ingestion : les trois gardes, le Zod, la fenêtre de 14 jours et la fiche de paie restent le seul chemin. |
| **D5** | **Le verdict de couverture est celui de MyPuls, parsé, jamais recalculé.** | Mesuré : un recalcul depuis les segments donne une erreur médiane de 0,57 pt mais un **maximum de 20,7 pts** — inacceptable près d'un seuil qui coûte de l'argent. |
| **D6** | **Le CSV construit le pont d'identité.** `chatters.mypuls_user_id` se remplit au fil des runs. | 137 des 155 chatteurs se rapprochent dès le premier run, sans ambiguïté. On ne **crée** jamais de `chatters` depuis ce flux. |
| **D7** | **Le créneau attendu est `profiles.shift`, et rien d'autre.** | Les deux autres créneaux s'affichent, jamais en écart — sinon le zèle compte comme une faute. 62 des 230 chatteurs actifs n'ont pas de shift : ils apparaissent dans le bac à rattacher. |
| **D8** | **Seuil « poste tenu » = 80 %**, celui que MyPuls affiche. | Rangé en base pour être ajustable sans migration. |
| **D9** | **Tout sous Présence**, slug `presence`. | Aucun droit nouveau à distribuer sur 230 membres. |
| **D10** | **DA de l'app.** Abandon du thème `.trk` (`apps/web/src/app/tracker-theme.css`, 676 lignes). | Palette restreinte, hiérarchie par la typo et l'espace, aucun filet décoratif. |
| **D11** | **Tables `mypuls_shift_*` propres ; on n'écrit pas dans `tracker_events`.** | Y écrire obligerait à fabriquer un `device_id`, un `token_hash`, un `session_id` et un `client_event_id` par segment. Les tables `tracker_*` restent en place si l'agent revient un jour. |
| **D12** | **Rattrapage initial des 60 jours** que MyPuls conserve. | Matière dès le premier jour, comparaison semaine sur semaine immédiate. ~60 appels, une fois, hors cron. |

---

## 2. Une note factuelle, et un bug à ne pas laisser passer

### 2.1 Ce que MyPuls ne mesure pas

MyPuls voit les **messages**. Il ne voit pas le poste de travail : ni la fenêtre au premier plan,
ni le clavier, ni le PC éteint, ni le multi-poste. Les indicateurs de l'ancien tracker Electron qui
en dépendaient (sites & apps, hors-tâche, écran figé, pause déclarée, inactivité OS, machines
multiples) n'ont donc pas d'équivalent. Ce n'est pas un arbitrage : c'est une absence de donnée, et
elle ne retire rien à personne puisque ces écrans n'ont jamais rien affiché (§0.4).

Un point mérite d'être noté pour plus tard : l'écran figé était le seul détecteur d'automate. La
parade disponible ici est de nature différente — messages **et** couverture **et** régularité
minute par minute affichés ensemble, où un rythme mécanique se voit à l'œil. À rouvrir si les
agents Electron reviennent.

Les encadrants, eux, n'envoient pas de messages : ils n'ont aucune ligne chez MyPuls. La vue
Managers reste donc hors sidebar, comme aujourd'hui.

### 2.2 Le bug à neutraliser, sinon le Board est rouge pour tout le monde

Sans focus, `toolMinutes` vaut 0 (`get-shift-board.ts:60`). Or
`under: verdict.launched && toolMinutes < rules.toolMinMinutes` (`get-shift-board.ts:88`) devient
alors **vrai pour toute personne ayant travaillé** : le Board afficherait « N à sanctionner » sur
l'effectif entier. `under`, `toolMinutes` et `toolMinMinutes` sortent du contrat `BoardRow` — ils
sont remplacés par la couverture, pas mis à zéro.

### 2.3 Deux défauts existants, à corriger avant toute recette

Ils ne viennent pas de ce chantier mais fausseraient ses chiffres.

1. `launched: built.eventCount > 0` (`packages/core/src/tracking/segments.ts:192`) porte sur **tout
   le flux lu**, pas sur la fenêtre. Sur la fiche chatteur, qui charge le mois entier, le filtre
   `if (!verdict.launched) continue` ne rejette donc **jamais rien** : « N jours travaillés » compte
   tous les jours du mois.
2. Le même défaut sur le Board fait ressortir un chatteur du matin comme `launched` sur le créneau
   de l'après-midi. Il disparaît avec §2.2.

---

## 3. Le modèle de données — migration `0138`

Prochaine migration libre : **`0138`** (prod et UAT à `0137`, séquence contiguë sans trou).

### 3.1 `mypuls_shift_segments` — le fait de base

Une ligne par segment d'activité, au grain fin (`break = idle`), parce que c'est le grain qui porte
la timeline et que les vacations s'en déduisent. Clé primaire `(mypuls_user_id, started_at)` : deux
segments d'une même personne ne peuvent pas commencer dans la même minute, et la clé rend le
ré-import **idempotent**.

| Colonne | Type | Rôle |
|---|---|---|
| `mypuls_user_id` | `text not null` | L'`ID chatteur` du CSV. Clé stable, indépendante du pseudo. |
| `day` | `date not null` | Jour Paris de **début**. |
| `started_at` / `ended_at` | `timestamptz not null` | Bornes réelles, `Jour de fin` appliqué. |
| `active_minutes` | `int not null` | Colonne `Temps actif` = le « Chatting actif » de la fiche (§0.2). |
| `messages` | `int not null` | |
| `models` | `jsonb not null default '[]'` | `[{"label":"Lolafps","messages":322}]` — le pseudo MyPuls, brut. |
| `profile_id` | `uuid references profiles(id) on delete set null` | Résolu à l'import, `null` si orphelin. |

Volume : ~2 600/jour → ~950 k/an ; le rattrapage initial de 60 jours en pose ~156 k.

> **Les modèles ne sont pas résolus vers `creators` dans ce chantier.** Le CSV donne le pseudo
> (`Lolafps`), le CRM le nom d'usage (`Lola`) plus `creators.mypuls_creator_id`. Le rapprochement
> est faisable — le sélecteur de `/stats/shifts` porte le couple (id, pseudo) — mais il ouvre le
> piège de sous-chaîne connu (`Julie`/`Juliette`). On stocke le label brut ; la résolution est un
> chantier séparé, qui débloquerait le €/heure par modèle.

### 3.2 `mypuls_shift_coverage` — le verdict par créneau

Une ligne par `(jour, créneau, chatteur)`, ~206/jour. Clé primaire `(day, slot, mypuls_user_id)`.

| Colonne | Type | Rôle |
|---|---|---|
| `day` | `date not null` | |
| `slot` | `text not null check (slot in ('matin','aprem','soir'))` | Vocabulaire CRM (§3.6). |
| `slot_start_at` / `slot_end_at` | `timestamptz not null` | Bornes **réelles du jour**, stockées ligne à ligne : les créneaux MyPuls sont saisis dans un formulaire, modifiables à tout moment et sans versionnement. Les figer est le seul moyen de voir un changement. |
| `mypuls_user_id` | `text not null` | Résolu depuis le CSV du **même run** (jointure par nom, sûre car bijective — §0.3). |
| `chatter_label` | `text not null` | Le nom tel que MyPuls l'écrit — la preuve de ce qu'on a lu. |
| `profile_id` | `uuid references profiles(id) on delete set null` | |
| `coverage_pct` | `numeric(4,1) not null` | Le verdict MyPuls, tel quel. |
| `active_minutes`, `messages` | `int not null` | |
| `first_at` / `last_at` | `timestamptz` | Portent le retard. |

### 3.3 `mypuls_day_kpi` — les 6 KPI d'agence

Une ligne par jour : `chatters_actifs`, `vacations`, `active_minutes`, `messages`,
`models_worked` / `models_total`, `slots_held` / `slots_total`. Clé primaire `(day)`. Ce sont les
tuiles du haut du relevé MyPuls, reprises telles quelles.

### 3.4 `mypuls_shift_settings` — une ligne, `id int primary key check (id = 1)`

`idle_minutes int not null default 3` — **le paramètre qui décide du temps mesuré** (§0.2) ;
`break_minutes int not null default 60` — regroupement d'affichage ;
`coverage_threshold numeric not null default 80` — le seuil de D8.

### 3.5 `mypuls_shift_runs` — le journal, et le garde-fou

Sans lui, un run échoué et une journée sans travail sont **indiscernables** : c'est le faux positif
le plus cher du chantier, et il produirait des sanctions injustes.

`id`, `ran_at`, `day_from`, `day_to`, `status text check (status in ('ok','echec'))`,
`segments int`, `coverage_rows int`, `unmatched jsonb`, `error text`, plus les valeurs d'`idle` et
de seuil **utilisées par ce run** — pour qu'un changement de réglage soit lisible dans l'historique.

L'écran lit ce journal : un jour sans run `ok` affiche **« relevé indisponible »**, jamais des zéros.

### 3.6 Le vocabulaire des créneaux, tranché une fois

Trois vocabulaires cohabitent : le domaine tracker dit **`nuit`**
(`packages/core/src/tracking/shifts.ts:19`), le CRM dit **`soir`**, MyPuls dit **« Soirée »**. Les
heures, elles, sont **identiques** — 05→13, 13→21, 21→05 des deux côtés, sans conversion.

On tranche sur **`soir`** : c'est le vocabulaire de `profiles.shift` et de `police_entries.shift`,
donc celui qui compte au moment de la sanction. Conséquence : le paramètre d'URL du relevé est
`?shift=soir`. `shifts.ts` garde `nuit`, on n'y touche pas.

### 3.7 RLS et lecture

RLS activée sur les cinq tables, **policy de lecture seulement**
(`is_admin() or has_page('presence')`), écriture en service-role après garde applicative — la règle
posée en `0125:259` et confirmée par `0127`.

Lecture par **RPC `security invoker` renvoyant du `jsonb`** : jamais de `select` nu. Un mois de
segments dépasse largement la troncature silencieuse à 1 000 lignes de PostgREST.

> **La RLS n'est pas cloisonnée par modèle** — tout porteur du droit `presence` lit toutes les
> lignes, comme le Tracker existant. Le cloisonnement par modèles reste **applicatif**
> (`lib/services/creator-scope.ts`) et doit être rappelé par chaque surface de lecture.

---

## 4. L'alimentation

### 4.1 Le run nocturne — trois requêtes pour toute l'agence

Pour un jour `D` :

1. `GET /stats/shifts` — les `<option>` de `reportCreators`. **La liste MyPuls fait autorité** :
   un périmètre partiel couperait artificiellement les segments d'un chatteur multi-modèles. Les
   modèles inconnus du CRM sont **signalés**, pas ignorés.
2. `GET /stats/shifts/report.csv?reportStart=D&reportEnd=D+1&idle=<settings>&break=<idle>&creators[]=…`
   → les segments.
3. `GET /stats/shifts/report?<mêmes paramètres>` → les 6 KPI et la couverture, **flux coupé après
   le premier `</table>`** (`reader.cancel()`), soit 432 ko lus sur 1,2 Mo.

On n'écrit que les lignes `day = D`. Celles de `D+1`, tronquées, sont jetées et refaites le
lendemain.

**Cron après 05:30 Paris** — la Soirée de `D` se termine à 05:00 le lendemain. Coût : 3
sous-requêtes sur les 50 autorisées, ~600 ko. Le compte Cloudflare a 3 créneaux de cron libres.

Rattrapage : si le dernier run `ok` remonte à plusieurs jours, le run suivant reprend les jours
manquants, plafonné comme le fait déjà `maxCatchup`.

### 4.2 La fiche chatteur — à la demande (D3)

Au chargement de `/chatter/presence/[profileId]`, un appel serveur à
`/stats/shifts?tab=activity&chatter=<mypuls_user_id>&start=…&end=…` renvoie les 14 KPI et les
points minute par minute. **Vérifié** : la page répond pour n'importe quel chatteur et n'importe
quelle plage **sans `switchCreator` préalable** — elle agrège les comptes liés d'elle-même.

Le précédent existe : `apps/web/src/features/tracking-todo/import-actions.ts` fait déjà une lecture
authentifiée côté serveur depuis l'app. Réponse en une à quelques secondes (requêtes Elasticsearch
annoncées par MyPuls) : la page porte donc un `maxDuration` et un squelette de chargement, et le
résultat est mis en cache court par `(profil, plage)`.

Si MyPuls ne répond pas, la fiche affiche ses blocs ingérés (couverture, vacations, messages) et
signale que le détail minute par minute est indisponible — elle ne plante pas.

### 4.3 Le parseur — un seul, pour les deux runtimes

Parsing par découpage et expressions régulières, **sans cheerio ni HTMLRewriter** : c'est le patron
de `packages/mypuls/src/endpoints/scripts.ts`, écrit pour tenir dans le budget CPU du Worker.
Contrairement à money-team, ce flux n'aura donc **pas de doublon de parseur**.

Emplacement : `packages/mypuls/src/endpoints/shifts.ts`, **avec des tests** — le package déclare
Vitest mais n'a aucun `*.test.ts` aujourd'hui. Fixtures : extraits courts des captures du 29/08 et
du 31/08, committés sous `packages/mypuls/src/endpoints/__fixtures__/` (`apps/ingestion/raw/` est
gitignoré, les captures complètes restent locales).

Quatre parseurs : `parseCreatorOptions`, `parseSegmentsCsv`, `parseTeamReport` (KPI + couverture),
`parseChatterActivity` (14 KPI + série minute).

### 4.4 Le domaine — `packages/core/src/mypuls-shifts/`

Pur, testé Vitest : `groupIntoVacations(segments, breakMinutes)` (regroupement par trou ≥ `break`,
l'opération que MyPuls fait côté serveur et qu'on refait pour l'affichage), `slotOf(labelMyPuls)`,
`held(coveragePct, threshold)`, `detectPauses(serie, idleMinutes)`, et la conversion de vocabulaire
de §3.6.

### 4.5 Le rattrapage initial (D12)

Script Node hors Worker — `pnpm --filter @glagency/ingestion backfill-shifts <du> <au>` — sur les
60 jours que MyPuls conserve, séquentiel, même parseur.

### 4.6 L'identité (D6)

Par run, pour chaque `(mypuls_user_id, label)` du CSV :

1. `chatters` par `mypuls_user_id` — chemin rapide une fois le pont construit.
2. Sinon `normLabel(label)` contre `chatters.display_name` (`apps/ingestion/src/norm.ts`, source
   unique déjà partagée par money-team et spenders). Si **exactement un** match et que son
   `mypuls_user_id` est vide → **on l'écrit**.
3. `profile_id` par `profiles.chatter_id`.
4. Sinon : orphelin, `profile_id null`, label conservé, remonté à l'écran.

Mesuré le 2026-09-01 : **137 des 155** chatteurs du CSV se rapprochent sans ambiguïté ;
`chatters.mypuls_user_id` est aujourd'hui **vide sur les 481 lignes**. Les 18 restants sont
majoritairement des encadrants (« Manager Axel », « Nico manager ») ou des adresses e-mail.

> **On ne crée jamais de `chatters` depuis ce flux** — le pipeline money-team le fait déjà sur
> label inconnu, et le doubler produirait des doublons. Et on rapproche sur `chatters`, pas sur
> `profiles`, parce que `profiles` contient de vrais homonymes : deux « Ridwane » actifs.

Seuls **111 des 230** chatteurs actifs ont aujourd'hui un `chatter_id` : les autres n'auront pas de
ligne tant qu'ils ne sont pas rattachés, et c'est ce que le bac d'orphelins rend visible.

---

## 5. Les quatre features (D2)

Toutes sous `/chatter/presence`, slug `presence`, DA de l'app.

### 5.1 `mypuls-shift-board` → `/chatter/presence` — **Relevé d'équipe**

La vue « qui a tenu son poste ». En haut, les **6 KPI d'agence** de MyPuls : chatteurs actifs,
vacations, temps actif cumulé, messages envoyés, modèles travaillés (`17/18`), créneaux tenus.
En dessous, la **couverture des créneaux**, groupée par modèle, filtrable par créneau / date /
modèle dans l'URL.

Par ligne : chatteur, modèle(s) **observés**, couverture avec sa barre et le seuil de 80 %, temps
actif, messages, première → dernière activité, retard, verdict tenu / sous le seuil.

Les deux autres créneaux d'une personne sont consultables mais jamais comptés comme un écart (D7).
Un chatteur sans activité affiche « aucune activité », en neutre : **on ne conclut pas « absent »**,
faute de source de jours travaillés — sinon chaque jour de repos deviendrait un signalement.

Pas d'auto-refresh : la donnée ne bouge qu'une fois par nuit.

### 5.2 `mypuls-shift-vacations` → `/chatter/presence/vacations` — **Détail des vacations**

Le « Détail par chatteur » de MyPuls : une ligne par vacation (segments regroupés à `break`), avec
jour, début, fin, temps actif, messages, ventilation par modèle et créneau de rattachement.
Filtrable par chatteur, modèle, créneau, période. C'est la vue d'enquête — celle qu'on ouvre quand
un chiffre du relevé surprend.

### 5.3 `mypuls-chatter-activity` → `/chatter/presence/[profileId]` — **Fiche d'activité**

Les **14 KPI** de §0.1, le **graphe minute par minute** avec les pauses détectées, le temps connecté
ventilé par modèle, et l'historique de couverture jour par jour du chatteur. Chargée à la demande
(§4.2).

### 5.4 `mypuls-shift-settings` → `/chatter/presence/reglages` — **Créneaux & réglages**

Les fenêtres de créneau lues chez MyPuls (bornes, libellés), les réglages `idle` / `break` / seuil,
et le **journal des runs** : quand, sur quels jours, combien de segments, quels chatteurs non
rapprochés, et les valeurs de réglage utilisées. C'est ici qu'on voit qu'une nuit manque.

Le **bac d'orphelins** y vit aussi : les labels MyPuls non rapprochés, et les chatteurs actifs sans
`profiles.shift` (62 aujourd'hui) — les deux populations qui manquent au relevé.

### 5.5 Le lien sanction (D4)

Depuis le relevé (5.1) et le détail (5.2), sur une ligne sous le seuil : un bouton **ouvre le dialog
Police existant pré-rempli** — chatteur, jour, `shift` (le vocabulaire concorde déjà), motif
`horaires` (`packages/core/src/domain/police-errors.ts:28`). Le montant reste **entièrement humain**.

Le bouton est masqué si le chatteur est hors du périmètre modèles de l'appelant, et au-delà de la
fenêtre de saisie de 14 jours (`isDayInWindow`, `apps/web/src/features/police/schema.ts:15`) :
proposer un geste que le serveur rejettera est pire que ne rien proposer.

### 5.6 Sidebar

Quatre items sous le groupe Présence, tous slug `presence`
(`apps/web/src/config/workspaces.ts:132`), et mise à jour du commentaire qui explique l'absence
actuelle. La fiche (5.3) reste hors sidebar : on y arrive depuis le relevé.

---

## 6. Droits et périmètre

Inchangés : `requireAccess('presence')`, périmètre modèles applicatif via `getCreatorScope`,
`notFound()` sur une fiche hors périmètre. Rien de nouveau à distribuer sur 230 membres (D9).

---

## 7. Découpage en incréments

Comptés en PR, dans l'ordre.

1. **Socle** — migration `0138`, les quatre parseurs dans `packages/mypuls` **avec tests sur
   fixtures**, domaine `packages/core/src/mypuls-shifts/` testé, types régénérés.
2. **Ingest** — le run nocturne (§4.1), identité et backfill, journal de run, cron, Sentry, script
   de rattrapage 60 jours. **Vérifiable seul** : la base se remplit, aucun écran ne change.
3. **Relevé d'équipe** (5.1) — RPC de lecture, KPI, couverture, DA, sidebar, neutralisation du bug
   §2.2.
4. **Détail des vacations** (5.2).
5. **Fiche d'activité** (5.3) — lecture à la demande, graphe minute par minute, correction du
   défaut `launched` (§2.3).
6. **Créneaux & réglages** (5.4) — journal des runs et bac d'orphelins.
7. **Lien sanction** (5.5).

Les incréments 1→3 forment un système utilisable.

---

## 8. Risques

| Risque | Portée | Parade |
|---|---|---|
| Session MyPuls morte → aucun relevé | Faux positif de sanction | `mypuls_shift_runs` (§3.5) : un jour sans run `ok` affiche « relevé indisponible », jamais des zéros. |
| Un changement d'`idle` déplace le temps mesuré de ~115 min/jour | Argent | Valeur figée en base et **enregistrée sur chaque run**. Tout changement est daté et visible. |
| Les créneaux MyPuls sont modifiables sans versionnement | Historique incohérent | Bornes réelles stockées **sur chaque ligne** de couverture (§3.2). |
| MyPuls change son rendu HTML | Verdict ou fiche illisibles | Le parseur échoue **bruyamment** (run en `echec`), jamais une liste vide silencieuse. |
| La fiche à la demande est lente ou indisponible | Écran qui rame ou plante | `maxDuration`, squelette, cache court, et repli sur les blocs ingérés (§4.2). |
| `profiles.chatter_id` manquant sur 119 chatteurs actifs | Lignes absentes, pas lignes à zéro | Bac d'orphelins (§5.4). Le backfill de `mypuls_user_id` ne le résout pas : c'est un rattachement à faire à la main. |
| Bascule d'heure d'été/hiver | Une vacation entière décalée de créneau | Heures murales Paris, conversion par `parisWallUtcMs` comme le reste du domaine. Test sur les deux dates de bascule. |
| Deux mesures de présence en base | Contradiction à l'écran | `chatter_daily.presence_active_h` existe déjà, alimentée par money-team au grain jour. À trancher : laquelle fait foi (§9). |
| Plus de détecteur d'automate | Structurel | §2.1. Messages, couverture et régularité minute par minute affichés ensemble. |

---

## 9. À trancher plus tard

- **Laquelle des deux mesures de présence fait foi** : `chatter_daily.presence_active_h` ou le
  relevé par segment. Les afficher toutes les deux, c'est se contredire à l'écran.
- **Résolution des modèles** vers `creators` — débloquerait le €/heure par modèle en jointure avec
  `chatter_creator_daily`.
- **Marqueur de provenance** sur les faits, si les agents Electron reviennent un jour, même
  partiellement. Sans lui, un historique mixte est ininterprétable.
- **Ingestion de la fiche** plutôt qu'à la demande, si l'usage montre qu'on la consulte pour tout le
  monde tous les jours (~155 appels/jour). La question ne se pose qu'à ce moment-là.
- **Suivi des encadrants**, si on en veut un : d'une autre nature (déclaratif), et il faudra le dire
  à l'écran pour qu'on ne compare pas ses chiffres à ceux des chatteurs.
