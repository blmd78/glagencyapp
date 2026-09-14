import { eur, num } from '@/lib/format'
import type { LinkTotalsValues } from '../link-options'

/** Une valeur du bandeau : libellé au-dessus, chiffre en dessous, pastille à la couleur de sa série. */
function Total({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  )
}

/**
 * Les totaux d'une sélection sur la période — partagés par la modale et le mode Graphique, pour
 * que les deux chemins vers le même détail ne puissent pas afficher deux chiffres différents.
 *
 * Ils viennent des LIGNES du classement (`sumLinks`), pas d'une somme des points du graphe :
 * c'est l'agrégat déjà affiché dans le tableau, aucune divergence d'arrondi possible.
 */
export function LinkTotals({ totals }: { totals: LinkTotalsValues }) {
  return (
    <div className="flex flex-wrap gap-x-10 gap-y-3">
      <Total label="Revenus" value={eur(totals.revenueEur)} color="#8b5cf6" />
      <Total label="Subs" value={num(totals.conversions)} color="#22c55e" />
      <Total label="Clics" value={num(totals.clicks)} color="#0ea5e9" />
      <Total
        label="Par abonné"
        value={totals.ltv === null ? '—' : eur(totals.ltv)}
        color="var(--muted-foreground)"
      />
    </div>
  )
}
