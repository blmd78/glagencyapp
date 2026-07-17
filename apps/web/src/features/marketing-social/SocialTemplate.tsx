import { SocialView } from './components/social-view'
import type { MktLinkRow } from '@/lib/types/marketing'
import type { MktSocialData } from './types'

export function MktSocialTemplate({ data, links }: { data: MktSocialData; links: MktLinkRow[] }) {
  const title =
    data.platform === 'instagram' ? 'Instagram' : data.platform === 'twitter' ? 'Twitter / X' : 'Telegram'
  const unit = data.platform === 'telegram' ? 'canaux' : 'comptes'
  const person = data.platform === 'telegram' ? 'Membres' : 'Followers'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {data.period} · {data.accounts.length} {unit} · {data.totals.followers.toLocaleString('fr-FR')}{' '}
            {person.toLowerCase()} cumulés
          </p>
        </div>
        {/* Aucune saisie manuelle : Instagram et Telegram sont collectés automatiquement,
            Twitter attend son automate (décision Benoît : pas de mode manuel). */}
      </div>

      <SocialView data={data} links={links} />
    </div>
  )
}
