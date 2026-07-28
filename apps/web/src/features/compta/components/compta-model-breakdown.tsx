'use client'

import { Fragment } from 'react'
import { DEFAULT_RATE, frDayLong, type PayslipSegment } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { eur2 } from '@/lib/format'
import { modelColor } from '@/lib/model-color'
import { COL_HEAD } from './compta-payslip-calc'
import type { ComptaRow } from '../types'

/** « du 6 au 12 juillet » — les bornes d'un segment de taux, comme la feuille nomme ses blocs. */
const spanLabel = (s: PayslipSegment) =>
  s.from === s.to ? `le ${frDayLong(s.from)}` : `du ${frDayLong(s.from)} au ${frDayLong(s.to)}`

/**
 * Ventilation du CA par modèle — UNE LIGNE PAR MODÈLE, avec la commission prise sur ce modèle
 * (demande du propriétaire, 2026-07-27, en remplacement de la rangée de badges « Modèle · CA »).
 *
 * Elle n'invente aucun calcul : `computePayslip` produit DÉJÀ chaque ligne, arrondie
 * (`payslip.segments[].models[]`, `packages/core/src/compta/payslip.ts`) — cet écran ne fait
 * qu'exposer ce qui se calculait sans être montré. Depuis la tâche 27, il ne refait même plus
 * le `round2(ca × taux)` : ce serait une seconde implémentation, exactement ce que la feature a
 * banni côté net.
 *
 * ⚠️ LES LIGNES DOIVENT FAIRE LE TOTAL. C'est ce qui a fait passer `computePayslip` à un
 * arrondi PAR MODÈLE (`Σ round2(ca × taux)` et non `round2(Σ ca × taux)`) le 2026-07-27 : sinon
 * les commissions affichées s'écartaient du total d'un ou deux centimes. Corollaire : le total
 * affiché ici est `payslip.base` LUI-MÊME, jamais une somme refaite côté client — deux calculs
 * finiraient par diverger.
 *
 * Le total de CA est `payslip.ca` pour la même raison. `chatter_creator_daily.ca` est un
 * `numeric(12,2)` (vérifié sur information_schema, UAT, 0 ligne à plus de 2 décimales), donc les
 * CA par modèle sont exacts au centime et leurs lignes somment exactement au total.
 *
 * ── DEUX FORMES, ET UNE SEULE GRILLE (tâche 27) ────────────────────────────────────────────
 * Le taux étant DATÉ, une période peut en porter plusieurs.
 *
 *  - UN SEUL TAUX (le cas courant) : rendu STRICTEMENT INCHANGÉ — en-tête « Commission (10 %) »,
 *    les lignes, le total. C'est 83 des 95 fiches de la feuille de juillet ; leur écran ne
 *    bouge pas d'un pixel.
 *  - PLUSIEURS TAUX : un bloc par segment, dans l'ordre, chacun titré par ses dates et son taux
 *    (« du 6 au 12 juillet — 10 % ») avec son sous-total, puis le total général. C'est la forme
 *    de la feuille du propriétaire, qui aligne S1 à 10 % et S2 à 11 % : le grain est celui
 *    qu'il lit déjà. L'en-tête de colonne redevient « Commission » tout court — un taux unique
 *    y serait FAUX, et c'est précisément le défaut que cette tâche corrige.
 *
 * MÊME grille dans les deux cas (`grid-cols-[1fr_auto_auto]`), les titres de segment prenant
 * les 3 colonnes : les montants restent alignés d'un bloc à l'autre, et aucun style n'est
 * introduit — `COL_HEAD` et `border-t` existaient déjà ici.
 */
export function ComptaModelBreakdown({ payslip }: { payslip: ComptaRow['payslip'] }) {
  const total = 'border-t pt-1.5 font-medium'
  const segments = payslip.segments
  const multi = segments.length > 1
  const seul = segments[0]

  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1.5 text-sm">
      <span className={COL_HEAD}>Modèle</span>
      <span className={`${COL_HEAD} text-right`}>CA</span>
      <span className={`${COL_HEAD} text-right`}>
        {multi ? 'Commission' : `Commission (${seul?.rate} %)`}
      </span>

      {segments.map((s) => (
        <Fragment key={s.from}>
          {multi && (
            <span className="col-span-3 pt-1 text-xs text-muted-foreground">
              {spanLabel(s)} — {s.rate} %{s.fallback && ' (taux par défaut, jamais réglé)'}
            </span>
          )}
          {s.models.map((mo) => (
            <Fragment key={`${s.from}-${mo.name}`}>
              <span className="min-w-0">
                {/* Badge coloré conservé : c'est l'identification visuelle des modèles partout
                    ailleurs dans l'app (`modelColor`), aucun style nouveau introduit ici. */}
                <Badge className={modelColor(mo.name)}>{mo.name}</Badge>
              </span>
              <span className="text-right tabular-nums">{eur2(mo.ca)}</span>
              <span className="text-right tabular-nums">{eur2(mo.commission)}</span>
            </Fragment>
          ))}
          {/* Sous-total du segment — seulement quand il y en a plusieurs : avec un seul, il
              ferait doublon avec le total juste en dessous, aux mêmes nombres. */}
          {multi && (
            <>
              <span className="border-t pt-1.5 text-xs text-muted-foreground">Sous-total</span>
              <span className="border-t pt-1.5 text-right tabular-nums">{eur2(s.ca)}</span>
              <span className="border-t pt-1.5 text-right tabular-nums">{eur2(s.commission)}</span>
            </>
          )}
        </Fragment>
      ))}

      <span className={total}>Total</span>
      <span className={`${total} text-right tabular-nums`}>{eur2(payslip.ca)}</span>
      <span className={`${total} text-right tabular-nums`}>{eur2(payslip.base)}</span>

      {/* UN TAUX QUE PERSONNE N'A CHOISI, DIT À VOIX HAUTE. En multi-segment la mention est déjà
          dans le titre du bloc ; ici c'est le cas d'un membre jamais réglé, à qui l'app applique
          le défaut de 10 % — silencieusement jusqu'à la tâche 27. Sur de la paie, un taux
          implicite est un piège : il se règle dans Membres, onglet Compta. */}
      {!multi && seul?.fallback && (
        <span className="col-span-3 text-xs text-amber-700 dark:text-amber-400">
          Taux jamais réglé pour ce membre — le défaut de {DEFAULT_RATE} % s&apos;applique.
        </span>
      )}
    </div>
  )
}

