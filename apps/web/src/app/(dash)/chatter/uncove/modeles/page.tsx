import { requireAdmin } from '@/lib/auth'
import { getCreatorOptions, getUncoveAccounts } from '@/features/uncove/services/get-uncove-accounts'
import { UncoveAccounts } from '@/features/uncove/components/uncove-accounts.client'

// Uncove › Modèles — config des comptes (admin) : un compte par modèle, on colle le user_token
// (chiffré, relevé chaque jour). Garde admin ; écritures service-role dans les Server Actions.
export default async function UncoveModelesPage() {
  await requireAdmin()
  const [accounts, creators] = await Promise.all([getUncoveAccounts(), getCreatorOptions()])
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Uncove — Modèles</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Un compte par modèle. Colle le <code>user_token</code> récupéré après un login Uncove (onglet
        Réseau du navigateur) — il est chiffré, puis les Subs et le CA sont relevés automatiquement chaque jour.
        Rattache ensuite le compte à une modèle du CRM pour que son CA apparaisse sur sa ligne dans
        l’Overview.
      </p>
      <UncoveAccounts accounts={accounts} creators={creators} />
    </div>
  )
}
