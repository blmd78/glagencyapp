import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MembersTable } from './components/members-table'
import { MemberDialog } from './components/member-dialog'
import type { MembersData } from './types'

/**
 * Template Membres (admin) : comptes, pages accessibles, modèles assignés.
 * Aucun fetch ici (convention app → feature(template) → composants).
 */
export function MembersTemplate({ data }: { data: MembersData }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Membres</h1>
          <p className="text-sm text-muted-foreground">
            {data.members.length} compte(s) · connexion par code email (OTP) · le cloisonnement
            par modèle est appliqué par la base (RLS)
          </p>
        </div>
        <MemberDialog
          creators={data.creators}
          trigger={
            <Button>
              <UserPlus className="size-4" /> Nouveau membre
            </Button>
          }
        />
      </div>

      <MembersTable members={data.members} creators={data.creators} />
    </div>
  )
}
