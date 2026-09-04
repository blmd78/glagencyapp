import Link from 'next/link'
import type { Route } from 'next'
import { SLOT_LABEL, fmtDuration, frWeekdayDate } from '@glagency/core'
import { int } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { modelColor } from '@/lib/model-color'
import type { VacationRow } from '../types'

// Formateur HOISTÉ : en construire un par cellule est ~70× plus lent (mesuré dans ce repo).
const HHMM = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const clock = (ms: number) => HHMM.format(new Date(ms))

/**
 * Le « Détail par chatteur » de MyPuls : une ligne par vacation.
 *
 * Groupée par JOUR, parce que c'est l'axe de lecture d'une enquête — « ce jour-là, il a fait
 * quoi ». Le temps affiché est le temps ACTIF (la somme des segments), pas la durée bornes à
 * bornes : les deux diffèrent dès qu'il y a un creux, et c'est le temps actif qui compte.
 */
export function VacationTable({ rows }: { rows: VacationRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune vacation sur cette période avec ces filtres.
      </p>
    )
  }

  const byDay = new Map<string, VacationRow[]>()
  for (const r of rows) {
    const list = byDay.get(r.day)
    if (list) list.push(r)
    else byDay.set(r.day, [r])
  }

  return (
    <div className="flex flex-col gap-4">
      {[...byDay.entries()].map(([day, list]) => (
        <section key={day} className="overflow-hidden rounded-xl border bg-card">
          <header className="flex items-baseline gap-3 border-b bg-muted/30 px-4 py-2">
            <h2 className="text-sm font-medium">{frWeekdayDate(day)}</h2>
            <span className="text-xs text-muted-foreground">
              {list.length} vacation{list.length > 1 ? 's' : ''} ·{' '}
              {fmtDuration(list.reduce((s, r) => s + r.activeMinutes, 0))} actives
            </span>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-normal">Chatter</th>
                  <th className="px-4 py-2 font-normal">Créneau</th>
                  <th className="px-4 py-2 font-normal">Début → fin</th>
                  <th className="px-4 py-2 text-right font-normal">Temps actif</th>
                  <th className="px-4 py-2 text-right font-normal">Messages</th>
                  <th className="px-4 py-2 font-normal">Modèles</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.key} className="border-b last:border-b-0 hover:bg-muted/40">
                    <td className="px-4 py-2">
                      {r.profileId ? (
                        <Link
                          href={`/chatter/presence/${r.profileId}` as Route}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {r.name}
                        </Link>
                      ) : (
                        <span className="font-medium">
                          {r.name}
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            non rattaché
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{SLOT_LABEL[r.slot]}</td>
                    <td className="px-4 py-2 tabular-nums whitespace-nowrap">
                      {clock(r.startedAtMs)} → {clock(r.endedAtMs)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {r.segments} segment{r.segments > 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmtDuration(r.activeMinutes)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{int(r.messages)}</td>
                    <td className="px-4 py-2">
                      <span className="flex flex-wrap gap-1">
                        {r.models.map((m) => (
                          <Badge key={m.label} className={modelColor(m.label)}>
                            {m.label} <span className="ml-1 opacity-70">{int(m.messages)}</span>
                          </Badge>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
