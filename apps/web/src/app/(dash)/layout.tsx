import { Suspense, type ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { getOpenInsightsCount } from '@/features/insights/services/get-insights'
import { ImpersonationBanner } from '@/features/impersonation/components/impersonation-banner'
import { getImpersonationState } from '@/features/impersonation/read-state'
import { AppSidebar } from '@/components/app-sidebar'
import { HeaderPeriod } from '@/components/header-period'
import { LoadingDots } from '@/components/loading-dots'
import { NavPendingOverlay, NavTransitionProvider } from '@/components/nav-transition'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'

/**
 * Cache Components (PPR) : le layout externe est SANS accès runtime → il se pré-rend en
 * coquille statique servie instantanément ; tout ce qui dépend des cookies (profil,
 * badge, contenu) vit dans DashDynamic, streamé sous Suspense au moment de la requête.
 */
export default function DashLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh flex-1 items-center justify-center">
          <LoadingDots />
        </div>
      }
    >
      <DashDynamic>{children}</DashDynamic>
    </Suspense>
  )
}

async function DashDynamic({ children }: { children: ReactNode }) {
  // Le badge insights est SORTI du chemin bloquant : la promesse (non attendue) est
  // passée à la sidebar qui la lit via use() sous Suspense — le shell n'attend que le
  // profil, le badge streame ensuite. Vaut sur chaque hard load ET chaque réponse de
  // Server Action (ce layout re-rend aux deux).
  // .catch inline : une erreur du badge ne doit pas casser la page (0 = pas de badge).
  const insightsCountPromise = getOpenInsightsCount().catch(() => 0)
  const profile = await getProfile()
  if (!profile) redirect('/login')
  // Chargé UNE fois (peut rediriger si expiré/tripwire — cf. `getImpersonationState`) puis
  // partagé : `.active` au NavUser (sidebar), l'objet complet au bandeau. Ne pas dupliquer
  // l'appel — pendant une consultation active il fait un aller-retour DB à chaque navigation.
  const impersonationState = await getImpersonationState()

  return (
    <SidebarProvider>
      <NavTransitionProvider>
      <AppSidebar
        userEmail={profile.email ?? ''}
        isAdmin={profile.role === 'admin'}
        isSuperadmin={profile.superadmin}
        isManager={profile.manager}
        allowedPages={profile.pages}
        insightsCountPromise={insightsCountPromise}
        workLink={profile.workLink}
        impersonating={impersonationState.active}
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
        <ImpersonationBanner state={impersonationState} />
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
