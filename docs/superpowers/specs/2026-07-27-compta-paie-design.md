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
                     l'engrenage de la ligne, nulle part ailleurs
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

= Net à payer
```

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
`compta_settings.fixed_amount`, saisi derrière l'engrenage de la ligne, et de nulle part
ailleurs. La fiche l'affiche en ligne d'ajustement sous le libellé nu « Fixe setter ».

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

## 5. Modèle de données — migrations `0085` … `0089`

`0085` porte l'essentiel (les tables étant vides) ; `0086` ouvre la lecture cloisonnée des
sanctions (§6), `0087` interdit le chevauchement des jours couverts, `0088` bascule
`compta_payments` sur le découpage en 14 jours, `0089` supprime le mode de rémunération et le
statut de setter (§5.5).

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

`amount` reste le **net versé**. Invariant :
`amount = base + setter + bonus − malus + handoffs + prime − sanctions`.

`mode_applied` figurait ici jusqu'à la tâche 16 (`text check (mode_applied in
('percent','fixed'))`, mode au moment du paiement) : `0089` la supprime avec le mode lui-même —
une colonne `not null` qu'aucun code ne peut plus remplir.

**Aucune de ces colonnes n'a de valeur par défaut** (arbitré le 2026-07-27). Un `default 0` les
rendrait optionnelles dans le type `Insert` généré : un paiement omettant `sanctions_amount`
compilerait et écrirait 0 €, faisant disparaître une retenue sans bruit. Sans défaut, le
compilateur exige les huit composantes à chaque enregistrement — l'invariant ci-dessus devient
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

---

## 7. Écrans

Route unique : `/chatter/compta`.

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
compte de handoffs. Sous la fiche : la saisie hebdomadaire — **bonus, malus, handoffs**, une
ligne par semaine, et rien d'autre : le fixe est un montant par période, il n'a pas de champ ici
(tâche 19, cf. §4) — et pour un admin le bouton **Marquer payé** qui fige l'instantané et
enregistre `covered_days`.

**Réglages (admin seul).** Derrière l'**engrenage** de la ligne, un dialog à **trois champs et un
seul bouton « Enregistrer »** (tâche 16) : la **commission** en %, le **fixe par période** en €
(il s'ajoute à la commission), et la **prime** nouveau chatteur (montant, à verser ou renoncée).
Sans cet écran, `compta_settings` et `compta_primes` resteraient aux défauts de leurs colonnes
pour tout le monde, modifiables en SQL seulement, et la prime « manuelle » de la §2 ne pourrait
pas être créée. Une prime déjà versée s'affiche en lecture seule : son statut est la trace du
virement.

Deux tables derrière un seul bouton, donc deux Server Actions : l'écran **nomme** celle qui a
échoué (« Taux et fixe enregistrés, mais PAS la prime : … »). Un « Erreur » global laisserait
croire que rien n'a été écrit alors que la moitié l'a été.

**Chatteur non relié à MyPuls.** `profiles.chatter_id` est nullable : 30 profils chatteurs sur
102 ne sont pas reliés en prod. Sans lien, aucun CA n'est calculable. La ligne affiche un
avertissement explicite et un renvoi vers Membres — **jamais un 0 € silencieux**, qui ferait
passer un chatteur pour non rémunérable.

**Retard.** Le bandeau des périodes incomplètes se déduit de `covered_days` : toute période
échue dont un jour n'est couvert par aucun paiement remonte, quelle que soit la date.

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

Ces tests sont **vérifiés discriminants** : chaque régression a été réintroduite une par une
dans `computePayslip`, et le test correspondant est tombé (détail dans les rapports de tâche 16
et 19). Un test qui ne tombe sur aucune régression est un test qui ne protège rien.

**Les tests qui survivent à ce qu'ils gardaient sont SUPPRIMÉS, pas conservés.** La tâche 19 a
retiré `fixeSetter` de `PayslipInput` : les quatre tests qui décrivaient son arbitrage sont
devenus soit impossibles à écrire (le champ n'existe plus), soit de simples redites de
`setter === fixedAmount`. Ils sont fondus en un seul, qui énumère les trois régressions
historiques. La forme de sortie, elle, est gardée par le `toEqual` complet du test « période
entièrement vide » : réintroduire `setterAdjusted` le fait tomber sur une clé en trop.

Pas de test côté `apps/web` : le harnais n'existe pas et le monter dépasse ce périmètre.
