import { addMonthsSameDay, todayParis } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { SuiviData, SuiviDebt, SuiviPrime } from '../types'

/**
 * Onglet SUIVI — les deux listes que la feuille tient à part, et que la page de période ne peut
 * pas porter parce qu'elles ne dépendent d'AUCUNE période :
 *
 *  1. les PRIMES D'EMBAUCHE échues et non versées (onglet « SUIVI PRIMES NVX CHATTEURS » : 41 en
 *     attente sur ses 71 lignes) ;
 *  2. les SOLDES DES PARTANTS (`compta_debts`), admin seul.
 *
 * ── L'ÉCHÉANCE, ET POURQUOI ELLE NE SE DÉDUIT PAS D'UNE PÉRIODE ──────────────────────────────
 * Date d'arrivée = `chatter_first_seen()` (= `min(chatter_daily.date)`, la même source que le
 * bandeau de retard). Échéance = arrivée + 1 mois, au MÊME QUANTIÈME (`addMonthsSameDay`, et non
 * `addMonths` qui ramène au 1er : un arrivant du 28 juin serait devenu éligible le 1er juillet,
 * trois jours après son arrivée).
 *
 * ── CE QUI FAIT FOI POUR « DÉJÀ VERSÉE » ─────────────────────────────────────────────────────
 * `compta_payments.prime_amount > 0`, l'instantané figé — JAMAIS `compta_primes.status`. Le
 * `status` est une TRACE posée par un second aller-retour après l'insertion du paiement
 * (`record-payment.ts`), et ce second appel peut échouer : une prime réellement versée resterait
 * alors `'due'` et cette liste la réclamerait une seconde fois. Le paiement, lui, existe ou
 * n'existe pas. C'est la même règle, et le même raisonnement, que `coverage.primePaid`.
 *
 * ── LE MONTANT PEUT ÊTRE ABSENT, ET C'EST L'INFORMATION LA PLUS UTILE ────────────────────────
 * `compta_primes` n'a pas de ligne tant que l'admin n'a pas décidé un montant, et
 * `compta-rows.ts` ne compte la prime dans le net que si la ligne existe en `'due'`. Un membre
 * échu SANS ligne ne recevra donc RIEN, en silence. On le renvoie quand même (`missing: true`) :
 * c'est précisément la ligne sur laquelle l'admin doit agir. À l'inverse, une prime RENONCÉE
 * (`status = 'skipped'`) sort de la liste : rien n'est dû, même règle que le calcul.
 */
export async function getSuivi(): Promise<SuiviData> {
  const today = todayParis()
  const supabase = await createClient()
  const admin = createAdminClient()

  // `getProfile` est `cache()` : la page a déjà appelé `requireAccess('compta')` dans le même
  // rendu. Même patron que `getCompta` pour `loadLinkableChatters`.
  const isAdmin = (await getProfile())?.role === 'admin'

  // ⚠️ ANCRE DE SÉCURITÉ, comme dans `compta-sources.ts` : c'est CETTE lecture, sous RLS, qui
  // définit la population. Les lectures par client admin plus bas se cadrent toutes dessus.
  const [
    { data: members, error: membersErr },
    { data: primes, error: primesErr },
    { data: payments, error: payErr },
    { data: debts, error: debtsErr },
    { data: firstSeen, error: fsErr },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, email, chatter_id')
      .eq('role', 'chatteur')
      .order('display_name'),
    // `status` AUSSI : une prime `'skipped'` (renoncée) n'a rien à faire dans une liste
    // d'argent dû — elle est exclue plus bas, pas étiquetée.
    supabase.from('compta_primes').select('chatter_id, amount, status'),
    // TOUTE la table, sans filtre : « ce membre a-t-il DÉJÀ reçu une prime » se lit sur
    // l'historique complet. `fetchAll` obligatoire — PostgREST tronque à 1000 lignes EN SILENCE,
    // et ~96 chatteurs × 26 périodes/an franchissent le plafond en quelques mois. Tronquée, la
    // table ferait RÉAPPARAÎTRE dans cette liste des primes déjà versées : un double versement
    // proposé par l'écran lui-même.
    fetchAll<{ chatter_id: string; prime_amount: number }>((f, t) =>
      supabase.from('compta_payments').select('chatter_id, prime_amount').order('id').range(f, t),
    ),
    // `compta_debts` est ADMIN SEUL (RLS `compta_debts_admin_all`, 0084 — spec §6). Un manager y
    // lirait 0 ligne SANS ERREUR : on n'appelle donc pas du tout, et l'écran masque la section
    // plutôt que d'afficher une liste vide qui se lirait « aucune dette ».
    isAdmin
      ? supabase
          .from('compta_debts')
          .select('id, name, model, amount, settled, settled_at')
          .order('settled')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    // Date d'entrée : client ADMIN et non RLS, MÊME MOTIF que dans `compta-sources.ts` —
    // `chatter_first_seen()` est `security invoker` et `chatter_daily` ne porte qu'une policy
    // `chatter_daily_admin_read`. Appelée par un manager, elle rendrait ZÉRO ligne et l'onglet
    // Suivi serait vide pour lui, sans une seule erreur. Aucune donnée brute n'en ressort : on
    // n'y lit que les dates des membres déjà renvoyés par la RLS ci-dessus. Indépendante des
    // autres lectures → dans le même `Promise.all` (pas de waterfall).
    admin.rpc('chatter_first_seen'),
  ])
  if (membersErr) throw new Error(membersErr.message)
  if (primesErr) throw new Error(primesErr.message)
  if (payErr) throw new Error(payErr.message)
  if (debtsErr) throw new Error(debtsErr.message)
  if (fsErr) throw new Error(fsErr.message)

  const seenByChatter = new Map((firstSeen ?? []).map((r) => [r.chatter_id, r.first_seen]))
  const primeByMember = new Map(
    (primes ?? []).map((p) => [p.chatter_id, { amount: Number(p.amount), status: p.status }]),
  )
  const primePaid = new Set(payments.filter((p) => Number(p.prime_amount) > 0).map((p) => p.chatter_id))

  const suiviPrimes: SuiviPrime[] = (members ?? []).flatMap((m) => {
    // Sans lien MyPuls, aucune date d'arrivée : le membre n'entre pas dans cette liste. C'est la
    // conséquence assumée de l'early-return de la fiche (cf. `coverage.ts`) — l'application ne
    // peut de toute façon pas le payer, et la colonne « ⚠ non relié » de l'onglet Période est
    // l'endroit où ce cas se règle.
    const fs = m.chatter_id ? seenByChatter.get(m.chatter_id) : undefined
    if (fs == null) return []
    if (primePaid.has(m.id)) return []
    const prime = primeByMember.get(m.id)
    // Prime RENONCÉE (`status = 'skipped'`) : rien n'est dû, le membre sort de la liste — même
    // règle que le calcul (`compta-rows.ts`, seul `'due'` se verse). L'étiqueter « renoncée »
    // ici serait faux : cette liste est une liste d'argent à verser, pas un état des lieux.
    if (prime?.status === 'skipped') return []
    const dueOn = addMonthsSameDay(fs, 1)
    // ÉCHUE seulement : l'échéance est passée. `<=` et non `<` — le jour même compte, c'est le
    // premier jour où le mois d'essai est complet.
    if (dueOn > today) return []
    return [
      {
        memberId: m.id,
        name: m.display_name ?? m.email ?? '—',
        firstSeen: fs,
        dueOn,
        amount: prime?.amount ?? 0,
        missing: prime == null,
      },
    ]
  })

  // La plus ancienne échéance d'abord : c'est l'ordre du retard, celui dans lequel on rattrape.
  suiviPrimes.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.name.localeCompare(b.name, 'fr'))

  const suiviDebts: SuiviDebt[] = (debts ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    model: d.model,
    amount: Number(d.amount),
    settled: d.settled,
    settledAt: d.settled_at,
  }))

  return { primes: suiviPrimes, debts: suiviDebts }
}
