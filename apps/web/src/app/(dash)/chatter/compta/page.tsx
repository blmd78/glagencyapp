import { ComptaTemplate } from '@/features/compta/ComptaTemplate'
import { requireAccess } from '@/lib/auth'

export default async function ComptaPage() {
  await requireAccess('compta')
  // TODO: récupérer les données via @/features/compta/services + @/lib/supabase/server
  return <ComptaTemplate />
}
