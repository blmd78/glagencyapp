import { SocialView } from './components/social-view'
import type { MktLinkRow } from '@/lib/types/marketing'
import type { MktSocialData } from './types'

export function MktSocialTemplate({ data, links }: { data: MktSocialData; links: MktLinkRow[] }) {
  const unit = data.platform === 'telegram' ? 'canaux' : 'comptes'
  const person = data.platform === 'telegram' ? 'Membres' : 'Followers'

  return (
    <div className="flex flex-col gap-6">
      {/* Aucune saisie manuelle : Instagram et Telegram sont collectés automatiquement,
          Twitter attend son automate (décision Benoît : pas de mode manuel). */}
      <p className="-mt-4 text-sm text-muted-foreground">
        {data.period} · {data.accounts.length} {unit} · {data.totals.followers.toLocaleString('fr-FR')}{' '}
        {person.toLowerCase()} cumulés
      </p>

      <SocialView data={data} links={links} />
    </div>
  )
}
