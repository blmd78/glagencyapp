'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
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
  const { state, isMobile, setOpen } = useSidebar()
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
    return (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton asChild isActive={isActivePath(item.href)} tooltip={item.label}>
          {/* prefetch=false : sans ça, Next pré-charge en RSC TOUS les liens
              visibles de la sidebar d'un coup (~12 routes × 2 → rafale
              d'invocations concurrentes sur le même isolate 128 Mo → Error 1102
              « exceededResources »). On charge la page seulement au clic. */}
          <Link href={withPeriod(item.href, searchParams)} prefetch={false}>
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
                          return (
                            <SidebarMenuSubItem key={item.href}>
                              <SidebarMenuSubButton asChild isActive={isActivePath(item.href)}>
                                {/* Même règle prefetch=false que les items directs. */}
                                <Link href={withPeriod(item.href, searchParams)} prefetch={false}>
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
