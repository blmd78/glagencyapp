import type { StatChatteurData } from './types'
import { EXPORT_ROWS } from './components/draw-ranking-image'
import { StatExportButton } from './components/stat-export-button'
import { StatPodium } from './components/stat-podium'
import { StatRanking } from './components/stat-ranking'

/**
 * Template Stat chatteur : classement des chatteurs par CA sur la période, sur une scène noir et
 * or — podium (top 3) puis deux tableaux de 25 places côte à côte. Aucun fetch.
 */
export function StatChatteurTemplate({ data }: { data: StatChatteurData }) {
  const { period, rows } = data
  return (
    <div className="flex flex-col gap-6">
      <div className="-mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {period.label} · {rows.length} {rows.length > 1 ? 'chatters classés' : 'chatter classé'}
        </p>
        <StatExportButton rows={rows.slice(0, EXPORT_ROWS)} total={rows.length} period={period} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Aucun CA sur cette période</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Aucun chatteur n&apos;a généré de chiffre d&apos;affaires sur les dates choisies. Seules les
            fiches MyPuls liées à un membre « chatteur » sont classées : le lien se fait dans Membres.
          </p>
        </div>
      ) : (
        // `dark` : les tableaux et boutons shadcn de la scène prennent leurs couleurs sombres.
        <section className="dark relative isolate overflow-hidden rounded-2xl bg-[#09090b] px-3 pb-6 pt-8 text-zinc-100 sm:px-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(ellipse_55%_65%_at_50%_0%,rgba(245,197,66,0.26),rgba(245,197,66,0.06)_55%,transparent_75%)]"
          />
          <header className="mb-14 text-center sm:mb-16">
            <h2 className="font-[family-name:var(--font-gla-head)] text-3xl font-bold uppercase italic tracking-tight sm:text-5xl">
              <span className="bg-gradient-to-b from-white via-zinc-300 to-zinc-500 bg-clip-text pr-2 text-transparent">
                Classement
              </span>
              <span className="bg-gradient-to-b from-[#fff3b0] via-[#f5c542] to-[#9a6a00] bg-clip-text pr-1 text-transparent">
                des chatters
              </span>
            </h2>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">{period.label}</p>
          </header>

          <StatPodium top={rows.slice(0, 3)} periodKey={`${period.from}_${period.to}`} />

          <div className="mt-8">
            {/* `key` = période : Next garde l'état client quand seule la query change — sans elle, la
                page 2 d'une période resterait ouverte sur la suivante. */}
            <StatRanking key={`${period.from}_${period.to}`} rows={rows.slice(3)} />
          </div>
        </section>
      )}
    </div>
  )
}
