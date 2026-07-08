'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
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
  SidebarRail,
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
}: {
  userEmail: string
  isAdmin?: boolean
  /** Slugs autorisés pour un rôle `user` (ignoré si admin). */
  allowedPages?: string[]
  /** Cartes insights « à traiter » (badge sur l'onglet Insights). */
  insightsCount?: number
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const active = workspaceForPath(pathname)
  // Chaque item se filtre par SON slug (les pages marketing portent des slugs mkt-*
  // pour ne pas entrer en collision avec ceux de la face chatteurs : overview, compta…).
  const items = active.nav.filter((item) =>
    isAdmin ? true : !item.adminOnly && (allowedPages ?? []).includes(navSlug(item)),
  )
  const workspaces = WORKSPACES.filter(
    (w) => isAdmin || w.id !== 'marketing' || (allowedPages ?? []).some(isMarketingSlug),
  )

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher workspaces={workspaces} active={active} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {items.map((item) => {
              const Icon = item.icon
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                    <Link href={withPeriod(item.href, searchParams)}>
                      <Icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.href.endsWith('/insights') && insightsCount > 0 && (
                    <SidebarMenuBadge>{insightsCount}</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              )
            })}
            {items.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                Bientôt
              </p>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser email={userEmail} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
