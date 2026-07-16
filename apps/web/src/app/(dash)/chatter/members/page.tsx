import { requireAdminOrManager } from '@/lib/auth'
import { getMembers } from '@/features/members/services/get-members'
import { MembersTemplate } from '@/features/members/MembersTemplate'

export default async function MembersPage() {
  const profile = await requireAdminOrManager()
  const data = await getMembers()
  return (
    <MembersTemplate
      data={data}
      viewer={profile.role === 'admin' ? 'admin' : 'manager'}
      superadmin={profile.superadmin}
    />
  )
}
