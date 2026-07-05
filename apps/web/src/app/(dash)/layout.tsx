import { Suspense, type ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { getOpenInsightsCount } from '@/features/insights/services/get-insights'
import { AppSidebar } from '@/components/app-sidebar'
import { DateRangePicker } from '@/components/date-range-picker'
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
      <AppSidebar
        userEmail={profile.email ?? ''}
        isAdmin={profile.role === 'admin'}
        allowedPages={profile.pages}
        insightsCount={insightsCount}
      />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-medium">glagency</span>
          <div className="ml-auto flex items-center gap-2">
            <Suspense fallback={<div className="h-8 w-44 rounded-md border bg-muted/40" />}>
              <DateRangePicker />
            </Suspense>
          </div>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
