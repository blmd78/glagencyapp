import { requireAccess } from '@/lib/auth'
import { getGroupsAdmin } from '@/features/marketing-liens/services/get-groups-admin'
import { GroupsAdmin } from '@/features/marketing-liens/components/groups-admin.client'

/**
 * Réglage des groupes de liens — hors sidebar, atteint par le lien « Groupes » de l'écran Liens
 * (même parti pris que les Réglages du Relevé MyPuls : un écran de maintenance ne mérite pas une
 * entrée de nav permanente).
 *
 * Lecture pour qui a la page Liens ; les écritures sont admin (garde dans les Server Actions).
 */
export default async function MktGroupesPage() {
  await requireAccess('mkt-liens')
  const groups = await getGroupsAdmin()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Groupes de liens</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Un lien neuf rejoint le premier groupe qui reconnaît son nom, par priorité croissante — le
        plus petit chiffre d’abord. Ce qu’aucun groupe ne reconnaît attend dans « À classer ».
      </p>
      <GroupsAdmin groups={groups} />
    </div>
  )
}
