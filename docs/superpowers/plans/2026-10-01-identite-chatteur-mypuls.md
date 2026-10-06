# Identité chatteur par id MyPuls — plan d'implémentation, version fiabilité

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Exécution imposée par Benoit : subagent-driven, avec une relecture indépendante de chaque
> tâche avant la suivante.**

**Goal :** « une version qui me promet la fiabilité sur les chiffres de l'app ». Concrètement :
- un compte MyPuls = une fiche ;
- chaque nuit, trois contrôles prouvent que nos chiffres égalent MyPuls ;
- un jour faux est marqué « à vérifier » et se voit dans l'app ;
- les doublons historiques se fusionnent par lots validés, à double preuve.

**Architecture :**
- `@glagency/mypuls` lit l'id de chaque vente, l'annuaire (id, libellé) et les totaux affichés
  par la page.
- `@glagency/core` porte les règles pures, testées :
  - résolution d'une journée ;
  - contrôles du jour ;
  - classement et preuve du rattrapage ;
  - comparaison de recette.
- La migration `0183` livre :
  - deux tables : anomalies, contrôles par jour ;
  - les fonctions SQL : pose d'ids, fin de journée contrôlée, fusion, suppression d'une fiche
    vide, trois lectures pour l'onglet.
- Deux CLI ops : `identity-backfill` (rapport + lots validés) et `recette-identite` (rejeu
  avant/après).
- La page Membres gagne l'onglet « Fiches MyPuls ».

**Tech Stack :** TypeScript, Vitest 3, cheerio (Node), HTMLRewriter (Cloudflare Worker),
Supabase (Postgres + RLS, supabase-js), Next.js 16 App Router (RSC + Server Actions), shadcn/ui
(`Card`, `DataTable`, `Sortable`, `Badge`, `Tabs`), zod v4, sonner.

**Spec :** `docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md` (version
fiabilité, révisée le 2026-10-05). À lire en entier avant la Task 1.

## Global Constraints

- **Langue.** Tout en français : UI, commentaires, messages d'erreur et de log.
- **Identité.** Clé `chatters.mypuls_user_id` (`text unique`), l'alias n'est qu'un repli.
  Libellé ambigu départagé seulement par le montant au centime (seul candidat, CA > 0, non déjà
  pris), sinon mis de côté.
- **Pseudo-fiches « Indéterminé (<modèle>) »** (`/^Indéterminé \(/`) : jamais d'id, jamais
  fusionnées ni reliées. Leurs ventes **comptent** dans le contrôle b2.
- **Trois contrôles par jour**, codes exacts :
  - `a_resume_ventes` (par id, résumé = ventes) ;
  - `b_resume_ecrit` (Σ `chatter_daily` en base = Σ PPV + tips lus) ;
  - `b_ventes_ecrites` (Σ `chatter_creator_daily` en base = Σ ventes lues) ;
  - `b_total_page` (ventes lues = cartes « Montant net » et « Ventes » de la page) ;
  - `c_fiche_compte` (une fiche = un compte) ;
  - `c_lien_refuse` (id non posé).

  Tout au centime. Un échec → jour `a_verifier` → run `degraded`.
- **Types d'anomalie** (exactement) : `doublon`, `membres_multiples`, `homonyme`, `conflit_id`,
  `fiche_creee`, `resume_mis_de_cote`, `ecart_invariant`. Les anomalies seules ne dégradent pas
  le run.
- **Rattrapage.**
  - Le rapport ne fait que lire.
  - `--apply` exige `--lot=<fichier>` ; il ne fusionne que les groupes du lot qui portent la
    double preuve (même id + compensation au centime, aucun jour en commun).
  - Aucune pose d'id en masse.
  - Sur la prod, il faut en plus `IDENTITY_APPLY_PROD=oui`.
- **Migration.**
  - Numéro **`0183`** (prod = UAT = 0182 depuis le 2026-10-02, `AGENTS.md`). Vérifier qu'il est
    libre avant de créer le fichier.
  - `text` + `check`, jamais d'enum.
  - `supabase db push --db-url` via le pooler en mode session, `--dry-run` d'abord, puis
    régénération de `packages/db/src/types.ts`.
  - **Jamais** `psql -f` sur une migration.
- **Budget Worker.** Aucune requête MyPuls de plus. +1 sous-requête par run (membres reliés) et
  +1 par jour (`finish_chatter_day`). Jamais une requête par chatteur.
- **Web** (`docs/guidelines-data-loading.md`) :
  - services dans `features/members/services/` ;
  - agrégats en RPC `security invoker` ; `fetchAll` sur toute lecture non bornée ;
  - pas de `use cache` ;
  - Template = Server Component sans fetch, `'use client'` sur la feuille.
- **UI** (`docs/guidelines-standard-feature.md` §9) : composants existants à l'identique.
  - `Card` + `CardTitle className="text-base"` (patron `turnover-view.tsx`).
  - `DataTable` + `Sortable` (patron `uncove-accounts.client.tsx`).
  - Statut = `Badge className={cn('text-xs', STATUS_COLORS.x)}` (patron
    `uncove-accounts.client.tsx:165`).
  - Aucune nouveauté visuelle.
- **Commits.** Pas de commit sans le mot « commit » de Benoit. Alors `git add -- <chemins
  explicites>`, jamais `-A` ni `.`.
- **⛔ Accord explicite de Benoit** pour chaque étape distante qui écrit :
  - `0183` sur l'UAT, test SQL compris (il écrit puis annule), puis en prod ;
  - rejeux d'ingestion sur l'UAT (recette, shifts) ;
  - `identity-backfill --apply` sur l'UAT puis en prod ;
  - `wrangler deploy` ;
  - push, ouverture ou merge de PR.

  Un rapport `identity-backfill` sans `--apply` ne fait que lire : pas d'accord requis.
- **Changelog.** Une ligne par PR sous « Non publié » dans `CHANGELOG.md`.

## Review Focus

1. **Une vente d'une modèle inconnue du CRM, ou un montant de résumé mis de côté** : le jour
   passe « à vérifier », jamais « ok ». Testé en Task 4 (test SQL, bloc 8) et en Task 8
   (`dayChecks`).
2. **Une nuit où MyPuls retire le bouton « Éditer » ou les cartes KPI** : contrôles a, c ou b3 en
   échec, jour « à vérifier », repli libellé pour l'identité. Testé en Task 7 (« mode sans id »)
   et en Task 8 (« total de page introuvable »).
3. **Groupe de trois fiches** (yann, yann30000, e-mail) : une paire seule ne compense pas, le
   groupe oui ; l'apply ne fusionne que des groupes prouvés. Testé en Task 3 (`proveGroup`,
   `proveLot`).
4. **Deux fiches candidates dont une reliée à un membre** : l'id et les nouveaux jours vont à la
   fiche payée. Testé en Task 7 et en Task 3.
5. **Recette** : un déplacement de montant entre deux fiches sans anomalie qui l'explique doit
   ressortir « INEXPLIQUÉ ». Testé en Task 12 (`compareReplay`).

---

## Préparation — isolation

- [ ] **P.1 — Worktree sur `develop` à jour**

```bash
cd /Users/benoitgasnier/Documents/glagencyapp
git fetch origin
git worktree add ../glagencyapp-identite -b feature/identite-1-ids origin/develop
cd ../glagencyapp-identite
ln -s ../glagencyapp/.env .env               # .env racine (gitignoré) : loadEnv() le lit
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp ../glagencyapp/docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md docs/superpowers/specs/
cp ../glagencyapp/docs/superpowers/plans/2026-10-01-identite-chatteur-mypuls.md docs/superpowers/plans/
pnpm install
```

Attendu : `git status` ne montre que la spec et le plan en non suivis.

- [ ] **P.2 — Helpers shell (à recoller dans chaque nouveau terminal)**

```bash
cd /Users/benoitgasnier/Documents/glagencyapp-identite
envv() { grep "^$1=" .env | cut -d= -f2- | sed 's/^"//; s/"$//'; }
pool() { # $1 = clé .env de l'URL Postgres, $2 = réf du projet — pooler session IPv4 (AGENTS.md § Migrations)
  local pw; pw=$(envv "$1" | sed -E 's#^postgresql://[^:]+:([^@]+)@.*#\1#')
  echo "postgresql://postgres.$2:${pw}@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"
}
UAT_DB=$(pool DATABASE_URL_UAT ihkksdmgtrbbjugeboks)
PROD_DB=$(pool DATABASE_URL cqmfpsnqaxymswijdnfz)
uat() { SUPABASE_URL="$(envv SUPABASE_URL_UAT)" SUPABASE_SECRET_KEY="$(envv SUPABASE_SECRET_KEY_UAT)" "$@"; }
```

`uat <commande>` lance une commande d'ingestion sur la base UAT. Sans `uat`, le `.env` pointe la
prod.

- [ ] **P.3 — Branches.** Chaque PR part de `develop` après le merge de la précédente :

```bash
git fetch origin && git switch -c feature/identite-<n>-<sujet> origin/develop
```

Si la PR précédente n'est pas mergée, partir de sa branche (PR empilée) et le dire dans la
description.

---

# PR 1 — lire les ids, l'annuaire et les totaux de la page (branche `feature/identite-1-ids`)

Aucun changement de comportement, et pas de déploiement du Worker pour cette PR.

### Task 1 : `@glagency/mypuls` — id de chaque vente, annuaire, totaux de la page (cheerio)

**Files :**
- Create : `packages/mypuls/src/endpoints/__fixtures__/money-team-identity.html`
- Modify : `packages/mypuls/src/endpoints/money-team.ts` :
  - `:28-39` (types) ;
  - après `:65` (nouvelles fonctions) ;
  - `:152-157` (`parseMoneyTeamSales`) ;
  - `:197` (`fetchMoneyTeamDay`).
- Modify : `packages/mypuls/src/endpoints/team-money.ts:4-18`
- Modify : `packages/mypuls/src/index.ts:6-9`
- Test : `packages/mypuls/src/endpoints/money-team.test.ts`

**Interfaces :**
- Produces :
  - `MoneyTeamTx.mypulsUserId: string | null`
  - `interface MoneyTeamDirectoryEntry { mypulsUserId: string; label: string; source: 'select' | 'assignable' }`
  - `interface MoneyTeamPageTotals { salesCount: number | null; net: { currency: string; amount: number }[] }`
  - `MoneyTeamDay.directory: MoneyTeamDirectoryEntry[]`
  - `MoneyTeamDay.pageTotals: MoneyTeamPageTotals`
  - `mypulsIdOf(raw: string | null | undefined): string | null`
  - `parseAssignableUsers(scriptText: string): MoneyTeamDirectoryEntry[]`
  - `parseMoneyTeamDirectory(html: string): MoneyTeamDirectoryEntry[]`
  - `pageTotalsFromCards(cards: { label: string; value: string }[]): MoneyTeamPageTotals`
  - `parseMoneyTeamPageTotals(html: string): MoneyTeamPageTotals`
  - `MoneyTx.attributed_user?: string | null`

- [ ] **Step 1 : créer la fixture**

`packages/mypuls/src/endpoints/__fixtures__/money-team-identity.html` :

```html
<!-- Fixture identité + totaux — balisage recopié des captures money-team du 06/09/2026 et du
     12/09/2026 (apps/ingestion/raw/pages/), lignes choisies. Ids et libellés RÉELS : 1802 vaut
     « Lionel » sur Claire_sps et « lioneldiv » sur Lolafps ; « Serge » désigne deux comptes (9332,
     10504) ; 243 et 1163 sont deux « yann (accès révoqué) ». Fans et dates réduits ; les cartes KPI
     sont recalculées sur les 4 ventes ci-dessous (4 ventes, 267,68 EUR). -->
<div class="mmt-select mmt-select-chatter">
    <select name="chatter" class="form-select form-select-sm js-select2-sm">
        <option value="all" selected>Tous les chatteurs</option>
        <option value="-1" >Ventes indéterminées</option>
        <option value="243" >yann (accès révoqué)</option>
        <option value="1163" >yann (accès révoqué)</option>
        <option value="1802" >Lionel</option>
        <option value="9332" >Serge</option>
        <option value="10504" >Serge</option>
    </select>
</div>
<div class="row g-3 mb-4">
    <div class="col-md-6 col-xl-3">
        <div class="card kpi-card h-100 mb-0">
            <div class="card-body d-flex align-items-center">
                <div class="kpi-icon bg-soft-info"><i class="ri-line-chart-line"></i></div>
                <div>
                    <h6 class="text-muted text-uppercase fs-12 mb-1">Ventes</h6>
                    <h3 class="mb-0 fw-bold">4</h3>
                    <small>
                        <span class="delta-down">▼ -41</span>
                        <span class="text-muted">vs période précédente</span>
                    </small>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-6 col-xl-3">
        <div class="card kpi-card h-100 mb-0">
            <div class="card-body d-flex align-items-center">
                <div class="kpi-icon bg-soft-primary"><i class="ri-chat-check-line"></i></div>
                <div>
                    <h6 class="text-muted text-uppercase fs-12 mb-1">Répartition type</h6>
                    <h3 class="mb-0 fw-bold">
                        3 PPV
                        <small class="fs-12 delta-down">(-21)</small>                                    </h3>
                    <small class="text-success">1 tips</small>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-6 col-xl-3">
        <div class="card kpi-card h-100 mb-0">
            <div class="card-body d-flex align-items-center">
                <div class="kpi-icon bg-soft-success"><i class="ri-coins-line"></i></div>
                <div>
                    <h6 class="text-muted text-uppercase fs-12 mb-1">Montant net · EUR</h6>
                    <h3 class="mb-0 fw-bold">267,68 <span class="fs-14 fw-normal text-muted">EUR</span></h3>
                    <small>
                        <span class="delta-down">▼ -14,4 %</span>
                        <span class="text-muted">vs période précédente</span>
                    </small>
                </div>
            </div>
        </div>
    </div>
</div>
<table class="table table-nowrap align-middle ranking-table mb-0">
    <thead>
    <tr>
        <th class="text-center rank-cell">#</th>
        <th>Chatter</th>
        <th class="text-center">Ventes</th>
        <th class="text-center">Médias privés</th>
        <th class="text-center">Pourboires</th>
        <th class="text-end">Montant net</th>
        <th class="text-end">Période préc.</th>
        <th class="text-center">Évolution</th>
        <th class="text-center">Rang</th>
    </tr>
    </thead>
    <tbody>
    <tr class="rank-top" data-export="1" data-chatter="Lionel" data-sales="1" data-ppv="1" data-tips="0" data-net="146.57" data-currency="EUR">
        <td class="text-center rank-cell">1</td>
        <td>
            <span class="fw-semibold">Lionel</span>
        </td>
        <td class="text-center">1</td>
        <td class="text-center">1</td>
        <td class="text-center">0</td>
        <td class="text-end fw-semibold">146,57 EUR</td>
        <td class="text-end text-muted">–</td>
        <td class="text-center"><span class="badge bg-info-subtle text-info">Nouveau</span></td>
        <td class="text-center"><span class="badge bg-info-subtle text-info">Nouveau</span></td>
    </tr>
    <tr class="ranking-muted" title="Chatteur sans vente sur la période : hors classement">
        <td class="text-center rank-cell">–</td>
        <td>
            <span class="">Ridwane</span>
            <small class="text-muted d-block">Aucune vente sur la période</small>
        </td>
        <td class="text-center">
            0
            <small class="delta-down">(-2)</small>
        </td>
        <td class="text-center">0</td>
        <td class="text-center">0</td>
        <td class="text-end fw-semibold">0,00 EUR</td>
        <td class="text-end text-muted">–</td>
        <td class="text-center"><span class="badge bg-info-subtle text-info">Nouveau</span></td>
        <td class="text-center"><span class="text-muted">–</span></td>
    </tr>
    </tbody>
</table>
<table class="table table-nowrap align-middle sales-table" id="sales-detail-table">
    <thead>
    <tr>
        <th>Créateur</th>
        <th>User (chatter)</th>
        <th>Fan</th>
        <th>Montant net</th>
        <th>Devise</th>
        <th>Type</th>
        <th>Date</th>
        <th class="text-center">Contexte</th>
        <th class="text-end">Action</th>
    </tr>
    </thead>
    <tbody>
    <tr>
        <td><span class="fw-semibold">Claire_sps</span></td>
        <td><span class="badge bg-dark-subtle text-body">Lionel</span></td>
        <td>Fan_a</td>
        <td class="fw-semibold">146,57</td>
        <td>EUR</td>
        <td><span class="badge bg-info-subtle text-primary">Média privé</span></td>
        <td>06/09/2026 21:12</td>
        <td class="text-center"></td>
        <td class="text-end">
            <button type="button" class="btn btn-sm btn-outline-primary js-edit-attribution-btn"
                    data-payment-id="1" data-creator-id="1311" data-current-user-id="1802"
                    data-fan-name="Fan_a" data-creator-name="Claire_sps" data-current-label="Lionel">
                <i class="ri-edit-line align-bottom"></i> Éditer
            </button>
        </td>
    </tr>
    <tr>
        <td><span class="fw-semibold">Lolafps</span></td>
        <td><span class="badge bg-dark-subtle text-body">lioneldiv</span></td>
        <td>Fan_b</td>
        <td class="fw-semibold">12,00</td>
        <td>EUR</td>
        <td><span class="badge bg-info-subtle text-primary">Média privé</span></td>
        <td>06/09/2026 20:40</td>
        <td class="text-center"></td>
        <td class="text-end">
            <button type="button" class="btn btn-sm btn-outline-primary js-edit-attribution-btn"
                    data-payment-id="2" data-creator-id="288" data-current-user-id="1802"
                    data-fan-name="Fan_b" data-creator-name="Lolafps" data-current-label="lioneldiv">
                <i class="ri-edit-line align-bottom"></i> Éditer
            </button>
        </td>
    </tr>
    <tr>
        <td><span class="fw-semibold">Sarahcbr</span></td>
        <td><span class="badge bg-dark-subtle text-body">Indéterminé (Sarahcbr)</span></td>
        <td>Carlos0684</td>
        <td class="fw-semibold">38,32</td>
        <td>EUR</td>
        <td><span class="badge bg-info-subtle text-primary">Média privé</span></td>
        <td>31/08/2026 22:48</td>
        <td class="text-center"></td>
        <td class="text-end">
            <button type="button" class="btn btn-sm btn-outline-primary js-edit-attribution-btn"
                    data-payment-id="43389139" data-creator-id="221" data-current-user-id=""
                    data-fan-name="Carlos0684" data-creator-name="Sarahcbr"
                    data-current-label="Ind&#x00E9;termin&#x00E9;&#x20;&#x28;Sarahcbr&#x29;">
                <i class="ri-edit-line align-bottom"></i> Éditer
            </button>
        </td>
    </tr>
    <tr>
        <td><span class="fw-semibold">Claire_sps</span></td>
        <td><span class="badge bg-dark-subtle text-body">Serge</span></td>
        <td>Fan_c</td>
        <td class="fw-semibold">70,79</td>
        <td>EUR</td>
        <td><span class="badge bg-info-subtle text-primary">Pourboires</span></td>
        <td>06/09/2026 19:05</td>
        <td class="text-center"></td>
        <td class="text-end">
            <button type="button" class="btn btn-sm btn-outline-primary js-edit-attribution-btn"
                    data-payment-id="3" data-creator-id="1311" data-current-user-id="10504"
                    data-fan-name="Fan_c" data-creator-name="Claire_sps" data-current-label="Serge">
                <i class="ri-edit-line align-bottom"></i> Éditer
            </button>
        </td>
    </tr>
    </tbody>
</table>
<script>
    const assignableUsersByCreator = {"1311":[{"id":1802,"label":"Lionel"},{"id":9332,"label":"Serge"},{"id":10504,"label":"Serge"}],"288":[{"id":1802,"label":"lioneldiv"}],"328":[{"id":1163,"label":"yann"}]};
    const editBtns = document.querySelectorAll('.js-edit-attribution-btn');
</script>
```

- [ ] **Step 2 : écrire les tests qui échouent**

En tête de `money-team.test.ts`, après l'import existant :

```ts
import {
  mypulsIdOf,
  pageTotalsFromCards,
  parseAssignableUsers,
  parseMoneyTeamDirectory,
  parseMoneyTeamPageTotals,
} from './money-team'
```

À la fin du fichier :

```ts
describe('identité MyPuls — l’id de chaque vente et l’annuaire de la page', () => {
  // Spec docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md § 1.
  const html = fixture('money-team-identity.html')
  const tx = parseMoneyTeamSales(html)
  const dir = parseMoneyTeamDirectory(html)

  it('lit l’id du compte sur chaque vente — un même id sous deux libellés', () => {
    expect(tx.map((t) => [t.chatter, t.mypulsUserId])).toEqual([
      ['Lionel', '1802'],
      ['lioneldiv', '1802'],
      ['Indéterminé (Sarahcbr)', null],
      ['Serge', '10504'],
    ])
  })

  it('ne lit jamais le classement : « Aucune vente sur la période » n’est pas une vente', () => {
    expect(tx).toHaveLength(4)
    expect(tx.some((t) => t.chatter.includes('Aucune vente'))).toBe(false)
  })

  it('l’annuaire prend le select sans « all » ni « -1 », homonymes conservés', () => {
    expect(dir.filter((d) => d.source === 'select').map((d) => [d.mypulsUserId, d.label])).toEqual([
      ['243', 'yann (accès révoqué)'],
      ['1163', 'yann (accès révoqué)'],
      ['1802', 'Lionel'],
      ['9332', 'Serge'],
      ['10504', 'Serge'],
    ])
  })

  it('l’annuaire prend le JSON des équipes (clés numériques : ordre croissant des ids de modèle)', () => {
    expect(dir.filter((d) => d.source === 'assignable').map((d) => [d.mypulsUserId, d.label])).toEqual([
      ['1802', 'lioneldiv'], // modèle 288
      ['1163', 'yann'], // modèle 328
      ['1802', 'Lionel'], // modèle 1311
      ['9332', 'Serge'],
      ['10504', 'Serge'],
    ])
  })

  it('parseAssignableUsers : sans JSON ou JSON illisible → [] ; une paire vue deux fois → une', () => {
    expect(parseAssignableUsers('const autre = 1;')).toEqual([])
    expect(parseAssignableUsers('const assignableUsersByCreator = {"1":[{"id":1,};')).toEqual([])
    const s = 'const assignableUsersByCreator = {"1":[{"id":5,"label":"Ana"}],"2":[{"id":5,"label":"Ana"}]};'
    expect(parseAssignableUsers(s)).toEqual([{ mypulsUserId: '5', label: 'Ana', source: 'assignable' }])
  })

  it('mypulsIdOf : entier > 0 seulement', () => {
    expect(mypulsIdOf(' 1802 ')).toBe('1802')
    for (const v of ['', 'all', '-1', '0', '12a', null, undefined]) expect(mypulsIdOf(v)).toBeNull()
  })

  it('la fixture historique porte aussi les ids (capture réelle du 06/09)', () => {
    expect(parseMoneyTeamSales(fixture('money-team-page.html')).map((t) => t.mypulsUserId)).toEqual([
      '2155',
      '1174',
    ])
  })
})

describe('totaux de la page — calculés par MyPuls, indépendants des lignes lues', () => {
  it('lit la carte « Ventes » et la carte « Montant net · EUR », égales aux lignes', () => {
    const html = fixture('money-team-identity.html')
    const totals = parseMoneyTeamPageTotals(html)
    expect(totals).toEqual({ salesCount: 4, net: [{ currency: 'EUR', amount: 267.68 }] })
    const lines = parseMoneyTeamSales(html)
    expect(lines.reduce((s, t) => s + t.amount, 0)).toBeCloseTo(267.68, 2)
    expect(lines).toHaveLength(totals.salesCount!)
  })

  it('page sans cartes KPI → totaux absents (null / [])', () => {
    expect(parseMoneyTeamPageTotals(fixture('money-team-page.html'))).toEqual({ salesCount: null, net: [] })
  })

  it('une carte par devise ; l’ancien libellé « Ventes attribuées » n’est pas la carte « Ventes »', () => {
    expect(
      pageTotalsFromCards([
        { label: ' Ventes attribuées ', value: '413' },
        { label: 'Montant net · EUR', value: '13 047,86 EUR' },
        { label: 'Montant net · USD', value: '1 234,56 USD' },
      ]),
    ).toEqual({
      salesCount: null,
      net: [
        { currency: 'EUR', amount: 13047.86 },
        { currency: 'USD', amount: 1234.56 },
      ],
    })
  })
})
```

- [ ] **Step 3 : vérifier qu'ils échouent**

Run : `pnpm --filter @glagency/mypuls exec vitest run src/endpoints/money-team.test.ts`
Expected : FAIL, imports introuvables.

- [ ] **Step 4 : implémenter dans `money-team.ts`**

Remplacer `MoneyTeamTx` et `MoneyTeamDay` (`:28-39`) par :

```ts
/** Transaction détaillée (table transactions), rattachée à son chatteur. */
export interface MoneyTeamTx {
  creator: string
  chatter: string
  /**
   * Id MyPuls du compte crédité : `data-current-user-id` du bouton « Éditer » de la ligne
   * (colonne Action). `null` = vente indéterminée (MyPuls ne l'attribue à personne) ou bouton
   * absent. Le libellé `chatter` dépend de la MODÈLE (1802 = « Lionel » chez Claire_sps,
   * « lioneldiv » chez Lolafps) : c'est l'id qui fait l'identité.
   */
  mypulsUserId: string | null
  amount: number
  type: string
}

/** Une paire (id MyPuls, libellé) lue dans la page des ventes — l'annuaire du jour. */
export interface MoneyTeamDirectoryEntry {
  mypulsUserId: string
  label: string
  /** `select` = libellé global du compte ; `assignable` = libellé dans l'équipe d'une modèle. */
  source: 'select' | 'assignable'
}

/**
 * Totaux affichés par MyPuls en tête de la page des ventes (cartes KPI) — calculés par MyPuls,
 * INDÉPENDANTS des lignes qu'on lit : c'est contre eux que le contrôle nocturne `b_total_page`
 * prouve qu'aucune vente n'a été perdue au parsing. Absents (ancien format, markup changé) :
 * `salesCount` null, `net` [].
 */
export interface MoneyTeamPageTotals {
  /** Carte « Ventes » : nombre de ventes de la période, indéterminées comprises. */
  salesCount: number | null
  /** Cartes « Montant net · <devise> » : total net par devise. */
  net: { currency: string; amount: number }[]
}

export interface MoneyTeamDay {
  chatters: ChatterSummary[]
  transactions: MoneyTeamTx[]
  directory: MoneyTeamDirectoryEntry[]
  pageTotals: MoneyTeamPageTotals
}
```

Après la fonction `hours` (`:60-65`), ajouter :

```ts
/** Id MyPuls lu dans un attribut : entier > 0, sinon `null` (vide, `all`, `-1`…). */
export function mypulsIdOf(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  return /^[1-9]\d*$/.test(v) ? v : null
}

/**
 * `assignableUsersByCreator` : le JSON que MyPuls pose dans un script inline de la page des ventes
 * pour sa fenêtre « Éditer l'attribution » — `{"<id modèle>":[{"id":1802,"label":"Lionel"}, …]}`.
 * C'est le libellé d'un compte DANS l'équipe d'une modèle, celui que portent ses ventes (0 écart
 * sur 6 268 ventes, captures 16→31/08). Absent ou illisible → `[]`. Une même paire vue dans deux
 * équipes n'est gardée qu'une fois.
 */
export function parseAssignableUsers(scriptText: string): MoneyTeamDirectoryEntry[] {
  const m = /const\s+assignableUsersByCreator\s*=\s*(\{.*?\});/.exec(scriptText)
  if (!m?.[1]) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(m[1])
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []
  const out: MoneyTeamDirectoryEntry[] = []
  const seen = new Set<string>()
  for (const list of Object.values(parsed as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue
    for (const u of list as { id?: unknown; label?: unknown }[]) {
      const id = mypulsIdOf(u?.id == null ? null : String(u.id))
      const label = typeof u?.label === 'string' ? u.label.trim() : ''
      if (!id || !label || seen.has(`${id}|${label}`)) continue
      seen.add(`${id}|${label}`)
      out.push({ mypulsUserId: id, label, source: 'assignable' })
    }
  }
  return out
}

/**
 * L'annuaire de la page des ventes : le `<select name="chatter">` (un libellé global par compte,
 * homonymes compris — deux « Serge ») puis le JSON des équipes. Aucun dédoublonnage par libellé :
 * c'est au résolveur de constater qu'un libellé désigne deux comptes.
 */
export function parseMoneyTeamDirectory(html: string): MoneyTeamDirectoryEntry[] {
  const $ = cheerio.load(html)
  const out: MoneyTeamDirectoryEntry[] = []
  $('select[name="chatter"] option').each((_, o) => {
    const id = mypulsIdOf($(o).attr('value'))
    const label = $(o).text().trim()
    if (id && label) out.push({ mypulsUserId: id, label, source: 'select' })
  })
  const scripts = $('script:not([src])')
    .map((_, s) => $(s).html() ?? '')
    .get()
    .join('\n')
  return [...out, ...parseAssignableUsers(scripts)]
}

/**
 * Totaux de page depuis les cartes KPI (`.kpi-card` : libellé `h6`, valeur `h3`). Partagé par
 * cheerio et HTMLRewriter (une seule règle). Libellés EXACTS : « Ventes » et « Montant net ·
 * <devise> » (vus sur les captures du 06/09 et du 16→31/08) — l'ancien « Ventes attribuées » ne
 * compte pas : s'il revenait, le contrôle échouerait plutôt que de comparer autre chose.
 */
export function pageTotalsFromCards(cards: { label: string; value: string }[]): MoneyTeamPageTotals {
  let salesCount: number | null = null
  const net: { currency: string; amount: number }[] = []
  for (const c of cards) {
    const label = c.label.replace(/\s+/g, ' ').trim()
    if (label === 'Ventes') salesCount = int(c.value)
    const m = /^Montant net · (\S+)$/.exec(label)
    if (m?.[1]) net.push({ currency: m[1], amount: money(c.value) })
  }
  return { salesCount, net }
}

export function parseMoneyTeamPageTotals(html: string): MoneyTeamPageTotals {
  const $ = cheerio.load(html)
  const cards = $('.kpi-card')
    .map((_, k) => ({ label: $(k).find('h6').first().text(), value: $(k).find('h3').first().text() }))
    .get()
  return pageTotalsFromCards(cards)
}
```

Dans `parseMoneyTeamSales`, remplacer le `transactions.push({...})` (`:152-157`) par :

```ts
        transactions.push({
          creator,
          chatter: $(td[1]).text().trim(),
          mypulsUserId: mypulsIdOf($(tr).find('.js-edit-attribution-btn').attr('data-current-user-id')),
          amount: money($(td[3]).text()),
          type: $(td[5]).text().trim(),
        })
```

Dans `fetchMoneyTeamDay` (`:197`), remplacer le `return` par :

```ts
  return {
    chatters: parseChatterSummary(summary),
    transactions: parseMoneyTeamSales(page),
    directory: parseMoneyTeamDirectory(page),
    pageTotals: parseMoneyTeamPageTotals(page),
  }
```

- [ ] **Step 5 : `MoneyTx` et exports**

`team-money.ts`, dans `MoneyTx`, après `attributed_user_id: number | null` :

```ts
  /** E-mail du compte crédité (capture du 11/09/2026 : un e-mail sur 100 lignes sur 100). */
  attributed_user?: string | null
```

`index.ts`, remplacer les lignes 6 à 9 par :

```ts
export {
  fetchMoneyTeamDay,
  parseMoneyTeamSales,
  parseChatterSummary,
  parseMoneyTeamDirectory,
  parseMoneyTeamPageTotals,
  parseAssignableUsers,
  pageTotalsFromCards,
  mypulsIdOf,
} from './endpoints/money-team'
export type {
  ChatterSummary,
  MoneyTeamTx,
  MoneyTeamDay,
  MoneyTeamDirectoryEntry,
  MoneyTeamPageTotals,
} from './endpoints/money-team'
// Réutilisés par le parser HTMLRewriter (Worker) : mêmes helpers/URL que cheerio.
export { money, int, intOrNull, hours, moneyTeamUrl, chatterSummaryUrl } from './endpoints/money-team'
```

- [ ] **Step 6 : vérifier**

Run : `pnpm --filter @glagency/mypuls exec vitest run src/endpoints/money-team.test.ts`
Expected : PASS, anciens tests compris.

Run : `pnpm --filter @glagency/mypuls typecheck`
Expected : aucune erreur.

`pnpm --filter @glagency/ingestion typecheck` doit échouer **seulement** sur `money-team-hr.ts`
(Task 2).

- [ ] **Step 7 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- packages/mypuls/src/endpoints/__fixtures__/money-team-identity.html packages/mypuls/src/endpoints/money-team.ts packages/mypuls/src/endpoints/money-team.test.ts packages/mypuls/src/endpoints/team-money.ts packages/mypuls/src/index.ts
git commit -m "feat(identite): lire l'id MyPuls des ventes, l'annuaire et les totaux de la page"
```

---

### Task 2 : parser Worker (HTMLRewriter) — même résultat, parité vérifiée + docs PR 1

**Files :**
- Modify : `apps/ingestion/src/money-team-hr.ts` (fichier entier)
- Modify : `apps/ingestion/src/worker.ts:515-521` (route `/__parse-moneyteam`)
- Modify : `CHANGELOG.md`

**Interfaces :**
- Consumes : `mypulsIdOf`, `parseAssignableUsers`, `pageTotalsFromCards`, les types de Task 1.
- Produces : `fetchMoneyTeamDayHR(day, cookie): Promise<MoneyTeamDay>` complet (`directory`,
  `pageTotals`, `mypulsUserId`).

- [ ] **Step 1 : remplacer `money-team-hr.ts`**

```ts
import {
  UA,
  money,
  int,
  intOrNull,
  mypulsIdOf,
  pageTotalsFromCards,
  parseAssignableUsers,
  moneyTeamUrl,
  chatterSummaryUrl,
  type ChatterSummary,
  type MoneyTeamDirectoryEntry,
  type MoneyTeamTx,
  type MoneyTeamDay,
} from '@glagency/mypuls'

/**
 * Parser money-team pour le **Cloudflare Worker** : équivalent streaming de `parseChatterSummary`
 * + `parseMoneyTeamSales` + `parseMoneyTeamDirectory` + `parseMoneyTeamPageTotals` (cheerio), écrit
 * avec `HTMLRewriter` (parseur natif Rust) pour tenir sous la limite de 10 ms CPU du plan Free —
 * cheerio construit un DOM complet (~110 ms sur cette page de 1,75 Mo).
 *
 * Sélecteurs (vérifiés sur capture du 2026-09-06) :
 *   résumé `tr.chatter-row` : 1 nom · 2 réactivité · 3 proposé · 4 vendu ·
 *     (5 taux conv. ignoré) · 6 CA PPV · 7 CA Tips · 8 CA Total
 *   détail `#sales-detail-table tbody tr` : 1 créateur · 2 chatteur · 4 montant · 6 type
 *     + l'id MyPuls du compte, attribut `data-current-user-id` du bouton « Éditer » (colonne 9)
 *   annuaire : options de `select[name="chatter"]` + JSON `assignableUsersByCreator` (script inline)
 *   totaux de page : cartes `.kpi-card` (libellé `h6`, valeur `h3`)
 *
 * Les jeux de sélecteurs sont DISJOINTS : la même fonction lit la page (ventes, annuaire, totaux)
 * ou le fragment (résumé) — `fetchMoneyTeamDayHR` l'appelle une fois sur chacun et fusionne. Les
 * valeurs passent par les MÊMES helpers que cheerio : résultat identique champ par champ.
 */

// `HTMLRewriter` est un global du runtime Workers (absent de Node) — déclaré pour TypeScript.
interface HtmlElement {
  getAttribute(name: string): string | null
}
interface HtmlRewriter {
  on(
    selector: string,
    handlers: { element?: (el: HtmlElement) => void; text?: (t: { text: string }) => void },
  ): HtmlRewriter
  transform(res: Response): Response
}
declare const HTMLRewriter: { new (): HtmlRewriter }

/** Transforme une réponse HTML money-team en `MoneyTeamDay` (streaming, sans DOM). */
export async function parseMoneyTeamHR(res: Response): Promise<MoneyTeamDay> {
  const chatters: ChatterSummary[] = []
  const transactions: MoneyTeamTx[] = []
  const directory: MoneyTeamDirectoryEntry[] = []
  const cards: { label: string; value: string }[] = []

  // Accumulateurs de la ligne résumé courante (texte brut, parsé au flush).
  const s = { name: '', react: '', propose: '', vendu: '', ppv: '', tips: '', ca: '', open: false }
  const flushSummary = () => {
    if (s.open && s.name.trim()) {
      chatters.push({
        name: s.name.trim(),
        reactiviteSec: intOrNull(s.react),
        propose: int(s.propose),
        vendu: int(s.vendu),
        caPpv: money(s.ppv),
        caTips: money(s.tips),
        ca: money(s.ca),
      })
    }
    s.name = s.react = s.propose = s.vendu = s.ppv = s.tips = s.ca = ''
    s.open = false
  }

  // Ligne détail courante. `userId` vient de l'attribut du bouton.
  const d = { creator: '', chatter: '', amount: '', type: '', userId: null as string | null, open: false }
  const flushDetail = () => {
    if (d.open && d.creator.trim()) {
      transactions.push({
        creator: d.creator.trim(),
        chatter: d.chatter.trim(),
        mypulsUserId: d.userId,
        amount: money(d.amount),
        type: d.type.trim(),
      })
    }
    d.creator = d.chatter = d.amount = d.type = ''
    d.userId = null
    d.open = false
  }

  // Option courante du select chatteur.
  const o = { value: null as string | null, label: '', open: false }
  const flushOption = () => {
    const label = o.label.trim()
    if (o.open && o.value && label) directory.push({ mypulsUserId: o.value, label, source: 'select' })
    o.value = null
    o.label = ''
    o.open = false
  }

  // Carte KPI courante.
  const k = { label: '', value: '', open: false }
  const flushCard = () => {
    if (k.open) cards.push({ label: k.label, value: k.value })
    k.label = k.value = ''
    k.open = false
  }

  // Texte des scripts inline : seul `assignableUsersByCreator` en est extrait (~50 Ko par page).
  let scripts = ''

  const rw = new HTMLRewriter()
    .on('tr.chatter-row', { element: () => (flushSummary(), void (s.open = true)) })
    .on('tr.chatter-row td:nth-child(1)', { text: (t) => void (s.name += t.text) })
    .on('tr.chatter-row td:nth-child(2)', { text: (t) => void (s.react += t.text) })
    .on('tr.chatter-row td:nth-child(3)', { text: (t) => void (s.propose += t.text) })
    .on('tr.chatter-row td:nth-child(4)', { text: (t) => void (s.vendu += t.text) })
    .on('tr.chatter-row td:nth-child(6)', { text: (t) => void (s.ppv += t.text) })
    .on('tr.chatter-row td:nth-child(7)', { text: (t) => void (s.tips += t.text) })
    .on('tr.chatter-row td:nth-child(8)', { text: (t) => void (s.ca += t.text) })
    .on('#sales-detail-table tbody tr', { element: () => (flushDetail(), void (d.open = true)) })
    .on('#sales-detail-table tbody tr td:nth-child(1)', { text: (t) => void (d.creator += t.text) })
    .on('#sales-detail-table tbody tr td:nth-child(2)', { text: (t) => void (d.chatter += t.text) })
    .on('#sales-detail-table tbody tr td:nth-child(4)', { text: (t) => void (d.amount += t.text) })
    .on('#sales-detail-table tbody tr td:nth-child(6)', { text: (t) => void (d.type += t.text) })
    .on('#sales-detail-table tbody tr .js-edit-attribution-btn', {
      element: (el) => void (d.userId = mypulsIdOf(el.getAttribute('data-current-user-id'))),
    })
    .on('select[name="chatter"] option', {
      element: (el) => {
        flushOption()
        o.open = true
        o.value = mypulsIdOf(el.getAttribute('value'))
      },
      text: (t) => void (o.label += t.text),
    })
    .on('.kpi-card', { element: () => (flushCard(), void (k.open = true)) })
    .on('.kpi-card h6', { text: (t) => void (k.label += t.text) })
    .on('.kpi-card h3', { text: (t) => void (k.value += t.text) })
    .on('script', { text: (t) => void (scripts += t.text) })

  // Consommer la réponse transformée pilote le parsing (on jette la sortie).
  await rw.transform(res).arrayBuffer()
  flushSummary()
  flushDetail()
  flushOption()
  flushCard()
  directory.push(...parseAssignableUsers(scripts))
  return { chatters, transactions, directory, pageTotals: pageTotalsFromCards(cards) }
}

/**
 * GET authentifié, avec le contrôle de session commun aux deux requêtes du jour.
 * `xhr` seulement sur le FRAGMENT, là où leur JavaScript le pose.
 */
async function get(url: string, cookie: string, what: string, xhr = false): Promise<Response> {
  const res = await fetch(url, {
    headers: {
      Cookie: cookie,
      'User-Agent': UA,
      Accept: 'text/html',
      ...(xhr ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
    },
  })
  if (!res.ok) throw new Error(`GET ${what} ${res.status}`)
  if (res.url.includes('/login')) throw new Error(`${what}: session expirée (redirigé vers /login)`)
  return res
}

/**
 * Money-team d'un jour via HTMLRewriter (équivalent Worker de `fetchMoneyTeamDay`) : ventes,
 * annuaire et totaux viennent de la page, le résumé par chatteur de son fragment.
 */
export async function fetchMoneyTeamDayHR(day: string, cookie: string): Promise<MoneyTeamDay> {
  const [page, summary] = await Promise.all([
    get(moneyTeamUrl(day), cookie, `messaging-money-team (${day})`),
    get(chatterSummaryUrl(day), cookie, `chatter-summary (${day})`, true),
  ])
  const [sales, chatters] = await Promise.all([parseMoneyTeamHR(page), parseMoneyTeamHR(summary)])
  return {
    chatters: chatters.chatters,
    transactions: sales.transactions,
    directory: sales.directory,
    pageTotals: sales.pageTotals,
  }
}
```

- [ ] **Step 2 : la route de vérification rend les nouveaux champs**

`worker.ts`, dans le `Response.json({...})` de `/__parse-moneyteam`, remplacer l'objet par :

```ts
      return Response.json({
        ms: Date.now() - t0,
        chatters: parsed.chatters.length,
        transactions: parsed.transactions.length,
        withIds: parsed.transactions.filter((t) => t.mypulsUserId).length,
        directory: parsed.directory.length,
        pageTotals: parsed.pageTotals,
        sampleChatter: parsed.chatters[0],
        sampleTx: parsed.transactions[0],
        parsed,
      })
```

- [ ] **Step 3 : typecheck**

Run : `pnpm --filter @glagency/ingestion typecheck`
Expected : aucune erreur.

- [ ] **Step 4 : parité avec cheerio, et temps CPU, sur la capture du 06/09**

Terminal 1, depuis le worktree : `pnpm --filter @glagency/ingestion cf:dev`.

Terminal 2 :

```bash
curl -s -X POST --data-binary @../glagencyapp/apps/ingestion/raw/pages/creator-messaging-money-team_start-2026-09-06T00-00_end-2026-09-07T00-00.html \
  http://localhost:8799/__parse-moneyteam | jq '{ms, transactions, withIds, directory, pageTotals}'
```

Expected (comptes mesurés avec cheerio) :
- `transactions` 482, `withIds` 482 ;
- `directory` 731 ;
- `pageTotals` = `{"salesCount":482,"net":[{"currency":"EUR","amount":13047.86}]}`.

Noter `ms` dans la PR. Au-delà de ~10, le signaler. Arrêter `cf:dev`.

- [ ] **Step 5 : CHANGELOG**

Sous `## Non publié`, dans `### Modifié` (créer la rubrique si elle manque) :

```markdown
- Ingestion : la lecture des ventes MyPuls récupère l'id du compte de chaque vente, l'annuaire des libellés et les totaux affichés par la page (préparation de l'identité chatteur et des contrôles de fiabilité ; aucun chiffre ne change).
```

- [ ] **Step 6 : vérifications de PR**

Run : `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:carte`
Expected : tout vert.

- [ ] **Step 7 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- apps/ingestion/src/money-team-hr.ts apps/ingestion/src/worker.ts CHANGELOG.md docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md docs/superpowers/plans/2026-10-01-identite-chatteur-mypuls.md
git commit -m "feat(identite): le parser Worker lit aussi ids, annuaire et totaux de page"
```

Push et PR vers `develop` sur go de Benoit.

---

# PR 2 — rattrapage : rapport + fusions validées (branche `feature/identite-2-rattrapage`)

### Task 3 : `@glagency/core` — types, classement du rapport, preuve de groupe, lots

**Files :**
- Create : `packages/core/src/ingest/identity-types.ts`
- Create : `packages/core/src/ingest/identity.fixtures.ts` (aides de test partagées)
- Create : `packages/core/src/ingest/identity-backfill.ts`
- Test : `packages/core/src/ingest/identity-backfill.test.ts`
- Modify : `packages/core/src/index.ts` (après la ligne 74)

**Interfaces :**
- Produces (`identity-types.ts`) :
  - `IdentityDirectoryEntry`, `IdentityIssueKind`, `IdentityIssue`, `IdentityIssueDbRow`
  - `identityIssueRow(i, source)`
  - `UNDETERMINED_LABEL`
  - `labelIndex(entries, norm): { idsOf(label): ReadonlySet<string> }`
- Produces (`identity-backfill.ts`) :
  - `interface BackfillFiche { id; displayName; email: string | null; mypulsUserId: string | null; linked: boolean; activity: number; aliases: string[] }`
  - `interface BackfillPlan { links; merges: { keep; old; mypulsUserId }[]; issues: IdentityIssue[]; corrupted: string[] }`
  - `planIdentityBackfill({ fiches, directory, norm }): BackfillPlan`
  - `ficheIds({ fiches, directory, norm }): Map<string, Set<string>>`
  - `interface FicheFacts { cd: ReadonlyMap<string, number>; ccd: ReadonlyMap<string, number>; ccdKeys: ReadonlySet<string> }` (centimes par jour ; clés `creatorId|jour`)
  - `NO_FACTS: FicheFacts`
  - `interface GroupProof { ok: boolean; mypulsUserId: string | null; reasons: string[]; daysChecked: number }`
  - `proveGroup({ keep: { facts; ids }, olds: { facts; ids }[], expectedId? }): GroupProof`
  - `interface LotLine { line: number; action: 'fusionner' | 'supprimer'; slug: string; keep: string | null; old: string; expectedId: string | null }`
  - `parseLot(csv: string): LotLine[]`
  - `interface LotDecision { lines: LotLine[]; ok: boolean; mypulsUserId: string | null; reasons: string[] }`
  - `proveLot({ lines, facts, ids, linked, corrupted }): LotDecision[]`
- Produces (`identity.fixtures.ts`) : `norm(s: string): string`, miroir de `normLabel`.

- [ ] **Step 1 : l'aide de test partagée**

`packages/core/src/ingest/identity.fixtures.ts` :

```ts
/**
 * Aides des tests d'identité (pas un test : aucun `it` ici). `norm` est le miroir de `normLabel`
 * (apps/ingestion/src/norm.ts), sans le décodage d'entités HTML, fait en amont par l'ingestion.
 */
export const norm = (s: string): string =>
  s
    .replace(/\s*\(accès révoqué\)\s*$/i, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
```

- [ ] **Step 2 : écrire les tests qui échouent**

`packages/core/src/ingest/identity-backfill.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { identityIssueRow, labelIndex, type IdentityDirectoryEntry } from './identity-types'
import {
  ficheIds,
  parseLot,
  planIdentityBackfill,
  proveGroup,
  proveLot,
  NO_FACTS,
  type BackfillFiche,
  type FicheFacts,
} from './identity-backfill'
import { norm } from './identity.fixtures'

const fiche = (id: string, displayName: string, over: Partial<BackfillFiche> = {}): BackfillFiche => ({
  id,
  displayName,
  email: null,
  mypulsUserId: null,
  linked: false,
  activity: 0,
  aliases: [],
  ...over,
})
const dir = (pairs: [string, string][]): IdentityDirectoryEntry[] =>
  pairs.map(([mypulsUserId, label]) => ({ mypulsUserId, label }))
const plan = (fiches: BackfillFiche[], pairs: [string, string][]) =>
  planIdentityBackfill({ fiches, directory: dir(pairs), norm })
const facts = (cd: [string, number][], ccd: [string, string, number][] = []): FicheFacts => {
  const sums = new Map<string, number>()
  for (const [, day, c] of ccd) sums.set(day, (sums.get(day) ?? 0) + c)
  return { cd: new Map(cd), ccd: sums, ccdKeys: new Set(ccd.map(([cr, day]) => `${cr}|${day}`)) }
}
const ids = (...xs: string[]) => new Set(xs)

describe('labelIndex', () => {
  it('la correspondance EXACTE unique l’emporte sur la clé normalisée ambiguë', () => {
    const idx = labelIndex(
      dir([
        ['243', 'yann (accès révoqué)'],
        ['1163', 'yann (accès révoqué)'],
        ['1163', 'yann'],
      ]),
      norm,
    )
    expect([...idx.idsOf('yann')]).toEqual(['1163'])
    expect([...idx.idsOf('Yann')].sort()).toEqual(['1163', '243'])
    expect(idx.idsOf('inconnu').size).toBe(0)
  })
})

describe('planIdentityBackfill (rapport, lecture seule)', () => {
  it('signale une fiche sans id qui correspond à un seul compte', () => {
    expect(plan([fiche('A', 'Lionel')], [['1802', 'Lionel']]).links).toEqual([{ chatterId: 'A', mypulsUserId: '1802' }])
  })

  it('candidat de fusion : cible = fiche reliée à un membre, même si l’autre a plus d’activité', () => {
    const p = plan(
      [fiche('A', 'Lionel', { activity: 100 }), fiche('B', 'lioneldiv', { linked: true, activity: 1 })],
      [
        ['1802', 'Lionel'],
        ['1802', 'lioneldiv'],
      ],
    )
    expect(p.merges).toEqual([{ keep: 'B', old: 'A', mypulsUserId: '1802' }])
  })

  it('sans membre : cible = fiche qui porte déjà l’id ; sinon la plus active', () => {
    expect(
      plan([fiche('A', 'Ornela', { mypulsUserId: '5614' }), fiche('B', 'Ornella', { activity: 99 })], [['5614', 'Ornella']]).merges,
    ).toEqual([{ keep: 'A', old: 'B', mypulsUserId: '5614' }])
    expect(
      plan(
        [fiche('A', 'Marek', { activity: 5 }), fiche('B', 'Marek_17', { activity: 50 })],
        [
          ['11391', 'Marek'],
          ['11391', 'Marek_17'],
        ],
      ).merges,
    ).toEqual([{ keep: 'B', old: 'A', mypulsUserId: '11391' }])
  })

  it('deux fiches reliées → aucune candidate, anomalie membres_multiples', () => {
    const p = plan(
      [fiche('A', 'JORDAN', { linked: true }), fiche('B', 'Jordan manager', { linked: true })],
      [
        ['296', 'JORDAN'],
        ['296', 'Jordan manager'],
      ],
    )
    expect(p.merges).toEqual([])
    expect(p.issues.map((i) => i.kind)).toEqual(['membres_multiples'])
  })

  it('homonymes mélangés et id contredit → anomalies, rien d’autre', () => {
    expect(plan([fiche('S', 'Serge')], [['9332', 'Serge'], ['10504', 'Serge']]).issues.map((i) => i.kind)).toEqual(['homonyme'])
    expect(plan([fiche('S', 'Serge', { mypulsUserId: '9332' })], [['10504', 'Serge']]).issues.map((i) => i.kind)).toEqual([
      'conflit_id',
    ])
  })

  it('fiches corrompues à part ; pseudo-fiches « Indéterminé (…) » jamais touchées', () => {
    const p = plan(
      [fiche('X', 'Amed\n                Aucune vente sur la période'), fiche('I', 'Indéterminé (Carla)')],
      [['5', 'Indéterminé (Carla)']],
    )
    expect(p.corrupted).toEqual(['X'])
    expect([p.links, p.merges]).toEqual([[], []])
  })

  it('rapproche par l’e-mail (nom de fiche ou colonne email)', () => {
    const p = plan(
      [fiche('E', 'delgazo613@gmail.com'), fiche('F', 'Fred', { email: 'fred@x.fr' })],
      [
        ['8022', 'delgazo613@gmail.com'],
        ['9', 'fred@x.fr'],
      ],
    )
    expect(p.links.map((l) => l.chatterId)).toEqual(['E', 'F'])
  })
})

describe('ficheIds', () => {
  it('id porté ∪ ids désignés par les libellés', () => {
    const m = ficheIds({ fiches: [fiche('A', 'lioneldiv', { mypulsUserId: '1802' })], directory: dir([['1802', 'lioneldiv']]), norm })
    expect([...m.get('A')!]).toEqual(['1802'])
  })
})

describe('proveGroup — la double preuve (même id + compensation au centime)', () => {
  it('cas Lionel : le résumé sur une fiche, les ventes sur l’autre → prouvé', () => {
    const p = proveGroup({
      keep: { facts: facts([['2026-09-06', 14657]]), ids: ids('1802') },
      olds: [{ facts: facts([], [['claire', '2026-09-06', 14657]]), ids: ids('1802') }],
    })
    expect(p).toEqual({ ok: true, mypulsUserId: '1802', reasons: [], daysChecked: 1 })
  })

  it('trois fiches : une paire seule ne compense pas, le groupe oui', () => {
    const keep = { facts: facts([['d1', 3000]]), ids: ids('1163') }
    const old1 = { facts: facts([], [['lola', 'd1', 1000]]), ids: ids('1163') }
    const old2 = { facts: facts([], [['claire', 'd1', 2000]]), ids: ids('1163') }
    expect(proveGroup({ keep, olds: [old1] }).ok).toBe(false)
    expect(proveGroup({ keep, olds: [old1, old2] }).ok).toBe(true)
  })

  it('refus : jour en commun, ids différents, id non établi, id attendu contredit', () => {
    expect(
      proveGroup({ keep: { facts: facts([['d1', 100]]), ids: ids('1') }, olds: [{ facts: facts([['d1', 100]]), ids: ids('1') }] }).reasons.join(' '),
    ).toContain('jour(s) en commun')
    expect(proveGroup({ keep: { facts: NO_FACTS, ids: ids('1') }, olds: [{ facts: NO_FACTS, ids: ids('2') }] }).reasons.join(' ')).toContain(
      'ids MyPuls différents',
    )
    expect(proveGroup({ keep: { facts: NO_FACTS, ids: ids('1') }, olds: [{ facts: NO_FACTS, ids: ids() }] }).ok).toBe(false)
    expect(
      proveGroup({ keep: { facts: NO_FACTS, ids: ids('1') }, olds: [{ facts: NO_FACTS, ids: ids('1') }], expectedId: '2' }).ok,
    ).toBe(false)
  })
})

describe('parseLot', () => {
  const head = 'action,slug,garder,vider,id_attendu\n'
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

  it('lit fusions et suppressions, ignore commentaires et en-tête', () => {
    expect(parseLot(`# lot\n${head}fusionner,yann,${A},${B},1163\nsupprimer,amed,,${C},\n`)).toEqual([
      { line: 3, action: 'fusionner', slug: 'yann', keep: A, old: B, expectedId: '1163' },
      { line: 4, action: 'supprimer', slug: 'amed', keep: null, old: C, expectedId: null },
    ])
  })

  it('refuse : action inconnue, fiche vidée deux fois, fiche gardée vidée ailleurs', () => {
    expect(() => parseLot(`${head}fondre,x,${A},${B},\n`)).toThrow(/action/)
    expect(() => parseLot(`${head}fusionner,x,${A},${B},\nfusionner,y,${C},${B},\n`)).toThrow(/déjà vidée/)
    expect(() => parseLot(`${head}fusionner,x,${A},${B},\nfusionner,y,${C},${A},\n`)).toThrow(/vidée ailleurs/)
  })
})

describe('proveLot', () => {
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const lines = parseLot(`action,slug,garder,vider,id_attendu\nfusionner,yann,${A},${B},1163\nfusionner,yann30000,${A},${C},\n`)
  const factsMap = new Map<string, FicheFacts>([
    [A, facts([['d1', 3000]])],
    [B, facts([], [['lola', 'd1', 1000]])],
    [C, facts([], [['claire', 'd1', 2000]])],
  ])
  const idsMap = new Map([
    [A, ids('1163')],
    [B, ids('1163')],
    [C, ids('1163')],
  ])

  it('les lignes d’une même fiche gardée forment UN groupe, prouvé ensemble', () => {
    const d = proveLot({ lines, facts: factsMap, ids: idsMap, linked: new Set(), corrupted: new Set() })
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ ok: true, mypulsUserId: '1163' })
    expect(d[0]!.lines.map((l) => l.slug)).toEqual(['yann', 'yann30000'])
  })

  it('refus : fiche à vider reliée à un membre, fiche inconnue, suppression non corrompue', () => {
    expect(proveLot({ lines, facts: factsMap, ids: idsMap, linked: new Set([B]), corrupted: new Set() })[0]!.ok).toBe(false)
    expect(proveLot({ lines, facts: new Map(), ids: idsMap, linked: new Set(), corrupted: new Set() })[0]!.reasons.join(' ')).toContain(
      'inconnue',
    )
    const del = parseLot(`action,slug,garder,vider,id_attendu\nsupprimer,amed,,${C},\n`)
    expect(proveLot({ lines: del, facts: factsMap, ids: idsMap, linked: new Set(), corrupted: new Set() })[0]!.ok).toBe(false)
    expect(proveLot({ lines: del, facts: factsMap, ids: idsMap, linked: new Set(), corrupted: new Set([C]) })[0]!.ok).toBe(true)
  })
})

describe('identityIssueRow', () => {
  it('rend les colonnes de chatter_identity_issues avec la source', () => {
    expect(
      identityIssueRow(
        { issueKey: 'k', kind: 'doublon', mypulsUserId: '1', label: 'L', chatterId: 'a', otherChatterId: 'b', day: null, amount: null, detail: 'd' },
        'rattrapage',
      ),
    ).toEqual({
      issue_key: 'k',
      kind: 'doublon',
      mypuls_user_id: '1',
      label: 'L',
      chatter_id: 'a',
      other_chatter_id: 'b',
      day: null,
      amount: null,
      detail: 'd',
      source: 'rattrapage',
    })
  })
})
```

- [ ] **Step 3 : vérifier qu'ils échouent**

Run : `pnpm --filter @glagency/core exec vitest run src/ingest/identity-backfill.test.ts`
Expected : FAIL, modules introuvables.

- [ ] **Step 4 : `identity-types.ts`**

```ts
/**
 * Identité chatteur — briques partagées par le rattrapage, la résolution d'une journée et les
 * contrôles du jour. Pures : aucun accès base.
 * Spec : docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md.
 */

/** Une paire (id MyPuls, libellé) — annuaire d'une page, d'une vente, d'un relevé. */
export interface IdentityDirectoryEntry {
  mypulsUserId: string
  label: string
}

/** Types d'anomalie — miroir EXACT du `check` de `chatter_identity_issues.kind` (0183). */
export type IdentityIssueKind =
  | 'doublon'
  | 'membres_multiples'
  | 'homonyme'
  | 'conflit_id'
  | 'fiche_creee'
  | 'resume_mis_de_cote'
  | 'ecart_invariant'

export interface IdentityIssue {
  /** Clé stable d'idempotence (upsert) : une même anomalie revue chaque nuit reste UNE ligne. */
  issueKey: string
  kind: IdentityIssueKind
  mypulsUserId: string | null
  label: string | null
  chatterId: string | null
  otherChatterId: string | null
  day: string | null
  /** Euros (résumé mis de côté, écart à l'invariant), sinon null. */
  amount: number | null
  detail: string
}

// `type` et non `interface` : supabase-js type `p_issues` en `Json`, qui n'accepte que des types
// objets littéraux (une interface n'a pas de signature d'index).
export type IdentityIssueDbRow = {
  issue_key: string
  kind: IdentityIssueKind
  mypuls_user_id: string | null
  label: string | null
  chatter_id: string | null
  other_chatter_id: string | null
  day: string | null
  amount: number | null
  detail: string
  source: 'ingestion' | 'rattrapage'
}

export function identityIssueRow(i: IdentityIssue, source: IdentityIssueDbRow['source']): IdentityIssueDbRow {
  return {
    issue_key: i.issueKey,
    kind: i.kind,
    mypuls_user_id: i.mypulsUserId,
    label: i.label,
    chatter_id: i.chatterId,
    other_chatter_id: i.otherChatterId,
    day: i.day,
    amount: i.amount,
    detail: i.detail,
    source,
  }
}

/**
 * Libellé MyPuls d'une vente sans chatteur. Sa pseudo-fiche porte les ventes non attribuées de
 * TOUT un modèle : jamais d'id, jamais reliée ni fusionnée (décision Benoit 2026-10-01).
 */
export const UNDETERMINED_LABEL = /^Indéterminé \(/

const EMPTY: ReadonlySet<string> = new Set()

/**
 * Index libellé → ids MyPuls. `idsOf` rend la correspondance EXACTE quand elle désigne un seul
 * compte, sinon la clé normalisée (qui peut en désigner plusieurs) : « yann » vaut 1163 alors que
 * « yann (accès révoqué) » normalisé désigne 243 ET 1163.
 */
export function labelIndex(
  entries: Iterable<IdentityDirectoryEntry>,
  norm: (s: string) => string,
): { idsOf(label: string): ReadonlySet<string> } {
  const exact = new Map<string, Set<string>>()
  const loose = new Map<string, Set<string>>()
  const add = (m: Map<string, Set<string>>, k: string, id: string): void => {
    if (!k) return
    let s = m.get(k)
    if (!s) m.set(k, (s = new Set()))
    s.add(id)
  }
  for (const e of entries) {
    add(exact, e.label.trim(), e.mypulsUserId)
    add(loose, norm(e.label), e.mypulsUserId)
  }
  return {
    idsOf(label: string): ReadonlySet<string> {
      const ex = exact.get(label.trim())
      if (ex && ex.size === 1) return ex
      return loose.get(norm(label)) ?? ex ?? EMPTY
    },
  }
}
```

- [ ] **Step 5 : `identity-backfill.ts`**

```ts
import {
  labelIndex,
  UNDETERMINED_LABEL,
  type IdentityDirectoryEntry,
  type IdentityIssue,
} from './identity-types'

/**
 * RATTRAPAGE d'identité (spec § 5) : un RAPPORT (lecture seule) qui classe les fiches, et la
 * DOUBLE PREUVE exigée de chaque groupe d'un lot validé par Benoit avant toute fusion — même id
 * MyPuls ET compensation au centime jour par jour, aucun jour en commun. La CLI
 * `identity-backfill` lit, écrit le rapport et n'applique qu'un lot ; ici, rien que la décision.
 */

export interface BackfillFiche {
  id: string
  displayName: string
  email: string | null
  mypulsUserId: string | null
  /** Reliée à un membre (`profiles.chatter_id`) : c'est elle que la paie lit. */
  linked: boolean
  /** Σ CA (chatter_daily + chatter_creator_daily), €, pour départager deux fiches sans membre. */
  activity: number
  aliases: string[]
}

export interface BackfillPlan {
  /** Fiches qu'un seul compte désigne (information : l'ingestion posera l'id elle-même). */
  links: { chatterId: string; mypulsUserId: string }[]
  /** Fusions CANDIDATES (cible D10) — appliquées seulement si listées dans un lot validé. */
  merges: { keep: string; old: string; mypulsUserId: string }[]
  issues: IdentityIssue[]
  corrupted: string[]
}

/** Les 26 fiches du 2026-09-07 : libellé de la table de classement lu comme une vente. */
const CORRUPTED = /Aucune vente sur la période|\n/

export function planIdentityBackfill(input: {
  fiches: BackfillFiche[]
  directory: IdentityDirectoryEntry[]
  norm: (s: string) => string
}): BackfillPlan {
  const idx = labelIndex(input.directory, input.norm)
  const plan: BackfillPlan = { links: [], merges: [], issues: [], corrupted: [] }
  const groups = new Map<string, BackfillFiche[]>()

  for (const f of input.fiches) {
    if (CORRUPTED.test(f.displayName)) {
      plan.corrupted.push(f.id)
      continue
    }
    if (UNDETERMINED_LABEL.test(f.displayName)) continue

    const votes = new Set<string>()
    for (const l of [f.displayName, ...f.aliases, ...(f.email ? [f.email] : [])]) {
      for (const id of idx.idsOf(l)) votes.add(id)
    }
    if (votes.size > 1) {
      const list = [...votes].sort()
      plan.issues.push({
        issueKey: `homonyme:${f.id}`,
        kind: 'homonyme',
        mypulsUserId: f.mypulsUserId,
        label: f.displayName,
        chatterId: f.id,
        otherChatterId: null,
        day: null,
        amount: null,
        detail: `La fiche « ${f.displayName} » correspond à ${list.length} comptes MyPuls (${list.join(', ')}) : son historique mélange plusieurs personnes et n'est pas découpé.`,
      })
      continue
    }
    const vote = [...votes][0]
    if (f.mypulsUserId && vote && vote !== f.mypulsUserId) {
      plan.issues.push({
        issueKey: `conflit:${f.id}`,
        kind: 'conflit_id',
        mypulsUserId: f.mypulsUserId,
        label: f.displayName,
        chatterId: f.id,
        otherChatterId: null,
        day: null,
        amount: null,
        detail: `La fiche « ${f.displayName} » porte l'id MyPuls ${f.mypulsUserId}, mais son libellé désigne le compte ${vote}.`,
      })
      continue
    }
    const id = f.mypulsUserId ?? vote
    if (!id) continue
    const g = groups.get(id) ?? []
    g.push(f)
    groups.set(id, g)
  }

  for (const [id, g] of groups) {
    if (g.length === 1) {
      const f = g[0]!
      if (!f.mypulsUserId) plan.links.push({ chatterId: f.id, mypulsUserId: id })
      continue
    }
    const linked = g.filter((f) => f.linked)
    if (linked.length > 1) {
      plan.issues.push({
        issueKey: `membres:${id}`,
        kind: 'membres_multiples',
        mypulsUserId: id,
        label: linked[0]!.displayName,
        chatterId: linked[0]!.id,
        otherChatterId: linked[1]!.id,
        day: null,
        amount: null,
        detail: `L'id MyPuls ${id} correspond à ${linked.length} fiches reliées chacune à un membre (${linked.map((f) => `« ${f.displayName} »`).join(', ')}) : à trancher à la main.`,
      })
      continue
    }
    // Cible (décision Benoit 2026-10-01) : la fiche payée, sinon celle qui porte déjà l'id, sinon la plus active.
    const keep =
      linked[0] ??
      g.find((f) => f.mypulsUserId === id) ??
      [...g].sort((a, b) => b.activity - a.activity || a.id.localeCompare(b.id))[0]!
    for (const f of g) if (f !== keep) plan.merges.push({ keep: keep.id, old: f.id, mypulsUserId: id })
  }
  return plan
}

/** Ids MyPuls de chaque fiche : celui qu'elle porte ∪ ceux que ses libellés désignent. */
export function ficheIds(input: {
  fiches: BackfillFiche[]
  directory: IdentityDirectoryEntry[]
  norm: (s: string) => string
}): Map<string, Set<string>> {
  const idx = labelIndex(input.directory, input.norm)
  const out = new Map<string, Set<string>>()
  for (const f of input.fiches) {
    const s = new Set<string>()
    if (f.mypulsUserId) s.add(f.mypulsUserId)
    for (const l of [f.displayName, ...f.aliases, ...(f.email ? [f.email] : [])]) for (const id of idx.idsOf(l)) s.add(id)
    out.set(f.id, s)
  }
  return out
}

/** Faits d'une fiche : centimes par jour côté résumé (`cd`) et ventes (`ccd`), clés `modèle|jour`. */
export interface FicheFacts {
  cd: ReadonlyMap<string, number>
  ccd: ReadonlyMap<string, number>
  ccdKeys: ReadonlySet<string>
}
export const NO_FACTS: FicheFacts = { cd: new Map(), ccd: new Map(), ccdKeys: new Set() }

export interface GroupProof {
  ok: boolean
  mypulsUserId: string | null
  reasons: string[]
  /** Jours où une fiche à vider a des chiffres — ceux sur lesquels la compensation est vérifiée. */
  daysChecked: number
}

/**
 * DOUBLE PREUVE d'un groupe « une fiche gardée + des fiches à vider » (D13) :
 * 1. même id MyPuls — chaque fiche a un ensemble d'ids non vide, l'union vaut UN id (et l'id
 *    attendu du lot, s'il est donné) ;
 * 2. aucun jour en commun — chatter_daily (jour) et chatter_creator_daily (modèle, jour) ;
 * 3. compensation au centime — chaque jour où une fiche à vider a des chiffres, Σ résumé du
 *    groupe = Σ ventes du groupe (le cas Lionel : le résumé sur une fiche, les ventes sur l'autre).
 * Prouvé en GROUPE : avec trois fiches, une paire seule peut ne pas compenser.
 */
export function proveGroup(input: {
  keep: { facts: FicheFacts; ids: ReadonlySet<string> }
  olds: { facts: FicheFacts; ids: ReadonlySet<string> }[]
  expectedId?: string | null
}): GroupProof {
  const reasons = new Set<string>()
  const all = [input.keep, ...input.olds]

  let mypulsUserId: string | null = null
  if (all.some((f) => f.ids.size === 0)) reasons.add('id MyPuls non établi pour au moins une fiche du groupe')
  else {
    const union = new Set(all.flatMap((f) => [...f.ids]))
    if (union.size !== 1) reasons.add(`ids MyPuls différents (${[...union].sort().join(', ')})`)
    else mypulsUserId = [...union][0]!
  }
  if (mypulsUserId && input.expectedId && input.expectedId !== mypulsUserId) {
    reasons.add(`id attendu ${input.expectedId}, id prouvé ${mypulsUserId}`)
  }

  input.olds.forEach((o, i) => {
    const others = all.filter((_, j) => j !== i + 1)
    const cd = [...o.facts.cd.keys()].filter((d) => others.some((x) => x.facts.cd.has(d))).sort()
    const ccd = [...o.facts.ccdKeys].filter((k) => others.some((x) => x.facts.ccdKeys.has(k)))
    if (cd.length) reasons.add(`${cd.length} jour(s) en commun dans chatter_daily (${cd.slice(0, 3).join(', ')})`)
    if (ccd.length) reasons.add(`${ccd.length} (modèle, jour) en commun dans chatter_creator_daily`)
  })

  const days = [...new Set(input.olds.flatMap((o) => [...o.facts.cd.keys(), ...o.facts.ccd.keys()]))].sort()
  const total = (m: 'cd' | 'ccd', d: string) => all.reduce((s, f) => s + (f.facts[m].get(d) ?? 0), 0)
  const off = days.filter((d) => total('cd', d) !== total('ccd', d))
  if (off.length) reasons.add(`${off.length} jour(s) non compensé(s) au centime (${off.slice(0, 3).join(', ')})`)

  return { ok: reasons.size === 0, mypulsUserId, reasons: [...reasons], daysChecked: days.length }
}

/** Une ligne d'un lot validé (`apps/ingestion/identity-lots/lot-N.csv`). */
export interface LotLine {
  line: number
  action: 'fusionner' | 'supprimer'
  slug: string
  keep: string | null
  old: string
  expectedId: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Lit un lot CSV `action,slug,garder,vider,id_attendu` (lignes `#` ignorées). Lève sur toute ligne invalide. */
export function parseLot(csv: string): LotLine[] {
  const out: LotLine[] = []
  const videes = new Set<string>()
  csv.split('\n').forEach((raw, i) => {
    const line = i + 1
    const s = raw.trim()
    if (!s || s.startsWith('#') || s.startsWith('action,')) return
    const [action = '', slug = '', garder = '', vider = '', id = ''] = s.split(',').map((x) => x.trim())
    if (action !== 'fusionner' && action !== 'supprimer') throw new Error(`lot ligne ${line} : action « ${action} » inconnue`)
    if (!UUID.test(vider)) throw new Error(`lot ligne ${line} : fiche à vider invalide (« ${vider} »)`)
    if (action === 'fusionner' && !UUID.test(garder)) throw new Error(`lot ligne ${line} : fiche gardée invalide (« ${garder} »)`)
    if (action === 'supprimer' && garder) throw new Error(`lot ligne ${line} : « supprimer » ne prend pas de fiche gardée`)
    if (garder === vider) throw new Error(`lot ligne ${line} : fiche gardée = fiche vidée`)
    if (id && !/^[1-9]\d*$/.test(id)) throw new Error(`lot ligne ${line} : id attendu invalide (« ${id} »)`)
    if (videes.has(vider)) throw new Error(`lot ligne ${line} : fiche ${vider} déjà vidée plus haut`)
    videes.add(vider)
    out.push({ line, action, slug, keep: action === 'fusionner' ? garder : null, old: vider, expectedId: id || null })
  })
  for (const l of out) {
    if (l.keep && videes.has(l.keep)) throw new Error(`lot ligne ${l.line} : la fiche gardée ${l.keep} est vidée ailleurs dans le lot`)
  }
  return out
}

export interface LotDecision {
  lines: LotLine[]
  ok: boolean
  mypulsUserId: string | null
  reasons: string[]
}

/**
 * Décision par groupe d'un lot : les lignes `fusionner` qui partagent une fiche gardée forment UN
 * groupe, prouvé par `proveGroup` ; une ligne `supprimer` n'est acceptée que pour une fiche que le
 * rapport classe « corrompue ». Une fiche à vider reliée à un membre est refusée.
 */
export function proveLot(input: {
  lines: LotLine[]
  facts: ReadonlyMap<string, FicheFacts>
  ids: ReadonlyMap<string, ReadonlySet<string>>
  linked: ReadonlySet<string>
  corrupted: ReadonlySet<string>
}): LotDecision[] {
  const out: LotDecision[] = []
  const groups = new Map<string, LotLine[]>()
  for (const l of input.lines) {
    if (l.action === 'supprimer') {
      const reasons: string[] = []
      if (!input.facts.has(l.old)) reasons.push('fiche inconnue')
      else if (!input.corrupted.has(l.old)) reasons.push("la fiche n'est pas classée « corrompue » par le rapport")
      out.push({ lines: [l], ok: reasons.length === 0, mypulsUserId: null, reasons })
      continue
    }
    const g = groups.get(l.keep!) ?? []
    g.push(l)
    groups.set(l.keep!, g)
  }
  for (const [keep, lines] of groups) {
    const reasons: string[] = []
    const unknown = [keep, ...lines.map((l) => l.old)].filter((id) => !input.facts.has(id))
    if (unknown.length) reasons.push(`fiche(s) inconnue(s) : ${unknown.join(', ')}`)
    const linkedOld = lines.filter((l) => input.linked.has(l.old)).map((l) => l.slug)
    if (linkedOld.length) reasons.push(`fiche à vider reliée à un membre : ${linkedOld.join(', ')}`)
    let mypulsUserId: string | null = null
    if (!unknown.length) {
      const proof = proveGroup({
        keep: { facts: input.facts.get(keep)!, ids: input.ids.get(keep) ?? new Set() },
        olds: lines.map((l) => ({ facts: input.facts.get(l.old)!, ids: input.ids.get(l.old) ?? new Set() })),
        expectedId: lines.map((l) => l.expectedId).find((x) => x !== null) ?? null,
      })
      reasons.push(...proof.reasons)
      mypulsUserId = proof.mypulsUserId
    }
    out.push({ lines, ok: reasons.length === 0, mypulsUserId, reasons })
  }
  return out
}
```

- [ ] **Step 6 : exports**

`packages/core/src/index.ts`, après la ligne 74 :

```ts
export { identityIssueRow, labelIndex, UNDETERMINED_LABEL } from './ingest/identity-types'
export type {
  IdentityDirectoryEntry,
  IdentityIssue,
  IdentityIssueDbRow,
  IdentityIssueKind,
} from './ingest/identity-types'
export {
  ficheIds,
  parseLot,
  planIdentityBackfill,
  proveGroup,
  proveLot,
  NO_FACTS,
} from './ingest/identity-backfill'
export type {
  BackfillFiche,
  BackfillPlan,
  FicheFacts,
  GroupProof,
  LotDecision,
  LotLine,
} from './ingest/identity-backfill'
```

- [ ] **Step 7 : vérifier**

Run : `pnpm --filter @glagency/core exec vitest run src/ingest/identity-backfill.test.ts`
Expected : PASS.

Run : `pnpm --filter @glagency/core typecheck`
Expected : aucune erreur.

- [ ] **Step 8 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- packages/core/src/ingest/identity-types.ts packages/core/src/ingest/identity.fixtures.ts packages/core/src/ingest/identity-backfill.ts packages/core/src/ingest/identity-backfill.test.ts packages/core/src/index.ts
git commit -m "feat(identite): rapport du rattrapage, double preuve de groupe et lots validés"
```

---

### Task 4 : migration `0183` — tables, fonctions, test SQL, UAT, types

**Files :**
- Create : `packages/db/supabase/tests/0183_identite_fiabilite.test.sql`
- Create : `packages/db/supabase/migrations/0183_identite_fiabilite.sql`
- Modify : `packages/db/src/types.ts` (régénéré)

**Interfaces :**
- Produces (SQL) :
  - tables `chatter_identity_issues` et `ingest_day_checks` ;
  - `apply_chatter_identity(p_links jsonb, p_issues jsonb) returns jsonb` →
    `{ linked, refused: [{chatter_id, mypuls_user_id}] }` ;
  - `finish_chatter_day(p_day date, p_links jsonb, p_issues jsonb, p_expected jsonb, p_checks jsonb) returns jsonb` →
    `{ linked, refused, status: 'ok' | 'a_verifier', checks: [{code, ok, detail}] }`.
    `p_expected` contient `summary_cents`, `sales_cents`, `sales_count`, `page_net_cents`,
    `page_sales_count` ;
  - `merge_chatters(p_keep uuid, p_old uuid, p_mypuls_id text default null) returns jsonb` ;
  - `delete_empty_chatter(p_id uuid) returns void`.

  Les quatre fonctions ci-dessus sont réservées à `service_role`. Les trois suivantes sont
  ouvertes à `authenticated` (RLS) :
  - `unattributed_sales(p_from date, p_to date) returns json` → `[{creator_id, creator_name, label, ca}]` ;
  - `unranked_chatters_ca(p_from date, p_to date) returns json` → `[{chatter_id, display_name, mypuls_user_id, ca, member_name, member_role}]` ;
  - `reliability_days(p_days int) returns json` → `[{day, status: 'ok'|'a_verifier'|'non_verifie', checks, checked_at}]`.

- [ ] **Step 1 : le numéro est libre**

```bash
ls packages/db/supabase/migrations | tail -2
```

Expected : le dernier fichier est `0182_drop_todos.sql`. Si un `0183_*` existe, prendre le suivant
libre et le reporter partout.

- [ ] **Step 2 : écrire le test SQL (il échouera tant que la migration n'existe pas)**

`packages/db/supabase/tests/0183_identite_fiabilite.test.sql` :

```sql
-- Test de la migration 0183 (identité chatteur + fiabilité). À jouer sur l'UAT avec psql : TOUT
-- est annulé à la fin (rollback). Chaque échec lève « KO : … » et arrête le script.
-- Usage : psql "$UAT_DB" -v ON_ERROR_STOP=1 -f packages/db/supabase/tests/0183_identite_fiabilite.test.sql
\set ON_ERROR_STOP on
begin;

insert into chatters (id, display_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'Test Lionel'),
  ('00000000-0000-4000-8000-0000000000a2', 'Test lioneldiv'),
  ('00000000-0000-4000-8000-0000000000a3', 'Test Autre');
insert into chatter_alias (chatter_id, raw_label, raw_label_norm, source) values
  ('00000000-0000-4000-8000-0000000000a1', 'Test Lionel', 'testlionel', 'manual'),
  ('00000000-0000-4000-8000-0000000000a2', 'Test lioneldiv', 'testlioneldiv', 'manual');
-- Résumé sur A, ventes sur B, mêmes jours : le déséquilibre type (cas Lionel).
insert into chatter_daily (chatter_id, date, ca, ca_ppv, ca_tips) values
  ('00000000-0000-4000-8000-0000000000a1', '2000-01-01', 10, 10, 0),
  ('00000000-0000-4000-8000-0000000000a1', '2000-01-02', 5, 5, 0);
insert into chatter_creator_daily (chatter_id, creator_id, date, ca, ca_ppv, ca_tips)
select '00000000-0000-4000-8000-0000000000a2', (select id from creators order by id limit 1), d, c, c, 0
from (values ('2000-01-01'::date, 10::numeric), ('2000-01-02'::date, 5::numeric)) v(d, c);
-- Spenders : conversation d'abord sur A, puis « réassignée » à B (deux libellés d'un même compte).
insert into spender_conversations (creator_id, fan_id, username, captured_at, assigned_chatter_id)
values ((select id from creators order by id limit 1), -424242, 'test-0183', now(), '00000000-0000-4000-8000-0000000000a1');
update spender_conversations set assigned_chatter_id = '00000000-0000-4000-8000-0000000000a2' where fan_id = -424242;
insert into chatter_identity_issues (issue_key, kind, chatter_id, other_chatter_id, detail)
values ('test:0183:doublon', 'doublon', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', 'test');

-- 1. Fusion B → A, avec l'id MyPuls 990001 posé sur A.
select merge_chatters('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '990001');
do $$
begin
  if exists (select 1 from chatter_daily where chatter_id = '00000000-0000-4000-8000-0000000000a2')
     or exists (select 1 from chatter_creator_daily where chatter_id = '00000000-0000-4000-8000-0000000000a2')
     or exists (select 1 from chatter_alias where chatter_id = '00000000-0000-4000-8000-0000000000a2') then
    raise exception 'KO : il reste des lignes sur la fiche vidée';
  end if;
  if (select sum(ca) from chatter_creator_daily where chatter_id = '00000000-0000-4000-8000-0000000000a1') <> 15 then
    raise exception 'KO : CA des ventes après fusion';
  end if;
  if (select mypuls_user_id from chatters where id = '00000000-0000-4000-8000-0000000000a1') is distinct from '990001' then
    raise exception 'KO : id MyPuls non posé sur la fiche gardée';
  end if;
  if (select assigned_chatter_id from spender_conversations where fan_id = -424242) <> '00000000-0000-4000-8000-0000000000a1' then
    raise exception 'KO : conversation non déplacée';
  end if;
  -- Reste la 1re assignation (null → A) ; partis : l'artefact du trigger (B → A) et A → B devenu A → A.
  if (select count(*) from spender_assignment_events where fan_id = -424242) <> 1
     or exists (select 1 from spender_assignment_events where fan_id = -424242 and from_chatter_id is not distinct from to_chatter_id) then
    raise exception 'KO : historique d''assignation (%)', (select json_agg(e) from spender_assignment_events e where fan_id = -424242);
  end if;
  if exists (select 1 from chatter_identity_issues where issue_key = 'test:0183:doublon') then
    raise exception 'KO : anomalie de la fiche vidée non effacée';
  end if;
end $$;

-- 2. Garde : ids MyPuls contradictoires → refus.
update chatters set mypuls_user_id = '990002' where id = '00000000-0000-4000-8000-0000000000a3';
do $$
begin
  perform merge_chatters('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a3');
  raise exception 'KO : ids contradictoires acceptés';
exception when others then
  if sqlerrm not like 'ids MyPuls différents%' then raise; end if;
end $$;

-- 3. Garde : fiche à vider reliée à un membre → refus.
update chatters set mypuls_user_id = null where id = '00000000-0000-4000-8000-0000000000a3';
update profiles set chatter_id = '00000000-0000-4000-8000-0000000000a3'
 where id = (select id from profiles where chatter_id is null order by id limit 1);
do $$
begin
  perform merge_chatters('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a3');
  raise exception 'KO : membre relié accepté';
exception when others then
  if sqlerrm not like 'la fiche à vider est rattachée%' then raise; end if;
end $$;
update profiles set chatter_id = null where chatter_id = '00000000-0000-4000-8000-0000000000a3';

-- 4. apply_chatter_identity : id déjà pris → refusé et rendu ; id libre → posé ; anomalie upsertée.
do $$
declare r jsonb;
begin
  r := apply_chatter_identity(
    '[{"chatter_id":"00000000-0000-4000-8000-0000000000a3","mypuls_user_id":"990001"}]'::jsonb,
    '[{"issue_key":"test:0183:k","kind":"fiche_creee","detail":"v1","chatter_id":"00000000-0000-4000-8000-0000000000a3"}]'::jsonb);
  if (r->>'linked')::int <> 0 or jsonb_array_length(r->'refused') <> 1 then raise exception 'KO : collision non refusée (%)', r; end if;
  r := apply_chatter_identity(
    '[{"chatter_id":"00000000-0000-4000-8000-0000000000a3","mypuls_user_id":"990003"}]'::jsonb,
    '[{"issue_key":"test:0183:k","kind":"fiche_creee","detail":"v2","chatter_id":"00000000-0000-4000-8000-0000000000a3"}]'::jsonb);
  if (r->>'linked')::int <> 1 then raise exception 'KO : id libre non posé (%)', r; end if;
  if (select count(*) from chatter_identity_issues where issue_key = 'test:0183:k') <> 1
     or (select detail from chatter_identity_issues where issue_key = 'test:0183:k') <> 'v2' then
    raise exception 'KO : anomalie non upsertée';
  end if;
end $$;

-- 5. delete_empty_chatter : supprime une fiche vide (alias compris), refuse une fiche avec faits.
insert into chatters (id, display_name) values ('00000000-0000-4000-8000-0000000000a4', E'Test\n Aucune vente sur la période');
insert into chatter_alias (chatter_id, raw_label, raw_label_norm, source) values
  ('00000000-0000-4000-8000-0000000000a4', E'Test\n Aucune vente sur la période', 'testaucuneventesurlapériode', 'scrape');
select delete_empty_chatter('00000000-0000-4000-8000-0000000000a4');
do $$
begin
  if exists (select 1 from chatters where id = '00000000-0000-4000-8000-0000000000a4') then raise exception 'KO : fiche vide non supprimée'; end if;
  perform delete_empty_chatter('00000000-0000-4000-8000-0000000000a1');
  raise exception 'KO : fiche avec faits supprimée';
exception when others then
  if sqlerrm not like 'fiche % encore référencée%' then raise; end if;
end $$;

-- 6. unattributed_sales : la pseudo-fiche « Indéterminé (…) », et elle seule.
insert into chatters (id, display_name) values ('00000000-0000-4000-8000-0000000000a5', 'Indéterminé (TestModele)');
insert into chatter_creator_daily (chatter_id, creator_id, date, ca, ca_ppv, ca_tips)
values ('00000000-0000-4000-8000-0000000000a5', (select id from creators order by id limit 1), '2000-01-01', 38.32, 38.32, 0);
do $$
declare j json;
begin
  j := unattributed_sales('2000-01-01', '2000-01-02');
  if json_array_length(j) <> 1 or (j->0->>'ca')::numeric <> 38.32 then raise exception 'KO : ventes sans chatteur (%)', j; end if;
end $$;

-- 7. RLS : lecture et « Vu » admin sur les anomalies, lecture admin sur les contrôles.
do $$
begin
  if (select count(*) from pg_policies where tablename = 'chatter_identity_issues') <> 2
     or (select count(*) from pg_policies where tablename = 'ingest_day_checks') <> 1 then
    raise exception 'KO : policies';
  end if;
end $$;

-- 8. finish_chatter_day : b1/b2 calculés EN BASE, statut, upsert idempotent.
insert into chatter_daily (chatter_id, date, ca, ca_ppv, ca_tips) values ('00000000-0000-4000-8000-0000000000a1', '2000-01-03', 7, 7, 0);
insert into chatter_creator_daily (chatter_id, creator_id, date, ca, ca_ppv, ca_tips)
values ('00000000-0000-4000-8000-0000000000a1', (select id from creators order by id limit 1), '2000-01-03', 7, 7, 0);
do $$
declare r jsonb;
begin
  r := finish_chatter_day('2000-01-03', '[]'::jsonb, '[]'::jsonb,
    '{"summary_cents":700,"sales_cents":700,"sales_count":1,"page_net_cents":700,"page_sales_count":1}'::jsonb,
    '[{"code":"a_resume_ventes","ok":true,"detail":"t"}]'::jsonb);
  if r->>'status' <> 'ok' then raise exception 'KO : jour juste marqué %', r; end if;
  -- Une vente perdue (ou écartée) : 8,00 € lus, 7,00 € en base → à vérifier.
  r := finish_chatter_day('2000-01-03', '[]'::jsonb, '[]'::jsonb,
    '{"summary_cents":700,"sales_cents":800,"sales_count":2,"page_net_cents":800,"page_sales_count":2}'::jsonb, '[]'::jsonb);
  if r->>'status' <> 'a_verifier' then raise exception 'KO : vente perdue non détectée (%)', r; end if;
  if (select count(*) from ingest_day_checks where day = '2000-01-03') <> 1
     or (select status from ingest_day_checks where day = '2000-01-03') <> 'a_verifier' then
    raise exception 'KO : ligne de contrôle non upsertée';
  end if;
end $$;

-- 9. reliability_days : le dernier jour de creator_daily en tête, avec son statut.
do $$
declare j json; d date;
begin
  select max(date) into d from creator_daily;
  insert into ingest_day_checks (day, status) values (d, 'a_verifier') on conflict (day) do update set status = 'a_verifier';
  j := reliability_days(3);
  if json_array_length(j) <> 3 or (j->0->>'day')::date <> d or j->0->>'status' <> 'a_verifier' then
    raise exception 'KO : reliability_days (%)', j;
  end if;
end $$;

-- 10. unranked_chatters_ca : une fiche avec CA sans membre « chatteur » apparaît.
do $$
declare j json;
begin
  j := unranked_chatters_ca('2000-01-01', '2000-01-03');
  if not exists (select 1 from json_array_elements(j) e
                 where e->>'chatter_id' = '00000000-0000-4000-8000-0000000000a1' and (e->>'ca')::numeric = 22) then
    raise exception 'KO : CA sans membre (%)', j;
  end if;
end $$;

\echo 'OK — tests 0183 passés (tout est annulé)'
rollback;
```

- [ ] **Step 3 : écrire la migration**

`packages/db/supabase/migrations/0183_identite_fiabilite.sql` :

```sql
-- 0183 — Identité chatteur par id MyPuls + contrôles de fiabilité nocturnes.
-- Spec : docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md (version fiabilité)
--
-- Livre les OUTILS, pas la donnée : les fusions passent par un lot validé par Benoit
-- (`pnpm identity-backfill --lot=… --apply`) ; rien ici ne dépend de l'état de la prod.
--
-- 1. `chatter_identity_issues` : anomalies d'identité (ingestion + rattrapage, service role), lues
--    par l'admin (Membres › Fiches MyPuls). Une fusion efface celles de la fiche vidée.
-- 2. `ingest_day_checks` : UNE ligne par jour ingéré — statut ok / a_verifier et détail des trois
--    contrôles (a résumé = ventes par compte, b totaux, c une fiche = un compte). Upsert : rejouer
--    un jour remplace son verdict.
-- 3. `apply_chatter_identity` : pose d'ids sur des fiches qui n'en ont pas (collision refusée et
--    RENDUE) + upsert des anomalies.
-- 4. `finish_chatter_day` : fin d'une journée d'ingestion, en UN appel (budget Worker) — ids et
--    anomalies, puis b1/b2 calculés EN BASE (Σ chatter_daily, Σ chatter_creator_daily du jour)
--    contre ce qui a été lu, puis verdict du jour.
-- 5. `merge_chatters` : reprise ligne à ligne de la v2 du script de fusion du 2026-10-01
--    (/tmp/fusion/fusion.sh). La fiche vidée est GARDÉE (écart à trancher en revue de PR).
-- 6. `delete_empty_chatter` : supprime une fiche que rien ne référence (fiches corrompues).
-- 7. Lectures de l'onglet (SECURITY INVOKER, la RLS s'applique) : `unattributed_sales` (ventes
--    sans chatteur), `unranked_chatters_ca` (CA sans membre « chatteur » = absent du classement
--    Stat chatter), `reliability_days` (statut des N derniers jours ingérés).

create table if not exists public.chatter_identity_issues (
  id               uuid primary key default gen_random_uuid(),
  issue_key        text not null unique,
  kind             text not null check (kind in ('doublon', 'membres_multiples', 'homonyme', 'conflit_id',
                                                 'fiche_creee', 'resume_mis_de_cote', 'ecart_invariant')),
  mypuls_user_id   text,
  label            text,
  chatter_id       uuid references public.chatters(id) on delete cascade,
  other_chatter_id uuid references public.chatters(id) on delete cascade,
  day              date,
  amount           numeric(12,2),
  detail           text not null,
  source           text not null default 'ingestion' check (source in ('ingestion', 'rattrapage')),
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by      uuid references public.profiles(id) on delete set null
);
create index if not exists chatter_identity_issues_open_idx
  on public.chatter_identity_issues (last_seen_at desc) where resolved_at is null;
create index if not exists chatter_identity_issues_chatter_idx on public.chatter_identity_issues (chatter_id);
create index if not exists chatter_identity_issues_other_idx on public.chatter_identity_issues (other_chatter_id);

alter table public.chatter_identity_issues enable row level security;
create policy chatter_identity_issues_admin_read on public.chatter_identity_issues
  for select to authenticated using ((select public.is_admin()));
create policy chatter_identity_issues_admin_ack on public.chatter_identity_issues
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create table if not exists public.ingest_day_checks (
  day        date primary key,
  status     text not null check (status in ('ok', 'a_verifier')),
  checks     jsonb not null default '[]'::jsonb,
  totals     jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);
alter table public.ingest_day_checks enable row level security;
create policy ingest_day_checks_admin_read on public.ingest_day_checks
  for select to authenticated using ((select public.is_admin()));

-- ─── 3. Pose d'ids + anomalies ───────────────────────────────────────────────────────────────
create or replace function public.apply_chatter_identity(p_links jsonb, p_issues jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_linked int := 0;
  v_refused jsonb := '[]'::jsonb;
  r record;
begin
  for r in
    select * from jsonb_to_recordset(coalesce(p_links, '[]'::jsonb)) as l(chatter_id uuid, mypuls_user_id text)
  loop
    if exists (select 1 from chatters where mypuls_user_id = r.mypuls_user_id) then
      v_refused := v_refused || jsonb_build_object('chatter_id', r.chatter_id, 'mypuls_user_id', r.mypuls_user_id);
      continue;
    end if;
    update chatters set mypuls_user_id = r.mypuls_user_id where id = r.chatter_id and mypuls_user_id is null;
    if found then
      v_linked := v_linked + 1;
    else
      v_refused := v_refused || jsonb_build_object('chatter_id', r.chatter_id, 'mypuls_user_id', r.mypuls_user_id);
    end if;
  end loop;

  insert into chatter_identity_issues
    (issue_key, kind, mypuls_user_id, label, chatter_id, other_chatter_id, day, amount, detail, source)
  select i.issue_key, i.kind, i.mypuls_user_id, i.label, i.chatter_id, i.other_chatter_id, i.day, i.amount,
         i.detail, coalesce(i.source, 'ingestion')
  from jsonb_to_recordset(coalesce(p_issues, '[]'::jsonb)) as i(
    issue_key text, kind text, mypuls_user_id text, label text, chatter_id uuid, other_chatter_id uuid,
    day date, amount numeric, detail text, source text)
  on conflict (issue_key) do update
    set last_seen_at = now(), day = excluded.day, amount = excluded.amount, detail = excluded.detail;

  return jsonb_build_object('linked', v_linked, 'refused', v_refused);
end $$;

-- ─── 4. Fin d'une journée : identité + contrôles b1/b2 en base + verdict ──────────────────────
create or replace function public.finish_chatter_day(
  p_day date, p_links jsonb, p_issues jsonb, p_expected jsonb, p_checks jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  r jsonb;
  v_cd bigint;
  v_ccd bigint;
  e_sum bigint := (p_expected->>'summary_cents')::bigint;
  e_sales bigint := (p_expected->>'sales_cents')::bigint;
  v_checks jsonb := coalesce(p_checks, '[]'::jsonb);
  v_status text;
begin
  r := apply_chatter_identity(p_links, p_issues);

  -- L'état RÉEL de la base, pas ce que le code croit avoir écrit.
  select coalesce(round(sum(ca) * 100), 0) into v_cd from chatter_daily where date = p_day;
  select coalesce(round(sum(ca) * 100), 0) into v_ccd from chatter_creator_daily where date = p_day;
  v_checks := v_checks || jsonb_build_array(
    jsonb_build_object('code', 'b_resume_ecrit', 'ok', v_cd = e_sum, 'detail',
      format('chatter_daily : %s € en base, %s € lus au résumé MyPuls.',
             replace(to_char(v_cd / 100.0, 'FM9999999990.00'), '.', ','),
             replace(to_char(e_sum / 100.0, 'FM9999999990.00'), '.', ','))),
    jsonb_build_object('code', 'b_ventes_ecrites', 'ok', v_ccd = e_sales, 'detail',
      format('chatter_creator_daily : %s € en base, %s € de ventes lues (indéterminées comprises).',
             replace(to_char(v_ccd / 100.0, 'FM9999999990.00'), '.', ','),
             replace(to_char(e_sales / 100.0, 'FM9999999990.00'), '.', ','))));
  if jsonb_array_length(r->'refused') > 0 then
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('code', 'c_lien_refuse', 'ok', false, 'detail',
      format('%s id(s) MyPuls non posé(s) : déjà portés par une autre fiche.', jsonb_array_length(r->'refused'))));
  end if;

  v_status := case when exists (select 1 from jsonb_array_elements(v_checks) e where not (e->>'ok')::boolean)
                   then 'a_verifier' else 'ok' end;
  insert into ingest_day_checks (day, status, checks, totals, checked_at)
  values (p_day, v_status, v_checks,
          coalesce(p_expected, '{}'::jsonb) || jsonb_build_object('chatter_daily_cents', v_cd, 'chatter_creator_daily_cents', v_ccd),
          now())
  on conflict (day) do update
    set status = excluded.status, checks = excluded.checks, totals = excluded.totals, checked_at = excluded.checked_at;

  return r || jsonb_build_object('status', v_status, 'checks', v_checks);
end $$;

-- ─── 5. Fusion (v2 de fusion.sh) ─────────────────────────────────────────────────────────────
create or replace function public.merge_chatters(p_keep uuid, p_old uuid, p_mypuls_id text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  -- Colonnes traitées ici ; toute AUTRE référence à la fiche vidée arrête la fusion. `insights`
  -- reste sur la fiche vidée (calculé, régénéré). `chatter_creators` et `chatter_daily_reach` ne
  -- sont PAS dans la liste, comme dans la v2 : une référence → arrêt.
  handled constant text[] := array[
    'chatter_daily.chatter_id', 'chatter_creator_daily.chatter_id', 'chatter_alias.chatter_id',
    'relances.chatter_id', 'mypuls_shift_segments.chatter_id', 'mypuls_shift_coverage.chatter_id',
    'insights.chatter_id', 'profiles.chatter_id', 'spender_conversations.assigned_chatter_id',
    'spender_assignment_events.from_chatter_id', 'spender_assignment_events.to_chatter_id',
    'chatter_identity_issues.chatter_id', 'chatter_identity_issues.other_chatter_id'];
  k_mid text; o_mid text; t text; c text; found_ boolean;
  b_cd_n bigint; b_cd_ca numeric; b_ccd_n bigint; b_ccd_ca numeric; b_conv bigint;
  a_cd_n bigint; a_cd_ca numeric; a_ccd_n bigint; a_ccd_ca numeric; a_conv bigint;
  ev_old uuid[]; v_keep_profile uuid;
begin
  if p_keep = p_old then raise exception 'même fiche'; end if;
  if (select count(*) from chatters where id in (p_keep, p_old)) <> 2 then raise exception 'fiche introuvable'; end if;
  if exists (select 1 from profiles where chatter_id = p_old) then
    raise exception 'la fiche à vider est rattachée à un membre';
  end if;
  if exists (select 1 from chatter_daily a join chatter_daily b on a.date = b.date
              where a.chatter_id = p_keep and b.chatter_id = p_old) then
    raise exception 'jours en commun (chatter_daily)';
  end if;
  if exists (select 1 from chatter_creator_daily a join chatter_creator_daily b
                on a.date = b.date and a.creator_id = b.creator_id
              where a.chatter_id = p_keep and b.chatter_id = p_old) then
    raise exception 'jours en commun (chatter_creator_daily)';
  end if;
  select mypuls_user_id into k_mid from chatters where id = p_keep;
  select mypuls_user_id into o_mid from chatters where id = p_old;
  if k_mid is not null and o_mid is not null and k_mid <> o_mid then
    raise exception 'ids MyPuls différents (% / %) : pas le même compte', k_mid, o_mid;
  end if;
  if p_mypuls_id is not null and coalesce(k_mid, o_mid, p_mypuls_id) <> p_mypuls_id then
    raise exception 'ids MyPuls différents (% demandé / % porté) : pas le même compte', p_mypuls_id, coalesce(k_mid, o_mid);
  end if;
  for t, c in
    select k.conrelid::regclass::text, a.attname
      from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any(k.conkey)
     where k.contype = 'f' and k.confrelid = 'public.chatters'::regclass
  loop
    if not ((t || '.' || c) = any(handled)) then
      execute format('select exists (select 1 from %s where %I = $1)', t, c) into found_ using p_old;
      if found_ then raise exception 'fiche référencée dans %.% → fusion manuelle', t, c; end if;
    end if;
  end loop;
  for t in
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'chatter_id'
       and not ((table_name || '.chatter_id') = any(handled))
  loop
    execute format('select exists (select 1 from public.%I where chatter_id = $1)', t) into found_ using p_old;
    if found_ then raise exception 'fiche référencée dans %.chatter_id → fusion manuelle', t; end if;
  end loop;

  select count(*), coalesce(sum(ca), 0) into b_cd_n, b_cd_ca from chatter_daily where chatter_id in (p_keep, p_old);
  select count(*), coalesce(sum(ca), 0) into b_ccd_n, b_ccd_ca from chatter_creator_daily where chatter_id in (p_keep, p_old);
  select count(*) into b_conv from spender_conversations where assigned_chatter_id in (p_keep, p_old);
  select coalesce(array_agg(id), '{}') into ev_old from spender_assignment_events
   where from_chatter_id = p_old or to_chatter_id = p_old;
  select id into v_keep_profile from profiles where chatter_id = p_keep;

  update chatter_daily         set chatter_id = p_keep where chatter_id = p_old;
  update chatter_creator_daily set chatter_id = p_keep where chatter_id = p_old;
  update chatter_alias         set chatter_id = p_keep where chatter_id = p_old;
  update relances              set chatter_id = p_keep where chatter_id = p_old;
  update mypuls_shift_segments
     set chatter_id = p_keep, profile_id = coalesce(profile_id, v_keep_profile) where chatter_id = p_old;
  update mypuls_shift_coverage
     set chatter_id = p_keep, profile_id = coalesce(profile_id, v_keep_profile) where chatter_id = p_old;
  update rest_planning_cells
     set chatter_ids = array(
       select x from unnest(array_replace(chatter_ids, p_old, p_keep)) with ordinality as u(x, o)
       group by x order by min(o))
   where p_old = any(chatter_ids);

  -- Spenders. Le trigger 0034 journalise une « réassignation » OLD → KEEP pour chaque conversation
  -- déplacée : artefact de la fusion (même personne), supprimé (horodaté now() = cette transaction).
  update spender_conversations set assigned_chatter_id = p_keep where assigned_chatter_id = p_old;
  delete from spender_assignment_events
   where from_chatter_id = p_old and to_chatter_id = p_keep and changed_at = now()
     and not (id = any(ev_old));
  update spender_assignment_events set from_chatter_id = p_keep where from_chatter_id = p_old;
  update spender_assignment_events set to_chatter_id   = p_keep where to_chatter_id   = p_old;
  -- Les « réassignations » entre les deux libellés d'un même compte n'en étaient pas (KEEP → KEEP).
  delete from spender_assignment_events
   where id = any(ev_old) and from_chatter_id = p_keep and to_chatter_id = p_keep;

  delete from chatter_identity_issues where chatter_id = p_old or other_chatter_id = p_old;

  if o_mid is not null and k_mid is null then
    update chatters set mypuls_user_id = null where id = p_old;
    update chatters set mypuls_user_id = o_mid where id = p_keep;
  elsif p_mypuls_id is not null and k_mid is null and o_mid is null
        and not exists (select 1 from chatters where mypuls_user_id = p_mypuls_id) then
    update chatters set mypuls_user_id = p_mypuls_id where id = p_keep;
  end if;

  for t, c in
    select k.conrelid::regclass::text, a.attname
      from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any(k.conkey)
     where k.contype = 'f' and k.confrelid = 'public.chatters'::regclass
  loop
    if (t || '.' || c) <> 'insights.chatter_id' then
      execute format('select exists (select 1 from %s where %I = $1)', t, c) into found_ using p_old;
      if found_ then raise exception 'il reste une référence dans %.%', t, c; end if;
    end if;
  end loop;
  if exists (select 1 from rest_planning_cells where p_old = any(chatter_ids)) then
    raise exception 'il reste une référence dans rest_planning_cells';
  end if;
  select count(*), coalesce(sum(ca), 0) into a_cd_n, a_cd_ca from chatter_daily where chatter_id = p_keep;
  select count(*), coalesce(sum(ca), 0) into a_ccd_n, a_ccd_ca from chatter_creator_daily where chatter_id = p_keep;
  select count(*) into a_conv from spender_conversations where assigned_chatter_id = p_keep;
  if a_cd_n <> b_cd_n or a_cd_ca <> b_cd_ca or a_ccd_n <> b_ccd_n or a_ccd_ca <> b_ccd_ca or a_conv <> b_conv then
    raise exception 'lignes, CA ou conversations différents après déplacement';
  end if;

  return jsonb_build_object(
    'keep', p_keep, 'old', p_old,
    'chatter_daily', a_cd_n, 'chatter_daily_ca', a_cd_ca,
    'chatter_creator_daily', a_ccd_n, 'chatter_creator_daily_ca', a_ccd_ca,
    'conversations', a_conv,
    'mypuls_user_id', (select mypuls_user_id from chatters where id = p_keep));
end $$;

-- ─── 6. Suppression d'une fiche que rien ne référence ────────────────────────────────────────
create or replace function public.delete_empty_chatter(p_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare t text; c text; found_ boolean;
begin
  for t, c in
    select k.conrelid::regclass::text, a.attname
      from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any(k.conkey)
     where k.contype = 'f' and k.confrelid = 'public.chatters'::regclass
  loop
    if (t || '.' || c) not in ('chatter_alias.chatter_id', 'chatter_identity_issues.chatter_id',
                               'chatter_identity_issues.other_chatter_id') then
      execute format('select exists (select 1 from %s where %I = $1)', t, c) into found_ using p_id;
      if found_ then raise exception 'fiche % encore référencée dans %.%', p_id, t, c; end if;
    end if;
  end loop;
  for t in
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'chatter_id'
       and table_name not in ('chatter_alias', 'chatter_identity_issues')
  loop
    execute format('select exists (select 1 from public.%I where chatter_id = $1)', t) into found_ using p_id;
    if found_ then raise exception 'fiche % encore référencée dans %.chatter_id', p_id, t; end if;
  end loop;
  if exists (select 1 from rest_planning_cells where p_id = any(chatter_ids)) then
    raise exception 'fiche % encore référencée dans rest_planning_cells', p_id;
  end if;
  delete from chatters where id = p_id;
end $$;

-- ─── 7. Lectures de l'onglet Fiches MyPuls (SECURITY INVOKER) ───────────────────────────────
-- Ventes sans chatteur, par modèle (pseudo-fiches « Indéterminé (…) »).
create or replace function public.unattributed_sales(p_from date, p_to date)
returns json language sql stable security invoker set search_path = public as $$
  select coalesce(json_agg(t order by t.ca desc, t.creator_name), '[]'::json)
  from (
    select ccd.creator_id, cr.name as creator_name, c.display_name as label, round(sum(ccd.ca), 2) as ca
      from chatter_creator_daily ccd
      join chatters c on c.id = ccd.chatter_id
      join creators cr on cr.id = ccd.creator_id
     where c.display_name like 'Indéterminé (%' and ccd.date between p_from and p_to
     group by ccd.creator_id, cr.name, c.display_name
  ) t
$$;

-- Fiches avec du CA sans membre au rôle `chatteur` : celles que le classement Stat chatter ignore
-- (`closing-by-chatter.ts` : isChatter = role 'chatteur' ; CA = chatter_daily, comme chatters_report).
create or replace function public.unranked_chatters_ca(p_from date, p_to date)
returns json language sql stable security invoker set search_path = public as $$
  select coalesce(json_agg(t order by t.ca desc, t.display_name), '[]'::json)
  from (
    select c.id as chatter_id, c.display_name, c.mypuls_user_id, round(sum(cd.ca), 2) as ca,
           p.display_name as member_name, p.role as member_role
      from chatter_daily cd
      join chatters c on c.id = cd.chatter_id
      left join profiles p on p.chatter_id = c.id
     where cd.date between p_from and p_to and (p.id is null or p.role <> 'chatteur')
     group by c.id, c.display_name, c.mypuls_user_id, p.display_name, p.role
    having sum(cd.ca) > 0
  ) t
$$;

-- Statut des N derniers jours INGÉRÉS (dernier jour de creator_daily, écrit avant le pas chatteur) :
-- un jour sans ligne de contrôle (pas chatteur en échec) ressort « non_verifie ».
create or replace function public.reliability_days(p_days int)
returns json language sql stable security invoker set search_path = public as $$
  with last as (select max(date) as d from creator_daily),
       days as (select (l.d - g)::date as day from last l, generate_series(0, greatest(p_days, 1) - 1) g where l.d is not null)
  select coalesce(json_agg(json_build_object(
           'day', days.day,
           'status', coalesce(k.status, 'non_verifie'),
           'checks', coalesce(k.checks, '[]'::jsonb),
           'checked_at', k.checked_at) order by days.day desc), '[]'::json)
  from days left join ingest_day_checks k on k.day = days.day
$$;

-- ─── Droits ──────────────────────────────────────────────────────────────────────────────────
revoke execute on function public.apply_chatter_identity(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_chatter_identity(jsonb, jsonb) to service_role;
revoke execute on function public.finish_chatter_day(date, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.finish_chatter_day(date, jsonb, jsonb, jsonb, jsonb) to service_role;
revoke execute on function public.merge_chatters(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.merge_chatters(uuid, uuid, text) to service_role;
revoke execute on function public.delete_empty_chatter(uuid) from public, anon, authenticated;
grant execute on function public.delete_empty_chatter(uuid) to service_role;
revoke execute on function public.unattributed_sales(date, date) from public, anon;
grant execute on function public.unattributed_sales(date, date) to authenticated;
revoke execute on function public.unranked_chatters_ca(date, date) from public, anon;
grant execute on function public.unranked_chatters_ca(date, date) to authenticated;
revoke execute on function public.reliability_days(int) from public, anon;
grant execute on function public.reliability_days(int) to authenticated;
```

- [ ] **Step 4 : ⛔ accord de Benoit, puis le test échoue sur l'UAT (avant la migration)**

Demander : « J'applique `0183` sur l'UAT et j'y lance le test SQL (transaction annulée) ? » Sans
« oui » explicite, s'arrêter là.

```bash
psql "$UAT_DB" -v ON_ERROR_STOP=1 -f packages/db/supabase/tests/0183_identite_fiabilite.test.sql
```

Expected : échec, `relation "chatter_identity_issues" does not exist`. Rien n'est écrit.

- [ ] **Step 5 : appliquer `0183` sur l'UAT (dry-run d'abord)**

```bash
cd packages/db && supabase db push --db-url "$UAT_DB" --dry-run
```

Expected : une seule migration listée, `0183_identite_fiabilite.sql`. Si une autre apparaît,
**s'arrêter** et le signaler.

```bash
supabase db push --db-url "$UAT_DB" && cd ../..
```

- [ ] **Step 6 : le test passe**

```bash
psql "$UAT_DB" -v ON_ERROR_STOP=1 -f packages/db/supabase/tests/0183_identite_fiabilite.test.sql
```

Expected : dernière ligne `OK — tests 0183 passés (tout est annulé)`.

- [ ] **Step 7 : régénérer les types depuis l'UAT**

```bash
cd packages/db && supabase gen types typescript --db-url "$UAT_DB" --schema public > src/types.ts && cd ../..
git diff --stat packages/db/src/types.ts
```

Expected : n'ajoute que les deux tables et les sept fonctions. Sinon, revenir en arrière
(`git checkout -- packages/db/src/types.ts`) et n'ajouter à la main que ces blocs.

Run : `pnpm -r typecheck`
Expected : aucune erreur.

- [ ] **Step 8 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- packages/db/supabase/migrations/0183_identite_fiabilite.sql packages/db/supabase/tests/0183_identite_fiabilite.test.sql packages/db/src/types.ts
git commit -m "feat(identite): anomalies, contrôles par jour et fonctions de fusion (0183)"
```

---

### Task 5 : CLI `identity-backfill` — le rapport (lecture seule)

**Files :**
- Create : `apps/ingestion/src/ops-utils.ts`
- Create : `apps/ingestion/src/identity-backfill.ts`
- Modify : `apps/ingestion/package.json` (script)

**Interfaces :**
- Consumes :
  - `planIdentityBackfill`, `ficheIds`, `proveGroup`, `addDays`, `todayParis` et les types
    (`@glagency/core`) ;
  - `fetchMoneyTeamDay`, `fetchTeamMoney`, `login`, `MoneyTeamDay` (`@glagency/mypuls`) ;
  - `normLabel`, `decodeEntities` (`./norm`).
- Produces :
  - `toCsv(rows)`, `rows(what, p)` (`ops-utils.ts`, réutilisés par la recette, Task 13) ;
  - commande `identity-backfill` ;
  - rapport `apps/ingestion/raw/identity/<jour>/plan.csv`.

- [ ] **Step 1 : utilitaires ops**

`apps/ingestion/src/ops-utils.ts` :

```ts
// Petits utilitaires partagés par les CLI ops (identity-backfill, recette-identite).

/** CSV simple (séparateur `,`), valeurs objet en JSON, guillemets échappés. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const cell = (v: unknown): string => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n'
}

/** Déballe un résultat `fetchAll` : lève avec le nom de la table plutôt que de rendre des maps vides. */
export async function rows<T>(
  what: string,
  p: PromiseLike<{ data: T[]; error: { message: string } | null }>,
): Promise<T[]> {
  const { data, error } = await p
  if (error) throw new Error(`${what} : ${error.message}`)
  return data
}
```

- [ ] **Step 2 : le script npm**

`apps/ingestion/package.json`, dans `scripts`, après `"linkscale"` (ajouter la virgule à sa
ligne) :

```json
    "identity-backfill": "tsx src/identity-backfill.ts"
```

- [ ] **Step 3 : la CLI (rapport ; `--lot` et `--apply` arrivent en Task 6)**

`apps/ingestion/src/identity-backfill.ts` :

```ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fetchMoneyTeamDay, fetchTeamMoney, login, type MoneyTeamDay } from '@glagency/mypuls'
import { createAdminClient, fetchAll } from '@glagency/db'
import {
  addDays,
  ficheIds,
  parseLot,
  planIdentityBackfill,
  proveGroup,
  proveLot,
  todayParis,
  type BackfillFiche,
  type BackfillPlan,
  type FicheFacts,
  type IdentityDirectoryEntry,
  type LotDecision,
} from '@glagency/core'
import { loadEnv } from './env'
import { decodeEntities, normLabel } from './norm'
import { rows, toCsv } from './ops-utils'

// Rattrapage de l'identité chatteur — spec docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md § 5.
//
// Usage : tsx src/identity-backfill.ts [--lot=<fichier>] [--apply] [--depuis=AAAA-MM-JJ]
//   (sans option)  RAPPORT, lecture seule : relit MyPuls jour par jour en remontant depuis hier,
//                  classe les fiches, prouve chaque groupe candidat → raw/identity/<jour>/plan.csv.
//   --lot=…        évalue aussi un lot validé (apps/ingestion/identity-lots/lot-N.csv) →
//                  raw/identity/<jour>/lot-decisions.csv. Toujours en lecture seule.
//   --lot=… --apply  applique LE LOT, et rien d'autre : sauvegarde CSV, fusions des groupes
//                  prouvés, suppressions des fiches corrompues, publication des anomalies.
//                  Sur la PROD, exige en plus IDENTITY_APPLY_PROD=oui (accord explicite de Benoit).
//   --depuis=…     borne basse de la remontée (défaut : premier jour de chatter_creator_daily).
//
// Base visée = SUPABASE_URL / SUPABASE_SECRET_KEY (le .env racine pointe la PROD ; pour l'UAT,
// préfixer la commande avec `uat` — cf. le plan).

type Db = ReturnType<typeof createAdminClient>

const PROD_REF = 'cqmfpsnqaxymswijdnfz'
const PAUSE_MS = 500
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const labelOf = (s: string) => decodeEntities(s).trim()
const cents = (n: number | string | null | undefined) => Math.round(Number(n ?? 0) * 100)

async function loadBase(db: Db) {
  const [chatters, aliases, linked, cd, ccd, creatorDays, coverage] = await Promise.all([
    rows('chatters', fetchAll((f, t) =>
      db.from('chatters').select('id, display_name, email, mypuls_user_id').order('id').range(f, t))),
    rows('chatter_alias', fetchAll((f, t) =>
      db.from('chatter_alias').select('id, chatter_id, raw_label').order('id').range(f, t))),
    rows('profiles', fetchAll((f, t) =>
      db.from('profiles').select('id, chatter_id').not('chatter_id', 'is', null).order('id').range(f, t))),
    rows('chatter_daily', fetchAll((f, t) =>
      db.from('chatter_daily').select('chatter_id, date, ca').order('chatter_id').order('date').range(f, t))),
    rows('chatter_creator_daily', fetchAll((f, t) =>
      db.from('chatter_creator_daily').select('chatter_id, creator_id, date, ca')
        .order('chatter_id').order('creator_id').order('date').range(f, t))),
    rows('creator_daily', fetchAll((f, t) =>
      db.from('creator_daily').select('creator_id, date, ca').order('creator_id').order('date').range(f, t))),
    rows('mypuls_shift_coverage', fetchAll((f, t) =>
      db.from('mypuls_shift_coverage').select('day, slot, mypuls_user_id, chatter_label')
        .order('day').order('slot').order('mypuls_user_id').range(f, t))),
  ])
  return { chatters, aliases, linked, cd, ccd, creatorDays, coverage }
}
type Base = Awaited<ReturnType<typeof loadBase>>

/** Faits de CHAQUE fiche (vide si aucune ligne) : centimes par jour + clés `modèle|jour`. */
function factsOf(base: Base): Map<string, FicheFacts> {
  const cd = new Map<string, Map<string, number>>()
  const ccd = new Map<string, Map<string, number>>()
  const keys = new Map<string, Set<string>>()
  const put = (m: Map<string, Map<string, number>>, id: string, day: string, c: number) => {
    const s = m.get(id) ?? new Map<string, number>()
    s.set(day, (s.get(day) ?? 0) + c)
    m.set(id, s)
  }
  for (const r of base.cd) put(cd, r.chatter_id, r.date, cents(r.ca))
  for (const r of base.ccd) {
    put(ccd, r.chatter_id, r.date, cents(r.ca))
    const k = keys.get(r.chatter_id) ?? new Set<string>()
    k.add(`${r.creator_id}|${r.date}`)
    keys.set(r.chatter_id, k)
  }
  const out = new Map<string, FicheFacts>()
  for (const c of base.chatters) {
    out.set(c.id, { cd: cd.get(c.id) ?? new Map(), ccd: ccd.get(c.id) ?? new Map(), ccdKeys: keys.get(c.id) ?? new Set() })
  }
  return out
}

/**
 * Remonte MyPuls jour par jour, de hier jusqu'à `oldest`, et construit l'annuaire (id, libellé) :
 * ventes, select, JSON des équipes, e-mails de /team/money. S'ARRÊTE au premier jour non servi
 * (erreur HTTP, session, ou 0 vente alors que creator_daily a du CA) et le dit.
 */
async function readMyPuls(cookie: string, oldest: string, caByDay: Map<string, number>) {
  const directory: IdentityDirectoryEntry[] = []
  const seen = new Set<string>()
  const add = (id: string, label: string): void => {
    const l = labelOf(label)
    const k = `${id}|${l}`
    if (!l || seen.has(k)) return
    seen.add(k)
    directory.push({ mypulsUserId: id, label: l })
  }
  let lastServed: string | null = null
  let stop: { day: string; reason: string } | null = null
  for (let day = addDays(todayParis(), -1); day >= oldest; day = addDays(day, -1)) {
    let mt: MoneyTeamDay
    try {
      mt = await fetchMoneyTeamDay(day, cookie)
    } catch (e) {
      stop = { day, reason: (e as Error).message }
      break
    }
    if (mt.transactions.length === 0 && (caByDay.get(day) ?? 0) > 0) {
      stop = { day, reason: 'aucune vente servie alors que creator_daily a du CA ce jour-là' }
      break
    }
    for (const d of mt.directory) add(d.mypulsUserId, d.label)
    for (const t of mt.transactions) if (t.mypulsUserId) add(t.mypulsUserId, t.chatter)
    try {
      for (const tx of await fetchTeamMoney(day)) {
        if (tx.attributed_user_id != null && tx.attributed_user) add(String(tx.attributed_user_id), tx.attributed_user)
      }
    } catch (e) {
      console.warn(`[identité] ${day} : /team/money indisponible (${(e as Error).message}) — e-mails non relus ce jour-là`)
    }
    lastServed = day
    console.log(`[identité] ${day} : ${mt.transactions.length} vente(s), annuaire ${directory.length}`)
    await sleep(PAUSE_MS)
  }
  return { directory, add, lastServed, stop }
}

async function run(): Promise<void> {
  const root = loadEnv()
  const apply = process.argv.includes('--apply')
  const lotArg = process.argv.find((a) => a.startsWith('--lot='))?.slice('--lot='.length)
  const depuis = process.argv.find((a) => a.startsWith('--depuis='))?.slice('--depuis='.length)
  if (apply && !lotArg) {
    throw new Error("--apply exige --lot=<fichier> : seules les fusions d'un lot validé par Benoit sont appliquées.")
  }
  const host = new URL(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://inconnu').host
  console.log(`[identité] base : ${host} — ${apply ? `APPLY du lot ${lotArg}` : 'rapport (lecture seule)'}`)
  if (apply && host.startsWith(PROD_REF) && process.env.IDENTITY_APPLY_PROD !== 'oui') {
    throw new Error('--apply sur la PROD : poser IDENTITY_APPLY_PROD=oui (accord explicite de Benoit requis).')
  }

  const db = createAdminClient()
  const base = await loadBase(db)
  const caByDay = new Map<string, number>()
  for (const r of base.creatorDays) caByDay.set(r.date, (caByDay.get(r.date) ?? 0) + cents(r.ca))
  const oldest = depuis ?? base.ccd.reduce((m, r) => (r.date < m ? r.date : m), todayParis())

  // `login()` et non `refreshCookie()` : la rotation du remember-me appartient au Worker (cf. shifts.ts).
  const { cookie } = await login()
  const my = await readMyPuls(cookie, oldest, caByDay)
  for (const c of base.coverage) my.add(String(c.mypuls_user_id), c.chatter_label)

  const facts = factsOf(base)
  const aliasesBy = new Map<string, string[]>()
  for (const a of base.aliases) aliasesBy.set(a.chatter_id, [...(aliasesBy.get(a.chatter_id) ?? []), a.raw_label])
  const linked = new Set(base.linked.map((p) => p.chatter_id as string))
  const activity = (id: string): number => {
    const f = facts.get(id)
    if (!f) return 0
    let t = 0
    for (const v of f.cd.values()) t += v
    for (const v of f.ccd.values()) t += v
    return t / 100
  }
  const fiches: BackfillFiche[] = base.chatters.map((c) => ({
    id: c.id,
    displayName: c.display_name,
    email: c.email ?? null,
    mypulsUserId: c.mypuls_user_id ?? null,
    linked: linked.has(c.id),
    activity: activity(c.id),
    aliases: aliasesBy.get(c.id) ?? [],
  }))
  const plan = planIdentityBackfill({ fiches, directory: my.directory, norm: normLabel })
  const ids = ficheIds({ fiches, directory: my.directory, norm: normLabel })

  const name = new Map(base.chatters.map((c) => [c.id, c.display_name]))
  const dir = resolve(root, 'apps/ingestion/raw/identity', todayParis())
  mkdirSync(dir, { recursive: true })

  // Groupes candidats (par fiche gardée), chacun avec sa double preuve.
  const candidateGroups = new Map<string, string[]>()
  for (const m of plan.merges) candidateGroups.set(m.keep, [...(candidateGroups.get(m.keep) ?? []), m.old])
  const report: Record<string, unknown>[] = []
  for (const [keep, olds] of candidateGroups) {
    const proof = proveGroup({
      keep: { facts: facts.get(keep)!, ids: ids.get(keep) ?? new Set() },
      olds: olds.map((o) => ({ facts: facts.get(o)!, ids: ids.get(o) ?? new Set() })),
    })
    for (const o of olds) {
      report.push({
        action: 'fusion candidate',
        garder: name.get(keep),
        garder_id: keep,
        vider: name.get(o),
        vider_id: o,
        mypuls_user_id: proof.mypulsUserId,
        preuve: proof.ok ? 'OK' : 'REFUS',
        raisons: proof.reasons.join(' ; '),
        jours_verifies: proof.daysChecked,
      })
    }
  }
  report.push(
    ...plan.links.map((l) => ({ action: 'id à poser (fait par l\'ingestion)', garder: name.get(l.chatterId), garder_id: l.chatterId, mypuls_user_id: l.mypulsUserId })),
    ...plan.corrupted.map((id) => ({ action: 'fiche corrompue', vider: name.get(id), vider_id: id })),
    ...plan.issues.map((i) => ({
      action: i.kind,
      garder: i.chatterId ? name.get(i.chatterId) : '',
      garder_id: i.chatterId,
      vider_id: i.otherChatterId,
      mypuls_user_id: i.mypulsUserId,
      raisons: i.detail,
    })),
  )
  writeFileSync(resolve(dir, 'plan.csv'), toCsv(report))
  console.log(
    `\n[identité] ${candidateGroups.size} groupe(s) candidat(s) (${plan.merges.length} fusion(s)), ` +
      `${plan.links.length} id(s) à poser par l'ingestion, ${plan.corrupted.length} fiche(s) corrompue(s), ` +
      `${plan.issues.length} anomalie(s).`,
  )
  console.log(
    my.stop
      ? `[identité] remontée arrêtée au ${my.stop.day} (${my.stop.reason}) — dernier jour servi : ${my.lastServed ?? 'aucun'} ; plage NON relue : ${oldest} → ${my.stop.day}.`
      : `[identité] historique relu jusqu'au ${oldest}.`,
  )
  console.log(`[identité] rapport : ${resolve(dir, 'plan.csv')}`)

  if (!lotArg) return
  const lines = parseLot(readFileSync(resolve(root, lotArg), 'utf8'))
  const decisions = proveLot({ lines, facts, ids, linked, corrupted: new Set(plan.corrupted) })
  writeLotDecisions(dir, decisions, name)
  if (apply) await applyLot(db, dir, decisions, plan)
}

// Remplacées en Task 6.
function writeLotDecisions(_dir: string, _d: LotDecision[], _name: Map<string, string>): void {
  throw new Error('--lot pas encore disponible (Task 6).')
}
async function applyLot(_db: Db, _dir: string, _d: LotDecision[], _plan: BackfillPlan): Promise<void> {
  throw new Error('--apply pas encore disponible (Task 6).')
}

const isCli = process.argv[1]?.endsWith('identity-backfill.ts')
if (isCli) {
  run().catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
}
```

- [ ] **Step 4 : typecheck**

Run : `pnpm --filter @glagency/ingestion typecheck`
Expected : aucune erreur. Si `fetchAll` n'infère pas un type de ligne, typer `rows<…>` avec
`Database['public']['Tables'][…]['Row']` (`import type { Database } from '@glagency/db'`).

- [ ] **Step 5 : rapport sur l'UAT (lecture seule, sans accord requis)**

```bash
uat pnpm --filter @glagency/ingestion identity-backfill
```

Expected :
- la première ligne annonce l'hôte UAT et « rapport (lecture seule) » ;
- une ligne par jour relu ;
- le résumé ;
- la ligne d'arrêt ;
- le chemin de `plan.csv`.

Ouvrir `plan.csv` : chaque `fusion candidate` a une preuve `OK` ou `REFUS` avec ses raisons.

- [ ] **Step 6 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- apps/ingestion/src/ops-utils.ts apps/ingestion/src/identity-backfill.ts apps/ingestion/package.json
git commit -m "feat(identite): CLI identity-backfill — rapport et preuves des groupes candidats"
```

---

### Task 6 : lots validés — évaluation, apply, lot 1, exécutions, docs PR 2

**Files :**
- Create : `apps/ingestion/identity-lots/lot-1.csv`
- Modify : `apps/ingestion/src/identity-backfill.ts` (`writeLotDecisions`, `applyLot`, `backup`)
- Modify : `docs/CARTE.md` (§ Ingestion), `CHANGELOG.md`

**Interfaces :**
- Consumes : `proveLot`, `LotDecision`, `identityIssueRow` (Task 3) ; RPC
  `apply_chatter_identity`, `merge_chatters`, `delete_empty_chatter` (Task 4).

- [ ] **Step 1 : le lot 1 (les 14 fusions de `/tmp/fusion/toutes.sh`)**

`apps/ingestion/identity-lots/lot-1.csv` :

```csv
# Lot 1 — les 14 fusions vérifiées le 2026-10-01 (ex-/tmp/fusion/toutes.sh, jamais lancées).
# Validé par Benoit en revue de la PR 2. Une ligne = une fiche à vider dans une fiche gardée ;
# les lignes d'une même fiche gardée forment un groupe, prouvé ensemble (yann, rayson).
# Ids = prod. Aucune ligne n'est appliquée sans la double preuve (même id + compensation au centime).
action,slug,garder,vider,id_attendu
fusionner,lionel,d31acb38-12e1-5b2f-9f1b-38f5fc5f227f,7201e3b6-9a36-4cbe-89fa-e3334cd32202,
fusionner,ornela,51457d88-b78e-5358-ae0f-0985459d100d,80ffdd5f-ebcd-4e92-a784-ff8aa3625b41,
fusionner,city,a7c3b98b-4b83-49dc-a3af-bb83ceb6e87c,655c9cdb-a7ea-4905-a773-36b0c38cc1f2,
fusionner,jordan,b855fcc8-e06b-4ab5-9cab-21c4ebb990b8,851fd84c-0bfe-4918-ac4f-b885e0e31f84,
fusionner,yann,b54f2e8c-9abc-48a0-83c0-b1c4b6caf227,6402ad84-475b-4f67-b166-56877319e917,1163
fusionner,yann30000,b54f2e8c-9abc-48a0-83c0-b1c4b6caf227,8930a188-5508-4e8e-8247-16dbfdb0f05f,
fusionner,marek,1b25786a-2e7e-4df8-a730-5677225fcf3a,140b0f9a-818c-4326-b165-3cadaefbbb59,
fusionner,andre,482fdf30-7fe6-5205-b6be-c6e0ac6b9309,2c28f3ae-a4aa-485f-abc0-906d3d66b02a,
fusionner,salem,10fcb4d5-432a-4415-930e-090483de7b09,2e041f92-c98d-4a76-8ef3-accef3a5c768,
fusionner,nambi,9435b57b-5e29-4ef2-924e-034ce395c98e,62ee1fc3-9727-4084-acb0-b9836fcc9d66,
fusionner,neleck,c9a64f66-cd2b-509e-9f75-dcf724fab8c0,ca628f35-154b-4179-972b-c473c73f0904,
fusionner,benj,267be104-00f0-4bed-a965-d68192e79db8,b7d19743-91dd-43f4-beca-e377d6233f00,
fusionner,rayson,edf749ff-3a02-4349-a889-14506acad123,4838a8fe-3488-4c20-a35f-9193cf60f9f3,
fusionner,rayson-mail,edf749ff-3a02-4349-a889-14506acad123,f6603a43-2b45-4591-851a-b015f9099f9c,
```

Avant d'écrire le fichier, relire `/tmp/fusion/toutes.sh` (s'il existe encore) et vérifier que
les 14 couples sont recopiés à l'identique.

- [ ] **Step 2 : remplacer les deux fonctions provisoires**

Ajouter `identityIssueRow,` et `type IdentityIssue,` à l'import de `@glagency/core`. Remplacer
`writeLotDecisions` et `applyLot` par :

```ts
/** Décisions du lot, une ligne par fiche à vider : preuve OK ou raisons du refus. */
function writeLotDecisions(dir: string, decisions: LotDecision[], name: Map<string, string>): void {
  const out = decisions.flatMap((d) =>
    d.lines.map((l) => ({
      ligne: l.line,
      action: l.action,
      slug: l.slug,
      garder: l.keep ? name.get(l.keep) ?? '?' : '',
      vider: name.get(l.old) ?? '?',
      mypuls_user_id: d.mypulsUserId,
      decision: d.ok ? 'ACCEPTÉE' : 'REFUSÉE',
      raisons: d.reasons.join(' ; '),
    })),
  )
  writeFileSync(resolve(dir, 'lot-decisions.csv'), toCsv(out))
  const ok = decisions.filter((d) => d.ok).flatMap((d) => d.lines).length
  console.log(`[identité] lot : ${ok} ligne(s) acceptée(s), ${out.length - ok} refusée(s) → ${resolve(dir, 'lot-decisions.csv')}`)
  for (const d of decisions.filter((x) => !x.ok)) {
    console.log(`  REFUS ${d.lines.map((l) => l.slug).join(' + ')} : ${d.reasons.join(' ; ')}`)
  }
}

/** Sauvegarde CSV de tout ce qu'une fusion ou une suppression peut toucher, AVANT d'écrire. */
async function backup(db: Db, dir: string, ids: string[]): Promise<void> {
  if (!ids.length) return
  const list = `(${ids.join(',')})`
  const dump = async (table: string, p: PromiseLike<{ data: object[]; error: { message: string } | null }>) => {
    const data = await rows(table, p)
    writeFileSync(resolve(dir, `sauvegarde_${table}.csv`), toCsv(data as Record<string, unknown>[]))
  }
  await dump('chatters', fetchAll((f, t) => db.from('chatters').select('*').in('id', ids).order('id').range(f, t)))
  await dump('profiles', fetchAll((f, t) =>
    db.from('profiles').select('id, display_name, chatter_id').in('chatter_id', ids).order('id').range(f, t)))
  await dump('chatter_daily', fetchAll((f, t) =>
    db.from('chatter_daily').select('*').in('chatter_id', ids).order('chatter_id').order('date').range(f, t)))
  await dump('chatter_creator_daily', fetchAll((f, t) =>
    db.from('chatter_creator_daily').select('*').in('chatter_id', ids)
      .order('chatter_id').order('creator_id').order('date').range(f, t)))
  await dump('chatter_alias', fetchAll((f, t) =>
    db.from('chatter_alias').select('*').in('chatter_id', ids).order('id').range(f, t)))
  await dump('relances', fetchAll((f, t) => db.from('relances').select('*').in('chatter_id', ids).order('id').range(f, t)))
  await dump('mypuls_shift_segments', fetchAll((f, t) =>
    db.from('mypuls_shift_segments').select('*').in('chatter_id', ids)
      .order('mypuls_user_id').order('started_at').range(f, t)))
  await dump('mypuls_shift_coverage', fetchAll((f, t) =>
    db.from('mypuls_shift_coverage').select('*').in('chatter_id', ids)
      .order('day').order('slot').order('mypuls_user_id').range(f, t)))
  await dump('spender_conversations', fetchAll((f, t) =>
    db.from('spender_conversations').select('*').in('assigned_chatter_id', ids)
      .order('creator_id').order('fan_id').range(f, t)))
  await dump('spender_assignment_events', fetchAll((f, t) =>
    db.from('spender_assignment_events').select('*')
      .or(`from_chatter_id.in.${list},to_chatter_id.in.${list}`).order('id').range(f, t)))
  await dump('rest_planning_cells', fetchAll((f, t) =>
    db.from('rest_planning_cells').select('*').overlaps('chatter_ids', ids)
      .order('week_start').order('day').order('col').range(f, t)))
  await dump('insights', fetchAll((f, t) =>
    db.from('insights').select('*').in('chatter_id', ids).order('insight_key').order('generated_at').range(f, t)))
  console.log(`[identité] sauvegarde CSV : ${dir}/sauvegarde_*.csv`)
}

/**
 * Applique LE LOT, rien d'autre (D13) : sauvegarde, fusions des groupes prouvés (une transaction
 * par paire), suppressions des fiches corrompues acceptées, puis publication des anomalies du
 * rapport et des candidates NON appliquées — elles apparaissent dans Membres › Fiches MyPuls.
 */
async function applyLot(db: Db, dir: string, decisions: LotDecision[], plan: BackfillPlan): Promise<void> {
  const accepted = decisions.filter((d) => d.ok)
  await backup(db, dir, [...new Set(accepted.flatMap((d) => d.lines.flatMap((l) => (l.keep ? [l.keep, l.old] : [l.old]))))])

  let refused = 0
  const applied = new Set<string>()
  for (const d of accepted) {
    for (const l of d.lines) {
      if (l.action === 'supprimer') {
        const { error } = await db.rpc('delete_empty_chatter', { p_id: l.old })
        if (error) {
          refused++
          console.error(`[identité] suppression ${l.slug} REFUSÉE : ${error.message}`)
        } else console.log(`[identité] suppression ${l.slug} : faite`)
        continue
      }
      const { data, error } = await db.rpc('merge_chatters', { p_keep: l.keep!, p_old: l.old, p_mypuls_id: d.mypulsUserId })
      if (error) {
        refused++
        console.error(`[identité] fusion ${l.slug} REFUSÉE : ${error.message}`)
      } else {
        applied.add(l.old)
        console.log(`[identité] fusion ${l.slug} :`, JSON.stringify(data))
      }
    }
  }

  const pending: IdentityIssue[] = plan.merges
    .filter((m) => !applied.has(m.old))
    .map((m) => ({
      issueKey: `doublon:candidat:${[m.keep, m.old].sort().join(':')}`,
      kind: 'doublon',
      mypulsUserId: m.mypulsUserId,
      label: null,
      chatterId: m.keep,
      otherChatterId: m.old,
      day: null,
      amount: null,
      detail: `Fusion candidate (id MyPuls ${m.mypulsUserId}) non appliquée : à mettre dans un lot si la preuve du rapport est OK.`,
    }))
  const issues = [...plan.issues, ...pending]
  if (issues.length) {
    const { error } = await db.rpc('apply_chatter_identity', {
      p_links: [],
      p_issues: issues.map((i) => identityIssueRow(i, 'rattrapage')),
    })
    if (error) throw new Error(`apply_chatter_identity : ${error.message}`)
    console.log(`[identité] ${issues.length} anomalie(s) publiée(s) dans Membres › Fiches MyPuls`)
  }
  if (refused) throw new Error(`${refused} opération(s) refusée(s) par la base — voir ci-dessus ; les autres sont faites.`)
  console.log('[identité] apply du lot terminé.')
}
```

Si `tsc` refuse `p_issues` (affectation à `Json`), importer `import type { Json } from
'@glagency/db'` et caster le tableau `as Json`.

- [ ] **Step 3 : typecheck**

Run : `pnpm --filter @glagency/ingestion typecheck`
Expected : aucune erreur.

- [ ] **Step 4 : `--apply` sans lot est refusé (sans accès distant en écriture)**

```bash
uat pnpm --filter @glagency/ingestion identity-backfill --apply; echo "code=$?"
```

Expected : message « --apply exige --lot=<fichier> … », `code=1`.

- [ ] **Step 5 : ⛔ accord de Benoit, puis répétition sur l'UAT**

Les uuid du lot 1 sont ceux de la prod. Sur l'UAT, la répétition passe par un lot tiré du rapport
UAT.

1. Créer `apps/ingestion/raw/identity/lot-repetition-uat.csv` (gitignoré) avec l'en-tête
   `action,slug,garder,vider,id_attendu`, puis 2 ou 3 groupes du `plan.csv` UAT dont la preuve
   est `OK`, et un groupe `REFUS` pour vérifier le refus.
2. Évaluer (lecture seule) :
   ```bash
   uat pnpm --filter @glagency/ingestion identity-backfill --lot=apps/ingestion/raw/identity/lot-repetition-uat.csv
   ```
   Expected : `lot-decisions.csv` accepte les groupes OK et refuse le groupe REFUS, avec ses
   raisons.
3. Demander : « J'applique ce lot de répétition sur l'UAT ? » Sur « oui » :
   ```bash
   uat pnpm --filter @glagency/ingestion identity-backfill --lot=apps/ingestion/raw/identity/lot-repetition-uat.csv --apply
   ```
   Expected : sauvegarde CSV, puis une ligne par fusion, puis les anomalies publiées, puis
   « apply du lot terminé ». Le groupe refusé n'est pas touché.
4. Relancer le même `--lot` sans `--apply`. Expected : les groupes appliqués sont refusés
   (« fiche(s) … » ou « id MyPuls non établi », selon l'état), et plus aucune fusion candidate
   pour ces fiches dans `plan.csv`.

- [ ] **Step 6 : CARTE + CHANGELOG**

`docs/CARTE.md`, § « Ingestion — apps/ingestion », après la ligne `pnpm linkscale` :

```markdown
| `pnpm identity-backfill [--lot=<fichier> [--apply]] [--depuis=AAAA-MM-JJ]` | Rattrapage de l'identité chatteur : rapport en lecture seule (classement des fiches, double preuve de chaque fusion candidate) ; `--lot` évalue un lot validé (`apps/ingestion/identity-lots/`), `--apply` n'applique QUE ce lot (fusions prouvées, fiches corrompues vides) et publie les anomalies | `src/identity-backfill.ts` | tables `chatter_alias`, `chatter_creator_daily`, `chatter_daily`, `chatter_identity_issues`, `chatters`, `creator_daily`, `mypuls_shift_coverage`, `profiles` ; rpc `apply_chatter_identity`, `delete_empty_chatter`, `merge_chatters` | `docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md` |
```

`CHANGELOG.md`, sous `## Non publié`, dans `### Corrigé` :

```markdown
- Chatteurs : rattrapage des fiches MyPuls en double par lots validés — un rapport en lecture seule prouve chaque fusion (même id MyPuls et compensation au centime jour par jour), seules les fusions d'un lot validé sont appliquées (lot 1 : les 14 fusions vérifiées) ; commande `pnpm identity-backfill`.
```

- [ ] **Step 7 : vérifications de PR**

Run : `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:carte`
Expected : tout vert.

- [ ] **Step 8 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- apps/ingestion/identity-lots/lot-1.csv apps/ingestion/src/identity-backfill.ts docs/CARTE.md CHANGELOG.md
git commit -m "feat(identite): lots validés — évaluation, apply des groupes prouvés, lot 1"
```

Push et PR vers `develop` sur go de Benoit. Dans la description :
- le rapport UAT ;
- la répétition ;
- l'écart à trancher en revue : **fiche vidée gardée ou supprimée**. Pour supprimer, ajouter
  `delete from chatters where id = p_old;` juste avant le `return` de `merge_chatters`, et dans
  le bloc 1 du test SQL :
  `if exists (select 1 from chatters where id = '00000000-0000-4000-8000-0000000000a2') then raise exception 'KO : fiche vidée non supprimée'; end if;`
  Puis rejouer le test sur l'UAT.

- [ ] **Step 9 : ⛔ prod — chaque étape sur accord explicite de Benoit, dans cet ordre**

1. **`0183` en prod** :
   ```bash
   cd packages/db && supabase db push --db-url "$PROD_DB" --dry-run   # doit lister 0183 et rien d'autre
   supabase db push --db-url "$PROD_DB" && cd ../..
   ```
2. **Rapport + évaluation du lot 1 en prod** (lecture seule) :
   ```bash
   pnpm --filter @glagency/ingestion identity-backfill --lot=apps/ingestion/identity-lots/lot-1.csv
   ```
   Envoyer `lot-decisions.csv` et `plan.csv` à Benoit.
3. **Apply du lot 1**, sur un « oui » qui porte sur ce `lot-decisions.csv` :
   ```bash
   IDENTITY_APPLY_PROD=oui pnpm --filter @glagency/ingestion identity-backfill --lot=apps/ingestion/identity-lots/lot-1.csv --apply
   ```
4. **Relancer l'étape 2.** Attendu : plus aucune fusion candidate pour les 14 groupes. Un groupe
   refusé reste listé avec ses raisons, et Benoit décide.

---

# PR 3 — résolution par id + contrôles nocturnes (branche `feature/identite-3-pipeline`)

**Déploiement du Worker seulement après l'apply prod du lot 1 (Task 6) ET une recette sans
mouvement inexpliqué (Task 14).**

### Task 7 : `@glagency/core` — `resolveDayIdentity`

**Files :**
- Create : `packages/core/src/ingest/chatter-identity.ts`
- Test : `packages/core/src/ingest/chatter-identity.test.ts`
- Modify : `packages/core/src/ingest/identity.fixtures.ts` (ajout de `state`)
- Modify : `packages/core/src/index.ts`

**Interfaces :**
- Consumes : `labelIndex`, `UNDETERMINED_LABEL`, `IdentityDirectoryEntry`, `IdentityIssue`
  (Task 3) ; `norm` (fixtures).
- Produces :
  - `interface SummaryLine { label: string; ca: number }`
  - `interface SaleLine { label: string; mypulsUserId: string | null; amount: number }`
  - `interface IdentityState { chatterByMypulsId; mypulsIdByChatter; aliasOf; byName; byEmail; linkedChatters }` (signatures en Step 4)
  - `interface DayIdentity { summaryChatter: (string | null)[]; summaryIds: (string | null)[]; saleChatter: (string | null)[]; newChatters: { id; displayName; mypulsUserId: string | null }[]; newAliases: { chatterId; rawLabel; rawLabelNorm }[]; links: { chatterId; mypulsUserId }[]; issues: IdentityIssue[]; technical: string[]; noIds: boolean }`
  - `resolveDayIdentity({ day, summary, sales, directory, state, norm, newId }): DayIdentity`
  - fixtures : `state(fiches: F[]): IdentityState`, `interface F { id; name; mypulsId?; aliases?; linked? }`

- [ ] **Step 1 : compléter les fixtures**

À la fin de `packages/core/src/ingest/identity.fixtures.ts` :

```ts
import type { IdentityState } from './chatter-identity'

/** Une fiche de test : id, nom, et au besoin id MyPuls, alias et lien membre. */
export interface F {
  id: string
  name: string
  mypulsId?: string
  aliases?: string[]
  linked?: boolean
}

/** État d'identité de test : le nom et les alias de chaque fiche sont ses clés d'alias. */
export function state(fiches: F[]): IdentityState {
  const alias = new Map<string, string>()
  const name = new Map<string, string>()
  const byId = new Map<string, string>()
  const idOf = new Map<string, string | null>()
  const linked = new Set<string>()
  for (const f of fiches) {
    name.set(f.name, f.id)
    idOf.set(f.id, f.mypulsId ?? null)
    if (f.mypulsId) byId.set(f.mypulsId, f.id)
    for (const a of [f.name, ...(f.aliases ?? [])]) alias.set(norm(a), f.id)
    if (f.linked) linked.add(f.id)
  }
  return {
    chatterByMypulsId: byId,
    mypulsIdByChatter: idOf,
    aliasOf: (n) => alias.get(n),
    byName: (r) => name.get(r),
    byEmail: () => undefined,
    linkedChatters: linked,
  }
}
```

Mettre l'`import type` en tête du fichier.

- [ ] **Step 2 : écrire les tests qui échouent**

`packages/core/src/ingest/chatter-identity.test.ts` :

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resolveDayIdentity, type SaleLine, type SummaryLine } from './chatter-identity'
import type { IdentityDirectoryEntry } from './identity-types'
import { norm, state, type F } from './identity.fixtures'

let n = 0
beforeEach(() => {
  n = 0
})
const run = (o: { fiches?: F[]; summary?: SummaryLine[]; sales?: SaleLine[]; directory?: [string, string][] }) =>
  resolveDayIdentity({
    day: '2026-09-06',
    summary: o.summary ?? [],
    sales: o.sales ?? [],
    directory: (o.directory ?? []).map(([mypulsUserId, label]): IdentityDirectoryEntry => ({ mypulsUserId, label })),
    state: state(o.fiches ?? []),
    norm,
    newId: () => `new-${++n}`,
  })

describe('resolveDayIdentity', () => {
  it('une vente suit l’id, même sous le libellé d’une autre fiche — doublon signalé, alias intact', () => {
    const r = run({
      fiches: [{ id: 'A', name: 'Lionel', mypulsId: '1802' }, { id: 'B', name: 'lioneldiv' }],
      summary: [{ label: 'Lionel', ca: 12 }],
      sales: [{ label: 'lioneldiv', mypulsUserId: '1802', amount: 12 }],
      directory: [['1802', 'Lionel']],
    })
    expect(r.summaryChatter).toEqual(['A'])
    expect(r.summaryIds).toEqual(['1802'])
    expect(r.saleChatter).toEqual(['A'])
    expect(r.issues.map((i) => [i.kind, i.chatterId, i.otherChatterId])).toEqual([['doublon', 'A', 'B']])
    expect([r.newAliases, r.links]).toEqual([[], []])
  })

  it('résumé « City of the gamer » + vente « Cité des gamers », même id : la fiche du résumé reçoit l’id', () => {
    const r = run({
      fiches: [{ id: 'C', name: 'City of the gamer' }],
      summary: [{ label: 'City of the gamer', ca: 4.4 }],
      sales: [{ label: 'Cité des gamers', mypulsUserId: '9550', amount: 4.4 }],
      directory: [['9550', 'City of the gamer']],
    })
    expect(r.links).toEqual([{ chatterId: 'C', mypulsUserId: '9550' }])
    expect([r.summaryChatter, r.saleChatter]).toEqual([['C'], ['C']])
    expect(r.newAliases).toEqual([{ chatterId: 'C', rawLabel: 'Cité des gamers', rawLabelNorm: 'citédesgamers' }])
    expect(r.issues).toEqual([])
  })

  it('correspondance exacte avant normalisation : « yann » = 1163', () => {
    const r = run({
      fiches: [{ id: 'Y', name: 'yann' }],
      summary: [{ label: 'yann', ca: 0 }],
      directory: [
        ['243', 'yann (accès révoqué)'],
        ['1163', 'yann (accès révoqué)'],
        ['1163', 'yann'],
      ],
    })
    expect(r.links).toEqual([{ chatterId: 'Y', mypulsUserId: '1163' }])
  })

  it('libellé ambigu départagé par le montant au centime (Serge → 10504)', () => {
    const r = run({
      fiches: [{ id: 'S', name: 'Serge' }],
      summary: [{ label: 'Serge', ca: 70.79 }],
      sales: [{ label: 'Serge', mypulsUserId: '10504', amount: 70.79 }],
      directory: [
        ['9332', 'Serge'],
        ['10504', 'Serge'],
      ],
    })
    expect(r.summaryIds).toEqual(['10504'])
    expect(r.links).toEqual([{ chatterId: 'S', mypulsUserId: '10504' }])
    expect(r.issues).toEqual([])
  })

  it('libellé ambigu NON départagé (CA 0) : mis de côté, aucune fiche créée, anomalie', () => {
    const r = run({ summary: [{ label: 'Serge', ca: 0 }], directory: [['9332', 'Serge'], ['10504', 'Serge']] })
    expect([r.summaryChatter, r.summaryIds]).toEqual([[null], [null]])
    expect(r.newChatters).toEqual([])
    expect(r.issues.map((i) => [i.kind, i.amount])).toEqual([['resume_mis_de_cote', 0]])
  })

  it('deux candidats au même montant : mis de côté ; les ventes suivent leur id', () => {
    const r = run({
      summary: [{ label: 'Serge', ca: 10 }],
      sales: [
        { label: 'Serge', mypulsUserId: '9332', amount: 10 },
        { label: 'Serge', mypulsUserId: '10504', amount: 10 },
      ],
    })
    expect(r.summaryChatter).toEqual([null])
    expect(r.saleChatter).toEqual(['new-1', 'new-2'])
    expect(r.newChatters.map((c) => c.mypulsUserId)).toEqual(['9332', '10504'])
    expect(r.issues.map((i) => i.kind).sort()).toEqual(['fiche_creee', 'fiche_creee', 'resume_mis_de_cote'])
  })

  it('homonyme déjà identifié : la fiche par alias porte un AUTRE id → nouvelle fiche, ni lien ni doublon', () => {
    const r = run({
      fiches: [{ id: 'S', name: 'Serge', mypulsId: '9332' }],
      summary: [{ label: 'Serge', ca: 70.79 }],
      sales: [{ label: 'Serge', mypulsUserId: '10504', amount: 70.79 }],
      directory: [['9332', 'Serge']],
    })
    expect(r.newChatters).toEqual([{ id: 'new-1', displayName: 'Serge', mypulsUserId: '10504' }])
    expect([r.summaryChatter, r.saleChatter]).toEqual([['new-1'], ['new-1']])
    expect([r.newAliases, r.links]).toEqual([[], []])
    expect(r.issues.map((i) => i.kind)).toEqual(['fiche_creee'])
  })

  it('deux fiches libres : l’id va à celle reliée à un membre (la fiche payée), doublon signalé', () => {
    const r = run({
      fiches: [{ id: 'L1', name: 'Jordan', linked: true }, { id: 'L2', name: 'Jordan manager' }],
      summary: [{ label: 'JORDAN', ca: 5 }],
      sales: [{ label: 'Jordan manager', mypulsUserId: '296', amount: 5 }],
      directory: [['296', 'JORDAN']],
    })
    expect(r.links).toEqual([{ chatterId: 'L1', mypulsUserId: '296' }])
    expect([r.summaryChatter, r.saleChatter]).toEqual([['L1'], ['L1']])
    expect(r.issues.map((i) => [i.kind, i.chatterId, i.otherChatterId])).toEqual([['doublon', 'L1', 'L2']])
  })

  it('deux fiches libres reliées chacune à un membre : rien n’est posé, anomalie, lignes par libellé', () => {
    const r = run({
      fiches: [
        { id: 'L1', name: 'Jordan', linked: true },
        { id: 'L2', name: 'Jordan manager', linked: true },
      ],
      summary: [{ label: 'JORDAN', ca: 5 }],
      sales: [{ label: 'Jordan manager', mypulsUserId: '296', amount: 5 }],
      directory: [['296', 'JORDAN']],
    })
    expect(r.links).toEqual([])
    expect([r.summaryChatter, r.saleChatter]).toEqual([['L1'], ['L2']])
    expect(r.issues.map((i) => i.kind)).toEqual(['membres_multiples'])
  })

  it('compte inconnu : fiche créée AVEC son id, alias posé', () => {
    const r = run({ summary: [{ label: 'Nouveau', ca: 3 }], sales: [{ label: 'Nouveau', mypulsUserId: '777', amount: 3 }] })
    expect(r.newChatters).toEqual([{ id: 'new-1', displayName: 'Nouveau', mypulsUserId: '777' }])
    expect(r.newAliases).toEqual([{ chatterId: 'new-1', rawLabel: 'Nouveau', rawLabelNorm: 'nouveau' }])
    expect(r.issues.map((i) => [i.kind, i.issueKey])).toEqual([['fiche_creee', 'fiche:777']])
  })

  it('vente indéterminée : sa pseudo-fiche par alias, jamais d’id, pas d’alerte technique', () => {
    const r = run({
      fiches: [{ id: 'I', name: 'Indéterminé (Sarahcbr)' }, { id: 'A', name: 'Lionel', mypulsId: '1802' }],
      summary: [{ label: 'Lionel', ca: 1 }],
      sales: [
        { label: 'Indéterminé (Sarahcbr)', mypulsUserId: null, amount: 38.32 },
        { label: 'Lionel', mypulsUserId: '1802', amount: 1 },
      ],
    })
    expect(r.saleChatter).toEqual(['I', 'A'])
    expect([r.links, r.technical]).toEqual([[], []])
  })

  it('mode sans id (bouton disparu) : repli intégral sur les libellés, alerte technique, aucun lien', () => {
    const r = run({
      fiches: [{ id: 'A', name: 'Lionel', mypulsId: '1802' }, { id: 'B', name: 'lioneldiv' }],
      summary: [{ label: 'Lionel', ca: 12 }],
      sales: [{ label: 'lioneldiv', mypulsUserId: null, amount: 12 }],
      directory: [['1802', 'Lionel']],
    })
    expect(r.noIds).toBe(true)
    expect(r.technical[0]).toMatch(/aucun id MyPuls/)
    expect([r.summaryChatter, r.saleChatter]).toEqual([['A'], ['B']])
    expect([r.links, r.issues]).toEqual([[], []])
  })

  it('vente sans id hors « Indéterminé » parmi des ventes identifiées : alerte technique nominative', () => {
    const r = run({
      fiches: [{ id: 'A', name: 'Lionel', mypulsId: '1802' }],
      summary: [{ label: 'Lionel', ca: 1 }],
      sales: [
        { label: 'Bizarre', mypulsUserId: null, amount: 1 },
        { label: 'Lionel', mypulsUserId: '1802', amount: 1 },
      ],
    })
    expect(r.technical.join(' ')).toContain('Bizarre')
  })

  it('écart à l’invariant : CA du résumé ≠ Σ ventes du même id → anomalie chiffrée', () => {
    const r = run({
      fiches: [{ id: 'A', name: 'Lionel', mypulsId: '1802' }],
      summary: [{ label: 'Lionel', ca: 10 }],
      sales: [{ label: 'Lionel', mypulsUserId: '1802', amount: 12.5 }],
    })
    expect(r.issues.map((i) => [i.kind, i.issueKey, i.amount])).toEqual([['ecart_invariant', 'ecart:2026-09-06:1802', 2.5]])
  })

  it('rejeu idempotent : une fois l’état à jour, rien de neuf', () => {
    const r = run({
      fiches: [{ id: 'C', name: 'City of the gamer', mypulsId: '9550', aliases: ['Cité des gamers'] }],
      summary: [{ label: 'City of the gamer', ca: 4.4 }],
      sales: [{ label: 'Cité des gamers', mypulsUserId: '9550', amount: 4.4 }],
      directory: [['9550', 'City of the gamer']],
    })
    expect([r.links, r.newAliases, r.newChatters, r.issues]).toEqual([[], [], [], []])
  })

  it('libellé vide au résumé → null, sans fiche', () => {
    expect(run({ summary: [{ label: '', ca: 0 }] }).summaryChatter).toEqual([null])
  })
})
```

- [ ] **Step 3 : vérifier qu'ils échouent**

Run : `pnpm --filter @glagency/core exec vitest run src/ingest/chatter-identity.test.ts`
Expected : FAIL, module introuvable.

- [ ] **Step 4 : implémenter `chatter-identity.ts`**

```ts
import {
  labelIndex,
  UNDETERMINED_LABEL,
  type IdentityDirectoryEntry,
  type IdentityIssue,
} from './identity-types'

/**
 * Identité chatteur d'UNE journée money-team : à quelle fiche `chatters` va chaque ligne.
 * Spec : docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md § 2.
 *
 * - Une VENTE porte l'id MyPuls de son compte : c'est lui qui décide.
 * - Une ligne de RÉSUMÉ n'a pas d'id : on le déduit de l'annuaire du jour (exact, puis normalisé),
 *   et un libellé ambigu se départage par l'invariant « CA du résumé = Σ ventes du même id ».
 * - L'alias (libellé → fiche) n'est plus qu'un repli : ligne sans id, ou jour sans aucun id.
 *
 * Pure : la normalisation (`normLabel`) et la fabrique d'uuid sont injectées. `summaryIds` et
 * `noIds` servent aux contrôles du jour (`day-checks.ts`).
 */

export interface SummaryLine {
  label: string
  ca: number
}

export interface SaleLine {
  label: string
  mypulsUserId: string | null
  amount: number
}

export interface IdentityState {
  chatterByMypulsId: ReadonlyMap<string, string>
  mypulsIdByChatter: ReadonlyMap<string, string | null>
  aliasOf: (norm: string) => string | undefined
  byName: (raw: string) => string | undefined
  byEmail: (norm: string) => string | undefined
  /** Fiches reliées à un membre (`profiles.chatter_id`) : celles que la paie lit. */
  linkedChatters: ReadonlySet<string>
}

export interface DayIdentity {
  summaryChatter: (string | null)[]
  /** Id MyPuls déduit de chaque ligne de résumé (null : aucun, ou mis de côté). */
  summaryIds: (string | null)[]
  saleChatter: (string | null)[]
  newChatters: { id: string; displayName: string; mypulsUserId: string | null }[]
  newAliases: { chatterId: string; rawLabel: string; rawLabelNorm: string }[]
  links: { chatterId: string; mypulsUserId: string }[]
  issues: IdentityIssue[]
  /** Alertes techniques (markup MyPuls) : Sentry, pas d'anomalie en base. */
  technical: string[]
  /** Jour sans aucun id lu (bouton « Éditer » disparu ?) : identité résolue par libellé seulement. */
  noIds: boolean
}

const cents = (n: number): number => Math.round(n * 100)
const eur = (c: number): string => (c / 100).toFixed(2).replace('.', ',')

export function resolveDayIdentity(input: {
  day: string
  summary: SummaryLine[]
  sales: SaleLine[]
  directory: IdentityDirectoryEntry[]
  state: IdentityState
  norm: (s: string) => string
  newId: () => string
}): DayIdentity {
  const { day, summary, sales, state, norm, newId } = input
  const out: DayIdentity = {
    summaryChatter: [],
    summaryIds: [],
    saleChatter: [],
    newChatters: [],
    newAliases: [],
    links: [],
    issues: [],
    technical: [],
    noIds: false,
  }
  const issueKeys = new Set<string>()
  const issue = (i: IdentityIssue): void => {
    if (issueKeys.has(i.issueKey)) return
    issueKeys.add(i.issueKey)
    out.issues.push(i)
  }

  // ── Chemin historique : libellé → fiche (alias → nom → e-mail), sinon nouvelle fiche ───────
  const aliasToday = new Map<string, string>()
  const aliasOf = (n: string): string | undefined => aliasToday.get(n) ?? state.aliasOf(n)
  const byLabel = (raw: string): string | undefined => {
    const n = norm(raw)
    return aliasOf(n) ?? state.byName(raw) ?? state.byEmail(n)
  }
  const addAlias = (chatterId: string, raw: string): void => {
    const n = norm(raw)
    if (!n || aliasOf(n) !== undefined) return
    aliasToday.set(n, chatterId)
    out.newAliases.push({ chatterId, rawLabel: raw, rawLabelNorm: n })
  }
  const createdByLabel = new Map<string, string>()
  const byLabelOrCreate = (raw: string): string => {
    const known = byLabel(raw) ?? createdByLabel.get(raw)
    if (known) {
      addAlias(known, raw)
      return known
    }
    const id = newId()
    createdByLabel.set(raw, id)
    out.newChatters.push({ id, displayName: raw, mypulsUserId: null })
    addAlias(id, raw)
    issue({
      issueKey: `fiche:libelle:${norm(raw)}`,
      kind: 'fiche_creee',
      mypulsUserId: null,
      label: raw,
      chatterId: id,
      otherChatterId: null,
      day,
      amount: null,
      detail: `Fiche créée pour le libellé « ${raw} », sans id MyPuls : à vérifier.`,
    })
    return id
  }

  // ── Jour sans aucun id : repli intégral sur les libellés ─────────────────────────────────────
  const noIds =
    sales.length > 0 &&
    sales.every((s) => s.mypulsUserId === null) &&
    sales.some((s) => !UNDETERMINED_LABEL.test(s.label))
  out.noIds = noIds
  if (noIds) {
    out.technical.push(
      `${day} : aucun id MyPuls lu sur ${sales.length} vente(s) — bouton « Éditer » absent ou markup changé ; repli sur les libellés.`,
    )
  } else {
    const odd = [
      ...new Set(
        sales.filter((s) => s.mypulsUserId === null && s.label && !UNDETERMINED_LABEL.test(s.label)).map((s) => s.label),
      ),
    ]
    if (odd.length) out.technical.push(`${day} : vente(s) sans id MyPuls hors « Indéterminé (…) » — ${odd.join(', ')}`)
  }

  // ── Annuaire du jour (page + ventes) et ventes par id, en centimes ───────────────────────────
  const idx = labelIndex(
    [
      ...input.directory,
      ...sales.flatMap((s) => (s.mypulsUserId ? [{ mypulsUserId: s.mypulsUserId, label: s.label }] : [])),
    ],
    norm,
  )
  const salesCents = new Map<string, number>()
  for (const s of sales) {
    if (s.mypulsUserId) salesCents.set(s.mypulsUserId, (salesCents.get(s.mypulsUserId) ?? 0) + cents(s.amount))
  }

  // ── Id de chaque ligne de résumé (annuaire), puis départage par le montant ───────────────────
  const summaryId: (string | null)[] = summary.map(() => null)
  const aside: boolean[] = summary.map(() => false)
  const asideIds = new Set<string>()
  if (!noIds) {
    const claimed = new Set<string>()
    const ambiguous: { i: number; ids: string[] }[] = []
    summary.forEach((l, i) => {
      if (!l.label) return
      const ids = idx.idsOf(l.label)
      if (ids.size === 1) {
        const id = [...ids][0]!
        summaryId[i] = id
        claimed.add(id)
      } else if (ids.size > 1) ambiguous.push({ i, ids: [...ids].sort() })
    })
    for (const a of ambiguous) {
      const l = summary[a.i]!
      const c = cents(l.ca)
      const fits = a.ids.filter((id) => !claimed.has(id) && (salesCents.get(id) ?? 0) === c)
      if (c > 0 && fits.length === 1) {
        summaryId[a.i] = fits[0]!
        claimed.add(fits[0]!)
        continue
      }
      aside[a.i] = true
      for (const id of a.ids) asideIds.add(id)
      issue({
        issueKey: `resume:${day}:${norm(l.label)}`,
        kind: 'resume_mis_de_cote',
        mypulsUserId: null,
        label: l.label,
        chatterId: null,
        otherChatterId: null,
        day,
        amount: l.ca,
        detail: `Le libellé « ${l.label} » désigne ${a.ids.length} comptes MyPuls (${a.ids.join(', ')}) et le montant ne les départage pas : ${eur(c)} € du résumé mis de côté.`,
      })
    }
  }
  out.summaryIds = summaryId

  // ── Fiche de chaque id du jour ───────────────────────────────────────────────────────────────
  const labelsById = new Map<string, { labels: string[]; summaryLabel: string | null }>()
  const seeLabel = (id: string, raw: string, fromSummary: boolean): void => {
    const e = labelsById.get(id) ?? { labels: [], summaryLabel: null }
    if (raw && !e.labels.includes(raw)) e.labels.push(raw)
    if (fromSummary && e.summaryLabel === null) e.summaryLabel = raw
    labelsById.set(id, e)
  }
  summary.forEach((l, i) => {
    const id = summaryId[i]
    if (id) seeLabel(id, l.label, true)
  })
  if (!noIds) for (const s of sales) if (s.mypulsUserId) seeLabel(s.mypulsUserId, s.label, false)

  const idToday = new Map<string, string>() // fiche → id posé ou créé aujourd'hui
  const idOfFiche = (f: string): string | null => idToday.get(f) ?? state.mypulsIdByChatter.get(f) ?? null
  const chatterOfId = new Map<string, string | null>() // null = résolution par libellé
  const doublon = (id: string, keep: string, other: string, raw: string): void => {
    const [a, b] = [keep, other].sort()
    issue({
      issueKey: `doublon:${id}:${a}:${b}`,
      kind: 'doublon',
      mypulsUserId: id,
      label: raw,
      chatterId: keep,
      otherChatterId: other,
      day,
      amount: null,
      detail: `L'id MyPuls ${id} est porté par une fiche, mais le libellé « ${raw} » désigne une autre fiche sans id : même compte coupé en deux, à fusionner.`,
    })
  }

  for (const [id, info] of labelsById) {
    const aliasFiches: { fiche: string; raw: string }[] = []
    for (const raw of info.labels) {
      const f = byLabel(raw)
      if (f && !aliasFiches.some((x) => x.fiche === f)) aliasFiches.push({ fiche: f, raw })
    }

    const owner = state.chatterByMypulsId.get(id)
    if (owner) {
      chatterOfId.set(id, owner)
      // Une fiche par alias QUI A SON PROPRE id est un homonyme, pas un doublon.
      for (const a of aliasFiches) if (a.fiche !== owner && idOfFiche(a.fiche) === null) doublon(id, owner, a.fiche, a.raw)
      for (const raw of info.labels) addAlias(owner, raw)
      continue
    }

    const free = aliasFiches.filter((a) => idOfFiche(a.fiche) === null)
    let pick: string | undefined
    if (free.length === 1) pick = free[0]!.fiche
    else if (free.length > 1) {
      const linked = free.filter((a) => state.linkedChatters.has(a.fiche))
      if (linked.length > 1) {
        chatterOfId.set(id, null)
        issue({
          issueKey: `membres:${id}`,
          kind: 'membres_multiples',
          mypulsUserId: id,
          label: linked[0]!.raw,
          chatterId: linked[0]!.fiche,
          otherChatterId: linked[1]!.fiche,
          day,
          amount: null,
          detail: `L'id MyPuls ${id} correspond à ${linked.length} fiches reliées chacune à un membre (${linked.map((a) => `« ${a.raw} »`).join(', ')}) : rien n'est posé, à trancher à la main.`,
        })
        continue
      }
      // La fiche payée d'abord (la paie lit `profiles.chatter_id`), sinon celle du résumé.
      const summaryFiche = info.summaryLabel ? byLabel(info.summaryLabel) : undefined
      pick = linked[0]?.fiche ?? free.find((a) => a.fiche === summaryFiche)?.fiche ?? free[0]!.fiche
      for (const a of free) if (a.fiche !== pick) doublon(id, pick, a.fiche, a.raw)
    }

    if (pick) {
      out.links.push({ chatterId: pick, mypulsUserId: id })
      idToday.set(pick, id)
      chatterOfId.set(id, pick)
      for (const raw of info.labels) addAlias(pick, raw)
      continue
    }

    const created = newId()
    const displayName = info.summaryLabel ?? info.labels[0] ?? id
    out.newChatters.push({ id: created, displayName, mypulsUserId: id })
    idToday.set(created, id)
    chatterOfId.set(id, created)
    for (const raw of info.labels) addAlias(created, raw)
    issue({
      issueKey: `fiche:${id}`,
      kind: 'fiche_creee',
      mypulsUserId: id,
      label: displayName,
      chatterId: created,
      otherChatterId: null,
      day,
      amount: null,
      detail: aliasFiches.length
        ? `Fiche créée pour l'id MyPuls ${id} (« ${displayName} ») : ce libellé désigne déjà la fiche d'un autre compte (homonyme).`
        : `Fiche créée pour l'id MyPuls ${id} (« ${displayName} »).`,
    })
  }

  // ── Fiche de chaque ligne ────────────────────────────────────────────────────────────────────
  summary.forEach((l, i) => {
    if (aside[i] || !l.label) {
      out.summaryChatter.push(null)
      return
    }
    const id = summaryId[i]
    out.summaryChatter.push((id ? chatterOfId.get(id) : undefined) ?? byLabelOrCreate(l.label))
  })
  for (const s of sales) {
    const viaId = s.mypulsUserId && !noIds ? chatterOfId.get(s.mypulsUserId) : undefined
    out.saleChatter.push(viaId ?? (s.label ? byLabelOrCreate(s.label) : null))
  }

  // ── Invariant : CA du résumé = Σ ventes du même id, au centime ───────────────────────────────
  if (!noIds) {
    const summaryCents = new Map<string, number>()
    summary.forEach((l, i) => {
      const id = summaryId[i]
      if (id) summaryCents.set(id, (summaryCents.get(id) ?? 0) + cents(l.ca))
    })
    for (const id of new Set([...summaryCents.keys(), ...salesCents.keys()])) {
      if (asideIds.has(id)) continue
      const a = summaryCents.get(id) ?? 0
      const b = salesCents.get(id) ?? 0
      if (a === b) continue
      const raw = labelsById.get(id)?.labels[0] ?? null
      issue({
        issueKey: `ecart:${day}:${id}`,
        kind: 'ecart_invariant',
        mypulsUserId: id,
        label: raw,
        chatterId: chatterOfId.get(id) ?? null,
        otherChatterId: null,
        day,
        amount: (b - a) / 100,
        detail: `Id MyPuls ${id}${raw ? ` (« ${raw} »)` : ''} : ${eur(a)} € au résumé, ${eur(b)} € de ventes ce jour-là.`,
      })
    }
  }

  return out
}
```

- [ ] **Step 5 : exports**

`packages/core/src/index.ts`, après les exports de la Task 3 :

```ts
export { resolveDayIdentity } from './ingest/chatter-identity'
export type { DayIdentity, IdentityState, SaleLine, SummaryLine } from './ingest/chatter-identity'
```

- [ ] **Step 6 : vérifier**

Run : `pnpm --filter @glagency/core exec vitest run src/ingest/chatter-identity.test.ts && pnpm --filter @glagency/core typecheck`
Expected : PASS (16 tests), aucune erreur.

- [ ] **Step 7 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- packages/core/src/ingest/chatter-identity.ts packages/core/src/ingest/chatter-identity.test.ts packages/core/src/ingest/identity.fixtures.ts packages/core/src/index.ts
git commit -m "feat(identite): résolution d'une journée par id MyPuls (règle pure)"
```

---

### Task 8 : `@glagency/core` — contrôles du jour (`dayChecks`, `expectedDayTotals`)

**Files :**
- Create : `packages/core/src/ingest/day-checks.ts`
- Test : `packages/core/src/ingest/day-checks.test.ts`
- Modify : `packages/core/src/index.ts`

**Interfaces :**
- Consumes : `resolveDayIdentity`, `DayIdentity`, `SaleLine`, `SummaryLine` (Task 7).
- Produces :
  - `type DayCheck = { code: string; ok: boolean; detail: string }`
  - `type ExpectedTotals = { summary_cents: number; sales_cents: number; sales_count: number; page_net_cents: number | null; page_sales_count: number | null }`
  - `expectedDayTotals({ summary: { caPpv: number; caTips: number }[]; sales: { amount: number }[]; page: { salesCount: number | null; net: number | null } }): ExpectedTotals`
  - `dayChecks({ summary: SummaryLine[]; sales: SaleLine[]; identity: DayIdentity; mypulsIdOf: (chatterId: string) => string | null; expected: ExpectedTotals }): DayCheck[]`.
    Codes `a_resume_ventes`, `b_total_page`, `c_fiche_compte` ; `b_resume_ecrit` et
    `b_ventes_ecrites` sont ajoutés par la base.

- [ ] **Step 1 : tests qui échouent**

`packages/core/src/ingest/day-checks.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { resolveDayIdentity, type SaleLine, type SummaryLine } from './chatter-identity'
import { dayChecks, expectedDayTotals } from './day-checks'
import { norm, state, type F } from './identity.fixtures'

function check(o: {
  fiches: F[]
  summary: SummaryLine[]
  sales: SaleLine[]
  directory?: [string, string][]
  page?: { salesCount: number | null; net: number | null }
}) {
  let n = 0
  const st = state(o.fiches)
  const identity = resolveDayIdentity({
    day: '2026-09-06',
    summary: o.summary,
    sales: o.sales,
    directory: (o.directory ?? []).map(([mypulsUserId, label]) => ({ mypulsUserId, label })),
    state: st,
    norm,
    newId: () => `new-${++n}`,
  })
  const total = o.sales.reduce((s, t) => s + t.amount, 0)
  const expected = expectedDayTotals({
    summary: o.summary.map((l) => ({ caPpv: l.ca, caTips: 0 })),
    sales: o.sales,
    page: o.page ?? { salesCount: o.sales.length, net: total },
  })
  const checks = dayChecks({
    summary: o.summary,
    sales: o.sales,
    identity,
    mypulsIdOf: (id) => st.mypulsIdByChatter.get(id) ?? null,
    expected,
  })
  return Object.fromEntries(checks.map((c) => [c.code, c]))
}

const lionel = { id: 'A', name: 'Lionel', mypulsId: '1802' }

describe('expectedDayTotals', () => {
  it('additionne en centimes (0,10 + 0,20 = 30 centimes, pas 30,000000000000004)', () => {
    expect(
      expectedDayTotals({
        summary: [{ caPpv: 0.1, caTips: 0.2 }],
        sales: [{ amount: 0.1 }, { amount: 0.2 }],
        page: { salesCount: 2, net: 0.3 },
      }),
    ).toEqual({ summary_cents: 30, sales_cents: 30, sales_count: 2, page_net_cents: 30, page_sales_count: 2 })
  })
})

describe('dayChecks', () => {
  it('jour juste : a, b_total_page et c au vert', () => {
    const c = check({ fiches: [lionel], summary: [{ label: 'Lionel', ca: 12 }], sales: [{ label: 'Lionel', mypulsUserId: '1802', amount: 12 }] })
    expect([c.a_resume_ventes?.ok, c.b_total_page?.ok, c.c_fiche_compte?.ok]).toEqual([true, true, true])
  })

  it('a : résumé ≠ ventes d’un compte → échec, avec le compte en détail', () => {
    const c = check({ fiches: [lionel], summary: [{ label: 'Lionel', ca: 10 }], sales: [{ label: 'Lionel', mypulsUserId: '1802', amount: 12.5 }] })
    expect(c.a_resume_ventes?.ok).toBe(false)
    expect(c.a_resume_ventes?.detail).toContain('1802')
  })

  it('b_total_page : total de page introuvable → échec ; total différent → échec', () => {
    const base = { fiches: [lionel], summary: [{ label: 'Lionel', ca: 12 }], sales: [{ label: 'Lionel', mypulsUserId: '1802', amount: 12 }] }
    expect(check({ ...base, page: { salesCount: null, net: null } }).b_total_page?.ok).toBe(false)
    expect(check({ ...base, page: { salesCount: 1, net: 13 } }).b_total_page?.ok).toBe(false)
    expect(check({ ...base, page: { salesCount: 2, net: 12 } }).b_total_page?.ok).toBe(false)
  })

  it('c : deux fiches reliées pour un même id → lignes vers des fiches sans id, id sur deux fiches', () => {
    const c = check({
      fiches: [
        { id: 'L1', name: 'Jordan', linked: true },
        { id: 'L2', name: 'Jordan manager', linked: true },
      ],
      summary: [{ label: 'JORDAN', ca: 5 }],
      sales: [{ label: 'Jordan manager', mypulsUserId: '296', amount: 5 }],
      directory: [['296', 'JORDAN']],
    })
    expect(c.c_fiche_compte?.ok).toBe(false)
    expect(c.c_fiche_compte?.detail).toContain('sans id')
    expect(c.c_fiche_compte?.detail).toContain('plusieurs fiches')
  })

  it('jour sans aucun id : a et c en échec (rien n’est vérifiable)', () => {
    const c = check({ fiches: [lionel], summary: [{ label: 'Lionel', ca: 12 }], sales: [{ label: 'Lionel', mypulsUserId: null, amount: 12 }] })
    expect([c.a_resume_ventes?.ok, c.c_fiche_compte?.ok]).toEqual([false, false])
  })
})
```

Run : `pnpm --filter @glagency/core exec vitest run src/ingest/day-checks.test.ts`
Expected : FAIL, module introuvable.

- [ ] **Step 2 : implémenter `day-checks.ts`**

```ts
import type { DayIdentity, SaleLine, SummaryLine } from './chatter-identity'

/**
 * Contrôles de fiabilité d'UNE journée (spec § 3, D5). Côté code : a (résumé = ventes par compte),
 * b_total_page (lignes lues = totaux affichés par la page MyPuls) et c (une fiche = un compte).
 * b_resume_ecrit / b_ventes_ecrites sont calculés EN BASE par `finish_chatter_day` (0183), à
 * partir de `expected` : on y prouve l'état réel des tables, pas ce que le code croit avoir écrit.
 */

// `type` et non `interface` : ces objets partent tels quels vers la RPC `finish_chatter_day`, typée
// `Json` par supabase-js, qui n'accepte que des types objets littéraux.
export type DayCheck = {
  code: string
  ok: boolean
  detail: string
}

/** Ce que la base doit contenir pour le jour, en centimes, et les totaux de la page MyPuls. */
export type ExpectedTotals = {
  summary_cents: number
  sales_cents: number
  sales_count: number
  page_net_cents: number | null
  page_sales_count: number | null
}

const cents = (n: number): number => Math.round(n * 100)
const eur = (c: number): string => (c / 100).toFixed(2).replace('.', ',')

export function expectedDayTotals(input: {
  summary: { caPpv: number; caTips: number }[]
  sales: { amount: number }[]
  page: { salesCount: number | null; net: number | null }
}): ExpectedTotals {
  return {
    // chatter_daily.ca = PPV + tips (CHECK de la table) : on attend la même somme, ligne par ligne.
    summary_cents: input.summary.reduce((s, c) => s + cents(c.caPpv) + cents(c.caTips), 0),
    sales_cents: input.sales.reduce((s, t) => s + cents(t.amount), 0),
    sales_count: input.sales.length,
    page_net_cents: input.page.net === null ? null : cents(input.page.net),
    page_sales_count: input.page.salesCount,
  }
}

export function dayChecks(input: {
  summary: SummaryLine[]
  sales: SaleLine[]
  identity: DayIdentity
  /** Id MyPuls porté par une fiche AVANT la journée (état chargé en tête de run). */
  mypulsIdOf: (chatterId: string) => string | null
  expected: ExpectedTotals
}): DayCheck[] {
  const { identity: idn, expected: e } = input
  const checks: DayCheck[] = []

  // a — résumé = ventes, par compte
  const ecarts = idn.issues.filter((i) => i.kind === 'ecart_invariant')
  checks.push(
    idn.noIds
      ? { code: 'a_resume_ventes', ok: false, detail: 'Aucun id MyPuls lu : contrôle par compte impossible.' }
      : ecarts.length
        ? {
            code: 'a_resume_ventes',
            ok: false,
            detail: `${ecarts.length} compte(s) dont le résumé ne tombe pas sur les ventes : ${ecarts.slice(0, 5).map((i) => i.detail).join(' · ')}`,
          }
        : { code: 'a_resume_ventes', ok: true, detail: 'Résumé = ventes, au centime, pour chaque compte.' },
  )

  // b3 — totaux affichés par la page MyPuls (indépendants des lignes) = lignes lues
  if (e.page_net_cents === null || e.page_sales_count === null) {
    checks.push({
      code: 'b_total_page',
      ok: false,
      detail: 'Totaux de la page MyPuls introuvables (cartes « Ventes » / « Montant net ») : markup changé ?',
    })
  } else {
    checks.push({
      code: 'b_total_page',
      ok: e.page_net_cents === e.sales_cents && e.page_sales_count === e.sales_count,
      detail: `Ventes lues : ${eur(e.sales_cents)} € (${e.sales_count}) — page MyPuls : ${eur(e.page_net_cents)} € (${e.page_sales_count}).`,
    })
  }

  // c — une fiche = un compte
  if (idn.noIds) {
    checks.push({ code: 'c_fiche_compte', ok: false, detail: 'Aucun id MyPuls lu : identité non vérifiable ce jour-là.' })
    return checks
  }
  const idAfter = new Map<string, string | null>()
  for (const c of idn.newChatters) idAfter.set(c.id, c.mypulsUserId)
  for (const l of idn.links) idAfter.set(l.chatterId, l.mypulsUserId)
  const idOf = (f: string): string | null => (idAfter.has(f) ? (idAfter.get(f) ?? null) : input.mypulsIdOf(f))
  const autreId = new Set<string>()
  const sansId = new Set<string>()
  const fichesOfId = new Map<string, Set<string>>()
  const see = (id: string, fiche: string | null | undefined, label: string): void => {
    if (!fiche) return
    const s = fichesOfId.get(id) ?? new Set<string>()
    s.add(fiche)
    fichesOfId.set(id, s)
    const has = idOf(fiche)
    if (has === null) sansId.add(`« ${label} » (${id})`)
    else if (has !== id) autreId.add(`« ${label} » (${id} → fiche de ${has})`)
  }
  input.sales.forEach((s, i) => {
    if (s.mypulsUserId) see(s.mypulsUserId, idn.saleChatter[i], s.label)
  })
  idn.summaryIds.forEach((id, i) => {
    if (id) see(id, idn.summaryChatter[i], input.summary[i]?.label ?? '')
  })
  const multi = [...fichesOfId].filter(([, s]) => s.size > 1).map(([id, s]) => `${id} (${s.size} fiches)`)
  const parts = [
    autreId.size ? `vers la fiche d'un autre id : ${[...autreId].slice(0, 5).join(', ')}` : '',
    sansId.size ? `vers une fiche sans id : ${[...sansId].slice(0, 5).join(', ')}` : '',
    multi.length ? `id sur plusieurs fiches : ${multi.slice(0, 5).join(', ')}` : '',
  ].filter(Boolean)
  checks.push({
    code: 'c_fiche_compte',
    ok: parts.length === 0,
    detail: parts.length ? parts.join(' · ') : 'Chaque compte MyPuls du jour tombe sur une seule fiche, qui porte son id.',
  })
  return checks
}
```

- [ ] **Step 3 : exports**

`packages/core/src/index.ts`, après les exports de la Task 7 :

```ts
export { dayChecks, expectedDayTotals } from './ingest/day-checks'
export type { DayCheck, ExpectedTotals } from './ingest/day-checks'
```

- [ ] **Step 4 : vérifier**

Run : `pnpm --filter @glagency/core exec vitest run src/ingest/day-checks.test.ts && pnpm --filter @glagency/core typecheck`
Expected : PASS, aucune erreur.

- [ ] **Step 5 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- packages/core/src/ingest/day-checks.ts packages/core/src/ingest/day-checks.test.ts packages/core/src/index.ts
git commit -m "feat(fiabilite): contrôles du jour — résumé = ventes, total de page, une fiche = un compte"
```

---

### Task 9 : `summarizeRun` — un jour « à vérifier » dégrade le run

**Files :**
- Modify : `packages/core/src/ingest/run-summary.ts:10-17`, `:61-62`
- Test : `packages/core/src/ingest/run-summary.test.ts`

**Interfaces :**
- Produces : `IngestDayResult.reliabilityAlerts?: number`.

- [ ] **Step 1 : tests qui échouent**

Dans `run-summary.test.ts`, avant le dernier `})` du `describe` :

```ts
  it('contrôle de fiabilité en échec → degraded, même en rejeu explicite, renvoi vers Membres', () => {
    const s = summarizeRun({ ...base, catchup: false, days: [day({ reliabilityAlerts: 2 })] })
    expect(s.status).toBe('degraded')
    expect(s.warnings.some((w) => w.includes('Fiches MyPuls'))).toBe(true)
  })

  it('aucun contrôle en échec → pas de dégradation de ce fait', () => {
    expect(summarizeRun({ ...base, days: [day({ reliabilityAlerts: 0 })] }).status).toBe('ok')
  })
```

Run : `pnpm --filter @glagency/core exec vitest run src/ingest/run-summary.test.ts`
Expected : FAIL.

- [ ] **Step 2 : implémenter**

Dans `IngestDayResult`, après `error?: string` :

```ts
  /**
   * Contrôles de fiabilité en échec ce jour-là (+ alertes techniques du parsing) : le jour est
   * « à vérifier » dans `ingest_day_checks` (0183), lu dans Membres › Fiches MyPuls.
   */
  reliabilityAlerts?: number
```

Dans `summarizeRun`, juste avant le `return` :

```ts
  // Fiabilité : un jour « à vérifier » se voit dans Membres › Fiches MyPuls — le run dégradé
  // envoie AUSSI l'alerte Sentry (filet secondaire, spec § 3). Vaut aussi en rejeu explicite.
  const reliabilityAlerts = input.days.reduce((s, d) => s + (d.reliabilityAlerts ?? 0), 0)
  if (reliabilityAlerts > 0) {
    degraded = true
    warnings.push(`${reliabilityAlerts} contrôle(s) de fiabilité en échec — jour(s) à vérifier, détail dans Membres › Fiches MyPuls`)
  }
```

- [ ] **Step 3 : vérifier**

Run : `pnpm --filter @glagency/core test`
Expected : PASS.

- [ ] **Step 4 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- packages/core/src/ingest/run-summary.ts packages/core/src/ingest/run-summary.test.ts
git commit -m "feat(fiabilite): un jour à vérifier dégrade le run (Sentry)"
```

---

### Task 10 : brancher résolution et contrôles dans `ingestChatterDay`

**Files :**
- Modify : `apps/ingestion/src/pipeline.ts` :
  - `:11` (import) ;
  - `:44-45` ;
  - `:136-284` (`ingestChatterDay`) ;
  - `:391-416` (chargement) ;
  - `:482-500` (appel).

**Interfaces :**
- Consumes :
  - `resolveDayIdentity`, `dayChecks`, `expectedDayTotals`, `identityIssueRow` (`@glagency/core`) ;
  - `MoneyTeamDay.directory`, `.pageTotals` (PR 1) ;
  - RPC `finish_chatter_day` (0183) ;
  - `IngestDayResult.reliabilityAlerts` (Task 9).

- [ ] **Step 1 : imports et commentaire**

Ligne 11, remplacer l'import de `@glagency/core` par :

```ts
import {
  dayChecks,
  expectedDayTotals,
  identityIssueRow,
  resolveDayIdentity,
  summarizeRun,
  type IngestDayResult,
  type IngestRunSummary,
} from '@glagency/core'
```

Lignes 44-45 :

```ts
 * Attribution par chatteur : depuis le dashboard money-team (session web). Chaque vente y porte
 * l'id MyPuls de son compte (bouton « Éditer ») → fiche résolue PAR ID, puis trois contrôles de
 * fiabilité par jour (spec 2026-10-01-identite-chatteur-mypuls). Cf. ingestChatterDay.
```

- [ ] **Step 2 : remplacer `ingestChatterDay` (`:136-284`)**

Remplacer le bloc qui va du commentaire `/** Attribution par chatteur d'un jour…` jusqu'à la
fermeture de la fonction par :

```ts
/** État d'identité d'un run : lu une fois en tête, mis à jour après chaque jour écrit. */
interface IdentityCtx {
  nameToChatter: Map<string, string>
  aliasToChatter: Map<string, string>
  emailToChatter: Map<string, string>
  chatterByMypulsId: Map<string, string>
  mypulsIdByChatter: Map<string, string | null>
  linkedChatters: Set<string>
}

/** Retour de `finish_chatter_day` (0183) — `Returns: Json`, contrat local documenté. */
interface FinishDay {
  status: 'ok' | 'a_verifier'
  checks: { code: string; ok: boolean; detail: string }[]
  refused: { chatter_id: string; mypuls_user_id: string }[]
}

/**
 * Attribution par chatteur d'un jour, depuis le dashboard money-team (session web) :
 * résumé → chatter_daily, ventes → chatter_creator_daily. Fiche de chaque ligne : l'id MyPuls
 * d'abord (`resolveDayIdentity`). Puis UN appel `finish_chatter_day` : ids, anomalies et les
 * trois contrôles de fiabilité du jour, persistés (spec § 2-3).
 */
async function ingestChatterDay(
  db: Db,
  day: string,
  cookie: string,
  ctx: IdentityCtx,
  nameToId: Map<string, string>,
  pseudoToName: (p: string) => string | null,
  fetchMoneyTeam: FetchMoneyTeam,
): Promise<{
  chatterRows: number
  pairRows: number
  newChatterNames: string[]
  droppedTx: string[]
  reliabilityAlerts: string[]
}> {
  const mt = await fetchMoneyTeam(day, cookie)

  // Un SEUL chemin de fabrication du libellé (décodage entités + trim) : la résolution utilise
  // la même clé que l'enregistrement — sinon un libellé à entité HTML se perd.
  const labelOf = (s: string) => decodeEntities(s).trim()
  const summary = mt.chatters.map((c) => ({ label: labelOf(c.name), ca: c.ca }))
  const sales = mt.transactions.map((t) => ({ label: labelOf(t.chatter), mypulsUserId: t.mypulsUserId, amount: t.amount }))
  const state = {
    chatterByMypulsId: ctx.chatterByMypulsId,
    mypulsIdByChatter: ctx.mypulsIdByChatter,
    aliasOf: (n: string) => ctx.aliasToChatter.get(n),
    byName: (raw: string) => ctx.nameToChatter.get(raw),
    byEmail: (n: string) => ctx.emailToChatter.get(n),
    linkedChatters: ctx.linkedChatters,
  }
  const idn = resolveDayIdentity({
    day,
    summary,
    sales,
    directory: mt.directory.map((d) => ({ mypulsUserId: d.mypulsUserId, label: labelOf(d.label) })),
    state,
    norm: normLabel,
    newId: randomUUID,
  })
  // Contrôles calculés AVANT la mise à jour de l'état : `mypulsIdOf` doit lire l'état d'avant le jour.
  const expected = expectedDayTotals({
    summary: mt.chatters,
    sales: mt.transactions,
    page: {
      salesCount: mt.pageTotals.salesCount,
      net: mt.pageTotals.net.length ? mt.pageTotals.net.reduce((s, n) => s + n.amount, 0) : null,
    },
  })
  const checks = dayChecks({
    summary,
    sales,
    identity: idn,
    mypulsIdOf: (id) => ctx.mypulsIdByChatter.get(id) ?? null,
    expected,
  })

  if (idn.newChatters.length) {
    const { error } = await db.from('chatters').insert(
      idn.newChatters.map((c) => ({
        id: c.id,
        display_name: c.displayName,
        mypuls_user_id: c.mypulsUserId,
        active: true,
        access_revoked: false,
      })),
    )
    if (error) throw error
  }
  if (idn.newAliases.length) {
    const { error } = await db.from('chatter_alias').upsert(
      idn.newAliases.map((a) => ({
        chatter_id: a.chatterId,
        raw_label: a.rawLabel,
        raw_label_norm: a.rawLabelNorm,
        source: 'scrape',
      })),
      { onConflict: 'raw_label' },
    )
    if (error) throw error
  }

  // chatter_daily — agrégé par chatter_id (deux lignes résumé peuvent viser le même chatteur).
  // ca = ppv + tips → respecte le CHECK.
  const cdAgg = new Map<
    string,
    { ppv: number; tips: number; propose: number; vendu: number; react: number[] }
  >()
  mt.chatters.forEach((c, i) => {
    const cid = idn.summaryChatter[i]
    if (!cid) return
    const a = cdAgg.get(cid) ?? { ppv: 0, tips: 0, propose: 0, vendu: 0, react: [] }
    a.ppv += c.caPpv
    a.tips += c.caTips
    a.propose += c.propose
    a.vendu += c.vendu
    if (c.reactiviteSec != null) a.react.push(c.reactiviteSec)
    cdAgg.set(cid, a)
  })
  const cdRows = [...cdAgg.entries()].map(([chatter_id, a]) => {
    const ppv = round(a.ppv)
    const tips = round(a.tips)
    return {
      chatter_id,
      date: day,
      ca: round(ppv + tips),
      ca_ppv: ppv,
      ca_tips: tips,
      propose: a.propose,
      vendu: a.vendu,
      // `null` et NON 0 : le tableau MyPuls a perdu sa colonne « Présence » le 2026-09-03 (0149).
      presence_active_h: null,
      presence_idle_h: null,
      reactivite_sec: a.react.length
        ? Math.round(a.react.reduce((s, x) => s + x, 0) / a.react.length)
        : null,
    }
  })
  // Remplacement par jour, gardé par length → un scrape vide ne vide rien (et b1 le signale).
  if (cdRows.length) {
    const del = await db.from('chatter_daily').delete().eq('date', day)
    if (del.error) throw del.error
    const { error } = await db.from('chatter_daily').insert(cdRows)
    if (error) throw error
  }

  // chatter_creator_daily : agrège les transactions par (chatteur, modèle).
  const pair = new Map<
    string,
    { chatter_id: string; creator_id: string; ca: number; ppv: number; tips: number; vendu: number }
  >()
  const dropped = new Map<string, number>() // raison → montant écarté (b2 le fera échouer)
  mt.transactions.forEach((t, i) => {
    const cid = idn.saleChatter[i] ?? undefined
    const cname = pseudoToName(t.creator)
    const crid = cname ? nameToId.get(cname) : undefined
    if (!cid || !crid) {
      const reason = !cid ? `chatteur non résolu « ${labelOf(t.chatter) || '(vide)'} »` : `modèle inconnu « ${t.creator} »`
      dropped.set(reason, (dropped.get(reason) ?? 0) + t.amount)
      return
    }
    const key = `${cid}|${crid}`
    const p = pair.get(key) ?? { chatter_id: cid, creator_id: crid, ca: 0, ppv: 0, tips: 0, vendu: 0 }
    p.ca += t.amount
    if (t.type === 'Média privé') {
      p.ppv += t.amount
      p.vendu += 1
    } else if (t.type === 'Pourboires') p.tips += t.amount
    pair.set(key, p)
  })
  const ccdRows = [...pair.values()].map((p) => ({
    chatter_id: p.chatter_id,
    creator_id: p.creator_id,
    date: day,
    ca: round(p.ca),
    ca_ppv: round(p.ppv),
    ca_tips: round(p.tips),
    propose: 0,
    vendu: p.vendu,
  }))
  if (ccdRows.length) {
    const del = await db.from('chatter_creator_daily').delete().eq('date', day)
    if (del.error) throw del.error
    const { error } = await db.from('chatter_creator_daily').insert(ccdRows)
    if (error) throw error
  }

  // Fin de journée : ids + anomalies + contrôles b1/b2 EN BASE + verdict persisté. UN appel.
  const { data, error } = await db.rpc('finish_chatter_day', {
    p_day: day,
    p_links: idn.links.map((l) => ({ chatter_id: l.chatterId, mypuls_user_id: l.mypulsUserId })),
    p_issues: idn.issues.map((i) => identityIssueRow(i, 'ingestion')),
    p_expected: expected,
    p_checks: checks,
  })
  if (error) throw error
  const fin = (data as FinishDay | null) ?? { status: 'a_verifier', checks: [], refused: [] }

  // L'état du run suit ce qui vient d'être écrit : les jours suivants s'y fient.
  for (const c of idn.newChatters) {
    ctx.nameToChatter.set(c.displayName, c.id)
    ctx.mypulsIdByChatter.set(c.id, c.mypulsUserId)
    if (c.mypulsUserId) ctx.chatterByMypulsId.set(c.mypulsUserId, c.id)
  }
  for (const a of idn.newAliases) ctx.aliasToChatter.set(a.rawLabelNorm, a.chatterId)
  const refusedKeys = new Set(fin.refused.map((r) => `${r.chatter_id}|${r.mypuls_user_id}`))
  for (const l of idn.links) {
    if (refusedKeys.has(`${l.chatterId}|${l.mypulsUserId}`)) continue
    ctx.chatterByMypulsId.set(l.mypulsUserId, l.chatterId)
    ctx.mypulsIdByChatter.set(l.chatterId, l.mypulsUserId)
  }

  console.log(
    `[ingestion] ${day}: money-team → ${cdRows.length} chatteurs, ${ccdRows.length} paires — fiabilité ${fin.status}`,
  )
  return {
    chatterRows: cdRows.length,
    pairRows: ccdRows.length,
    newChatterNames: idn.newChatters.map((c) => c.displayName),
    droppedTx: [...dropped.entries()].map(([reason, amount]) => `${reason} : ${amount.toFixed(2)} €`),
    reliabilityAlerts: [
      ...idn.technical,
      ...fin.checks.filter((c) => !c.ok).map((c) => `${day} : contrôle ${c.code} en échec — ${c.detail}`),
    ],
  }
}
```

Si `tsc` refuse `p_links`, `p_issues`, `p_expected` ou `p_checks` (affectation à `Json`),
importer `import type { Json } from '@glagency/db'` et caster chacun `as unknown as Json`.

- [ ] **Step 3 : charger l'état d'identité (`:391-416`)**

Remplacer le bloc qui va de `// Ces deux selects sont le SOCLE…` jusqu'à
`for (const a of aliasRows ?? []) aliasToChatter.set(...)` inclus par :

```ts
  // Ces selects sont le SOCLE de la résolution d'identité : un échec silencieux donnerait des
  // maps vides → duplication massive + re-pointage des alias. On THROW. fetchAll : un select nu
  // tronqué à 1000 lignes donnerait des maps INCOMPLÈTES (pas vides).
  const { data: chatterRows, error: chattersErr } = await fetchAll((f, t) =>
    db.from('chatters').select('id, display_name, email, mypuls_user_id').order('id').range(f, t),
  )
  if (chattersErr) throw chattersErr
  const nameToChatter = new Map<string, string>()
  const emailToChatter = new Map<string, string>()
  const chatterByMypulsId = new Map<string, string>()
  const mypulsIdByChatter = new Map<string, string | null>()
  for (const c of chatterRows ?? []) {
    if (c.display_name) nameToChatter.set(c.display_name.trim(), c.id)
    // Les pages money-team étiquettent parfois par EMAIL (constaté sur juin) : repli
    // de rapprochement label → email connu, à la même normalisation que les alias.
    if (c.email) emailToChatter.set(normLabel(c.email), c.id)
    mypulsIdByChatter.set(c.id, c.mypuls_user_id ?? null)
    if (c.mypuls_user_id) chatterByMypulsId.set(String(c.mypuls_user_id), c.id)
  }
  // fetchAll : chatter_alias grossit à chaque nouveau libellé scrapé, aucune borne native.
  const { data: aliasRows, error: aliasErr } = await fetchAll((f, t) =>
    db.from('chatter_alias').select('chatter_id, raw_label_norm').order('id').range(f, t),
  )
  if (aliasErr) throw aliasErr
  const aliasToChatter = new Map<string, string>()
  // Re-normalise les norms STOCKÉS : la clé du map suit toujours la normalisation courante.
  for (const a of aliasRows ?? []) aliasToChatter.set(normLabel(a.raw_label_norm), a.chatter_id)
  // Fiches reliées à un membre : celles que la paie lit. Entre deux fiches candidates pour un même
  // id, c'est elle qui le reçoit (spec § 2). +1 sous-requête par run.
  const { data: linkedRows, error: linkedErr } = await fetchAll((f, t) =>
    db.from('profiles').select('chatter_id').not('chatter_id', 'is', null).order('chatter_id').range(f, t),
  )
  if (linkedErr) throw linkedErr
  const identity: IdentityCtx = {
    nameToChatter,
    aliasToChatter,
    emailToChatter,
    chatterByMypulsId,
    mypulsIdByChatter,
    linkedChatters: new Set((linkedRows ?? []).map((p) => p.chatter_id as string)),
  }
```

- [ ] **Step 4 : l'appel (`:482-500`)**

Remplacer le bloc `if (cookie) { … }` de la boucle des jours par :

```ts
      if (cookie) {
        const chatter = await ingestChatterDay(
          db, day, cookie, identity, nameToId, pseudoToName, fetchMoneyTeam,
        )
        result.chatterRows = chatter.chatterRows
        result.pairRows = chatter.pairRows
        result.reliabilityAlerts = chatter.reliabilityAlerts.length
        if (chatter.newChatterNames.length) {
          warnings.push(`${day} : nouveau(x) chatteur(s) créé(s) — ${chatter.newChatterNames.join(', ')}`)
        }
        if (chatter.droppedTx.length) {
          warnings.push(`${day} : transactions NON ventilées — ${chatter.droppedTx.join(' · ')}`)
        }
        warnings.push(...chatter.reliabilityAlerts)
      }
```

- [ ] **Step 5 : vérifier**

Run : `pnpm --filter @glagency/ingestion typecheck && pnpm --filter @glagency/core test`
Expected : aucune erreur, tests verts.

Contrôle du budget à la lecture : un `fetchAll` de plus par run (`profiles`), et un seul `rpc`
par jour (`finish_chatter_day`), toujours.

- [ ] **Step 6 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- apps/ingestion/src/pipeline.ts
git commit -m "feat(fiabilite): le pipeline résout par id MyPuls et contrôle chaque jour ingéré"
```

---

### Task 11 : relevé des shifts — ne plus rattacher un homonyme

**Files :**
- Modify : `apps/ingestion/src/shifts-core.ts:31-36`, `:157-160`

- [ ] **Step 1 : la garde**

Dans `resolveIdentities`, remplacer :

```ts
    const chatterId = candidates[0] as string
    chatterByMypulsId.set(mypulsUserId, chatterId)
    // On ne réécrit jamais un lien existant : seul un chatteur SANS ID en reçoit un.
    if (noLink.has(chatterId)) toLink.push({ chatterId, mypulsUserId })
```

par :

```ts
    const chatterId = candidates[0] as string
    // Une fiche qui porte DÉJÀ un id MyPuls — ou qui vient d'en recevoir un dans ce run — est un
    // AUTRE compte au même nom : la rattacher mélangerait deux personnes (deux « Serge » MyPuls,
    // 9332 et 10504). Spec docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md § 2.
    if (!noLink.has(chatterId)) {
      unmatched.push({ mypulsUserId, label, raison: 'ambigu' })
      continue
    }
    noLink.delete(chatterId)
    chatterByMypulsId.set(mypulsUserId, chatterId)
    toLink.push({ chatterId, mypulsUserId })
```

Commentaire de `raison` dans `UnmatchedChatter` :

```ts
  /** `inconnu` = aucun chatteur du CRM ne porte ce nom ; `ambigu` = plusieurs, ou une fiche qui
   *  porte déjà l'id d'un autre compte MyPuls (homonyme). */
```

- [ ] **Step 2 : vérifier**

Run : `pnpm --filter @glagency/ingestion typecheck`
Expected : aucune erreur.

⛔ Sur accord de Benoit (écrit dans l'UAT) :

```bash
uat pnpm --filter @glagency/ingestion shifts "$(date -v-2d +%F)"
```

Expected : le run se termine ; les homonymes sortent en « non rapproché(s) — ambigu ».

- [ ] **Step 3 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- apps/ingestion/src/shifts-core.ts
git commit -m "fix(shifts): ne plus rattacher un id MyPuls à la fiche d'un homonyme"
```

---

### Task 12 : `@glagency/core` — comparaison de recette (`compareReplay`)

**Files :**
- Create : `packages/core/src/ingest/replay-diff.ts`
- Test : `packages/core/src/ingest/replay-diff.test.ts`
- Modify : `packages/core/src/index.ts`

**Interfaces :**
- Consumes : `IdentityIssueKind` (Task 3).
- Produces :
  - `interface ReplaySnapshot { day: string; cd: Record<string, number>; ccd: Record<string, number>; fiches: Record<string, { name: string; mypulsUserId: string | null }> }` (centimes par fiche)
  - `interface ReplayIssue { kind: IdentityIssueKind; mypulsUserId: string | null; chatterId: string | null; otherChatterId: string | null; day: string | null; label: string | null; amount: number | null }`
  - `interface ReplayMove { chatterId: string; name: string; mypulsUserId: string | null; dCd: number; dCcd: number; reason: string | null }`
  - `interface ReplayDayDiff { day: string; cdBefore: number; cdAfter: number; ccdBefore: number; ccdAfter: number; asideCents: number; totalsOk: boolean; moves: ReplayMove[]; ok: boolean }`
  - `compareReplay(before: ReplaySnapshot, after: ReplaySnapshot, issues: ReplayIssue[]): ReplayDayDiff`

- [ ] **Step 1 : tests qui échouent**

`packages/core/src/ingest/replay-diff.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { compareReplay, type ReplayIssue, type ReplaySnapshot } from './replay-diff'

const snap = (cd: Record<string, number>, ccd: Record<string, number>, fiches: ReplaySnapshot['fiches']): ReplaySnapshot => ({
  day: '2026-09-20',
  cd,
  ccd,
  fiches,
})
const fiches = {
  A: { name: 'Lionel', mypulsUserId: '1802' },
  B: { name: 'lioneldiv', mypulsUserId: null },
  X: { name: 'Autre', mypulsUserId: '5' },
}
const doublonAB: ReplayIssue = { kind: 'doublon', mypulsUserId: '1802', chatterId: 'A', otherChatterId: 'B', day: null, label: 'lioneldiv', amount: null }

describe('compareReplay — recette avant/après, jour par jour et fiche par fiche', () => {
  it('rien ne change → ok, aucun mouvement', () => {
    const s = snap({ A: 100 }, { A: 100 }, fiches)
    expect(compareReplay(s, s, [])).toMatchObject({ totalsOk: true, moves: [], ok: true })
  })

  it('doublon résolu : les ventes passent de B à A, totaux égaux → expliqué', () => {
    const d = compareReplay(snap({ A: 100 }, { B: 100 }, fiches), snap({ A: 100 }, { A: 100 }, fiches), [doublonAB])
    expect(d.ok).toBe(true)
    expect(d.moves.map((m) => [m.chatterId, m.dCcd, m.reason])).toEqual([
      ['A', 100, 'doublon résolu (id 1802)'],
      ['B', -100, 'doublon résolu (id 1802)'],
    ])
  })

  it('montant déplacé sans anomalie qui l’explique → INEXPLIQUÉ, jour refusé', () => {
    const d = compareReplay(snap({}, { X: 100 }, fiches), snap({}, { A: 100 }, fiches), [])
    expect(d.ok).toBe(false)
    expect(d.moves.every((m) => m.reason === null)).toBe(true)
  })

  it('total qui change → refusé ; sauf le montant d’un résumé mis de côté', () => {
    expect(compareReplay(snap({ A: 100 }, {}, fiches), snap({ A: 90 }, {}, fiches), []).totalsOk).toBe(false)
    const aside: ReplayIssue = { kind: 'resume_mis_de_cote', mypulsUserId: null, chatterId: null, otherChatterId: null, day: '2026-09-20', label: 'Lionel', amount: 1 }
    const d = compareReplay(snap({ A: 100 }, {}, fiches), snap({ A: 0 }, {}, fiches), [{ ...aside, amount: 1 }])
    expect(d.totalsOk).toBe(true)
    expect(d.moves[0]?.reason).toBe('résumé mis de côté (libellé ambigu)')
  })

  it('fiche créée pour un id par le nouveau code → expliqué', () => {
    const after = { ...fiches, N: { name: 'Serge', mypulsUserId: '10504' } }
    const d = compareReplay(snap({}, { X: 70 }, fiches), snap({}, { X: 0, N: 70 }, after), [
      { kind: 'fiche_creee', mypulsUserId: '10504', chatterId: 'N', otherChatterId: null, day: '2026-09-20', label: 'Serge', amount: null },
    ])
    expect(d.moves.find((m) => m.chatterId === 'N')?.reason).toBe("fiche créée pour l'id 10504")
  })
})
```

Le cas « fiche créée » laisse X perdre 70 sans raison propre : il sort INEXPLIQUÉ. C'est voulu.
Un homonyme départagé doit se lire dans le rapport et être accepté par Benoit, pas passer en
silence.

Run : `pnpm --filter @glagency/core exec vitest run src/ingest/replay-diff.test.ts`
Expected : FAIL, module introuvable.

- [ ] **Step 2 : implémenter `replay-diff.ts`**

```ts
import type { IdentityIssueKind } from './identity-types'

/**
 * Recette de non-régression (spec § 8, D14) : un même jour rejoué avec l'ANCIEN puis le NOUVEAU
 * code, comparé jour par jour et fiche par fiche. Toute différence doit porter une raison tirée
 * des anomalies et des ids ; sinon `reason: null` = INEXPLIQUÉ, et pas de déploiement.
 */

/** Photo d'un jour : centimes par fiche (Σ chatter_daily, Σ chatter_creator_daily) + toutes les fiches. */
export interface ReplaySnapshot {
  day: string
  cd: Record<string, number>
  ccd: Record<string, number>
  fiches: Record<string, { name: string; mypulsUserId: string | null }>
}

export interface ReplayIssue {
  kind: IdentityIssueKind
  mypulsUserId: string | null
  chatterId: string | null
  otherChatterId: string | null
  day: string | null
  label: string | null
  amount: number | null
}

export interface ReplayMove {
  chatterId: string
  name: string
  mypulsUserId: string | null
  dCd: number
  dCcd: number
  reason: string | null
}

export interface ReplayDayDiff {
  day: string
  cdBefore: number
  cdAfter: number
  ccdBefore: number
  ccdAfter: number
  asideCents: number
  totalsOk: boolean
  moves: ReplayMove[]
  ok: boolean
}

const sum = (r: Record<string, number>): number => Object.values(r).reduce((s, v) => s + v, 0)

export function compareReplay(before: ReplaySnapshot, after: ReplaySnapshot, issues: ReplayIssue[]): ReplayDayDiff {
  const day = after.day
  const asideIssues = issues.filter((i) => i.kind === 'resume_mis_de_cote' && i.day === day)
  const asideCents = asideIssues.reduce((s, i) => s + Math.round((i.amount ?? 0) * 100), 0)
  const cdBefore = sum(before.cd)
  const cdAfter = sum(after.cd)
  const ccdBefore = sum(before.ccd)
  const ccdAfter = sum(after.ccd)
  // Le résumé mis de côté manque à chatter_daily après, à dessein ; les ventes, jamais.
  const totalsOk = cdAfter + asideCents === cdBefore && ccdAfter === ccdBefore

  const reasonFor = (id: string): string | null => {
    const pair = issues.find(
      (i) => (i.kind === 'doublon' || i.kind === 'membres_multiples') && (i.chatterId === id || i.otherChatterId === id),
    )
    if (pair) return pair.kind === 'doublon' ? `doublon résolu (id ${pair.mypulsUserId ?? '?'})` : 'deux membres reliés au même compte'
    const now = after.fiches[id]
    const was = before.fiches[id]
    if (!was && now?.mypulsUserId) return `fiche créée pour l'id ${now.mypulsUserId}`
    if (was && !was.mypulsUserId && now?.mypulsUserId) return `id ${now.mypulsUserId} posé`
    const name = now?.name ?? was?.name
    if (name && asideIssues.some((i) => i.label === name)) return 'résumé mis de côté (libellé ambigu)'
    return null
  }

  const ids = [...new Set([...Object.keys(before.cd), ...Object.keys(after.cd), ...Object.keys(before.ccd), ...Object.keys(after.ccd)])].sort()
  const moves: ReplayMove[] = []
  for (const id of ids) {
    const dCd = (after.cd[id] ?? 0) - (before.cd[id] ?? 0)
    const dCcd = (after.ccd[id] ?? 0) - (before.ccd[id] ?? 0)
    if (!dCd && !dCcd) continue
    const f = after.fiches[id] ?? before.fiches[id]
    moves.push({ chatterId: id, name: f?.name ?? id, mypulsUserId: f?.mypulsUserId ?? null, dCd, dCcd, reason: reasonFor(id) })
  }
  return {
    day,
    cdBefore,
    cdAfter,
    ccdBefore,
    ccdAfter,
    asideCents,
    totalsOk,
    moves,
    ok: totalsOk && moves.every((m) => m.reason !== null),
  }
}
```

- [ ] **Step 3 : exports**

`packages/core/src/index.ts`, après les exports de la Task 8 :

```ts
export { compareReplay } from './ingest/replay-diff'
export type { ReplayDayDiff, ReplayIssue, ReplayMove, ReplaySnapshot } from './ingest/replay-diff'
```

- [ ] **Step 4 : vérifier**

Run : `pnpm --filter @glagency/core exec vitest run src/ingest/replay-diff.test.ts && pnpm --filter @glagency/core typecheck`
Expected : PASS, aucune erreur.

- [ ] **Step 5 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- packages/core/src/ingest/replay-diff.ts packages/core/src/ingest/replay-diff.test.ts packages/core/src/index.ts
git commit -m "feat(fiabilite): comparaison de recette avant/après, fiche par fiche"
```

---

### Task 13 : CLI `recette-identite` — photos et rapport de diff

**Files :**
- Create : `apps/ingestion/src/recette-identite.ts`
- Modify : `apps/ingestion/package.json` (script)

**Interfaces :**
- Consumes : `compareReplay`, `ReplaySnapshot`, `ReplayIssue`, `ReplayDayDiff`
  (`@glagency/core`) ; `rows` (`ops-utils.ts`).
- Produces :
  - `pnpm --filter @glagency/ingestion recette-identite photo <jour> <dossier>` ;
  - `pnpm --filter @glagency/ingestion recette-identite compare <avant> <apres> <rapport.md>` ;
  - le code de sortie est 1 si un jour est refusé.

- [ ] **Step 1 : le script npm**

`apps/ingestion/package.json`, après `"identity-backfill"` (virgule à sa ligne) :

```json
    "recette-identite": "tsx src/recette-identite.ts"
```

- [ ] **Step 2 : la CLI**

`apps/ingestion/src/recette-identite.ts` :

```ts
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createAdminClient, fetchAll } from '@glagency/db'
import { compareReplay, type ReplayDayDiff, type ReplayIssue, type ReplaySnapshot } from '@glagency/core'
import { loadEnv } from './env'
import { rows } from './ops-utils'

// Recette de non-régression de l'identité chatteur — spec § 8 (D14), procédure : plan, Task 14.
//
// Usage :
//   tsx src/recette-identite.ts photo <AAAA-MM-JJ> <dossier>   photo du jour → <dossier>/<jour>.json
//   tsx src/recette-identite.ts compare <avant> <apres> <rapport.md>
//       compare chaque jour présent dans <apres> ; écrit le rapport ; sort en code 1 si un jour
//       est refusé (mouvement inexpliqué ou total qui change).
// Base visée = SUPABASE_URL / SUPABASE_SECRET_KEY (la recette tourne sur l'UAT : préfixer `uat`).

interface Photo {
  snapshot: ReplaySnapshot
  issues: ReplayIssue[]
  check: { status: string; checks: { code: string; ok: boolean; detail: string }[] } | null
}

const cents = (n: number | string | null | undefined) => Math.round(Number(n ?? 0) * 100)
const eur = (c: number) => (c / 100).toFixed(2).replace('.', ',')

async function photo(day: string, dir: string): Promise<void> {
  const db = createAdminClient()
  const [cd, ccd, chatters, issues, check] = await Promise.all([
    rows('chatter_daily', fetchAll((f, t) =>
      db.from('chatter_daily').select('chatter_id, ca').eq('date', day).order('chatter_id').range(f, t))),
    rows('chatter_creator_daily', fetchAll((f, t) =>
      db.from('chatter_creator_daily').select('chatter_id, creator_id, ca').eq('date', day)
        .order('chatter_id').order('creator_id').range(f, t))),
    rows('chatters', fetchAll((f, t) =>
      db.from('chatters').select('id, display_name, mypuls_user_id').order('id').range(f, t))),
    rows('chatter_identity_issues', fetchAll((f, t) =>
      db.from('chatter_identity_issues').select('id, kind, mypuls_user_id, chatter_id, other_chatter_id, day, label, amount')
        .is('resolved_at', null).order('id').range(f, t))),
    db.from('ingest_day_checks').select('status, checks').eq('day', day).maybeSingle(),
  ])
  if (check.error) throw new Error(`ingest_day_checks : ${check.error.message}`)
  const sumBy = (rs: { chatter_id: string; ca: number | string | null }[]) => {
    const out: Record<string, number> = {}
    for (const r of rs) out[r.chatter_id] = (out[r.chatter_id] ?? 0) + cents(r.ca)
    return out
  }
  const p: Photo = {
    snapshot: {
      day,
      cd: sumBy(cd),
      ccd: sumBy(ccd),
      fiches: Object.fromEntries(chatters.map((c) => [c.id, { name: c.display_name, mypulsUserId: c.mypuls_user_id ?? null }])),
    },
    issues: issues.map((i) => ({
      kind: i.kind as ReplayIssue['kind'],
      mypulsUserId: i.mypuls_user_id,
      chatterId: i.chatter_id,
      otherChatterId: i.other_chatter_id,
      day: i.day,
      label: i.label,
      amount: i.amount === null ? null : Number(i.amount),
    })),
    check: (check.data as Photo['check']) ?? null,
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, `${day}.json`), JSON.stringify(p))
  console.log(`[recette] photo ${day} → ${dir} (${Object.keys(p.snapshot.cd).length} fiches résumé, ${Object.keys(p.snapshot.ccd).length} fiches ventes)`)
}

function render(results: { diff: ReplayDayDiff; check: Photo['check'] }[]): string {
  const refused = results.filter((r) => !r.diff.ok)
  const toCheck = results.filter((r) => r.check?.status !== 'ok')
  const unexplained = results.flatMap((r) => r.diff.moves.filter((m) => m.reason === null))
  const lines = [
    '# Recette de non-régression — identité chatteur',
    '',
    `**Verdict : ${refused.length ? 'REFUSÉE' : 'ACCEPTABLE'}** — ${results.length} jour(s), ${refused.length} refusé(s), ${unexplained.length} mouvement(s) INEXPLIQUÉ(S), ${toCheck.length} jour(s) « à vérifier » ou non vérifié(s) par le nouveau code.`,
    '',
    'Règle (spec § 8) : aucun mouvement inexpliqué, aucun écart de total non expliqué ; chaque jour « à vérifier » listé avec sa cause et accepté par Benoit. Sinon, pas de déploiement.',
    '',
  ]
  for (const { diff: d, check } of results) {
    lines.push(`## ${d.day} — ${d.ok ? 'OK' : 'REFUSÉ'} · fiabilité : ${check?.status ?? 'non vérifié'}`)
    lines.push('')
    lines.push(`- chatter_daily : ${eur(d.cdBefore)} € avant → ${eur(d.cdAfter)} € après${d.asideCents ? ` (dont ${eur(d.asideCents)} € mis de côté)` : ''}`)
    lines.push(`- chatter_creator_daily : ${eur(d.ccdBefore)} € avant → ${eur(d.ccdAfter)} € après${d.totalsOk ? '' : ' — **ÉCART DE TOTAL**'}`)
    for (const c of check?.checks.filter((x) => !x.ok) ?? []) lines.push(`- contrôle **${c.code}** en échec : ${c.detail}`)
    if (d.moves.length) {
      lines.push('', '| Fiche | Id MyPuls | Δ résumé | Δ ventes | Raison |', '|---|---|---|---|---|')
      for (const m of d.moves) {
        lines.push(`| ${m.name} | ${m.mypulsUserId ?? '—'} | ${eur(m.dCd)} € | ${eur(m.dCcd)} € | ${m.reason ?? '**INEXPLIQUÉ**'} |`)
      }
    }
    lines.push('')
  }
  return lines.join('\n')
}

function compare(avant: string, apres: string, out: string): boolean {
  const days = readdirSync(apres).filter((f) => f.endsWith('.json')).sort()
  const results = days.map((f) => {
    const before = JSON.parse(readFileSync(resolve(avant, f), 'utf8')) as Photo
    const after = JSON.parse(readFileSync(resolve(apres, f), 'utf8')) as Photo
    return { diff: compareReplay(before.snapshot, after.snapshot, after.issues), check: after.check }
  })
  writeFileSync(out, render(results))
  const ok = results.every((r) => r.diff.ok)
  console.log(`[recette] ${results.length} jour(s) comparé(s) — ${ok ? 'aucun refus' : 'REFUS'} → ${out}`)
  return ok
}

async function main(): Promise<void> {
  const root = loadEnv()
  const [cmd, a, b, c] = process.argv.slice(2)
  if (cmd === 'photo' && a && b) return photo(a, resolve(root, b))
  if (cmd === 'compare' && a && b && c) {
    if (!compare(resolve(root, a), resolve(root, b), resolve(root, c))) process.exit(1)
    return
  }
  throw new Error('usage : recette-identite photo <jour> <dossier> | compare <avant> <apres> <rapport.md>')
}

const isCli = process.argv[1]?.endsWith('recette-identite.ts')
if (isCli) {
  main().catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
}
```

- [ ] **Step 3 : typecheck**

Run : `pnpm --filter @glagency/ingestion typecheck`
Expected : aucune erreur.

- [ ] **Step 4 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- apps/ingestion/src/recette-identite.ts apps/ingestion/package.json
git commit -m "feat(fiabilite): CLI recette-identite — photos avant/après et rapport de diff"
```

---

### Task 14 : recette sur 3 semaines réelles (UAT), docs PR 3, déploiement

**Files :**
- Modify : `ARCHITECTURE.md` (§ Relevé MyPuls), `docs/CARTE.md` (lignes `pnpm start` et
  `recette-identite`), `CHANGELOG.md`

**Livrable :** `apps/ingestion/raw/recette/rapport.md`, joint à la PR.

- [ ] **Step 1 : ⛔ accord de Benoit, puis préparer l'ancien code**

Demander : « Je lance la recette : je rejoue 3 semaines sur l'UAT, ancien code puis nouveau, jour
par jour (≈ 42 rejeux) ? » Sans « oui » explicite, s'arrêter là. `0183` doit être appliquée sur
l'UAT (Task 4).

```bash
git -C /Users/benoitgasnier/Documents/glagencyapp worktree add --detach ../glagencyapp-ref origin/develop
( cd ../glagencyapp-ref && ln -s ../glagencyapp/.env .env && pnpm install )
```

- [ ] **Step 2 : rejouer chaque jour, ancien puis nouveau code, avec une photo après chacun**

```bash
DU=$(date -v-23d +%F); AU=$(date -v-2d +%F)
d="$DU"
while [[ ! "$d" > "$AU" ]]; do
  ( cd ../glagencyapp-ref && uat pnpm --filter @glagency/ingestion start "$d" )      # ancien code
  uat pnpm --filter @glagency/ingestion recette-identite photo "$d" apps/ingestion/raw/recette/avant
  uat pnpm --filter @glagency/ingestion start "$d"                                    # nouveau code
  uat pnpm --filter @glagency/ingestion recette-identite photo "$d" apps/ingestion/raw/recette/apres
  d=$(date -j -v+1d -f %F "$d" +%F)
done
```

Expected : 22 jours, chacun avec `avant/<jour>.json` et `apres/<jour>.json`. Un rejeu en échec
arrête la boucle : le relancer à partir du jour fautif (`DU=<jour>`).

- [ ] **Step 3 : comparer et lire le rapport**

```bash
uat pnpm --filter @glagency/ingestion recette-identite compare apps/ingestion/raw/recette/avant apps/ingestion/raw/recette/apres apps/ingestion/raw/recette/rapport.md; echo "code=$?"
```

Expected : `rapport.md` écrit.

**Règle de déploiement :**
- **aucun** mouvement `INEXPLIQUÉ` ;
- **aucun** `ÉCART DE TOTAL` ;
- chaque jour dont la fiabilité n'est pas `ok` a sa cause listée (contrôle et détail) ;
- Benoit accepte le rapport par écrit.

Un mouvement inexpliqué est soit un bug (corriger, puis rejouer les jours concernés), soit un cas
légitime (un homonyme départagé, par exemple) que Benoit accepte nommément dans la PR.

Retirer le worktree de référence : `git -C /Users/benoitgasnier/Documents/glagencyapp worktree
remove ../glagencyapp-ref`. Pas de `--force` ; s'il refuse, le signaler.

- [ ] **Step 4 : docs**

`ARCHITECTURE.md`, § Relevé MyPuls : relire la phrase « **La clé d'identité est `chatters.id`** »
(le fichier bouge), puis ajouter juste après la phrase qui finit par « signalement. » :

```markdown
  Cette fiche se **résout par `chatters.mypuls_user_id`** sur les deux flux depuis le chantier
  identité (2026-10) : le relevé des shifts (CSV) et la money-team, dont chaque vente porte l'id
  du compte (bouton « Éditer »). **Chaque jour ingéré est contrôlé** — résumé = ventes par compte,
  totaux en base = MyPuls (page comprise), une fiche = un compte — et son verdict est écrit dans
  `ingest_day_checks` ; un échec rend le jour « à vérifier » (Membres › Fiches MyPuls) et dégrade
  le run (Sentry). Anomalies : `chatter_identity_issues`. Spec :
  `docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md`.
```

`docs/CARTE.md` :
- ligne `pnpm start`, colonne Données : ajouter `chatter_identity_issues`, `ingest_day_checks`,
  `profiles` (ordre alphabétique) et `; rpc finish_chatter_day` ; colonne Doc : la spec ;
- après la ligne `pnpm identity-backfill`, ajouter :

```markdown
| `pnpm recette-identite photo <jour> <dossier>` / `compare <avant> <apres> <rapport.md>` | Recette de non-régression de l'identité chatteur : photo d'un jour (Σ par fiche, fiches, anomalies, contrôle) et comparaison avant/après fiche par fiche, chaque différence expliquée ou INEXPLIQUÉE | `src/recette-identite.ts` | tables `chatter_creator_daily`, `chatter_daily`, `chatter_identity_issues`, `chatters`, `ingest_day_checks` | `docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md` |
```

`CHANGELOG.md`, sous `## Non publié`, dans `### Corrigé` :

```markdown
- Ingestion : chaque chatteur est résolu par son id MyPuls et non plus par son libellé, et chaque jour ingéré est contrôlé (résumé = ventes par compte, totaux en base = MyPuls, une fiche = un compte) — un jour faux passe « à vérifier » et alerte au lieu de passer inaperçu ; le relevé des shifts ne rattache plus un homonyme.
```

- [ ] **Step 5 : vérifications de PR**

Run : `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:carte`
Expected : tout vert.

- [ ] **Step 6 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- ARCHITECTURE.md docs/CARTE.md CHANGELOG.md
git commit -m "docs(fiabilite): identité par id MyPuls et contrôles nocturnes"
```

Push et PR vers `develop` sur go de Benoit, avec `rapport.md` en pièce jointe (il est gitignoré :
le coller dans la description).

- [ ] **Step 7 : ⛔ déploiement du Worker — accord explicite de Benoit, après l'apply prod du lot 1 ET la recette acceptée**

```bash
CLOUDFLARE_API_TOKEN="$(envv CLOUDFLARE_API_TOKEN_GLAGENCY)" pnpm --filter @glagency/ingestion deploy
```

Le lendemain, lecture prod :

```bash
psql "$PROD_DB" -c "select day, status, checks from ingest_day_checks order by day desc limit 3"
```

Un jour `a_verifier` se lit dans le détail des contrôles : modèle inconnue à créer, fusion à
valider, ou markup MyPuls changé.

---

# PR 4 — onglet admin « Fiches MyPuls » (branche `feature/identite-4-membres`)

Peut avancer en parallèle de la PR 3 : la migration `0183` est déjà là depuis la PR 2.

### Task 15 : types et assemblage pur des données de l'onglet

**Files :**
- Modify : `apps/web/src/features/members/types.ts` (en-tête + fin de fichier)
- Create : `apps/web/src/features/members/identity-issues.ts`
- Test : `apps/web/src/features/members/identity-issues.test.ts`

**Interfaces :**
- Consumes : `IdentityIssueKind` (`@glagency/core`).
- Produces :
  - `interface IdentityFiche { id: string; name: string; member: string | null }`
  - `interface IdentityIssueRow { id; kind: IdentityIssueKind; mypulsUserId; label; day; amount: number | null; detail; firstSeenAt; lastSeenAt; fiche: IdentityFiche | null; autre: IdentityFiche | null }`
  - `interface UnattributedSale { creatorName: string; label: string; ca: number }`
  - `interface UnrankedChatter { chatterId: string; name: string; mypulsUserId: string | null; ca: number; memberName: string | null; memberRole: string | null }`
  - `interface ReliabilityCheck { code: string; ok: boolean; detail: string }`
  - `interface ReliabilityDay { day: string; status: 'ok' | 'a_verifier' | 'non_verifie'; checks: ReliabilityCheck[]; checkedAt: string | null }`
  - `interface IdentityData { reliability: { latest: ReliabilityDay | null; history: ReliabilityDay[] }; unranked: UnrankedChatter[]; doubles: IdentityIssueRow[]; nouvelles: IdentityIssueRow[]; montants: IdentityIssueRow[]; ventesSansChatteur: { total: number; rows: UnattributedSale[] } }`
  - `buildIdentityData({ rows, sales, days, unranked }): IdentityData`
  - `CHECK_LABEL: Record<string, string>`

- [ ] **Step 1 : les types**

En tête de `apps/web/src/features/members/types.ts`, avec les autres imports :

```ts
import type { IdentityIssueKind } from '@glagency/core'
```

À la fin du fichier :

```ts
// ── Onglet « Fiches MyPuls » (identité chatteur + fiabilité, spec 2026-10-01) ────────────────
export interface IdentityFiche {
  id: string
  name: string
  /** Membre relié à la fiche (`profiles.chatter_id`), sinon null. */
  member: string | null
}

export interface IdentityIssueRow {
  id: string
  kind: IdentityIssueKind
  mypulsUserId: string | null
  label: string | null
  day: string | null
  amount: number | null
  detail: string
  firstSeenAt: string
  lastSeenAt: string
  fiche: IdentityFiche | null
  autre: IdentityFiche | null
}

export interface UnattributedSale {
  creatorName: string
  label: string
  ca: number
}

/** Fiche avec du CA sans membre au rôle `chatteur` : absente du classement Stat chatter. */
export interface UnrankedChatter {
  chatterId: string
  name: string
  mypulsUserId: string | null
  ca: number
  memberName: string | null
  memberRole: string | null
}

export interface ReliabilityCheck {
  code: string
  ok: boolean
  detail: string
}

export interface ReliabilityDay {
  day: string
  status: 'ok' | 'a_verifier' | 'non_verifie'
  checks: ReliabilityCheck[]
  checkedAt: string | null
}

export interface IdentityData {
  reliability: { latest: ReliabilityDay | null; history: ReliabilityDay[] }
  unranked: UnrankedChatter[]
  doubles: IdentityIssueRow[]
  nouvelles: IdentityIssueRow[]
  montants: IdentityIssueRow[]
  ventesSansChatteur: { total: number; rows: UnattributedSale[] }
}
```

- [ ] **Step 2 : tests qui échouent**

`apps/web/src/features/members/identity-issues.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { buildIdentityData, CHECK_LABEL } from './identity-issues'
import type { IdentityIssueRow, ReliabilityDay } from './types'

const row = (id: string, kind: IdentityIssueRow['kind'], lastSeenAt: string): IdentityIssueRow => ({
  id,
  kind,
  mypulsUserId: null,
  label: null,
  day: null,
  amount: null,
  detail: '',
  firstSeenAt: lastSeenAt,
  lastSeenAt,
  fiche: null,
  autre: null,
})
const dayOf = (day: string, status: ReliabilityDay['status']): ReliabilityDay => ({ day, status, checks: [], checkedAt: null })
const empty = { rows: [], sales: [], days: [], unranked: [] }

describe('buildIdentityData (onglet Fiches MyPuls)', () => {
  it('range chaque type d’anomalie dans sa section, la plus récente en tête', () => {
    const g = buildIdentityData({
      ...empty,
      rows: [
        row('1', 'doublon', '2026-09-01'),
        row('2', 'membres_multiples', '2026-09-30'),
        row('3', 'homonyme', '2026-09-02'),
        row('4', 'conflit_id', '2026-09-03'),
        row('5', 'fiche_creee', '2026-10-01'),
        row('6', 'resume_mis_de_cote', '2026-10-01'),
        row('7', 'ecart_invariant', '2026-10-01'),
      ],
    })
    expect(g.doubles.map((r) => r.id)).toEqual(['2', '4', '3', '1'])
    expect(g.nouvelles.map((r) => r.id)).toEqual(['5'])
    expect(g.montants.map((r) => r.id).sort()).toEqual(['6', '7'])
  })

  it('statut de fiabilité : le dernier jour en tête, l’historique dans l’ordre reçu', () => {
    const g = buildIdentityData({ ...empty, days: [dayOf('2026-10-04', 'a_verifier'), dayOf('2026-10-03', 'ok')] })
    expect(g.reliability.latest?.status).toBe('a_verifier')
    expect(g.reliability.history.map((d) => d.day)).toEqual(['2026-10-04', '2026-10-03'])
    expect(buildIdentityData(empty).reliability.latest).toBeNull()
  })

  it('CA sans membre trié par CA ; ventes sans chatteur totalisées au centime', () => {
    const g = buildIdentityData({
      ...empty,
      unranked: [
        { chatterId: 'a', name: 'A', mypulsUserId: null, ca: 10, memberName: null, memberRole: null },
        { chatterId: 'b', name: 'B', mypulsUserId: '1', ca: 99, memberName: null, memberRole: null },
      ],
      sales: [
        { creatorName: 'Lena_dv', label: 'Indéterminé (Lena_dv)', ca: 0.1 },
        { creatorName: 'Carla', label: 'Indéterminé (Carla)', ca: 0.2 },
      ],
    })
    expect(g.unranked.map((u) => u.chatterId)).toEqual(['b', 'a'])
    expect(g.ventesSansChatteur).toEqual({
      total: 0.3,
      rows: [
        { creatorName: 'Carla', label: 'Indéterminé (Carla)', ca: 0.2 },
        { creatorName: 'Lena_dv', label: 'Indéterminé (Lena_dv)', ca: 0.1 },
      ],
    })
  })

  it('chaque code de contrôle a un libellé lisible', () => {
    for (const code of ['a_resume_ventes', 'b_resume_ecrit', 'b_ventes_ecrites', 'b_total_page', 'c_fiche_compte', 'c_lien_refuse']) {
      expect(CHECK_LABEL[code]).toBeTruthy()
    }
  })
})
```

Run : `pnpm --filter @glagency/web exec vitest run src/features/members/identity-issues.test.ts`
Expected : FAIL, module introuvable.

- [ ] **Step 3 : `identity-issues.ts`**

```ts
import type {
  IdentityData,
  IdentityIssueRow,
  ReliabilityDay,
  UnattributedSale,
  UnrankedChatter,
} from './types'

/**
 * Assemblage pur de l'onglet « Fiches MyPuls » (spec § 7). `Record` sur le type d'anomalie : un
 * type ajouté en base sans section ici casse le typecheck au lieu de disparaître de l'écran.
 */
const SECTION: Record<IdentityIssueRow['kind'], 'doubles' | 'nouvelles' | 'montants'> = {
  doublon: 'doubles',
  membres_multiples: 'doubles',
  homonyme: 'doubles',
  conflit_id: 'doubles',
  fiche_creee: 'nouvelles',
  resume_mis_de_cote: 'montants',
  ecart_invariant: 'montants',
}

/** Libellés des contrôles de fiabilité (codes de `ingest_day_checks.checks`, 0183). */
export const CHECK_LABEL: Record<string, string> = {
  a_resume_ventes: 'Résumé = ventes, par compte',
  b_resume_ecrit: 'Résumé écrit en base',
  b_ventes_ecrites: 'Ventes écrites en base',
  b_total_page: 'Total de la page MyPuls',
  c_fiche_compte: 'Une fiche = un compte',
  c_lien_refuse: 'Id MyPuls non posé',
}

export function buildIdentityData(input: {
  rows: IdentityIssueRow[]
  sales: UnattributedSale[]
  days: ReliabilityDay[]
  unranked: UnrankedChatter[]
}): IdentityData {
  const out: IdentityData = {
    reliability: { latest: input.days[0] ?? null, history: input.days },
    unranked: [...input.unranked].sort((a, b) => b.ca - a.ca || a.name.localeCompare(b.name)),
    doubles: [],
    nouvelles: [],
    montants: [],
    ventesSansChatteur: { total: 0, rows: [] },
  }
  for (const r of input.rows) out[SECTION[r.kind]].push(r)
  for (const k of ['doubles', 'nouvelles', 'montants'] as const) {
    out[k].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || a.id.localeCompare(b.id))
  }
  const ventes = [...input.sales].sort((a, b) => b.ca - a.ca || a.creatorName.localeCompare(b.creatorName))
  out.ventesSansChatteur = { total: Math.round(ventes.reduce((s, r) => s + r.ca, 0) * 100) / 100, rows: ventes }
  return out
}
```

- [ ] **Step 4 : vérifier**

Run : `pnpm --filter @glagency/web exec vitest run src/features/members/identity-issues.test.ts`
Expected : PASS.

- [ ] **Step 5 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- apps/web/src/features/members/types.ts apps/web/src/features/members/identity-issues.ts apps/web/src/features/members/identity-issues.test.ts
git commit -m "feat(membres): données de l'onglet Fiches MyPuls (fiabilité, CA sans membre, anomalies)"
```

---

### Task 16 : service de lecture et Server Action « Vu »

**Files :**
- Create : `apps/web/src/features/members/services/get-fiches-mypuls.ts`
- Create : `apps/web/src/features/members/actions-identity.ts`

**Interfaces :**
- Consumes :
  - `buildIdentityData` (Task 15) ;
  - table `chatter_identity_issues` ;
  - RPC `unattributed_sales`, `unranked_chatters_ca`, `reliability_days` (0183) ;
  - `runAction`, `noGuard`, `requireAdminProfileLive` (`@/lib/actions`).
- Produces :
  - `getFichesMyPuls(period: { from: string; to: string }): Promise<IdentityData>` ;
  - `ackIdentityIssue(raw: unknown): Promise<ActionResult>`.

- [ ] **Step 1 : le service**

`apps/web/src/features/members/services/get-fiches-mypuls.ts` :

```ts
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { buildIdentityData } from '../identity-issues'
import type {
  IdentityData,
  IdentityFiche,
  IdentityIssueRow,
  ReliabilityDay,
  UnattributedSale,
  UnrankedChatter,
} from '../types'

/** Miroirs TS des `json` des RPC de 0183 — `Returns: Json` côté Postgres (guidelines-data-loading §1). */
interface UnattributedRpcRow {
  creator_name: string
  label: string
  ca: number | string
}
interface UnrankedRpcRow {
  chatter_id: string
  display_name: string
  mypuls_user_id: string | null
  ca: number | string
  member_name: string | null
  member_role: string | null
}
interface ReliabilityRpcRow {
  day: string
  status: ReliabilityDay['status']
  checks: ReliabilityDay['checks']
  checked_at: string | null
}

/** Jours affichés dans l'historique de fiabilité. */
const RELIABILITY_DAYS = 14

/**
 * Onglet « Fiches MyPuls » de Membres (admin) — spec § 7. Client RLS (cookie) : les tables de
 * 0183 ne sont lisibles que par un admin. PAS de `use cache` (lecture liée au cookie, §4). Les
 * agrégats de tables de faits passent par des RPC `security invoker` (§1) ; les anomalies, table
 * sans borne naturelle, par `fetchAll`.
 */
export async function getFichesMyPuls(period: { from: string; to: string }): Promise<IdentityData> {
  const supabase = await createClient()
  const [issues, members, sales, unranked, days] = await Promise.all([
    fetchAll((f, t) =>
      supabase
        .from('chatter_identity_issues')
        .select(
          'id, kind, mypuls_user_id, label, day, amount, detail, first_seen_at, last_seen_at, chatter_id, other_chatter_id, fiche:chatters!chatter_identity_issues_chatter_id_fkey(display_name), autre:chatters!chatter_identity_issues_other_chatter_id_fkey(display_name)',
        )
        .is('resolved_at', null)
        .order('id')
        .range(f, t),
    ),
    fetchAll((f, t) =>
      supabase.from('profiles').select('id, display_name, chatter_id').not('chatter_id', 'is', null).order('id').range(f, t),
    ),
    supabase.rpc('unattributed_sales', { p_from: period.from, p_to: period.to }),
    supabase.rpc('unranked_chatters_ca', { p_from: period.from, p_to: period.to }),
    supabase.rpc('reliability_days', { p_days: RELIABILITY_DAYS }),
  ])
  for (const r of [issues, members, sales, unranked, days]) if (r.error) throw new Error(r.error.message)

  const memberOf = new Map(members.data.map((p) => [p.chatter_id as string, p.display_name as string]))
  const fiche = (id: string | null, embed: { display_name: string } | null): IdentityFiche | null =>
    id ? { id, name: embed?.display_name ?? '—', member: memberOf.get(id) ?? null } : null

  const rows: IdentityIssueRow[] = issues.data.map((r) => ({
    id: r.id,
    // `kind` est un `text` + `check` côté Postgres : le check garantit l'union.
    kind: r.kind as IdentityIssueRow['kind'],
    mypulsUserId: r.mypuls_user_id,
    label: r.label,
    day: r.day,
    amount: r.amount === null ? null : Number(r.amount),
    detail: r.detail,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    fiche: fiche(r.chatter_id, r.fiche),
    autre: fiche(r.other_chatter_id, r.autre),
  }))
  const ventes: UnattributedSale[] = ((sales.data as UnattributedRpcRow[] | null) ?? []).map((s) => ({
    creatorName: s.creator_name,
    label: s.label,
    ca: Number(s.ca) || 0,
  }))
  const sansMembre: UnrankedChatter[] = ((unranked.data as UnrankedRpcRow[] | null) ?? []).map((u) => ({
    chatterId: u.chatter_id,
    name: u.display_name,
    mypulsUserId: u.mypuls_user_id,
    ca: Number(u.ca) || 0,
    memberName: u.member_name,
    memberRole: u.member_role,
  }))
  const fiabilite: ReliabilityDay[] = ((days.data as ReliabilityRpcRow[] | null) ?? []).map((d) => ({
    day: d.day,
    status: d.status,
    checks: d.checks ?? [],
    checkedAt: d.checked_at,
  }))
  return buildIdentityData({ rows, sales: ventes, days: fiabilite, unranked: sansMembre })
}
```

Si `tsc` ne type pas la boucle `for (const r of [...])` (types hétérogènes), écrire les cinq
`if (x.error) throw new Error(x.error.message)` à la suite. Vérifier les noms de contrainte
`…_chatter_id_fkey` et `…_other_chatter_id_fkey` dans `packages/db/src/types.ts` (`Relationships`
de `chatter_identity_issues`).

- [ ] **Step 2 : la Server Action**

`apps/web/src/features/members/actions-identity.ts` :

```ts
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { noGuard, requireAdminProfileLive, runAction, type ActionResult } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'

/**
 * « Vu » sur une anomalie d'identité (Membres › Fiches MyPuls, spec § 7). Admin seul, hors
 * consultation « en tant que » : garde UNE fois dans le handler (`noGuard`, §4). La RLS
 * (`chatter_identity_issues_admin_ack`, 0183) reste l'enforcement réel. Une anomalie vue ne revient
 * pas : l'ingestion met à jour `last_seen_at` sans toucher `resolved_at`.
 */
export async function ackIdentityIssue(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: z.object({ id: z.uuid() }),
    input: raw,
    guard: noGuard,
    handler: async ({ id }) => {
      const profile = await requireAdminProfileLive()
      const supabase = await createClient()
      const { error } = await supabase
        .from('chatter_identity_issues')
        .update({ resolved_at: new Date().toISOString(), resolved_by: profile.id })
        .eq('id', id)
        .is('resolved_at', null)
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/members')
    },
  })
}
```

- [ ] **Step 3 : vérifier**

Run : `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint`
Expected : aucune erreur.

- [ ] **Step 4 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- apps/web/src/features/members/services/get-fiches-mypuls.ts apps/web/src/features/members/actions-identity.ts
git commit -m "feat(membres): lecture de l'onglet Fiches MyPuls et action « Vu »"
```

---

### Task 17 : l'onglet — statut de fiabilité, CA sans membre, anomalies, note

**Files :**
- Create : `apps/web/src/features/members/components/reliability-card.tsx`
- Create : `apps/web/src/features/members/components/unranked-table.client.tsx`
- Create : `apps/web/src/features/members/components/identity-issues-table.client.tsx`
- Create : `apps/web/src/features/members/components/identity-view.tsx`
- Modify : `apps/web/src/features/members/components/members-tabs.tsx:8-76`
- Modify : `apps/web/src/features/members/MembersTemplate.tsx:1-85`
- Modify : `apps/web/src/app/(dash)/chatter/members/page.tsx:1-128`

**Interfaces :**
- Consumes : `IdentityData` et ses types, `CHECK_LABEL` (Task 15) ; `ackIdentityIssue`,
  `getFichesMyPuls` (Task 16).
- Produces : vue `?vue=fiches`, libellé « Fiches MyPuls », admin seulement.

- [ ] **Step 1 : la carte de fiabilité (Server Component)**

`apps/web/src/features/members/components/reliability-card.tsx` :

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { frDateNumeric } from '@glagency/core'
import { cn } from '@/lib/utils'
import { STATUS_COLORS } from '@/lib/status-color'
import { CHECK_LABEL } from '../identity-issues'
import type { IdentityData, ReliabilityDay } from '../types'

const STATUS: Record<ReliabilityDay['status'], { label: string; color: string }> = {
  ok: { label: 'Vérifié', color: STATUS_COLORS.positive },
  a_verifier: { label: 'À vérifier', color: STATUS_COLORS.warning },
  non_verifie: { label: 'Non vérifié', color: STATUS_COLORS.neutral },
}

/**
 * Statut de fiabilité du dernier relevé (spec § 3, § 7) : verdict du dernier jour ingéré, détail
 * des contrôles en échec, historique des derniers jours. Badge de statut = patron Uncove
 * (`uncove-accounts.client.tsx:165`).
 */
export function ReliabilityCard({ reliability }: { reliability: IdentityData['reliability'] }) {
  const latest = reliability.latest
  const failed = latest?.checks.filter((c) => !c.ok) ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fiabilité des chiffres</CardTitle>
        <CardDescription>
          Chaque nuit, trois contrôles comparent nos chiffres à MyPuls : résumé = ventes pour chaque compte, totaux en base =
          totaux MyPuls, une fiche = un compte.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {latest ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={cn('text-xs', STATUS[latest.status].color)}>{STATUS[latest.status].label}</Badge>
            <span className="text-sm">Relevé du {frDateNumeric(latest.day)}</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun jour ingéré.</p>
        )}
        {latest?.status === 'non_verifie' && (
          <p className="text-sm text-muted-foreground">
            Ce jour n&apos;a pas été contrôlé : le relevé chatteurs a échoué ou n&apos;a pas tourné.
          </p>
        )}
        {failed.length > 0 && (
          <ul className="flex flex-col">
            {failed.map((c) => (
              <li key={c.code} className="flex flex-col gap-0.5 border-b py-2 last:border-0">
                <span className="font-medium">{CHECK_LABEL[c.code] ?? c.code}</span>
                <span className="text-sm text-muted-foreground">{c.detail}</span>
              </li>
            ))}
          </ul>
        )}
        {reliability.history.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {reliability.history.map((d) => (
              <Badge key={d.day} className={cn('text-xs', STATUS[d.status].color)} title={STATUS[d.status].label}>
                {frDateNumeric(d.day).slice(0, 5)}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2 : le tableau « CA sans membre » (feuille client)**

`apps/web/src/features/members/components/unranked-table.client.tsx` :

```tsx
'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { eur } from '@/lib/format'
import type { UnrankedChatter } from '../types'

/** Fiches avec du CA sans membre au rôle `chatteur` — `DataTable` + `Sortable` (guidelines §9). */
export function UnrankedTable({ rows }: { rows: UnrankedChatter[] }) {
  'use no memo'
  const columns: ColumnDef<UnrankedChatter>[] = [
    {
      id: 'name',
      accessorFn: (r) => r.name,
      header: ({ column }) => <Sortable column={column} label="Fiche MyPuls" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: 'mypulsUserId',
      accessorFn: (r) => r.mypulsUserId ?? '',
      header: 'Id MyPuls',
      cell: ({ row }) => <span className="tabular-nums">{row.original.mypulsUserId ?? '—'}</span>,
    },
    {
      id: 'ca',
      accessorFn: (r) => r.ca,
      header: ({ column }) => <Sortable column={column} label="CA de la période" />,
      meta: { align: 'right' },
      cell: ({ row }) => <span className="tabular-nums">{eur(row.original.ca)}</span>,
    },
    {
      id: 'member',
      accessorFn: (r) => r.memberName ?? '',
      header: 'Membre relié',
      cell: ({ row }) =>
        row.original.memberName ? (
          <span>
            {row.original.memberName} <span className="text-xs text-muted-foreground">({row.original.memberRole})</span>
          </span>
        ) : (
          <span className="text-muted-foreground">aucun</span>
        ),
    },
  ]
  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(r) => r.chatterId}
      filterColumnId="name"
      filterPlaceholder="Filtrer par fiche…"
      initialSorting={[{ id: 'ca', desc: true }]}
      countLabel={(n) => `${n} fiche${n > 1 ? 's' : ''}`}
    />
  )
}
```

- [ ] **Step 3 : le tableau des anomalies (feuille client)**

`apps/web/src/features/members/components/identity-issues-table.client.tsx` :

```tsx
'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { frDateNumeric } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { eur } from '@/lib/format'
import { ackIdentityIssue } from '../actions-identity'
import type { IdentityFiche, IdentityIssueRow } from '../types'

const KIND_LABEL: Record<IdentityIssueRow['kind'], string> = {
  doublon: 'Même compte, deux fiches',
  membres_multiples: 'Deux membres reliés',
  homonyme: 'Homonymes mélangés',
  conflit_id: 'Id contradictoire',
  fiche_creee: 'Nouvelle fiche',
  resume_mis_de_cote: 'Résumé mis de côté',
  ecart_invariant: 'Écart résumé / ventes',
}

function Fiche({ f, label }: { f: IdentityFiche | null; label?: string | null }) {
  if (!f) return <span className="text-muted-foreground">{label ?? '—'}</span>
  return (
    <div className="flex flex-col">
      <span className="font-medium">{f.name}</span>
      {f.member && <span className="text-xs text-muted-foreground">relié à {f.member}</span>}
    </div>
  )
}

/** Une section d'anomalies — `DataTable` + `Sortable` (guidelines §9). Seule action : « Vu ». */
export function IdentityIssuesTable({
  rows,
  variant,
}: {
  rows: IdentityIssueRow[]
  variant: 'doubles' | 'nouvelles' | 'montants'
}) {
  'use no memo'
  const [pending, start] = useTransition()
  const ack = (r: IdentityIssueRow) =>
    start(async () => {
      const res = await ackIdentityIssue({ id: r.id })
      if (!res.success) return void toast.error(res.error)
      toast.success('Marqué comme vu.')
    })

  const columns: ColumnDef<IdentityIssueRow>[] = [
    {
      id: 'kind',
      accessorFn: (r) => KIND_LABEL[r.kind],
      header: 'Type',
      cell: ({ row }) => <Badge variant="outline">{KIND_LABEL[row.original.kind]}</Badge>,
    },
    {
      id: 'mypulsUserId',
      accessorFn: (r) => r.mypulsUserId ?? '',
      header: 'Id MyPuls',
      cell: ({ row }) => <span className="tabular-nums">{row.original.mypulsUserId ?? '—'}</span>,
    },
    {
      id: 'fiche',
      accessorFn: (r) => r.fiche?.name ?? r.label ?? '',
      header: ({ column }) => <Sortable column={column} label="Fiche" />,
      cell: ({ row }) => <Fiche f={row.original.fiche} label={row.original.label} />,
    },
  ]
  if (variant === 'doubles') {
    columns.push({
      id: 'autre',
      accessorFn: (r) => r.autre?.name ?? '',
      header: 'Autre fiche',
      cell: ({ row }) => <Fiche f={row.original.autre} />,
    })
  }
  if (variant === 'montants') {
    columns.push(
      {
        id: 'day',
        accessorFn: (r) => r.day ?? '',
        header: ({ column }) => <Sortable column={column} label="Jour" />,
        cell: ({ row }) => (row.original.day ? frDateNumeric(row.original.day) : '—'),
      },
      {
        id: 'amount',
        accessorFn: (r) => r.amount ?? 0,
        header: ({ column }) => <Sortable column={column} label="Montant" />,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.amount === null ? '—' : eur(row.original.amount)}</span>
        ),
      },
    )
  }
  columns.push(
    {
      id: 'detail',
      accessorFn: (r) => r.detail,
      header: 'Détail',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.detail}</span>,
    },
    {
      id: 'lastSeenAt',
      accessorFn: (r) => r.lastSeenAt,
      header: ({ column }) => <Sortable column={column} label="Dernière détection" />,
      cell: ({ row }) => frDateNumeric(row.original.lastSeenAt.slice(0, 10)),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => ack(row.original)} disabled={pending}>
            Vu
          </Button>
        </div>
      ),
    },
  )

  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(r) => r.id}
      filterColumnId="fiche"
      filterPlaceholder="Filtrer par fiche…"
      initialSorting={[{ id: 'lastSeenAt', desc: true }]}
      countLabel={(n) => `${n} ligne${n > 1 ? 's' : ''}`}
    />
  )
}
```

- [ ] **Step 4 : la vue (Server Component)**

`apps/web/src/features/members/components/identity-view.tsx` :

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { frDateNumeric } from '@glagency/core'
import { eur } from '@/lib/format'
import { ReliabilityCard } from './reliability-card'
import { UnrankedTable } from './unranked-table.client'
import { IdentityIssuesTable } from './identity-issues-table.client'
import type { IdentityData, IdentityIssueRow } from '../types'

/**
 * Onglet « Fiches MyPuls » (admin) — Server Component, sans état : tout vient de
 * `get-fiches-mypuls.ts`. Spec docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md § 7.
 * Ordre : fiabilité du dernier relevé, CA sans membre (le problème qui a lancé le dossier : Lionel
 * absent du classement), les trois listes d'anomalies, puis la note INFORMATIVE des ventes sans
 * chatteur (aucun « Relier » : une pseudo-fiche porte tout un modèle).
 */
export function IdentityView({ data, period }: { data: IdentityData; period: { from: string; to: string } }) {
  const du = `du ${frDateNumeric(period.from)} au ${frDateNumeric(period.to)}`
  return (
    <div className="flex flex-col gap-6">
      <ReliabilityCard reliability={data.reliability} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fiches avec du CA sans membre — absentes du classement Stat chatter</CardTitle>
          <CardDescription>
            CA {du} sur des fiches MyPuls qu&apos;aucun membre au rôle chatteur ne porte : le classement ne les voit pas. À
            relier au bon membre, ou à fusionner si c&apos;est un doublon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.unranked.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune fiche avec du CA sans membre sur la période.</p>
          ) : (
            <UnrankedTable rows={data.unranked} />
          )}
        </CardContent>
      </Card>
      <IssuesCard
        title="Fiches MyPuls en double"
        description="Un même compte MyPuls coupé en plusieurs fiches : ses chiffres se partagent entre elles, et la paie du membre relié n'en voit qu'une. Se règle par une fusion validée."
        empty="Aucun doublon détecté."
        rows={data.doubles}
        variant="doubles"
      />
      <IssuesCard
        title="Nouvelles fiches à vérifier"
        description="Fiches créées par l'ingestion pour un compte ou un libellé inconnu."
        empty="Aucune nouvelle fiche."
        rows={data.nouvelles}
        variant="nouvelles"
      />
      <IssuesCard
        title="Montants non attribués"
        description="CA du résumé qu'aucun compte ne départage, ou écart entre le résumé et les ventes d'un même compte."
        empty="Aucun montant en attente."
        rows={data.montants}
        variant="montants"
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ventes sans chatteur</CardTitle>
          <CardDescription>
            {eur(data.ventesSansChatteur.total)} {du}, que MyPuls n&apos;attribue à aucun chatteur. À attribuer dans MyPuls
            (« Éditer l&apos;attribution ») : elles ne se rattachent pas à un membre. Une correction faite dans MyPuls après coup
            ne remonte pas dans le CRM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.ventesSansChatteur.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune vente sans chatteur sur la période.</p>
          ) : (
            <ul className="flex flex-col">
              {data.ventesSansChatteur.rows.map((r) => (
                <li
                  key={r.label}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b py-2 last:border-0"
                >
                  <span className="font-medium">{r.creatorName}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">{eur(r.ca)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function IssuesCard({
  title,
  description,
  empty,
  rows,
  variant,
}: {
  title: string
  description: string
  empty: string
  rows: IdentityIssueRow[]
  variant: 'doubles' | 'nouvelles' | 'montants'
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <IdentityIssuesTable rows={rows} variant={variant} />}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5 : `members-tabs.tsx`**

Type (`:8-11`) :

```ts
/** Quatre vues : les comptes, le turnover, le flux d'activité, et les fiches MyPuls (identité +
 *  fiabilité). `liste` est la vue par défaut : elle ne s'écrit pas dans l'URL. */
export type MembersVue = 'liste' | 'turnover' | 'activite' | 'fiches'
```

Dans la signature de `MembersTabs`, ajouter `fiches` et `showFiches` :

```ts
export function MembersTabs({
  vue,
  liste,
  turnover,
  activite,
  fiches,
  showActivite = true,
  showFiches = false,
}: {
  vue: MembersVue
  liste: ReactNode
  turnover: ReactNode
  activite: ReactNode
  /** Onglet « Fiches MyPuls » (spec identité 2026-10-01) — ADMINS uniquement, comme Activité :
   *  les tables de 0183 ne sont lisibles que par un admin. */
  fiches: ReactNode
  /** Onglet Activité réservé aux ADMINS (décision Benoit 2026-08-06 — miroir de la RLS 0108
   *  qui ferme member_events aux managers) : masqué pour un manager. */
  showActivite?: boolean
  showFiches?: boolean
}) {
```

JSX : après le trigger « Activité » :

```tsx
        {showFiches && <TabsTrigger value="fiches">Fiches MyPuls</TabsTrigger>}
```

Après le `TabsContent` « activite » :

```tsx
        {showFiches && <TabsContent value="fiches">{fiches}</TabsContent>}
```

- [ ] **Step 6 : `MembersTemplate.tsx`**

Imports :

```ts
import { IdentityView } from './components/identity-view'
import type { IdentityData, MemberEvent, MembersData, TurnoverData } from './types'
```

(Remplacer l'import de types existant.)

Props, après `activity` :

```ts
  /** Onglet « Fiches MyPuls » (admin) — exclusif des autres lectures, comme `turnover`. */
  identity?: IdentityData | null
  /** Période du datepicker global : CA sans membre et ventes sans chatteur la suivent. */
  period?: { from: string; to: string }
```

Le type `vue` devient `'liste' | 'turnover' | 'activite' | 'fiches'`, et le destructuring ajoute
`identity = null, period`. Dans le `<MembersTabs …>` final :

```tsx
      showFiches={viewer === 'admin'}
      fiches={identity && period ? <IdentityView data={identity} period={period} /> : null}
```

- [ ] **Step 7 : `page.tsx`**

Imports :

```ts
import { getFichesMyPuls } from '@/features/members/services/get-fiches-mypuls'
import type { IdentityData } from '@/features/members/types'
```

Calcul de `vue` (`:64-65`) :

```ts
  // Activité et Fiches MyPuls : ADMINS uniquement — un `?vue=` forgé par un manager retombe sur
  // la liste, et la lecture n'est jamais lancée.
  const vue =
    sp.vue === 'turnover'
      ? 'turnover'
      : sp.vue === 'activite' && isAdmin
        ? 'activite'
        : sp.vue === 'fiches' && isAdmin
          ? 'fiches'
          : 'liste'
```

Après `const activity = …` :

```ts
  const identity = vue === 'fiches' ? getFichesMyPuls(period) : null
```

Commentaire juste au-dessus : « UNE SEULE des quatre lectures est lancée ». Passer
`identity={identity}` à `<MembersContent …>`. Dans `MembersContent` :
- ajouter la prop `identity: Promise<IdentityData> | null` ;
- élargir `vue` à `'liste' | 'turnover' | 'activite' | 'fiches'` ;
- dans le `<MembersTemplate …>` rendu :

```tsx
      identity={identity ? await identity : null}
      period={period}
```

- [ ] **Step 8 : vérifier**

Run : `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web test && pnpm build`
Expected : aucune erreur, tests verts, build OK.

Contrôle visuel en local sur l'UAT (`pnpm --filter @glagency/web dev:uat`), en admin, sur
`/chatter/members?vue=fiches` :
- la carte de fiabilité porte le statut du dernier jour et l'historique ;
- le tableau « CA sans membre » est trié par CA ;
- les trois listes d'anomalies sont présentes ;
- la note des ventes sans chatteur est présente ;
- « Vu » retire une ligne, avec un toast ;
- en manager, l'onglet est absent et `?vue=fiches` retombe sur la liste.

- [ ] **Step 9 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- apps/web/src/features/members/components/reliability-card.tsx apps/web/src/features/members/components/unranked-table.client.tsx apps/web/src/features/members/components/identity-issues-table.client.tsx apps/web/src/features/members/components/identity-view.tsx apps/web/src/features/members/components/members-tabs.tsx apps/web/src/features/members/MembersTemplate.tsx "apps/web/src/app/(dash)/chatter/members/page.tsx"
git commit -m "feat(membres): onglet admin « Fiches MyPuls » — fiabilité, CA sans membre, anomalies"
```

---

### Task 18 : docs PR 4 et vérifications finales

**Files :**
- Modify : `docs/CARTE.md:23` (ligne `members`), `ARCHITECTURE.md` (§ 6, phrase sur
  `ingest_runs`), `CHANGELOG.md`

- [ ] **Step 1 : CARTE**

Ligne `members` :
- **colonne « À quoi elle sert »** : ajouter « + onglet Fiches MyPuls (admin : fiabilité des
  chiffres, CA sans membre, fiches en double, nouvelles fiches, montants non attribués, ventes
  sans chatteur) » ;
- **colonne Données** : ajouter les tables `chatter_identity_issues` (avant `chatters`) et les
  rpc `reliability_days`, `unattributed_sales`, `unranked_chatters_ca` (ordre alphabétique) ;
- **colonne Doc** : ajouter `· docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md`.

- [ ] **Step 2 : ARCHITECTURE § 6**

```bash
grep -rn "ingest_runs" apps/web/src | head; grep -rln "mypuls_shift_runs" apps/web/src | head
```

Si le premier `grep` est vide, remplacer « lisible depuis `/chatter/presence/reglages` » par :

« lisible en base seulement (aucun écran ne la lit ; le journal affiché dans
`/chatter/presence/reglages` est celui du relevé des shifts, `mypuls_shift_runs`). La fiabilité de
chaque jour ingéré est dans `ingest_day_checks`, lue dans Membres › Fiches MyPuls »

Si la page Réglages ne lit pas `mypuls_shift_runs`, retirer la parenthèse et le signaler.

- [ ] **Step 3 : CHANGELOG**

Sous `## Non publié`, dans `### Ajouté` :

```markdown
- Membres › Fiches MyPuls (admin) : statut de fiabilité du dernier relevé (vérifié / à vérifier, contrôles en échec, historique), fiches avec du CA sans membre absentes du classement Stat chatter, fiches en double, nouvelles fiches, montants non attribués et note des ventes sans chatteur.
```

- [ ] **Step 4 : vérifications de PR**

Run : `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:carte`
Expected : tout vert.

- [ ] **Step 5 : relecture indépendante, puis point de commit (si Benoit dit « commit »)**

```bash
git add -- docs/CARTE.md ARCHITECTURE.md CHANGELOG.md
git commit -m "docs(membres): onglet Fiches MyPuls dans la carte et l'architecture"
```

Push et PR vers `develop` sur go de Benoit.

---

## Après les PR (hors plan — chaque étape sur accord explicite de Benoit)

1. **Ordre prod impératif :**
   1. `0183` (Task 6, step 9.1) ;
   2. rapport et lot 1 évalué ;
   3. apply du lot 1 ;
   4. recette acceptée (Task 14) ;
   5. déploiement du Worker ;
   6. release web (`pnpm release:prepare` → PR `develop` → `main` → `pnpm release:tag`).

   La page web appelle les RPC de `0183` : la migration doit être en prod avant la release.
2. **Suivi** : les jours « à vérifier » des premières nuits se traitent un par un (modèle à créer
   dans le CRM, lot de fusions suivant, markup MyPuls). Chaque lot suivant est un nouveau fichier
   `apps/ingestion/identity-lots/lot-N.csv`, validé en PR.
3. **Worktree** : une fois tout mergé, vérifier `git log develop..feature/identite-<n>-…` vide
   pour chaque branche, puis `git worktree remove ../glagencyapp-identite` (sans `--force`), et
   supprimer les branches.
4. **Option ultérieure** : bouton « Fusionner » depuis une ligne `doublon` de l'onglet.
