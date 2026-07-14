'use client'

import { useRef } from 'react'
import Link, { useLinkStatus } from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight, Loader2 } from 'lucide-react'
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
import { withPeriod } from '@/lib/nav'

/**
 * Spinner sur l'onglet cliqué pendant la navigation : feedback à 0 ms même quand le
 * serveur est froid (cold start Workers 2-3 s) — l'utilisateur voit que le clic est pris.
 * useLinkStatus doit vivre DANS le <Link> concerné.
 */
function LinkPending() {
  const { pending } = useLinkStatus()
  return pending ? (
    <Loader2 className="ml-auto size-3.5 shrink-0 animate-spin text-muted-foreground" />
  ) : null
}

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
  // Prefetch AU SURVOL (et non au mount) : le prefetch par défaut de <Link> précharge les
  // ~12 routes de la sidebar d'un coup → rafale d'invocations concurrentes sur Workers Free
  // (Error 1102). Au survol, UNE route part à la fois, ~200 ms avant le clic → le fallback
  // (loading.tsx) s'affiche instantanément au clic au lieu d'attendre le premier octet.
  const prefetched = useRef(new Set<string>())
  const prefetchOnHover = (href: string) => {
    if (prefetched.current.has(href)) return
    prefetched.current.add(href)
    router.prefetch(href)
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

  const renderDirect = (item: (typeof items)[number]) => {
    const Icon = item.icon
    const href = withPeriod(item.href, searchParams)
    return (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton asChild isActive={isActivePath(item.href)} tooltip={item.label}>
          {/* prefetch=false + prefetch au survol : cf. prefetchOnHover ci-dessus. */}
          <Link href={href} prefetch={false} onMouseEnter={() => prefetchOnHover(href)}>
            <Icon />
            <span>{item.label}</span>
            <LinkPending />
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
                                <Link href={href} prefetch={false} onMouseEnter={() => prefetchOnHover(href)}>
                                  <Icon />
                                  <span>{item.label}</span>
                                  <LinkPending />
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
