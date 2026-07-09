import { MembersTable } from './components/members-table'
import type { MembersData } from './types'

/**
 * Template Membres (admin) : comptes, pages accessibles, modèles assignés.
 * Aucun fetch ici (convention app → feature(template) → composants).
 */
export function MembersTemplate({
  data,
  scope = 'chatter',
}: {
  data: MembersData
  /** Face dont cette page gère les droits (les droits de l'autre face sont préservés). */
  scope?: 'chatter' | 'marketing'
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Membres</h1>
        <p className="text-sm text-muted-foreground">
          {data.members.length} compte(s)
          {scope === 'marketing' &&
            ' · droits du pôle marketing (les droits chatteurs se gèrent depuis leur face)'}
        </p>
      </div>

      <MembersTable members={data.members} creators={data.creators} scope={scope} />
    </div>
  )
}
