'use client'

import { ChevronsUpDown, ExternalLink, LogOut, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

export function NavUser({
  email,
  workLink = '',
  impersonating = false,
}: {
  email: string
  /** Lien « outil de travail » du membre (posé par l'admin dans Membres) — '' = pas d'entrée. */
  workLink?: string
  /**
   * Consultation « en tant que » active (Task 9). Le navigateur porte alors la VRAIE session
   * forgée de la cible : un `signOut()` global la déconnecterait de TOUS ses appareils et
   * laisserait l'état d'impersonation orphelin. Quand `true`, le bouton quitte la
   * consultation (teardown via `/impersonation/stop`) au lieu de déconnecter.
   */
  impersonating?: boolean
}) {
  const router = useRouter()
  const { isMobile } = useSidebar()
  const { resolvedTheme, setTheme } = useTheme()
  const initials = (email.trim()[0] ?? '?').toUpperCase()
  // Libellé = domaine du lien (« notion.so », « t.me »…) ; l'URL complète en title.
  const workHost = (() => {
    try {
      return workLink ? new URL(workLink).hostname.replace(/^www\./, '') : null
    } catch {
      return null
    }
  })()

  async function logout() {
    // Import DYNAMIQUE : supabase-js complet (239 Ko bruts / 62 Ko gzip) ne sert ici qu'au
    // clic déconnexion — en import statique il partait dans le bundle critique de TOUTES
    // les pages du dash (mesuré à ~15 % du First Load JS gzip).
    const { createClient } = await import('@/lib/supabase/client')
    // scope 'local' : ne déconnecte que cet appareil (jamais toutes les sessions). Sécurité :
    // si une session forgée d'impersonation a survécu au cookie imp_sid (abandon > 8h), un
    // signOut global déconnecterait la vraie cible partout.
    await createClient().auth.signOut({ scope: 'local' })
    router.push('/login')
    router.refresh()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{email || 'Utilisateur'}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
              {email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {workHost && (
              <>
                <DropdownMenuItem asChild>
                  <a href={workLink} target="_blank" rel="noopener noreferrer" title={workLink}>
                    <ExternalLink />
                    <span className="truncate">Mon outil — {workHost}</span>
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {/* Icône/libellé pilotés par la classe `dark` (CSS) : aucun risque
                d'écart d'hydratation, pas besoin de garde `mounted`. */}
            <DropdownMenuItem
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            >
              <Moon className="dark:hidden" />
              <Sun className="hidden dark:block" />
              <span className="dark:hidden">Thème sombre</span>
              <span className="hidden dark:inline">Thème clair</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {impersonating ? (
              // Consultation en cours : JAMAIS de signout global (cf. doc prop ci-dessus).
              // Navigation simple (pas de <Link>) : un <Link> préchargerait cette route au
              // survol/apparition et déclencherait le teardown avant même le clic.
              <DropdownMenuItem asChild>
                <a href="/impersonation/stop">
                  <LogOut />
                  Quitter la consultation
                </a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={logout}>
                <LogOut />
                Déconnexion
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
