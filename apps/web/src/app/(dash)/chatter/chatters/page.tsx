import { getChatters } from '@/features/chatters/services/get-chatters'
import { requireAccess } from '@/lib/auth'
import { ChattersTemplate } from '@/features/chatters/ChattersTemplate'
import { resolvePeriod } from '@/lib/period'

export default async function ChattersPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const profile = await requireAccess('chatters')
  const period = resolvePeriod(await searchParams)
  const data = await getChatters(period, { restricted: profile.role !== 'admin' })
  return <ChattersTemplate data={data} />
}
