import { getChatters } from '@/features/chatters/services/get-chatters'
import { ChattersTemplate } from '@/features/chatters/ChattersTemplate'
import { resolvePeriod } from '@/lib/period'

export default async function ChattersPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const period = resolvePeriod(await searchParams)
  const data = await getChatters(period)
  return <ChattersTemplate data={data} />
}
