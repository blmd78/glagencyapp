# Comptes X (Twitter) — design (2026-09-28, révisé le 2026-09-29)

## Demande

Benoit, du 2026-09-24 au 2026-09-29 : « récupérer les données des comptes directement sur les
réseaux — ça nous permettra de connecter les comptes aux notes, et on aura stats + liaison avec la
partie chat » ; puis « on focus Twitter / X » ; « on prend l'API de Twitter/X pour récupérer toutes
les stats par profil » ; « faut connecter l'API, qui va être appelée toutes les nuits en même temps
que les autres crons ». La page Twitter / X est revenue dans la sidebar le 2026-09-29.

Hors périmètre, écarté en chemin : Instagram (plus tard), TikTok (aucun compte), Telegram et
Snapchat (des bots, pas des comptes), la messagerie privée X centralisée (étudiée le 2026-09-28 :
~3 750 $/mois au volume supposé, et bloquée par XChat, chiffré de bout en bout), les stats par
tweet (facturées au tweet).

## Ce qui existe (mesuré en prod)

- `mkt_social_accounts` (0018) : **42 comptes X**, aucun rattaché à une modèle ni à un VA.
- `mkt_social_daily` : relevés X arrêtés au **2026-06-23** (flux Discord legacy, saisi à la main).
- `mkt_links` : **226 liens X** (`type = 'twitter'`), tous avec `creator_id` — **17 135 abonnés,
  20 924 € cumulés**, 217 actifs sur 7 jours. On sait ce que rapporte un lien, jamais un compte.
- Pour **37 comptes sur 42**, au moins un lien porte le pseudo dans son nom (`TWlolaa_chic`).
- La page `/marketing/twitter` (feature `marketing-social`) lit déjà `mkt_social_daily`.
- Le job Instagram (`marketing-social.ts`) donne le patron : date UTC du run, dernier relevé
  antérieur par `mkt_social_prev_snapshot` (0089, une sous-requête), upsert `(account_id, date)`,
  statut `introuvable` sans chiffres.

## Faits de l'API X (docs.x.com, vérifiés les 2026-09-28/29)

- **Accès** : console.x.com → app → **Bearer Token**, « for read-only public data access ». Aucune
  connexion compte par compte.
- `GET /2/users?ids=` et `GET /2/users/by?usernames=` : **100 comptes par requête**.
- Champs du profil : `public_metrics` (`followers_count`, `following_count`, `tweet_count`,
  `listed_count`), `verified_followers_count`, `url` + `entities` (lien de la bio),
  `most_recent_tweet_id`, `protected`, `username`… **Valeurs du moment seulement** : aucun
  historique, la courbe n'existe que si on relève nous-mêmes.
- Facturation **par compte lu** (0,010 $), pas par requête ; relire le même compte le même jour UTC
  n'est pas refacturé. Crédits prépayés, **plafond de dépense** réglable dans la console.

## Décisions

1. **Relevé chaque nuit**, avec les autres jobs (décision Benoit 2026-09-29) : 42 comptes ≈
   **12,60 $/mois**, 100 comptes ≈ 30 $. Plafond de dépense fixé dans la console X.
2. **Infos retenues** (le reste est ignoré) : abonnés, abonnés vérifiés, abonnements, total de
   tweets (→ tweets publiés par différence), **lien de la bio**, **date du dernier tweet**
   (déduite de l'identifiant du tweet), statut.
3. **Jamais de zéro inventé** : un compte introuvable ou suspendu a un statut, pas de chiffres.
4. **Pas de CA côté chat** : les chatteurs voient les comptes et leurs abonnés X, jamais ce que
   rapporte un compte (même raison qu'Équipe › Modèles, fermé à 401 chatteurs sur 403).
5. **Un lien appartient à au plus un compte** (`mkt_links.account_id`) ; automatique d'abord,
   épinglé à la main ensuite — même mécanique que les groupes (`0169`).

## PR 1 — le relevé X

### Données — migration `0177`

- `mkt_social_accounts.x_user_id text` — l'identifiant X, stable : un compte **renommé** reste le
  même compte, et le relevé met son `handle` à jour. Unique parmi les comptes X.
- `mkt_social_daily` : + `following integer`, `verified_followers integer`, `posts_total integer`,
  `bio_url text`, `last_post_at timestamptz`. `followers`, `delta_followers`, `posts_24h`
  (= tweets publiés depuis le relevé précédent) et `status` existent déjà.
- `mkt_social_prev_snapshot` rend en plus `posts_total` (recréée ; les jobs Instagram et Telegram
  n'en lisent que leurs colonnes).

### Règles pures — `@glagency/core` (testées)

- `parseXUser(user)` → la ligne du jour : métriques, lien de bio (l'URL **déployée** de
  `entities.url`, pas le `t.co`), statut (`privé` si `protected`).
- `xStatusFromError(error)` → `suspendu` / `introuvable` d'après l'erreur rendue par l'API.
- `tweetDate(id)` → date de création d'un tweet d'après son identifiant (format Snowflake).
- `chunk(ids, 100)` pour les requêtes.

### Le job — `apps/ingestion/src/marketing-x.ts`

- Comptes X actifs ; lecture par `x_user_id` quand on l'a, sinon par pseudo (et on garde l'id
  rendu) ; compte absent → statut sans chiffres ; pseudo changé → `handle` mis à jour.
- Deltas contre le dernier relevé antérieur (`mkt_social_prev_snapshot`).
- **Plafond dur de 200 comptes par run** ; le résumé dit combien de comptes ont été lus (= le coût).
- Secret **`X_BEARER_TOKEN`** (`wrangler secret put` + `.env` pour le CLI). Absent → le job ne fait
  rien, le signale, et la nuit continue.
- **Déclenchement** : fan-out `?job=x` depuis le cron de 23h05, juste après `?job=marketing` —
  aucun slot cron. Aussi à la main : `?job=x` et `pnpm --filter @glagency/ingestion x`.
- Journal : `ingest_runs`, job `marketing-x` (même `runJobAndLog` que les autres jobs marketing).

### Page Twitter / X

- Le bandeau « pense à la saisie du jour » devient « relevé X chaque nuit » (la saisie n'existe
  plus depuis juillet) et ne s'affiche que si le dernier relevé a plus d'un jour de retard.
- La tuile « Vues » et la colonne « Vues période » sortent pour X : un profil ne rend pas de vues.
- Nouvelles colonnes : tweets publiés sur la période, lien en bio (✔ / ✘), dernier tweet.

## PR 2 — comptes ↔ liens, Sources de trafic

- `mkt_links.account_id uuid references mkt_social_accounts(id) on delete set null` +
  `account_manual boolean not null default false`.
- Règle pure `accountForLink(linkName, accounts)` : noms normalisés (`normalizeKeyword`), candidats
  = comptes dont le pseudo (≥ 4 caractères) est contenu dans le nom du lien, **le plus long gagne**,
  égalité → aucun. **Liens du groupe X seulement** (un même pseudo existe souvent sur Instagram).
  `creatorOfAccount(links)` : modèle majoritaire, ne remplit `creator_id` que s'il est vide.
  Rejouée à l'ingestion des liens et à chaque création/modification de compte.
- Le lien de la bio relevé en PR 1 servira de second indice quand l'URL du lien est connue.
- Page X : abonnés MyPuls, CA et clics par compte ; « Ajouter un compte » (outline `sm`) ; dans
  l'onglet Liens, choix du compte d'un lien (épingle).
- Marketing › Modèles › Sources de trafic : sous Twitter / X, les comptes de la modèle et leurs
  chiffres. Chatteurs › Équipe › Sources de trafic : pseudo cliquable, abonnés X, date du relevé —
  **sans CA** — via `mkt_model_x_accounts()`, `security definer`, règle miroir de
  `creators_scoped_read` (précédent : `mkt_model_sources()`, 0172).

## Risques et écarts assumés

- 5 comptes sur 42 n'ont aucun lien à leur nom : rattachement à la main (PR 2).
- Au-delà de 200 comptes, le plafond du run coupe : à relever si l'agence grandit.
- `mkt_model_x_accounts()` recopie `creators_scoped_read` : si cette policy change, elle doit suivre.
