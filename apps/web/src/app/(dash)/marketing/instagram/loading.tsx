import { RouteLoading } from '@/components/skeletons/route-loading'
import { MktSocialSkeleton } from '@/features/marketing-social/components/social-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-7 w-40">
      <MktSocialSkeleton />
    </RouteLoading>
  )
}
