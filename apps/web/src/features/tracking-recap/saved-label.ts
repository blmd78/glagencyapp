/**
 * Heure d'enregistrement d'un débrief, lue à PARIS — « lundi 14/09 à 03:05 ».
 *
 * Le fuseau est écrit en dur, et non laissé à celui du serveur (UTC sur Vercel) : c'est toute
 * l'information que l'écran doit donner. Un débrief rangé au lundi mais enregistré lundi à 03:05 a
 * été écrit pendant le service de la nuit du dimanche — la question qui a fait naître cet affichage
 * (2026-09-14).
 */
const FMT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function savedLabel(iso: string): string {
  const parts = Object.fromEntries(FMT.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return `${parts.weekday} ${parts.day}/${parts.month} à ${parts.hour}:${parts.minute}`
}
