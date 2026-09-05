import { SLOT_LABEL, fmtDuration, frWeekdayDate } from '@glagency/core'
import { int, pct } from '@/lib/format'
import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { Badge } from '@/components/ui/badge'
import { STATUS_COLORS } from '@/lib/status-color'
import { modelColor } from '@/lib/model-color'
import { DaySelect } from './components/day-select'
import { LiveKpis } from './components/live-kpis'
import { MinuteChart } from './components/minute-chart'
import type { ChatterActivityData, ChatterCoverageDay } from './types'

// Formateur HOISTÉ : en construire un par cellule est ~70× plus lent (mesuré dans ce repo).
const HHMM = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const clock = (iso: string | null) => (iso ? HHMM.format(new Date(iso)) : '—')

/**
 * Fiche d'activité d'un chatteur — Server Component qui ne fetch rien.
 *
 * LE JOUR COMMANDE L'ÉCRAN. Le sélecteur est en haut, à côté du nom, et les quatre tuiles
 * décrivent CE jour-là : c'est la question qu'on se pose en ouvrant une fiche depuis le relevé
 * (« qu'est-ce qui s'est passé ce jour-là ? »). Les totaux de la période restent, mais en une
 * ligne de contexte — une seconde grille de tuiles aurait obligé à lire deux fois pour savoir
 * laquelle répond.
 *
 * Le sélecteur ne propose que les jours DE la période du header : la fiche est un zoom dans la
 * période, pas une échappée hors d'elle.
 */
export function MypulsChatterActivityTemplate({ data }: { data: ChatterActivityData }) {
  const { stored } = data
  const dayRows = stored.coverage.filter((c) => c.day === data.day)

  return (
    <div className="flex flex-col gap-6">
      <div className="-mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {data.memberShift ? (
            <Badge className={STATUS_COLORS.info}>Shift {SLOT_LABEL[data.memberShift]}</Badge>
          ) : (
            <Badge className={STATUS_COLORS.neutral}>Shift non renseigné</Badge>
          )}
          <span>
            {data.periodLabel} · {int(stored.daysWorked)} jour
            {stored.daysWorked > 1 ? 's' : ''} travaillé{stored.daysWorked > 1 ? 's' : ''} ·{' '}
            {fmtDuration(stored.activeMinutes)} actives · {int(stored.messages)} messages
          </span>
        </div>
        <DaySelect day={data.day} dayOptions={data.dayOptions} />
      </div>

      <KpiGrid kpis={buildKpis(data, dayRows)} />

      {stored.models.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Modèles travaillés sur la période</h2>
          <div className="flex flex-wrap gap-1.5">
            {stored.models.map((m) => (
              <Badge key={m.label} className={modelColor(m.label)}>
                {m.label} · {int(m.messages)}
              </Badge>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">
          Minute par minute — {frWeekdayDate(data.day)}
        </h2>
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
          MyPuls n’a pas répondu. Les chiffres ci-dessus restent valables — ils viennent de notre
          base, pas de cette lecture.
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

/**
 * Les quatre tuiles décrivent LE JOUR SÉLECTIONNÉ.
 *
 * La couverture affichée est celle du créneau ATTENDU et d'aucun autre : une journée de renfort
 * ailleurs n'est ni un succès ni un échec (décision D7). Quand la personne n'a pas de créneau
 * renseigné, la tuile le DIT au lieu d'afficher un pourcentage qui ne se compare à rien.
 */
function buildKpis(data: ChatterActivityData, dayRows: ChatterCoverageDay[]): Kpi[] {
  const onShift = data.memberShift ? dayRows.find((c) => c.slot === data.memberShift) : undefined
  const activeMinutes = dayRows.reduce((s, c) => s + c.activeMinutes, 0)
  const messages = dayRows.reduce((s, c) => s + c.messages, 0)
  const jour = frWeekdayDate(data.day)

  return [
    {
      key: 'temps',
      label: 'Temps actif',
      value: fmtDuration(activeMinutes),
      deltaPct: null,
      trendLabel: dayRows.length > 0 ? `${dayRows.length} créneau(x) touché(s)` : 'aucune activité',
      hint: jour,
      info: 'Le « Chatting actif » de MyPuls sur ce jour, tous créneaux confondus. Ce n’est PAS le temps connecté, qui est plus large.',
    },
    {
      key: 'messages',
      label: 'Messages',
      value: int(messages),
      deltaPct: null,
      trendLabel: 'Tous modèles confondus',
      hint: jour,
      info: 'La seule mesure directe du travail — les autres tuiles sont des durées.',
    },
    {
      key: 'couverture',
      label: 'Couverture de son créneau',
      value: onShift ? pct(onShift.coveragePct) : '—',
      deltaPct: null,
      trendLabel: data.memberShift
        ? onShift
          ? `${SLOT_LABEL[data.memberShift]} · ${onShift.coveragePct >= data.threshold ? 'poste tenu' : 'sous le seuil'}`
          : `Aucune activité sur ${SLOT_LABEL[data.memberShift]}`
        : 'Shift non renseigné — rien à comparer',
      hint: `Seuil ${data.threshold} %`,
      info: 'Le verdict de MyPuls, repris tel quel, sur SON créneau uniquement. Une journée de renfort ailleurs n’est ni un succès ni un échec.',
    },
    {
      key: 'prise',
      label: 'Prise de poste',
      value: onShift ? clock(onShift.firstAt) : '—',
      deltaPct: null,
      trendLabel: onShift ? `dernier message ${clock(onShift.lastAt)}` : '—',
      hint: jour,
      info: 'Première et dernière activité DANS le créneau attendu. Hors de ce créneau, l’heure n’aurait rien à mesurer.',
    },
  ]
}
