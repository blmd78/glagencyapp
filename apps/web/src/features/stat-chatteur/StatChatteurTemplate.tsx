import type { StatChatteurData } from './types'
import { StatKpis } from './components/stat-kpis'
import { StatRanking } from './components/stat-ranking'

/** Template Stat chatteur : 4 KPI de comptage + classement filtrable par ventes. Aucun fetch. */
export function StatChatteurTemplate({ data }: { data: StatChatteurData }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {data.period} · {data.rows.length} chatteurs closing
      </p>
      <StatKpis kpis={data.kpis} />
      {data.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Aucun chatteur closing à classer</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Aucun chatteur n&apos;est désigné setter/closer ET lié à un membre sur cette période.
            Désigne le closing sur la fiche Membre, puis lie le membre à son chatteur (⚠️ dans la
            liste Membres).
          </p>
        </div>
      ) : (
        <StatRanking rows={data.rows} />
      )}
    </div>
  )
}
