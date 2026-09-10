import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { KpiGrid } from '@/components/kpi-card'
import { modelColor } from '@/lib/model-color'
import { conv, eur, num, pct } from '@/lib/format'
import { MktDailyChart } from './components/mkt-daily-chart'
import { typeBadge } from '@/lib/type-badge'
import type { MktDashboardData } from './types'

/**
 * Dashboard marketing : KPIs de la période, revenus/jour, top liens, poids par créatrice.
 *
 * « Dépenses période » et « Bénéfice net » ont été RETIRÉS le 2026-09-08 (décision Benoit).
 * Ils dérivaient de `mkt_staff`, qui ne contient qu'un VA à 100 € de fixe et aucun lien
 * assigné : les dépenses valaient ~1 % des revenus et le « net » recopiait le KPI Revenus à
 * 100 € près. Les deux écrans qui les alimentaient (VA, Compta) sont par ailleurs sortis de
 * la sidebar. Restaurer = remettre les deux entrées ci-dessous et repasser `expenses` depuis
 * `getMktStaff` dans page.tsx.
 */
export function MktDashboardTemplate({ data }: { data: MktDashboardData }) {
  // Plus d'`accent` par KPI : KpiGrid applique la séquence de couleurs partagée.
  const base = { deltaPct: null as number | null, trendLabel: '', hint: '' }
  const kpis = [
    // Pas de badge « vs période précédente » : avec 5 semaines d'historique et une
    // journée en cours partielle, ce % induisait en erreur — à réactiver plus tard.
    {
      ...base,
      key: 'rev',
      label: 'Revenus période',
      value: eur(data.totals.revenueEur),
      hint: 'PPV inclus (= revenus MyPuls)',
      info: 'Somme des revenus quotidiens de TOUS les liens de tracking sur la période. Source : MyPuls (tracking-stats, série journalière), collecté chaque nuit et vérifié contre leurs cumuls.',
    },
    {
      ...base,
      key: 'conv',
      label: 'Abonnés (conv.)',
      value: num(data.totals.conversions),
      hint: 'clics devenus abonnés',
      info: 'Somme des conversions des liens sur la période — la colonne « Abonnés (Conv.) » de MyPuls : un clic qui a fini en abonnement.',
    },
    {
      ...base,
      key: 'clicks',
      label: 'Clics liens',
      value: num(data.totals.clicks),
      info: 'Somme des clics quotidiens de tous les liens de tracking sur la période (source MyPuls).',
    },
    {
      ...base,
      key: 'ltv',
      label: 'LTV',
      value: data.totals.ltv === null ? '—' : eur(data.totals.ltv),
      hint: 'revenus ÷ abonnés des liens',
      info: "Revenus des liens de tracking ÷ abonnés qu'ils ont amenés, sur la période. Ce que rapporte un abonné venu du marketing — à ne pas confondre avec la LTV d'une modèle, qui rapporte TOUT son CA à TOUS ses nouveaux abonnés (page Modèles).",
    },
    {
      ...base,
      key: 'taux',
      label: 'Taux de conversion',
      value:
        data.totals.clicks > 0 ? pct(conv(data.totals.conversions, data.totals.clicks)) : '—',
      hint: 'subs ÷ clics, tous liens',
      info: 'Abonnés ÷ clics sur la période, tous liens confondus — calculé chez nous, pas fourni par MyPuls.',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {data.period} · liens de tracking MyPuls
      </p>

      {/* KpiGrid (partagé) : 4 sur une ligne et les accents colorés du reste de l'app.
          La grille custom à 3 colonnes datait des 6 KPI — avec 4, elle laissait un orphelin. */}
      <KpiGrid kpis={kpis} cols={5} />

      <Card className="pt-0">
        <CardHeader className="border-b py-5">
          <CardTitle>Revenus & Subs / jour</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>{data.period}</span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#8b5cf6]" /> Revenus (€)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#22c55e]" /> Subs
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#0ea5e9]" /> Clics
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 pt-4 sm:px-6">
          {data.daily.length ? (
            <MktDailyChart data={data.daily} />
          ) : (
            <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aucune donnée sur cette période.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top liens</CardTitle>
            <CardDescription>par revenus sur la période</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            {data.topLinks.map((l) => (
              <div key={l.id} className="flex items-center gap-2">
                <Badge className={typeBadge(l.type)}>{l.type === 'twitter' ? 'TW' : l.type === 'instagram' ? 'IG' : l.type === 'telegram' ? 'TG' : '—'}</Badge>
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <span className="tabular-nums text-muted-foreground">{num(l.conversions)} subs</span>
                <span className="w-20 text-right font-medium tabular-nums">{eur(l.revenueEur)}</span>
              </div>
            ))}
            {data.topLinks.length === 0 && (
              <p className="text-muted-foreground">Aucun lien actif sur la période.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Par créatrice</CardTitle>
            <CardDescription>revenus des liens sur la période</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            {data.byCreator.map((c) => (
              <div key={c.creator} className="flex items-center gap-2">
                {c.creator === '—' ? (
                  <span className="text-muted-foreground">Sans créatrice</span>
                ) : (
                  <Badge className={modelColor(c.creator)}>{c.creator}</Badge>
                )}
                <span className="min-w-0 flex-1" />
                <span className="tabular-nums text-muted-foreground">{num(c.conversions)} subs</span>
                <span className="w-20 text-right font-medium tabular-nums">{eur(c.revenueEur)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
