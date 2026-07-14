import { Suspense, type ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { getOpenInsightsCount } from '@/features/insights/services/get-insights'
import { AppSidebar } from '@/components/app-sidebar'
import { HeaderPeriod } from '@/components/header-period'
import { KeepAlive } from '@/components/keep-alive'
import { NavPendingOverlay, NavTransitionProvider } from '@/components/nav-transition'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'

export default async function DashLayout({ children }: { children: ReactNode }) {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  // Badge « à traiter » de l'onglet Insights (RLS-scopé : 0 pour un rôle user en v1).
  const insightsCount = await getOpenInsightsCount()

  return (
    <SidebarProvider>
      <NavTransitionProvider>
      <KeepAlive />
      <AppSidebar
        userEmail={profile.email ?? ''}
        isAdmin={profile.role === 'admin'}
        allowedPages={profile.pages}
        insightsCount={insightsCount}
        workLink={profile.workLink}
      />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-medium">glagency</span>
          <div className="ml-auto flex items-center gap-2">
            <Suspense fallback={<div className="h-8 w-44 rounded-md border bg-muted/40" />}>
              <HeaderPeriod />
            </Suspense>
          </div>
        </header>
        {/* `relative` : ancre l'overlay de navigation (loader pleine zone dès le clic). */}
        <div className="relative flex min-w-0 flex-1 flex-col gap-4 p-6">
          <NavPendingOverlay />
          {children}
        </div>
      </SidebarInset>
      </NavTransitionProvider>
    </SidebarProvider>
  )
}
