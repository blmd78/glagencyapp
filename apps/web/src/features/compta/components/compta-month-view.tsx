import { frDayShort } from '@glagency/core'
import { eur2 } from '@/lib/format'
import { SECTION_HEAD, COL_HEAD } from './compta-payslip-calc'
import type { MoisData, MoisRow } from '../types'

/**
 * RÉCAP DU MOIS — le bloc de fin de mois de la feuille : `Total Mois`, `Nbre de handoff-🤝 /
 * Mois` et `PRIME TOP15 SETTER`, une ligne par chatteur. La colonne `PRIME TOP3 MOIS` a été
 * RETIRÉE le 2026-07-28 avec le concept (décision de Benoit).
 *
 * ── POURQUOI ICI, DANS L'ONGLET CLASSEMENT, ET PAS DANS UN QUATRIÈME ONGLET ──────────────────
 * Trois raisons, dans l'ordre où elles comptent :
 *  1. Deux des trois colonnes SONT le sujet de cet onglet — la prime setter est la conclusion du
 *     classement affiché juste dessous, et le barème qui la produit est au bas de la page.
 *  2. Il n'y a rien à choisir de plus : le mois se déduit de la période déjà sélectionnée (mois de
 *     son lundi de départ). Un onglet de plus aurait porté son propre sélecteur, donc une seconde
 *     notion de « mois d'une période ».
 *  3. Le propriétaire a demandé « simple et intuitif, pas plus chiant que le document » et a déjà
 *     trois onglets. Une section nommée coûte un titre, pas une navigation.
 *
 * Placé AVANT le classement, et c'est structurel : le classement et son barème forment une paire
 * (l'un se lit avec l'autre), s'intercaler entre eux les séparerait — et se poser après le barème
 * mettrait de la donnée sous un bloc de réglages.
 *
 * Server Component : aucune interactivité ici. Le sélecteur de période, lui, vit dans
 * `ComptaRankingView` (client), qui reçoit cette section en prop et l'affiche sous lui.
 *
 * ⚠️ DEUX GRAINS, ET L'ÉCRAN LE DIT. `CA` et `Handoffs` sont des totaux du MOIS CIVIL ; la
 * prime setter est un montant de PÉRIODE, sommé sur les 2 ou 3 périodes rattachées au mois. Les
 * jours couverts ne coïncident donc pas exactement, et taire cet écart ferait passer un chiffre
 * exact pour une erreur de calcul (`services/get-mois.ts`).
 */
export function ComptaMonthView({ data }: { data: MoisData }) {
  const totalCa = data.rows.reduce((s, r) => s + (r.ca ?? 0), 0)
  const totalHandoffs = data.rows.reduce((s, r) => s + r.handoffs, 0)
  const totalSetter = data.rows.reduce((s, r) => s + r.setterPrime, 0)

  return (
    <div className="flex flex-col gap-2">
      <span className={SECTION_HEAD}>Récap du mois — {data.month.label}</span>
      <p className="text-sm text-muted-foreground">
        CA et handoffs du mois civil, {frDayShort(data.month.start)} au{' '}
        {frDayShort(data.month.end)}. La prime setter, elle, se verse par période : c&apos;est
        celle des {data.periods.length} périodes rattachées à ce mois —{' '}
        {data.periods.map((p) => p.label).join(', ')}. La prime d&apos;embauche se suit dans
        l&apos;onglet Suivi.
      </p>

      {data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun CA, handoff ni prime sur {data.month.label} — rien à récapituler.
        </p>
      ) : (
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-6 gap-y-1.5 text-sm">
          <span className={COL_HEAD}>Chatteur</span>
          <span className={`${COL_HEAD} text-right`}>Total mois</span>
          <span className={`${COL_HEAD} text-right`}>Handoffs</span>
          <span className={`${COL_HEAD} text-right`}>Prime setter</span>

          {data.rows.map((r) => (
            <MonthLine key={r.id} row={r} />
          ))}

          <span className="border-t pt-1.5 font-medium">Total</span>
          <span className="border-t pt-1.5 text-right font-medium tabular-nums">{eur2(totalCa)}</span>
          <span className="border-t pt-1.5 text-right font-medium tabular-nums">{totalHandoffs}</span>
          <span className="border-t pt-1.5 text-right font-medium tabular-nums">{eur2(totalSetter)}</span>
        </div>
      )}

      {/* Les membres SANS activité sont comptés, pas effacés : ~96 lignes de zéros ne se lisent
          pas, mais une liste amputée en silence se lirait « il n'y a que ça ». */}
      {data.idleCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {data.idleCount} chatter{data.idleCount > 1 ? 's' : ''} sans CA, handoff ni prime sur{' '}
          {data.month.label} — non listé{data.idleCount > 1 ? 's' : ''}.
        </p>
      )}
    </div>
  )
}

/**
 * Une ligne du récap. Les zéros restent en gris plutôt que masqués : dans un tableau de totaux,
 * une cellule vide se lit « pas calculé » alors qu'un 0 € gris se lit « rien touché » — et c'est
 * cette seconde chose qui est vraie.
 */
function MonthLine({ row }: { row: MoisRow }) {
  const muted = 'text-right tabular-nums text-muted-foreground'
  return (
    <>
      <span className="min-w-0 truncate font-medium">{row.name}</span>
      {row.ca == null ? (
        // Jamais un 0 € : sans lien MyPuls le CA n'est pas CALCULABLE, il n'est pas nul. Un zéro
        // ferait passer le chatteur pour non rémunérable (spec §7).
        <span
          className="text-right text-xs text-amber-700 dark:text-amber-400"
          title="Membre non relié à MyPuls — aucun CA n’est calculable. Le lien se pose dans Membres."
        >
          non relié
        </span>
      ) : (
        <span className={row.ca === 0 ? muted : 'text-right tabular-nums'}>{eur2(row.ca)}</span>
      )}
      <span className={row.handoffs === 0 ? muted : 'text-right tabular-nums'}>{row.handoffs}</span>
      <span className={row.setterPrime === 0 ? muted : 'text-right tabular-nums'}>
        {eur2(row.setterPrime)}
      </span>
    </>
  )
}
