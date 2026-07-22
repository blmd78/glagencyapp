import { MembersTable } from './components/members-table'
import type { MembersData } from './types'

/**
 * Template Membres (admin) : comptes, pages accessibles, modèles assignés. Le h1 est
 * affiché immédiatement par la page (kickoff sans await, docs/guidelines-standard-feature.md
 * §2) — ce Template ne rend que le sous-titre (streamé) + la table. Aucun fetch ici
 * (convention app → feature(template) → composants).
 */
export function MembersTemplate({
  data,
  scope = 'chatter',
  viewer = 'admin',
  superadmin = false,
}: {
  data: MembersData
  /** Face dont cette page gère les droits (les droits de l'autre face sont préservés). */
  scope?: 'chatter' | 'marketing'
  /** Manager : gère uniquement SES chatters (rôle user forcé) — défaut admin. */
  viewer?: 'admin' | 'manager'
  /** Propriétaire : peut nommer des admins et gérer les fiches admin. */
  superadmin?: boolean
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* -mt-4 : compense le double gap-6 page/Template (pilote chatters, §2.5). */}
      <p className="-mt-4 text-sm text-muted-foreground">
        {data.members.length} compte(s)
        {scope === 'marketing' &&
          ' · droits du pôle marketing (les droits chatteurs se gèrent depuis leur face)'}
      </p>

      <MembersTable
        members={data.members}
        creators={data.creators}
        chatters={data.chatters}
        scope={scope}
        viewer={viewer}
        superadmin={superadmin}
      />
    </div>
  )
}
