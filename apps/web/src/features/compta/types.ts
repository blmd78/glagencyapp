import { round2, type PayPeriod, type Payslip } from '@glagency/core'

/** Une sanction Police rattachée à la période — affichée avec son motif. */
export interface ComptaSanction {
  day: string
  /** Libellé du motif (`POLICE_ERRORS`), ou null pour un malus libre. */
  label: string | null
  /** 0 € pour un avertissement. */
  amount: number
  kind: 'warning' | 'malus'
}

/** Une ligne de la pile : un chatteur sur la période affichée. */
export interface ComptaRow {
  /** `profiles.id` — la compta est clée sur les MEMBRES depuis 0085. */
  id: string
  name: string
  role: string
  /** `profiles.chatter_id` — null = non relié à MyPuls, donc aucun CA calculable. */
  chatterId: string | null
  mode: 'percent' | 'fixed'
  rate: number
  fixedAmount: number
  isSetter: boolean
  /** Prime « nouveau chatteur » enregistrée pour ce membre (`compta_primes`), null si aucune.
   *  `status` : `'due'` (à verser) | `'paid'` (versée, figée par `payPeriod`) | `'skipped'`
   *  (renoncée). Portée pour le formulaire de réglages : le CALCUL, lui, ne retient que `'due'`
   *  et passe par `payslip.prime`. */
  prime: { amount: number; status: string; paidAt: string | null } | null
  handoffs: number
  /** CA par modèle (nom du modèle → €), pour la ventilation de la fiche. */
  modelCa: Record<string, number>
  sanctions: ComptaSanction[]
  /** Saisies hebdo existantes, indexées par lundi — alimente le formulaire de saisie. */
  weekEntries: Record<
    string,
    { bonus: number; malus: number; handoffs: number; fixeSetter: number; note: string | null }
  >
  payslip: Payslip
  /** Tous les jours de la période sont couverts par un paiement. */
  paid: boolean
  /** AU MOINS UN jour de la période est déjà couvert par un paiement de ce membre — donc
   *  `paid` ⇒ `anyDayPaid`, jamais l'inverse. DISTINCT de `paid`, et c'est cette valeur-là qui
   *  dit si un paiement de la période ENTIÈRE peut encore passer : un règlement PARTIEL laisse
   *  `paid` à false alors que le trigger `compta_payment_no_overlap` (0087) refusera déjà de
   *  recouvrir les jours déjà réglés. Le paiement groupé s'en sert pour ne pas embarquer un
   *  chatteur dont l'échec est certain. */
  anyDayPaid: boolean
  paidOn: string | null
  /** Montant RÉELLEMENT versé (instantané `compta_payments.amount`), null si non payé. Distinct
   *  de `payslip.net`, qui est le recalcul du jour : c'est cette valeur-là qui fait foi. */
  paidAmount: number | null
}

export interface ComptaData {
  /** Période de paie affichée — 14 jours du lundi au dimanche (`@glagency/core`). */
  period: PayPeriod
  /** Période TERMINÉE (son dernier jour est révolu) — seul cas où le paiement est ouvert.
   *  Calculé côté serveur, comme le garde de `payPeriod` : un `todayParis()` évalué dans le
   *  composant client dépendrait de l'horloge du poste, alors que c'est le serveur qui tranche. */
  periodElapsed: boolean
  /** Périodes proposées au sélecteur, la plus récente d'abord. */
  choices: PayPeriod[]
  rows: ComptaRow[]
  /** Périodes ÉCHUES dont un jour n'est couvert par aucun paiement — pour un membre qu'elles
   *  CONCERNENT, c'est-à-dire déjà arrivé (`chatter_first_seen()`). Les membres non reliés à
   *  MyPuls en sont exclus : l'application ne peut pas les payer. */
  overdue: PayPeriod[]
  /** Chatteurs MyPuls encore LIBRES, options du dialog « Relier ». **Vide pour un non-admin** :
   *  poser le lien est admin-seul, et c'est une liste agence-wide hors périmètre RLS
   *  (`loadLinkableChatters`). */
  linkableChatters: { id: string; name: string }[]
}

/**
 * Répartition d'une période en vue du PAIEMENT GROUPÉ (`payAllForPeriod`) : qui part dans le
 * lot, qui en est écarté et pourquoi.
 *
 * ⚠️ UNE SEULE IMPLÉMENTATION, partagée par l'écran (bouton + dialog, qui ANNONCENT le lot) et
 * par l'action (qui l'EXÉCUTE). Deux définitions de « payable » divergeraient, et l'action
 * refuserait alors exactement le lot que l'écran vient d'annoncer — ou pire, en paierait un
 * autre. C'est le même principe que `loadComptaRows`, calcul unique du net.
 */
export interface BatchPayPlan {
  /** Les membres que le lot va régler, dans l'ordre d'affichage reçu. */
  payable: ComptaRow[]
  /** Σ des nets de `payable` — le montant ANNONCÉ, et celui qui sera versé. */
  total: number
  /** Écartés faute de `profiles.chatter_id` : sans lien MyPuls aucun CA n'est calculable, et
   *  `ComptaPayslip` leur fait déjà un early-return (ni fiche, ni bouton). */
  unlinked: number
  /** Écartés parce qu'un jour de la période leur est déjà couvert (réglés en tout ou partie). */
  covered: number
  /** Écartés à net nul : un virement de 0 € n'est pas un virement. */
  zero: number
  /** Écartés à net NÉGATIF — voir `planBatchPay`. */
  negative: number
}

/**
 * Construit le lot. Les quatre exclusions, dans cet ordre de priorité (un membre écarté ne
 * compte que dans le PREMIER motif qui s'applique) :
 *
 *  1. `anyDayPaid` — déjà réglé, en tout ou en partie. Le trigger 0087 refuserait l'insertion ;
 *     l'embarquer ne produirait qu'un échec certain de plus dans le compte-rendu.
 *  2. pas de `chatterId` — l'application ne sait pas calculer son CA (spec §7).
 *  3. net NÉGATIF — **exclu du lot, et c'est un choix**. Un net négatif n'est pas un virement :
 *     c'est le constat d'une dette (malus et sanctions dépassent les gains). L'enregistrer fige
 *     les jours couverts et solde la période sur un montant que PERSONNE ne recevra. Le
 *     paiement unitaire l'affiche derrière un avertissement dédié (`ComptaPayDialog`) : preuve
 *     que ce cas est fait pour être vu un par un. Il reste donc payable À L'UNITÉ depuis la
 *     fiche — rien n'est retiré, seul le geste de masse l'est.
 *  4. net NUL — rien à verser. Conséquence assumée : sa période restera « incomplètement
 *     couverte » dans le bandeau de retard tant qu'on ne l'aura pas réglée à l'unité.
 */
export function planBatchPay(rows: ComptaRow[]): BatchPayPlan {
  const payable: ComptaRow[] = []
  let unlinked = 0
  let covered = 0
  let zero = 0
  let negative = 0

  for (const r of rows) {
    if (r.anyDayPaid) covered++
    else if (r.chatterId == null) unlinked++
    else if (r.payslip.net < 0) negative++
    else if (r.payslip.net === 0) zero++
    else payable.push(r)
  }

  // `round2` : chaque net est déjà à 2 décimales, mais leur somme en flottant peut dériver
  // (0,1 + 0,2). Le total annoncé à l'écran et le total vérifié côté serveur doivent être LE
  // MÊME nombre — c'est lui que le contrôle de dérive de `payAllForPeriod` compare.
  return { payable, total: round2(payable.reduce((s, r) => s + r.payslip.net, 0)), unlinked, covered, zero, negative }
}

/** Compte-rendu d'un paiement groupé — porté par `ActionResult<PayAllSummary>`. Un échec par
 *  chatteur n'interrompt pas le lot : il atterrit ici, nommé et motivé. */
export interface PayAllSummary {
  /** Fiches RÉELLEMENT enregistrées. */
  paid: number
  /** Σ des nets enregistrés — pas le total annoncé, celui qui est PASSÉ. */
  total: number
  /** Les échecs, dans l'ordre d'affichage. `reason` est un message métier (« déjà payé »,
   *  droit refusé…) ou un générique si l'erreur était technique (auquel cas Sentry l'a). */
  failed: { name: string; reason: string }[]
}
