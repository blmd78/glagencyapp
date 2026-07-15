import { getAcces } from '@/features/acces/services/get-acces'
import { AccesTemplate } from '@/features/acces/AccesTemplate'
import { requireAccess } from '@/lib/auth'

// Annuaire des accès de l'équipe (repris de gla-workflow). Droit `acces` cochable dans
// Membres — admins toujours, membres si accordé.
export default async function AccesPage() {
  await requireAccess('acces')
  const data = await getAcces()
  return <AccesTemplate data={data} />
}
