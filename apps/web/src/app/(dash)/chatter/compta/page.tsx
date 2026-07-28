import { Suspense } from 'react'
import { requireAccess, hasWriteAccess } from '@/lib/auth'
import { getCompta } from '@/features/compta/services/get-compta'
import { getSuivi } from '@/features/compta/services/get-suivi'
import { ComptaTemplate } from '@/features/compta/ComptaTemplate'
import { ComptaClassementTemplate } from '@/features/compta/ComptaClassementTemplate'
import { ComptaSuiviTemplate } from '@/features/compta/ComptaSuiviTemplate'
import { ComptaSkeleton } from '@/features/compta/components/compta-skeleton'
import { ComptaTabs, type ComptaVue } from '@/features/compta/components/compta-tabs'
import { RowsSkeleton } from '@/components/skeletons/rows-skeleton'
import type { ComptaData, SuiviData } from '@/features/compta/types'

/**
 * Compta = paie des chatteurs, par PÉRIODE DE 14 JOURS calée sur les lundis (26 par an).
 * L'admin voit tout et exécute les virements ; manager et sous-manager gèrent les saisies de
 * LEURS rattachés (RLS 0085). Le chatteur n'a jamais la page.
 *
 * `?debut=` = le lundi de départ, seul identifiant d'une période depuis 0088 — il a remplacé
 * le couple `?month=` + `?period=` des quinzaines calendaires.
 *
 * `?vue=` = l'onglet (2026-07-28, lot final) : `periode` (défaut, absent de l'URL), `classement`
 * et `suivi`. Le découpage mental de la feuille de paie qu'on remplace, et RIEN de plus — aucune
 * page nouvelle dans la sidebar. Les deux paramètres se combinent : Période et Classement
 * décrivent la même quinzaine.
 *
 * UN SEUL ONGLET EST CHARGÉ à la fois, patron repris de `/chatter/planning` (`?vue=todo`) : on ne
 * construit même pas l'élément des autres. Sans ça, l'onglet Suivi ferait payer ses requêtes à
 * quiconque regarde une période — et une panne sur l'un ferait tomber toute la page au lieu du
 * seul onglet concerné. Période et Classement, eux, partagent le MÊME `getCompta` : le classement
 * et les fiches doivent sortir de la même exécution de `rankSetters`.
 */
export default async function ComptaPage({
  searchParams,
}: {
  searchParams: Promise<{ debut?: string; vue?: string }>
}) {
  const profile = await requireAccess('compta')
  const { debut, vue: vueParam } = await searchParams
  const vue: ComptaVue =
    vueParam === 'classement' ? 'classement' : vueParam === 'suivi' ? 'suivi' : 'periode'

  // TROIS droits distincts (spec §6) : le manager SAISIT, seul l'admin PAIE et RÈGLE.
  // `profile.role` ne vaut que 'admin' ou 'chatteur' — un manager y est mappé sur 'chatteur'
  // (lib/auth). Le tester ici priverait tout manager du formulaire.
  const canEnter = hasWriteAccess(profile, 'compta')
  const canPay = profile.role === 'admin'
  // Booléen SÉPARÉ de `canPay`, bien qu'ils dérivent aujourd'hui du même rôle : régler un taux et
  // exécuter un virement sont deux gestes différents, et les avoir confondus est exactement ce
  // qui avait produit le défaut `canEnter`/`canPay`. Le jour où l'un des deux s'ouvre à un autre
  // rôle, il n'y a qu'une ligne à changer.
  const canConfigure = profile.role === 'admin'

  // Kickoff SANS await : le h1 et la barre d'onglets s'affichent immédiatement, le contenu
  // streame dans son boundary quand la lecture répond (guidelines-standard-feature §2.2).
  const data = vue === 'suivi' ? null : getCompta({ debut })
  const suivi = vue === 'suivi' ? getSuivi() : null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Compta</h1>
      <ComptaTabs
        vue={vue}
        periode={
          data && vue === 'periode' ? (
            <Suspense fallback={<ComptaSkeleton />}>
              <PeriodeTab
                data={data}
                canEnter={canEnter}
                canPay={canPay}
                canConfigure={canConfigure}
              />
            </Suspense>
          ) : null
        }
        classement={
          data && vue === 'classement' ? (
            <Suspense fallback={<RowsSkeleton count={8} />}>
              <ClassementTab data={data} canConfigure={canConfigure} />
            </Suspense>
          ) : null
        }
        suivi={
          suivi ? (
            <Suspense fallback={<RowsSkeleton count={6} />}>
              <SuiviTab data={suivi} canConfigure={canConfigure} />
            </Suspense>
          ) : null
        }
      />
    </div>
  )
}

async function PeriodeTab({
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

async function ClassementTab({
  data,
  canConfigure,
}: {
  data: Promise<ComptaData>
  canConfigure: boolean
}) {
  return <ComptaClassementTemplate data={await data} canConfigure={canConfigure} />
}

async function SuiviTab({
  data,
  canConfigure,
}: {
  data: Promise<SuiviData>
  canConfigure: boolean
}) {
  return <ComptaSuiviTemplate data={await data} canConfigure={canConfigure} />
}
