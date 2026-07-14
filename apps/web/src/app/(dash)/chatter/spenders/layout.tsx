import type { ReactNode } from 'react'
import { getSpenders } from '@/features/spenders/services/get-spenders'
import { SpendersAutoRefresh } from '@/features/spenders/components/spenders-auto-refresh'
import { SpendersDataProvider } from '@/features/spenders/components/spenders-data-provider'
import { encodeSpenders } from '@/features/spenders/wire'
import { requireAccess } from '@/lib/auth'

/**
 * Layout partagé des 4 vues spenders = LE fetch unique. Next ne re-exécute pas un layout
 * en naviguant entre ses enfants → basculer liste/tracker/alertes/archive ne recharge
 * plus les ~1 700 lignes (chaque page ne pèse que quelques Ko). Les Server Actions
 * revalidatePath('/chatter/spenders', 'layout') re-rendent ce layout → données fraîches
 * après chaque action, dans la même réponse.
 */
export default async function SpendersLayout({ children }: { children: ReactNode }) {
  // Garde + données en PARALLÈLE : la RLS protège la lecture, la garde ne sert qu'à rediriger.
  const [profile, data] = await Promise.all([requireAccess('crm-spenders'), getSpenders()])
  // Tuples sur le fil : le payload sérialisé ne répète pas 18 noms de champs × N lignes
  // (~2,6× plus léger) — le provider décode en objets côté client (cf. wire.ts).
  return (
    <SpendersDataProvider wire={encodeSpenders(data)} isAdmin={profile.role === 'admin'}>
      <SpendersAutoRefresh />
      {children}
    </SpendersDataProvider>
  )
}
