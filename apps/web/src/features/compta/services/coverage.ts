import { daysIn, monthOf, type PayPeriod } from '@glagency/core'

/**
 * Couverture des périodes : qui a été payé de quoi, qui était déjà arrivé, et quelles périodes
 * sont en retard. Extrait de `get-compta.ts` pour le tenir sous 300 lignes (CLAUDE.md) — c'est
 * un bloc cohérent : les trois sorties dérivent des MÊMES paiements et servent les mêmes
 * décisions (prime, bandeau de retard, ligne « payé »).
 */

/** Sous-ensemble des colonnes de `compta_payments` dont la couverture a besoin. */
interface PaymentLike {
  chatter_id: string
  covered_days: string[] | null
  prime_amount: number
  /** Lundi de départ de la période payée (0088) — il donne le MOIS du paiement. */
  period_start: string
  /** Prime du mois FIGÉE au virement (0091). */
  monthly_prime_amount: number
}

/** Sous-ensemble de `profiles` : l'id du membre et son lien MyPuls. */
interface MemberLike {
  id: string
  chatter_id: string | null
}

export interface Coverage {
  /** Jours couverts PAR MEMBRE, tous paiements et toutes périodes confondus. */
  daysByMember: Map<string, Set<string>>
  /** Membres dont une prime est DÉJÀ partie. */
  primePaid: Set<string>
  /**
   * Mois (clé « 2026-07 ») pour lesquels une PRIME DU MOIS a déjà été versée, par membre.
   *
   * MÊME RÔLE ET MÊME SOURCE DE VÉRITÉ QUE `primePaid` : l'instantané figé au virement
   * (`compta_payments.monthly_prime_amount`), jamais la saisie. C'est le garde qui ferme le trou
   * que l'index unique de 0092 ne peut pas fermer — payer la période 1 de juillet, remettre sa
   * saisie à 0, puis saisir la prime sur la période 2 du même mois. La saisie a bougé, le
   * paiement non : lui existe ou n'existe pas.
   *
   * Le mois d'un paiement est celui de sa `period_start` (règle `monthOfPeriod`), donc le même
   * que celui sous lequel la prime a été saisie — les deux bords ne peuvent pas diverger.
   */
  monthlyPrimePaid: Map<string, Set<string>>
  /** La période concerne-t-elle ce membre ? (cf. `buildCoverage`) */
  concerns: (memberId: string, p: PayPeriod) => boolean
}

/**
 * Construit la couverture. Un SEUL regroupement sur `payments` alimente les trois sorties, au
 * lieu de refiltrer la liste pour chaque ligne affichée.
 *
 * `daysByMember` est bien PAR MEMBRE et jamais un total fusionné tous chatteurs confondus :
 * un seul chatteur payé masquerait sinon la période impayée de tous les autres.
 *
 * `primePaid` a pour source de vérité UNIQUE l'instantané `compta_payments.prime_amount`, figé
 * au virement (spec §5.3). `compta_primes.status` ne peut pas l'être : l'insert du paiement et
 * son passage à `'paid'` sont deux allers-retours sans transaction, donc le second peut échouer
 * en laissant la prime `'due'` — au rechargement, la période ouverte la plus ancienne
 * glisserait sur la suivante et la prime serait versée une SECONDE fois. Le paiement, lui,
 * existe ou n'existe pas.
 *
 * `concerns(membre, p)` = `p` se termine à ou après l'entrée du membre (`chatter_first_seen()`,
 * clée sur le `chatter_id` MyPuls — la jointure passe donc par `profiles.chatter_id`, jamais
 * par `profiles.id`). `p.end >= first_seen` et non `p.start >= first_seen` : une période à
 * cheval sur l'arrivée a été partiellement travaillée, elle est donc due ; seule celle qui se
 * TERMINE avant l'arrivée ne le concerne pas.
 *
 * Sans date d'entrée → AUCUNE période. Deux populations :
 *  - le membre sans `profiles.chatter_id` : `ComptaPayslip` lui fait un early-return (ni fiche,
 *    ni bouton), donc l'application ne peut JAMAIS le payer, donc ses jours ne seront jamais
 *    couverts et il qualifierait toute période échue à perpétuité. Son exclusion est une
 *    conséquence ASSUMÉE de cet early-return, pas un oubli (8 profils sur 96 sur l'UAT ; la
 *    spec §7 en annonce 30 sur 102 en prod) ;
 *  - le membre relié mais sans aucun jour dans `chatter_daily` : jamais actif, donc rien à lui
 *    réclamer — il entrera dans le calcul dès son premier jour de CA.
 */
export function buildCoverage({
  members,
  payments,
  firstSeen,
}: {
  members: MemberLike[]
  payments: PaymentLike[]
  firstSeen: { chatter_id: string; first_seen: string }[]
}): Coverage {
  const daysByMember = new Map<string, Set<string>>()
  for (const p of payments) {
    const set = daysByMember.get(p.chatter_id) ?? new Set<string>()
    for (const d of p.covered_days ?? []) set.add(d)
    daysByMember.set(p.chatter_id, set)
  }

  const primePaid = new Set(
    payments.filter((p) => Number(p.prime_amount) > 0).map((p) => p.chatter_id),
  )

  // Un SET DE MOIS par membre, et non un simple `Set<memberId>` comme `primePaid` : la prime
  // d'embauche est versée UNE FOIS DANS UNE VIE, la prime du mois une fois PAR MOIS. La confondre
  // avec la première interdirait toute prime du mois après la première versée.
  const monthlyPrimePaid = new Map<string, Set<string>>()
  for (const p of payments) {
    if (Number(p.monthly_prime_amount) <= 0) continue
    const months = monthlyPrimePaid.get(p.chatter_id) ?? new Set<string>()
    months.add(monthOf(p.period_start).key)
    monthlyPrimePaid.set(p.chatter_id, months)
  }

  const byChatter = new Map(firstSeen.map((r) => [r.chatter_id, r.first_seen]))
  const byMember = new Map<string, string>()
  for (const m of members) {
    const fs = m.chatter_id ? byChatter.get(m.chatter_id) : undefined
    if (fs != null) byMember.set(m.id, fs)
  }

  const concerns = (memberId: string, p: PayPeriod) => {
    const fs = byMember.get(memberId)
    return fs != null && p.end >= fs
  }

  return { daysByMember, primePaid, monthlyPrimePaid, concerns }
}

/**
 * Périodes ÉCHUES incomplètement couvertes — le retard se déduit de la couverture, pas d'une
 * échéance théorique (spec §7). « Incomplètement couverte » = il existe AU MOINS UN membre que
 * la période CONCERNE dont un jour n'est couvert par AUCUN de SES paiements.
 *
 * Sans le filtre `concerns`, deux populations allumaient le bandeau en permanence : les membres
 * non reliés à MyPuls, que l'application ne peut pas payer, et les nouveaux, dont les périodes
 * d'avant l'embauche ne seront jamais couvertes. Le bandeau affichait son plafond de 6 en
 * continu et ne signalait donc plus rien.
 *
 * La période AFFICHÉE est exclue : elle est déjà sous les yeux, ligne par ligne. Elle s'identifie
 * par son seul `start` — le lundi de départ EST la clé d'une période (0088).
 */
export function overduePeriods({
  choices,
  today,
  current,
  members,
  coverage,
  max = 6,
}: {
  choices: PayPeriod[]
  today: string
  current: PayPeriod
  members: { id: string }[]
  coverage: Coverage
  max?: number
}): PayPeriod[] {
  return choices
    .filter((p) => p.end < today && p.start !== current.start)
    .filter((p) => {
      const pDays = daysIn(p)
      return members.some((m) => {
        if (!coverage.concerns(m.id, p)) return false
        const covered = coverage.daysByMember.get(m.id) ?? new Set<string>()
        return pDays.some((d) => !covered.has(d))
      })
    })
    .slice(0, max)
}
