import { RouteLoading } from '@/components/skeletons/route-loading'
import { StatChatteurSkeleton } from '@/features/stat-chatteur/components/stat-chatteur-skeleton'

export default function Loading() {
  return (
    <RouteLoading>
      <StatChatteurSkeleton />
    </RouteLoading>
  )
}
