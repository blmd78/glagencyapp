'use client'

/** Plan d'action rendu en sections structurées ([CA], [PRÉSENCE]…) au lieu d'un bloc de texte. */
export function PlanSections({ plan }: { plan: string }) {
  const sections = plan.split('\n\n').filter(Boolean)
  return (
    <div className="mt-2 flex flex-col gap-2">
      {sections.map((sec, i) => {
        const lines = sec.split('\n')
        const m = (lines[0] ?? '').match(/^\[([^\]]+)\]\s*(.*)$/)
        const title = m?.[1] ?? ''
        const intro = m ? m[2] : (lines[0] ?? '')
        return (
          <div key={i} className="rounded-md border-l-2 border-red-400 bg-muted/40 p-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              {title && (
                <span className="text-[10px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400">
                  {title}
                </span>
              )}
              <span className="text-xs font-medium">{intro}</span>
            </div>
            <ul className="mt-1.5 flex flex-col gap-1 text-xs leading-relaxed">
              {lines.slice(1).map((l, j) =>
                l.startsWith('- ') ? (
                  <li key={j} className="flex gap-1.5">
                    <span className="text-muted-foreground">•</span>
                    <span>{l.slice(2)}</span>
                  </li>
                ) : (
                  <li key={j} className="font-medium">{l}</li>
                ),
              )}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
