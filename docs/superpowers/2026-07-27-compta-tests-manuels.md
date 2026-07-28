# Compta — protocole de test manuel (préprod UAT)

`apps/web` n'a **aucun harnais de test** : le chemin `clic → Server Action → écriture` n'a
**jamais été exécuté** — tout a été vérifié en SQL, en tests unitaires et par relecture, jamais
par un clic. Ce protocole est le dernier verrou avant la production.

**Préprod uniquement.** La base UAT est à la migration `0085_compta_paie` ; la production est
restée à `0084` et ne bouge pas avant la fin de ce protocole.

Rôles utiles : **admin** (toi) · **sous-manager** Chérif (15 rattachés, 3 modèles assignés) ·
Marco (35 rattachés). Les tables compta sont quasi vides — tout l'amorçage se fait **par
l'écran**, sauf une sanction Police :

```sql
insert into police_entries (chatter_id, occurred_on, kind, error_key, amount_eur)
select id, '2026-07-08', 'malus', 'reactivite', 15 from profiles where display_name = 'Giovani';
```

---

## 1 — Onglet Période (admin)

| # | Action | Attendu |
|---|---|---|
| 1.1 | Ouvrir `/chatter/compta` | Table de tous les membres chatteur, sélecteur « du 6 au 19 juillet 2026 » en tête, bouton « N non reliés » près de la recherche |
| 1.2 | Ouvrir la fiche membre de Giovani (clic colonne Rémunération) → onglet **Compta** → taux **12,5 %** à partir du **06/07** → Enregistrer | Retour compta : sa ligne affiche `12,5 %`, sa fiche `1 527,27 € × 12,5 %` = **190,91 €**. Si tu lis ~97 € : la lecture admin du CA a régressé |
| 1.3 | Même fiche : changer le taux à **13 %** à partir du **13/07** | La fiche dépliée montre **deux blocs datés** — « du 6 au 12 — 12,5 % » puis « du 13 au 19 — 13 % » — dont les sous-totaux somment exactement au total |
| 1.4 | Vérifier le bloc Sanctions de Giovani | `08/07 — Réponse > 45 s par sub : −15,00 €`, retranché du net |
| 1.5 | Déplier Giovani → saisir bonus 50, malus 20, handoffs 7, puis **quitter la ligne** (Tab ou clic ailleurs) | « Enregistrement… » puis « Enregistré » **sans bouton ni F5** ; le net bouge de `+50 −20 +4,20` |
| 1.6 | Taper une valeur puis rester dans la ligne | « Non enregistré » reste affiché — rien ne part tant qu'on n'a pas quitté la ligne |
| 1.7 | Un membre **non relié** (bouton « N non reliés ») | Avertissement + bouton « Relier à MyPuls » → le dialog liste les chatteurs MyPuls libres, recherche comprise |
| 1.8 | Cliquer **« Payer la période — X € »** (période échue du 6 au 19/07) | Le dialog annonce le nombre de fiches, le total exact et ce qui est mis de côté (déjà réglés / non reliés / net nul / net négatif). Confirmer |
| 1.9 | Contrôle SQL après | `select amount, base_amount, rates_applied, covered_days from compta_payments limit 3;` — `rates_applied` liste les segments de taux, `covered_days` = 14 dates |
| 1.10 | Re-payer la même période | Refus : « Un paiement couvre déjà au moins un jour… » (trigger de non-chevauchement) |
| 1.11 | Sur la période **en cours** | Pas de bouton — la phrase « le paiement s'ouvre à partir du … » à la place |
| 1.12 | **Onglet périmé** : compta ouverte en admin, saisir un malus 200 € en manager dans un autre navigateur, revenir SANS recharger, payer | Refus « Le montant ne correspond plus… recharge la page ». **Le test le plus important : si le paiement passe, le recalcul serveur a régressé** |
| 1.13 | Après paiement : modifier une valeur de `chatter_creator_daily` en SQL | « Net à payer » bouge, « Payé le X — Y € » reste **figé**. C'est l'instantané |

## 2 — Onglets Classement et Suivi (admin)

| # | Action | Attendu |
|---|---|---|
| 2.1 | Onglet **Classement** | Récap du mois (Chatteur · Total mois · Handoffs · Prime setter), puis le classement setter de la période, puis le barème |
| 2.2 | Saisir des handoffs sur 2-3 chatteurs (onglet Période), revenir | Le classement les ordonne, chaque rang porte le montant du barème ; les ex æquo partagent (tranches mises en commun puis divisées) |
| 2.3 | Modifier une tranche du barème (champ direct, sans bouton) | Enregistrée seule ; la prime des fiches suit |
| 2.4 | Onglet **Suivi** | Primes d'embauche **échues non versées**, plus ancienne d'abord, avec la date d'éligibilité (arrivée + 1 mois) ; en dessous les soldes des partants |
| 2.5 | Ajouter un solde (nom, modèle, montant), le marquer **Soldé** | La ligne bascule ; Rouvrir la ramène |

## 3 — En sous-manager (Chérif — a `compta`, pas `police`)

| # | Action | Attendu |
|---|---|---|
| 3.1 | `/chatter/compta` | **Ses 15 rattachés seulement** |
| 3.2 | CA de Giovani | Le CA **complet** (~1 527 €), pas ~97 € — c'est le test décisif de la lecture cadrée |
| 3.3 | La sanction de 15 € | **Visible** malgré l'absence du droit Police |
| 3.4 | Ce qu'il peut faire | Saisies oui · Payer non · onglet Compta de la fiche membre non · barème en lecture seule |
| 3.5 | Classement | Les rangs **sautent des numéros** (classement agence-wide, il ne voit que les siens) — c'est voulu |

## 4 — Régression hors compta (5 minutes)

- **Toute l'app affiche les centimes** : dashboard, insights, santé, bilan, tracker — plus aucun montant arrondi à l'unité. Vérifie qu'aucun écran ne déborde (axes de graphiques notamment).
- **Tracker Chatteurs** : la colonne Com. a disparu, les sous-lignes par modèle restent alignées.
- **Membres** : créer et modifier un membre **non chatteur** = strictement comme avant (pas d'onglet) ; un manager ne voit jamais l'onglet Compta.
- **Chatteurs / Overview / Santé / Modèles en Chérif** : chiffres identiques à avant (au format près) — la lecture compta ne devait rien élargir.

---

## Hors périmètre, connu

- Le paiement **partiel** : la base l'autorise, aucune interface ne le déclenche.
- Les chatteurs MyPuls **sans profil** (69 actifs, ~60 k€/quinzaine) restent invisibles : créer les membres puis les relier.
- L'attribution du CA est celle de MyPuls (`brute_force` à 98,8 %) — l'app la copie fidèlement, vérifié au centime sur 14 jours.
