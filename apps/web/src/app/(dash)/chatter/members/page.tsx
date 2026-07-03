import { requireAdmin } from '@/lib/auth'
import { getMembers } from '@/features/members/services/get-members'
import { MembersTemplate } from '@/features/members/MembersTemplate'

export default async function MembersPage() {
  await requireAdmin()
  const data = await getMembers()
  return <MembersTemplate data={data} />
}
