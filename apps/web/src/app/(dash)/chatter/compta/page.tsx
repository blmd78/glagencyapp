import { Suspense } from 'react'
import { requireAccess, hasWriteAccess } from '@/lib/auth'
import { getCompta } from '@/features/compta/services/get-compta'
import { ComptaTemplate } from '@/features/compta/ComptaTemplate'
import { ComptaSkeleton } from '@/features/compta/components/compta-skeleton'
import type { ComptaData } from '@/features/compta/types'

/**
 * Compta = paie des chatteurs, par PÉRIODE DE 14 JOURS calée sur les lundis (26 par an).
 * L'admin voit tout et exécute les virements ; manager et sous-manager gèrent les saisies de
 * LEURS rattachés (RLS 0085). Le chatteur n'a jamais la page.
 *
 * `?debut=` = le lundi de départ, seul identifiant d'une période depuis 0088 — il a remplacé
 * le couple `?month=` + `?period=` des quinzaines calendaires.
 */
export default async function ComptaPage({
  searchParams,
}: {
  searchParams: Promise<{ debut?: string }>
}) {
  const profile = await requireAccess('compta')
  const { debut } = await searchParams
  // Kickoff SANS await : le h1 s'affiche immédiatement, la pile de noms streame dans son
  // boundary quand la lecture répond (docs/guidelines-standard-feature.md §2.2).
  const data = getCompta({ debut })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Compta</h1>
      <Suspense fallback={<ComptaSkeleton />}>
        <ComptaContent
          data={data}
          // TROIS droits distincts (spec §6) : le manager SAISIT, seul l'admin PAIE et RÈGLE.
          // `profile.role` ne vaut que 'admin' ou 'chatteur' — un manager y est mappé sur
          // 'chatteur' (lib/auth). Le tester ici priverait tout manager du formulaire.
          canEnter={hasWriteAccess(profile, 'compta')}
          canPay={profile.role === 'admin'}
          // Booléen SÉPARÉ de `canPay`, bien qu'ils dérivent aujourd'hui du même rôle : régler
          // un taux et exécuter un virement sont deux gestes différents, et les avoir confondus
          // est exactement ce qui avait produit le défaut `canEnter`/`canPay`. Le jour où l'un
          // des deux s'ouvre à un autre rôle, il n'y a qu'une ligne à changer.
          canConfigure={profile.role === 'admin'}
        />
      </Suspense>
    </div>
  )
}

async function ComptaContent({
  data,
  canEnter,
  canPay,
  canConfigure,
}: {
  data: Promise<ComptaData>
  canEnter: boolean
  canPay: boolean
  canConfigure: boolean
}) {
  return (
    <ComptaTemplate
      data={await data}
      canEnter={canEnter}
      canPay={canPay}
      canConfigure={canConfigure}
    />
  )
}
