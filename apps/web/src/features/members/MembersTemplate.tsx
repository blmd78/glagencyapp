import { MembersTable } from './components/members-table'
import { MembersTabs } from './components/members-tabs'
import { TurnoverView } from './components/turnover-view'
import type { MembersData, TurnoverData } from './types'

/**
 * Template Membres (admin) : comptes, pages accessibles, modèles assignés — et l'onglet
 * « Turnover » (0103), qui vit ici plutôt que sur une route dédiée : aucun slug ni droit à créer,
 * et les statistiques RH ont leur place là où se gèrent les gens.
 *
 * Le h1 est affiché immédiatement par la page (kickoff sans await,
 * docs/guidelines-standard-feature.md §2) — ce Template ne rend que le contenu streamé. Aucun
 * fetch ici (convention app → feature(template) → composants).
 *
 * `data` et `turnover` sont MUTUELLEMENT EXCLUSIFS, l'un des deux est toujours `null` : la page ne
 * lance que la lecture de l'onglet demandé, l'autre ne coûte rien.
 */
export function MembersTemplate({
  data,
  turnover = null,
  vue = 'liste',
  scope = 'chatter',
  viewer = 'admin',
  superadmin = false,
}: {
  data: MembersData | null
  turnover?: TurnoverData | null
  vue?: 'liste' | 'turnover'
  /** Face dont cette page gère les droits (les droits de l'autre face sont préservés). */
  scope?: 'chatter' | 'marketing'
  /** Manager : gère uniquement SES chatters (rôle user forcé) — défaut admin. */
  viewer?: 'admin' | 'manager'
  /** Propriétaire : peut nommer des admins et gérer les fiches admin. */
  superadmin?: boolean
}) {
  const liste = data && (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        {data.members.length} compte(s)
        {scope === 'marketing' &&
          ' · droits du pôle marketing (les droits chatters se gèrent depuis leur face)'}
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

  // La face MARKETING garde la page telle quelle : pas d'onglets (ses effectifs se gèrent depuis
  // la face chatteurs, un onglet Turnover vide y serait un faux départ de piste). Le `-mt-4`
  // compense le double gap-6 page/Template, comme avant — l'onglet, lui, a sa TabsList au-dessus
  // et n'en a pas besoin.
  if (scope === 'marketing')
    return <div className="-mt-4 flex flex-col gap-6">{liste}</div>

  return (
    <MembersTabs
      vue={vue}
      liste={liste}
      turnover={turnover ? <TurnoverView data={turnover} /> : null}
    />
  )
}
