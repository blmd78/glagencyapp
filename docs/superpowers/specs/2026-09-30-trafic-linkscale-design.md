# Trafic LinkScale — design (2026-09-30)

## Demande

Message transmis par Benoit le 2026-09-30 : « Linkscale, l'API de base : nombre de clics par jour
dans le CRM, pouvoir lier avec un lien. Checker Linkscale pour une intégration MYM. » Puis Benoit :
« une partie trafic […] qui permet de savoir le nombre de clics par profil » — « voir où est-ce que
le trafic va, pourquoi, et corriger là où ça ne va pas ». Les choix de conception lui ont été
délégués (« fais ce que tu voulais de base »).

Périmètre : la partie Trafic. D'où vient le trafic, par modèle, réseau et profil, et quels
profils décrochent. **Pas de CA ni d'abonnés sur cette page** (décision Benoit, 2026-10-01) : le
raccord avec MyPuls, un temps envisagé en « V2 », est abandonné.

## Ce qui existe (mesuré le 2026-09-30)

**LinkScale** (projet « GoodLuck », via l'API en lecture seule)
- **307 liens**. 99 ont eu du trafic en septembre, soit ≈ 4 600 visiteurs humains uniques, et
  662 bots filtrés.
- Sources en septembre : X 7 195 visites, Instagram 470, Threads 20.
- **1 dossier = 1 modèle** : CARLA, JULIE, MANON, LOLA, LENA, LUCIE, SARAH, ALICE, Elsa. S'y
  ajoutent « TEST SNAP TWITTER » (liens Snap, modèle dans la note), « TRHEADS TEST » et
  « julie cmo ig ». 193 liens ne sont dans aucun dossier.
- **La note du lien indique le profil**. C'est du texte libre, sans convention stricte :
  - `IN JULIETARDIFF`, `IN Carla.Jadot` : un compte Instagram. La plupart retrouvent leur compte
    dans `mkt_social_accounts` par le pseudo.
  - `TW ARA`, `TWJADE`, `Tw JADE`, `TW RORO LENA` : un **opérateur** X (une personne derrière
    plusieurs comptes). Aucun ne correspond à un compte X du CRM. `mkt_staff` ne compte qu'un VA
    (Skyyz).
  - `Lucie`, `julie` : la modèle seule (les liens Snap).
- Types de liens :
  - `l_p` : page avec boutons ; en septembre, tous les clics sur ces boutons vont vers
    `mym.fans/app/t/<hash>` ;
  - `d_l` : redirection directe, 11 sur 49 vers MYM, les autres vers Snapchat ;
  - `shortcut` : 190 liens.
- **58 liens MYM distincts** reçoivent des clics depuis LinkScale. Seuls **11** se retrouvent
  dans `mkt_links.url`, parce que MyPuls ne donne que le nom de ses liens : 55 URL sur 375 en base.
- **Historique disponible au moins depuis mai 2026.** Quelques jours relevés :

  | Jour | Liens actifs | Visiteurs | Clics MYM |
  |---|---|---|---|
  | 15/06 | 43 | 516 | 487 |
  | 15/07 | 108 | 2 023 | 2 487 |
  | 15/08 | 49 | 159 | 301 |
  | 15/09 | 54 | 154 | 241 |
  | 29/09 | 35 | 117 | 45 |

## Faits de l'API LinkScale (docs.linkscale.to, testés le 2026-09-30)

- Clé de projet `lk_…` créée dans Dashboard → Projet → API Keys, en lecture seule. On l'envoie en
  `Authorization: Bearer`. Limite : 2 requêtes/s.
- `GET /api/v1/stats?from=J&to=J+1&timezone=Europe/Paris&include_clicks=true` :
  - renvoie `trafficByUrls[]`, une ligne par lien qui a eu du trafic dans la fenêtre : `id`,
    `host`, `u`, `note`, `human_users`, `bots`, `button_clicks[]` (`url`, `clicks`) ;
  - une date sans décalage est interprétée à l'heure de Paris ;
  - **`dailyTraffic` revient vide** : pour avoir le détail par jour, on fait un appel par jour.
- `traffic_type=visits` rend **moins** de visites que de visiteurs uniques sur la même journée
  (59 contre 117 le 29/09), ce qui est incohérent. On garde le mode par défaut (`unique_users`),
  celui du dashboard.
- `GET /api/v1/links` (paginé) et `GET /api/v1/folders` : type, dossiers, destination (`url`
  pour les `d_l`), `enabled`. Certains liens présents dans `trafficByUrls` **n'apparaissent pas**
  dans la liste (probablement supprimés).
- Aucun endpoint de CA ni d'abonnés : `/integrations` et `/revenue` rendent 404. L'intégration MYM
  (v5, 2026-09-15) n'existe que dans leur dashboard.

## Décisions

1. **Un lien LinkScale = une ligne**, identifiée par son id LinkScale. Il est créé dès qu'il
   apparaît dans les stats ou dans la liste. Un lien qui disparaît de la liste (supprimé côté
   LinkScale) garde sa note, ses dossiers et son type déjà connus, donc son attribution. Les stats sont la référence, puisqu'elles portent
   aussi des liens absents de la liste.
2. **Visiteurs** = `human_users` (mode par défaut). **Bots** = `bots`. **Clics MYM** = somme des
   `button_clicks` dont l'URL contient `mym.fans`. Pour un `d_l`, les clics MYM restent vides
   (`null`) : la visite *est* la redirection, et le lien n'entre pas dans le calcul du taux de clic.
3. **Attribution automatique, puis correction à la main** (même mécanique que les groupes de liens,
   `0169`). Une ligne corrigée à la main (`manual = true`) n'est plus jamais touchée par l'ingestion.
4. **Aucune écriture dans LinkScale** : la clé est en lecture seule. Le CRM signale, et l'équipe
   corrige dans LinkScale ou sur le compte.
5. **MyPuls reste la seule source du CA.** La page Trafic n'affiche ni abonnés ni CA.

## PR 1 — le relevé

### Données — migration `0179`

- `mkt_ls_links` :
  - identité : `id uuid pk`, `ls_id text unique`, `url text` (`host/u`), `note text`,
    `folders text[]`, `kind text check (kind in ('landing','redirect','shortcut','inconnu'))`,
    `destination text` ;
  - attribution : `creator_id` → `creators`, `platform text check (platform in
    ('x','instagram','threads','snapchat','autre'))`, `social_account_id` →
    `mkt_social_accounts`, `operator text`, `manual boolean default false` ;
  - suivi : `first_seen date`, `last_seen date`.
- `mkt_ls_daily` : `(link_id, date)` en clé primaire, `visitors int`, `bots int`,
  `mym_clicks int null`.
- RLS : même politique que `0167`/`0170` (`for all to authenticated`, avec
  `can_write_page('marketing')`). L'ingestion écrit en service-role.
- Régénérer `packages/db/src/types.ts`.

### Règles pures — `@glagency/core` (`src/marketing/linkscale.ts`, testées)

- `parseLinkscaleDay(payload)` → une ligne par lien : visiteurs, bots, clics MYM.
- `attributeLink({ note, folders, kind, destination }, { creators, accounts })` →
  `{ creatorId, platform, socialAccountId, operator }` :
  - **Réseau** : préfixe de la note (`TW`/`Tw` → x, `IN` → instagram, `THREADS` → threads), ou
    destination `snapchat.com` → snapchat. Sinon `autre`.
  - **Opérateur** (x uniquement) : premier mot après le préfixe, en majuscules. `TWJADE`,
    `Tw JADE` et `TW JADE` donnent tous JADE.
  - **Compte** (instagram) : pseudo de la note comparé au `handle` des comptes Instagram, en
    ignorant la casse, les points et les tirets bas.
  - **Modèle**, dans cet ordre :
    1. le dossier dont le nom égale le nom d'une créatrice, sans tenir compte de la casse ni des
       accents (CARLA → Carla, pas « Carla (privé) ») ;
    2. la modèle du compte Instagram trouvé ;
    3. un prénom de modèle **après** l'opérateur (`TW RORO LENA` → Lena) ;
    4. une note réduite à un prénom (`Lucie`).

    Sinon, non attribué. `TW JADE` désigne l'opérateur JADE, jamais la modèle Jade.
- `trafficFlags(current, previous, networkRate)` → les raisons « À regarder » :
  - **chute** : visiteurs < 50 % de la période précédente, qui en avait ≥ 30 ;
  - **éteint** : 0 visiteur, alors que la période précédente en avait ≥ 10 ;
  - **clic faible** : taux de clic MYM < 50 % du taux du réseau, avec ≥ 30 visiteurs (liens
    `landing` seulement) ;
  - **bots** : `bots / (visiteurs + bots)` > 20 %, avec `visiteurs + bots` ≥ 30.

### Le job — `apps/ingestion/src/marketing-linkscale.ts`

- Fan-out `?job=linkscale` dans le cron `5 23`, juste après X (`worker.ts`). **Aucun nouveau
  cron** : 5 au maximum par compte sur l'offre Free.
- Chaque nuit, il réécrit **J-1 et J-2** (heure de Paris), avec un appel stats par jour.
  - Il rafraîchit la liste des liens et les dossiers.
  - Il attribue les liens non manuels et fait deux upserts groupés.
  - Budget : ≈ 12 sous-requêtes, pour un plafond de 50.
  - Risque CPU (10 ms sur l'offre Free) : si la liste des liens coûte trop, elle part dans un
    fan-out à part.
- CLI `pnpm linkscale [AAAA-MM-JJ AAAA-MM-JJ]` (arguments positionnels, comme `pnpm marketing`),
  pour le **remplissage depuis mai**. Il fait un appel par jour, espacés d'au moins 500 ms.
- Taux de clic = clics MYM / visiteurs **des liens à boutons** : les visiteurs d'une redirection
  (`d_l`) n'entrent pas dans le dénominateur. Sinon, le taux d'une modèle qui a des redirections
  serait artificiellement bas.
- Secret **`LINKSCALE_API_KEY`** : `.env` pour la CLI, `wrangler secret put` pour le Worker, une
  ligne dans `.env.example` et une dans le bloc secrets de `wrangler.toml`. Sans secret, le job ne
  fait rien, le signale (`degraded`) et la nuit continue.
- Résumé du run dans `ingest_runs` (`job: 'marketing-linkscale'`) : jours lus, liens vus, liens
  non attribués.

## PR 2 — la page `/marketing/trafic`

- Nav Marketing, groupe « Réseaux », juste après « Liens tracking » : label « Trafic », icône
  `MousePointerClick`, droit `mkt-trafic`. Il faut l'ajouter à `PAGE_SLUGS` et à
  `workspaces.test.ts`.
- Feature `features/marketing-trafic/` : `page.tsx` → `services/` (lectures avec `fetchAll`) →
  `TraficTemplate` → composants. Sélecteur de période `resolvePeriod`, comme les autres pages.
- **En-tête** : visiteurs, clics MYM, taux de clic et part de bots, comparés à la période
  précédente de même durée. La période s'arrête au **dernier jour relevé** (aujourd'hui ne l'est
  jamais) et la précédente prend cette durée effective : sinon un début de mois ferait sortir
  chaque lien « Éteint ».
- **Courbe par jour** : visiteurs et clics MYM.
- **Tableau** :
  - regroupable par **modèle**, **réseau** ou **profil** (compte Instagram, opérateur X, ou note) ;
  - colonnes : visiteurs, évolution, clics MYM, taux, % bots, **À regarder** (raisons de
    `trafficFlags`) ;
  - tri par défaut : visiteurs de la période, puis de la précédente — les lignes actives d'abord,
    les éteintes en bas (« signalées d'abord » remontait des pages d'anciens liens à 0, retour de
    Benoit 2026-10-01).
  - onglets **Profils** (regroupés), **Modèles**, **Réseaux**, et **Liens** (une ligne par lien
    LinkScale, la seule vue où l'on corrige).
- **Correction** : une fenêtre sur la ligne d'un lien permet de choisir la modèle, le réseau, le
  compte ou l'opérateur, ce qui passe `manual = true`. Server Action réservée à qui a le droit
  d'écriture sur la page.
- Mêmes composants et même style que les pages marketing existantes. Aucune nouveauté visuelle.

## Hors périmètre

- **Le raccord MyPuls** (lien MYM → lien de tracking MyPuls → abonnés → CA) : abandonné, la page
  Trafic n'a pas besoin du CA (décision Benoit, 2026-10-01). Pour mémoire, seuls 11 liens MYM sur
  58 se rattachaient tout seuls, MyPuls ne donnant pas l'URL de ses liens.
- Les comptes sociaux vus par LinkScale (un seul compte X y est suivi).
- Toute écriture dans LinkScale, et les notifications.

## Mise en prod

Appliquer `0179` en prod, faire `wrangler secret put` puis déployer le Worker, et lancer le
remplissage sur la base prod : **accord explicite de Benoit pour chacune de ces étapes**. Ajouter
une ligne sous « Non publié » dans `CHANGELOG.md` et une ligne dans `docs/CARTE.md` (feature
`marketing-trafic` et commande `pnpm linkscale`).

## Nom

Une page « Sources de trafic » existe déjà côté Chatteurs (`/chatter/sources-trafic`). Elle est
dans un autre espace, mais le nom est voisin : si l'équipe confond, on renommera.
