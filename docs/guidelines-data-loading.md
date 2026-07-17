# Guidelines — data-loading & features (glagencyapp)

Patterns établis et vérifiés (audit + refonte 2026-07-15). À suivre pour toute nouvelle
feature ou modif d'un service/template. Complète `.claude/skills/archi-web/SKILL.md`.

---

## 1. Lecture d'une table de faits journaliers → agrégation EN BASE (RPC)

**Règle.** Un service qui lit une table de faits journaliers (`creator_daily`,
`chatter_daily`, `chatter_creator_daily`, `creator_script_daily`) et fait un `GROUP BY`
en JS (`reduce`/`Map`) → **pousse l'agrégation en RPC SQL** `SECURITY INVOKER`. Le service
ne garde que la présentation (LTV, %, tri, KPIs).

- **Pourquoi.** Évite de rapatrier des milliers de lignes par requête ; supprime le reduce
  JS. C'est aussi ce qui évitait le plafond CPU 10 ms des Workers (Error 1102) — contrainte
  disparue sur Vercel, mais le gain réseau/latence reste.
- **`SECURITY INVOKER` obligatoire** (pas `DEFINER`) : la RLS des tables s'applique à
  l'appelant → un manager `user` ne voit que ses modèles, exactement comme un `select` direct.
- **Bornes de fenêtre non-triviales** (semaine en cours, etc.) : passe-les **en paramètre**
  (`p_week_from date`) calculé côté TS, jamais `current_date` en base (piège de fuseau).
- **RPC typé + cast documenté du retour `Json`.** Les 5 RPC `*_report` (`chatters_report`,
  `health_report`, `models_report`, `bilan_report`, `overview_report`) sont dans les types
  générés (`packages/db/src/types.ts`) → appel `supabase.rpc('nom', args)` **typé** (nom +
  args), **sans** `as never`. Leur retour est déclaré `Returns: Json` côté Postgres — la RPC
  garde une interface TS locale (miroir main, ex. `interface Report { … }`) et le data est
  casté **explicitement documenté** : `rpcRes.data as Report | null` (ou `as unknown as Report
  | null` si TS exige le détour). **Pas de `.overrideTypes<T, { merge: false }>()`** :
  inapplicable sur `Json` — le garde `IsValidResultOverride` de postgrest-js 2.110 distribue
  sur l'union récursive `Json` et rejette tout override (vérifié, systémique aux RPC `*_report`,
  cf. pilote `get-chatters.ts:82-93`). `as never` ne se justifie plus que pour un objet
  **réellement absent** des types générés, avec un `// TODO: régénérer types.ts` explicite.
  `crm_spenders_tracker`, lui, déclare un retour **typé** (array de colonnes) dans les types
  générés (`packages/db/src/types.ts:2059-2081`) → appel typé de bout en bout, aucun cast
  (`features/spenders/services/get-spenders.ts` accède aux champs — `r.fan_id`, `r.username`,
  … — sans aucun `as`).
- **Migration = dépendance de déploiement.** Le code qui appelle le RPC ne doit partir en
  prod qu'APRÈS que la migration soit appliquée sur Supabase, sinon la page plante (RPC
  inexistant). Appliquer d'abord (SQL Editor / `supabase db push`), vérifier les chiffres,
  puis pusher.
- **Ne pas RPC-ifier si aucun gain.** Ex. `get-stats` sort déjà à la granularité
  `(modèle, jour)` = la PK de `creator_daily` → un `GROUP BY` renverrait le même nombre de
  lignes. Inutile.

### Exemple (gabarit) — `models_report` (migration 0050)

```sql
create or replace function public.models_report(p_from date, p_to date)
returns json language sql stable security invoker set search_path = public as $$
  select json_build_object(
    'by_creator', coalesce((
      select json_agg(t) from (
        select creator_id, sum(ca) as total, sum(new_subs) as new_subs
        from creator_daily where date between p_from and p_to group by creator_id
      ) t
    ), '[]'::json),
    'by_pair', coalesce((
      select json_agg(t) from (
        select creator_id, chatter_id, sum(ca) as ca
        from chatter_creator_daily where date between p_from and p_to
        group by creator_id, chatter_id
      ) t
    ), '[]'::json)
  );
$$;
grant execute on function public.models_report(date, date) to authenticated;
```

```ts
// get-models.ts
interface ModelsReport { by_creator: Array<{ creator_id: string; total: number | null; new_subs: number | null }>; by_pair: /* … */ }

const [{ data: creators, error: creatorsErr }, rpcRes] = await Promise.all([
  supabase.from('creators').select('id, name'),
  // RPC typé (nom + args, dans packages/db/src/types.ts) — pas de `as never`.
  supabase.rpc('models_report', { p_from: period.from, p_to: period.to }),
])
if (creatorsErr) throw new Error(creatorsErr.message)
if (rpcRes.error) throw new Error(rpcRes.error.message)
// Retour `Returns: Json` → cast documenté vers le contrat local (pas `.overrideTypes`,
// inapplicable sur l'union Json avec postgrest-js 2.110 — cf. § ci-dessus).
const rep = (rpcRes.data as ModelsReport | null) ?? { by_creator: [], by_pair: [] }
// … présentation seulement (Number(x) || 0 pour les sommes) …
```

**Gabarits en base** : `chatters_report` (0017), `health_report` (0049), `models_report`
(0050), `bilan_report` (0051, fenêtres via `FILTER`), `overview_report` (0052, branche
`p_restricted` via `union all` à gardes exclusives).

---

## 2. Sinon : `fetchAll` obligatoire sur toute table de faits

Si tu ne fais pas de RPC, **toute lecture d'une table de faits journaliers passe par
`fetchAll` avec un `.order()` sur la PK COMPLÈTE**. PostgREST plafonne à 1000 lignes → sans
ça, **troncature silencieuse** = chiffres faux dès ~1 mois (bug réel : juin à 99 k€ au lieu
de 256 k€). Jamais un `select` nu sur ces tables.

---

## 3. Template = Server Component ; `'use client'` sur la feuille

Un `<Feature>Template.tsx` reste un **Server Component**. L'interactivité (state, filtres,
dialogs) vit dans une **feuille client** `components/<feature>-view.tsx`. Modèle :
`ChattersTemplate` → `chatters-table`. Le préambule statique (titre, description) rendu
côté serveur ; le DOM final doit être **identique**. Ne jamais forcer un split qui change le
DOM (si un widget d'en-tête est couplé à un hook, garde tout l'en-tête dans la View).

---

## 4. Caching (`use cache`) — uniquement sur du GLOBAL

`use cache` seulement sur une lecture **100 % globale** (via `createAdminClient`, hors RLS,
ex. `get-ranking`). **Jamais** sur une lecture RLS cookie-bound ni un RPC `SECURITY INVOKER`
→ le cache est partagé entre users → **fuite de données inter-modèles**.

---

## 5. Pièges vérifiés

- **`proxy.ts` doit être dans `src/`** (Next 16.2.10 ignore `proxy.ts` à la racine → garde
  d'auth morte, HTTP 200 au lieu de 307). Tester : `next build && next start` + curl route
  protégée sans cookie → attendre 307.
- **Apostrophes** : le copier-coller peut convertir `'` (U+2019, apostrophes françaises
  « l'admin ») en `'` droit ou casser les délimiteurs. Après un refacto de texte, vérifier
  au niveau octet que le texte rendu est inchangé.
- **`ltvOf(0, 0) = null`** (garde `newSubs > 0`) — utile pour raisonner sur l'équivalence
  d'un agrégat vide.

---

## 6. Jour métier — `todayParis()`

**Règle.** Tout calcul d'« aujourd'hui » (bornes de période par défaut, semaine en cours,
jour du dernier classement, …) passe par `todayParis()` (`@glagency/core`,
`packages/core/src/domain/dates.ts`) — **jamais** `isoDate(new Date())` ni `new Date()` nu.

- **Pourquoi.** `isoDate` (`toISOString`) et un `new Date()` brut calculent le jour civil en
  **UTC**. Sur Vercel (serveur en UTC), entre 00h00 et 02h00 heure de Paris (été, UTC+2 ; 01h
  en hiver), le jour UTC est encore la **veille** → les KPIs « du jour » sont vides ou faux et
  la semaine (`startOfWeek`) bascule en retard le lundi. Bug réel détecté à l'audit du
  2026-07-16 (spec `docs/superpowers/specs/2026-07-16-standard-feature-design.md` §2.1.6).
- **Implémentation** : `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', … })` — le
  format court de `en-CA` est déjà `YYYY-MM-DD`, pas de manipulation de string.
- **Consommateurs** : `lib/period.ts` (`resolvePeriod`, défaut « mois en cours ») et tout
  service qui a besoin du jour courant — `features/health/services/get-health.ts`,
  `features/bilan/services/get-bilan.ts`, `features/overview/services/get-overview.ts`,
  `features/police/services/get-police.ts`, `features/repos/services/get-repos.ts`.
- **Semaine/mois dérivés du jour métier** : composer avec `mondayOf(todayParis())` ou
  `` startOfMonth(new Date(`${todayParis()}T00:00:00`)) `` (cf. `lib/period.ts:31`) — ne
  jamais repartir d'un `new Date()` UTC une fois `todayParis()` obtenu.
