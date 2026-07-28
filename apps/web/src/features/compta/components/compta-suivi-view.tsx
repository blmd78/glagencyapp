'use client'

import { frDateNumeric } from '@glagency/core'
import { eur2 } from '@/lib/format'
import { ComptaDebtList } from './compta-debt-list'
import { SECTION_HEAD, COL_HEAD } from './compta-payslip-calc'
import type { SuiviData, SuiviPrime } from '../types'

/**
 * Onglet SUIVI — les deux listes que la feuille tient à part, parce qu'elles ne dépendent
 * d'AUCUNE période : les primes d'embauche à verser (« SUIVI PRIMES NVX CHATTEURS », 41 en
 * attente sur ses 71 lignes) et les soldes des partants (« COMPTA CHATTEURS OFF ⛔ »).
 *
 * Pas de sélecteur de période, et c'est le point : une prime échue le reste jusqu'à ce qu'elle
 * soit versée, quelle que soit la quinzaine qu'on regarde à côté.
 */
export function ComptaSuiviView({
  data,
  canConfigure,
}: {
  data: SuiviData
  /** ADMIN seul — les soldes des partants sont admin-only (RLS `compta_debts_admin_all`, 0084 ;
   *  spec §6). Un non-admin ne reçoit AUCUNE ligne (`getSuivi` n'interroge même pas la table) :
   *  la section entière est masquée plutôt qu'affichée vide, ce qui se lirait « aucune dette ». */
  canConfigure: boolean
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className={SECTION_HEAD}>Primes d&apos;embauche à verser</span>
        <PrimeList primes={data.primes} />
      </div>

      {canConfigure && (
        <div className="flex flex-col gap-2">
          <span className={SECTION_HEAD}>Soldes des partants</span>
          <ComptaDebtList debts={data.debts} />
        </div>
      )}
    </div>
  )
}

/**
 * Les primes ÉCHUES et NON VERSÉES. Échéance = arrivée + 1 mois ; « non versée » se lit sur
 * l'instantané `compta_payments.prime_amount`, jamais sur `compta_primes.status` — ce dernier est
 * posé par un second aller-retour qui peut échouer, et une prime réellement versée y resterait
 * `'due'` (cf. `services/get-suivi.ts`).
 *
 * LA COLONNE MONTANT EST LA RAISON D'ÊTRE DE CETTE LISTE. Une prime n'entre dans le net que si
 * une ligne `compta_primes` existe avec un montant : un membre échu SANS montant ne recevra
 * RIEN, en silence. On l'affiche donc en toutes lettres au lieu d'un « 0,00 € » qui ressemble à
 * une décision. Le montant se règle dans Membres, onglet Compta de la fiche du chatteur.
 */
function PrimeList({ primes }: { primes: SuiviPrime[] }) {
  if (primes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune prime d&apos;embauche échue en attente — tout est à jour.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-6 gap-y-1.5 text-sm">
      <span className={COL_HEAD}>Chatteur</span>
      <span className={COL_HEAD}>Arrivée</span>
      <span className={COL_HEAD}>Éligible depuis</span>
      <span className={`${COL_HEAD} text-right`}>Montant</span>

      {primes.map((p) => (
        <PrimeLine key={p.memberId} prime={p} />
      ))}
    </div>
  )
}

function PrimeLine({ prime }: { prime: SuiviPrime }) {
  const nothingDue = prime.missing || prime.amount === 0
  return (
    <>
      <span className="min-w-0 truncate font-medium">{prime.name}</span>
      <span className="tabular-nums text-muted-foreground">{frDateNumeric(prime.firstSeen)}</span>
      <span className="tabular-nums">{frDateNumeric(prime.dueOn)}</span>
      {nothingDue ? (
        <span
          className="text-right text-xs text-amber-700 dark:text-amber-400"
          title={
            prime.missing
              ? 'Aucune ligne de prime pour ce membre — rien ne sera versé tant qu’un montant n’est pas réglé.'
              : 'Montant réglé à 0 € — rien ne sera versé.'
          }
        >
          {prime.missing ? 'aucun montant' : '0 € — rien à verser'}
        </span>
      ) : (
        <span className="text-right tabular-nums">{eur2(prime.amount)}</span>
      )}
    </>
  )
}
