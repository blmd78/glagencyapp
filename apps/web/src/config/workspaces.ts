import type { LucideIcon } from 'lucide-react'
import {
  Send,
  Instagram,
  Link2,
  Twitter,
  Wallet,
  ChartColumn,
  CalendarOff,
  CalendarCheck,
  ShieldAlert,
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
  /** Slug d'accès explicite (sinon dérivé du dernier segment de l'href). */
  slug?: string
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
      { href: '/chatter/repos', label: 'Planning repos', icon: CalendarOff },
      { href: '/chatter/police', label: 'Police', icon: ShieldAlert },
      { href: '/chatter/chatters', label: 'Chatters', icon: MessageSquare },
      { href: '/chatter/modeles', label: 'Modèles', icon: Users },
      { href: '/chatter/stats', label: 'Stats', icon: ChartColumn },
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
    // Accès au pôle : droit UNIQUE `marketing` (accordé depuis /marketing/members) —
    // le filtrage sidebar est fait au niveau de la face, pas page par page.
    nav: [
      { href: '/marketing/overview', label: 'Overview', icon: LayoutDashboard, slug: 'mkt-overview' },
      { href: '/marketing/liens', label: 'Liens tracking', icon: Link2, slug: 'mkt-liens' },
      { href: '/marketing/instagram', label: 'Instagram', icon: Instagram, slug: 'mkt-instagram' },
      { href: '/marketing/twitter', label: 'Twitter / X', icon: Twitter, slug: 'mkt-twitter' },
      { href: '/marketing/telegram', label: 'Telegram', icon: Send, slug: 'mkt-telegram' },
      // Même patron que la face chatteurs : « VA » = les fiches (comme « Chatters »),
      // la Compta ne fait que payer.
      { href: '/marketing/staff', label: 'VA', icon: Users, slug: 'mkt-staff' },
      { href: '/marketing/compta', label: 'Compta', icon: Wallet, slug: 'mkt-compta' },
      { href: '/marketing/members', label: 'Membres', icon: UserCog, adminOnly: true },
    ],
  },
]

export const DEFAULT_WORKSPACE = WORKSPACES[0]

/** Slug d'accès d'une page = dernier segment de son href (`/chatter/modeles` → `modeles`). */
export const pageSlug = (href: string) => href.split('/').pop() as string

/**
 * Slugs assignables à un rôle `user` — SOURCE UNIQUE, typée : `requireAccess(slug)` n'accepte
 * que ces valeurs (un renommage de route casse à la compilation, pas en silence).
 */
export const PAGE_SLUGS = ['overview', 'insights', 'bilan', 'repos', 'police', 'chatters', 'modeles', 'stats', 'health', 'compta', 'marketing', 'mkt-overview', 'mkt-liens', 'mkt-instagram', 'mkt-twitter', 'mkt-telegram', 'mkt-staff', 'mkt-compta'] as const
export type PageSlug = (typeof PAGE_SLUGS)[number]

/** Pages cochables dans la gestion des membres (= nav non-admin, dans l'ordre de la sidebar). */
export const PAGE_CHOICES = DEFAULT_WORKSPACE.nav
  .filter((n) => !n.adminOnly && (PAGE_SLUGS as readonly string[]).includes(pageSlug(n.href)))
  .map((n) => ({ slug: pageSlug(n.href) as PageSlug, label: n.label, icon: n.icon }))

/** Pages cochables de la FACE MARKETING (slugs mkt-* — gérées depuis /marketing/members). */
export const MKT_PAGE_CHOICES = (WORKSPACES.find((w) => w.id === 'marketing')?.nav ?? [])
  .filter((n) => !n.adminOnly && n.slug)
  .map((n) => ({ slug: n.slug as PageSlug, label: n.label, icon: n.icon }))

/** Slug d'accès d'un item de nav (slug explicite sinon dérivé de l'href). */
export const navSlug = (n: NavItem) => n.slug ?? pageSlug(n.href)

/** Un slug appartient-il au périmètre marketing ? (droit de face inclus) */
export const isMarketingSlug = (slug: string) => slug === 'marketing' || slug.startsWith('mkt-')

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
