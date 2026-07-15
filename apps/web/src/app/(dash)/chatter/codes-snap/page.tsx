import { getSnapCodes } from '@/features/snap-codes/services/get-snap-codes'
import { SnapCodesTemplate } from '@/features/snap-codes/SnapCodesTemplate'
import { requireAdmin } from '@/lib/auth'

// Codes Snap (groupe Accès, porté de gla-workflow) — page ADMIN, comme dans le legacy.
export default async function CodesSnapPage() {
  await requireAdmin()
  const data = await getSnapCodes()
  return <SnapCodesTemplate data={data} />
}
