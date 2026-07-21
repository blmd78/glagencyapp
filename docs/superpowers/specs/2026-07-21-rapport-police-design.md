# Spec — Rapport du soir (section Police)

**Date** : 2026-07-21 · **Statut** : design validé, à relire avant plan d'implémentation
**Branche de travail** : à créer depuis `develop` (`feature/rapport-police`)

## Origine

Un « CRM Police » complet a été maquetté hors ligne (`CRM_Police_v4.html`, 9 onglets en
stockage navigateur). L'onglet **Contrôle** correspond exactement au **tracker** déjà livré
(`police_entries`, rôle police). L'onglet **Rapport** est le morceau à porter dans le CRM. Les
7 autres onglets (Fiche, Comparer, Stats, Objectifs, Podium, Bilan) sont **hors périmètre v1**
— plusieurs recoupent des pages existantes, on les rouvrira un par un si besoin.

## Objectif

Donner au rôle **police** un **rapport du soir structuré**, par modèle, dont le cœur est le
**suivi individuel de chaque chatteur**. Là où la maquette ne notait qu'un champ texte libre
« chatters travaillés », on descend au niveau chatteur : le police sélectionne les chatteurs
qu'il a suivis et note **chacun**. Le rapport porte aussi les chiffres du modèle pour le soir.

Ce n'est **pas** le Dashboard existant (`daily_reports`) : celui-là est un compte rendu texte
libre, un par personne et par jour, pour tout le monde. Le rapport police est **structuré**,
rattaché à un **modèle** et à des **chatteurs**, et il partage l'accès du Tracker
(page « Police »).

## Décisions validées (brainstorming 2026-07-21)

| Sujet | Choix |
|---|---|
| Accès | **Partagé avec le Tracker** — une seule case « Police » (slug `police`) donne les deux, pas de droit séparé |
| Qui rédige | **Qui a le droit d'écriture sur la page « Police »** : police, managers avec la page, admins — exactement comme le tracker |
| Granularité | **Un rapport par (auteur, modèle, jour)** — unique, ré-éditable dans la journée |
| Cœur | **Suivi par chatteur** : une observation par chatteur suivi ce soir-là |
| Niveau modèle | Chiffres **saisis à la main** : CA du jour, non traitées, absents, + une alerte |
| CA | **Saisi**, jamais dérivé de MyPuls (reflète ce qui est observé le soir) |
| Lecture | **Ses modèles** (périmètre `profile_creators`) — comme le Tracker ; **admin/superadmin voient tout** |
| Emplacement | Item **« Rapport »** dans la catégorie sidebar **« Police »**, **en dessous** de « Tracker » (placement provisoire, ajustable) |
| Champs par chatteur | **Deux champs par chatteur** : « 👍 a marché » + « 🔧 à régler » (repris de la maquette, mais appliqués **au niveau chatteur** — chaque chatteur suivi = un mini-rapport ; révision 2026-07-21) |

## 1. Données — migration `0071_police_reports.sql`

Deux tables liées (modèle du planning repos : un en-tête + des lignes).

```sql
-- En-tête : un rapport par police, par modèle, par soir.
create table public.police_reports (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.profiles(id) on delete cascade,  -- qui a rédigé (police, manager, admin)
  creator_id   uuid not null references public.creators(id)  on delete cascade,
  day          date not null,
  -- Chiffres du modèle, saisis. `not null default 0` + check : 0 = « rien à signaler »,
  -- pas « non renseigné » (choix assumé, cohérent avec la saisie de la maquette).
  ca           integer not null default 0 check (ca >= 0),
  non_traitees integer not null default 0 check (non_traitees >= 0),
  absents      integer not null default 0 check (absents >= 0),
  alerte       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (author_id, creator_id, day)   -- un seul rapport par auteur/modèle/soir → upsert
);

-- Lignes : un mini-rapport par chatteur suivi (« a marché » / « à régler »).
create table public.police_report_lines (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.police_reports(id) on delete cascade,
  chatter_id  uuid not null references public.chatters(id)       on delete cascade,
  a_marche    text,                     -- 👍 ce qui a marché pour ce chatteur ce soir
  a_regler    text,                     -- 🔧 ce qu'il reste à régler
  unique (report_id, chatter_id)        -- un chatteur au plus une fois par rapport
);
```

> **Révision 2026-07-21** — La v1 initiale prévoyait une seule note libre (`observation`).
> Après retour de Benoit, on passe à **deux champs par chatteur** (`a_marche` / `a_regler`),
> repris de la maquette mais portés au niveau chatteur (là où la maquette les gardait globaux).
> `0071` (déjà appliquée UAT) a créé `observation` ; la migration **`0072`** la remplace par
> `a_marche` + `a_regler` (forward-only — on ne réédite pas une migration appliquée).

Conventions : `text` + `check` (jamais d'enum), FK toutes indexées (0055), `updated_at` maintenu
**côté application** comme le reste du repo (`daily_reports`, `planning`) — pas de trigger ici,
il n'y a qu'un écrivain (le police, via Server Actions), contrairement aux `todos` où Claude
écrit en SQL direct.

Index : `police_reports (creator_id, day)` et `(author_id, day)` ; `police_report_lines (report_id)`
et `(chatter_id)`. Pas de colonne `updated_by` : le rapport a un auteur unique (`author_id`), qui
est aussi le seul éditeur — inutile de distinguer.

### Fonctions RLS

Réutilise l'existant, **sans nouvelle fonction** : `can_write_page('police')` (0060 :
`is_admin OR (is_manager AND has_page)`), `is_police()` (0070), `has_page()`, `is_admin()`. Le
**cloisonnement par modèle** (on n'agit que sur ses modèles assignés) est porté **côté
application** par le périmètre `profile_creators` (`lib/scope`), exactement comme le tracker
`police_entries`. La RLS reste le garde-fou d'accès + propriété.

### Policies (modèle de droits)

Le Rapport se garde comme le Tracker (même page `police`), en **additif police** comme `0070` :
- **`police_reports`** :
  - `select` : `is_admin() OR has_page('police')` — la RLS reste large (qui a la page) ; le
    **cloisonnement par modèle en lecture** est fait **côté app** (filtrage par `profile_creators`
    dans le service), exactement comme le Tracker filtre par `chatterIds`. Admin = tout.
  - `insert` / `update` / `delete` : `author_id = auth.uid() AND (can_write_page('police') OR
    (is_police() AND has_page('police')))` — on ne rédige/modifie que **son** rapport ; l'admin
    passe par `can_write_page`. (Un `delete` admin transverse peut être ajouté si besoin.)
- **`police_report_lines`** : héritent de l'en-tête par un `exists` sur `police_reports` (comme
  `planning_blocks` hérite de `plannings`), avec le même prédicat d'écriture.

Le SQL exact (wrapping `(select …)` initPlan pour les appels sans argument de ligne, `revoke`/`grant`)
sera fixé au plan d'implémentation, sur le patron de `0070`.

### Accès (slug de page)

**Pas de nouvelle page** — le Rapport partage le slug `police` du Tracker : cocher « Police »
dans Membres donne accès aux **deux**. Comme les items Spenders partagent tous le slug
`crm-spenders`, l'item « Rapport » porte un `slug: 'police'` explicite (son href
`/chatter/rapport-police` ne doit pas dériver un slug distinct). Rien à ajouter à `PAGE_SLUGS`.

## 2. Feature web

Structure standard (`docs/guidelines-standard-feature.md`), sous `features/police-reports/` :

```
apps/web/src/features/police-reports/
  types.ts                    # PoliceReport, PoliceReportLine, constantes
  schema.ts                   # Zod partagé (en-tête + lignes chatteur)
  services/get-police-reports.ts  # lecture (RLS), scopée par modèle
  actions.ts                  # 'use server' : upsertReport / deleteReport (runAction)
  PoliceReportsTemplate.tsx   # Server Component, data en props
  components/
    report-form.tsx           # 'use client' : choix modèle+date, chiffres, lignes chatteur
    report-history.tsx        # consultation filtrable par modèle / par chatteur
    ...
apps/web/src/app/(dash)/chatter/rapport-police/
  page.tsx                    # requireAccess('police') (même droit que le Tracker)
  loading.tsx
```

- **Saisie** : le police choisit un **modèle** (parmi ses modèles assignés) et une **date** →
  saisit les chiffres → **ajoute les chatteurs suivis** un par un (sélection parmi les chatteurs
  du modèle), chacun avec ses **deux champs** « 👍 a marché » / « 🔧 à régler ». Upsert sur
  `(author_id, creator_id, day)`.
- **Consultation** : historique des rapports, filtrable **par modèle** ou **par chatteur** —
  c'est la vue par chatteur qui donne la valeur (voir l'évolution d'un chatteur sur plusieurs
  soirs).
- **Mutations** en Server Actions via `runAction`, garde miroir de la RLS (réutiliser
  `requirePoliceProfile` du tracker : il accepte déjà police OU manager-avec-page OU admin) + scope modèle (`chatterInScope` / `profile_creators`). Erreurs : `ActionResult`, toasts
  sonner, `fieldErrors` mappés champ par champ.
- **Lecture** : `services/get-police-reports.ts`, client RLS, pas de `use cache` (cookie-bound).

## 3. Navigation

Nouvel item dans `config/workspaces.ts`, groupe `police` (déjà existant) :

```ts
{ href: '/chatter/rapport-police', label: 'Rapport', icon: ClipboardList, slug: 'police', group: 'police' }
```

`slug: 'police'` explicite (partagé avec le Tracker) — rien à ajouter à `PAGE_SLUGS`. Pas
`adminOnly` : la visibilité suit la page « Police » cochée.

## Hors périmètre v1

- Les 7 autres onglets de la maquette : **Fiche chatter** (recoupe la consultation par chatteur
  + le tracker), **Comparer**, **Stats** (recoupe `/chatter/stats`), **Objectifs** (recoupe
  `quotas`), **Podium**, **Bilan IA** (génération d'un bloc texte), **Sauvegarde** (sans objet en
  base).
- CA dérivé de MyPuls : saisi à la main en v1.

## Risques / points d'attention

- **Tracker et Rapport = un seul droit** (page `police`). Qui a « Police » a les deux ; les
  séparer un jour demanderait un nouveau slug + une migration de `profiles.pages`. Choix assumé.
- **`author_id` générique** : l'auteur peut être un police, un manager avec la page, ou un admin.
  Le nom `police_reports` désigne la *section*, pas le rôle de l'auteur.
- **Scope modèle côté app, pas RLS** : suivre exactement le patron du tracker
  (`requirePoliceProfile` + `chatterInScope`) — ne pas réinventer un filtrage RLS par
  `profile_creators` qui divergerait.
- **`creators` vs `chatters`** : `creator_id` = le modèle (table `creators`), `chatter_id` = le
  chatteur (table `chatters`). Ne pas confondre — la maquette les tenait en dur.
- **Migration `0071`** : appliquer sur UAT puis prod **avant** le déploiement du code.
