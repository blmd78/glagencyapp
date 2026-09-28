import 'server-only'
import { createClient } from '@/lib/supabase/server'

export type NotificationItem = {
  id: string
  kind: 'event' | 'reminder'
  title: string
  startDate: string
  endDate: string
  at: string
}
export type Notifications = { unread: number; items: NotificationItem[] }

/**
 * La cloche de l'utilisateur courant (RPC `agency_notifications`, 0175). Lue par le layout à
 * chaque rendu, pour tout le monde : UNE requête légère sur une petite table, la RLS fait le tri
 * par rôle. Cast depuis `Json` : cf. `docs/guidelines-data-loading.md`.
 */
export async function getNotifications(): Promise<Notifications> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('agency_notifications', { p_limit: 10 })
  if (error) throw new Error(error.message)
  return (data as unknown as Notifications | null) ?? { unread: 0, items: [] }
}
