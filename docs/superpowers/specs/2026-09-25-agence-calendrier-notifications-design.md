# Agence — calendrier des événements et cloche de notifications

**Date** : 2026-09-25 · **Statut** : à valider par Benoit · **Migration** : `0175`

## 1. Le besoin

Ce qu'a demandé Benoit :
- un **calendrier global** pour les événements de l'agence (mises en avant, etc.) ;
- un onglet **« Agence »** dans la sidebar de la partie Chatteurs, **au-dessus de Membres** ;
- les **admins** y ajoutent des événements avec un bouton ; **tous les autres** y ont accès en **lecture** ;
- une **cloche en haut à droite**, avec un menu déroulant des nouveautés et un lien vers Agence, pour que tout le monde voie les news.

Le critère de réussite : un chatteur apprend qu'une mise en avant arrive **sans passer par Discord ou WhatsApp**, grâce à la cloche, et retrouve tout dans Agence.

## 2. Les décisions (validées dans le chat)

| Sujet | Décision |
|---|---|
| Qui publie | Les **admins** seuls (superadmin compris) |
| Qui voit | **Tout le monde** par défaut, dans les 3 parties. Par événement, l'admin peut **restreindre à certains rôles** |
| Un événement | Un **nom**, sur **un jour** ou sur **une période**, plus une case **« Rappeler le jour J »** |
| La cloche s'allume | À chaque **nouvel événement publié**, pour les rôles visés, et **le jour J** si le rappel est coché |
| La cloche s'éteint | À l'**ouverture du menu** : le compteur retombe à 0 |
| Modification | Ne renotifie personne |
| Suppression | L'événement disparaît du calendrier et de la cloche |
| Mise à jour de la cloche | À chaque changement de page, comme les pastilles de la sidebar. Pas de temps réel |
| Calcul | **À la volée**, depuis l'heure de la dernière ouverture de la cloche. Aucune ligne créée par personne, aucun robot de nuit |

**Hors périmètre** (on les ajoutera si le besoin se confirme) : catégories et couleurs, modèles
concernées, description, ciblage par modèle, marquer les nouveautés une par une, temps réel,
notifications hors de l'app (Discord, e-mail).

## 3. Ce que les gens voient

Tout en composants shadcn existants (`components/ui/*`), sans nouvelle dépendance.

### 3.1 L'onglet « Agence » — `/chatter/agence`

- **Sidebar** : un item direct `Agence` (icône `CalendarDays`), placé **juste au-dessus de Membres**
  (`bottom: true`). Il est visible par **tout profil connecté**, sans case à cocher dans Membres.
- **En-tête** : le titre « Agence ». Pour un admin, un bouton `outline sm` **« Ajouter un événement »**.
- **Calendrier du mois** : une grille de 7 colonnes (lundi → dimanche), avec ◀ ▶ et un bouton
  « Aujourd'hui ». Le mois affiché est dans l'URL (`?mois=AAAA-MM`, défaut = le mois en cours, heure
  de Paris). Chaque événement est une **barre** qui couvre ses jours ; une période qui passe d'une
  semaine à l'autre se coupe en deux barres, une par ligne. Le jour courant est souligné.
- **Clic sur un événement** :
  - un **admin** ouvre la même fenêtre en mode édition, avec **« Supprimer »** (confirmation
    `AlertDialog`) ;
  - les autres voient un `Popover` en lecture : le nom et les dates.

### 3.2 La fenêtre « Ajouter / modifier un événement » (`Dialog`)

| Champ | Composant | Règle |
|---|---|---|
| Nom | `Input` | obligatoire, 1 à 120 caractères |
| Jour / Période | `ToggleGroup` à 2 choix | défaut : Jour |
| Date | `Popover` + `Calendar` (`mode="single"`) si Jour ; `mode="range"` si Période | obligatoire ; en Période, fin ≥ début |
| Rappeler le jour J | `Checkbox` | défaut : décoché |
| Visible par | `ComboboxMultiple` : Chatteurs, Sous-managers, Managers, Police | défaut : tous cochés ; au moins un |

Formulaire : **RHF + `zodResolver` + schéma partagé dans `features/agency/schema.ts`**, le même objet
pour le formulaire et pour `runAction`, comme `features/chatters` (cf.
`docs/guidelines-standard-feature.md` §5). Un seul schéma : en mode Jour, le formulaire envoie
`startDate = endDate`. Erreur serveur sur `form.setError('root', …)`, `form.reset(…)` à la réouverture.

### 3.3 La cloche — dans la barre du haut, sur les 3 parties

- Elle se place dans `app/(dash)/layout.tsx`, **à gauche du sélecteur de dates** (`ml-auto` du
  header), dans son propre `<Suspense>`. Le compteur est lancé sans `await` dans `DashDynamic`,
  exactement comme les pastilles Insights / Recrutement / Ma roue.
- Un `Button` fantôme avec l'icône `Bell` et une **pastille** portant le nombre de non-vus (masquée à 0).
- **À l'ouverture** (`DropdownMenu`) :
  - les **10 dernières nouveautés**, chacune sur une ligne :
    - « Nouvel événement · *Mise en avant Juliette* · 12 → 14 oct. »
    - « C'est aujourd'hui · *…* » pour un rappel ;
  - chaque ligne mène à `/chatter/agence?mois=…` ;
  - en bas, **« Tout voir dans Agence »** ;
  - l'ouverture appelle la Server Action `markNotificationsSeen` : la pastille passe à 0 tout de suite
    à l'écran, et en base au retour de l'action.
- Menu vide : « Aucune nouveauté. »

## 4. Données — migration `0175_agence_evenements.sql`

Convention du projet : `text` + `check`, jamais d'`enum`.

**`agency_events`**

| Colonne | Type | Règle |
|---|---|---|
| `id` | `uuid` pk | `gen_random_uuid()` |
| `title` | `text` | `check (length(btrim(title)) between 1 and 120)` |
| `start_date`, `end_date` | `date` | `check (end_date >= start_date)` |
| `remind_on_day` | `boolean` | défaut `false` |
| `audience` | `text[]` | défaut `{chatteur,sous-manager,manager,police}` ; `check` : sous-ensemble de ces 4, au moins 1 |
| `created_by` | `uuid` → `profiles` | `on delete set null` |
| `created_at`, `updated_at` | `timestamptz` | défaut `now()` |

Index sur `(start_date)` et `(end_date)`.

**`agency_notification_seen`** : `profile_id uuid pk → profiles on delete cascade`, `seen_at timestamptz not null default now()`.

**RLS**
- `agency_events` :
  - **lecture** si `is_admin()` ou si le rôle de l'appelant est dans `audience` ;
  - **aucune policy d'écriture** : les écritures passent en service-role après la garde admin des
    Server Actions, comme le reste du projet.
- `agency_notification_seen` : lecture et écriture de **sa propre ligne** (`profile_id = auth.uid()`).

**RPC `agency_notifications(p_limit int default 10)`** — `security invoker`, rend du `jsonb`
`{ unread, items[] }`. La RLS des événements s'applique donc à l'appelant.
- **Nouveauté « événement »** : un événement visible, daté de sa création (`created_at`).
- **Nouveauté « rappel »** : un événement visible avec `remind_on_day`, dont `start_date` ≤ aujourd'hui
  (heure de Paris), daté de **00:00 Paris du jour J**. Il est omis si l'événement a été créé ce
  jour-là ou après : sa notice « nouvel événement » suffit.
- Seules les nouveautés **passées** (`date ≤ now()`) et des **30 derniers jours** comptent.
- `unread` = le nombre de nouveautés **postérieures à `seen_at`**, toutes si la personne n'a jamais
  ouvert la cloche. `items` = les `p_limit` plus récentes.

**Types** : régénérer `packages/db/src/types.ts` après application (via le pooler, cf. `AGENTS.md`).

## 5. Code

```
apps/web/src/
├── app/(dash)/chatter/agence/page.tsx       → getAgencyMonth(mois) → <AgencyTemplate>
├── features/agency/
│   ├── AgencyTemplate.tsx                   Server Component : en-tête + calendrier
│   ├── schema.ts                            eventInput (Zod, partagé form ↔ action)
│   ├── actions.ts                           createEvent / updateEvent / deleteEvent (admin)
│   ├── month-layout.ts (+ .test.ts)         PUR : événements → semaines → barres
│   ├── services/get-agency-month.ts         lecture RLS, bornée à la grille affichée (≤ 42 j)
│   └── components/                          month-grid, event-dialog.client, event-popover
├── lib/notifications/
│   ├── get-notifications.ts                 appelle la RPC (lu par le layout)
│   └── actions.ts                           markNotificationsSeen (upsert de sa ligne)
├── components/notification-bell.client.tsx  la cloche (DropdownMenu)
└── config/workspaces.ts                     item Agence + flag `everyone`
```

- **Accès** : on ajoute un flag `everyone?: boolean` à `NavItem`, que `canAccessNav` laisse passer pour
  tout profil. Ce n'est pas un `PageSlug`, donc pas de case dans Membres. La page est gardée par la
  session seule ; les contrôles d'écriture n'apparaissent que si `profile.role === 'admin'`.
  L'item est `bottom: true` : il ne devient jamais la page d'atterrissage de quelqu'un.
- **Écritures** : `runAction` + garde admin (`requireAdmin`), puis client service-role.
  `revalidatePath('/chatter/agence')`.
- **Lecture du calendrier** : client utilisateur (RLS), filtrée sur la grille affichée
  (`end_date >= début de grille` et `start_date <= fin de grille`). La table reste petite, quelques
  événements par mois ; le filtre de dates est la borne.

## 6. Erreurs et cas limites

- Cloche en échec : `.catch(() => null)`, la cloche s'affiche **sans pastille**, jamais d'écran cassé,
  comme les autres badges.
- Événement supprimé entre l'affichage et le clic : la ligne de la cloche mène au mois ; il n'y est
  simplement plus.
- Rôle sans aucun événement visible : le calendrier s'affiche vide et la cloche reste à 0.
- Superadmin : traité comme admin partout (`is_admin()` et `profile.role`).

## 7. Tests

- **Vitest** :
  - `month-layout.ts` : un jour seul, une période qui passe d'une semaine à l'autre, une période qui
    déborde du mois, plusieurs événements le même jour (empilés) ;
  - `schema.ts` : Jour / Période, fin avant début refusée, audience vide refusée, nom vide refusé.
- **SQL, sur l'UAT** :
  - un chatteur ne voit que les événements qui visent son rôle ;
  - l'admin voit tout ;
  - le rappel du jour J apparaît à 00:00 Paris ;
  - `markNotificationsSeen` remet `unread` à 0.
- Typecheck, lint et build web.

## 8. Mise en prod

1. Migration `0175` sur l'UAT, puis les types ; en prod **sur go explicite**.
2. Merge : Vercel. Aucun changement du worker d'ingestion.
