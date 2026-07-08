import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { KpiCard } from '@/components/kpi-card'
import { modelColor } from '@/lib/model-color'
import { eur, num } from '@/lib/format'
import { MktDailyChart } from './components/mkt-daily-chart'
import { typeBadge } from './components/type-badge'
import type { MktDashboardData } from './types'

/** Dashboard marketing : KPIs de la période, revenus/jour, top liens, poids par créatrice. */
export function MktDashboardTemplate({ data, expenses }: { data: MktDashboardData; expenses: number }) {
  const frDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const net = Math.round((data.totals.revenueEur - expenses) * 100) / 100
  const base = { deltaPct: null as number | null, trendLabel: '', hint: '', accent: undefined as string | undefined }
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
      key: 'taux',
      label: 'Taux de conversion',
      value:
        data.totals.clicks > 0
          ? `${(Math.round((data.totals.conversions / data.totals.clicks) * 1000) / 10).toLocaleString('fr-FR')} %`
          : '—',
      hint: 'subs ÷ clics, tous liens',
      info: 'Abonnés ÷ clics sur la période, tous liens confondus — calculé chez nous, pas fourni par MyPuls.',
    },
    {
      ...base,
      key: 'exp',
      label: 'Dépenses période',
      value: eur(expenses),
      hint: 'payes staff (fixe + variable)',
      accent: 'border-t-red-400 dark:border-t-red-600',
      info: 'Payes du staff actif sur la période : fixes proratés (jours ÷ 30) + variables (subs de leurs liens × taux TW, vues IG ÷ 1000 × taux) + primes + % du pôle pour le manager. Détail par personne : page Compta.',
    },
    {
      ...base,
      key: 'net',
      label: 'Bénéfice net',
      value: eur(net),
      hint: 'revenus − dépenses staff',
      accent:
        net >= 0
          ? 'border-t-green-400 dark:border-t-green-600'
          : 'border-t-red-400 dark:border-t-red-600',
      info: 'Revenus des liens de la période − dépenses staff de la période. Ne compte que le pôle marketing (pas le CA chatteurs).',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          {data.period} · liens de tracking MyPuls
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map(({ accent, ...k }) => (
          <KpiCard key={k.key} kpi={k} accent={accent} />
        ))}
      </div>

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
