import Link from 'next/link'
import { Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { LiensSection, type LiensSearchParams } from '../_liens/liens-section'

export default async function MktLiensPage({ searchParams }: { searchParams: Promise<LiensSearchParams> }) {
  await requireAccess('mkt-liens')
  const sp = await searchParams
  const period = resolvePeriod(sp)

  return (
    <div className="flex flex-col gap-6">
      {/* Le réglage des groupes vit hors sidebar : c'est de la maintenance, pas un écran
          quotidien. Même bouton, même place que les Réglages du Relevé (presence/page.tsx). */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Liens de tracking</h1>
        <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
          <Link href="/marketing/liens/groupes" title="Créer, renommer et régler les groupes de liens">
            <Tags className="size-4" />
            Groupes
          </Link>
        </Button>
      </div>
      {/* Sans les SFS : ils ont leur onglet (`lib/mkt-sfs.ts`). */}
      <LiensSection sp={sp} period={period} scope="externe" />
    </div>
  )
}
