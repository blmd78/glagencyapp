import { RouteLoading } from '@/components/skeletons/route-loading'
import { MembersSkeleton } from '@/features/members/components/members-skeleton'

export default function Loading() {
  return (
    <RouteLoading>
      <MembersSkeleton />
    </RouteLoading>
  )
}
