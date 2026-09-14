import { RouteLoading } from '@/components/skeletons/route-loading'
import { AiSkeleton } from '@/features/training-ai/components/ai-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-7 w-44" subtitle="h-4 w-56">
      <AiSkeleton />
    </RouteLoading>
  )
}
