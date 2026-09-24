# Coût de l'IA de la Formation — glagencyapp

Mesures et décisions sur le coût de `/formation/ia` (page admin-only). À relire **avant** de proposer une optimisation : plusieurs réflexes naturels se sont révélés faux à la mesure. Coûts calculés depuis les tokens aux tarifs officiels (Haiku 4.5 : 1 $/5 $ · Sonnet 5 : 2 $/10 $ · lecture cache 0,1× · écriture cache 1 h 2×), pas relevés sur facture — les ratios avant/après restent valables.

**Avant de crier au bug sur cette page** : vérifier la base (l'UAT n'a que 29 appels, tous d'août — elle affiche 0 sur une période de septembre) et la période sélectionnée.

## Décision en vigueur — Sonnet 5 en fan (validée le 2026-09-24)

Bascule codée pour le **lundi 28/09 00h00 Paris** : `trainingFanModels` dans `lib/ai/client.ts`, Haiku en repli ; le recrutement n'est **pas** basculé. Coût fan projeté ~550 → ~410 $/mois.

Banc de rejeu : 575 tours (55 conversations solo / vente / défi / boss / perdues) pour régler le prompt, puis 373 tours **neufs** (38 conversations) pour vérifier, juge Opus 5.5 à l'aveugle (~13,6 $ en tout). Leçons :

1. **Sans garde-fou, Sonnet rompt 5× plus que Haiku**, presque toujours à tort → règle « le token est RARISSIME, 3 vérifications ».
2. **Le tokenizer de Sonnet 5 compte ~35 % de tokens en plus** pour le même texte, et chaque conversation payait l'écriture cache de tout son prompt → avec les garde-fous seuls, l'économie tombait à −10 %.
3. **Layout en 2 blocs** : partie FIXE (~1 700-2 100 tokens) en cache 1 h partagé par toutes les conversations, personnage à la fin → −25 %.
4. Mettre le personnage en fin **durcit** Sonnet (ruptures ↑) → la règle anti-rupture est placée **après** le personnage.

Holdout : fidélité au brief Sonnet 194 / Haiku 120 / égal 59 ; difficulté 134 / 123 / 116 (parité) ; ruptures au même rythme (9 contre 8,5 sur 948 tours), jugées fausses 6 fois chez Sonnet contre 13 chez Haiku ; balises média 1-3 contre 4-6 ; latence médiane 2,7 s contre 1,4 s, p99 < 7 s (timeout de 8 s conservé).

**À re-mesurer deux semaines après la bascule** : note moyenne, taux de rupture, coût par session, latence.

## Ce que coûte quoi

Semaine du 15 au 21/09 : deux charges, toutes deux génératives.

- **`fan`** (Haiku) — 59 692 appels, 122,2 M tokens d'entrée, 3,22 M de sortie, **61 % du coût**. Le fan est à **88 % d'entrée** : ~2 048 tokens par appel pour ~54 écrits, soit le même contexte relu 12 fois par session.
- **`score`** (juge, Sonnet) — 6 452 appels, 24,5 M d'entrée, **39 %**.
- **Aucune charge de classification n'existe** : un classifieur type Jev (TypeSafe) n'aurait rien à reprendre — ne pas le reproposer.

## Le cache

- **Le seuil de cache n'est pas monotone entre générations** : 4 096 tokens sur Haiku 4.5, 1 024 sur Sonnet 5. Changer de modèle active ou éteint le cache sans rien changer d'autre, et **l'API ne signale rien** — un prompt trop court n'est simplement jamais caché.
- Sur Haiku, le fan n'atteignait jamais le seuil : entrée médiane 1 458 tokens au tour 1, +~98 par tour, 3 420 au tour 20 → cache actif sur **1,7 %** des appels. Le marqueur `cache_control` est posé (`lib/ai/fan.ts`), il n'y avait rien à coder. D'où la bascule sur Sonnet ci-dessus.
- **Le cache de la notation fonctionne** (prompt de 1 511 tokens, au-dessus du seuil de Sonnet 5 ; ~60 % des appels). Passer le juge sur Haiku éteindrait ce cache mais coûterait quand même moins (129,92 $ contre 221,45 $ mesurés) : ce choix se joue sur la **qualité de notation** — cas limites autour de 60, le seuil qui débloque le boss et les tours de roue — pas sur le prix.

## Le juge : bruit faible (mesuré le 2026-09-23)

20 threads solo réels, renotés 5 fois chacun par le code de prod (`scoreSystemPrompt` + `formatTranscript` + `scoreThread`, rien écrit), 1,12 $ : **σ = 2,9 points**, écart max−min moyen 6,1 (pire 13), objectif qui bascule sur 3 threads sur 20. Le bruit n'explique que **15 à 22 %** des 21 à 38 points d'écart entre tentatives : le reste est réel. Moyenner 2 notations doublerait le coût de la notation pour presque rien → **ne pas le faire**. Non mesuré : défi et boss.

## Les rejeux et le plafond de 3 essais

- **Les points comptent DÉJÀ le meilleur total par cas** : `training_weekly_ranking` fait `max(total) group by profile_id, case_id` puis `sum(best_total)`, `training_profile_stats` pareil (`0113:1137`). Rejouer ne fait pas monter la meilleure note (1 essai → 68,1 de moyenne ; 2 → 66,3 ; 7+ → 64,5 : ce sont les gens qui ratent qui rejouent). Ce qui fait les points, c'est **couvrir plus de cas** (84 au total). **Il n'y a pas de correction de règle à faire.**
- Les 17 plus gros joueurs (400+ sessions, tous à 84/84) **ne trichent pas** : ce sont les plus assidus. Les prévenir avant toute nouvelle limite.
- **Plafond de 3 essais par exercice** (Release 2.53, `0161`, déployé le 14/09), mesuré du 01-13/09 au 15-21/09 : coût/jour **−17,8 %** (37,67 → 30,95 $), sessions/jour −35 %, mais tours par session **+29 %** et coût par session **+26 %** — contraints en nombre, les chatteurs soignent chaque tentative. **La projection à −53 % est démentie, ne plus la citer.** ~200 $/mois économisés, pas ~600. Sept jours seulement : à re-mesurer fin septembre.
- Le plafond compte **à vie** alors que le classement est hebdomadaire : conflit ouvert, cf. `dettes-ouvertes.md` § 3.
