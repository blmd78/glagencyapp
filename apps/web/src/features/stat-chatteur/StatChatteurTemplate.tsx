import type { Period } from '@/lib/period'
import type { RankedChatter, StatChatteurData } from './types'
import { EXPORT_ROWS } from './components/draw-ranking-image'
import { ModelSelect } from './components/model-select.client'
import { StatChatteurTabs, type StatChatteurVue } from './components/stat-chatteur-tabs.client'
import { StatExportButton } from './components/stat-export-button'
import { StatPodium } from './components/stat-podium'
import { StatRanking } from './components/stat-ranking'

/**
 * Template Stat chatteur : classement des chatteurs par CA sur la période, sur une scène noir et
 * or — podium (top 3) puis deux tableaux de 25 places côte à côte. Deux onglets (2026-10-02) :
 * Chatteurs (classement global) et Par modèle (le classement sur une modèle choisie). Aucun fetch.
 *
 * `modele` = `?modele=` de l'URL ; inconnu ou absent → la modèle la plus rentable de la période.
 */
export function StatChatteurTemplate({
  data,
  vue,
  modele,
}: {
  data: StatChatteurData
  vue: StatChatteurVue
  modele?: string
}) {
  const { period, rows, models } = data
  const selected = models.find((m) => m.creatorId === modele) ?? models[0] ?? null

  return (
    <StatChatteurTabs
      vue={vue}
      chatteurs={<RankingScene rows={rows} period={period} />}
      parModele={
        <div className="flex flex-col gap-6">
          {selected && <ModelSelect models={models} value={selected.creatorId} />}
          <RankingScene rows={selected?.rows ?? []} period={period} model={selected?.model} />
        </div>
      }
    />
  )
}

/** La scène d'un classement : compteur + export, puis podium et tableaux (ou l'état vide). */
function RankingScene({ rows, period, model }: { rows: RankedChatter[]; period: Period; model?: string }) {
  const sceneKey = `${period.from}_${period.to}${model ? `_${model}` : ''}`
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {period.label} · {rows.length} {rows.length > 1 ? 'chatters classés' : 'chatter classé'}
          {model && ` sur ${model}`}
        </p>
        <StatExportButton rows={rows.slice(0, EXPORT_ROWS)} total={rows.length} period={period} model={model} />
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
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
              {model ? `${model} · ${period.label}` : period.label}
            </p>
          </header>

          {/* Confettis : une fois par période ET par modèle (par session). */}
          <StatPodium top={rows.slice(0, 3)} periodKey={sceneKey} />

          <div className="mt-8">
            {/* `key` = période (+ modèle) : Next garde l'état client quand seule la query change —
                sans elle, la page 2 d'un classement resterait ouverte sur le suivant. */}
            <StatRanking key={sceneKey} rows={rows.slice(3)} />
          </div>
        </section>
      )}
    </div>
  )
}
