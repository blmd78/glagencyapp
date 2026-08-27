import Link from 'next/link'
import type { Route } from 'next'
import { SHIFTS } from '@glagency/core'
import type { BoardData } from '../types'

const DAYS = 14

/**
 * Les trois filtres du board : modèle, créneau, date.
 *
 * Ce sont des `<Link>`, pas des menus JavaScript : l'état vit dans l'URL (`searchParams`), donc il
 * se partage, se met en favori et revient au retour arrière. Le repli au clic extérieur est natif
 * au `<details>` — leur runtime maison écrivait un écouteur global pour ça, on le supprime.
 */
export function BoardFilters({ data }: { data: BoardData }) {
  const href = (patch: Record<string, string | null>): Route => {
    const q = new URLSearchParams()
    const current: Record<string, string | null> = {
      shift: data.shiftKey,
      date: data.date,
      m: data.modelFilter,
      ...patch,
    }
    for (const [k, v] of Object.entries(current)) if (v) q.set(k, v)
    return `/chatter/presence?${q.toString()}` as Route
  }

  return (
    <>
      <details className="dd">
        <summary>{data.modelFilter ?? 'Tous les modèles'}</summary>
        <div className="dd-menu">
          <Link href={href({ m: null })} className={data.modelFilter ? '' : 'on'}>
            Tous les modèles
          </Link>
          {data.models.map((m) => (
            <Link key={m} href={href({ m })} className={data.modelFilter === m ? 'on' : ''}>
              {m}
            </Link>
          ))}
        </div>
      </details>

      <details className="dd">
        <summary>
          {data.shiftLabel} {data.shiftRange}
        </summary>
        <div className="dd-menu">
          {SHIFTS.map((s) => (
            <Link
              key={s.key}
              href={href({ shift: s.key })}
              className={data.shiftKey === s.key ? 'on' : ''}
            >
              {s.label} {String(s.startH).padStart(2, '0')}h→{String(s.endH).padStart(2, '0')}h
            </Link>
          ))}
        </div>
      </details>

      <details className="dd">
        <summary>{dayLabel(data.date)}</summary>
        <div className="dd-menu">
          {lastDays(data.date, DAYS).map((d) => (
            <Link key={d} href={href({ date: d })} className={data.date === d ? 'on' : ''}>
              {dayLabel(d)}
            </Link>
          ))}
        </div>
      </details>
    </>
  )
}

/** « mer. 26/08 » — leur format exact. */
function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  const wd = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' }).format(d)
  const dm = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(d)
  return `${wd} ${dm}`
}

/** Les N derniers jours à partir de `from` inclus, du plus récent au plus ancien. */
function lastDays(from: string, count: number): string[] {
  const base = Date.parse(`${from}T12:00:00Z`)
  return Array.from({ length: count }, (_, i) =>
    new Date(base - i * 86_400_000).toISOString().slice(0, 10),
  )
}
