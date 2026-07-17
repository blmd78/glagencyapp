import { frWeekdayDate } from '@glagency/core'
import type { DailyRanking } from '@/lib/types/chatters'

/** Fichier texte partageable : rang + nom, aucun chiffre (médailles pour le podium). */
export function downloadRanking(r: DailyRanking, top: number) {
  const dateFr = frWeekdayDate(r.date)
  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`)
  const lines = [
    `🏆 Classement du ${dateFr}`,
    '',
    ...r.names.slice(0, top).map((name, i) => `${medal(i)} ${name}`),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `classement-${r.date}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
