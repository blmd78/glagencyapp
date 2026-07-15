import { getInfosModeles } from '@/features/infos-modeles/services/get-infos-modeles'
import { InfosModelesTemplate } from '@/features/infos-modeles/InfosModelesTemplate'
import { requireAccess } from '@/lib/auth'

// Infos modèles (groupe Accès, porté de gla-workflow). Droit `infos-modeles` cochable
// dans Membres ; la RLS cloisonne un membre à SES modèles assignés (admin = tous).
export default async function InfosModelesPage() {
  const profile = await requireAccess('infos-modeles')
  const data = await getInfosModeles()
  return <InfosModelesTemplate data={data} isAdmin={profile.role === 'admin'} />
}
