import { getBilan } from '@/features/bilan/services/get-bilan'
import { BilanTemplate } from '@/features/bilan/BilanTemplate'
import { requireAccess } from '@/lib/auth'

export default async function BilanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  await requireAccess('bilan')
  const { week } = await searchParams
  const data = await getBilan(week)
  return <BilanTemplate data={data} />
}
