# Formation — incrément 3 : Roue des récompenses (design)

**Statut** : validé en chat le 2026-08-19 (Benoit), à implémenter sur `feature/formation-catalogue`
(migration **0122**, UAT seulement, prod avec la release).
**Précédents** : `2026-08-17-formation-catalogue-design.md` (incrément 1),
`2026-08-18-formation-entrainement-design.md` (incrément 2 — sessions, classement, Ma formation, Overview).

## 1. Contexte et décisions

Good Luck Agency (GLA) a une « Roue de la chance » (`/roue`, `index.html` l.2817+) : l'admin l'ouvre
depuis son menu, **n'importe qui tourne autant qu'il veut, rien n'est enregistré**. Mécanique en deux
temps : la roue tire « Cadeau » (80 %) ou « Raté » (20 %) ; sur Cadeau un **coffre** tire le lot réel
parmi des lots pondérés (défaut GLA : 5 $ 60 %, 10 $ 20 %, day off 5 %, 20 $ 5 %, « donner 5 $ à un
membre de ton équipe » 10 %). Config admin (`/api/config` : `wheelPrizes`, `chestPrizes`, `wheelTitle`).

Décisions prises en chat (2026-08-19) :
- **Mécanique GLA conservée** (roue Cadeau/Raté → coffre), lots configurables par l'admin, montants en
  **euros** (cohérence avec la compta) — défaut GLA converti tel quel en €.
- **Le tour se gagne au classement hebdomadaire** : top 3 de la semaine (lundi → dimanche, Europe/Paris)
  → 1 ticket la semaine suivante. Un seul ticket en attente par personne, sans expiration. Un admin
  pourra en offrir un à la main plus tard (colonne prévue, pas de bouton en v1).
- **Tout est enregistré** : tickets et tirages (libellé du lot, `amount_eur` nullable, semaine,
  `paid_at`/`paid_by` vides) — c'est la base d'une remontée compta par période **plus tard** (hors
  périmètre ici). Une ligne `recompense` s'écrit aussi dans le journal du membre (`member_events`).
- **Tirage côté serveur** (pondéré), le client ne fait qu'animer — pas de triche possible.
- **Une seule entrée « Roue »** dans la sidebar Formation, page qui s'adapte au rôle : chatter (tourner,
  mes gains), encadrant `frm-suivi` (historique de tous), admin (+ dialog Configurer).
- **Ma formation → Classement** gagne un sélecteur « Cette semaine / Semaine dernière / Global ».
- Front : **RSC au maximum**, feuilles client au plus bas, **aucune lib d'animation** — SVG + CSS natifs.
  La roue est colorée (c'est le jeu, seule exception assumée à la DA sobre) ; le reste de la page reste
  dans la DA du CRM.

Hors périmètre : remontée compta / paiement (on stocke seulement), tickets automatiques autres que le
classement, notifications, sons.

## 2. Règles

- **Semaine** = lundi 00:00 → dimanche 23:59:59 Europe/Paris ; clé = date du lundi (`mondayOf`).
- **Points de la semaine d'un chatter** = Σ, par cas hors boss, du **meilleur total** obtenu sur les
  sessions `scored` dont `scored_at` tombe dans la semaine. `cases_done` de la semaine = nombre de cas
  distincts notés. Tri : points desc, moyenne desc, premier `scored_at` asc. Seuls les chatters
  (`role = 'chatteur'`, `frm-entrainement`) comptent, comme `training_ranking`.
- **Ticket** : le lundi de la semaine W (ou après), un chatter classé top 3 de la semaine W-1 avec
  points > 0 obtient un ticket `week = W-1`, motif « Top N — semaine du JJ/MM ». Règles : pas de ticket si
  un ticket non utilisé existe déjà (pas de cumul) ; une seule attribution par (profil, semaine)
  (index unique). L'attribution est **paresseuse** : la page Roue affiche l'éligibilité, et le client
  appelle `claimTicket()` au montage si éligible sans ticket ; le serveur revérifie et insère. Pas de cron.
- **Tirage** : `spinWheel({ ticketId })` → ticket du chatter, non utilisé → tirage pondéré (`crypto`) de
  la roue (secteur `lose` ou non), puis du coffre si gagnant → `used_at` posé, ligne `training_wheel_spins`
  écrite (Raté compris : `won = false`, pas de lot). Un « Raté » **consomme** le ticket (c'est le
  risque des 20 % ; l'admin peut mettre son poids à 0).
- **Config** : 1 ligne. Secteurs `[{ label, weight, lose }]` (au moins un secteur non perdant, poids > 0),
  lots `[{ label, weight, amount_eur | null }]` (au moins un lot), `title`. Validation Zod côté action.
- **Sidebar** : pastille « 1 » sur Roue = ticket non utilisé OU éligibilité non réclamée (calcul lecture
  seule, RPC, streamé comme le badge Insights).

## 3. Modèle de données (migration `0122_training_wheel.sql`)

```sql
create table public.training_wheel_config (
  id          smallint primary key default 1 check (id = 1),
  title       text not null default 'Roue de la chance',
  sectors     jsonb not null,   -- [{ "label": "Cadeau", "weight": 80, "lose": false }, { "label": "Raté", "weight": 20, "lose": true }]
  prizes      jsonb not null,   -- [{ "label": "5 €", "weight": 60, "amount_eur": 5 }, …]
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);
insert into public.training_wheel_config (id, sectors, prizes) values (1, '[…défaut GLA…]', '[…défaut GLA en €…]');

create table public.training_wheel_tickets (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  week        date not null,                       -- lundi de la semaine récompensée
  reason      text not null,                       -- « Top 2 — semaine du 11/08 » / « Offert par Benoit »
  granted_by  uuid references public.profiles(id) on delete set null,   -- null = classement
  created_at  timestamptz not null default now(),
  used_at     timestamptz,
  unique (profile_id, week)
);
create index training_wheel_tickets_pending_idx on public.training_wheel_tickets (profile_id) where used_at is null;
create index training_wheel_tickets_granted_by_idx on public.training_wheel_tickets (granted_by);

create table public.training_wheel_spins (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  ticket_id    uuid not null unique references public.training_wheel_tickets(id) on delete cascade,
  week         date not null,
  spun_at      timestamptz not null default now(),
  sector_label text not null,
  won          boolean not null,
  prize_label  text,                                -- null si Raté
  amount_eur   numeric(8,2) check (amount_eur is null or amount_eur >= 0),
  paid_at      timestamptz,                         -- compta plus tard
  paid_by      uuid references public.profiles(id) on delete set null
);
create index training_wheel_spins_profile_idx on public.training_wheel_spins (profile_id, spun_at desc);
create index training_wheel_spins_week_idx on public.training_wheel_spins (week desc);
create index training_wheel_spins_paid_by_idx on public.training_wheel_spins (paid_by);
```

- **`member_events`** : ajouter `'recompense'` au check `member_events_kind_check` ; trigger `after insert`
  sur `training_wheel_spins` → `insert into member_events (profile_id, created_by, kind, to_value)`
  avec `to_value` = « Roue : 10 € — Top 2 — semaine du 11/08 » (ou « Roue : Raté — … »), `created_by`
  = `granted_by` du ticket (null = système). Étendre `memberEventLabel`/`isEventKind` côté core.
- **RLS** : `training_wheel_config` lecture `has_page('formation')`, écriture admin ; `tickets` /
  `spins` lecture `profile_id = auth.uid() or has_page('frm-suivi')` (admin inclus) ; **aucune écriture
  authenticated** (service-role depuis les actions, comme les sessions — 0121).
- **RPC** (definer, `set search_path = public, pg_temp`, `revoke … from public, anon`) :
  - `training_weekly_ranking(p_week date)` → `(profile_id, display_name, points, cases_done, avg_total)`
    (mêmes gardes que `training_ranking` : `is_admin() or has_page('formation')`, `left_at is null`,
    `role = 'chatteur'`).
  - `training_wheel_pending(p_profile uuid)` → `integer` (0/1) : 1 si ticket non utilisé OU (top 3 de la
    semaine passée, points > 0, aucun ticket pour cette semaine, aucun ticket non utilisé). Appelant =
    lui-même ou `has_page('frm-suivi')`.

## 4. Feature `training-wheel` (`apps/web/src/features/training-wheel/`)

- `types.ts` : `WheelConfig`, `WheelSector`, `WheelPrize`, `WheelTicket`, `WheelSpin`, `WheelData`
  (config, ticket dispo, éligibilité, mes spins), `WheelHistoryRow`.
- `schema.ts` : `wheelConfigForm` (titre, secteurs, lots — refinements : ≥ 1 secteur non perdant, poids
  ≥ 0 et somme > 0, ≥ 1 lot, montant € ≥ 0 nullable), `spinInput`, `claimInput` — tests Vitest.
- `services/get-wheel.ts` (RLS + `training_wheel_pending`), `services/get-wheel-history.ts` (encadrant :
  spins de tous, par semaine, total €, 100 dernières lignes ; nom via `training_overview_roster`).
- `actions.ts` : `claimTicket()` (garde `frm-entrainement` + impersonation ; revérifie via la RPC
  hebdo ; insert service-role), `spinWheel({ ticketId })` (garde ; ticket à moi et non utilisé ; tirage
  `pickWeighted` avec `crypto.randomInt` ; update ticket + insert spin ; renvoie `{ sectorIndex, won,
  prize?: { index, label, amountEur } }`), `saveWheelConfig(raw)` (admin ; upsert id = 1).
- `WheelTemplate.tsx` (RSC) : en-tête (titre config), `<WheelSpinner>` (client : SVG de la roue,
  bouton « Tourner » actif si ticket, animation CSS `transform: rotate()` 4,8 s vers l'angle du secteur
  renvoyé, puis « coffre » = carte de révélation en CSS natif ; résultat + toast), « Mes gains » (table
  RSC), et pour `frm-suivi` l'onglet « Historique des gains » (`?vue=historique`), pour l'admin le bouton
  « Configurer » (dialog RHF `'use no memo'`, lignes secteurs/lots avec poids et % calculé).
- Route `app/(dash)/formation/roue/{page,loading}.tsx` : `requireAccess(['frm-entrainement','frm-suivi'])`,
  kickoff sans await, Suspense.
- `config/workspaces.ts` : item `{ href: '/formation/roue', label: 'Roue', icon: Gift, anyOf: […] }`
  après Ma formation ; badge = `wheelPendingPromise` passé à `AppSidebar` depuis le layout (dash) (même
  patron que `insightsCountPromise`, `use()` sous Suspense).
- **Règles pures en `@glagency/core`** : `pickWeighted(items, rand)` (+ test), `weekOfLastCompleted(today)`
  (lundi de la semaine passée), `wheelDefaults()` (secteurs/lots GLA en €).
- **Ma formation → Classement** : `?classement=semaine|semaine-derniere|global` (défaut semaine) ; les
  deux premiers appellent `training_weekly_ranking` (lundi courant / précédent), le troisième l'existant.
  Ligne « top 3 = ticket » rappelée en légende.

## 5. Sécurité, perf, tests

- Écritures uniquement service-role après vérification de propriété/droit ; le résultat du tirage est
  décidé serveur ; RLS lecture bornée (moi / encadrant / admin) ; config admin.
- Page Roue = 2-3 lectures (config, mes tickets/spins, RPC pending) ; historique = 1 lecture + roster.
- Tests : `pickWeighted` (distribution déterministe avec `rand` injecté, poids 0 ignorés),
  `weekOfLastCompleted`, `wheelConfigForm` (refinements). Le reste = recette UAT.

## 6. Recette (UAT)

1. Admin : Roue → Configurer → modifier un poids / un montant → enregistré ; poids Raté à 0 → plus de Raté.
2. Chatter top 3 la semaine passée (ou forcer une ligne `training_wheel_tickets` en SQL) → pastille « 1 »
   dans la sidebar → Roue → « Tourner » → animation → coffre → gain affiché, ligne dans « Mes gains »,
   ligne `recompense` dans le journal du membre, ticket consommé, pastille disparue.
3. Chatter hors top 3 : bouton inactif, message « Termine dans le top 3 de la semaine pour gagner un tour ».
4. Encadrant : onglet Historique (tous, par semaine, total €) ; pas de bouton Tourner.
5. Ma formation → Classement : les trois vues, cohérentes avec les sessions notées de la semaine.
