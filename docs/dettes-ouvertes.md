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
de base automatiques par trigger, cf. `ARCHITECTURE.md` § « Équipes et quotas ») — le volet Relevé
d'équipe, lui, reste ouvert.

**2. Flux Membres : les erreurs GoTrue sortent en « Erreur inattendue »** (audit du
2026-07-19, 12 findings confirmés ; **résolue en partie le 2026-07-20**). Cause du ticket
d'origine **corrigée** : `createMember` lève une `BusinessError` (avec `fieldErrors`) sur
`error.code === 'email_exists'` (`apps/web/src/features/members/actions.ts:106-110`, commit
`405d2f6e`) ; les autres échecs de `createUser` restent techniques, voulu. **Restent ouverts**
(relus dans le code le 2026-10-01) : compensation limitée au patch du profil
(`actions.ts:159-165` — ni le lien chatteur, ni le rôle, ni `syncAssignments` n'en ont) et
`deleteUser` best-effort au résultat ignoré (`actions.ts:163`) ; SELECT de la cible ignoré dans
`requireEditableTarget` (`authz.ts:157`), d'où une erreur DB déguisée en « Profil introuvable »
(`authz.ts:158`) ; detach post-démotion non rejouable (`actions.ts:298-318` : le rôle est déjà
écrit à la première tentative, une relance ne repasse plus dans ce bloc).

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
`serviceDayParis()`, défini dans `packages/core/src/tracking/shifts.ts:89`) : comptes rendus du jour des chatters
(`features/reports/actions.ts`), défaut de date du Rapport du soir Police, défaut du bilan
1:1, et le dénominateur « attendu » du Récap qui compte le jour civil dès 00:00. À proposer
seulement si quelqu'un remonte le symptôme.

**9. 10 chatteurs ont des stats mais sont absents du relevé MyPuls** (2026-09-24) : leur présence
  Insights affiche « — » (pas de verdict). Rattachement à faire dans Relevé d'équipe › Réglages
  (gens à rattacher). Calibrage de la présence, lui, tranché : idle 10 min, cf. `ARCHITECTURE.md` § 10 (« Présence des Insights »).

**10. `notion_connection.root_page_id` conservée, inutilisée** (2026-10-08) : la page racine de
l'import de scripts a disparu avec `0188` (une ligne par espace Notion, toutes les pages partagées
listées), mais la colonne reste pour que `0188` soit compatible avec le code déjà déployé, qui la
lisait. À supprimer par une migration de nettoyage (`alter table public.notion_connection drop column
root_page_id;`) une fois la release de l'import de scripts passée en prod, puis régénérer `types.ts`.

**11. Réponse coupée à ~60 s, contournée pour « Préparer » seulement** (2026-10-08) : en test réel sur
la préprod, le navigateur a perdu la réponse de `prepareImport` à 60,16 s (statut réseau 0) pendant que
le serveur finissait en 63 s avec un 200 — cause non établie (ni Next 16.2.12 ni la fonction Vercel,
`maxDuration` 800, n'ont de limite à 60 s ; la capture réseau de l'outil de test était active). Contourné
pour « Préparer » (`waitPrepared` relit la clé du clic). L'envoi (`sendImport`, 10,6 s mesurés pour
77 messages, plus long avec beaucoup de médias à relire) n'a pas ce filet : coupé, il affiche « Envoi
coupé — le rapport dit où il en est » et le serveur va au bout (statut relu au rafraîchissement). À
reprendre si une coupure d'envoi est observée : même relecture, sur le statut de l'import.

**12. Connexion Notion privée d'une personne partie, invisible de tous** (2026-10-12, `0192`) : un espace
connecté par un manager n'est visible que par lui. S'il quitte l'agence (`left_at`), perd son rôle
d'encadrant, ou si son profil est supprimé (`connected_by` passe à null), sa ligne `notion_connection`
reste en base — clé chiffrée vers son Notion perso, utilisable par le service role — sans que personne ne
la voie ni ne puisse la déconnecter depuis l'écran (un admin en a le droit, `canDisconnect`, mais elle
n'apparaît pas dans sa liste). Aucun chemin de l'appli ne s'en sert (les connexions utilisées sont
toujours celles visibles de l'appelant). À faire : supprimer les lignes `shared = false` de la personne
au départ (`recordDeparture`) et au retrait du rôle, ou montrer aux admins ces connexions orphelines,
sans leurs pages, pour les déconnecter.

**13. « En tant que » : la session forgée est une vraie session de la cible** (relevé le 2026-10-12, revue
du Notion par personne) : la consultation ouvre une vraie session Supabase de la personne consultée
(`lib/impersonation/session.ts`) ; seul le cookie d'état `imp_sid` dit à l'appli qu'il s'agit d'une
consultation. Un admin qui efface volontairement ce cookie agit comme la cible PARTOUT dans le CRM — et
voit alors, entre autres, le Notion perso d'un manager (0192), que l'appli lui cache sinon. Ce n'est pas
propre à l'import de scripts. À reprendre si besoin : reconnaître côté serveur les sessions forgées (leur
`session_id`, enregistré dans `impersonation_sessions` au forge) et appliquer le contrôle aux lectures et
aux actions, même sans le cookie d'état.

**14. L'import d'un fichier n'est pas une transaction** (2026-10-12, #163) : la lecture du fichier
est entière avant la première écriture (une erreur de format n'écrit rien), mais section,
habitudes et tâches partent en trois écritures. Une panne de base au milieu laisse une partie
écrite ; relancer le même fichier complète sans doublon (dédoublonnage sur jour, section, titre).

**15. Les groupes d'un fichier importé restent comme sections ponctuelles** (2026-10-12, import #163,
2e format) : chaque titre de groupe (« Urgences », « Scripts de Sarah (suite) »…) est enregistré dans
`tracker_todo_sections` sans jour (`weekdays ''`), pour que la grille garde l'ordre du fichier
(`position` à partir de 100, à la suite des imports précédents). Ces lignes ne s'affichent jamais
seules (pas de ✕, `isSectionOn` faux) et aucun écran ne les supprime : elles restent après le
déplacement ou la suppression de leurs tâches. Une seule position par groupe pour tout le fichier :
si deux jours ne citent pas les groupes dans le même ordre, la grille suit l'ordre de la 1re
apparition. Sans effet sur le Récap. À reprendre si ça gêne : ordonner les groupes sans section par
la plus petite clé de leurs tâches.

