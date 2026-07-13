import { getSpenders } from '@/features/spenders/services/get-spenders'
import { SpendersTemplate } from '@/features/spenders/SpendersTemplate'
import { requireAccess } from '@/lib/auth'

// Vue « liste » de la sous-catégorie Spenders (CRM closing). Toutes partagent le droit crm-spenders.
export default async function SpendersViewlistePage() {
  // Garde + données en PARALLÈLE : la RLS protège la lecture, la garde ne sert qu'à rediriger.
  const [profile, data] = await Promise.all([requireAccess('crm-spenders'), getSpenders()])
  return <SpendersTemplate data={data} view="liste" isAdmin={profile.role === 'admin'} />
}
