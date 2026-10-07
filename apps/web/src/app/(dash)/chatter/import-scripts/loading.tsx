import { RouteLoading } from '@/components/skeletons/route-loading'
import { ScriptsImportSkeleton } from '@/features/scripts-import/components/scripts-import-skeleton'

export default function Loading() {
  return (
    <RouteLoading>
      <ScriptsImportSkeleton />
    </RouteLoading>
  )
}
