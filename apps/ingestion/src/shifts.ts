import * as Sentry from '@sentry/node'
import { login } from '@glagency/mypuls'
import { createAdminClient } from '@glagency/db'
import { addDays, todayParis } from '@glagency/core'
import { loadEnv } from './env'

import {
  ingestShiftsDay,
  loadSettings,
  recordShiftRun,
  type DayRunResult,
} from './shifts-core'

// CLI du relevé MyPuls « Contrôle des shifts » (rattrapage + run manuel). Les briques
// réutilisables — worker compris — vivent dans shifts-core.ts.
// Spec : docs/superpowers/specs/2026-09-01-releve-mypuls-design.md
//
// Usage : tsx src/shifts.ts [du] [au]
//   sans argument      → hier seul
//   un argument        → ce jour-là
//   deux arguments     → la plage, jour par jour (MyPuls conserve 60 jours)

function* eachDay(from: string, to: string): Generator<string> {
  let d = from
  while (d <= to) {
    yield d
    d = addDays(d, 1)
  }
}

async function run(): Promise<void> {
  const db = createAdminClient()
  const settings = await loadSettings(db)

  // Hier par défaut : le créneau du soir d'aujourd'hui n'est pas terminé, l'ingérer donnerait
  // une couverture tronquée qui ressemble trait pour trait à une faute.
  const yesterday = addDays(todayParis(), -1)
  const from = process.argv[2] ?? yesterday
  const to = process.argv[3] ?? process.argv[2] ?? yesterday

  console.log(
    `[shifts] ${from} → ${to} | idle=${settings.idleMinutes} min, seuil=${settings.coverageThreshold} %`,
  )

  // `login()` et non `refreshCookie()` : même choix que le CLI spenders. La rotation du
  // remember-me partagé appartient au worker (un run manuel qui la déclenche périme le cookie
  // que la prod a en réserve).
  const { cookie } = await login()
  const results: DayRunResult[] = []

  try {
    for (const day of eachDay(from, to)) {
      const r = await ingestShiftsDay(db, cookie, day, settings)
      results.push(r)
      console.log(
        `[shifts] ${r.day} : ${r.segments} segments, ${r.coverageRows} lignes de couverture` +
          (r.backfilled ? `, ${r.backfilled} lien(s) MyPuls posé(s)` : '') +
          (r.unmatched.length ? `, ${r.unmatched.length} non rapproché(s)` : ''),
      )
    }
  } catch (err) {
    await recordShiftRun(db, from, to, settings, { results, error: err })
    throw err
  }

  await recordShiftRun(db, from, to, settings, { results })

  const unmatched = new Map(results.flatMap((r) => r.unmatched).map((u) => [u.label, u]))
  if (unmatched.size) {
    console.log(`\n[shifts] ${unmatched.size} chatteur(s) MyPuls non rapproché(s) au CRM :`)
    for (const u of unmatched.values()) {
      console.log(`  - ${u.label}${u.mypulsUserId ? ` (#${u.mypulsUserId})` : ''} — ${u.raison}`)
    }
  }
  const unknown = [...new Set(results.flatMap((r) => r.unknownCreators))]
  if (unknown.length) {
    console.log(`\n[shifts] modèle(s) MyPuls inconnu(s) du CRM : ${unknown.join(', ')}`)
  }
  console.log('\n[shifts] terminé')
}

async function main(): Promise<void> {
  loadEnv()
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return run()

  Sentry.init({ dsn, tracesSampleRate: 0 })
  // Pas de cron check-in ici : comme pour spenders, le monitor appartiendra au worker. Un run
  // CLI qui check-in sur le même slug réécrirait la config du monitor.
  try {
    await run()
  } catch (err) {
    Sentry.captureException(err)
    throw err
  } finally {
    await Sentry.flush(3000)
  }
}

const isCli = process.argv[1]?.endsWith('shifts.ts')
if (isCli) {
  main().catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
}
