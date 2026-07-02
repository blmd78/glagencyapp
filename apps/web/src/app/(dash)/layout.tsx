import { Suspense, type ReactNode } from 'react'
import { requireUser } from '@/lib/auth'
import { AppSidebar } from '@/components/app-sidebar'
import { DateRangePicker } from '@/components/date-range-picker'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'

export default async function DashLayout({ children }: { children: ReactNode }) {
  const user = await requireUser()
  const isAdmin = true // TODO: lire le rôle dans `profiles` une fois la table créée

  return (
    <SidebarProvider>
      <AppSidebar userEmail={user.email ?? ''} isAdmin={isAdmin} />
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
