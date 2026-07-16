# Comptes rendus journaliers (« Dashboard ») — design v1

Date : 2026-07-16 · Statut : validé en brainstorming avec Benoit (à relire)

## Contexte

Aujourd'hui les comptes rendus vivent dans Airtable : une table par personne
(« Résumé Axel »), une date + un gros champ texte libre, rempli irrégulièrement
(dates trouées). On rapatrie ça dans le CRM : une page où admins et managers
écrivent un compte rendu par jour, et où le superadmin lit ceux de tout le monde.

## Décisions produit (actées avec Benoit)

| Décision | Choix |
|---|---|
| Format | **Un seul champ texte libre** (pas de formulaire structuré) + placeholder incitatif |
| Fréquence | 1 compte rendu **par personne et par jour** (unique), modifiable (upsert) |
| Rattrapage | La date est choisissable (défaut = aujourd'hui), **jamais dans le futur** |
| Qui écrit | Quiconque a le **droit de page** `dashboard` coché (admins d'office) — pas de test sur le rôle |
| Qui lit | Chacun **le sien uniquement** (admin compris) ; **superadmin voit tout** |
| Affichage | **Cards** antéchrono ; pour le superadmin, groupées par jour avec le nom de l'auteur |
| Nom de la page | Label sidebar **« Dashboard »**, au-dessus de Membres (item `bottom`) |
| Résumé IA | **Hors v1** (voir « Hors périmètre ») |
| Cron | **Hors v1** |

**À reconfirmer par Benoit plus tard (hors v1, non bloquant) :**
- Est-ce que les admins doivent voir les comptes rendus de leurs managers ?
  (évolution = une ligne de policy RLS)
- Périmètre du futur résumé IA : admins seuls, ou admins + managers, ou deux résumés.

⚠️ Nommage assumé : le label « Dashboard » coexiste avec l'item « Overview »
(icône `LayoutDashboard`, `workspaces.ts:87`) qui est le dashboard analytique.
Choix explicite de Benoit (vocabulaire d'équipe). Table et feature gardent un
nom de domaine (`daily_reports` / `features/reports/`).

## Correspondance des noms

| Couche | Nom |
|---|---|
| Route / slug d'accès | `/chatter/dashboard` · slug `dashboard` |
| Label sidebar | Dashboard (icône `NotebookPen`) |
| Table Postgres | `daily_reports` |
| Feature | `apps/web/src/features/reports/` |

## 1. Base — migration `0047_daily_reports.sql`

Dossier `packages/db/supabase/migrations/`. Le dernier numéro sur `main` est
`0046_overview_report.sql` → **0047**. (0040-0042 sont occupés par des contenus
*différents* sur `wip/compta-spenders-relances` — on n'y touche pas.)

```sql
create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, day)
);

alter table public.daily_reports enable row level security;
```

Pas d'enum (règle projet : jamais de `create type enum`). Pas de check de rôle
en base : le droit d'écrire est porté par le droit de page.

**Policies** (modèle : `0030_chatter_plannings.sql:42` — donnée par membre) :

```sql
-- Lecture : chacun le sien, superadmin tout.
create policy daily_reports_read on public.daily_reports
  for select to authenticated
  using (public.is_superadmin() or profile_id = (select auth.uid()));

-- Écriture (insert/update/delete) : le sien uniquement, si droit de page.
-- is_admin() couvre le superadmin (0037) ET neutralise le bug connu de
-- has_page() sur main (un superadmin ne passe pas has_page — corrigé
-- seulement en prod à la main + sur la branche wip, cf. 0040_has_page_superadmin).
create policy daily_reports_ins on public.daily_reports
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and (public.is_admin() or public.has_page('dashboard'))
  );

create policy daily_reports_upd on public.daily_reports
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (
    profile_id = (select auth.uid())
    and (public.is_admin() or public.has_page('dashboard'))
  );

create policy daily_reports_del on public.daily_reports
  for delete to authenticated
  using (
    profile_id = (select auth.uid())
    and (public.is_admin() or public.has_page('dashboard'))
  );
```

Conventions respectées : `(select auth.uid())` entre parenthèses (initplan),
helpers `SECURITY DEFINER` existants (`is_admin` `0037:18`, `is_superadmin`
`0037:29`, `has_page` `0017:25`).

**Workflow d'application (règle repo, `docs/guidelines-data-loading.md`) :
appliquer la migration en prod AVANT de pusher le code, puis `pnpm db:types`**
(régénère `packages/db/src/types.ts`).

## 2. Accès & navigation — `config/workspaces.ts`

1. `PAGE_SLUGS` (ligne 152) : ajouter `'dashboard'`.
2. Nav face chatteurs, **inséré avant Membres** (ligne 113) pour apparaître
   au-dessus dans la zone `bottom` :

```ts
{ href: '/chatter/dashboard', label: 'Dashboard', icon: NotebookPen, bottom: true },
```

Pas de `adminOnly` → le slug apparaît automatiquement dans `PAGE_CHOICES`
(cases à cocher de la page Membres) : Benoit coche « Dashboard » à ses managers.
Face chatteurs uniquement en v1 (le miroir marketing = 1 fichier de 3 lignes si
besoin plus tard).

## 3. Route — `app/(dash)/chatter/dashboard/`

Pattern exact de Membres (`chatter/members/page.tsx`) :

```tsx
// page.tsx (RSC)
export default async function DashboardPage() {
  const profile = await requireAccess('dashboard')
  const data = await getReports(profile)
  return <ReportsTemplate data={data} profile={profile} />
}
```

+ `loading.tsx` avec `PageSkeleton`.

## 4. Feature — `apps/web/src/features/reports/`

Convention `app → feature(template) → composants`, **aucun fetch dans la feature**.

```
features/reports/
├── ReportsTemplate.tsx        Server Component — layout : form + liste
├── schema.ts                  zod partagé client (RHF) ↔ serveur
├── types.ts
├── actions.ts                 'use server'
├── components/
│   ├── report-form.tsx        'use client'
│   └── reports-list.tsx       cards
└── services/
    └── get-reports.ts
```

**`report-form.tsx`** (client) :
- textarea, placeholder : « Ce que tu as fait aujourd'hui, ce qui bloque,
  ce qui est prévu demain… » (oriente le contenu sans structurer — le futur
  résumé IA a besoin des blocages, pas seulement de la liste des réunions)
- sélecteur de date, défaut aujourd'hui, **borné à la fenêtre affichée**
  (min = aujourd'hui − 30 j, max = aujourd'hui) : rattrapage possible, futur
  interdit, et impossible d'écraser à l'aveugle un compte rendu plus ancien
  que ce que la liste affiche
- si un compte rendu existe déjà pour la date choisie → le form le pré-remplit
  (édition, pas doublon)
- soumission via `ActionButton` (règle app : loader + disabled pendant l'action)
- le superadmin n'écrit pas : le form n'est pas rendu pour lui (v1)

**`reports-list.tsx`** :
- cards antéchrono (le contenu texte respecte les sauts de ligne —
  `whitespace-pre-wrap`)
- vue « moi » (admin/manager) : ses propres cards, date en tête
- vue superadmin : groupé par jour, une card par auteur avec `display_name`
- suppression : sur sa propre card uniquement, via `ConfirmDialog`
  (règle app : jamais de delete au clic direct)

**`schema.ts`** (zod) :
- `day` : string `YYYY-MM-DD`, dans `[aujourd'hui − 30 j, aujourd'hui]` — même
  borne que le sélecteur, revalidée côté serveur (**aujourd'hui calculé côté
  serveur en Europe/Paris** — piège de fuseau documenté dans le repo : jamais
  de `current_date` implicite)
- `content` : trim, min 1, max 10 000 caractères

**`actions.ts`** — pattern standard du repo (`features/members/actions.ts`) :
- `'use server'` en tête de fichier
- retour `{ success: true } | { success: false; error: string }`, jamais de throw
- `upsertReport(input)` : `safeParse` zod → `createClient()` (session, **RLS =
  enforcement réel**) → `.upsert(..., { onConflict: 'profile_id,day' })` +
  `updated_at: now` → `revalidatePath('/chatter/dashboard')`
- `deleteReport(id)` : delete par id (la RLS garantit « le sien uniquement »)
  → `revalidatePath`
- pas de `createAdminClient()` : aucune API service-role nécessaire

**`services/get-reports.ts`** :
- fenêtre glissante **30 jours**, `order day desc`
- si `profile.superadmin` : tout le monde (la RLS l'autorise), avec jointure
  `profiles(display_name, email)` pour l'auteur ; sinon la RLS ne renvoie que
  les siens — même requête, pas de branchement de sécurité côté TS
- volume ~15 rédacteurs × 30 j ≈ 450 lignes < plafond PostgREST 1000 → pas de
  RPC ni `fetchAll` en v1 ; **si la fenêtre s'élargit un jour, `fetchAll`
  devient obligatoire** (règle repo : troncature silencieuse à 1000)

## 5. Erreurs

- Erreurs d'action affichées dans le form (pattern Membres) ; le doublon
  même-jour est absorbé par l'upsert (pas d'erreur d'unicité visible)
- `ConfirmDialog` : `onConfirm` retourne la string d'erreur → le dialog reste
  ouvert (comportement natif du composant, `confirm-dialog.tsx:52`)

## 6. Hors périmètre v1 — préparé, non construit

- **Résumé IA** : viendra en Route Handler `app/api/…/route.ts` (le CLAUDE.md
  réserve les Route Handlers aux cas IA/webhooks — pas une Server Action).
  `ANTHROPIC_API_KEY` déjà réservée dans `.env.example:17`, aucun SDK installé.
  Le résumé sera **généré puis stocké** (table à part, ex. `daily_report_summaries`)
  pour que tous les superadmins lisent exactement le même texte (un LLM n'est
  pas déterministe). Déclenchement : bouton superadmin d'abord, cron Vercel
  ensuite (~6 lignes dans `vercel.json`, qui ne contient aujourd'hui que
  `regions` — l'app est déployée sur **Vercel**, plus sur Cloudflare Workers).
- **Lecture manager → admin** : une ligne de policy à ajouter si Benoit confirme.
- Rien dans le schéma v1 ne bloque ces évolutions.

## 7. Vérification

- `pnpm lint` + `tsc` (build)
- Test manuel 3 profils : manager avec page cochée (écrit/voit les siens),
  admin (écrit/voit les siens **uniquement**), superadmin (voit tout, n'écrit pas)
- Test RLS négatif rapide : un `user` sans la page cochée ne peut ni lire ni
  écrire (requête directe)
- Pas de tests runtime feature (le repo n'en a pas sur les features — pgTAP
  est au backlog observabilité, pas dans cette v1)

## 8. Ordre d'implémentation

1. Migration `0047` → **appliquer en prod** → `pnpm db:types`
2. `config/workspaces.ts` (slug + nav)
3. Feature `features/reports/` (schema → services → actions → composants → Template)
4. Route `app/(dash)/chatter/dashboard/` (+ `loading.tsx`)
5. Vérification (§7)

## Contraintes process

- **Aucun commit / push sans accord explicite de Benoit** (y compris ce doc).
- Ne pas toucher : branche `wip/compta-spenders-relances`, worktree
  `snap-crypto` (périmé mais il modifie `config/workspaces.ts` — travailler
  uniquement dans l'arbre principal).
- Ne pas toucher au design/styling existant ; la page suit les composants en
  place (cards shadcn, `KpiGrid`-like sobriété, zéro ornement).
