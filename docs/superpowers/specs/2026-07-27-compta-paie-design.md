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
> Donc : `compta_settings.mode` et `compta_settings.is_setter` sont **supprimés** (§5.5),
> avec l'instantané `compta_payments.mode_applied` devenu sans objet. Le fixe s'applique
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
`compta_payments` (§5.4) — trois périodes peuvent démarrer dans le même mois, et
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
  Base            Σ sur les SEGMENTS DE TAUX de la période
                    ( Σ sur les modèles
                        ( Σ chatter_creator_daily.ca des jours du segment ) × taux du segment / 100 )
                  -- TOUJOURS. Il n'existe plus de mode où le CA n'est pas commissionné.
                  -- Le TAUX EST DATÉ (tâche 27) : chaque jour est payé au taux en
                     vigueur ce jour-là (compta_rates, §5.10). Un segment = des jours
                     consécutifs au même taux. Taux inchangé = UN segment, et la
                     formule redevient terme pour terme celle d'avant.

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

+ Prime setter    la tranche de compta_setter_scale au rang du chatteur dans le
                  classement des HANDOFFS de la période — « PRIME TOP15 SETTER »

= Net à payer
```

**Le REPORT (« RESTE SEMAINE PASSEE ») et la PRIME DU MOIS (« PRIME TOP3 MOIS ») ont été
RETIRÉS de la formule le 2026-07-28** — décision de Benoit, voir « Ce que ce plan ne fait pas »
dans le plan. Le report n'a jamais été élucidé (« ça existera pas, à part si on me le
demande ») ; la prime du mois était un montant MENSUEL saisi sur un écran de PÉRIODE de 14
jours, ce qui n'avait pas de sens à ses yeux. Leur table de saisie (`compta_period_entries`) et
leurs colonnes d'instantané sont sorties de la base (§5.11).

Le **mois d'une période est celui de son LUNDI DE DÉPART** (`monthOfPeriod`). C'est la règle déjà
en place un cran plus bas (« une semaine est rattachée à la période de son lundi, et n'est jamais
découpée », §3) appliquée aux périodes. Sa propriété essentielle est d'être une **partition** :
chaque période appartient à exactement un mois. Une période à cheval (20/07 → 02/08) est donc
entièrement de juillet et la suivante (03/08) entièrement d'août. Un rattachement « au mois
majoritaire en jours » n'aurait pas cette propriété (31/08 → 13/09 basculerait en septembre alors
que la période du 17/08 reste en août) ; il est explicitement testé comme régression dans
`months.test.ts`. Depuis le retrait de la prime du mois, cette règle ne garde plus d'argent :
elle sert le récap mensuel de l'onglet Classement (§7.2), qui déduit son mois de la période
choisie.

**La prime setter date de la tâche 22 (2026-07-28)** — le lot qui remplace le tableur. Elle est
dans `computePayslip` et exposée séparément dans `Payslip` : la fiche doit montrer chaque ligne,
comme la feuille. **Sa source est branchée depuis la tâche 23** : le classement `rankSetters` sur
les handoffs de la période. Elle est figée au paiement par la colonne d'instantané
`setter_prime_amount` (§5.7).

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
`is_setter` sont donc supprimés (§5.5), et `weekCount` disparaît de la formule.

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

**LE TAUX DE COMMISSION EST DATÉ (tâche 27, 2026-07-28).** `compta_settings.rate` portait UN
taux, appliqué aux 14 jours de la période. La feuille de juillet le contredit : sur les **95
chatteurs portant du CA en semaine 1** de la période 06 → 19/07, **12 changent de taux entre les
deux semaines**, toujours à la hausse — Josaphat, JC, Ethane, Salemmontin 10 → 11 % ; kwasi,
Alain, Juliot 10,5 → 11 % ; Anja, Matisse, Ange, Big Jo, Patrick 10 → 10,5 %. (Les taux ne sont
pas écrits dans la feuille : ils sont déduits de `net_semaine / CA_semaine`, et les 95 colonnes
rendent toutes une valeur ronde — 10 / 10,5 / 11 %, jamais autre chose.)

Un taux unique ne peut pas être juste sur ces 12 fiches : appliquer l'ancien aux 14 jours
**sous-paie de 190,12 €**, appliquer le nouveau **sur-paie de 133,58 €**, sur 5 172,22 € dus.

**Le taux en vigueur un jour J = la ligne `compta_rates` la plus récente dont `effective_from
<= J`** (`rateSpans`, `packages/core/src/compta/rates.ts`). La date d'effet est **inclusive**.

**Avant la première ligne d'historique : `DEFAULT_RATE = 10 %`, et la fiche le DIT.** Ce n'est pas
un nombre neuf — c'est le défaut de la colonne `compta_settings.rate` (`0084`) que la compta
appliquait déjà à tout membre jamais réglé, et que l'onglet Compta annonce en toutes lettres. Ce
qui change, c'est qu'il ne se subit plus en silence : `RateSpan.fallback` marque chaque segment
qui en dépend, et la fiche de paie affiche « Taux jamais réglé pour ce membre — le défaut de
10 % s'applique ». **L'alternative écartée** — faire remonter la première ligne d'historique à
l'infini passé — supprimerait le repli mais rendrait sa date d'effet mensongère : l'admin qui
saisit « 11 % à partir du 13/07 » verrait juin repayé à 11 %. Un défaut affiché vaut mieux qu'une
date qui ne dit pas la vérité.

**La découpe préserve la règle d'arrondi, elle ne la change pas.** Le pourcentage est appliqué
(segment × modèle), arrondi là, puis sommé : un niveau de regroupement de plus, le même terme
élémentaire `round2(ca × taux / 100)`, le même total. Conséquence VÉRIFIÉE et non déduite : sur
les **83 fiches à taux constant**, le net calculé avec découpage est **identique au bit près** à
celui calculé sans — zéro régression. Et les 12 autres retombent sur la feuille avec le même
écart maximal que les 83 (**0,01 €**, dû au fait que la feuille ne borne pas ses décimales).
Total des 95 : feuille 18 801,68 €, app 18 801,66 €.

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

## 5. Modèle de données — migration unique `0085_compta_paie.sql`

**Un seul fichier.** La construction de la feature avait produit onze migrations
(`0085`→`0095`), appliquées sur l'UAT seulement, avec leurs allers-retours : un `mode` de
rémunération ajouté puis supprimé, `month` devenu `period_start`, une table
`compta_period_entries` créée puis droppée avec ses concepts, le taux déplacé de
`compta_settings.rate` vers `compta_rates`. La prod étant restée à `0084`, elle n'a pas à
rejouer cette histoire : le 2026-07-28 les onze fichiers ont été **fusionnés** en
`0085_compta_paie.sql`, qui amène une base à l'état `0084` directement à l'état final.

Méthode — celle de `0084` : DDL extrait des catalogues de l'UAT (qui EST l'état final), puis
vérifié par **rejeu complet** `0001`→`0084`→`0085` sur un Postgres 17 jetable, diff des
catalogues contre l'UAT **à vide** sur tout le périmètre (colonnes, contraintes, index,
policies `qual`/`with_check`, fonctions, triggers, contenu du barème). Sur l'UAT, `0086`→`0095`
sont marquées « reverted » (`supabase migration repair`) et `0085` reste enregistrée — le
numéro fait foi. Les numéros `0086`…`0095` cités dans ce document renvoient donc à l'histoire
de construction (lisible dans git), plus à des fichiers du dépôt.

Le fichier conserve les **traitements de données** que la prod attend, pas seulement le DDL :
purge des lignes de test (§5.1), conversions text→numeric (§5.2, §5.6), reprise du taux à la
date plancher (§5.10), amorce du barème (§5.6).

**5.1 Re-cléage sur `profiles`.** Suppression des lignes de test (relevé prod du 2026-07-27 :
2 primes, 1 saisie hebdo, réglages aux valeurs par défaut — clées sur `chatters`, donc
invalides après re-cléage), puis bascule des clés étrangères de `chatters(id)` vers
`profiles(id)` sur `compta_settings`, `compta_primes`, `compta_day_entries`,
`compta_week_entries`, `compta_payments`. Pourquoi : 338 chatteurs MyPuls actifs, 72 comptes
app — on paie les MEMBRES. La colonne garde son nom `chatter_id` : c'est déjà la convention de
`police_entries`, qui désigne un membre.

`compta_debts` n'a aucune clé étrangère et n'est PAS purgée : ses lignes sont réelles, elles
sont converties (§5.6).

**5.2 `compta_primes.amount` : `text` → `numeric(10,2)`.** Le défaut `'100 €'` devient `100`.
Calculer de l'argent en parsant une chaîne est une erreur silencieuse qui attend son jour.

**5.3 Instantané de paiement.** Colonnes ajoutées à `compta_payments` :

| Colonne | Type | Rôle |
|---|---|---|
| `ca_reference` | `numeric(10,2)` | CA ayant servi de base |
| `rates_applied` | `jsonb` | segments de taux appliqués (§5.10) |
| `base_amount` | `numeric(10,2)` | base calculée |
| `setter_amount` | `numeric(10,2)` | fixe de la période (réglage ou saisie hebdo) |
| `bonus_amount` | `numeric(10,2)` | bonus cumulés |
| `malus_amount` | `numeric(10,2)` | malus manuels |
| `handoffs_amount` | `numeric(10,2)` | handoffs × 0,60 |
| `prime_amount` | `numeric(10,2)` | prime éventuelle |
| `sanctions_amount` | `numeric(10,2)` | sanctions police |
| `setter_prime_amount` | `numeric(10,2)` | prime du classement setter, FIGÉE (§5.7) |

`amount` reste le **net versé**. Invariant, HUIT composantes :
`amount = base + setter + bonus − malus + handoffs + prime − sanctions + setterPrime`.
(La construction avait aussi connu `mode_applied`, `rate_applied`, `carryover_amount` et
`monthly_prime_amount` — partis avec leurs concepts, §5.5, §5.10, §5.11 ; le fichier fusionné
ne les crée jamais.)

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

**5.4 `period_start` : des périodes de 14 jours calées sur les lundis.** La feuille du
propriétaire paie des blocs de deux semaines pleines (S1 = 06→12/07, S2 = 13→19/07), pas des
quinzaines calendaires 1–15 / 16–fin. Une colonne `month` serait donc un mensonge — **trois
périodes peuvent démarrer dans le même mois**, et une période ne se rattache à aucun mois
(celle du 20/07/2026 finit le 02/08). Le fichier renomme `month` → `period_start` (l'index
suit) et **ajoute** `check (mod(period_start − date '2026-07-06', 14) = 0)` : l'alignement du
découpage devient une contrainte de données, pas seulement une convention applicative. Sans
lui, un paiement posé à la main sur une date décalée créerait des périodes qui se chevauchent,
et `covered_days` deviendrait incohérent en silence.

`compta_day_entries` (clée par date) et `compta_week_entries` (clée par lundi) sont déjà
indépendantes du découpage : seul leur regroupement change.

**Le trigger de non-chevauchement `compta_payment_no_overlap`** garde l'invariant « un jour ne
peut être payé qu'une fois par chatteur ». C'est le non-chevauchement des `covered_days` qui
est gardé, PAS l'unicité de la période : les paiements partiels sont un cas nominal (§3, §10).
Le `pg_advisory_xact_lock` par chatteur est ce qui rend la garde réellement **atomique** — un
simple `exists` en READ COMMITTED ne verrouille rien, deux insertions concurrentes le
passeraient toutes les deux. `security definer` : la fonction doit voir TOUS les paiements du
chatteur visé ; si l'écriture s'ouvrait un jour à l'encadrement, une vérification soumise à la
RLS deviendrait silencieusement partielle et un jour serait payé deux fois sans erreur. Elle ne
fait que lire et lever (`23505`, que `payFortnight` traduit en message métier) : rien à
détourner.

**5.5 Un seul mode de rémunération.** `compta_settings` se réduit au fixe : `mode` (et son
`check`) et `is_setter` sont supprimés. Le raisonnement et les mesures sont en §2 et §4.

`compta_settings.fixed_amount` **change de sens sans changer de type** : montant hebdomadaire du
mode fixe → fixe de la PÉRIODE, qui s'ajoute à la commission et s'applique dès qu'il est `> 0`.
Le sens vit dans un `comment on column`, pas dans un renommage : la colonne est vide, mais
renommer casserait les requêtes ad hoc écrites jusqu'ici sans rien apprendre de plus.

**5.6 Le socle du lot final.** Les lignes de la feuille que l'app ne savait pas porter.

| Objet | Forme | Pourquoi |
|---|---|---|
| `compta_setter_scale` | `rank smallint primary key`, `amount numeric(10,2)`, amorce = le barème de juin (200 → 80, Σ 1 796 €), `on conflict do nothing` | Barème réglable : une constante TypeScript aurait demandé un déploiement pour changer un chiffre |
| `compta_debts.amount` | `text` → `numeric(10,2)`, plus `settled_by` | Même raison que `compta_primes` (§5.2) : on ne calcule pas de l'argent en parsant une chaîne |
| `profiles.closing_role` | `check` élargi à `('setter','closer','nouveau','hybride')` | La légende de la feuille connaît quatre états (L96-98) |

La conversion de `compta_debts.amount` (valeurs prod : `'10$'`, `'43$'`) s'appuie sur le
`not null` de la colonne comme garde : une valeur que l'expression ne sait pas réduire à un
nombre donne `null`, donc la migration **échoue** au lieu de convertir de travers. La virgule
décimale est traduite avant le filtrage (sinon `'43,50 €'` deviendrait `4350`).

**5.7 La prime setter est FIGÉE au paiement** — `compta_payments.setter_prime_amount`,
`numeric(10,2) not null` **sans défaut** (doctrine du §5.3). Sans cette colonne, brancher la
prime setter aurait fait **échouer tout paiement** d'une fiche qui en porte une : `payslip.net`
l'incluait, tandis que le `superRefine` de `payInput` et les contrôles de dérive de `payPeriod`
ne la connaissaient pas. Elle est donc dans le contrat (`payInput`), le recalcul serveur
(`actions-pay.ts`) et l'écriture (`record-payment.ts`).

**Pourquoi figer la prime setter en particulier** : elle n'est stockée nulle part et se recalcule
à chaque rendu depuis le barème et les handoffs. Un handoff corrigé la semaine suivante, ou une
tranche du barème retouchée, changerait le rang — donc la prime — d'un membre **déjà payé**.
L'instantané rend le versement opposable, exactement comme `ca_reference` face à une
ré-ingestion MyPuls.

Aucune contrainte de somme en base : l'invariant reste vérifié côté application. Un `check` SQL
l'exprimant refuserait les paiements légitimes dès qu'un centime d'arrondi flottant s'y glisse —
la tolérance de 0,01 € vit dans le code.

**5.9 (retiré).** Un index unique partiel interdisait de saisir la prime du mois sur deux
périodes du même mois civil. Parti avec sa table et son concept (§5.11) — le fichier fusionné
ne le crée jamais ; sa conception vit dans l'historique git.

**5.10 Le taux de commission est DATÉ.** Le raisonnement métier est en §4 ; voici la forme.

```sql
create table public.compta_rates (
  chatter_id     uuid not null references public.profiles(id) on delete cascade,
  effective_from date not null,                 -- PREMIER jour au nouveau taux, INCLUSIF
  rate           numeric(5,2) not null check (rate >= 0),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null,
  primary key (chatter_id, effective_from)
);
```

**Une TABLE DÉDIÉE, et non une colonne `effective_from` sur `compta_settings`.** Cette dernière
porte aussi `fixed_amount`, qui n'est **pas** daté : c'est un montant par période, changé
rarement, sans historique de paie à reconstituer. Dater la ligne entière obligerait à recopier le
fixe à chaque changement de taux et rendrait ambigu « quel fixe s'applique ». Un grain de
variation par table.

**La PK est `(chatter_id, effective_from)`** : ré-enregistrer la même date **corrige** le taux de
ce jour-là au lieu d'empiler deux vérités. Une date saisie de travers se **supprime** depuis
l'écran (§7.1) — un upsert ne peut que réécrire la ligne de cette date, jamais la faire
disparaître.

**REPRISE DES RÉGLAGES EXISTANTS, à une date PLANCHER (`1970-01-01`)** — puis
`compta_settings.rate` est **supprimée**. Deux points, et les deux comptent :

- Sans reprise, tout taux déjà posé disparaîtrait et chaque membre retomberait à 10 %. Dans le
  fichier fusionné la reprise vient APRÈS la purge (§5.1), donc n'apporte rien en prod — elle
  est gardée parce que c'est le geste qui rend le `drop column` sûr quel que soit l'état de la
  table au moment du push.
- La date est un **plancher**, pas la date du jour : le taux actuel s'appliquait déjà à toutes
  les périodes passées, et le dater d'aujourd'hui ferait recalculer l'historique à 10 %.
- `compta_settings.rate` part parce que **deux sources d'un même nombre finissent par diverger** :
  c'est le défaut d'argent de la tâche 19 (`fixe_setter`) répété sur le taux.

**RLS — même régime que `compta_settings`**, recopié de `0085` après relecture de `pg_policy` :
lecture admin + encadrant sur ses rattachés, **écriture admin seule**. Mesuré sous RLS sur l'UAT
(transaction annulée, une ligne par chatteur) : Marco (sous-manager, 35 rattachés) voit **36
lignes, 0 hors périmètre** ; Chérif **15** ; un chatteur **0** — exactement comme
`compta_settings`. Une écriture tentée par Marco : `new row violates row-level security policy`.

**L'INSTANTANÉ DE PAIEMENT.** Un unique `rate_applied numeric(5,2)` ne pouvait porter qu'un
taux : sur une période à deux taux, quel que soit celui qu'on y range, la moitié de la fiche
est fausse. L'instantané est `rates_applied jsonb not null` — la segmentation réellement
appliquée, `[{from, to, rate, fallback}, …]`.

**Pourquoi du `jsonb` et non une table fille** : `recordPayment` écrit le paiement en UN insert.
Une table fille imposerait une seconde écriture, sans transaction possible depuis supabase-js —
le même trou que la trace `compta_primes` — et un paiement pourrait exister sans sa trace de
taux. Ici l'instantané reste **atomique** avec le paiement.

**Aucun `default`**, règle du §5.3 : un défaut rendrait la colonne optionnelle dans le type
`Insert` et un paiement l'omettant écrirait un instantané sans taux, en silence.

**La contrainte tolère `[]` quand il n'y a pas de CA** — correction trouvée en branchant le
paiement : exiger `jsonb_array_length >= 1` partout **bloquait un paiement légitime**, celui
d'un membre sans aucun CA mais qui touche une prime, un bonus ou un fixe (§10 — « les
bonus/primes restent dus »). `computePayslip` ne produit alors aucun segment : `[]` est la
réponse exacte. La contrainte est `jsonb_typeof = 'array' and (base_amount = 0 or
jsonb_array_length >= 1)` — ce qu'elle doit vraiment interdire, c'est une **commission versée
sans trace du taux qui l'a produite**.

Vérifié en transaction annulée sur l'UAT : deux lignes de taux à dates distinctes → acceptées ;
même date ré-enregistrée → 2 lignes, taux écrasé ; taux au 12/07 = 10, au 13/07 = 12 (date
d'effet inclusive) ; commission 100 € avec `rates_applied = '[]'` → `violates check constraint
compta_payments_rates_applied_check` ; prime seule (base 0) avec `'[]'` → acceptée ; instantané à
2 segments → accepté. `compta_payments` = 0 ligne sur l'UAT avant d'appliquer. La prod n'a pas
été ouverte.

**5.8 `CRM_ROLES` passe à quatre valeurs** (2026-07-28, aucune migration). `closer`, `setter`,
`hybride`, `nouveau` — la liste TypeScript rattrape le `check` élargi en base (§5.6). Trois points
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

**5.11 Le report et la prime du mois sont HORS de la base** — décision de Benoit du
2026-07-28 : le report (« RESTE SEMAINE PASSEE ») « ça existera pas, à part si on me le
demande », et la prime du mois n'a « pas de sens » saisie sur une période de deux semaines.
Leur table de saisie (`compta_period_entries`), l'index unique du §5.9 et les colonnes
d'instantané `carryover_amount` / `monthly_prime_amount` ont existé pendant la construction
(UAT) et ont été retirés le jour même — le fichier fusionné ne les crée jamais. La prime
setter reste intégralement (`compta_setter_scale`, `setter_prime_amount`).

---

## 6. Droits et cloisonnement

| Table | Admin | Manager / sous-manager | Chatteur |
|---|---|---|---|
| `compta_day_entries`, `compta_week_entries` | tout | lecture + écriture **sur ses rattachés** | — |
| `compta_settings` | tout | lecture sur ses rattachés | — |
| `compta_rates` | tout, **seul à écrire** | lecture sur ses rattachés | — |
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
erreur** — exactement le défaut corrigé sur les sanctions Police (ci-dessous).

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

Corrigé par une policy ADDITIONNELLE et CLOISONNÉE (`police_read_compta`, §5/0085) : un
porteur de `compta` lit les
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

**Depuis la tâche 24, la fiche porte la ligne « Prime setter — rang 6 (71 handoffs) »** — **le
rang est dans le libellé** : sans lui c'est un montant sans provenance, et c'est ce que le
chatteur voudra vérifier. Sur SA ligne, comme les autres composantes : le net doit s'additionner
exactement à partir de ce qui est affiché.

> Les deux autres lignes du lot final — « Report période précédente » et « Prime du mois
> (top 3) » — et la ligne de saisie **« Période entière »** qui les alimentait ont été RETIRÉES
> le 2026-07-28 (décision de Benoit, §5.11). La saisie de la fiche redevient
> purement hebdomadaire : Bonus, Malus, Handoffs.

**LA VENTILATION PAR MODÈLE DEVIENT UNE VENTILATION PAR TAUX, PUIS PAR MODÈLE (tâche 27).** La
colonne « Commission (10 %) » devient **fausse** dès que la période porte deux taux. Deux formes,
et une seule grille :

- **Un seul taux** (le cas courant, 83 fiches sur 95) : rendu **strictement inchangé** —
  en-tête « Commission (10 %) », les lignes-modèle, le total. Cet écran ne bouge pas.
- **Plusieurs taux** : un bloc par segment, dans l'ordre, chacun titré par ses dates et son taux
  (« du 6 au 12 juillet — 10 % ») avec son **sous-total**, puis le total général. L'en-tête de
  colonne redevient « Commission » tout court. **C'est la forme du document du propriétaire**,
  qui aligne S1 à 10 % et S2 à 11 % : le grain est celui qu'il lit déjà, et le détail somme au
  total à chaque niveau (ligne → sous-total → total), par construction (§4).

```
Modèle              CA        Commission
du 6 au 12 juillet — 10 %
  [Lana]        600,00 €          60,00 €
  [Mia]         400,00 €          40,00 €
  Sous-total  1 000,00 €         100,00 €
du 13 au 19 juillet — 11 %
  [Lana]      1 000,00 €         110,00 €
  Sous-total  1 000,00 €         110,00 €
Total         2 000,00 €         210,00 €
```

Un segment au **taux par défaut** porte la mention « (taux par défaut, jamais réglé) » dans son
titre ; sur une fiche à taux unique, la même information est une ligne d'avertissement sous le
total. Un taux de paie que personne n'a choisi ne doit pas être invisible.

**La colonne « Rémunération » de la table** rend `10 → 11 %` quand la période porte deux taux
(les dates complètes sont dans son `title`). Elle lit `payslip.segments`, donc ce qui a
**réellement** été appliqué au CA de cette période, jamais l'historique brut.

**Réglages (admin seul) — ILS ONT QUITTÉ CETTE PAGE le 2026-07-28 (tâche 25).** Un dialog à
**quatre champs et un seul bouton « Enregistrer »** : la **commission** en % et sa **date
d'effet** (« À partir du »), le **fixe par période** en € (il s'ajoute à la commission), et le
**montant** de la **prime** nouveau chatteur. Sans cet écran, `compta_settings` et `compta_primes` resteraient aux défauts
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
> d'`id`, et `compta_settings.chatter_id` comme `compta_rates.chatter_id` sont des FK vers
> `profiles.id` (0085). En attendant, ce sont les défauts qui s'appliquent — 10 %, aucun
> fixe, aucune prime décidée.

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

TROIS tables derrière un seul bouton depuis la tâche 27 (`compta_rates`, `compta_settings`,
`compta_primes`), donc trois Server Actions : l'écran **nomme** celle qui a échoué (« Taux : …
En revanche, le fixe et la prime ont bien été enregistrés. »). Un « Erreur » global laisserait
croire que rien n'a été écrit alors qu'une partie l'a été.

> **Le taux daté, dans cet onglet (tâche 27).** Le champ « Commission % » gagne un voisin,
> **« À partir du »**, et une phrase qui dit ce que la date fait : « Les jours d'avant cette date
> restent payés au taux précédent. Aujourd'hui : 10 %. » Sans elle, « À partir du » se lit comme
> une date de saisie et non comme une date d'**effet** — l'admin croirait que changer le taux
> repaie toute la période, ce qui était vrai avant cette tâche et ne l'est plus.
>
> **La date proposée par défaut est le LUNDI DE LA SEMAINE EN COURS**, et non celui de la
> période. C'est mesuré : sur la feuille de juillet (période 06 → 19/07), les 12 changements de
> taux prennent tous effet au **13/07**, c'est-à-dire au **second** lundi de la période. Le lundi
> de période aurait proposé le 06/07 et repayé la première semaine au nouveau taux — exactement
> le sur-paiement que cette tâche corrige, réintroduit par le défaut de l'écran. C'est aussi la
> plus petite rétroactivité qui garde les segments calés sur les semaines, le grain du document.
> Le champ reste libre : c'est une proposition, pas une contrainte. Elle est calculée **côté
> serveur** (`todayParis`) — un `new Date()` dans le composant dépendrait de l'horloge du poste,
> sur une date qui décide de la paie.
>
> **UN SEUL BOUTON conservé** (demande du propriétaire) : le taux n'est écrit **que s'il change
> réellement quelque chose**. Le garde est côté serveur (`writeRate` compare au taux en vigueur
> à cette date, `rateOn`), pas côté client. Sans lui, l'admin venu corriger le fixe déposerait
> une ligne d'historique de plus à chaque enregistrement — un journal de non-événements qui
> rendrait l'historique illisible en trois semaines. Le message de succès le dit : « Taux de
> 11 % enregistré à partir du 13/07/2026 » quand une ligne a été posée, « Réglages enregistrés »
> sinon.
>
> **L'historique est consultable dans l'onglet**, le plus récent en tête (« 11 % à partir du
> 13/07/2026 — en vigueur »), chaque ligne supprimable. Une augmentation passée est une
> **information de paie** : sans elle, l'admin qui rouvre la fiche voit « 11 % » sans savoir
> depuis quand, donc ne peut ni vérifier une fiche payée à deux taux, ni répondre à un chatteur
> qui la conteste. La suppression est le **remède à une date saisie de travers** — un upsert ne
> peut que réécrire la ligne de cette date, jamais la faire disparaître. Elle ne touche à aucun
> paiement déjà enregistré (ceux-là portent leur propre instantané, §5.10), et l'écran le dit.

**Chatteur non relié à MyPuls.** `profiles.chatter_id` est nullable : 30 profils chatteurs sur
102 ne sont pas reliés en prod. Sans lien, aucun CA n'est calculable. La ligne affiche un
avertissement explicite et un renvoi vers Membres — **jamais un 0 € silencieux**, qui ferait
passer un chatteur pour non rémunérable.

**Retard.** Le bandeau des périodes incomplètes se déduit de `covered_days` : toute période
échue dont un jour n'est couvert par aucun paiement remonte, quelle que soit la date.

### 7.2 Onglet Classement — LE MOIS, puis la période

**TROIS SECTIONS sous un seul sélecteur** (tâche 26). Le sélecteur de période est celui de
l'onglet Période, et il commande les deux grains.

**1. Récap du mois — `juillet 2026`.** Le bloc de fin de mois de la feuille : une ligne par
chatteur, **Chatteur · Total mois · Handoffs · Prime setter**, plus une ligne de total. C'est ce
qui manquait à l'app. (La colonne « Prime du mois » a été retirée le 2026-07-28 avec le concept —
décision de Benoit, §5.11.)

- **Le mois est le mois CIVIL** — un agrégat qui s'appelle « Total Mois » et se compare d'un mois
  sur l'autre n'a pas d'autre définition. Toute autre borne (« les deux dernières périodes »,
  « 28 jours glissants ») afficherait sous l'étiquette « juillet » un total qui n'est pas celui de
  juillet, sans que rien ne le dise.
- **Il se DÉDUIT de la période choisie** (mois de son lundi de départ) — pas de second sélecteur.
  Deux sélecteurs auraient créé deux notions de « quel mois ? » pouvant se contredire. Une seule
  règle, deux usages : l'affichage et l'agrégation.
- **CA** : `chatter_creator_daily` sur le mois civil, lu **par client admin cadré sur `linked`** —
  la RLS de cette table cloisonne par MODÈLE et amputerait le CA d'un manager en silence (§6).
- **Handoffs** : saisies au JOUR par leur date, saisies à la SEMAINE par le mois de leur **lundi**.
  Une semaine à cheval (29/06 → 05/07) compte donc pour JUIN **en entier** — la découper au
  prorata inventerait des handoffs par cinquièmes que personne n'a saisis, et ferait diverger ce
  total de celui des fiches.
- **Prime setter** : Σ des primes des **2 ou 3 périodes rattachées au mois**, pas un classement
  recalculé sur 30 jours — la prime setter EST une composante du net d'une période, et c'est elle
  qui est figée au paiement. Un classement mensuel produirait un chiffre que personne n'a versé.
- **Écart assumé et AFFICHÉ** : les deux premières colonnes couvrent le mois civil, la prime
  setter couvre les périodes du mois. Les jours ne coïncident donc pas exactement (la période du
  31/08 est d'août, mais 13 de ses jours sont en septembre). L'écran **nomme les périodes
  retenues** plutôt que de laisser deviner ; taire cet écart ferait passer un chiffre exact pour
  une erreur de calcul.
- Un membre sans lien MyPuls affiche **« non relié »** et jamais un 0 € (§7). Les membres sans
  aucune activité sont **comptés en une ligne** au lieu d'être listés à zéro — ni 96 lignes de
  zéros, ni une liste amputée en silence.
- La cinquième colonne du bloc de la feuille, **`PRIME D'EMBAUCHE`, reste dans Suivi** : elle ne
  dépend d'aucun mois. Une phrase l'y renvoie.

**2. Le classement setter de la période** — rang, chatteur, handoffs, prime — plus une ligne de
total (Σ des handoffs, Σ des primes : le barème est un budget dépensé une fois).

Un membre à **0 handoff n'y figure pas** : `rankSetters` ne le classe pas. Une prime à **0 €**
(au-delà de la dernière tranche) reste affichée, en gris — être classé sans rien toucher est un
résultat, et le voir explique pourquoi la fiche n'a pas de ligne « Prime setter ».

Le rang est **agence-wide** (§6) : la liste d'un encadrant a donc des trous. L'écran le dit en
une phrase, plutôt que de renuméroter de 1 à N — une numérotation par périmètre ne
correspondrait à aucune prime. Il rappelle aussi que le classement porte sur les **handoffs
saisis dans l'app**, le comptage qui fait foi n'étant pas tranché (§4).

**3. Le barème** est affiché dessous, pour TOUT l'encadrement — un manager qui ne le verrait pas
lirait la prime setter comme 0 € sans erreur (§6). **Éditable par l'admin seul** : quinze
tranches en trois colonnes, une tranche = un `<form>` = une écriture (la clé primaire est le
rang), enregistrement automatique. La phrase sous la grille dit ce qu'une modification fait :
elle s'applique aux périodes **non encore payées**, jamais à celles déjà réglées, dont le montant
est figé (`setter_prime_amount`, §5.7).

**L'ORDRE DES TROIS SECTIONS EST STRUCTUREL, pas décoratif.** Le classement et son barème forment
une paire — l'un se lit avec l'autre : s'intercaler entre eux les séparerait, et se poser après le
barème mettrait de la donnée sous un bloc de réglages. Le récap va donc en tête. **Pas de
quatrième onglet** : deux des trois colonnes du récap sont déjà le sujet de cet onglet, il n'y a
rien de plus à choisir que la période déjà sélectionnée, et le propriétaire en a demandé trois.

Côté chargement, le récap est un appel SÉPARÉ (`getMois`), monté **seulement** quand cet onglet
est demandé. Le fondre dans `getCompta` l'aurait fait payer à l'onglet Période — et surtout au
recalcul serveur de CHAQUE paiement, qui rejoue `loadComptaRows` fiche par fiche.

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
| Période à cheval sur deux mois | rattachée au mois de son lundi de départ, entièrement — jamais partagée |
| Sanction saisie après le paiement | non rattrapée automatiquement — elle apparaîtra sur la période de son `occurred_on`, qui sera signalée comme incomplète si non couverte |
| Deux profils pour un même chatteur MyPuls | impossible en prod (vérifié : maximum 1), pas de garde applicative |

---

## 11. Tests

Dans `packages/core`, sous Vitest :

**`months.ts`** (tâche 26) — les bornes du mois civil (février bissextile, décembre) ; le
rattachement d'une période **à cheval** sur deux mois puis sur deux années au mois de son lundi ;
`periodsOfMonth` sur juillet 2026 (2 périodes, celle qui contient le 1er ayant démarré en juin) et
août 2026 (3) ; `mondaysOfMonth` (4 ou 5, aucun d'un autre mois) et la démonstration qu'il n'est
**pas** l'union des lundis des périodes du mois. Et **le test de partition** : sur
24 mois, chaque période appartient à **exactement un** mois, aucune n'est revendiquée par deux,
aucun trou entre les débuts collectés. Cette partition gardait la garde anti-double versement de
la prime du mois ; depuis le retrait de celle-ci (§5.11), elle garde la cohérence du récap
mensuel (§7.2), qui déduit son mois de la période choisie.

**`periods.ts`** — l'ancre 06/07/2026 et ses voisins à 14 jours, un jour AVANT l'ancre (l'écart
négatif ne doit pas décaler d'une période), le balayage « toute période démarre un lundi », une
période à cheval sur deux mois puis sur deux années, `mondaysIn` toujours à 2 et `daysIn` toujours
à 14 sur un large balayage, une semaine jamais découpée, et `recentPeriods` sans trou ni
recouvrement.

**`payslip.ts`** — la commission modèle par modèle et son arrondi par ligne ; le **fixe**, qui
concentre les régressions d'argent de la feature : il s'ajoute à la commission (il ne la remplace
pas), et il vaut `compta_settings.fixed_amount` **tel quel** — ni retenu par un drapeau
(`is_setter`, retiré — §5.5), ni multiplié par le nombre de semaines, ni remplacé par une saisie hebdo
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
dans `computePayslip`, dans `rankSetters` puis dans `months.ts`, et le test correspondant est tombé
(détail dans les rapports de tâche 16, 19, 21-22 et 26 — 19 régressions couvrant chacun des tests
des trois fichiers). Un test qui ne tombe sur aucune régression est un test qui ne protège rien.

**Les tests qui survivent à ce qu'ils gardaient sont SUPPRIMÉS, pas conservés.** La tâche 19 a
retiré `fixeSetter` de `PayslipInput` : les quatre tests qui décrivaient son arbitrage sont
devenus soit impossibles à écrire (le champ n'existe plus), soit de simples redites de
`setter === fixedAmount`. Ils sont fondus en un seul, qui énumère les trois régressions
historiques. La forme de sortie, elle, est gardée par le `toEqual` complet du test « période
entièrement vide » : réintroduire `setterAdjusted` le fait tomber sur une clé en trop.

Pas de test côté `apps/web` : le harnais n'existe pas et le monter dépasse ce périmètre.
