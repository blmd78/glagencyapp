# Compta — protocole de test manuel (preview UAT)

`apps/web` n'a **aucun harnais de test** et l'extension navigateur n'est pas connectée : le
chemin `clic → Server Action → insert` **n'a jamais été exécuté**. Tout ce qui suit a été
vérifié en SQL, en TypeScript et par relecture — jamais par un clic.

**Préprod uniquement.** Migrations `0085`, `0086`, `0087` appliquées sur l'UAT ; la production
est restée à `0084` et ne doit pas bouger avant que ce protocole soit passé.

Rôles utiles sur l'UAT : **admin** (Axel, Dorian) · **sous-manager** Chérif (15 rattachés,
3 modèles) et Marco (35 rattachés). Les tables `compta_*` et `police_entries` sont **vides**.

---

## 0 — Amorçage (une seule ligne de SQL)

Tout le reste se règle désormais **par l'écran** (c'est la tâche 11). Seule une sanction Police
doit être posée en base, la compta ne faisant que la lire :

```sql
insert into police_entries (chatter_id, occurred_on, kind, error_key, amount_eur)
select id, '2026-07-08', 'malus', 'reactivite', 15 from profiles where display_name = 'Giovani';
```

---

## 1 — En **admin**

| # | Action | Attendu |
|---|---|---|
| 1.1 | Ouvrir `/chatter/compta` | La page charge, le sélecteur propose 12 quinzaines, la plus récente en tête |
| 1.2 | Noter le bandeau de retard | 3 quinzaines (juillet P1, juin P2, juin P1). **S'il en affiche 6, c'est le plafond saturé → régression** |
| 1.3 | Choisir **01–15 juillet 2026**, déplier **Giovani**, régler **12,5 %** + cocher **setter** | La fiche bascule sur `1 527,27 € × 12,5 %` = **190,91 €**. **Si tu lis 97,54 € ou 10 %, la correction du CA a régressé** |
| 1.4 | Vérifier le bloc Sanctions | `08/07 — Réponse > 45 s par sub : −15 €`, et `−15 €` retranché du net |
| 1.5 | Régler un autre chatteur en **mode fixe**, 200 €/semaine | `Fixe hebdomadaire — 200,00 € × 2 semaines` = 400 €, le CA affiché mais **hors base**. ⚠️ **Premier passage jamais exécuté de cette branche du calcul** |
| 1.6 | Sur Giovani, saisir semaine du 06/07 : bonus 50, malus 20, handoffs 7 | Le panneau se rafraîchit **seul** (sans F5) et le net bouge de `+50 −20 +4,20` |
| 1.7 | Vérifier le champ **« Fixe setter € »** | Présent sur Giovani (setter), **absent** sur les autres |
| 1.8 | Créer une **prime** de 100 € sur Giovani | Elle apparaît sur la quinzaine **affichée**, pas sur une vieille |
| 1.9 | Cliquer **Marquer payé** | Le titre du dialog affiche **exactement** le net de la fiche. Le bouton dit « Marquer payé », **pas « Supprimer »**, et n'est pas rouge |
| 1.10 | Vérifier en SQL (voir §4) | `amount = base + setter + bonus − malus + handoffs + prime − sanctions`, `covered_days` = 15 dates, `paid_at` = aujourd'hui heure de Paris |
| 1.11 | Recharger, re-tenter le même paiement | « Un paiement couvre déjà au moins un jour de cette quinzaine pour ce chatteur. » (trigger `0087`) |
| 1.12 | Aller sur la quinzaine **en cours** (16–31/07) | **Aucun** bouton « Marquer payé » |

## 2 — En **sous-manager** (Chérif — a `compta`, **pas** `police`)

| # | Action | Attendu |
|---|---|---|
| 2.1 | Ouvrir `/chatter/compta` | Il ne voit **que ses 15 rattachés** |
| 2.2 | Déplier Giovani, **regarder le CA** | **1 527,27 €**. C'est le test décisif : avant correction il lisait 97,54 € (6 %) **sans aucune erreur** |
| 2.3 | Vérifier la sanction de 15 € | Visible — c'est ce que `0086` apporte. **S'il voit 0 €, la policy ne fonctionne pas** |
| 2.4 | Regarder ce qu'il peut faire | Formulaires de **saisie** oui · bouton **Marquer payé** non · formulaire de **réglages** non |
| 2.5 | Forcer une saisie sur un chatteur **qui n'est pas le sien** (devtools) | « Ce chatteur n'est pas dans ton périmètre. » |

## 3 — Cas limites

| # | Action | Attendu |
|---|---|---|
| 3.1 | Déplier un membre **sans lien MyPuls** (8 sur l'UAT) | L'avertissement « Aucun chatteur MyPuls relié… », **ni fiche, ni saisie, ni bouton** |
| 3.2 | **Onglet périmé** — ouvrir la compta en admin, saisir un malus de 200 € depuis un autre navigateur en manager, revenir **sans recharger** et payer | « Le montant ne correspond plus… recharge la page ». **Si le paiement passe, le recalcul serveur a régressé** — c'est le test le plus important de la liste |
| 3.3 | Après le paiement, modifier une valeur de `chatter_creator_daily` en SQL | « Net à payer » bouge · « Payé le X — Y € » reste **figé**. C'est tout le sens de l'instantané |
| 3.4 | Rouvrir Giovani après paiement et saisir un malus de 30 € | La saisie est acceptée mais **jamais rattrapée** — comportement connu, pas un bug (spec §10) |

## 4 — Contrôle SQL après le paiement

```sql
select amount, base_amount, setter_amount, bonus_amount, malus_amount,
       handoffs_amount, prime_amount, sanctions_amount, paid_at,
       array_length(covered_days, 1) as jours
  from compta_payments;
```

## 5 — Non-régression hors compta

Le CA de la compta passe par un **client admin cadré côté application**, pas par une policy —
justement pour ne rien changer ailleurs. Vérifié en SQL (`chatters_report` rend les mêmes
35 lignes / 20 230,60 € sous la RLS de Chérif), **à confirmer à l'œil** :

- `/chatter/chatteurs`, `/chatter/dashboard`, `/chatter/sante`, `/marketing/modeles` en Chérif
  → chiffres **identiques** à avant la branche.

---

## Ce que ce protocole ne couvre pas

- Le **paiement partiel** : la base l'autorise (trigger `0087` vérifié), aucun chemin d'interface
  ne le déclenche. Machinerie prête, non exerçable.
- Les **avertissements Police** (0 €) entrent dans la somme des sanctions alors que la spec §4
  dit `kind = 'malus'`. Sans effet : une contrainte impose `warning ⇒ amount_eur = 0`.
- Le bandeau de retard est plafonné à **12 quinzaines** en arrière ; la spec §7 promet « quelle
  que soit la date ».
