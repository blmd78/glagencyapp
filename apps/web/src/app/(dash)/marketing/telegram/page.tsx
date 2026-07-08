import { getLinkRows } from '@/features/marketing/services/get-links'
import { LinksCard } from '@/features/marketing/components/links-card'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'

// Canal Telegram : uniquement des liens de tracking (pas de comptes sociaux suivis).
export default async function MktTelegramPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('mkt-telegram')
  const period = resolvePeriod(await searchParams)
  const links = (await getLinkRows(period)).filter((l) => l.type === 'telegram')
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Telegram</h1>
        <p className="text-sm text-muted-foreground">{period.label} · funnel Telegram</p>
      </div>
      <LinksCard links={links} period={period.label} />
    </div>
  )
}
