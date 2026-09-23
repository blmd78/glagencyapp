import Link from 'next/link'
import { Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Suspense } from 'react'
import { getMktLinks } from '@/features/marketing-liens/services/get-links'
import { getMktGroups } from '@/lib/services/get-mkt-groups'
import { getLinkDaily } from '@/features/marketing-liens/services/get-link-daily'
import { MktLiensTemplate } from '@/features/marketing-liens/LiensTemplate'
import { MktLiensSkeleton } from '@/features/marketing-liens/components/liens-skeleton'
import { LinkDailyDialog } from '@/features/marketing-liens/components/link-daily-dialog'
import {
  ALL,
  modeleOptions,
  parseModele,
  parseReseau,
  resolveGraphSelection,
} from '@/features/marketing-liens/link-options'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MktLinksData, MktLiensVue } from '@/features/marketing-liens/types'

/** `?lien=` vient de l'URL : un id malformé irait lever une 22P02 sur une colonne uuid. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function MktLiensPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string
    to?: string
    lien?: string
    vue?: string
    reseau?: string
    modele?: string
  }>
}) {
  await requireAccess('mkt-liens')
  const sp = await searchParams
  const period = resolvePeriod(sp)
  const vue: MktLiensVue = sp.vue === 'graph' ? 'graph' : 'classement'
  const reseau = parseReseau(sp.reseau)
  // `?modele=` se valide contre les liens CHARGÉS (une modèle sans lien n'est pas proposable),
  // donc plus bas, une fois la lecture résolue — la page ne fait ici que transmettre le brut.
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, KPIs + table streament
  // dans leur boundary quand la lecture répond.
  const data = getMktLinks(period)
  const linkId = sp.lien && UUID.test(sp.lien) ? sp.lien : null

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
      <Suspense
        fallback={
          <SectionFallback subtitle="h-4 w-32">
            <MktLiensSkeleton />
          </SectionFallback>
        }
      >
        <MktLiensContent
        data={data}
        vue={vue}
        linkId={linkId}
        reseau={reseau}
        modeleRaw={sp.modele}
        period={period}
      />
      </Suspense>
      {/* La MODALE, réservée à l'onglet Classement : en mode Graphique, `?lien=` désigne déjà la
          courbe affichée en pleine page — l'ouvrir par-dessus la doublerait. Sa propre frontière,
          pour qu'ouvrir un détail ne fasse pas retomber le tableau dans son squelette. */}
      {vue === 'classement' && linkId ? (
        <Suspense fallback={null}>
          <LinkDetailDialog linkId={linkId} data={data} period={period} />
        </Suspense>
      ) : null}
    </div>
  )
}

async function MktLiensContent({
  data,
  vue,
  linkId,
  reseau,
  modeleRaw,
  period,
}: {
  data: Promise<MktLinksData>
  vue: MktLiensVue
  linkId: string | null
  reseau: ReturnType<typeof parseReseau>
  modeleRaw: string | undefined
  period: ReturnType<typeof resolvePeriod>
}) {
  const [d, groups] = await Promise.all([data, getMktGroups()])
  const modele = parseModele(modeleRaw, d.links)
  const modeles = modeleOptions(d.links)
  let detail: Parameters<typeof MktLiensTemplate>[0]['detail'] = null
  if (vue === 'graph') {
    // La sélection est tranchée par UNE règle pure, partagée avec les sélecteurs : réseau puis
    // modèle bornent les liens proposés, et un lien hors de cette sélection retombe sur « tous ».
    const sel = resolveGraphSelection(d.links, reseau, modele, linkId ?? ALL)
    // Le classement doit être connu pour résoudre la sélection : les deux lectures s'enchaînent
    // donc ici au lieu de partir ensemble. `null` quand TOUT est retenu — on ne filtre alors pas
    // la requête plutôt que d'y écrire 183 uuid.
    const ids = sel.selected.length === d.links.length ? null : sel.selected.map((l) => l.id)
    detail = { ...sel, points: await getLinkDaily(ids, period) }
  }
  return (
    <MktLiensTemplate
      data={d}
      vue={vue}
      modele={modele}
      modeleOptions={modeles}
      groups={groups}
      detail={detail}
    />
  )
}

/**
 * La modale du classement. Elle réutilise la promesse `data` DÉJÀ lancée pour le tableau (React
 * la dédoublonne) : seule la série journalière est vraiment attendue ici.
 *
 * Un `?lien=` bien formé mais inconnu — lien supprimé, ou hors du périmètre RLS de l'appelant —
 * ne rend RIEN plutôt qu'une modale vide : la page reste celle du tableau.
 */
async function LinkDetailDialog({
  linkId,
  data,
  period,
}: {
  linkId: string
  data: Promise<MktLinksData>
  period: ReturnType<typeof resolvePeriod>
}) {
  const d = await data
  const link = d.links.find((l) => l.id === linkId)
  if (!link) return null
  return <LinkDailyDialog link={link} points={await getLinkDaily([linkId], period)} />
}
