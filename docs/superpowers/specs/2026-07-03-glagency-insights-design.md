# Design — Insights hebdo « Quotas » (une carte par chatteur, splittée par modèle)

> Date : 2026-07-03 · Statut : **design validé** (Benoit) · Remplace les « Analyses » du CRM Python

## 1. Objectif

Reprendre les analyses de l'ancien CRM (cartes « X — S-1 : 3/5 quotas manqués » avec chips
quotas, plan d'action management et statuts de traitement), en corrigeant son défaut :
un chatteur qui **change de modèle en cours de semaine** générait de fausses alertes.
Nouveau principe : **une carte par chatteur**, évaluée sur **S-1 (lundi→dimanche) avec
suivi de la semaine en cours**, et **splittée par modèle au prorata exact** de la
production (`chatter_creator_daily`) quand il a travaillé plusieurs modèles.

## 2. La carte — UNE par chatteur, splittée par modèle

**Une seule carte par chatteur**, deux fenêtres temporelles visibles : **S-1** (base de
l'évaluation des quotas) et **semaine en cours** (suivi/projection, rafraîchie chaque nuit).

- **En-tête** : « {Chatteur} — S-1 : {n}/5 quotas manqués », sévérité = quotas manqués
  sur S-1 (0 → pas de carte ; 1–2 → `warning` ; ≥ 3 → `critical`, comme l'ancien).
- **5 chips quotas** (S-1, réel vs cible, vert/rouge) : présence h/j, réactivité s, médias
  proposés /j, taux conv %, CA/j. Les 4 premiers = grain chatteur GLOBAL (MyPuls ne les
  ventile pas par modèle) ; le **CA = attendu prorata** : Σ (jours actifs sur chaque
  modèle × cible CA/j de ce modèle) vs CA réel total.
- **Split par modèle** (sections dans la carte, seulement si ≥ 2 modèles ; sinon la ligne
  unique fait office) : pour chaque modèle travaillé → S-1 : jours actifs, CA réel vs
  attendu (cible du modèle × jours), % d'atteinte coloré · Semaine en cours : idem à date.
  C'est CE split qui rend un changement de modèle lisible au lieu d'une fausse chute.
- **Résumé S-1** : CA total, moy/j, jours actifs, niveau (Gobelin < 1 000 €/mois-éq ·
  Recrue ≥ 1 000 · Stratège ≥ 1 900 · Commandant > 4 000 ; mois-éq = CA moy/j × 30),
  présence/idle.
- **Ligne semaine en cours** (globale) : CA à date, moy/j, (j{x}/7), tendance vs S-1
  projetée — « En difficulté » / « Dans la cible ».
- **Plan d'action management** (repliable) : sections [CA] [PRÉSENCE] [SEMAINE EN COURS]
  reprises de l'ancien (RDV début de semaine, objectif chiffré, vérif idle MyPuls,
  escalade convocation + rapport si 2ᵉ semaine consécutive).
- **Visibilité** : la carte agrège des données tous-modèles (chips globales) → **v1
  réservée aux admins** (RLS insights : admin only). Un rôle `user` avec la page insights
  voit un état vide « aucune analyse sur ton périmètre » ; la déclinaison par-modèle pour
  les rôles `user` est notée en v2.

Vocabulaire UX : « quotas manqués », « en difficulté », « au-dessus de la cible » —
pas de jargon (« régression » banni).

## 3. Données & génération

- **Semaine** : lundi→dimanche. S-1 = dernière semaine complète AYANT des données ;
  s'il n'y en a aucune (amorçage : données depuis le 30/06), le moteur évalue la
  **semaine courante partielle**, cartes étiquetées « {n} j de données » et cibles
  proratisées au nombre de jours écoulés. Cible = quotas de l'équipe du modèle
  (`quotas` par team, jointure creators.team_id).
- **Moteur** : `packages/core/src/insights/` (règles pures, testées Vitest). Entrée =
  agrégats déjà préparés (lignes chatter_daily / chatter_creator_daily S-1 + semaine en
  cours + quotas + noms) ; sortie = `InsightDraft[]` (key, severity, chatter_id, title,
  body, action_plan, kpis[], models[]).
- **Déclenchement** : le run nocturne du Worker (après le pipeline) régénère les cartes de
  la S-1 courante — la ligne « semaine en cours » se rafraîchit chaque nuit, les clés
  restent stables donc les statuts survivent.
- **Clé stable** : `quotas_<weekStart>_<chatterId>`.

## 4. Tables (migration `0011_insights.sql` — version v1 du schéma spécifié le 01/07)

```sql
insights (
  insight_key text, generated_at timestamptz default now(),
  week_start date,
  severity text check (severity in ('critical','warning')),
  chatter_id uuid → chatters on delete cascade,
  title text, body text, action_plan text,
  kpis jsonb default '[]',            -- chips globales [{label, value, target, ok}]
  models jsonb default '[]',          -- split par modèle [{name, days, ca, expected, pct, week…}]
  pk (insight_key, generated_at)
)
insight_states (
  insight_key text pk,
  status text default 'new' check (status in ('new','in_progress','resolved','ignored')),
  note text, updated_at timestamptz, updated_by uuid → profiles
)
```
- La page lit la **dernière génération** par clé (max generated_at), jointe à son état.
- **RLS insights** : select **admin uniquement** (v1 — la carte agrège du tous-modèles).
  **insight_states** : select/update admin uniquement (même raison).
- Écriture des tables : service-role (worker) pour insights ; Server Action (client session,
  RLS) pour insight_states.

## 5. Page Insights (`/chatter/insights`, slug déjà assignable)

- En-tête : « Semaine du {S-1} », compteurs par sévérité, filtres statut / sévérité / modèle.
- Cartes triées critique → warning, style de l'ancien (bandeau sévérité + catégorie +
  badge statut, chips quotas colorées, « semaine en cours », plan d'action repliable).
- Boutons **Nouveau / En cours / Résolu / Ignorer** + note (Server Action `setInsightState`).
- Badge compteur dans la sidebar : nb de cartes `new` + `in_progress` visibles (RLS fait le
  scope par rôle).
- Datepicker global : la page l'ignore (les cartes sont ancrées sur S-1) — assumé, comme
  la page Quotas.

## 6. Hors v1

Bouton « Transférer », règles Pareto/modèle/« chatteur disparu » (le moteur à règles les
accueillera en ajoutant un fichier), notifications (Telegram/email), édition des seuils de
sévérité depuis l'UI.

## 7. Vérification

1. Tests Vitest du moteur (packages/core) : cas prorata 2 modèles, quota atteint (pas de
   carte), 3/5 manqués → critical, clés stables.
2. Backfill manuel S-1 (22–28/06 impossible : données dès le 30/06 → S-1 = 30/06–06/07
   partielle jusqu'au dimanche ; premier vrai cycle complet lundi 07/07) — la carte
   « semaine incomplète » est étiquetée « {n} j de données ».
3. UI : statut modifié → survit à une régénération manuelle (`?day=` trigger).
4. Rôle user : page insights = état vide propre (aucune fuite de données tous-modèles).
