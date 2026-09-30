/**
 * Silhouette du bloc de données Stat chatteur (scène noire : titre, podium, deux tableaux),
 * dimensions ~ `StatChatteurTemplate` (anti-CLS). Source unique : importée par `loading.tsx` ET le
 * fallback `<Suspense>` de `page.tsx` (docs/guidelines-standard-feature.md §2).
 */
export function StatChatteurSkeleton() {
  return (
    <div className="rounded-2xl bg-[#09090b] px-3 pb-6 pt-8 sm:px-6" aria-hidden>
      <div className="mx-auto mb-14 h-9 w-72 animate-pulse rounded-md bg-white/10 sm:mb-16 sm:h-12 sm:w-[28rem]" />
      <div className="mx-auto flex max-w-3xl items-end justify-center gap-2 sm:gap-4">
        {['h-28 sm:h-32', 'h-36 sm:h-44', 'h-20 sm:h-24'].map((h) => (
          <div key={h} className="flex flex-1 flex-col items-center gap-3">
            <div className="size-16 animate-pulse rounded-full bg-white/10 sm:size-20" />
            <div className="h-4 w-20 animate-pulse rounded bg-white/10" />
            <div className={`w-full animate-pulse rounded-t-2xl bg-white/[0.07] ${h}`} />
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {[0, 1].map((t) => (
          <div key={t} className="h-[64rem] animate-pulse rounded-xl bg-white/[0.04]" />
        ))}
      </div>
    </div>
  )
}
