'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import type { PayPeriod, SetterScaleRow } from '@glagency/core'
import { Combobox } from '@/components/ui/combobox'
import { eur2 } from '@/lib/format'
import { ComptaScaleForm } from './compta-scale-form'
import { SECTION_HEAD, COL_HEAD } from './compta-payslip-calc'
import type { SetterRankingRow } from '../types'

/**
 * Onglet CLASSEMENT — le TOP setter de la période (`CLASSEMENT SETTER` de la feuille) : rang,
 * nom, handoffs, prime. Plus le BARÈME, éditable par l'admin seul.
 *
 * ── CE QUE LE RANG SIGNIFIE, ET POURQUOI IL PEUT SAUTER ──────────────────────────────────────
 * Le classement est calculé sur TOUTE L'AGENCE (`services/setter-ranking.ts`) — c'est le sens
 * même d'un TOP 15, et le classer sur le seul périmètre d'un encadrant lui aurait affiché des
 * primes de rang 1 pour ses 15 rattachés. Mais la LISTE, elle, est cloisonnée comme le reste :
 * un manager ne voit que ses rattachés, avec leur rang réel. Sa numérotation a donc des trous
 * (1, 5, 9…). C'est voulu, et l'écran le dit — un rang renuméroté de 1 à N par périmètre ne
 * correspondrait à aucune prime.
 *
 * Un membre à 0 handoff n'apparaît pas : `rankSetters` ne le classe pas (il toucherait sinon la
 * 15e tranche pour n'avoir rien fait dès que la population est courte).
 *
 * ⚠️ LE COMPTAGE QUI FAIT FOI N'EST PAS TRANCHÉ (spec §4) : l'onglet CLASSEMENT SETTER de la
 * feuille et les handoffs de la compta divergent (Godgive : 86 contre 111 en juin). On classe
 * sur les handoffs SAISIS DANS L'APP, et l'écran le dit plutôt que de le masquer.
 *
 * Le sélecteur de période est le MÊME contrat que celui de l'onglet Période (`?debut=`,
 * `router.replace` sans `scroll`) : les deux onglets décrivent la même quinzaine, et `ComptaTabs`
 * préserve le paramètre en basculant.
 */
export function ComptaRankingView({
  ranking,
  scale,
  period,
  choices,
  canConfigure,
}: {
  ranking: SetterRankingRow[]
  scale: SetterScaleRow[]
  period: PayPeriod
  choices: PayPeriod[]
  /** ADMIN seul — droit de RÉGLAGE, distinct de `canPay` (verser) et de `canEnter` (saisir).
   *  Ne monte que l'édition du barème ; la RLS `compta_setter_scale_admin_write` (0090) et
   *  `adminGuard` restent le verrou réel. */
  canConfigure: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const select = (debut: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('debut', debut)
    startTransition(() => router.replace(`/chatter/compta?${params.toString()}` as Route, { scroll: false }))
  }

  const total = ranking.reduce((s, r) => s + r.amount, 0)

  return (
    <div className={pending ? 'flex flex-col gap-6 opacity-60' : 'flex flex-col gap-6'}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Classement sur les handoffs saisis dans l&apos;app, toute l&apos;agence — le rang peut
          sauter des numéros si tu ne vois qu&apos;une partie des chatters.
        </p>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Période :</span>
          <Combobox
            value={period.start}
            onChange={select}
            disabled={pending}
            className="w-72"
            searchPlaceholder="Rechercher une période…"
            options={choices.map((p) => ({ value: p.start, label: p.label }))}
          />
        </div>
      </div>

      {ranking.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun handoff saisi sur cette période — personne n&apos;est classé, et aucune prime
          setter n&apos;entre dans les fiches.
        </p>
      ) : (
        <div className="grid grid-cols-[3rem_1fr_auto_auto] items-center gap-x-6 gap-y-1.5 text-sm">
          <span className={COL_HEAD}>Rang</span>
          <span className={COL_HEAD}>Chatteur</span>
          <span className={`${COL_HEAD} text-right`}>Handoffs</span>
          <span className={`${COL_HEAD} text-right`}>Prime</span>

          {ranking.map((r) => (
            <RankingLine key={r.id} row={r} />
          ))}

          <span className="border-t pt-1.5 font-medium" />
          <span className="border-t pt-1.5 font-medium">Total</span>
          <span className="border-t pt-1.5 text-right font-medium tabular-nums">
            {ranking.reduce((s, r) => s + r.handoffs, 0)}
          </span>
          <span className="border-t pt-1.5 text-right font-medium tabular-nums">{eur2(total)}</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className={SECTION_HEAD}>Barème du TOP setter</span>
        <ComptaScaleForm scale={scale} canConfigure={canConfigure} />
      </div>
    </div>
  )
}

/**
 * Une ligne du classement. Le montant est celui que la fiche du chatteur porte déjà en
 * « Prime setter » — jamais un second calcul côté client : `rankSetters` est la seule
 * implémentation, et c'est elle qui est figée au paiement (`setter_prime_amount`, 0091).
 *
 * `0 €` reste affiché en gris plutôt que masqué : au-delà de la dernière tranche du barème, être
 * classé sans rien toucher est un RÉSULTAT, et le voir explique pourquoi la fiche n'a pas de
 * ligne « Prime setter ».
 */
function RankingLine({ row }: { row: SetterRankingRow }) {
  return (
    <>
      <span className="tabular-nums text-muted-foreground">{row.rank}</span>
      <span className="min-w-0 truncate font-medium">{row.name}</span>
      <span className="text-right tabular-nums">{row.handoffs}</span>
      <span
        className={row.amount === 0 ? 'text-right tabular-nums text-muted-foreground' : 'text-right tabular-nums'}
      >
        {eur2(row.amount)}
      </span>
    </>
  )
}
