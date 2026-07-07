# Design — Feature « Police » (tracker sanctions chatteurs)

> Date : 2026-07-07 · Statut : **design validé** (Benoit) · Feature : `apps/web/src/features/police`

## 1. Objectif

Porter le « Tracker sanctions » (aujourd'hui un HTML localStorage, `Chatting_Tracker_Formation.html`)
dans le CRM Chatter, en base, rattaché par `chatter_id`, pour que la **compta** puisse en repiquer
les malus plus tard. **Scope MVP = tracker sanctions uniquement** (la partie « Formation / Bible du
chatting » du HTML est hors scope).

Logique métier (voulue par Benoit, diverge du HTML) : on **logge des avertissements ligne par
ligne** au fil des contrôles ; quand un contrôleur voit qu'un chatteur **a déjà été averti**, il
décide **manuellement** un **malus** et son montant. Pas de sanction 5 € automatique.

## 2. Décisions actées (brainstorming)

- **Deux types de lignes** dans un même journal : `warning` (avertissement, sans montant) et
  `malus` (montant € décidé à la main + raison).
- **Chaque erreur = une ligne** ajoutée à l'historique (même erreur 2× = 2 lignes).
- **Vue par JOUR** : historique du jour qui s'accumule, navigation jour par jour. Les saisies
  s'ajoutent au **jour affiché** (aujourd'hui par défaut).
- **Contrôleur = utilisateur connecté** (auto, `controller_id = profile`). Les policiers ont un
  compte CRM et reçoivent le droit **`police`** via Membres.
- **Montant du malus = manuel** (le contrôleur décide), pas de 5 €/sanction auto.
- **Droits** : saisie (avertissement + malus) **et modification** = accès `police`.
  **Suppression = admin uniquement**.
- **`shift`** (matin/aprem/soir) conservé en **option** (métadonnée nullable sur la ligne).
- **11 types d'erreurs** codés en dur (`POLICE_ERRORS`), repris du HTML.
- **Hook compta hors scope** mais table pensée pour : `SUM(amount_eur) WHERE kind='malus'` par
  `chatter_id` + `occurred_on` → `compta_day_entries.malus`.

## 3. Modèle de données (migration `0023_police_entries.sql`)

```sql
create table police_entries (
  id            uuid primary key default gen_random_uuid(),
  chatter_id    uuid not null references chatters(id) on delete cascade,
  controller_id uuid references profiles(id) on delete set null,  -- qui a saisi (connecté)
  occurred_on   date not null default current_date,               -- jour (clé compta)
  kind          text not null check (kind in ('warning','malus')),
  error_key     text,                                             -- warning : type d'erreur
  amount_eur    numeric(10,2) not null default 0,                 -- malus : montant décidé
  note          text,                                             -- raison (surtout malus)
  shift         text check (shift in ('matin','aprem','soir')),   -- optionnel
  created_at    timestamptz not null default now(),
  -- cohérence : un warning porte un error_key et 0 €, un malus porte un montant.
  check ((kind = 'warning' and error_key is not null and amount_eur = 0)
      or (kind = 'malus'   and amount_eur >= 0))
);
create index police_entries_day_idx on police_entries (occurred_on);
create index police_entries_chatter_idx on police_entries (chatter_id, occurred_on);
```

**RLS** (helpers existants `has_page` / `is_admin`, cf. 0008/0017) :
```sql
alter table police_entries enable row level security;
create policy police_read   on police_entries for select to authenticated using (public.has_page('police'));
create policy police_insert on police_entries for insert to authenticated with check (public.has_page('police'));
create policy police_update on police_entries for update to authenticated
  using (public.has_page('police')) with check (public.has_page('police'));
create policy police_delete on police_entries for delete to authenticated using (public.is_admin());
```

**Types d'erreurs** (`POLICE_ERRORS`, codés en dur dans `types.ts`) — repris du HTML :
1. `media_argent` — Parle de média/argent directement
2. `reactivite` — Réponse > 45 s par sub
3. `media_rapide` — Envoi de média trop rapide
4. `fautes` — Fautes d'orthographe
5. `setter_lent` — Ne récupère pas vite les nouveaux (setter)
6. `hors_script` — Ne suit pas l'histoire du script
7. `sexu_faible` — Sexualisation faible (ne fait pas baver)
8. `promesse` — Promesse non tenue (setter)
9. `temps_media` — N'attend pas le temps du média
10. `infos_non_transmises` — Ne transmet pas les infos
11. `infos_non_notees` — Ne note pas les infos

## 4. Serveur (`features/police`)

### 4.1 `services/get-police.ts`
- Entrée : `day` (YYYY-MM-DD, défaut = aujourd'hui). Retourne un `PoliceData`.
- Charge les `police_entries` du jour (`occurred_on = day`, `order by created_at`) via client RLS.
- Résout `chatterById` + `controllerById` (noms) et `chatterOptions` (actifs) via **client admin**
  (comme repos — les policiers voient tous les chatteurs).
- Compte les avertissements récents par chatteur (`warningsByChatter`, fenêtre 30 j) pour éclairer
  la décision « déjà averti ».
- KPIs du jour : `totalMalusEur`, `warningCount`, `chattersConcerned`.
- Liste des jours pour le sélecteur (aujourd'hui + N jours passés).

### 4.2 `actions.ts` (Server Actions, garde `has_page('police')`)
- `addPoliceWarning({ day, chatterId, errorKey, shift? })` — insert `kind='warning'`.
- `addPoliceMalus({ day, chatterId, amountEur, note?, shift? })` — insert `kind='malus'`.
- `updatePoliceMalus({ id, amountEur, note? })` — édition d'un malus (accès `police`).
- `deletePoliceEntry({ id })` — **admin only** (garde `role='admin'` + policy RLS delete `is_admin`).
- Toutes : `controller_id = profile.id`, `revalidatePath('/chatter/police')`. Zod pour les entrées.

## 5. Client (`features/police`)

- `page.tsx` (`/chatter/police`) : `requireAccess('police')` → `getPolice(day)` →
  `<PoliceTemplate data isAdmin />`.
- **`PoliceTemplate`** : sélecteur de **jour** (haut droite) + les blocs ci-dessous.
- **Historique du jour** (haut) : feed accumulant, une ligne = chatteur · ⚠️ avertissement + type,
  ou 🚨 malus + montant · contrôleur · heure. Suppression (poubelle) visible seulement si `isAdmin`.
- **Ajouter un avertissement** : select chatteur + select type d'erreur (11) + shift optionnel →
  `addPoliceWarning`.
- **Infliger un malus** : select chatteur (affiche son nb d'avertissements récents) + montant € +
  note → `addPoliceMalus`.
- **KPIs du jour** : total malus €, nb avertissements, nb chatters concernés.
- Mise à jour optimiste + `useTransition` (comme repos).

## 6. Navigation & permission
- `config/workspaces.ts` : ajouter `{ href: '/chatter/police', label: 'Police', icon: ShieldAlert }`
  à la nav Chatter, et **`'police'`** à `PAGE_SLUGS` (→ cochable dans Membres).

## 7. Hors périmètre
- Partie « Formation / Bible du chatting » du HTML.
- Intégration compta (le repiquage `SUM(malus)` → `compta_day_entries.malus`) — préparé, pas fait.
- Barème automatique (5 €/sanction), escalade automatique après N avertissements.
- Référentiel éditable des types d'erreurs (codés en dur en v1).

## 8. Fichiers touchés
- `packages/db/supabase/migrations/0023_police_entries.sql` (nouveau) + types DB régénérés.
- `apps/web/src/config/workspaces.ts` (nav + `PAGE_SLUGS`).
- `apps/web/src/app/(dash)/chatter/police/page.tsx` (nouveau).
- `apps/web/src/features/police/types.ts` (nouveau) — `POLICE_ERRORS`, `PoliceData`, etc.
- `apps/web/src/features/police/services/get-police.ts` (nouveau).
- `apps/web/src/features/police/actions.ts` (nouveau).
- `apps/web/src/features/police/PoliceTemplate.tsx` (nouveau).
- `apps/web/src/features/police/components/*` (feed, form avertissement, form malus).
