import {
  computePayslip,
  daysIn,
  mondaysIn,
  recentFortnights,
  todayParis,
  type Fortnight,
} from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { buildCoverage, overdueFortnights } from './coverage'
import type { ComptaData, ComptaRow, ComptaSanction } from '../types'

/** Motifs de sanction — copie locale : `features/police` est une AUTRE feature, import interdit
 *  (ESLint `import-x/no-restricted-paths`). Garder aligné sur `features/police/types.ts`. */
const ERROR_LABEL: Record<string, string> = {
  media_argent: 'Parle de média/argent directement',
  reactivite: 'Réponse > 45 s par sub',
  media_rapide: 'Envoi de média trop rapide',
  fautes: "Fautes d'orthographe",
  setter_lent: 'Ne récupère pas vite les nouveaux (setter)',
  hors_script: "Ne suit pas l'histoire du script",
  sexu_faible: 'Sexualisation faible (ne fait pas baver)',
  promesse: 'Promesse non tenue (setter)',
  temps_media: "N'attend pas le temps du média",
  infos_non_transmises: 'Ne transmet pas les infos',
  infos_non_notees: 'Ne note pas les infos',
}

interface CcdRow {
  chatter_id: string
  creator_id: string
  date: string
  ca: number | null
}

/**
 * Compta d'UNE quinzaine. Le cloisonnement est porté par la RLS (0085) : admin → tout,
 * manager/sous-manager → ses rattachés directs. La population vient de `profiles` (rôle
 * chatteur), pas de `chatters` : c'est le membre qu'on paie.
 */
export async function getCompta({
  month,
  period,
}: {
  month?: string
  period?: string
}): Promise<ComptaData> {
  const supabase = await createClient()
  const today = todayParis()
  const choices = recentFortnights(today, 12)

  // `?month=`/`?period=` validés PAR APPARTENANCE à la fenêtre proposée, jamais par regex seule.
  const wanted = choices.find((f) => f.month === month && f.period === Number(period))
  const fortnight: Fortnight = wanted ?? choices[0]
  const days = daysIn(fortnight)
  const mondays = mondaysIn(fortnight)
  const from = fortnight.from
  const to = fortnight.to

  const [
    { data: members, error: membersErr },
    { data: settings, error: settingsErr },
    { data: primes, error: primesErr },
    { data: dayEntries, error: dayErr },
    { data: weekEntries, error: weekErr },
    { data: payments, error: payErr },
    { data: sanctions, error: sancErr },
    { data: creators, error: creatorsErr },
    { data: firstSeen, error: firstSeenErr },
  ] = await Promise.all([
    supabase.from('profiles').select('id, display_name, email, role, chatter_id').eq('role', 'chatteur').order('display_name'),
    supabase.from('compta_settings').select('*'),
    supabase.from('compta_primes').select('*').eq('status', 'due'),
    supabase.from('compta_day_entries').select('*').gte('date', from).lte('date', to),
    supabase.from('compta_week_entries').select('*').in('week_start', mondays.length ? mondays : ['1970-01-01']),
    // TOUTE la table, sans filtre de quinzaine : `overdue` et la couverture raisonnent sur
    // l'historique complet. Donc `fetchAll` obligatoire — PostgREST tronque à 1000 lignes EN
    // SILENCE (CLAUDE.md, guidelines-data-loading §2), et ~96 chatteurs × 24 quinzaines/an
    // franchissent le plafond en quelques mois. Tronquée, la table ferait redevenir `paid`
    // faux sur des quinzaines réglées (bouton « Marquer payé » de retour sur une ligne déjà
    // payée) et mentir les deux KPI monétaires. `.order('id')` = la PK complète de
    // `compta_payments` → pagination déterministe.
    fetchAll((f, t) => supabase.from('compta_payments').select('*').order('id').range(f, t)),
    supabase.from('police_entries').select('chatter_id, occurred_on, kind, error_key, amount_eur').gte('occurred_on', from).lte('occurred_on', to),
    supabase.from('creators').select('id, name'),
    // Date d'entrée de chaque chatteur MyPuls (`min(chatter_daily.date)`) — elle borne les
    // quinzaines qui le concernent (retard ET prime). Client ADMIN et non RLS : la fonction
    // est `security invoker` et `chatter_daily` ne porte qu'une policy
    // `chatter_daily_admin_read` (vérifié sur `pg_policy`, UAT) → appelée par un manager elle
    // renverrait ZÉRO ligne, et le bandeau comme la prime disparaîtraient de sa vue sans une
    // seule erreur. Aucune donnée brute n'en ressort : seules les dates des membres déjà
    // renvoyés par la RLS `profiles` sont lues.
    createAdminClient().rpc('chatter_first_seen'),
  ])
  if (membersErr) throw new Error(membersErr.message)
  if (settingsErr) throw new Error(settingsErr.message)
  if (primesErr) throw new Error(primesErr.message)
  if (dayErr) throw new Error(dayErr.message)
  if (weekErr) throw new Error(weekErr.message)
  if (payErr) throw new Error(payErr.message)
  if (sancErr) throw new Error(sancErr.message)
  if (creatorsErr) throw new Error(creatorsErr.message)
  if (firstSeenErr) throw new Error(firstSeenErr.message)

  // CA par (chatteur MyPuls, modèle) sur la quinzaine. `fetchAll` : table de faits journaliers,
  // troncature SILENCIEUSE à 1000 lignes sinon (guidelines-data-loading §2).
  const linked = (members ?? []).map((m) => m.chatter_id).filter((v): v is string => v != null)
  const { data: ccd, error: ccdErr } = linked.length
    ? await fetchAll<CcdRow>((f, t) =>
        supabase
          .from('chatter_creator_daily')
          .select('chatter_id, creator_id, date, ca')
          .in('chatter_id', linked)
          .gte('date', from)
          .lte('date', to)
          .order('chatter_id')
          .order('creator_id')
          .order('date')
          .range(f, t),
      )
    : { data: [], error: null }
  if (ccdErr) throw new Error(ccdErr.message)

  const creatorName = new Map((creators ?? []).map((c) => [c.id, c.name]))
  const caByChatter = new Map<string, Record<string, number>>()
  for (const r of ccd) {
    const m = caByChatter.get(r.chatter_id) ?? {}
    const name = creatorName.get(r.creator_id) ?? '—'
    m[name] = (m[name] ?? 0) + (r.ca ?? 0)
    caByChatter.set(r.chatter_id, m)
  }

  const settingsById = new Map((settings ?? []).map((s) => [s.chatter_id, s]))
  const primeById = new Map((primes ?? []).map((p) => [p.chatter_id, Number(p.amount)]))
  const daySet = new Set(days)

  // Jours couverts par membre, primes déjà versées, et « cette quinzaine le concerne-t-il ? » —
  // un seul regroupement sur `payments` (au lieu de le refiltrer pour chaque ligne). Le détail
  // et le POURQUOI de chaque sortie sont dans `coverage.ts`.
  const coverage = buildCoverage({ members: members ?? [], payments, firstSeen: firstSeen ?? [] })

  const rows: ComptaRow[] = (members ?? []).map((m) => {
    const s = settingsById.get(m.id)
    // Générique : une signature figée `(arr: { chatter_id: string }[])` écraserait le type
    // réel des lignes (bonus/malus/occurred_on/covered_days/…) au retour — chaque appelant
    // perdrait ses champs propres. `<T extends { chatter_id: string }>` les préserve.
    const mine = <T extends { chatter_id: string }>(arr: T[]) => arr.filter((x) => x.chatter_id === m.id)

    const de = mine(dayEntries ?? [])
    const we = mine(weekEntries ?? [])
    const bonus = de.reduce((t, d) => t + Number(d.bonus), 0) + we.reduce((t, w) => t + Number(w.bonus), 0)
    const malus = de.reduce((t, d) => t + Number(d.malus), 0) + we.reduce((t, w) => t + Number(w.malus), 0)
    const handoffs = de.reduce((t, d) => t + d.handoffs, 0) + we.reduce((t, w) => t + w.handoffs, 0)
    const fixeSetter = we.reduce((t, w) => t + Number(w.fixe_setter), 0)

    const sancRows: ComptaSanction[] = mine(sanctions ?? []).map((e) => ({
      day: e.occurred_on,
      label: e.error_key ? (ERROR_LABEL[e.error_key] ?? e.error_key) : null,
      amount: Number(e.amount_eur),
      kind: e.kind === 'warning' ? 'warning' : 'malus',
    }))

    // Couverture de CE membre (map précalculée ci-dessus) — sert à la prime. `myPayments`
    // (liste, pas set) reste nécessaire séparément pour `covered`/`paid`/`paidOn` plus bas,
    // qui ont besoin du `paid_at` PAR jour, pas juste de son appartenance à l'ensemble couvert.
    const myPayments = mine(payments)
    const myCoveredDays = coverage.daysByMember.get(m.id) ?? new Set<string>()
    // La prime ne s'affiche que sur la quinzaine ÉCHUE LA PLUS ANCIENNE non couverte DE CE
    // MEMBRE (spec §4). Sans le filtre ÉCHUE (`f.to < today`), la quinzaine en cours — jamais
    // encore couverte puisqu'elle n'est pas terminée — la déclencherait en permanence, même à
    // jour de paie. Sans le calcul PAR MEMBRE, le paiement d'un collègue masquerait la
    // quinzaine impayée d'un autre et déplacerait sa prime. Sans `concerns`, elle remontait
    // jusqu'aux quinzaines d'AVANT son embauche et s'affichait sur une période que personne
    // ne regarde, au lieu de la première réellement travaillée. `choices` est trié du plus
    // récent au plus ancien → filtré puis inversé, la première trouvée est la plus ancienne.
    const myOldestOpen = [...choices]
      .filter((f) => f.to < today && coverage.concerns(m.id, f))
      .reverse()
      .find((f) => daysIn(f).some((d) => !myCoveredDays.has(d)))
    // `!coverage.primePaid.has(...)` est la condition DÉCISIVE contre le double versement (cf.
    // `coverage.ts`) : un membre dont la prime est déjà partie ne peut plus la redéclencher,
    // quel que soit l'état de `compta_primes`.
    const primeApplies =
      !coverage.primePaid.has(m.id) &&
      myOldestOpen != null &&
      myOldestOpen.month === fortnight.month &&
      myOldestOpen.period === fortnight.period

    const modelCa = m.chatter_id ? (caByChatter.get(m.chatter_id) ?? {}) : {}
    const payslip = computePayslip({
      mode: s?.mode === 'fixed' ? 'fixed' : 'percent',
      rate: Number(s?.rate ?? 10),
      fixedAmount: Number(s?.fixed_amount ?? 0),
      isSetter: s?.is_setter ?? false,
      weekCount: mondays.length,
      modelCa,
      fixeSetter,
      bonus,
      malus,
      handoffs,
      primeDue: primeApplies ? (primeById.get(m.id) ?? 0) : 0,
      sanctions: sancRows.reduce((t, x) => t + x.amount, 0),
    })

    // Couverture : la quinzaine est payée si CHACUN de ses jours figure dans un `covered_days`.
    const covered = new Map<string, string>()
    for (const p of myPayments) {
      for (const d of (p.covered_days as string[] | null) ?? []) if (daySet.has(d)) covered.set(d, p.paid_at)
    }
    const paid = days.every((d) => covered.has(d))
    // `payments` couvre TOUTES les quinzaines (nécessaire à `overdue`) — restreindre à celle-ci.
    // Au PLURIEL : un règlement partiel puis son complément font deux lignes (spec §3 et §10),
    // que le trigger 0087 autorise tant que les jours ne se chevauchent pas. Prendre le premier
    // sous-déclarerait ce qui a été versé.
    const thisPayments = myPayments.filter(
      (p) => p.month === fortnight.month && p.period === fortnight.period,
    )

    return {
      id: m.id,
      name: m.display_name ?? m.email ?? '—',
      role: m.role,
      chatterId: m.chatter_id,
      mode: s?.mode === 'fixed' ? 'fixed' : 'percent',
      rate: Number(s?.rate ?? 10),
      fixedAmount: Number(s?.fixed_amount ?? 0),
      isSetter: s?.is_setter ?? false,
      handoffs,
      modelCa,
      sanctions: sancRows,
      weekEntries: Object.fromEntries(
        we.map((w) => [
          w.week_start,
          {
            bonus: Number(w.bonus),
            malus: Number(w.malus),
            handoffs: w.handoffs,
            fixeSetter: Number(w.fixe_setter),
            note: w.note,
          },
        ]),
      ),
      payslip,
      paid,
      // Le DERNIER versement, pas celui qui couvre le premier jour : réglée en deux fois, la
      // quinzaine n'est soldée qu'au complément. Les `paid_at` sont des `YYYY-MM-DD`, donc
      // l'ordre lexicographique est l'ordre chronologique.
      paidOn: paid ? ([...covered.values()].sort().at(-1) ?? null) : null,
      paidAmount: thisPayments.length
        ? thisPayments.reduce((s, p) => s + Number(p.amount), 0)
        : null,
    }
  })

  // Bandeau de retard — définition et pièges dans `coverage.ts`.
  const overdue = overdueFortnights({
    choices,
    today,
    current: fortnight,
    members: members ?? [],
    coverage,
  })

  // Même prédicat que `overdueFortnights` et que le garde de `payFortnight` — une seule
  // définition de « quinzaine échue » dans toute la feature.
  return { fortnight, fortnightElapsed: fortnight.to < today, choices, rows, overdue }
}
