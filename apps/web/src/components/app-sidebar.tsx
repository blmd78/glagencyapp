'use client'

import { useEffect, useMemo } from 'react'
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
import { WORKSPACES, workspaceForPath, navSlug, isMarketingSlug } from '@/config/workspaces'
import { WorkspaceSwitcher } from '@/components/workspace-switcher'
import { NavUser } from '@/components/nav-user'
import { useNavTransition } from '@/components/nav-transition-context'
import { withPeriod } from '@/lib/nav'

export function AppSidebar({
  userEmail,
  isAdmin,
  allowedPages,
  insightsCount = 0,
  workLink = '',
}: {
  userEmail: string
  isAdmin?: boolean
  /** Slugs autorisés pour un rôle `user` (ignoré si admin). */
  allowedPages?: string[]
  /** Cartes insights « à traiter » (badge sur l'onglet Insights). */
  insightsCount?: number
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
  const prefetchFull = (href: string) =>
    (router.prefetch as (href: string, opts?: { kind: 'auto' | 'full' | 'temporary' }) => void)(
      href,
      { kind: 'full' },
    )
  const prefetchOnHover = prefetchFull
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
  const items = active.nav.filter((item) =>
    isAdmin ? true : !item.adminOnly && (allowedPages ?? []).includes(navSlug(item)),
  )
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

  // Préchargement de FOND de tous les onglets visibles : sweep initial UNE route à la
  // fois (400 ms d'écart — jamais de rafale concurrente, cause de l'Error 1102 d'origine),
  // puis boucle lente (~5 s/route) pour rester dans la fenêtre staleTimes de 60 s.
  // Résultat : après quelques secondes sur la première page, chaque clic d'onglet est
  // servi depuis le cache client (0 aller-retour serveur, 0 loterie cold start). Le cache
  // de segments de Next dédoublonne : re-précharger une entrée fraîche ne refait PAS de
  // requête. Effet de bord bienvenu : le trafic régulier garde des isolates chauds.
  const allHrefs = useMemo(
    () => items.map((i) => withPeriod(i.href, searchParams)),
    [items, searchParams],
  )
  useEffect(() => {
    let i = 0
    let stop = false
    let t: ReturnType<typeof setTimeout>
    const tick = () => {
      if (stop) return
      const href = allHrefs[i % allHrefs.length]
      if (href && !isActivePath(href)) prefetchFull(href)
      i++
      t = setTimeout(tick, i < allHrefs.length ? 400 : 5000)
    }
    t = setTimeout(tick, 800)
    return () => {
      stop = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relancer le sweep quand la
    // liste d'onglets change suffit ; pathname/prefetch sont stables ou lus à la volée.
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
        {item.href.endsWith('/insights') && insightsCount > 0 && (
          <SidebarMenuBadge>{insightsCount}</SidebarMenuBadge>
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
