# Roue des modules (2ᵉ roue, côté chatter) — conception

> **Statut** : conception, 2026-08-30 — à valider par Benoit avant implémentation.
>
> **Demande** (chat du 2026-08-30) : *« côté formation du CRM il faut rajouter une roue chatter, il
> y aura 2 roues. On leur donnera des tours de roue à chaque fin de module quand ils auront eu au
> moins 60 à tous les exos. Remets le chiffre sur la sidebar quand il débloque un tour de roue. 7
> tours de roues identiques (6 modules + boss final) : 6 | 6 | 7 | 7 | 7 | 8 | 8 | 8. À chaque roue
> il tombe entre 6 et 8. Total sur les 7 roues : au pire 42, au mieux 56, en moyenne ~50 — que des
> wins possibles sur cette roue. »*
>
> **Décisions produit arrêtées en chat le 2026-08-30**, non rediscutées ici :
> - **D1** — les montants sont en **euros**. Le « $ » du brief était une habitude d'écriture ; toute
>   la compta de la roue existante est en € (`training_wheel_spins.amount_eur`).
> - **D2** — **le chatter lance lui-même**, depuis une page dédiée `/formation/ma-roue`, avec la
>   pastille de tours disponibles sur son item de sidebar. (La roue nº 1 reste ce qu'elle est :
>   l'encadrant qui lance pour quelqu'un, en partage d'écran.)
> - **D3** — **octroi rétroactif** au déploiement : les modules déjà terminés paient leur tour.
> - **D4** — les 8 montants sont **éditables par un admin** dans l'app.
> - **D5** — **un exo validé sur l'ancienne plateforme (importé) ne compte PAS** pour débloquer un
>   tour. Il continue de compter pour la progression, le classement et les trophées.
>
> **Chiffres relevés sur la base de PRODUCTION le 2026-08-30** (`psql` en lecture seule,
> `db.cqmfpsnqaxymswijdnfz.supabase.co:5432`) :
> - **202 chatters** en poste, dont **193** avec le droit `frm-entrainement`
> - `training_wheel_tickets` : **0 ligne** · `training_wheel_spins` : **2 lignes**, `ticket_id` null
>   sur les deux
> - **6 profils** ont un historique importé (`training_sessions.legacy_id is not null`)
> - modules terminés (≥ 60 partout) : **10** en comptant l'import, **4** en ne comptant que ce qui a
>   été joué ici
>
> Toutes les ancres `fichier:ligne` de cette spec ont été relues dans les sources.

---

## 0. Corrections préalables au contexte

**0.1 — La prochaine migration est `0136`, pas `0131`.** `CLAUDE.md` affirme « UAT à 0130, prod à
0124 (2026-08-27) — prochaine migration = 0131 ; 0125→0130 sont en attente de release côté prod ».
C'est périmé. Vérifié le 2026-08-30 :
`select version from supabase_migrations.schema_migrations order by version desc` renvoie **`0135`
sur la prod ET sur l'UAT**, et `packages/db/supabase/migrations/` contient bien 135 fichiers jusqu'à
`0135_recrutement_suivi.sql`. Il n'y a **plus aucune migration en attente de release**. Toute cette
spec parle donc de **`0136_roue_modules.sql`**. Le `CLAUDE.md` est corrigé dans l'incrément 1.

**0.2 — `training_wheel_tickets` est une table morte, et vide.** La migration `0122` a supprimé tout
l'octroi automatique de tours (règle du 2026-08-24 : le tour est *donné* par un encadrant, plus
*gagné*), et `0121` a rendu `training_wheel_spins.ticket_id` nullable. Depuis :
`grep -rn "training_wheel_tickets" apps/web/src packages --include='*.ts*'` ne renvoie **aucune
lecture ni écriture** — la table ne survit que dans `packages/db/src/types.ts` (types générés). Et
elle est **vide en production** (0 ligne).

C'est le socle de tout le chapitre 2 : on la **réveille** pour la roue des modules au lieu d'en
créer une nouvelle. Le ticket est exactement le bon objet — « un droit à un tour, nominatif,
consommable une fois » — et il porte déjà `used_at`, `reason`, `granted_by` et l'unicité
`training_wheel_spins.ticket_id`.

**0.3 — La règle D5 n'est pas nouvelle : elle est déjà écrite dans `0123`.** La reprise GLA énonce
(`packages/db/supabase/migrations/0123_reprise_gla.sql:414-417`) :

> *« Ce qui n'est PAS filtré, et c'est voulu (D4) : `training_refresh_stats`, `training_module_ranking`
> (0119) et l'Overview des encadrants. L'historique repris DOIT compter dans la progression — c'est
> toute la raison d'être de la reprise. **Seul ce qui DÉCIDE d'un versement est filtré.** »*

Une roue qui verse de l'argent est un versement. Elle tombe donc du côté filtré. La décision D5 ne
fait qu'appliquer une règle déjà arrêtée — c'est important pour la suite : **il ne faut pas la
redécider au prochain chantier.**

**0.4 — Pourquoi c'était un vrai risque, chiffré.** « Module terminé » se lit naturellement dans
`training_case_bests`, qui **mélange** sessions jouées ici et sessions importées. Sur les 10 modules
terminés en production, **6 reposent sur de l'import** (Gucciahas 4, Andriambeloandy 1, Hanielshop
1). Et le bouton de reprise est **toujours ouvert** (`apps/web/src/features/training-legacy/`, 6
profils l'ont utilisé) : sans D5, un chatter qui importe son historique GLA débloquerait jusqu'à
**7 tours = ~50 €** d'un coup, sans avoir joué un seul exo chez nous. Ce n'est pas le rétroactif qui
posait problème (42 € d'écart), c'est la porte laissée ouverte.

---

## 1. Les règles, en clair

1. Le catalogue compte **7 modules actifs** : `setting` (23 cas), `transitions` (11), `rencontre`
   (11), `negociation` (11), `relationnel` (18), `relance` (10), et `boss` (1 cas de `kind = 'boss'`).
   D'où les **7 tours** du brief — aucun cas particulier à écrire pour le boss, il suit la règle
   générale.
2. **Un module donne un tour** quand *tous ses cas actifs* ont été validés à **≥ 60** par le
   chatter, sur une session **jouée ici** (`legacy_id is null`).
   60 est le seuil `MEDAL_BRONZE` du domaine (`packages/core/src/training/rules.ts:8`), et aussi
   `BOSS_PASS` (`rules.ts:11`) — la règle est la même pour le boss sans qu'on ait à l'écrire deux fois.
3. **Un module ne paie qu'une fois, pour toujours.** Garanti par un index unique, pas par du code.
4. **Un tour = un tirage.** Garanti par l'unicité de `training_wheel_spins.ticket_id`, pas par du
   code.
5. **Les tours s'accumulent et n'expirent pas.** Trois modules finis pendant les vacances de
   l'encadrant = trois tours qui attendent.
6. La roue est **100 % gagnante** : 8 secteurs, `6 · 6 · 7 · 7 · 7 · 8 · 8 · 8 €`, tous équiprobables.
   Espérance **7,125 €** le tour ; sur 7 tours : **42 € au pire, 56 € au mieux, 49,88 € en moyenne**.
   Les chiffres du brief sont exacts.
7. **Le tirage est décidé par le serveur.** Le client ne fait qu'animer la roue jusqu'au secteur
   qu'on lui rend — même patron que la roue nº 1.

### Ce qui n'entre PAS dans le périmètre

- La roue nº 1 (`/formation/roue`) n'est pas modifiée, sauf sa colonne « Origine » dans l'historique
  (§6.3).
- Aucun versement automatique : `paid_at` / `paid_by` restent posés à la main, comme aujourd'hui.
  Le branchement compta reste une intention, pas un chantier de ce lot.
- Aucun cas particulier « catalogue qui grossit » : si un cas est ajouté à un module déjà payé, le
  tour reste acquis et il n'y en a pas de second (§2.2). C'est le comportement voulu.

---

## 2. Modèle de données — `0136_roue_modules.sql`

### 2.1 La table de config (nouvelle)

```sql
create table public.training_module_wheel_config (
  id         smallint primary key default 1 check (id = 1),
  title      text not null default 'La roue des modules' check (length(title) between 1 and 60),
  -- [{"label":"6 €","weight":1,"amount_eur":6}, …] — même forme que training_wheel_config.prizes
  segments   jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
```

Seedée avec les 8 segments du brief, poids 1 chacun.

**Pourquoi une table à part et pas une 2ᵉ ligne de `training_wheel_config`** (dont le `check (id = 1)`
n'attendrait qu'à être levé) : la roue nº 1 est à **deux étages** — on tire d'abord un secteur
gagnant/perdant (`sectors`), puis un lot dans le coffre (`prizes`,
`0113_formation.sql:1593-1608`). La roue des modules est à **un seul étage** : le secteur EST le
montant. Réutiliser la ligne de l'autre en laissant `sectors` inerte, c'est de la magie implicite
que personne ne saura relire dans six mois. Une table de 6 colonnes est moins chère que ça.

En revanche la **forme du JSON est identique à `prizes`** (`label` / `weight` / `amount_eur`) : les
mappers `toPrizes` / `prizesToJson` (`apps/web/src/features/training-wheel/mappers.ts`) et le type
`WheelPrize` (`packages/core/src/training/wheel.ts:5`) se réutilisent tels quels.

### 2.2 Le ticket (table existante, réveillée)

```sql
alter table public.training_wheel_tickets
  add column module_id uuid references public.training_modules(id) on delete cascade;

-- Un module ne paie qu'une fois, POUR TOUJOURS. C'est cet index qui rend l'octroi idempotent :
-- il peut être rejoué à chaque notation sans jamais doubler un tour.
create unique index training_wheel_tickets_module_uidx
  on public.training_wheel_tickets (profile_id, module_id)
  where module_id is not null;
```

**Le piège à désamorcer, déjà rencontré en `0120`.** L'index vivant en production est :

```
training_wheel_tickets_semaine_systeme_uidx
  UNIQUE (profile_id, week) WHERE (granted_by IS NULL AND trophy_key IS NULL)
```

Un ticket de module a `granted_by is null` (c'est le système qui l'octroie) et `trophy_key is null`.
**Deux modules terminés la même semaine tomberaient donc sur le même conflit** — et comme l'octroi
insère en `on conflict do nothing`, le second tour disparaîtrait **en silence**. C'est mot pour mot
le bug que `0120` avait dû corriger pour les trophées. On le recrée avec la clause manquante :

```sql
drop index if exists public.training_wheel_tickets_semaine_systeme_uidx;
create unique index training_wheel_tickets_semaine_systeme_uidx
  on public.training_wheel_tickets (profile_id, week)
  where granted_by is null and trophy_key is null and module_id is null;
```

*(On le conserve plutôt que de le supprimer : il ne contraint plus rien aujourd'hui — plus personne
ne crée de ticket hebdo — mais si l'octroi au classement revenait un jour, il est encore juste.)*

### 2.3 Le tirage (table existante, colonne existante)

Aucune modification de schéma. `training_wheel_spins.ticket_id` est **nullable depuis `0121` mais
toujours `unique`** : les tirages de la roue nº 1 le laissent à `null` (Postgres autorise autant de
`null` qu'on veut sur un unique), et **chaque tirage de la roue des modules porte son ticket**.

C'est le point le plus important du modèle : **l'anti-double-tirage est une contrainte de base, pas
un `if` applicatif.** Deux clics dans la même milliseconde, deux onglets, un rejeu réseau — le second
`insert` viole l'unicité et ne verse rien.

### 2.4 L'index qui rend la vérification gratuite

La règle D5 interdit de lire `training_case_bests` (qui mélange l'import). On lit donc les sessions,
avec un index partiel taillé pour cette seule question :

```sql
create index training_sessions_valides_ici_idx
  on public.training_sessions (profile_id, case_id)
  where status = 'scored' and legacy_id is null and total >= 60;
```

Étroit (une fraction des sessions), et il couvre exactement le `not exists` du §3.1.

---

## 3. L'octroi

### 3.1 La fonction

```sql
create function public.training_module_wheel_grant(p_profile uuid, p_module uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp
```

Elle fait, dans l'ordre :

1. **Garde de population** : `p_profile` est un chatteur en poste (`left_at is null`,
   `role = 'chatteur'`) avec `'frm-entrainement' = any(pages)`. Sinon `0`. Exactement le filtre de population de
   `training_weekly_ranking` (`0123_reprise_gla.sql:439`) — un ex-chatteur ou un encadrant ne
   touche rien. *(`training_wheel_ranking_raw`, qui portait le même filtre, a été supprimée par
   `0122` : vérifié sur la prod le 2026-08-30, elle n'existe plus.)*
2. **Le module est-il fini ?** — le cœur :

   ```sql
   not exists (
     select 1 from training_cases c
     where c.module_id = p_module and c.active
       and not exists (
         select 1 from training_sessions s
         where s.profile_id = p_profile and s.case_id = c.id
           and s.status = 'scored' and s.legacy_id is null and s.total >= 60
       )
   )
   ```

   « Il n'existe aucun cas actif de ce module que ce chatter n'ait pas validé ici à ≥ 60. » Le
   module lui-même doit être actif.
3. **Insertion du ticket**, `on conflict do nothing` :
   `reason` = `'Module ' || m.title || ' terminé'`, `week` = lundi courant (Paris), `granted_by` null,
   `module_id` = `p_module`.
4. Retourne le nombre de tickets créés (0 ou 1).

Droits : `revoke … from public, anon, authenticated` puis `grant … to service_role`. **Cette
fonction ne vérifie pas qui l'appelle** — comme `training_trophy_grant` en son temps, elle fait
confiance à son appelant. Exposée à `authenticated`, elle laisserait n'importe qui se payer.

### 3.2 Le déclencheur : le trigger, surtout PAS `training_refresh_stats`

`training_refresh_stats()` recalcule `training_case_bests` (définition vivante relue sur la prod le
2026-08-30 : identique à `0113_formation.sql:1510-1576`). C'est l'endroit naturel — et c'est un
piège : **`training_legacy_refresh_all` (`0123_reprise_gla.sql:367-393`) l'appelle en boucle sur
tous les cas d'un profil pendant l'import GLA.** Y mettre l'octroi ferait payer l'import, exactement
ce que D5 interdit.

L'octroi va donc dans **`training_on_session_scored()`** (`0113_formation.sql:1229-1241`), le trigger
`AFTER UPDATE OF status, scored_at` :

```sql
perform training_refresh_stats(new.profile_id, new.case_id, coalesce(new.scored_at, now()));
perform training_module_wheel_grant(new.profile_id, new.module_id);   -- ← ajouté
```

Deux propriétés gratuites :

- **L'import ne déclenche rien.** `0123:361` le note noir sur blanc : *« Le trigger
  `trg_training_session_scored` est un AFTER UPDATE : un INSERT ne le déclenche JAMAIS. »* L'import
  insère. D5 est donc respectée par construction, pas par un filtre qu'on pourrait oublier.
- **Le tour apparaît à la seconde** où le dernier exo passe à 60, sans cron, sans throttle, sans
  appel depuis un layout. `training_sessions.module_id` est déjà là (colonne `not null`), donc on
  ne vérifie qu'un module — ≤ 23 cas — pas les sept.

C'est tout l'inverse de l'octroi de `0118`, qui devait rejouer quatre classements hebdo à chaque
rendu de page parce qu'il n'avait aucun moment naturel où se déclencher. Ici, ce moment existe.

### 3.3 Le rétroactif (D3)

En fin de migration, un `insert … select` unique qui applique la règle du §3.1 à tous les chatters
et tous les modules actifs, `on conflict do nothing`.

**Coût mesuré sur la prod le 2026-08-30 : 4 tours ≈ 28 €** — Emmanuelupmedia (`relance`),
Harindranto (`relance`), Reely (`relance`), Hanielshop (`boss`). *(C'était 10 tours ≈ 70 € avant
D5 ; les 6 écartés reposaient sur de l'import.)*

Le chiffre est à **re-mesurer juste avant d'appliquer la migration en prod** — la promo joue tous
les jours.

---

## 4. La lecture (pastille + page)

```sql
create function public.training_module_wheel_pending(p_profile uuid)
returns integer language sql stable security definer …
```

Un `count(*)` sur `training_wheel_tickets where profile_id = ? and module_id is not null and
used_at is null`, précédé du cloisonnement d'usage sur cette face : **son propre compteur, ou celui
de n'importe qui pour un `frm-suivi`** — `p_profile = auth.uid() or has_page('frm-suivi')`,
sinon `0`. Exposée à `authenticated`. *(C'était la garde de `training_wheel_pending`, supprimée
par `0122` avec le reste de l'octroi automatique — on la reprend, on ne la réinvente pas.)*

Elle est appelée **au rendu de chaque page du CRM** (la sidebar est dans le layout) : c'est un
`count` sur un index partiel, quelques lignes. Rien à voir avec le coût de la version 0118, qui
devait recalculer des éligibilités non matérialisées — ici tout est matérialisé au moment de la
notation.

---

## 5. La page — `/formation/ma-roue`

### 5.1 Route et accès

Nouvel item dans `WORKSPACES`, face `formation` (`apps/web/src/config/workspaces.ts:237`, juste
sous « Roue ») :

```ts
{ href: '/formation/ma-roue', label: 'Ma roue', icon: Sparkles, anyOf: ['frm-entrainement'] }
```

`anyOf` sans `slug` : le droit vient de « Ma formation ». Ce n'est pas une case à cocher de plus
dans Membres — même patron que Recrutement (`workspaces.ts:232`).

`page.tsx` : `requireAccess('frm-entrainement')`, données chargées dans les services et streamées
sous `<Suspense>` avec un squelette, `Template` = Server Component. Convention
`app → feature(template) → composants`, aucun fetch dans la feature.

### 5.2 Ce que le chatter voit

1. **La roue** : 8 secteurs aux montants, le bouton `Tourner` désactivé s'il n'a aucun tour, et
   « *2 tours disponibles* » sous le bouton.
2. **Le tirage** : le serveur décide, le client anime, puis révèle le montant (`WheelResult`).
   Après la révélation, `router.refresh()` — le compteur et l'historique se remettent à jour.
3. **« Comment gagner un tour »** : les 7 modules avec leur état — *tour gagné* / *tour joué* /
   *il te reste N exos sous 60*. C'est ce panneau qui rend la mécanique motivante : sans lui, un
   chatter ne sait pas ce qui le sépare du prochain tour.
4. **« Mes gains »** : ses tirages passés et le total en €.

### 5.3 La Server Action `spinModuleWheel()`

Aucune entrée (on ne tire que pour soi). Dans l'ordre :

1. `requirePageProfileLive('frm-entrainement')` — la variante `…Live` **refuse la consultation
   « en tant que »** : une impersonation ne verse jamais d'argent (patron de `spinWheel`,
   `features/training-wheel/actions.ts:56`).
2. Lecture du plus ancien ticket non utilisé (`module_id is not null`, tri `created_at`).
   Aucun → `BusinessError('Tu n'as aucun tour disponible')`.
3. Tirage : `pickWeighted(segments, (n) => randomInt(0, n))` — `node:crypto`, jamais `Math.random`.
4. **Écriture en service-role**, dans cet ordre précis :
   `insert into training_wheel_spins (…, ticket_id)` **d'abord** — c'est l'unicité de `ticket_id`
   qui sert de verrou : si le tour a déjà été joué, l'insert échoue et **rien n'est écrit**.
   Puis `update training_wheel_tickets set used_at = now()`.
   *L'ordre inverse (marquer le ticket, puis insérer) brûlerait le ticket si l'insert échouait.*
5. **Pas de `revalidatePath`** dans l'action : une Server Action qui revalide renvoie le RSC payload
   frais **avec sa réponse**, et l'historique afficherait le montant avant que la roue ait fini de
   tourner. Le rafraîchissement se fait côté client, après la révélation. (Piège déjà documenté
   dans `spinWheel`, `actions.ts:94-100`.)

### 5.4 La config admin

Dialog admin sur la même page (visible si `role === 'admin'`), sur le modèle de
`wheel-config-dialog.tsx` : liste de segments (libellé + montant + poids), RHF + `zodResolver` +
`schema.ts`, `'use no memo'` en tête du composant (le React Compiler casse `formState` — règle
projet). Refus si aucun segment de poids > 0 (`pickWeighted` lève sur une somme nulle).

Écriture sous **RLS** (policy admin sur `training_module_wheel_config`), pas en service-role : la
base fait le travail, défense en profondeur gratuite. Même choix que `saveWheelConfig`.

---

## 6. Ce qui bouge dans l'existant

### 6.1 Deux composants déménagent (obligatoire)

`wheel-svg.tsx` (166 l.) et `wheel-result.tsx` (143 l.) vivent dans
`features/training-wheel/components/`. L'ESLint **interdit le cross-feature**
(`apps/web/eslint.config.mjs:51-56` — *« Cross-feature interdit »*). Ils partent donc en
`src/components/training/` (où vit déjà `score-badge.tsx`), **sans changement de code** : les deux
imports de `features/training-wheel` sont réécrits.

`WheelSvg` prend un `WheelSector[]` (`label` / `weight` / `lose`) : les segments de la roue des
modules s'y présentent en `{ label, weight, lose: false }`. Aucune duplication de géométrie, aucun
nouveau dessin de roue.

### 6.2 La pastille de sidebar

Toute la plomberie existe et n'attend qu'à être rebranchée — il reste même son commentaire
orphelin dans `apps/web/src/components/app-sidebar.tsx:72` (*« Tour de roue disponible (badge
streamé…) »*), vestige de la roue nº 1.

- `app/(dash)/layout.tsx` : une promesse de plus, `.catch(() => 0)` inline comme les deux autres
  (`layout.tsx:44` et `:51`) — une erreur de pastille ne doit jamais casser la page. Court-circuitée
  (`Promise.resolve(0)`) si le membre n'a pas `frm-entrainement`, pour éviter l'aller-retour inutile.
- `app-sidebar.tsx` : un `<CountBadge>` de plus sur `item.href.endsWith('/ma-roue')`, à côté des
  deux existants. Le composant est déjà générique (`app-sidebar.tsx:39`).

### 6.3 L'historique encadrant

`/formation/roue?vue=historique` lit `training_wheel_spins` — donc il montrera **les deux roues**,
et c'est voulu : une seule table de gains, une seule compta, un seul `paid_at`. On ajoute une
colonne **Origine** (`Encadrant` / `Module Setting`), lue depuis le `reason` du ticket joint.

Le journal du membre marche déjà sans rien toucher : le trigger `training_wheel_spin_journal`
(`0113_formation.sql:1661-1683`) lit le `reason` du ticket et écrira
« *Roue : 7 € — Module Setting terminé* » dans `member_events`.

---

## 7. Sécurité — le résumé

| Menace | Ce qui l'arrête |
|---|---|
| Rejouer un tour (double-clic, 2 onglets, rejeu réseau) | `unique (ticket_id)` sur `training_wheel_spins` — **base**, pas code |
| S'octroyer des tours | `training_module_wheel_grant` : `service_role` seul, `revoke` sur `authenticated` |
| Tirer sans tour | L'action lit un ticket non utilisé, sinon `BusinessError` |
| Truquer le tirage côté client | Le tirage est décidé serveur (`crypto.randomInt`), le client reçoit un index |
| Se payer via une impersonation | `requirePageProfileLive` refuse la consultation « en tant que » |
| Se payer via l'import GLA | L'octroi est dans un trigger `AFTER UPDATE`, l'import fait des `INSERT` (D5) |
| Un ex-chatteur qui touche encore | Garde de population dans `…_grant` (`left_at`, `role`, `pages`) |
| Lire les tickets d'un autre | RLS `training_wheel_tickets_read` : propriétaire ou `frm-suivi` |

---

## 8. Le coût

| | |
|---|---|
| Espérance d'un tour | **7,125 €** ((6+6+7+7+7+8+8+8) / 8) |
| Un chatter qui va au bout des 7 | 42 € au pire · **49,88 € en moyenne** · 56 € au mieux |
| Rétroactif au déploiement | **4 tours ≈ 28 €** (mesuré le 2026-08-30, à re-mesurer avant d'appliquer) |
| Enveloppe maximale théorique | **193 chatters × ~50 € ≈ 9 650 €** si tous finissent tout |

Le plafond a été validé en chat le 2026-08-30. Il ne sera pas atteint : à ce jour **4 chatters sur
193** ont terminé ne serait-ce qu'un module par leurs propres moyens.

---

## 9. Tests

- **`packages/core`** (Vitest, pur) : aucun nouveau moteur à écrire — `pickWeighted` est déjà
  testé (`packages/core/src/training/wheel.test.ts`). On ajoute un seul test, sur la **config par
  défaut** : 8 segments, tous de poids > 0, aucun montant nul, espérance = 7,125 €. Il attrape la
  faute de frappe dans le seed, seul vrai risque de ce lot côté domaine.
- **`schema.test.ts`** de la feature, sur le modèle de
  `features/training-wheel/schema.test.ts` : segment vide refusé, poids vidé refusé (`requiredInt`,
  pas `z.coerce` — un poids effacé se coerçait en 0 et sortait le segment du tirage en silence),
  montant négatif refusé.
- **SQL** : pas de test automatisé (le projet n'en a pas). Recette manuelle sur l'UAT, §10.

---

## 10. Découpage et ordre de livraison

**1 PR, 3 incréments.** L'ordre compte : la migration est sûre à appliquer **avant** le déploiement
du code (purement additive — une colonne, deux index, deux fonctions, une table), et le code sans la
migration planterait.

| # | Contenu | Vérification |
|---|---|---|
| **1** | `0136_roue_modules.sql` (table config + `module_id` + les 3 index + `…_grant` + `…_pending` + le trigger + le rétroactif), régénération de `packages/db/src/types.ts`, correction de `CLAUDE.md` (§0.1) | `supabase db push --dry-run` puis push sur l'**UAT** ; vérifier les 4 tickets rétroactifs ; jouer une session à ≥ 60 et voir le ticket apparaître ; rejouer un import legacy et vérifier qu'**aucun** ticket n'est créé |
| **2** | Feature `features/training-module-wheel/` (page, template, spinner, panneau modules, mes gains, dialog admin, action, schema) + déménagement de `wheel-svg` / `wheel-result` en `components/training/` | `pnpm lint` (la frontière ESLint valide le déménagement), `pnpm build`, recette sur l'UAT avec un compte chatter |
| **3** | Pastille de sidebar + colonne « Origine » dans l'historique encadrant | Le chiffre apparaît à la fin d'un module et disparaît après le tirage |

Puis : `pnpm test` + `pnpm build` verts, PR sur `main`, **migration appliquée en prod AVANT le
déploiement**, recette en prod.

---

## 11. Points ouverts

Aucun. Les cinq décisions produit (D1→D5) sont arrêtées, le coût est chiffré et validé, et les deux
pièges connus (l'index `semaine_systeme_uidx` de `0120`, l'import GLA de `0123`) sont désamorcés
explicitement dans le §2.2 et le §3.2.
