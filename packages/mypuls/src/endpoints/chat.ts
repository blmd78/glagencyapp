import { BASE_URL, UA } from '../client'

/** Conversation du chat MyPuls (état courant, périmètre = modèle en contexte de session). */
export interface ChatConversation {
  /** Id fan MyPuls (= fan_id de l'API /team/money et de /fans). */
  id: number
  username: string
  name: string
  /** CA net du fan connu de MyPuls. */
  ca: number
  hasUnread: boolean
  online: boolean
  lastMessage: {
    isMine: boolean
    content: string
    /** Epoch secondes. */
    date: number
  } | null
  /** Assignation conversation→chatteur posée dans MyPuls (id = user MyPuls). */
  assignUser: { id: number; label: string } | null
  status: string
  statusLabel: string
}

/**
 * Bascule le contexte de session sur un modèle (le chat/fans sont servis « pour le
 * modèle courant »). Suit la redirection ; toute retombée sur /login = session morte.
 */
export async function switchCreator(mypulsCreatorId: string, cookie: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/switch-creator/${mypulsCreatorId}?from=app_chat`, {
    headers: { Cookie: cookie, 'User-Agent': UA, Accept: 'text/html' },
  })
  if (!res.ok) throw new Error(`GET /switch-creator/${mypulsCreatorId} ${res.status}`)
  if (res.url.includes('/login')) throw new Error('switch-creator: session expirée')
}

/** Conversations du modèle en contexte (dernier message, CA, assignation) — état à l'instant T. */
export async function fetchChatInit(cookie: string): Promise<ChatConversation[]> {
  const res = await fetch(`${BASE_URL}/chat/init`, {
    headers: { Cookie: cookie, 'User-Agent': UA, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`GET /chat/init ${res.status}`)
  if (res.url.includes('/login')) throw new Error('chat/init: session expirée')
  const json = (await res.json()) as ChatConversation[]
  if (!Array.isArray(json)) throw new Error('chat/init: réponse inattendue (pas un tableau)')
  return json
}
