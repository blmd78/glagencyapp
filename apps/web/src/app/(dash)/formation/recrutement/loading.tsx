import { RouteLoading } from '@/components/skeletons/route-loading'
import { RecruitSkeleton } from '@/features/recruit-admin/components/recruit-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-7 w-48">
      <RecruitSkeleton />
    </RouteLoading>
  )
}
