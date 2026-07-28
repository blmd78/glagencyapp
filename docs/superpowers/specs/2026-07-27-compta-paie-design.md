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
| Période de paie | Blocs de **14 jours calés sur les lundis** | la branche affichait le mois |
| Prime nouveau chatteur | **Manuelle** (l'admin décide) | la branche la déclenchait à J+30 |
| Handoffs | **Payés 0,60 € l'unité** | ✅ identique |
| Population payée | Les **membres de l'app** (`profiles`, rôle chatteur) | la branche partait de `chatters` (MyPuls) |
| Base du % | CA du chatteur **par modèle**, sommé sur la période | ✅ compatible |
| Fixe setter | **En plus** du pourcentage, jamais à sa place | ✅ identique |
| Mode de rémunération | **Il n'y en a qu'un** : commission + fixe éventuel | la branche offrait `percent` OU `fixed` |
| Statut de setter | **Ne commande rien en compta** — il vit dans Membres | la branche le dupliquait dans `compta_settings` |
| Semaine à cheval | Rattachée à la période de son **lundi** | ✅ identique |
| Sanctions police | **Cumulées** avec le malus manuel | absent (la Police n'existait pas) |
| Immuabilité | **Instantané figé au paiement** | la branche recalculait tout à la volée |
| Accès chatteur | **Aucun** | — |

> **Correction du 2026-07-27, après lecture de la feuille de juillet du propriétaire.** Cette
> ligne disait « quinzaines 1–15 et 16–fin de mois ». C'était une erreur d'interprétation de sa
> consigne orale (« il paye toutes les 2 semaines… 2 paiements par mois »). Sa feuille prouve
> que ce sont des **14 jours calés sur les lundis** : voir §3. La cadence réelle est de
> **26 périodes par an**, pas 24.

**Conséquence du choix d'un découpage par semaines entières** : une période regroupe des
semaines **entières** (par leur lundi), donc le prorata `× jours couverts / 7` de la branche
disparaît. Il n'existait que parce que le mois coupait les semaines à ses bornes.

**Effet de bord** : `chatter_first_seen()` n'a plus d'usage en compta (elle servait la prime
automatique). On la conserve — `0056` la durcit et `get-chatters.ts` la mentionne.

> **Correction du 2026-07-27 (tâche 16), après relecture de la feuille — deux lignes de la
> branche tombent.** Les mesures : les 95 chatteurs de la semaine S1 ont TOUS un net `CA × taux`
> (86 à 10 %, 5 à 11 %, 4 à 10,5 %) — personne n'est « au fixe au lieu du pourcentage » ; et
> 59 d'entre eux touchent EN PLUS un fixe (37,50 / 40 / 75 €), rempli une seule fois par période
> de paie. Carl = 4,379 € de commission + 75 € de fixe + 19,20 € de handoffs = 98,579 €.
>
> Donc : `compta_settings.mode` et `compta_settings.is_setter` sont **supprimés** (migration
> `0089`), avec l'instantané `compta_payments.mode_applied` devenu sans objet. Le fixe s'applique
> **dès qu'il est renseigné** (`fixed_amount > 0`), sans drapeau.
>
> **`profiles.closing_role` ne commande PAS le versement**, contrairement à ce qu'un plan
> intermédiaire proposait : la colonne vaut `'setter'` pour **1 seul** profil en prod (13
> `closer`, 91 non renseignés) alors que la feuille verse un fixe à 59 personnes — le fixe
> aurait été inopérant pour presque tout le monde, en silence. Le statut de setter reste dans
> Membres, pour le classement des setters.

---

## 3. Modèle de période

Une **période de paie** est un bloc de **14 jours, du lundi au dimanche**, identifié par son
**lundi de départ** — et par rien d'autre.

- `end = start + 13`.
- Alignement : `start` est un lundi `M` tel que `(M − 2026-07-06) mod 14 = 0`.
- Sans trou ni recouvrement. **26 par an.**

**L'ancre, et la preuve.** La feuille Google Sheets de juillet 2026 du propriétaire (onglet
`gid=872644203`) découpe le mois en blocs S1 = lundi 06/07 → dimanche 12/07 et S2 = lundi 13/07
→ dimanche 19/07 ; le bloc S2 porte « Net à payer 1 » (le net de S1), « Net à payer 2 » (celui
de S2) et « -NET TOTAL- » = leur somme — **le paiement couvre donc 06/07 → 19/07**. L'onglet
« juillet » court en réalité du 06/07 au 02/08 : il **ne suit pas le mois**. Les blocs voisins
relevés (20/07 et 22/06) sont à 14 jours d'intervalle, ce qui fixe l'alignement.

**Une période ne se rattache à aucun mois** : celle du 20/07/2026 finit le 02/08, celle du
21/12/2026 finit le 03/01/2027. C'est pourquoi le couple `(month, period 1|2)` a disparu de
`compta_payments` (§5, migration `0088`) — trois périodes peuvent démarrer dans le même mois, et
`period in (1,2)` serait faux.

Les montants **hebdomadaires** (`compta_week_entries` : bonus, malus, handoffs — plus
`fixe_setter`, colonne conservée mais hors calcul depuis la tâche 19, cf. §4) sont rattachés à
la période où tombe le **lundi** de leur semaine. Une semaine n'est jamais
découpée — et depuis ce découpage elle ne peut plus l'être : une période contient **exactement
2 lundis** (`mondaysIn`) et **exactement 14 jours** (`daysIn`), contre 2 ou 3 lundis et 15 ou
16 jours avec les quinzaines calendaires. Ces deux lundis ne servent plus qu'à BORNER les
saisies hebdomadaires : aucun montant ne se multiplie par leur nombre (le `weekCount` de la
formule a disparu avec le mode fixe — tâche 16, §4).

Les montants **journaliers** (`compta_day_entries`) sont rattachés par leur date.

**Libellé.** « du 6 au 19 juillet 2026 » — la façon dont le propriétaire nomme ses périodes.
Deux variantes quand les bornes changent de mois ou d'année : « du 22 juin au 5 juillet 2026 »,
« du 21 décembre 2026 au 3 janvier 2027 ». Le mois et l'année ne sont répétés que lorsqu'ils
changent.

**URL.** Un seul paramètre, `?debut=` (le lundi de départ), à la place de `?month=` + `?period=`.
Validé **par appartenance** à la fenêtre proposée (`recentPeriods`), jamais par regex seule : une
date bien formée mais non alignée fabriquerait une période chevauchant ses voisines.

Une période n'a **pas** de statut « payée » stocké. Elle est payée quand chacun de ses jours
figure dans le `covered_days` d'un paiement. C'est ce qui absorbe le retard, les règlements
groupés et les paiements partiels sans logique supplémentaire.

---

## 4. Formule

Pour un chatteur et une période :

```
  Base            Σ sur les modèles ( Σ chatter_creator_daily.ca
                  des 14 jours de la période ) × rate / 100
                  -- TOUJOURS. Il n'existe plus de mode où le CA n'est pas commissionné.

+ Fixe            compta_settings.fixed_amount
                  -- SEULE source du montant (tâche 19) : il se règle dans
                     Membres (onglet Compta de la fiche), nulle part ailleurs
                  -- montant PAR PÉRIODE, multiplié par rien
                  -- versé dès qu'il est renseigné : aucun drapeau ne le commande

+ Bonus           Σ compta_day_entries.bonus (jours de la période)
                + Σ compta_week_entries.bonus (semaines rattachées)

− Malus           les deux mêmes sources

+ Handoffs        ( Σ handoffs jour + Σ handoffs semaine ) × 0,60 €

+ Prime           compta_primes.amount si status = 'due', sur la période CONSULTÉE
                  dès lors qu'elle est échue et que ce chatteur n'a jamais reçu de
                  prime (compta_payments.prime_amount)

− Sanctions       Σ police_entries.amount_eur où kind = 'malus'
                  et occurred_on dans la période

+ Report          compta_period_entries.carryover — « RESTE SEMAINE PASSEE »
                  -- SIGNÉ, seule entrée de la formule à l'être : un trop-perçu
                     se reporte en négatif

+ Prime setter    la tranche de compta_setter_scale au rang du chatteur dans le
                  classement des HANDOFFS de la période — « PRIME TOP15 SETTER »

+ Prime du mois   compta_period_entries.top3_prime — « PRIME TOP3 MOIS », saisie
                  à la main : sa règle d'attribution n'est pas connue, l'admin
                  décide et l'app n'invente rien

= Net à payer
```

**Les trois dernières lignes datent de la tâche 22 (2026-07-28)** — le lot qui remplace le
tableur. Elles sont dans `computePayslip` et exposées séparément dans `Payslip` : la fiche doit
montrer chaque ligne, comme la feuille. **Leurs sources sont branchées depuis la tâche 23** : le
report et la prime du mois viennent de `compta_period_entries` (saisis dans la fiche), la prime
setter du classement `rankSetters` sur les handoffs de la période. Les trois sont figées au
paiement par les colonnes d'instantané de la migration `0091` (§5.7).

**Classement setter — `rankSetters(handoffsByMember, scale)`**, fonction pure
(`packages/core/src/compta/setter-rank.ts`). Le classement porte sur les handoffs **saisis dans
l'app** sur la période. ⚠️ Le comptage qui fait foi n'est pas tranché : l'onglet CLASSEMENT SETTER
du propriétaire et les handoffs de sa propre compta divergent (Godgive : 86 contre 111 en juin).
On prend la donnée dont on garantit la provenance, et on le dit.

**Ex æquo : rang partagé, tranches mises en commun puis divisées à parts égales.** `k` ex æquo
occupent les `k` tranches consécutives à partir de leur rang commun ; ces montants sont
additionnés puis partagés. Deux à 71 handoffs sur les tranches 6 et 7 (120 € + 115 €) touchent
117,50 € chacun, et le rang suivant est 8 (classement « compétition »). Trois raisons :

1. **Aucun départage arbitraire.** Toute autre règle doit trancher entre deux performances
   identiques — par nom, par identifiant, ou par l'ordre des lignes rendues par Postgres. Le
   dernier est un défaut silencieux (`Array.prototype.sort` est stable) ; les deux premiers font
   perdre 5 € à quelqu'un pour une raison étrangère à son travail, à chaque période.
2. **Le barème est un budget de 15 tranches, dépensé exactement une fois.** La règle esquissée au
   plan (« montant du rang le plus favorable ») versait 120 € aux deux, soit 5 € de plus, et
   laissait la tranche 7 jamais payée. Ici la somme distribuée vaut Σ du barème, ex æquo ou non.
3. **C'est ce que le propriétaire a dépensé.** Juin, deux paires : Andria/Martin à 71 handoffs
   (120 + 115 = 235 €) et Erielly/André à 66 (105 + 100 = 205 €) — deux tranches consommées par
   paire. Cette règle reproduit ses **totaux au centime** ; seul le partage interne diffère, et le
   sien n'est justifié par aucune donnée (c'est l'ordre des lignes de sa feuille).

Trois choix de bord : un membre à **0 handoff n'est pas classé** (sinon il toucherait la 15e
tranche pour n'avoir rien fait dès que la population est courte) ; le résultat contient **tout le
monde**, y compris au-delà du barème, avec 0 € — c'est l'écran qui coupe ; un **barème incomplet**
(rang manquant, moins de tranches que de membres) ne fait pas d'erreur, la tranche absente vaut
0 €.

**Écart assumé sur la prime — arbitré par Benoit le 2026-07-27, ce n'est pas un oubli.** Cette
section demandait auparavant que la prime ne s'affiche que sur « la période échue la plus
ancienne non couverte » du chatteur. Inutilisable à l'amorçage : tant qu'aucun paiement n'existe,
cette période est la plus ancienne de la fenêtre (12 périodes en arrière), que personne
n'ouvre — la prime restait invisible là où on la cherchait. Le garde contre le double versement
est INCHANGÉ : c'est `compta_payments.prime_amount` (instantané figé), et non la position de la
période, qui interdit de la verser deux fois.

**Hypothèse TRANCHÉE — `fixed_amount` est PAR PÉRIODE, et il s'AJOUTE (tâche 16).** Cette
section supposait un fixe HEBDOMADAIRE (`× 2 semaines`) et un mode `fixed` qui REMPLAÇAIT la
commission. Les deux venaient de la branche WIP, pas d'une pratique. La feuille de juillet
tranche : le fixe n'est rempli qu'une fois par période de paie (bloc S2, 59 personnes, montants
37,50 / 40 / 75 €), jamais dans chaque bloc hebdomadaire, et il s'additionne à une commission
versée à tout le monde (Carl = 4,379 + 75 + 19,20 = 98,579 €). `compta_settings.mode` et
`is_setter` sont donc supprimés (§5, migration `0089`), et `weekCount` disparaît de la formule.

**UNE SEULE SOURCE DU FIXE — les réglages (tâche 19, 2026-07-28).** Le montant vient de
`compta_settings.fixed_amount`, saisi dans l'onglet Compta du dialog de Membres (tâche 25 ; il
l'était derrière l'engrenage de la ligne jusque-là), et de nulle part ailleurs. La fiche l'affiche en ligne d'ajustement sous le libellé nu « Fixe setter ».

> Cette section décrivait jusqu'ici un second point de saisie : une **saisie hebdo**
> `fixe_setter` non nulle qui **remplaçait** le réglage pour la période (le 37,50 € observé sur
> la feuille = un demi-fixe), la fiche disant lequel s'appliquait (`payslip.setterAdjusted`).
> **C'était un défaut d'argent, pas un raffinement.** Le fixe est un montant PAR PÉRIODE, mais
> cette saisie était HEBDOMADAIRE : le champ apparaissait donc **deux fois** par période (une
> par ligne-semaine) et `compta-rows.ts` **sommait** les deux. Deux champs identiques invitent à
> retaper le même montant dans chacun — 75 € saisis deux fois versaient **150 €**. Le champ, la
> colonne d'en-tête, `PayslipInput.fixeSetter` et `Payslip.setterAdjusted` sont retirés ; la
> saisie hebdomadaire garde **Bonus, Malus, Handoffs**.
>
> La colonne `compta_week_entries.fixe_setter` **reste en base** (elle porte de l'historique) :
> aucune migration. Elle n'est plus ni lue, ni écrite, ni affichée — `saveWeekEntry` l'omet du
> payload d'upsert, ce qui la laisse intacte sur une ligne existante plutôt que de l'écraser à
> 0. Une valeur historique non nulle **cesse donc d'être comptée** dans le net (aucune sur
> l'UAT au 2026-07-28 : 4 lignes, toutes à 0,00).

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

## 5. Modèle de données — migrations `0085` … `0091`

`0085` porte l'essentiel (les tables étant vides) ; `0086` ouvre la lecture cloisonnée des
sanctions (§6), `0087` interdit le chevauchement des jours couverts, `0088` bascule
`compta_payments` sur le découpage en 14 jours, `0089` supprime le mode de rémunération et le
statut de setter (§5.5), `0090` pose le socle du lot final (§5.6), `0091` étend l'instantané de
paiement aux trois lignes de ce lot (§5.7).

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
| `ca_reference` | `numeric(10,2)` | CA ayant servi de base |
| `rate_applied` | `numeric(5,2)` | taux au moment du paiement |
| `base_amount` | `numeric(10,2)` | base calculée |
| `setter_amount` | `numeric(10,2)` | fixe de la période (réglage ou saisie hebdo) |
| `bonus_amount` | `numeric(10,2)` | bonus cumulés |
| `malus_amount` | `numeric(10,2)` | malus manuels |
| `handoffs_amount` | `numeric(10,2)` | handoffs × 0,60 |
| `prime_amount` | `numeric(10,2)` | prime éventuelle |
| `sanctions_amount` | `numeric(10,2)` | sanctions police |

`0091` en ajoute trois autres (§5.7). `amount` reste le **net versé**. Invariant, DIX composantes :
`amount = base + setter + bonus − malus + handoffs + prime − sanctions + carryover + setterPrime
+ monthlyPrime`.

`mode_applied` figurait ici jusqu'à la tâche 16 (`text check (mode_applied in
('percent','fixed'))`, mode au moment du paiement) : `0089` la supprime avec le mode lui-même —
une colonne `not null` qu'aucun code ne peut plus remplir.

**Aucune de ces colonnes n'a de valeur par défaut** (arbitré le 2026-07-27). Un `default 0` les
rendrait optionnelles dans le type `Insert` généré : un paiement omettant `sanctions_amount`
compilerait et écrirait 0 €, faisant disparaître une retenue sans bruit. Sans défaut, le
compilateur exige toutes les composantes à chaque enregistrement — l'invariant ci-dessus devient
structurel, et non plus une affaire de discipline. Des colonnes explicites
plutôt qu'un `jsonb` — pour répondre à « combien de sanctions retenues ce trimestre ? » d'une
requête plutôt que d'un parcours applicatif.

**Pourquoi figer.** Le CA vient de `chatter_creator_daily`, ré-ingéré depuis MyPuls. Un calcul
à la volée verrait un montant déjà versé changer rétroactivement après correction d'un jour
passé. L'instantané rend l'historique opposable.

**5.4 `period_start` remplace `month` + `period` — migration `0088`.** `0085` avait ajouté
`period smallint check (period in (1,2))` à côté de `month date`. Avec des périodes de 14 jours,
les deux deviennent faux : **trois périodes peuvent démarrer dans le même mois** (la contrainte
rejetterait un paiement légitime), et une période ne se rattache à aucun mois (celle du 20/07/2026
finit le 02/08) — stocker un lundi dans une colonne nommée `month` serait un mensonge permanent.

`0088` supprime donc `period` et sa contrainte, renomme `month` → `period_start`, renomme l'index
qui suivait la colonne, et **ajoute** `check (mod(period_start − date '2026-07-06', 14) = 0)` :
l'alignement du découpage devient une contrainte de données, pas seulement une convention
applicative. Sans lui, un paiement posé à la main sur une date décalée créerait des périodes qui
se chevauchent, et `covered_days` deviendrait incohérent en silence.

Sans risque : `compta_payments` est vide (0 ligne mesurée sur l'UAT le 2026-07-27) et `0085`
comme `0087` ne sont pas en production.

`compta_day_entries` (clée par date) et `compta_week_entries` (clée par lundi) **ne bougent pas** :
elles sont déjà indépendantes du découpage, seul leur regroupement change. Le trigger de
non-chevauchement `compta_payment_no_overlap` (`0087`) ne bouge pas non plus — il raisonne sur
`covered_days` et `chatter_id`, jamais sur la période (vérifié : c'est la seule fonction de
`public` qui mentionne `compta_payments`, et aucune vue n'en dépend). Même chose pour le garde
« on ne fige que des jours révolus » de `payPeriod`, qui compare des jours à `todayParis()`.

**5.5 Un seul mode de rémunération — migration `0089`.** Trois colonnes disparaissent :
`compta_settings.mode` (et son `check`), `compta_settings.is_setter`, et l'instantané
`compta_payments.mode_applied`. Le raisonnement et les mesures sont en §2 et §4.

`compta_settings.fixed_amount` **change de sens sans changer de type** : montant hebdomadaire du
mode fixe → fixe de la PÉRIODE, qui s'ajoute à la commission et s'applique dès qu'il est `> 0`.
Le sens vit dans un `comment on column`, pas dans un renommage : la colonne est vide, mais
renommer casserait les requêtes ad hoc écrites jusqu'ici sans rien apprendre de plus.

Sans risque : `compta_settings` et `compta_payments` sont **vides** (0 ligne chacune, mesuré sur
l'UAT le 2026-07-27 juste avant d'appliquer), et `0085`/`0087`/`0088` ne sont pas en production.
La prod n'a pas été ouverte pour cette tâche — `compta_settings` y sera revérifiée avant de
pousser.

**5.6 Le socle du lot final — migration `0090`** (2026-07-28, appliquée sur l'UAT seulement).
Les lignes de la feuille que l'app ne savait pas porter.

| Objet | Forme | Pourquoi |
|---|---|---|
| `compta_period_entries` | `primary key (chatter_id, period_start)`, `carryover numeric(10,2)` **signé**, `top3_prime numeric(10,2) check (>= 0)` | Les deux montants valent pour la PÉRIODE entière — ni un jour, ni une semaine. Une table de plus, clée comme ses sœurs (`(chatter_id, date)`, `(chatter_id, week_start)`) |
| `compta_setter_scale` | `rank smallint primary key`, `amount numeric(10,2)`, amorce = le barème de juin (200 → 80, Σ 1 796 €) | Barème réglable : une constante TypeScript aurait demandé un déploiement pour changer un chiffre |
| `compta_debts.amount` | `text` → `numeric(10,2)`, plus `settled_by` | Même raison que `compta_primes` en 0085 : on ne calcule pas de l'argent en parsant une chaîne |
| `profiles.closing_role` | `check` élargi à `('setter','closer','nouveau','hybride')` | La légende de la feuille connaît quatre états (L96-98) |

`compta_period_entries` **reprend la contrainte d'alignement de `compta_payments`**
(`check (mod(period_start − date '2026-07-06', 14) = 0)`) et pour la même raison : une ligne posée
sur un lundi décalé porterait un report qu'aucune période affichée ne ramasserait — invisible, et
jamais versé.

`carryover` est la seule colonne de montant **signée** de la compta : un trop-perçu se reporte en
négatif, et l'imposer positif obligerait à le contourner par un malus, qui ne dit pas la même
chose sur la fiche. `top3_prime`, elle, refuse le négatif — la ligne signée d'à côté est là pour
les corrections.

Mesuré sur l'UAT le 2026-07-28 avant d'appliquer : `compta_debts` = 0 ligne, et son `amount`
n'avait **aucun** défaut (le `'100 €'` mentionné au plan est celui de `compta_primes`). La prod
n'a pas été ouverte. La conversion s'appuie sur le `not null` de la colonne comme garde : une
valeur que l'expression ne sait pas réduire à un nombre donne `null`, donc la migration **échoue**
au lieu de convertir de travers.

Les deux pièges que `0090` laissait ouverts ont été **traités à la tâche 23** :

- `compta_payments` n'avait aucune colonne d'instantané pour les trois nouveaux montants →
  migration `0091` (§5.7) ;
- `profiles.closing_role` acceptait quatre valeurs que Membres ne savait ni produire ni afficher
  → `CRM_ROLES` passe à quatre (§5.8).

**5.7 L'instantané rattrape le lot final — migration `0091`** (2026-07-28, UAT seulement).
`compta_payments` gagne `carryover_amount` (**signé**), `setter_prime_amount` et
`monthly_prime_amount`, `numeric(10,2) not null`, **sans défaut** — la doctrine de `0085` reprise
mot pour mot. `compta_payments` mesurée à 0 ligne sur l'UAT juste avant d'appliquer : un
`not null` sans défaut aurait échoué sur une table peuplée, et c'est le comportement voulu (mieux
vaut un push en échec qu'un instantané rétroactif rempli de zéros inventés).

Sans ces colonnes, brancher les trois sources aurait fait **échouer tout paiement** d'une fiche
qui en porte une : `payslip.net` les incluait, tandis que le `superRefine` de `payInput` et les
contrôles de dérive de `payPeriod` n'en connaissaient que sept. Les trois sont donc ajoutées au
contrat (`payInput`), au recalcul serveur (`actions-pay.ts`, treize valeurs comparées) et à
l'écriture (`record-payment.ts`).

**Pourquoi figer la prime setter en particulier** : elle n'est stockée nulle part et se recalcule
à chaque rendu depuis le barème et les handoffs. Un handoff corrigé la semaine suivante, ou une
tranche du barème retouchée, changerait le rang — donc la prime — d'un membre **déjà payé**.
L'instantané rend le versement opposable, exactement comme `ca_reference` face à une
ré-ingestion MyPuls.

Aucune contrainte de somme en base : l'invariant reste vérifié côté application. Un `check` SQL
l'exprimant refuserait les paiements légitimes dès qu'un centime d'arrondi flottant s'y glisse —
la tolérance de 0,01 € vit dans le code.

**5.8 `CRM_ROLES` passe à quatre valeurs** (2026-07-28, aucune migration). `closer`, `setter`,
`hybride`, `nouveau` — la liste TypeScript rattrape le `check` élargi par `0090`. Trois points
étaient à corriger, et le troisième était le plus grave :

| Fichier | Avant | Après |
|---|---|---|
| `lib/types/chatters.ts` | `CRM_ROLES = ['closer','setter']` | quatre valeurs |
| `features/members/components/member-closing-fields.tsx` | `Record<CrmRole, string>` à deux entrées → le `Select` ne proposait rien d'autre, et `z.enum(CRM_ROLES)` **refusait d'enregistrer** un membre déjà posé sur `'nouveau'` | quatre libellés |
| `components/role-badge.tsx` | `role === 'closer' ? 'Closer' : 'Setter'` → **étiquetait « Setter » toute valeur ≠ `'closer'`** | `Record<CrmRole, …>` pour le libellé ET la couleur : ajouter une valeur sans passer ici ne compile plus |

Le badge était le pire des trois : un `'nouveau'` s'y serait affiché **faux**, pas absent — rien
ne l'aurait signalé. Couleurs prises dans la palette déjà en place, aucune teinte nouvelle :
setter violet et closer orange inchangés, `hybride` vert (la seule teinte de rôle libre — rouge
et bleu sont ceux de `TeamBadge`, ambre celui du rôle Police), `nouveau` gris neutre (un arrivant
n'a pas encore de spécialité).

Rien d'autre ne bouge : `stat-chatteur` compte toujours `'setter'` et `'closer'` séparément, et
ses deux filtres de rôle restent ceux-là — un `'nouveau'` apparaît sous « Tous les rôles », avec
son badge, et n'entre dans aucun des deux compteurs. C'est le comportement voulu : ces KPI
comptent des setters et des closers.

---

## 6. Droits et cloisonnement

| Table | Admin | Manager / sous-manager | Chatteur |
|---|---|---|---|
| `compta_day_entries`, `compta_week_entries`, `compta_period_entries` | tout | lecture + écriture **sur ses rattachés** | — |
| `compta_settings` | tout | lecture sur ses rattachés | — |
| `compta_primes` | tout | lecture sur ses rattachés | — |
| `compta_payments` | tout, **seul à écrire** | lecture sur ses rattachés | — |
| `compta_setter_scale` | tout, **seul à écrire** | lecture (barème global) | — |
| `compta_debts` | tout | — | — |

Le chatteur n'a jamais la page. Manager **et** sous-manager ont le même accès : `is_manager()`
couvre les deux, aucune policy distincte.

`compta_setter_scale` est la seule table compta **sans `chatter_id`** : c'est une grille de
tranches, elle ne désigne personne, donc la jambe `manages(chatter_id)` n'a rien à restreindre et
sa lecture est ouverte à tout l'encadrement. Elle DOIT l'être : la prime setter est une composante
du net, et un manager qui ne verrait pas le barème verrait cette prime à 0 € **sans aucune
erreur** — exactement le défaut que `0086` a corrigé sur les sanctions Police (ci-dessous).

Les policies actuelles (`has_page('compta')` sans cloisonnement) donnent la lecture de **toute**
la compta à quiconque a la page. Elles sont remplacées par
`is_admin() or (is_manager() and manages(chatter_id))`.

**Le classement setter est lu AGENCE-WIDE, par client admin** (tâche 23) — troisième lecture
cadrée applicativement, après le CA et `chatter_first_seen()`. `compta_day_entries` et
`compta_week_entries` sont cloisonnées : un manager n'y lit que ses 15 rattachés. Classer sur
cette lecture-là leur aurait donné les rangs 1 à 15, donc les 15 tranches du barème — son écran
aurait annoncé 200 € là où l'agence en verse 84, **sans aucune erreur**, et l'admin qui paie
(voyant tout) aurait figé un autre montant. Un TOP 15 est agence-wide par nature.

Ce qui sort de cette lecture reste cloisonné : `loadComptaRows` ne retient du classement que les
membres déjà renvoyés par la RLS `profiles`. Un encadrant apprend le **rang** de ses rattachés —
la donnée dont dépend leur paie — et rien des autres : ni nom, ni handoffs. Sa numérotation a
donc des trous (1, 5, 9…), et l'écran le dit.

**Lecture des sanctions depuis la compta** (arbitré le 2026-07-27). `police_entries` n'est lisible
qu'avec le droit de page `police` (0078), lequel donne accès à **toutes** les sanctions, non
cloisonnées. Or 5 sous-managers portent `compta` sans `police` : leur fiche affichait 0 € de
sanctions **sans erreur**, donc un net surestimé.

Corrigé par une policy ADDITIONNELLE et CLOISONNÉE (`0086`) : un porteur de `compta` lit les
sanctions de **ses rattachés directs uniquement** (`manages(chatter_id)`). La policy `police_read`
existante n'est pas touchée — la page Police garde son comportement. Personne ne reçoit le droit
`police`, et personne ne gagne d'accès global : la compta ne récupère que la valeur qui concerne
le chatteur affiché.

La triade du repo s'applique (`guidelines-standard-feature.md` §4) : **RLS** = verrou réel ;
**serveur** `managerPageGuard('compta')` sur les écritures de saisie, `adminGuard` sur le
paiement ; **UI** un `canPay` threadé `page → Template → composants` pour masquer le bouton de
virement aux managers.

> **Correction du 2026-07-28 (tâche 25) — les réglages de paie s'écrivent depuis MEMBRES.**
> `compta_settings` et `compta_primes` ne sont plus écrites depuis `/chatter/compta` mais depuis
> l'onglet « Compta » du dialog de Membres (décision du propriétaire : « je pense que tout va
> dans membre, tu mets un tab dans le dialog direct »). **Le tableau des droits ci-dessus ne
> change pas** : les policies `compta_settings_admin_write` / `compta_primes_admin_write` (0085)
> restent `using (is_admin()) with check (is_admin())`, et **aucune migration n'a été nécessaire**.
>
> Ce qui change, c'est **où** le droit se lit à l'écran, et ça compte : le dialog de Membres est
> ouvert aussi par un **manager** dans son périmètre (`features/members/actions.ts`,
> `requireCaller` + `authorizeRoleAndScope`), alors que la paie est admin-seule. L'onglet n'est
> donc **monté que pour un admin**, et le serveur ne lui envoie même pas les valeurs
> (`Member.pay` est `undefined` hors admin, `get-members.ts`) — sinon un manager verrait des
> champs dont l'enregistrement serait refusé par la RLS, tard et mal.
>
> Serveur : `saveMemberPaySettings` / `saveMemberPrime`
> (`features/members/actions-pay.ts`), `adminGuard` inchangé. Le cœur des deux écritures — dont
> **le refus de réécrire une prime déjà versée** — vit dans `lib/pay-settings-write.ts` ; les
> contrats zod et les bornes dans `lib/pay-settings.ts`, d'où `features/compta/schema.ts` les
> réimporte (les imports inter-features sont interdits, même patron que `lib/chatter-link.ts`).
>
> `canConfigure` **reste** : il commande toujours le bouton « Relier à MyPuls », le barème du
> Classement et l'onglet Suivi. Seul l'engrenage a disparu.

---

## 7. Écrans

Route unique : `/chatter/compta`.

**TROIS ONGLETS, et rien de plus dans l'app** (tâche 24) — `?vue=` : **Période** (défaut, absent
de l'URL), **Classement**, **Suivi**. C'est le découpage mental de la feuille qu'on remplace, pas
trois entrées de sidebar de plus. Patron repris de la to-do du Planning (`TodosTabs`, `?vue=`) :
`router.replace` sans `scroll`, aucune entrée d'historique parasite. `?vue=` se COMBINE avec
`?debut=` — Période et Classement décrivent la même quinzaine, basculer ne la perd pas.

**Un seul onglet est chargé à la fois** : la page ne construit même pas l'élément des deux autres
(patron du Planning). L'onglet Suivi ne fait donc payer ses requêtes à personne, et une panne sur
l'un ne fait pas tomber les autres. Période et Classement, eux, partagent le **même** `getCompta` :
le classement et les fiches doivent sortir de la même exécution de `rankSetters`, sinon l'un
afficherait un rang que l'autre ne connaît pas encore.

**Contrainte d'ergonomie, la demande centrale** : « ça doit être simple et intuitif, pas plus
chiant que le document ». La feuille se parcourt d'un coup d'œil et se remplit au clavier. D'où :
**aucun bouton « Enregistrer » par ligne** nulle part dans les trois onglets. Toute saisie de
ligne (semaine, période, tranche du barème) part quand le focus quitte la ligne ou sur `Entrée`,
avec un témoin par ligne (`Non enregistré` → `Enregistrement…` → `Enregistré` / `Échec`) et un
toast en cas d'échec — jamais de silence. La mécanique est UNE seule implémentation partagée
(`useRowAutosave`) : trois copies auraient divergé, comme le calcul du net avant `loadComptaRows`.
Seul l'AJOUT d'un solde de partant garde un bouton, et c'est délibéré — on y CRÉE une ligne, il
n'y a pas de ligne à quitter, et un formulaire vide qui partirait au blur écrirait une dette de
0 € au premier clic à côté.

### 7.1 Onglet Période

**Structure.** Une ligne par chatteur, dépliable — la grammaire installée le 2026-07-26 sur le
Planning et le Dashboard. `MembersAccordion` et `CollapsibleSection` sont réutilisés tels quels.

```
Compta                              [ Période ▾ du 6 au 19 juillet 2026 ]

┌ KPI ──────────────────────────────────────────────────────────┐
│  À payer        Chatteurs      Sanctions       Déjà payé      │
│  12 450 €       38 à payer     −340 €          3 200 €        │
└───────────────────────────────────────────────────────────────┘

⚠ 2 périodes antérieures incomplètement couvertes → du 22 juin au 5 juillet, du 8 au 21 juin

▸ Axel          Chatter          775 €      à payer
▸ Dorian        Chatter          612 €      payé le 18/07
▸ Lina          Chatter            — €      ⚠ non reliée à MyPuls
```

Le repère de droite répond sans déplier : combien, et payé ou non.

**Panneau déplié = la fiche de paie.** Le détail de la formule ligne à ligne, les motifs de
sanction en clair (`05/07 — Réponse > 45 s : 15 €`), la ventilation du CA par modèle, et le
compte de handoffs. Sous la fiche : la saisie — **bonus, malus, handoffs**, une ligne par
semaine, et rien d'autre : le fixe est un montant par période, il n'a pas de champ ici
(tâche 19, cf. §4) — et pour un admin le bouton **Marquer payé** qui fige l'instantané et
enregistre `covered_days`.

**Depuis la tâche 24, la fiche porte les trois lignes du lot final et DEUX champs de plus.**

Côté lecture, trois lignes d'ajustement : « Report période précédente » (en rouge s'il est
négatif — c'est une retenue), « Prime setter — rang 6 (71 handoffs) » (**le rang est dans le
libellé** : sans lui c'est un montant sans provenance, et c'est ce que le chatteur voudra
vérifier), « Prime du mois (top 3) ». Chacune sur SA ligne, comme les autres composantes : le net
doit s'additionner exactement à partir de ce qui est affiché.

Côté saisie, une ligne **« Période entière »** sous les deux lignes-semaines, avec son propre
en-tête (`Report €`, `Prime du mois €`) et **la même grille** que les semaines — la troisième
piste reste vide pour que les colonnes s'alignent d'un bloc à l'autre. Elle est SÉPARÉE des
semaines, et pas deux champs de plus sur chacune : c'est le défaut d'argent corrigé à la tâche 19
(`fixe_setter`, montant par période logé dans une saisie hebdomadaire, affiché deux fois et
sommé — 75 € retapés sur chaque ligne versaient 150 €). Le report est le seul montant signé de la
saisie : la ligne d'aide le dit là où on le tape, sinon personne ne devine qu'un trop-perçu
s'écrit en négatif.

**Réglages (admin seul) — ILS ONT QUITTÉ CETTE PAGE le 2026-07-28 (tâche 25).** Un dialog à
**trois champs et un seul bouton « Enregistrer »** (tâche 16) : la **commission** en %, le
**fixe par période** en € (il s'ajoute à la commission), et le **montant** de la **prime**
nouveau chatteur. Sans cet écran, `compta_settings` et `compta_primes` resteraient aux défauts
de leurs colonnes pour tout le monde, modifiables en SQL seulement, et la prime « manuelle » de
la §2 ne pourrait pas être créée. Une prime déjà versée s'affiche en lecture seule : son statut
est la trace du virement.

> **Où il vit désormais : l'onglet « Compta » du dialog de MEMBRES.** Décision du propriétaire :
> « je pense que tout va dans membre, tu mets un tab dans le dialog direct ». Le taux, le fixe et
> la prime sont des attributs de la **personne**, pas de la période — les tenir dans deux écrans
> était la même erreur que le fixe qui vivait en double (tâche 19). Champs, libellés, bornes et
> phrases d'aide sont repris **à l'identique**, y compris le sous-titrage de l'échec qui nomme
> laquelle des deux écritures a échoué.
>
> Côté Compta : **l'engrenage et sa colonne d'action ont disparu**, et la colonne
> « Rémunération » (`10 % · fixe 75,00 €`) devient **cliquable** — elle renvoie vers Membres.
> Elle mène à la **page** et non à la fiche : aucune route n'ouvre un membre précis
> (`/chatter/members` est une liste dont le filtre est un état client). Un `?membre=<id>` qui
> pré-ouvrirait le dialog est la suite naturelle ; il n'a pas été inventé ici.
>
> L'onglet n'est monté **que pour un admin et un membre de rôle chatteur** (la Compta ne paie que
> `profiles.role = 'chatteur'`). Il porte son **propre** bouton « Enregistrer », frère de celui du
> membre et jamais imbriqué dedans : c'est aussi ce qui empêche une prime de partir « en passant »
> — fondue dans le bouton du membre, elle créerait une ligne `compta_primes` à 100 € « à verser »
> pour tout membre dont on édite les pages, alors que l'**absence** de ligne est une information
> (l'onglet Suivi la lit comme « le montant n'a jamais été décidé »).
>
> **En création**, l'onglet affiche une phrase au lieu des champs : le membre n'a pas encore
> d'`id`, et `compta_settings.chatter_id` est une FK vers `profiles.id` (0085). En attendant, ce
> sont les défauts de colonne qui s'appliquent — 10 %, aucun fixe, aucune prime décidée.

> **Correction du 2026-07-28 (tâche 20) — le statut de la prime quitte l'écran.** Le dialog
> proposait un statut « à verser » / « renoncée » à côté du montant. L'onglet « SUIVI PRIMES NVX
> CHATTEURS » du propriétaire ne connaît que deux états, payée ou en attente : sur ses 71 lignes,
> **30 payées, 41 en attente, aucune renoncée**. « Renoncée » ne décrivait aucune pratique.
>
> Désormais **le montant seul gouverne : 0 € = pas de prime.** `status` sort aussi du contrat de
> `savePrime`, qui le pose à `'due'` côté serveur — une ligne héritée `'skipped'` est donc
> normalisée en `'due'` au premier enregistrement (sinon l'écran afficherait un montant
> enregistré qui ne compte pas, sans le dire). `'paid'` continue d'être posé par `payPeriod`
> seul, et `savePrime` refuse toujours de réécrire une prime versée.
>
> **Aucune migration** : `compta_primes.status` garde son `check ('due','paid','skipped')`
> (0084), pour pouvoir revenir en arrière à peu de frais. La colonne « Prime » de la pile sait
> toujours lire `renoncée` sur une ligne héritée — elle n'est simplement plus productible.

Deux tables derrière un seul bouton, donc deux Server Actions : l'écran **nomme** celle qui a
échoué (« Taux et fixe enregistrés, mais PAS la prime : … »). Un « Erreur » global laisserait
croire que rien n'a été écrit alors que la moitié l'a été.

**Chatteur non relié à MyPuls.** `profiles.chatter_id` est nullable : 30 profils chatteurs sur
102 ne sont pas reliés en prod. Sans lien, aucun CA n'est calculable. La ligne affiche un
avertissement explicite et un renvoi vers Membres — **jamais un 0 € silencieux**, qui ferait
passer un chatteur pour non rémunérable.

**Retard.** Le bandeau des périodes incomplètes se déduit de `covered_days` : toute période
échue dont un jour n'est couvert par aucun paiement remonte, quelle que soit la date.

### 7.2 Onglet Classement

Le TOP setter de la période — rang, chatteur, handoffs, prime — plus une ligne de total (Σ des
handoffs, Σ des primes : le barème est un budget dépensé une fois). Même sélecteur de période que
l'onglet Période.

Un membre à **0 handoff n'y figure pas** : `rankSetters` ne le classe pas. Une prime à **0 €**
(au-delà de la dernière tranche) reste affichée, en gris — être classé sans rien toucher est un
résultat, et le voir explique pourquoi la fiche n'a pas de ligne « Prime setter ».

Le rang est **agence-wide** (§6) : la liste d'un encadrant a donc des trous. L'écran le dit en
une phrase, plutôt que de renuméroter de 1 à N — une numérotation par périmètre ne
correspondrait à aucune prime. Il rappelle aussi que le classement porte sur les **handoffs
saisis dans l'app**, le comptage qui fait foi n'étant pas tranché (§4).

**Le barème** est affiché dessous, pour TOUT l'encadrement — un manager qui ne le verrait pas
lirait la prime setter comme 0 € sans erreur (§6). **Éditable par l'admin seul** : quinze
tranches en trois colonnes, une tranche = un `<form>` = une écriture (la clé primaire est le
rang), enregistrement automatique. La phrase sous la grille dit ce qu'une modification fait :
elle s'applique aux périodes **non encore payées**, jamais à celles déjà réglées, dont le montant
est figé (`setter_prime_amount`, §5.7).

### 7.3 Onglet Suivi

Deux listes, aucune période — une prime échue le reste jusqu'à ce qu'elle soit versée, quelle que
soit la quinzaine qu'on regarde à côté.

**Primes d'embauche à verser** : chatteur, arrivée, éligible depuis, montant. Échéance = arrivée
(`chatter_first_seen()`) **+ 1 mois au même quantième** (`addMonthsSameDay` — `addMonths` ramène
au 1er du mois et aurait rendu un arrivant du 28 juin éligible le 1er juillet). « Non versée » se
lit sur `compta_payments.prime_amount`, **jamais** sur `compta_primes.status` (§5.3, même
raisonnement que `coverage.primePaid`). Triée par échéance la plus ancienne : c'est l'ordre du
retard.

**La colonne Montant est la raison d'être de cette liste.** Une prime n'entre dans le net que si
une ligne `compta_primes` existe avec un montant : un membre échu sans montant ne recevra **rien,
en silence**. L'écran écrit donc « aucun montant » (ambre) ou « 0 € — rien à verser » au lieu
d'un « 0,00 € » qui ressemble à une décision. Le montant se règle dans **Membres**, onglet
Compta de la fiche du chatteur (tâche 25).

**Soldes des partants** (`compta_debts`) — **ADMIN seul**. Nom, modèle, montant, état, plus un
bouton **Soldé** (et **Rouvrir**) et une corbeille sous confirmation. Le nom est du texte libre :
une dette vise souvent quelqu'un qui n'est plus chatteur, et une clé étrangère l'aurait fait
disparaître avec le compte. Un solde réglé **reste à l'écran, barré, daté** : c'est une trace,
pas un déchet — la corbeille est pour la ligne saisie par erreur. Un non-admin ne voit pas la
section du tout : `getSuivi` n'interroge même pas la table, et une liste vide se lirait
« aucune dette ».

---

## 8. Découpage technique

```
packages/core/src/compta/
  periods.ts        périodes de 14 jours calées sur les lundis             [testé]
  payslip.ts        la formule, sur des entrées pures                      [testé]

apps/web/src/features/compta/
  ComptaTemplate.tsx        RSC, aucun fetch
  types.ts                  contrat de domaine local
  schema.ts                 zod partagé RHF ↔ actions
  actions.ts                saisies (managerPageGuard) + paiement (adminGuard)
  services/get-compta.ts    lecture, une période
  components/
    compta-view.tsx         feuille client (état, sélecteur de période)
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
| Période sans aucune donnée CA | net = 0, la ligne reste affichée (les bonus/primes restent dus) |
| Paiement partiel d'une période | `covered_days` ne couvre qu'une partie → la période reste « incomplète » |
| Ré-ingestion du CA après paiement | l'instantané ne bouge pas ; l'écart est visible en comparant `ca_reference` au CA courant |
| Prime déjà `paid` | ignorée dans les périodes suivantes |
| Sanction saisie après le paiement | non rattrapée automatiquement — elle apparaîtra sur la période de son `occurred_on`, qui sera signalée comme incomplète si non couverte |
| Deux profils pour un même chatteur MyPuls | impossible en prod (vérifié : maximum 1), pas de garde applicative |

---

## 11. Tests

Dans `packages/core`, sous Vitest :

**`periods.ts`** — l'ancre 06/07/2026 et ses voisins à 14 jours, un jour AVANT l'ancre (l'écart
négatif ne doit pas décaler d'une période), le balayage « toute période démarre un lundi », une
période à cheval sur deux mois puis sur deux années, `mondaysIn` toujours à 2 et `daysIn` toujours
à 14 sur un large balayage, une semaine jamais découpée, et `recentPeriods` sans trou ni
recouvrement.

**`payslip.ts`** — la commission modèle par modèle et son arrondi par ligne ; le **fixe**, qui
concentre les régressions d'argent de la feature : il s'ajoute à la commission (il ne la remplace
pas), et il vaut `compta_settings.fixed_amount` **tel quel** — ni retenu par un drapeau
(`is_setter`, 0089), ni multiplié par le nombre de semaines, ni remplacé par une saisie hebdo
(`fixeSetter`, tâche 19) ; plus une ligne de la feuille rejouée de bout en bout (commission +
fixe + handoffs). Puis handoffs à 0,60, prime due, cumul malus manuel + sanction police, période
entièrement vide, et l'invariant
`net = base + setter + bonus − malus + handoffs + prime − sanctions`.

**`setter-rank.ts`** (tâche 22) — le classement sans ex æquo, les deux paires de juin (rang
partagé, tranches mises en commun, et le **total du barème inchangé**), le saut de rang du
classement « compétition », trois ex æquo et leur arrondi, une population plus courte que le
barème, un barème incomplet (rang manquant, plus court, vide), le membre à 0 handoff exclu, et
l'indifférence à l'ordre des entrées.

Ces tests sont **vérifiés discriminants** : chaque régression a été réintroduite une par une
dans `computePayslip` puis dans `rankSetters`, et le test correspondant est tombé (détail dans les
rapports de tâche 16, 19 et 21-22 — 16 régressions couvrant chacun des tests des deux fichiers).
Un test qui ne tombe sur aucune régression est un test qui ne protège rien.

**Les tests qui survivent à ce qu'ils gardaient sont SUPPRIMÉS, pas conservés.** La tâche 19 a
retiré `fixeSetter` de `PayslipInput` : les quatre tests qui décrivaient son arbitrage sont
devenus soit impossibles à écrire (le champ n'existe plus), soit de simples redites de
`setter === fixedAmount`. Ils sont fondus en un seul, qui énumère les trois régressions
historiques. La forme de sortie, elle, est gardée par le `toEqual` complet du test « période
entièrement vide » : réintroduire `setterAdjusted` le fait tomber sur une clé en trop.

Pas de test côté `apps/web` : le harnais n'existe pas et le monter dépasse ce périmètre.
