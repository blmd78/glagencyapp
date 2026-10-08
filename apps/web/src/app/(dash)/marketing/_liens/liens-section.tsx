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
  liensVue,
  parseReseau,
  reseauOptions,
  resolveGraphSelection,
} from '@/features/marketing-liens/link-options'
import { SFS_GROUP_KEY, type MktScope } from '@/lib/mkt-sfs'
import type { Period } from '@/lib/period'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MktLinksData } from '@/features/marketing-liens/types'
import type { UrlTab } from '@/components/url-tabs'

/** `?lien=` vient de l'URL : un id malformé irait lever une 22P02 sur une colonne uuid. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface LiensSearchParams {
  from?: string
  to?: string
  lien?: string
  vue?: string
  reseau?: string
  modele?: string
}

/**
 * Le classement et le graphique des liens, avec la modale du détail — partagés par la page
 * Liens tracking (`externe` : sans les SFS) et l'onglet SFS (`sfs` : les SFS seuls), cf.
 * `lib/mkt-sfs.ts`. Les lectures restent côté `app/` (convention : aucun fetch dans une feature) ;
 * le dossier `_liens` n'est pas une route.
 *
 * `lead` : un onglet posé avant Classement et Graphique, ouvert par défaut (la « Vue d'ensemble »
 * de l'onglet SFS) ; son contenu est fourni par la page, qui ne le lit que s'il est affiché.
 */
export function LiensSection({
  sp,
  period,
  scope,
  lead,
}: {
  sp: LiensSearchParams
  period: Period
  scope: MktScope
  lead?: UrlTab
}) {
  const vue = liensVue(sp.vue, lead?.value)
  // `?reseau=` et `?modele=` se valident contre ce qui est CHARGÉ (les groupes, les liens), donc
  // plus bas, une fois la lecture résolue — on ne fait ici que transmettre le brut.
  // Kickoff SANS await : le shell de la page s'affiche immédiatement, KPIs + table streament
  // dans leur boundary quand la lecture répond.
  const data = getMktLinks(period, scope)
  const linkId = sp.lien && UUID.test(sp.lien) ? sp.lien : null

  return (
    <>
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
          lead={lead}
          linkId={linkId}
          reseauRaw={sp.reseau}
          modeleRaw={sp.modele}
          period={period}
          scope={scope}
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
    </>
  )
}

async function MktLiensContent({
  data,
  vue,
  lead,
  linkId,
  reseauRaw,
  modeleRaw,
  period,
  scope,
}: {
  data: Promise<MktLinksData>
  vue: string
  lead: UrlTab | undefined
  linkId: string | null
  reseauRaw: string | undefined
  modeleRaw: string | undefined
  period: Period
  scope: MktScope
}) {
  const [d, groups] = await Promise.all([data, getMktGroups()])
  // Réseaux du PÉRIMÈTRE — mêmes pour les options et pour valider `?reseau=` : Liens tracking ne
  // propose jamais SFS, l'onglet SFS ne propose que « tous » (= les SFS). `groups` reste entier :
  // il nomme et colore, et le badge d'un lien doit pouvoir l'envoyer dans SFS ou l'en sortir.
  const reseauGroups = scope === 'sfs' ? [] : groups.filter((g) => g.key !== SFS_GROUP_KEY)
  const reseau = parseReseau(reseauRaw, reseauGroups)
  const modele = parseModele(modeleRaw, d.links)
  const modeles = modeleOptions(d.links)
  let detail: Parameters<typeof MktLiensTemplate>[0]['detail'] = null
  if (vue === 'graph') {
    // La sélection est tranchée par UNE règle pure, partagée avec les sélecteurs : réseau puis
    // modèle bornent les liens proposés, et un lien hors de cette sélection retombe sur « tous ».
    const sel = resolveGraphSelection(d.links, reseau, modele, linkId ?? ALL)
    // Le classement doit être connu pour résoudre la sélection : les deux lectures s'enchaînent
    // donc ici au lieu de partir ensemble. `null` quand TOUT le périmètre est retenu — on ne
    // filtre alors pas la requête plutôt que d'y écrire 183 uuid ; `scope` fait le tri après.
    const ids = sel.selected.length === d.links.length ? null : sel.selected.map((l) => l.id)
    detail = { ...sel, reseauOptions: reseauOptions(reseauGroups), points: await getLinkDaily(ids, period, scope) }
  }
  return (
    <MktLiensTemplate
      data={d}
      vue={vue}
      lead={lead}
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
 * Un `?lien=` bien formé mais inconnu — lien supprimé, hors du périmètre RLS de l'appelant, ou
 * d'un autre périmètre (un SFS sur la page Liens) — ne rend RIEN plutôt qu'une modale vide.
 */
async function LinkDetailDialog({
  linkId,
  data,
  period,
}: {
  linkId: string
  data: Promise<MktLinksData>
  period: Period
}) {
  const [d, groups] = await Promise.all([data, getMktGroups()])
  const link = d.links.find((l) => l.id === linkId)
  if (!link) return null
  return <LinkDailyDialog link={link} groups={groups} points={await getLinkDaily([linkId], period)} />
}
