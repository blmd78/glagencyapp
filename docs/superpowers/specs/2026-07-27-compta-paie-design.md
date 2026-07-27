# Compta — paie des chatteurs (design)

Spec du 2026-07-27. Périmètre : `/chatter/compta`. La paie du staff marketing
(`/marketing/compta`, slug `mkt-compta`) reste un placeholder et sort du périmètre.

---

## 1. État des lieux

**En base (prod et UAT, structurellement identiques).** Six tables `compta_*` et la fonction
`chatter_first_seen()` existent depuis un chantier abandonné. Elles ont été créées à la main,
hors migration ; la migration `0084_compta_rattrapage.sql` (2026-07-27) les a inscrites dans
l'historique sans rien modifier. Contenu réel : **5 lignes, toutes vides ou par défaut** — de la
donnée de test, rien à conserver.

**Dans l'app.** Tout est placeholder : `ComptaTemplate` affiche « TODO », `get-compta.ts`
retourne `null` et n'est importé nulle part.

**Sur la branche `wip/compta-spenders-relances`** (211 commits derrière `develop`) : une
implémentation complète et abandonnée — `get-compta.ts` (362 l.), `pay-table.tsx` (435 l.),
`actions.ts` (250 l.), `pay-dialog.tsx`, et 4 migrations compta. C'est de là que viennent les
tables de prod.

**Statut de cette branche pour nous : RÉFÉRENCE MÉTIER, pas base de code.**
- Ses migrations portent les numéros `0015`, `0016`, `0019`, `0020`, **déjà pris sur `develop`**
  depuis le nettoyage `36ae438`. Non réutilisables.
- Ses composants précèdent la refonte « standard feature », le modèle de rôles (0059/0060) et la
  RLS actuelle. Les reprendre coûterait plus que les réécrire.
- Ce qu'on lui emprunte : la formule, la mécanique de `covered_days`, la ventilation du CA par
  modèle, et la connaissance des pièges (troncature `fetchAll` sur `creator_daily`, corrigée
  dans son dernier commit).

---

## 2. Décisions

Arbitrées avec le propriétaire le 2026-07-27. Les trois premières **écrasent** la branche.

| Sujet | Décision | vs branche |
|---|---|---|
| Période de paie | Quinzaines **1–15** et **16–fin de mois** | la branche affichait le mois |
| Prime nouveau chatteur | **Manuelle** (l'admin décide) | la branche la déclenchait à J+30 |
| Handoffs | **Payés 0,60 € l'unité** | ✅ identique |
| Population payée | Les **membres de l'app** (`profiles`, rôle chatteur) | la branche partait de `chatters` (MyPuls) |
| Base du % | CA du chatteur **par modèle**, sommé sur la période | ✅ compatible |
| Fixe setter | **En plus** du pourcentage | ✅ identique |
| Semaine à cheval | Rattachée à la quinzaine de son **lundi** | ✅ identique |
| Sanctions police | **Cumulées** avec le malus manuel | absent (la Police n'existait pas) |
| Immuabilité | **Instantané figé au paiement** | la branche recalculait tout à la volée |
| Accès chatteur | **Aucun** | — |

**Conséquence du choix des quinzaines** : une quinzaine regroupe des semaines **entières**
(par leur lundi), donc le prorata `× jours couverts / 7` de la branche disparaît. Il n'existait
que parce que le mois coupait les semaines à ses bornes.

**Effet de bord** : `chatter_first_seen()` n'a plus d'usage en compta (elle servait la prime
automatique). On la conserve — `0056` la durcit et `get-chatters.ts` la mentionne.

---

## 3. Modèle de période

Une **quinzaine** est identifiée par `(mois, rang)` où rang ∈ {1, 2}.

- Rang 1 : du 1er au 15 inclus.
- Rang 2 : du 16 au dernier jour du mois.
- Toujours 2 par mois, sans trou ni recouvrement. 24 par an.

Les montants **hebdomadaires** (`compta_week_entries` : bonus, malus, handoffs, fixe_setter)
sont rattachés à la quinzaine où tombe le **lundi** de leur semaine. Une semaine n'est jamais
découpée. Conséquence assumée : une quinzaine peut recevoir une semaine dont la majorité des
jours tombe dans l'autre, et le nombre de semaines par quinzaine varie (2 ou 3 selon le mois).

Les montants **journaliers** (`compta_day_entries`) sont rattachés par leur date.

Une quinzaine n'a **pas** de statut « payée » stocké. Elle est payée quand chacun de ses jours
figure dans le `covered_days` d'un paiement. C'est ce qui absorbe le retard, les règlements
groupés et les paiements partiels sans logique supplémentaire.

---

## 4. Formule

Pour un chatteur et une quinzaine :

```
  Base            mode percent : Σ sur les modèles ( Σ chatter_creator_daily.ca
                                 des jours de la quinzaine ) × rate / 100
                  mode fixed   : fixed_amount × (nombre de semaines rattachées)
                                 -- fixed_amount est un montant HEBDOMADAIRE

+ Fixe setter     si is_setter : Σ compta_week_entries.fixe_setter
                  des semaines rattachées à la quinzaine

+ Bonus           Σ compta_day_entries.bonus (jours de la quinzaine)
                + Σ compta_week_entries.bonus (semaines rattachées)

− Malus           les deux mêmes sources

+ Handoffs        ( Σ handoffs jour + Σ handoffs semaine ) × 0,60 €

+ Prime           compta_primes.amount si status = 'due', et UNIQUEMENT sur la
                  quinzaine échue la plus ancienne non couverte de ce chatteur
                  -- sans cette restriction, deux quinzaines impayées afficheraient
                  chacune la prime, laissant croire qu'elle est due deux fois

− Sanctions       Σ police_entries.amount_eur où kind = 'malus'
                  et occurred_on dans la quinzaine

= Net à payer
```

**Hypothèse à confirmer — `fixed_amount` est HEBDOMADAIRE.** Ce n'est pas une décision du
propriétaire : c'est déduit de la branche WIP, qui calculait `fixedAmount × jours / 7`. Aucun
chatteur n'est en mode `fixed` en prod aujourd'hui (l'unique ligne de réglages était en
`percent`), donc rien ne permet de le vérifier sur la donnée. Si le fixe est en réalité mensuel
ou par quinzaine, seule cette ligne de la formule change.

`HANDOFF_EUR = 0.60` est une constante documentée de `packages/core`, pas un nombre en dur dans
un composant. Les entrées `kind = 'warning'` de la Police valent 0 € : elles sont listées avec
leur motif mais n'entrent pas dans le calcul.

**Arrondi — chaque composante d'abord, le net ensuite** (arbitré le 2026-07-27). Chaque ligne de
la fiche est arrondie à 2 décimales, puis le net est la SOMME de ces lignes arrondies. Une fiche
de paie doit s'additionner exactement à l'écran : un chatteur doit pouvoir refaire le calcul de
tête. L'écart au résultat mathématiquement exact est borné à ~3-4 centimes par fiche et n'est pas
cumulatif.

> Cette section disait auparavant « arrondi une seule fois en fin de chaîne ». C'était une erreur,
> et elle contredisait le test d'invariant de la §11 — écrit dans la même spec — qui échoue avec
> cette approche (écart de 0,01 € sur `3333,33 × 12,5 %`). La contradiction a été découverte à
> l'implémentation de la tâche 2.

---

## 5. Modèle de données — migration `0085`

Une seule migration, les tables étant vides.

**5.1 Re-cléage sur `profiles`.** Suppression des 5 lignes de test, puis bascule des clés
étrangères de `chatters(id)` vers `profiles(id)` sur `compta_settings`, `compta_primes`,
`compta_day_entries`, `compta_week_entries`, `compta_payments`. La colonne garde son nom
`chatter_id` : c'est déjà la convention de `police_entries`, qui désigne un membre.

`compta_debts` n'a aucune clé étrangère et reste inchangée (voir §9).

**5.2 `compta_primes.amount` : `text` → `numeric(10,2)`.** Le défaut `'100 €'` devient `100`.
Calculer de l'argent en parsant une chaîne est une erreur silencieuse qui attend son jour.

**5.3 Instantané de paiement.** Colonnes ajoutées à `compta_payments` :

| Colonne | Type | Rôle |
|---|---|---|
| `period` | `smallint check (period in (1,2))` | rang de la quinzaine |
| `ca_reference` | `numeric(10,2)` | CA ayant servi de base |
| `mode_applied` | `text check (mode_applied in ('percent','fixed'))` | mode au moment du paiement |
| `rate_applied` | `numeric(5,2)` | taux au moment du paiement |
| `base_amount` | `numeric(10,2)` | base calculée |
| `setter_amount` | `numeric(10,2)` | fixe setter |
| `bonus_amount` | `numeric(10,2)` | bonus cumulés |
| `malus_amount` | `numeric(10,2)` | malus manuels |
| `handoffs_amount` | `numeric(10,2)` | handoffs × 0,60 |
| `prime_amount` | `numeric(10,2)` | prime éventuelle |
| `sanctions_amount` | `numeric(10,2)` | sanctions police |

`month` conserve son sens (1er jour du mois) et `amount` reste le **net versé**. Invariant :
`amount = base + setter + bonus − malus + handoffs + prime − sanctions`. Des colonnes explicites
plutôt qu'un `jsonb` — pour répondre à « combien de sanctions retenues ce trimestre ? » d'une
requête plutôt que d'un parcours applicatif.

**Pourquoi figer.** Le CA vient de `chatter_creator_daily`, ré-ingéré depuis MyPuls. Un calcul
à la volée verrait un montant déjà versé changer rétroactivement après correction d'un jour
passé. L'instantané rend l'historique opposable.

---

## 6. Droits et cloisonnement

| Table | Admin | Manager / sous-manager | Chatteur |
|---|---|---|---|
| `compta_day_entries`, `compta_week_entries` | tout | lecture + écriture **sur ses rattachés** | — |
| `compta_settings` | tout | lecture sur ses rattachés | — |
| `compta_primes` | tout | lecture sur ses rattachés | — |
| `compta_payments` | tout, **seul à écrire** | lecture sur ses rattachés | — |
| `compta_debts` | tout | — | — |

Le chatteur n'a jamais la page. Manager **et** sous-manager ont le même accès : `is_manager()`
couvre les deux, aucune policy distincte.

Les policies actuelles (`has_page('compta')` sans cloisonnement) donnent la lecture de **toute**
la compta à quiconque a la page. Elles sont remplacées par
`is_admin() or (is_manager() and manages(chatter_id))`.

La triade du repo s'applique (`guidelines-standard-feature.md` §4) : **RLS** = verrou réel ;
**serveur** `managerPageGuard('compta')` sur les écritures de saisie, `adminGuard` sur le
paiement ; **UI** un `canPay` threadé `page → Template → composants` pour masquer le bouton de
virement aux managers.

---

## 7. Écrans

Route unique : `/chatter/compta`.

**Structure.** Une ligne par chatteur, dépliable — la grammaire installée le 2026-07-26 sur le
Planning et le Dashboard. `MembersAccordion` et `CollapsibleSection` sont réutilisés tels quels.

```
Compta                                    [ Quinzaine ▾ 01/07 → 15/07 ]

┌ KPI ──────────────────────────────────────────────────────────┐
│  À payer        Chatteurs      Sanctions       Déjà payé      │
│  12 450 €       38 à payer     −340 €          3 200 €        │
└───────────────────────────────────────────────────────────────┘

⚠ 2 quinzaines antérieures incomplètement couvertes → 16/06–30/06, 01/06–15/06

▸ Axel          Chatter          775 €      à payer
▸ Dorian        Chatter          612 €      payé le 18/07
▸ Lina          Chatter            — €      ⚠ non reliée à MyPuls
```

Le repère de droite répond sans déplier : combien, et payé ou non.

**Panneau déplié = la fiche de paie.** Le détail de la formule ligne à ligne, les motifs de
sanction en clair (`05/07 — Réponse > 45 s : 15 €`), la ventilation du CA par modèle, et le
compte de handoffs. Sous la fiche : la saisie des bonus/malus/handoffs, et pour un admin le
bouton **Marquer payé** qui fige l'instantané et enregistre `covered_days`.

**Chatteur non relié à MyPuls.** `profiles.chatter_id` est nullable : 30 profils chatteurs sur
102 ne sont pas reliés en prod. Sans lien, aucun CA n'est calculable. La ligne affiche un
avertissement explicite et un renvoi vers Membres — **jamais un 0 € silencieux**, qui ferait
passer un chatteur pour non rémunérable.

**Retard.** Le bandeau des quinzaines incomplètes se déduit de `covered_days` : toute quinzaine
échue dont un jour n'est couvert par aucun paiement remonte, quelle que soit la date.

---

## 8. Découpage technique

```
packages/core/src/compta/
  periods.ts        quinzaines, rattachement des semaines par leur lundi   [testé]
  payslip.ts        la formule, sur des entrées pures                      [testé]

apps/web/src/features/compta/
  ComptaTemplate.tsx        RSC, aucun fetch
  types.ts                  contrat de domaine local
  schema.ts                 zod partagé RHF ↔ actions
  actions.ts                saisies (managerPageGuard) + paiement (adminGuard)
  services/get-compta.ts    lecture, une quinzaine
  components/
    compta-view.tsx         feuille client (état, sélecteur de quinzaine)
    compta-payslip.tsx      la fiche dépliée
    compta-entry-form.tsx   saisie bonus/malus/handoffs
    compta-pay-dialog.tsx   confirmation de paiement (admin)
    compta-skeleton.tsx     silhouette
```

Le calcul vit dans `packages/core` — pur, sans dépendance, donc **testable sous Vitest**. C'est
le seul endroit du projet où de l'argent est calculé : c'est là que les tests ont le plus de
valeur, et `apps/web` n'a aucun harnais de test.

Lectures : `fetchAll` obligatoire sur `chatter_creator_daily` et `creator_daily` — le dernier
commit de la branche WIP corrigeait précisément une troncature à 1000 lignes qui faussait les
totaux au-delà d'un mois. Toute erreur Supabase est destructurée et thrown.

---

## 9. Hors périmètre

- **`/marketing/compta`** (paie du staff) : reste un placeholder.
- **`compta_debts`** : carnet de dettes sans lien avec `chatters` ni `profiles`, `name` et
  `model` en texte libre. Hypothèse retenue — c'est un registre indépendant de la paie, pas une
  retenue sur salaire. Non traité par cette spec, table laissée en l'état.
- **Taux par modèle** : la base est calculée modèle par modèle pour le permettre plus tard, mais
  `compta_settings` n'a qu'un `rate` unique. Pas de taux différencié dans cette version.
- **Export comptable** (PDF, CSV) : non demandé.

---

## 10. Risques et cas limites

| Cas | Traitement |
|---|---|
| Chatteur sans `profiles.chatter_id` | avertissement explicite, pas de calcul, renvoi vers Membres |
| Quinzaine sans aucune donnée CA | net = 0, la ligne reste affichée (les bonus/primes restent dus) |
| Paiement partiel d'une quinzaine | `covered_days` ne couvre qu'une partie → la quinzaine reste « incomplète » |
| Ré-ingestion du CA après paiement | l'instantané ne bouge pas ; l'écart est visible en comparant `ca_reference` au CA courant |
| Prime déjà `paid` | ignorée dans les quinzaines suivantes |
| Sanction saisie après le paiement | non rattrapée automatiquement — elle apparaîtra sur la quinzaine de son `occurred_on`, qui sera signalée comme incomplète si non couverte |
| Deux profils pour un même chatteur MyPuls | impossible en prod (vérifié : maximum 1), pas de garde applicative |

---

## 11. Tests

Dans `packages/core`, sous Vitest :

**`periods.ts`** — un mois de 31 jours, un de 28, une quinzaine à 3 lundis, une semaine à cheval
sur le 15/16, une semaine à cheval sur deux mois.

**`payslip.ts`** — mode percent, mode fixed sur 2 et 3 semaines, setter avec et sans fixe,
handoffs à 0,60, prime due puis payée, sanctions `malus` et `warning` mélangées, cumul
malus manuel + sanction police, quinzaine entièrement vide, et l'invariant
`net = base + setter + bonus − malus + handoffs + prime − sanctions`.

Pas de test côté `apps/web` : le harnais n'existe pas et le monter dépasse ce périmètre.
