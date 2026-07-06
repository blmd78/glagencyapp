import type { LucideIcon } from 'lucide-react'
import {
  CalendarCheck,
  LayoutDashboard,
  Lightbulb,
  MessageSquare,
  Users,
  HeartPulse,
  Target,
  Calculator,
  UserCog,
  Megaphone,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  adminOnly?: boolean
}

/** Une « face » du CRM (Chatteurs, Marketing…). Sa nav et son préfixe d'URL lui sont propres. */
export interface Workspace {
  id: 'chatter' | 'marketing'
  label: string
  /** Sous-titre affiché dans le switcher (façon « Enterprise »). */
  subtitle: string
  icon: LucideIcon
  /** Préfixe d'URL : la face active se déduit du pathname. */
  basePath: string
  nav: NavItem[]
}

export const WORKSPACES: Workspace[] = [
  {
    id: 'chatter',
    label: 'Chatteurs',
    subtitle: 'Performance',
    icon: MessageSquare,
    basePath: '/chatter',
    nav: [
      { href: '/chatter/overview', label: 'Overview', icon: LayoutDashboard },
      { href: '/chatter/insights', label: 'Insights', icon: Lightbulb },
      { href: '/chatter/bilan', label: 'Bilan', icon: CalendarCheck },
      { href: '/chatter/chatters', label: 'Chatters', icon: MessageSquare },
      { href: '/chatter/modeles', label: 'Modèles', icon: Users },
      { href: '/chatter/health', label: 'Santé (LTV)', icon: HeartPulse },
      // adminOnly : la config des seuils/exclusions est admin (écritures requireAdmin,
      // et `teams` est admin-only en RLS — un user y verrait une page vide).
      { href: '/chatter/quotas', label: 'Quotas', icon: Target, adminOnly: true },
      { href: '/chatter/compta', label: 'Compta', icon: Calculator },
      { href: '/chatter/members', label: 'Membres', icon: UserCog, adminOnly: true },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    subtitle: 'Acquisition',
    icon: Megaphone,
    basePath: '/marketing',
    // TODO: à définir (contenu Marketing encore inconnu).
    nav: [],
  },
]

export const DEFAULT_WORKSPACE = WORKSPACES[0]

/** Slug d'accès d'une page = dernier segment de son href (`/chatter/modeles` → `modeles`). */
export const pageSlug = (href: string) => href.split('/').pop() as string

/**
 * Slugs assignables à un rôle `user` — SOURCE UNIQUE, typée : `requireAccess(slug)` n'accepte
 * que ces valeurs (un renommage de route casse à la compilation, pas en silence).
 */
export const PAGE_SLUGS = ['overview', 'insights', 'bilan', 'chatters', 'modeles', 'health', 'compta'] as const
export type PageSlug = (typeof PAGE_SLUGS)[number]

/** Pages cochables dans la gestion des membres (= nav non-admin, dans l'ordre de la sidebar). */
export const PAGE_CHOICES = DEFAULT_WORKSPACE.nav
  .filter((n) => !n.adminOnly && (PAGE_SLUGS as readonly string[]).includes(pageSlug(n.href)))
  .map((n) => ({ slug: pageSlug(n.href) as PageSlug, label: n.label, icon: n.icon }))

/** Face active déduite de l'URL (fallback : face par défaut). */
export function workspaceForPath(pathname: string): Workspace {
  return (
    WORKSPACES.find(
      (w) => pathname === w.basePath || pathname.startsWith(w.basePath + '/'),
    ) ?? DEFAULT_WORKSPACE
  )
}

/** Home d'une face = sa 1ʳᵉ entrée de nav, sinon son basePath. */
export function workspaceHome(w: Workspace): string {
  return w.nav[0]?.href ?? w.basePath
}
