# Dettes ouvertes — glagencyapp

Regroupe ce qui est mesuré, assumé et **pas corrigé**. Aucun de ces points n'est un bug à
traiter spontanément : ils se ressortent quand le symptôme remonte.

**1. Une modèle sans `team_id` rend ses chatteurs invisibles** (mesuré le 2026-09-05,
toujours ouvert). `chatter_creators` n'est alimentée QUE par le scrape money-team, indexé par
équipe → Juliette et Elsa (ajoutées à la main) n'ont **aucune** ligne d'assignation, jamais.
Cumulé au `profile_id` null de leurs `chatters`, le filtre du Relevé d'équipe échoue des deux
côtés : **47 chatteurs sur 132** sont invisibles pour *tout* encadrant borné. Silencieux —
l'écran s'affiche, simplement amputé ; un admin ne le voit jamais (scope `null`). Benoit a
préféré décloisonner le Suivi chatters plutôt que réparer les données. Réparations possibles :
rattacher les `chatters` orphelines depuis `/chatter/presence/reglages`, ou écrire des lignes
`chatter_creators` à la main. **Volet Insights corrigé le 2026-09-24** (`0173`, équipe + quotas
de base automatiques par trigger, cf. AGENTS.md « Équipes et quotas ») — le volet Relevé
d'équipe, lui, reste ouvert.

**2. Flux Membres : les erreurs GoTrue sortent en « Erreur inattendue »** (audit du
2026-07-19, 12 findings confirmés, **aucun fix appliqué**). Cause du ticket d'origine :
`createMember` jette `email_exists` telle quelle au lieu d'une `BusinessError` → `runAction`
la classe technique. Un manager qui recrée un membre existant lit un message générique. Les
autres findings : compensation absente après `createUser`, `deleteUser` best-effort ignoré,
SELECT pages ignoré dans `updateMember`, detach post-démotion non rejouable, erreurs DB
déguisées en « Profil introuvable ».

**3. Essais à vie ⇄ classement hebdo : conflit non tranché.** Le plafond de 3 essais par
exercice (Release 2.53, `0161`) compte **à vie**, alors que `training_weekly_ranking` somme
le meilleur score par exercice **noté dans la semaine** : un chatteur à court d'essais ne
marque plus de points, donc le classement et la roue n° 1 (top 3 hebdo) se vident au fil des
semaines. À trancher avec Benoit — essais par semaine, ou autre règle de points. Voir
`ia-formation-couts.md`.

**4. Dérive de schéma : des colonnes n'existent qu'en base.** `planning_blocks.categories` et
`.days` ont été ajoutées **en SQL direct sur prod ET UAT, sans fichier de migration** (choix
assumé de Benoit) → un rebuild `db push` from-scratch ne les crée pas. Colonnes devenues
mortes mais conservées : `plannings.badge`, `priority_*`, `pause_note`, `annexes`,
`annex_note`. Côté compta : `compta_debts` n'a aucune FK (name/model en texte libre), et
`chatter_first_seen()` est `security invoker` sur une table admin-only → appelée par un
manager elle rend **0 ligne sans erreur** (d'où le client admin cadré).

**5. `snap_codes` : la lecture par l'API reste ouverte** à tout porteur de la page (RLS
`snap_codes_read`, `0063`/`0091`) alors que l'écran ne montre que ses modèles. Une migration
bornant la policy par `profile_creators` le fermerait — décision laissée à Benoit.

**6. Deux débriefs mal datés en prod, jamais recalés** (Dorian `2026-09-08` → `09-07`,
Marcus chat `2026-09-03` → `09-02`). Proposé le 2026-09-08, sans réponse : c'est un journal
personnel, **ne pas y toucher sans son accord**.

**7. Pagination serveur — faite pour les spenders seulement.** `crm_spenders_page` +
`crm_spenders_kpis_json` (`0104`) ont ramené le chemin complet de 6,5 s à 99 ms de moyenne
(mesuré en prod, zéro timeout depuis). Les autres historiques sans borne (rapports police,
membres) restent en `fetchAll`. Ne pas lancer ce chantier spontanément : le rappeler quand
Benoit se plaint de lenteur sur une grosse table. Hors scope définitif : les dashboards
agrégés, qui rendent déjà un petit JSON.

**8. Le même piège de « jour civil » vit encore ailleurs** que la To-Do (corrigée par
`serviceDayParis()`, cf. `AGENTS.md`) : comptes rendus du jour des chatters
(`features/reports/actions.ts`), défaut de date du Rapport du soir Police, défaut du bilan
1:1, et le dénominateur « attendu » du Récap qui compte le jour civil dès 00:00. À proposer
seulement si quelqu'un remonte le symptôme.

**9. 10 chatteurs ont des stats mais sont absents du relevé MyPuls** (2026-09-24) : leur présence
  Insights affiche « — » (pas de verdict). Rattachement à faire dans Relevé d'équipe › Réglages
  (gens à rattacher). Calibrage de la présence, lui, tranché : idle 10 min, cf. `AGENTS.md`.
