# Design — Classement par métrique sur Insights

> Date : 2026-07-07 · Statut : **design validé** (Benoit) · Feature : `apps/web/src/features/insights`

## 1. Objectif

Ajouter sur la page Insights un **classement global des chatteurs par métrique** (présence,
réactivité, média proposé, taux de conversion, CA), pour que les managers puissent voir et
partager des classements aux équipes. Vue à l'écran (pas d'export dans ce lot).

## 2. Décisions actées (brainstorming)

- **Livrable** : vue **à l'écran** (pas d'export image/texte pour l'instant).
- **Affichage** : **tableau de classement dédié** (`rang · chatteur · valeur`) — distinct des
  cartes d'insight, pas un tri des cartes.
- **Déclencheur** : un sélecteur **« Classement par »** ajouté aux filtres Insights. « — aucun »
  (défaut) → cartes normales ; une métrique → le tableau remplace les cartes.
- **Période** : **la semaine des insights** (la semaine évaluée affichée par la page).
- **Population** : **tous les chatteurs (global)**, agence-wide.
- **Accès** : **tous ceux qui ont la page `insights`** (données globales résolues via **client
  admin**, hors RLS — choix assumé, expose les métriques agence à un sous-manager).

## 3. Métriques & tri

| Métrique | Source (`chatter_daily`, semaine) | Agrégation | Tri (meilleur) | Format |
|---|---|---|---|---|
| CA | `ca` | Σ | décroissant | `12 480 €` |
| Présence | `presence_active_h` | Σ | décroissant | `38 h` |
| Média proposé | `propose` | Σ | décroissant | `1 240` |
| Taux de conversion | `vendu`, `propose` | Σvendu / Σpropose × 100 | décroissant | `18 %` |
| Réactivité | `reactivite_sec` | moyenne (jours non-null) | **croissant** (bas = mieux) | `42 s` |

- Réactivité : plus bas = meilleur → tri **croissant**, chatteurs sans donnée en bas.
- Conversion : recalcul global Σ/Σ (jamais la moyenne des %), cohérent avec Chatters/Stats.
- Chatteurs sans activité la semaine (Σ = 0 / null) : affichés en fin de classement (ou exclus si
  aucune donnée du tout — cf. §4).

## 4. Données (serveur)

- **Pas de nouvelle table / migration.** Lecture de `chatter_daily` sur la semaine des insights
  (`date` entre `weekStart` et `weekStart + 6 j`), groupée par `chatter_id`.
- Résolution via **client admin** (`createAdminClient`, comme `get-repos`/`get-police`) pour un
  classement **global** indépendant du périmètre RLS du viewer.
- Ajouté au fetch de la page (`get-insights` renvoie un champ `ranking` en plus), OU service
  compagnon `services/get-ranking.ts` appelé par `page.tsx`. **Choix : service compagnon**
  `get-ranking.ts` (isolation — `get-insights` est déjà volumineux).
- Forme retournée :
  ```ts
  interface RankingRow {
    chatterId: string
    chatterName: string
    ca: number
    presenceH: number
    propose: number
    convPct: number | null   // null si propose = 0
    reactSec: number | null  // null si aucune journée mesurée
  }
  interface RankingData { weekStart: string; rows: RankingRow[] }
  ```
- Ne garder que les chatteurs ayant **au moins une donnée** la semaine (Σ activité > 0 ou
  réactivité mesurée) — un classement de 200 lignes vides n'a pas de sens.

## 5. Client

- **`page.tsx`** : `requireAccess('insights')` → `getInsights(week)` **+** `getRanking(weekStart)` →
  passe `ranking` à `InsightsTemplate`.
- **`InsightsTemplate`** : nouvel état `rankBy: '' | 'ca' | 'presence' | 'propose' | 'conv' | 'react'`.
  - Sélecteur **« Classement par »** (shadcn `Select`, 6 items dont « — aucun ») à côté des filtres
    existants (statut / modèle / sévérité).
  - `rankBy === ''` → rendu actuel (cartes filtrées). `rankBy !== ''` → `<RankingTable>`.
- **`components/ranking-table.tsx`** (nouveau) : trie `ranking.rows` selon `rankBy` (sens correct),
  filtre les valeurs non pertinentes (ex. réactivité null en bas), rend `rang · chatteur · valeur`
  formatée. En-tête indiquant la métrique + la semaine. Médaille 🥇🥈🥉 sur le top 3 (cohérent avec
  le style existant de `chatters-table` `medal()`), sinon numéro.

## 6. Hors périmètre
- Export image/texte du classement (partage se fait par capture d'écran pour l'instant).
- Sélecteur de période dédié (on suit la semaine des insights).
- Classement filtré par modèle/équipe (global uniquement).
- Nouvelles métriques hors des 5 citées.

## 7. Fichiers touchés
- `apps/web/src/features/insights/services/get-ranking.ts` (nouveau)
- `apps/web/src/features/insights/types.ts` (types `RankingRow` / `RankingData`)
- `apps/web/src/features/insights/components/ranking-table.tsx` (nouveau)
- `apps/web/src/features/insights/InsightsTemplate.tsx` (sélecteur + bascule)
- `apps/web/src/app/(dash)/chatter/insights/page.tsx` (fetch ranking)
