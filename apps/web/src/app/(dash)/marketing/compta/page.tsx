import { ComptaTemplate } from '@/features/compta/ComptaTemplate'
import { requireAccess } from '@/lib/auth'

// TODO — compta marketing : la vraie page (paie du staff) part avec le wagon compta
// chatteurs. Même placeholder que /chatter/compta en attendant.
export default async function MktComptaPage() {
  await requireAccess('mkt-compta')
  return <ComptaTemplate />
}
