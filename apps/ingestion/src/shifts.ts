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

  // J-1 AU PLUS TARD, toujours — comme toute l'ingestion du projet.
  //
  // Ce n'est pas une commodité, c'est le garde-fou principal du relevé : MyPuls calcule sa
  // couverture sur le temps ÉCOULÉ tant qu'un créneau n'est pas fini, et le créneau du soir
  // court jusqu'à 05h00 le lendemain. Ingérer le jour EN COURS écrit donc une journée
  // plafonnée — mesuré à ~65 % — et la marque `ok`. Toute l'équipe du soir apparaîtrait sous
  // le seuil, sur l'écran même qui sert à décider de retenues sur paie.
  //
  // Le plafond s'applique aussi aux dates passées EN ARGUMENT : `shifts 2026-09-01 2026-09-04`
  // est une commande qu'on tape sans y penser, et rien ne la rattrapait.
  const yesterday = addDays(todayParis(), -1)
  const asked = { from: process.argv[2] ?? yesterday, to: process.argv[3] ?? process.argv[2] ?? yesterday }
  const to = asked.to > yesterday ? yesterday : asked.to
  const from = asked.from > to ? to : asked.from

  if (asked.to !== to || asked.from !== from) {
    console.log(
      `[shifts] plage ramenée à ${from} → ${to} : le jour en cours (et au-delà) n'est jamais ingéré.`,
    )
  }

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
