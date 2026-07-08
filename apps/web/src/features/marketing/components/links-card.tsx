import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { modelColor } from '@/lib/model-color'
import { eur, num } from '@/lib/format'
import type { MktLinkRow } from '../types'

/**
 * Liens de tracking d'UN canal (section des onglets Instagram / Twitter / Telegram) :
 * liste compacte triée par revenus — la table complète (tri, filtre, édition du type)
 * reste sur la page Liens.
 */
export function LinksCard({ links, period }: { links: MktLinkRow[]; period: string }) {
  const shown = links.filter((l) => l.active || l.clicks > 0 || l.revenueEur > 0)
  const totals = {
    clicks: shown.reduce((s, l) => s + l.clicks, 0),
    conversions: shown.reduce((s, l) => s + l.conversions, 0),
    revenueEur: Math.round(shown.reduce((s, l) => s + l.revenueEur, 0) * 100) / 100,
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Liens de tracking</CardTitle>
        <CardDescription>
          {period} · {num(totals.clicks)} clics · {num(totals.conversions)} subs ·{' '}
          {eur(totals.revenueEur)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 text-sm">
        {shown.length === 0 && (
          <p className="text-muted-foreground">Aucun lien de ce canal.</p>
        )}
        {shown.map((l) => (
          <div key={l.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
            {l.creator && <Badge className={modelColor(l.creator)}>{l.creator}</Badge>}
            <span className="w-20 text-right tabular-nums text-muted-foreground">
              {num(l.clicks)} clics
            </span>
            <span className="w-20 text-right tabular-nums text-muted-foreground">
              {num(l.conversions)} subs
            </span>
            <span className="w-20 text-right font-medium tabular-nums">{eur(l.revenueEur)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
