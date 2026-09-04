import { SLOT_LABEL, fmtDuration } from '@glagency/core'
import { int } from '@/lib/format'
import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { Badge } from '@/components/ui/badge'
import { STATUS_COLORS } from '@/lib/status-color'
import { modelColor } from '@/lib/model-color'
import { DaySelect } from './components/day-select'
import { LiveKpis } from './components/live-kpis'
import { MinuteChart } from './components/minute-chart'
import { CoverageHistory } from './components/coverage-history'
import type { ChatterActivityData } from './types'

/**
 * Fiche d'activité d'un chatteur — Server Component qui ne fetch rien.
 *
 * Deux blocs, dans cet ordre et pas l'inverse : d'abord ce que NOUS détenons (le mois ingéré,
 * toujours là), ensuite le détail du jour lu chez MyPuls (qui peut manquer). Une page dont le
 * contenu principal dépend d'un tiers se vide au premier incident réseau.
 */
export function MypulsChatterActivityTemplate({ data }: { data: ChatterActivityData }) {
  const { stored } = data

  return (
    <div className="flex flex-col gap-6">
      <div className="-mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Mois glissant du {data.from} au {data.to}</span>
        {data.memberShift ? (
          <Badge className={STATUS_COLORS.info}>Shift {SLOT_LABEL[data.memberShift]}</Badge>
        ) : (
          <Badge className={STATUS_COLORS.neutral}>Shift non renseigné</Badge>
        )}
      </div>

      <KpiGrid kpis={buildKpis(data)} />

      {stored.models.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Modèles travaillés sur le mois</h2>
          <div className="flex flex-wrap gap-1.5">
            {stored.models.map((m) => (
              <Badge key={m.label} className={modelColor(m.label)}>
                {m.label} · {int(m.messages)}
              </Badge>
            ))}
          </div>
        </section>
      )}

      <CoverageHistory coverage={stored.coverage} expected={data.memberShift} threshold={data.threshold} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Détail d’une journée</h2>
          <DaySelect day={data.day} dayOptions={data.dayOptions} />
        </div>
        <LiveDetailBlock data={data} />
      </section>
    </div>
  )
}

/**
 * Le détail du jour. Trois états distincts, trois phrases : « pas rattaché », « MyPuls
 * injoignable » et « rien ce jour-là » ne veulent pas dire la même chose, et les confondre
 * ferait passer une absence de MESURE pour une absence de TRAVAIL.
 */
function LiveDetailBlock({ data }: { data: ChatterActivityData }) {
  if (data.live.status === 'non-rattache') {
    return (
      <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
        Ce membre n’est rattaché à aucun compte MyPuls : le détail minute par minute ne peut pas
        être demandé. Le rattachement se fait depuis sa fiche membre.
      </p>
    )
  }
  if (data.live.status === 'indisponible') {
    return (
      <div
        role="status"
        className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
        <p className="font-medium">Détail minute par minute indisponible.</p>
        <p className="mt-1">
          MyPuls n’a pas répondu. Les chiffres du mois ci-dessus restent valables — ils viennent
          de notre base, pas de cette lecture.
        </p>
        <p className="mt-1 text-xs opacity-80">{data.live.reason}</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <MinuteChart activity={data.live.activity} />
      <LiveKpis live={data.live} />
    </div>
  )
}

function buildKpis(data: ChatterActivityData): Kpi[] {
  const s = data.stored
  const heldCount = s.coverage.filter((c) => c.slot === data.memberShift && c.coveragePct >= data.threshold).length
  const onShift = s.coverage.filter((c) => c.slot === data.memberShift).length

  return [
    {
      key: 'jours',
      label: 'Jours travaillés',
      value: int(s.daysWorked),
      deltaPct: null,
      trendLabel: 'Au moins un message envoyé',
      hint: 'Sur le mois glissant',
      info: 'Un jour compte dès qu’il porte un segment d’activité — pas de quota minimum.',
    },
    {
      key: 'temps',
      label: 'Temps actif',
      value: fmtDuration(s.activeMinutes),
      deltaPct: null,
      trendLabel: 'Chatting actif cumulé',
      hint: 'Minutes porteuses de messages',
      info: 'Le « Chatting actif » de MyPuls. Ce n’est PAS le temps connecté, qui est plus large.',
    },
    {
      key: 'messages',
      label: 'Messages',
      value: int(s.messages),
      deltaPct: null,
      trendLabel: 'Sur le mois glissant',
      hint: 'Tous modèles confondus',
      info: 'La seule mesure directe du travail.',
    },
    {
      key: 'postes',
      label: 'Postes tenus',
      value: data.memberShift ? `${heldCount}/${onShift}` : '—',
      deltaPct: null,
      trendLabel: data.memberShift
        ? `Sur son créneau (${SLOT_LABEL[data.memberShift]})`
        : 'Shift non renseigné',
      hint: `Couverture ≥ ${data.threshold} %`,
      info: 'Compté uniquement sur SON créneau : une journée de renfort ailleurs n’est ni un succès ni un échec.',
    },
  ]
}
