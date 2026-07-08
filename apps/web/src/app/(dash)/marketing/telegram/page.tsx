import { getMktSocial } from '@/features/marketing/services/get-social'
import { getLinkRows } from '@/features/marketing/services/get-links'
import { MktSocialTemplate } from '@/features/marketing/SocialTemplate'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'

// Canal Telegram — même DA que Instagram/Twitter : KPIs, onglets Canaux/Liens.
// Les canaux s'ajoutent via « + Compte » (saisie manuelle des membres/vues en
// attendant l'automate t.me / bot officiel).
export default async function MktTelegramPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('mkt-telegram')
  const period = resolvePeriod(await searchParams)
  const [data, links] = await Promise.all([getMktSocial('telegram', period), getLinkRows(period)])
  return <MktSocialTemplate data={data} links={links.filter((l) => l.type === 'telegram')} />
}
