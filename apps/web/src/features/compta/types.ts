import {
  round2,
  type PayMonth,
  type PayPeriod,
  type Payslip,
  type RateChange,
  type SetterScaleRow,
} from '@glagency/core'

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
  /**
   * HISTORIQUE du taux de commission de ce membre (`compta_rates`, 0093), trié par date d'effet.
   * Remplace le `rate: number` unique : le taux CHANGE à une date, et 12 chatteurs de la feuille
   * de juillet en changent au milieu d'une même période de paie.
   *
   * Le taux RÉELLEMENT appliqué à chaque jour de la période est dans `payslip.segments` — c'est
   * lui qui fait l'argent. Cet historique-ci sert à l'affichage : dire depuis quand le taux
   * courant s'applique, sans redemander la base. VIDE = jamais réglé (défaut 10 %).
   */
  rateHistory: RateChange[]
  /** Fixe de la PÉRIODE (`compta_settings.fixed_amount`) — il S'AJOUTE à la commission et
   *  s'applique dès qu'il est non nul. SEULE source du montant depuis la tâche 19 : il vaut
   *  donc `payslip.setter` (au centime près, la fiche arrondit). Gardé sur la ligne pour le
   *  formulaire de réglages et la colonne « Rémunération » de la table. */
  fixedAmount: number
  /** Prime « nouveau chatteur » enregistrée pour ce membre (`compta_primes`), null si aucune.
   *  `status` : `'due'` (à verser) | `'paid'` (versée, figée par `payPeriod`) | `'skipped'`
   *  (renoncée) — ce dernier est de l'HÉRITAGE depuis la tâche 20 : plus rien ne le produit
   *  (l'écran ne propose qu'un montant, `savePrime` écrit `'due'`), mais la contrainte de la
   *  colonne l'accepte toujours et d'anciennes lignes peuvent le porter. Porté ici pour le
   *  formulaire de réglages et la colonne « Prime » : le CALCUL, lui, ne retient que `'due'` et
   *  passe par `payslip.prime`. */
  prime: { amount: number; status: string; paidAt: string | null } | null
  handoffs: number
  /** Saisie de la PÉRIODE (`compta_period_entries`, 0090) — valeurs de départ du formulaire de
   *  la fiche. `carryover` est SIGNÉ (un trop-perçu se reporte en négatif), `top3Prime` non.
   *  Jamais `null` : une ligne absente vaut les défauts de ses colonnes, c'est-à-dire 0 et 0. */
  periodEntry: { carryover: number; top3Prime: number }
  /** Une prime DU MOIS a déjà été VERSÉE à ce membre pour le mois de la période affichée
   *  (instantané `compta_payments.monthly_prime_amount`, cf. `coverage.monthlyPrimePaid`). Le
   *  net l'exclut alors, même si `periodEntry.top3Prime` est renseignée : c'est le garde contre
   *  le double versement, et la fiche doit dire pourquoi la ligne a disparu. */
  monthlyPrimePaid: boolean
  /** Prime du mois saisie sur une AUTRE période du MÊME mois — au plus une (index unique 0092).
   *  Sert à prévenir AVANT la saisie plutôt qu'à refuser après. `null` = rien ailleurs. */
  monthlyPrimeElsewhere: { periodStart: string; periodLabel: string; amount: number } | null
  /** Rang du membre au classement setter de la période, ou `null` s'il n'a aucun handoff (donc
   *  aucune prime). Le MONTANT, lui, est dans `payslip.setterPrime` : il entre dans le net comme
   *  les autres composantes, et c'est lui qui est figé au paiement. */
  setterRank: { rank: number; handoffs: number } | null
  /** CA par modèle (nom du modèle → €), pour la ventilation de la fiche. */
  modelCa: Record<string, number>
  sanctions: ComptaSanction[]
  /** Saisies hebdo existantes, indexées par lundi — alimente le formulaire de saisie.
   *  `fixe_setter` n'y figure plus (tâche 19) : la colonne survit en base mais n'est ni lue,
   *  ni écrite, ni affichée. */
  weekEntries: Record<
    string,
    { bonus: number; malus: number; handoffs: number; note: string | null }
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

/** Une ligne de l'onglet CLASSEMENT — le TOP setter de la période. */
export interface SetterRankingRow {
  /** `profiles.id`. */
  id: string
  name: string
  handoffs: number
  /** Rang « compétition » AGENCE-WIDE : les ex æquo le partagent, le suivant saute d'autant. */
  rank: number
  /** Tranche du barème due à ce rang — 0 € au-delà du barème. Ex æquo : tranches mises en commun
   *  puis divisées (cf. `rankSetters`, spec §4). */
  amount: number
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
  /** Onglet CLASSEMENT — les membres visibles ayant au moins un handoff, par rang croissant. */
  setterRanking: SetterRankingRow[]
  /** Le barème du TOP15 (`compta_setter_scale`) — affiché sous le classement, éditable par
   *  l'admin seul (`canConfigure`). */
  setterScale: SetterScaleRow[]
}

/**
 * Une ligne du RÉCAP MENSUEL — le bloc de fin de mois de la feuille (`Total Mois`,
 * `Nbre de handoff-🤝 / Mois`, `PRIME TOP15 SETTER`, `PRIME TOP3 MOIS`).
 *
 * ⚠️ DEUX GRAINS COHABITENT ICI, et les confondre fausserait les chiffres :
 *  - `ca` et `handoffs` sont des agrégats du MOIS CIVIL (1er → dernier jour) — c'est la seule
 *    définition possible d'un total qu'on appelle « du mois » ;
 *  - `setterPrime` et `monthlyPrime` sont des montants de PÉRIODE, sommés sur les 2 ou 3
 *    périodes RATTACHÉES au mois (celles dont le lundi de départ y tombe).
 * Les deux ne couvrent donc pas exactement les mêmes jours, et l'écran le dit.
 */
export interface MoisRow {
  /** `profiles.id`. */
  id: string
  name: string
  /** CA du mois civil (`chatter_creator_daily`). `null` = membre non relié à MyPuls : aucun CA
   *  n'est calculable, et un 0 € le ferait passer pour non rémunérable (spec §7). */
  ca: number | null
  /** Handoffs du mois : saisies JOUR par leur date + saisies SEMAINE par le mois de leur LUNDI
   *  (une semaine n'est jamais découpée, cf. `mondaysOfMonth`). */
  handoffs: number
  /** Σ des primes du classement setter sur les périodes rattachées au mois. */
  setterPrime: number
  /** Prime du mois saisie (`top3_prime`) — au plus une par mois depuis l'index 0092. */
  monthlyPrime: number
  /** Libellé de la période qui la porte, `null` si aucune. Affiché avec le montant : sans lui,
   *  une prime mensuelle vue dans un tableau mensuel n'a pas de point de saisie identifiable. */
  monthlyPrimePeriod: string | null
}

export interface MoisData {
  /** Mois affiché — déduit de la période choisie (mois de son lundi de départ). */
  month: PayMonth
  /** Les 2 ou 3 périodes de paie rattachées à ce mois. */
  periods: PayPeriod[]
  /** Membres ayant une activité sur le mois (CA, handoff ou prime), CA décroissant. */
  rows: MoisRow[]
  /** Membres visibles SANS aucune activité sur le mois — comptés et annoncés plutôt que
   *  silencieusement absents (96 lignes de zéros ne se lisent pas). */
  idleCount: number
}

/** Une prime d'embauche ÉCHUE et NON VERSÉE — onglet Suivi (« SUIVI PRIMES NVX CHATTEURS »). */
export interface SuiviPrime {
  /** `profiles.id`. */
  memberId: string
  name: string
  /** Date d'arrivée = `min(chatter_daily.date)` (`chatter_first_seen()`). */
  firstSeen: string
  /** Échéance = arrivée + 1 mois (colonnes `Début` / `Fin 1er mois` de la feuille). */
  dueOn: string
  /** Montant enregistré dans `compta_primes`. **0 = rien ne sera versé** — l'écran doit le dire,
   *  pas l'afficher comme une prime de 0 €. */
  amount: number
  /** `true` si aucune ligne `compta_primes` n'existe pour ce membre : le montant n'a jamais été
   *  décidé. Distinct d'un montant volontairement mis à 0. */
  missing: boolean
}

/** Un solde de partant (`compta_debts`) — onglet Suivi, ADMIN seul (spec §6). */
export interface SuiviDebt {
  id: string
  name: string
  /** Modèle concerné, texte libre : une dette peut viser quelqu'un qui n'est plus chatteur. */
  model: string | null
  amount: number
  settled: boolean
  settledAt: string | null
}

export interface SuiviData {
  primes: SuiviPrime[]
  /** **Vide pour un non-admin** : `compta_debts` est admin-seul (RLS `compta_debts_admin_all`,
   *  0084), et l'écran masque la section entière plutôt que d'afficher une liste vide qui
   *  ferait croire qu'aucune dette n'existe. */
  debts: SuiviDebt[]
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
