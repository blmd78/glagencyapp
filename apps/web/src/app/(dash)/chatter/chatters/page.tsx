import { getChatters } from '@/features/chatters/services/get-chatters'
import { ChattersTemplate } from '@/features/chatters/ChattersTemplate'

export default async function ChattersPage() {
  const data = await getChatters()
  return <ChattersTemplate data={data} />
}
