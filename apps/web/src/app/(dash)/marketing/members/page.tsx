import { requireSuperadmin } from '@/lib/auth'
import { getMembers } from '@/features/members/services/get-members'
import { MembersTemplate } from '@/features/members/MembersTemplate'

// Même DA/fonctionnement que la page Membres chatteurs, adaptée au pôle marketing :
// cases = pages mkt-* (Overview, Liens, Instagram, Twitter, Telegram, Compta), pas de
// section modèles ; les droits chatteurs d'un profil sont préservés (fusion côté serveur).
export default async function MktMembersPage() {
  await requireSuperadmin()
  const data = await getMembers()
  return <MembersTemplate data={data} scope="marketing" />
}
