'use client'

import { Suspense, use, useEffect, useEffectEvent, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { WORKSPACES, workspaceForPath, canAccessNav, isMarketingSlug, type NavAccess } from '@/config/workspaces'
import { WorkspaceSwitcher } from '@/components/workspace-switcher'
import { NavUser } from '@/components/nav-user'
import { useNavTransition } from '@/components/nav-transition-context'
import { prefetchFull, withPeriod } from '@/lib/nav'

/**
 * Badge « à traiter » : lit la promesse du layout via use() sous Suspense — le compteur
 * streame APRÈS le shell au lieu de bloquer le premier octet de toutes les pages.
 */
function InsightsBadge({ promise }: { promise: Promise<number> }) {
  const count = use(promise)
  return count > 0 ? <SidebarMenuBadge>{count}</SidebarMenuBadge> : null
}

export function AppSidebar({
  userEmail,
  isAdmin,
  isSuperadmin,
  isManager,
  allowedPages,
  insightsCountPromise,
  workLink = '',
}: {
  userEmail: string
  isAdmin?: boolean
  /** Propriétaire (rôle superadmin) — seul à voir les items superadminOnly (Membres). */
  isSuperadmin?: boolean
  /** Rôle manager : voit en plus les items adminOnly marqués managerAccess (Membres). */
  isManager?: boolean
  /** Slugs autorisés pour un rôle `user` (ignoré si admin). */
  allowedPages?: string[]
  /** Cartes insights « à traiter » (badge streamé hors du chemin bloquant du layout). */
  insightsCountPromise?: Promise<number>
  /** Lien « outil de travail » du membre connecté ('' = aucun). */
  workLink?: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { state, isMobile, setOpen } = useSidebar()
  // Prefetch COMPLET (kind:'full') : par défaut, Next ne précharge que la coquille
  // (loading.tsx) des routes dynamiques — le clic repartait quand même au serveur, donc
  // à la loterie du cold start Workers (2-3 s). 'full' précharge le contenu ENTIER :
  // dans la fenêtre staleTimes (60 s), le clic est servi 100 % depuis le cache client.
  const prefetchOnHover = (href: string) => prefetchFull(router, href)
  // Navigation via transition : l'overlay pleine page (cf. nav-transition.tsx) apparaît à
  // 0 ms au clic. Les clics modifiés (cmd/ctrl/shift = nouvel onglet…) gardent le natif.
  // navCtx null (provider absent, chunk périmé) → on laisse le <Link> naviguer nativement.
  const navCtx = useNavTransition()
  const navClick = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!navCtx || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    navCtx.navigate(href)
  }
  const active = workspaceForPath(pathname)
  // Chaque item se filtre par SON slug (les pages marketing portent des slugs mkt-*
  // pour ne pas entrer en collision avec ceux de la face chatteurs : overview, compta…).
  // Mémoïsé sur des PRIMITIVES : sans ça, `items` (et allHrefs) changeaient d'identité à
  // chaque re-rendu de la sidebar et l'effet du sweep se relançait en permanence.
  const pagesKey = (allowedPages ?? []).join(',')
  const period = `${searchParams.get('from') ?? ''}|${searchParams.get('to') ?? ''}`
  const items = useMemo(() => {
    const access: NavAccess = {
      isAdmin: !!isAdmin,
      isSuperadmin: !!isSuperadmin,
      isManager: !!isManager,
      pages: new Set(pagesKey ? pagesKey.split(',') : []),
    }
    return active.nav.filter((item) => canAccessNav(item, access))
  }, [active, isAdmin, isSuperadmin, isManager, pagesKey])
  // Items directs au-dessus, puis les sous-onglets, puis les directs `bottom` (Membres) —
  // un groupe sans item visible disparaît.
  const directTop = items.filter((i) => !i.group && !i.bottom)
  const directBottom = items.filter((i) => !i.group && i.bottom)
  const groups = (active.groups ?? [])
    .map((g) => ({ ...g, items: items.filter((i) => i.group === g.id) }))
    .filter((g) => g.items.length > 0)
  const workspaces = WORKSPACES.filter(
    (w) => isAdmin || w.id !== 'marketing' || (allowedPages ?? []).some(isMarketingSlug),
  )

  const isActivePath = (href: string) => pathname === href || pathname.startsWith(href + '/')

  // Préchargement de FOND de tous les onglets visibles. Règles issues de l'audit perf :
  // démarre APRÈS window load + idle (le sweep concurrençait le chargement critique du
  // hard load — ~1 Mo + 17 rendus serveur dans la fenêtre des 4 s), routes lourdes
  // (spenders) en FIN de sweep, une route à la fois (jamais de rafale — Error 1102),
  // cadence calée sur la fraîcheur du full-prefetch (~300 s — défaut interne
  // staleTimes.static de Next sous Cache Components) : cycle ≤ ~250 s. Onglet caché :
  // pause. Pas de préchauffage sur connexion contrainte (saveData/2g).
  const allHrefs = useMemo(() => {
    const sp = new URLSearchParams()
    const [from, to] = period.split('|')
    if (from) sp.set('from', from)
    if (to) sp.set('to', to)
    const heavy = (href: string) => Number(href.startsWith('/chatter/spenders/'))
    return [...items]
      .sort((a, b) => heavy(a.href) - heavy(b.href))
      .map((i) => withPeriod(i.href, sp))
  }, [items, period])
  // Effect Event (React 19.2) : lit isActivePath/router À JOUR à chaque tick sans relancer le
  // sweep. Sans ça, isActivePath était capturé périmé (closure) → la page active pouvait se
  // re-précharger ; l'ajouter aux deps aurait relancé le sweep à chaque navigation.
  const prefetchIfInactive = useEffectEvent((href: string) => {
    if (!isActivePath(href.split('?')[0])) prefetchFull(router, href)
  })
  useEffect(() => {
    const conn = (
      navigator as { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection
    if (conn?.saveData || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') return

    let i = 0
    let stop = false
    let t: ReturnType<typeof setTimeout> | undefined
    let hiddenAt = 0
    const steady = Math.max(4000, Math.floor(250_000 / Math.max(1, allHrefs.length)))
    const tick = () => {
      if (stop) return
      if (!document.hidden) {
        const href = allHrefs[i % allHrefs.length]
        // Comparaison sur le pathname SEUL : href porte ?from&to — sans strip, la page
        // ACTIVE elle-même se re-préchargeait en rendu serveur complet à chaque cycle.
        if (href) prefetchIfInactive(href)
        i++
      }
      // i < longueur = sweep rapide (démarrage OU re-sweep de retour d'absence).
      t = setTimeout(tick, i < allHrefs.length ? 400 : steady)
    }
    const startAfterIdle = () => {
      if (stop) return
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(
          () => {
            if (!stop) t = setTimeout(tick, 200)
          },
          { timeout: 4000 },
        )
      } else {
        t = setTimeout(tick, 1500)
      }
    }
    // Retour après une vraie absence (> 4 min ≈ fenêtre de fraîcheur, cache expiré) :
    // re-sweep ÉCLAIR — UNE reprise re-précharge tout, au lieu de re-payer chaque lien
    // un par un. (Le premier prefetch réveille la fonction serveur au passage — plus
    // besoin de ping dédié depuis la bascule Vercel.)
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now()
        return
      }
      if (hiddenAt && Date.now() - hiddenAt > 240_000) {
        i = 0
        clearTimeout(t)
        t = setTimeout(tick, 100)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    if (document.readyState === 'complete') startAfterIdle()
    else window.addEventListener('load', startAfterIdle, { once: true })
    return () => {
      stop = true
      clearTimeout(t)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('load', startAfterIdle)
    }
    // Relancer le sweep quand la liste d'onglets change suffit ; l'accès frais à
    // isActivePath/router passe par prefetchIfInactive (useEffectEvent), donc hors deps.
  }, [allHrefs])

  const renderDirect = (item: (typeof items)[number]) => {
    const Icon = item.icon
    const href = withPeriod(item.href, searchParams)
    return (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton asChild isActive={isActivePath(item.href)} tooltip={item.label}>
          {/* prefetch=false + prefetch au survol : cf. prefetchOnHover ci-dessus. */}
          <Link href={href} prefetch={false} onMouseEnter={() => prefetchOnHover(href)} onClick={navClick(href)}>
            <Icon />
            <span>{item.label}</span>
          </Link>
        </SidebarMenuButton>
        {item.href.endsWith('/insights') && insightsCountPromise && (
          <Suspense fallback={null}>
            <InsightsBadge promise={insightsCountPromise} />
          </Suspense>
        )}
      </SidebarMenuItem>
    )
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher workspaces={workspaces} active={active} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {directTop.map(renderDirect)}
            {groups.map((group) => {
              const GroupIcon = group.icon
              // Le sous-onglet contenant la page active est ouvert au chargement.
              const containsActive = group.items.some((i) => isActivePath(i.href))
              return (
                <Collapsible
                  key={group.id}
                  asChild
                  defaultOpen={containsActive}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip={group.label}
                        isActive={containsActive}
                        // Mode icône : les sous-items sont masqués par CSS → un clic sur le
                        // groupe DÉPLIE la sidebar au lieu de toggler dans le vide
                        // (preventDefault : Radix saute son toggle si defaultPrevented).
                        onClick={(e) => {
                          if (state === 'collapsed' && !isMobile) {
                            e.preventDefault()
                            setOpen(true)
                          }
                        }}
                      >
                        <GroupIcon />
                        <span>{group.label}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {group.items.map((item) => {
                          const Icon = item.icon
                          const href = withPeriod(item.href, searchParams)
                          return (
                            <SidebarMenuSubItem key={item.href}>
                              <SidebarMenuSubButton asChild isActive={isActivePath(item.href)}>
                                {/* Même règle prefetch survol que les items directs. */}
                                <Link href={href} prefetch={false} onMouseEnter={() => prefetchOnHover(href)} onClick={navClick(href)}>
                                  <Icon />
                                  <span>{item.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )
            })}
            {directBottom.map(renderDirect)}
            {items.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                Bientôt
              </p>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser email={userEmail} workLink={workLink} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
