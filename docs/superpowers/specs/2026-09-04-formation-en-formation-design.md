# « En formation » — un drapeau, une file d'attente lisible — conception

> **Statut** : conception, 2026-09-04 — à valider par Benoit avant implémentation.
>
> **Demande** (chat du 2026-09-04) : *« sur l'overview de la formation il faut trouver une solution.
> Déjà dans recrutement quand on intègre quelqu'un on intègre direct, on enlève le dialog de
> sélection de modèle, parce que sur l'overview ils sont perdus. Il nous faut 1 tableau qui
> référence toutes les personnes en cours de formation, donc un champ "en formation" à rajouter —
> je pense qu'on coche par défaut comme le "nouveau" dans les membres. On fait pareil pour savoir
> tout ce qui sont en formation, et qu'ils soient pas perdus les managers, parce que là c'est
> illisible. »*
>
> **Décisions produit arrêtées en chat le 2026-09-04**, non rediscutées ici :
> - **D1** — le drapeau « en formation » **tombe tout seul au rattachement d'une modèle**, et reste
>   **décochable / recochable à la main** dans Membres.
> - **D2** — l'Overview passe en **deux onglets** — « En formation » (par défaut) et « En agence ».
>   Un seul tableau visible à la fois.
> - **D3** — le bouton « Intégrer » du recrutement **n'ouvre plus de dialog** : un clic crée le
>   compte. Assumé : plus de garde-fou contre le clic accidentel (`ConfirmDialog` explicitement
>   écarté).
> - **D4** — un candidat intégré arrive **« nouveau » ET « en formation »**, les deux cochés.
> - **D5** — le tableau passe de **9 colonnes à 5** : Chatter, Progression, Moyenne, Boss, Dernière
>   session (+ Modèle sur l'onglet « En agence »). **Points, Série et Notées sortent** de cet écran.
>
> **Chiffres relevés sur la base de PRODUCTION le 2026-09-04** (`psql` en lecture seule,
> `db.cqmfpsnqaxymswijdnfz.supabase.co:5432`) :
> - **260 chatteurs** en poste, dont **245** avec le droit `frm-entrainement`
> - **58** d'entre eux n'ont **aucune** ligne `profile_creators` — dont **56** avec le droit
> - ces 58 ont **tous** été créés il y a **moins de 60 jours** (0 ancien) ; **21** ont déjà joué
>   une session d'entraînement ; **27** portent déjà le drapeau `is_new`
> - **86** chatteurs en poste sont marqués `is_new` — le badge « nouveau » ne désigne donc pas la
>   même population et ne peut pas servir de substitut
>
> Toutes les ancres `fichier:ligne` de cette spec ont été relues dans les sources.

---

## 0. Correction préalable au contexte

**`CLAUDE.md` est périmé sur les numéros de migration.** Il affirme « au 2026-09-04, prod à **0141**
et UAT à **0145** — les six migrations du relevé MyPuls (`0138`, `0140`, `0142`→`0145`) ne sont PAS
encore en prod ». Vérifié le 2026-09-04 :
`select version from supabase_migrations.schema_migrations order by version desc` renvoie **`0145`
en production** — le relevé MyPuls y est passé avec les Releases 2.26 → 2.28. Il n'y a plus aucune
migration en attente, et le paragraphe sur `--include-all` n'a plus d'objet.

Cette spec parle donc de **`0146_en_formation.sql`**, et `CLAUDE.md` est corrigé dans le même lot.

---

## 1. Le problème

L'Overview affiche **tout le monde** : la RPC `training_overview_roster`
(`0113_formation.sql:1412-1428`) rend les chatteurs en poste portant `frm-entrainement`, soit
**245 lignes** en production. Le composant les coupe ensuite en deux sections — « En formation »
puis « Attribués à une modèle » (`overview-roster.tsx:90-118`) — mais les deux tableaux sont
empilés sur la même page, avec **9 colonnes** chacun, un bloc de signalements et un sélecteur entre
les deux. Le manager qui vient lire *« qui est en formation, et qui est prêt »* déroule 245 lignes
pour en trouver 58.

Et le critère de la coupure est une **déduction** : `models.length === 0`
(`overview-roster.tsx:80` et `:93`). Elle marche aujourd'hui parce que le dialog d'intégration
rattache une modèle au moment même de l'intégration. Elle cesse de marcher dès **D3** — sans
dialog, plus personne n'a de modèle à l'arrivée, et « en formation » devient un état qui dure des
semaines sans que rien en base ne le dise. D'où le drapeau.

Ces deux choses tiennent ensemble : **D3 crée le besoin du drapeau**, le drapeau rend l'écran
lisible.

---

## 2. Le drapeau — migration `0146_en_formation.sql`

### 2.1 La colonne

```sql
alter table public.profiles
  add column if not exists in_training boolean not null default false;

comment on column public.profiles.in_training is
  'Le chatteur est en cours de FORMATION (pas encore en production sur une modèle). Coché à
   l''intégration depuis Recrutement et à la création d''un chatteur dans Membres ; décoché
   automatiquement au PREMIER rattachement à une modèle (trigger profile_creators), et modifiable
   à la main dans Membres. Ne concerne que role = ''chatteur''.';

create index if not exists profiles_in_training_idx on public.profiles (in_training)
  where in_training;
```

`default false`, **pas** `default true` : la valeur par défaut de la colonne s'applique à tous les
profils — encadrants et admins compris — et à toute création future de compte, y compris le trigger
`on_auth_user_created`. Le « coché par défaut » de la demande est un défaut de **formulaire** et
d'**intégration**, pas de colonne. Même partage que `is_new` (`0101:28`, `default false`, coché par
la couche applicative).

**Pas de check à la `profiles_is_new_needs_arrived_at`** : il n'y a aucune date associée. On sait
déjà depuis quand la personne est là (`arrived_at`) et quand elle est entrée en production
(`integrated_at`, 0129) — une troisième date ne dirait rien de neuf.

### 2.2 Le backfill

```sql
update public.profiles p set in_training = true
where p.role = 'chatteur'
  and p.left_at is null
  and not exists (select 1 from public.profile_creators pc where pc.profile_id = p.id);
```

**58 lignes en production.** Le filtre `frm-entrainement` est volontairement **absent** : il ne
change que 2 lignes, et ces 2-là sont précisément celles qu'on veut voir apparaître — un chatteur
intégré à qui on a oublié le droit Entraînement est aujourd'hui invisible de l'écran qui devrait
le signaler.

Le backfill est sûr parce que les 58 sont **tous** récents (< 60 jours) : aucun ancien chatteur
laissé sans modèle après un retrait d'assignation ne va se retrouver marqué « en formation ».
Cette vérification est à **refaire au moment de l'exécution** — si l'écart apparaît (des profils
anciens dans le lot), ajouter `and p.created_at > now() - interval '90 days'`.

### 2.3 Le décochage automatique

```sql
create or replace function public.clear_in_training() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.profiles
     set in_training = false
   where id = new.profile_id and in_training and role = 'chatteur';
  return new;
end;
$$;

create trigger profile_creators_clear_in_training
  after insert on public.profile_creators
  for each row execute function public.clear_in_training();
```

**En base, pas dans le code applicatif.** `profile_creators` est écrit depuis **trois** chemins
indépendants :

| Chemin | Écriture |
|---|---|
| Membres | `syncAssignments` (`members/authz.ts:78-88`) |
| Board Organisation | RPC SQL `save_org_cell` / `save_org_row` (`organisation/actions.ts:48`, `:92`) |
| Recrutement | insert direct, aujourd'hui (`recruit-admin/actions.ts:296+`) — disparaît avec D3 |

Un décochage posé dans `authz.ts` raterait le board Organisation, où l'on place justement les
chatteurs sur les modèles. Le trigger les couvre tous les trois, plus le SQL à la main.

`role = 'chatteur'` dans le `where` : `profile_creators` porte **aussi** le périmètre modèles des
encadrants (`creator-scope.ts`) — sans ce filtre, assigner une modèle à un manager toucherait un
drapeau qui ne le concerne pas.

**Le retrait d'une modèle ne recoche rien.** Écart assumé avec Good Luck Agency, qui effaçait
`integrated_at` sur un « Repasser en formation » (`serveur.py:1122-1123`) — le même écart est déjà
acté pour `integrated_at` (`members/authz.ts:96-100`). Un retrait d'assignation passe souvent par
le board Organisation, où c'est une réorganisation et non un retour en formation. Le recochage se
fait à la main, dans Membres.

### 2.4 L'historique

**Le kind `formation` est DÉJÀ pris.** Vérifié en production le 2026-09-04
(`pg_get_constraintdef` sur `member_events_kind_check`) : il existe depuis `0123` et désigne la
reprise de l'ancienne plateforme Good Luck Agency — rattachement, reprise d'historique,
détachement (`0123_reprise_gla.sql:449-500`). Il est libellé **« Ancienne plateforme »**
(`members/components/event-kind.ts:29`) et porte des phrases entières en `to_value`. Le réutiliser
écrirait « Ancienne plateforme : true → false » dans le journal.

Nouveau kind, donc : **`integration`**, libellé « Intégration ».

```sql
alter table public.member_events drop constraint member_events_kind_check;
alter table public.member_events add constraint member_events_kind_check
  check (kind in ('creation','role','shift','closing','modele','manager','pages','nouveau',
                  'arrivee','sortie','lien','identite','sanction','rapport','recompense',
                  'formation','integration'));
```

et le trigger d'historique (`0101:206-209`, patron `is_new`) :

```sql
  if new.in_training is distinct from old.in_training then
    insert into member_events (profile_id, created_by, kind, from_value, to_value)
    values (new.id, v_actor, 'integration', old.in_training::text, new.in_training::text);
  end if;
```

Trois fichiers suivent le kind, et le typage les y force (`Record<EventKind, …>`, cf. le JSDoc de
`event-kind.ts:10-12` : « ajouter un `kind` sans lui donner de libellé ni de teinte ne compile
pas ») :

| Fichier | Ajout |
|---|---|
| `packages/core/src/domain/member-events.ts:53-76` | `'integration'` dans `EVENT_KINDS` |
| `packages/core/src/domain/member-events.ts:158+` | un `case` dans `memberEventLabel` : `to === 'true' ? 'Repassé en formation' : 'Sorti de formation — en agence'` (patron `nouveau`, `:174`) |
| `apps/web/src/features/members/components/event-kind.ts` | `KIND_LABEL.integration = 'Intégration'` et `KIND_TONE.integration = STATUS_COLORS.positive` |

Sans ce journal, « qui a sorti X de formation, et quand » n'a **aucune** réponse. Les décochages
faits par le trigger apparaîtront signés « système » (l'`auth.uid()` d'une écriture service-role
est null, cf. `recruit-admin/actions.ts:279-281`) : c'est correct, c'est bien le rattachement qui a
décoché, pas une personne.

### 2.5 La RPC

`training_overview_roster` (`0113_formation.sql:1412-1428`) est recréée avec :

- `in_training boolean` **et** `has_training boolean` (`'frm-entrainement' = any(p.pages)`) en
  sortie ;
- son `where` élargi : `and ('frm-entrainement' = any(p.pages) or coalesce(p.in_training, false))`.

L'élargissement sert D3 : un candidat intégré à qui la pose des droits a échoué (le cas décrit dans
`recruit-admin/actions.ts:283-288`) restait invisible de l'Overview, donc introuvable. Il y
apparaîtra, marqué « sans accès ».

Le `order by` ne change pas — le tri par avancement se fait côté composant
(`overview-roster.tsx:74`).

Régénérer `packages/db/src/types.ts` après application.

---

## 3. Membres — la case

| Fichier | Changement |
|---|---|
| `members/schema.ts:46` | `inTraining: z.boolean()` à côté de `isNew`. Aucun refine — pas de date liée. |
| `members/types.ts:56` | `inTraining: boolean` |
| `members/services/get-members.ts:55,203` | lire `in_training`, mapper `inTraining: p.in_training ?? false` |
| `members/actions.ts:130,246` | `in_training: role === 'chatteur' ? values.inTraining : false` (création **et** édition), exactement comme `is_new` |
| `members/components/member-defaults.ts:66` | `inTraining: member?.inTraining ?? true` — **`true`**, c'est le « coché par défaut » : `member` est absent en création seulement |
| `members/components/member-arrival-fields.tsx` | une deuxième `Checkbox` « En formation », dans le même bloc, sous le même `if (roleValue !== 'chatteur') return null` |
| `members/authz.test.ts:41` | ajouter `inTraining: false` à l'objet de test |

Le libellé de la case est **« En formation »**. Pas de badge dans la table Membres : la face
Formation a son écran pour ça, et la colonne Modèle y répond déjà de fait.

**Divergence volontaire avec `is_new`** : `is_new` est à `false` par défaut dans le formulaire
(`member-defaults.ts:66`) parce qu'on crée souvent des membres déjà en poste. `in_training` est à
`true` parce qu'un **chatteur** qu'on crée aujourd'hui n'a, par construction, pas encore de modèle
— et le formulaire ne montre la case qu'aux chatteurs.

---

## 4. Recrutement — l'intégration directe

### 4.1 L'action

`addCandidateToCrm` (`recruit-admin/actions.ts:213+`) perd `creatorId` :

- `schema.ts:27` → `integrateCandidateInput = z.object({ id: z.uuid() })` ;
- l'`update profiles` garde `display_name`, `pages`, `is_new`, `arrived_at`, `created_by`,
  `updated_by` **et gagne `in_training: true`** (D4 : les deux drapeaux, `is_new` était déjà là,
  `actions.ts:266-267`) ;
- `integrated_at` **n'est plus posé** — il n'y a plus de rattachement à l'intégration. Il sera posé
  au premier rattachement par `syncAssignments` (`members/authz.ts:100-107`), qui le fait déjà et
  dont c'est précisément l'objet ;
- tout le bloc de rattachement `profile_creators` (`actions.ts:296+`) disparaît, et avec lui le
  commentaire sur la frontière ESLint cross-feature ;
- `attachRecruitCandidate` et le reste sont inchangés.

### 4.2 Le bouton

`integrate-button.tsx` perd son `Dialog` : un `ActionButton` qui appelle l'action, affiche l'état
`pending`, un toast, et `router.refresh()`. Le libellé reste **« Intégrer »**.

Le toast dit ce qui vient de se passer, en toutes lettres — c'est le seul retour que l'encadrant
aura : *« <Nom> intégré — chatteur, en formation »*.

Ce qui disparaît avec le dialog : le choix de modèle, la sortie « Créer le compte sans rattacher »
(qui devient le comportement unique), et la prop `creators`. Donc aussi :

- `recruit-admin/types.ts:110` (`CreatorChoice`) et `:135` (le chargement des modèles) ;
- la requête `creators` dans `services/get-candidates.ts` ;
- le passage de `creators` dans `RecruitTemplate.tsx`, `candidates-table.tsx` et
  `candidate-file.tsx`.

**Le risque est acté (D3)** : la création d'un compte Auth est difficilement réversible, et il n'y
a plus rien entre le clic et elle. Le rattrapage passe par Membres (supprimer le compte), comme
aujourd'hui pour un compte créé par erreur.

---

## 5. Overview — deux onglets

### 5.1 La page

`app/(dash)/formation/overview/page.tsx` lit et **valide** `?vue=` en plus de `?chatter=`, avec le
même soin : une valeur inconnue retombe sur l'onglet par défaut (elle ne doit pas vider l'écran).
Valeurs : `agence`, et l'absence de paramètre = « En formation ».

La fiche d'un chatter (`?chatter=`) ne change pas : elle remplace toujours l'écran entier.

### 5.2 Le Template

`UrlTabs` (`components/url-tabs.tsx`, `param="vue"`, `defaultValue="formation"`) — le composant
maison, déjà utilisé par `training-wheel/WheelTemplate.tsx`. Les contenus sont rendus par le Server
Component parent et passés en `items[].content` : rien ne devient client.

Ordre de la page :

```
Overview
<décompte de la promo>
[ En formation (58) ] [ En agence (189) ]
  └─ le tableau de l'onglet
<sélecteur de chatter>
<signalements>
<coût IA — admin>
```

Les signalements descendent **sous** les onglets : la file d'attente d'abord (c'est la demande),
les exceptions ensuite. Le coût IA passe en bas de page, cartes KPI comprises — un admin qui vient
lire une facture n'est pas pressé, un manager qui vient lire sa promo l'est.

### 5.3 Le tableau

Le partage n'est plus `models.length === 0` mais `in_training` :

```ts
const enFormation = sorted.filter((r) => r.inTraining)
const enAgence = sorted.filter((r) => !r.inTraining)
```

`OverviewRosterCount` (`overview-roster.tsx:78-88`) suit la même bascule.

Colonnes (D5) : **Chatter · Progression · Moyenne · Boss · Dernière session**, plus **Modèle** sur
l'onglet « En agence » seulement — le paramètre `withModel` existe déjà (`overview-roster.tsx:121`).
Points, Série et Notées sortent : ce sont des chiffres de classement, ils vivent sur la fiche du
chatter (`overview-chatter.tsx`) et au classement hebdo.

Ce qui **ne** change **pas** : le tri par avancement décroissant (`byProgress`), la barre verte
unique (`PROGRESS_BAR_COLOR` et son commentaire de 2026-09-02 qui explique pourquoi elle n'est pas
tricolore), le seuil indicatif `NEARLY_READY_PCT` et sa phrase « N au-dessus de 80 % — bientôt en
agence » (elle reste sur l'onglet « En formation », c'est sa raison d'être), et l'absence de
cloisonnement par modèle (spec Formation §7 : qui a `frm-suivi` voit toute la promo).

Deux badges sur la cellule Chatter : `nouveau` (existant, `isNew`) et **`sans accès`** quand
`hasTraining` est faux — 2 personnes en production aujourd'hui, invisibles jusqu'ici.

---

## 6. Ce qu'on ne fait pas

- **Pas de date « en formation depuis »** — `arrived_at` la donne déjà.
- **Pas de recochage automatique** au retrait d'une modèle (§2.3).
- **Pas de badge « en formation » dans Membres** ni ailleurs dans la face Chatteurs.
- **Pas de `ConfirmDialog`** sur « Intégrer » (D3, tranché en chat).
- **Pas de RLS nouvelle** : `in_training` est une colonne de `profiles`, couverte par les policies
  existantes de la table. L'écriture passe par les Server Actions de Membres, déjà gardées.
- **On ne touche pas** au classement, à la roue, aux modules, ni au calcul des points.

---

## 7. Recette

1. **Migration** — `cd packages/db && supabase db push --db-url "$DATABASE_URL"` (jamais `link`,
   cassé sur ce projet). Vérifier `select count(*) from profiles where in_training` = **58** sur la
   prod, et que les profils touchés sont bien tous récents.
2. **Trigger** — rattacher une modèle à un chatteur en formation depuis **Membres**, puis un autre
   depuis le **board Organisation** : les deux doivent le faire basculer d'onglet, et écrire une
   ligne `member_events` kind `integration`.
3. **Trigger, côté encadrant** — assigner une modèle à un manager : son `in_training` (false) ne
   bouge pas, aucun event.
4. **Membres** — créer un chatteur : la case « En formation » est cochée d'origine. Créer un
   manager : la case n'apparaît pas, et la base reste à `false`.
5. **Recrutement** — intégrer un candidat : un seul clic, compte créé, coché **nouveau + en
   formation**, `integrated_at` **null**, et il apparaît dans l'onglet « En formation » de
   l'Overview.
6. **Overview** — l'onglet par défaut est « En formation », l'URL reste propre ; `?vue=agence`
   se partage ; `?vue=nimportequoi` retombe sur « En formation » sans vider l'écran ; `?chatter=`
   affiche toujours la fiche.
7. **Vitest** — `pnpm --filter @glagency/web test` (le `authz.test.ts` de Membres touche à l'objet
   de test) et `pnpm --filter @glagency/core test`.

## 8. Ordre de livraison

Un seul incrément, une seule PR : la migration `0146` **et** les trois features. Les séparer
laisserait une fenêtre où le drapeau existe sans que rien ne le pose (Overview vide), ou où
l'intégration ne rattache plus rien sans que le drapeau prenne le relais (chatteurs perdus, le
problème même qu'on corrige).
