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
  // En PARALLÈLE : le badge est RLS-scopé par les cookies, il ne dépend pas du profil
  // (sans session il retourne 0 et le redirect part quand même). Ce layout re-rend à
  // chaque hard load ET à chaque réponse de Server Action → chaque vague séquentielle
  // économisée se sent sur toutes les actions.
  const [profile, insightsCount] = await Promise.all([getProfile(), getOpenInsightsCount()])
  if (!profile) redirect('/login')

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
