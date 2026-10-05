# Photos des modèles + type et modèle des événements Agence — design (2026-10-02)

## Demande

Benoit, 2026-10-02 : « quand tu scrapes les modèles, il faudrait scraper leur image en même temps
et qu'on la stocke : dans Agence, quand ils prennent un événement sur une modèle, ça met l'image
de la modèle à la place de devoir en importer une autre. On garde toujours l'import, mais par
défaut ça met la photo de la modèle. » Les événements s'écrivent aujourd'hui « CAROUSEL ALICE »,
« POP UP CARLA » : « mettre un type et une sélection de modèle ».

Précisions de Benoit :
- **type** = un champ en texte libre, pas une liste ;
- **la photo** est récupérée **une seule fois** au préalable, pas à chaque nuit ;
- **affichage** : en **petit avatar rond** (la photo source est trop petite pour une grande carte).

## Ce qui existe (mesuré le 2026-10-02)

**MyPuls**
- `GET https://mypuls.app/creator/<mypuls_creator_id>/avatar`, avec la session : HTTP 200, en-tête
  `image/jpeg` mais contenu **WebP 100 × 100**, environ 3 Ko. L'URL figure dans les pages capturées
  (`creators.html`, `dashboard.html`). Sans session valide : redirection 302 vers `/login`.
- La session à jour vit dans `ingest_session` (0109), lue sans rotation par `loadCookie()`
  (`apps/ingestion/src/session.ts`).
- Les **20** modèles de `creators` ont toutes un `mypuls_creator_id`.

**Agence** (`/chatter/agence`, `agency_*`, 0175/0176)
- 12 événements, tous nommés « TYPE MODÈLE » (« CAROUSEL ALICE », « HERO SLIDER MATHILDE »).
- Aucune image importée ; la légende des couleurs (`agency_legend`) est vide.
- Images : bucket Storage **privé** `agency-events`, envoi par URL signée après garde admin,
  lecture par URLs signées générées côté serveur pour les seuls événements visibles (0176).
- **Une autre session modifie Agence en ce moment** (cartes avec photo, fenêtre d'édition, liste,
  calendrier — non commité).

## Découpage

- **A. Photos des modèles** — indépendante d'Agence, faite tout de suite.
- **B. Type et modèle des événements** — faite **après le commit de l'autre session sur Agence**,
  par-dessus son travail.

## A — Photos des modèles

### Données — migration

- `creators.avatar_path text` : clé de l'objet dans le bucket ; `null` = pas de photo.
- Bucket Storage **privé** `creator-avatars` : 1 Mo maximum, WebP / JPEG / PNG seulement, aucune
  policy sur `storage.objects` (écriture en service-role, lecture par URLs signées) — même patron
  que `agency-events` (0176).

### Règle pure — `@glagency/core` (testée)

- `sniffImageType(bytes)` → `'image/webp' | 'image/jpeg' | 'image/png' | null`, d'après les
  premiers octets (RIFF…WEBP, FF D8 FF, 89 50 4E 47). On ne se fie pas à l'en-tête HTTP : MyPuls
  annonce `image/jpeg` pour du WebP.

### Le script — `pnpm --filter @glagency/ingestion avatars [--force]`

- Session : `loadCookie()` (lecture seule de `ingest_session`, **sans** renouvellement).
- Pour chaque modèle avec un `mypuls_creator_id` et **sans** `avatar_path` (toutes avec `--force`) :
  1. `GET /creator/<id>/avatar`, `redirect: 'manual'` : une redirection vers `/login` signale
     une session expirée → arrêt du script avec un message clair, plus rien n'est écrit ;
  2. type détecté par `sniffImageType` ; pas une image → la modèle est signalée et sautée ;
  3. envoi dans `creator-avatars/<creator_id>.<ext>` (`upsert`), puis `creators.avatar_path`.
- Résumé : photos récupérées, déjà présentes, échecs (avec le nom de la modèle).
- **Pas dans le cron** (récupération unique) : on le relance quand une nouvelle modèle arrive.

## B — Type et modèle des événements Agence

### Données — migration

- `agency_events.kind text` (type libre, 1 à 40 caractères) et `agency_events.creator_id uuid`
  (→ `creators`, `on delete set null`). Les deux sont facultatifs.
- **Reprise des 12 événements existants** : quand le dernier mot du titre est le nom exact d'une
  modèle (sans tenir compte de la casse), `creator_id` = cette modèle et `kind` = le reste du titre
  (« CAROUSEL ALICE » → type « CAROUSEL », modèle Alice). Sinon, rien ne change.

### Règle pure (testée)

- `composeEventTitle(kind, modelName)` → « CAROUSEL ALICE » (en majuscules, espaces normalisés).

### Écran

- Fenêtre d'événement : champ **Type** (texte libre) et sélecteur **Modèle** (modèles actives,
  « Aucune » par défaut).
- Quand type et modèle sont remplis et que le nom n'a pas été modifié à la main, le nom se
  compose tout seul. Il reste modifiable et obligatoire. Un événement sans modèle garde un nom
  libre (une réunion, par exemple).
- **Avatar rond** de la modèle à côté du nom, dans la liste, le calendrier et la fiche de
  l'événement. Une image importée garde sa grande place ; l'avatar ne la remplace pas.
- Les URLs signées des avatars ne sont générées que pour les modèles des événements que la RLS
  rend à l'appelant (même règle que les images d'événement).
- Droits inchangés : écriture admin, lecture pour tous.

## Ordre et migrations

- A prend **`0180`** (décision Benoit 2026-10-02 : les photos passent avant le chantier « identité
  chatteur MyPuls », qui prendra le numéro libre suivant) ; B prend `0181` ; la suppression de la
  to-do personnelle prend `0182`, en dernier (elle attend la mise en prod de son code).
- Les deux fichiers attendent dans `packages/db/supabase/pending/`, que `supabase db push` ne lit
  pas : le dossier `migrations/` est partagé, et un `db push` y applique tout ce qui est en attente.
  On les déplace dans `migrations/` au moment de les appliquer.
- Le script de A tourne après sa migration (UAT, puis prod avec accord explicite).
- B attend le commit de l'autre session sur Agence.

## Hors périmètre

- Une photo en meilleure résolution (une autre source que MyPuls).
- La mise à jour automatique des photos (cron).
- Les avatars ailleurs dans le CRM (les badges de modèle par exemple) : possible plus tard, la
  colonne et le bucket le permettent.
- Une liste fermée de types, ou des suggestions de types.
