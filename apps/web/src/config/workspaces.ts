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
  Banknote,
  CalendarClock,
  ChartLine,
  UsersRound,
  Briefcase,
  Globe,
  TriangleAlert,
  Archive,
  ScrollText,
  KeyRound,
  Ghost,
  IdCard,
} from 'lucide-react'

export interface NavItem {
  /** Slug d'accès explicite (sinon dérivé du dernier segment de l'href). */
  slug?: string
  href: string
  label: string
  icon: LucideIcon
  adminOnly?: boolean
  /** Réservé aux propriétaires (rôle superadmin) — ex. Membres (gestion des accès). */
  superadminOnly?: boolean
  /** Item adminOnly AUSSI visible des managers (ex. Membres face chatteurs). */
  managerAccess?: boolean
  /** Sous-onglet (id d'un NavGroup de la face) — sans groupe, l'item est affiché direct. */
  group?: string
  /** Item direct rendu SOUS les sous-onglets (ex. Membres), au lieu d'au-dessus. */
  bottom?: boolean
}

/** Sous-onglet dépliable de la sidebar (« Performance › », « Équipe › »…). */
export interface NavGroup {
  id: string
  label: string
  icon: LucideIcon
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
  /** Sous-onglets, dans l'ordre d'affichage (les items sans `group` restent au-dessus). */
  groups?: NavGroup[]
}

export const WORKSPACES: Workspace[] = [
  {
    id: 'chatter',
    label: 'Chatteurs',
    subtitle: 'Performance',
    icon: MessageSquare,
    basePath: '/chatter',
    // Sous-onglets de la sidebar — un item sans `group` (Overview, Insights) reste direct.
    groups: [
      { id: 'performance', label: 'Performance', icon: ChartLine },
      { id: 'equipe', label: 'Équipe', icon: UsersRound },
      { id: 'acces', label: 'Accès', icon: KeyRound },
      { id: 'spenders', label: 'Spenders', icon: Banknote },
      { id: 'gestion', label: 'Gestion', icon: Briefcase },
    ],
    nav: [
      { href: '/chatter/overview', label: 'Overview', icon: LayoutDashboard },
      { href: '/chatter/insights', label: 'Insights', icon: Lightbulb },
      { href: '/chatter/bilan', label: 'Bilan', icon: CalendarCheck, group: 'performance' },
      // Planning journalier des sous-managers : chacun voit LE SIEN, seuls les admins éditent.
      { href: '/chatter/planning', label: 'Planning', icon: CalendarClock, group: 'equipe' },
      { href: '/chatter/repos', label: 'Planning repos', icon: CalendarOff, group: 'equipe' },
      { href: '/chatter/police', label: 'Police', icon: ShieldAlert, group: 'equipe' },
      { href: '/chatter/chatters', label: 'Chatters', icon: MessageSquare, group: 'equipe' },
      { href: '/chatter/modeles', label: 'Modèles', icon: Users, group: 'equipe' },
      // Groupe Accès (porté de gla-workflow) : identifiants Snapchat (admin) + fiches modèles.
      { href: '/chatter/codes-snap', label: 'Codes Snap', icon: Ghost, adminOnly: true, group: 'acces' },
      { href: '/chatter/infos-modeles', label: 'Infos modèles', icon: IdCard, group: 'acces' },
      // Sous-catégorie Spenders (CRM closing). Toutes les sous-pages partagent le droit
      // `crm-spenders` (slug explicite, aligné sur la RLS de 0029).
      { href: '/chatter/spenders/liste', label: 'Liste', icon: Banknote, slug: 'crm-spenders', group: 'spenders' },
      { href: '/chatter/spenders/tracker', label: 'À relancer', icon: Send, slug: 'crm-spenders', group: 'spenders' },
      { href: '/chatter/spenders/alertes', label: 'Alertes R10', icon: TriangleAlert, slug: 'crm-spenders', group: 'spenders' },
      { href: '/chatter/spenders/archive', label: 'Archive', icon: Archive, slug: 'crm-spenders', group: 'spenders' },
      { href: '/chatter/stats', label: 'Stats', icon: ChartColumn, group: 'performance' },
      { href: '/chatter/health', label: 'Santé (LTV)', icon: HeartPulse, group: 'performance' },
      // adminOnly : la config des seuils/exclusions est admin (écritures requireAdmin,
      // et `teams` est admin-only en RLS — un user y verrait une page vide).
      { href: '/chatter/quotas', label: 'Quotas', icon: Target, adminOnly: true, group: 'performance' },
      // Reconstruit (WIP session parallèle) : scripts de chat par modèle — consultation membres.
      { href: '/chatter/scripts', label: 'Scripts', icon: ScrollText, slug: 'scripts', group: 'equipe' },
      { href: '/chatter/compta', label: 'Compta', icon: Calculator, group: 'gestion' },
      { href: '/chatter/members', label: 'Membres', icon: UserCog, adminOnly: true, managerAccess: true, bottom: true },
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
    groups: [
      { id: 'reseaux', label: 'Réseaux', icon: Globe },
      { id: 'gestion', label: 'Gestion', icon: Briefcase },
    ],
    nav: [
      { href: '/marketing/overview', label: 'Overview', icon: LayoutDashboard, slug: 'mkt-overview' },
      { href: '/marketing/liens', label: 'Liens tracking', icon: Link2, slug: 'mkt-liens', group: 'reseaux' },
      { href: '/marketing/instagram', label: 'Instagram', icon: Instagram, slug: 'mkt-instagram', group: 'reseaux' },
      { href: '/marketing/twitter', label: 'Twitter / X', icon: Twitter, slug: 'mkt-twitter', group: 'reseaux' },
      { href: '/marketing/telegram', label: 'Telegram', icon: Send, slug: 'mkt-telegram', group: 'reseaux' },
      // Même patron que la face chatteurs : « VA » = les fiches (comme « Chatters »),
      // la Compta ne fait que payer.
      { href: '/marketing/staff', label: 'VA', icon: Users, slug: 'mkt-staff', group: 'gestion' },
      { href: '/marketing/compta', label: 'Compta', icon: Wallet, slug: 'mkt-compta', group: 'gestion' },
      { href: '/marketing/members', label: 'Membres', icon: UserCog, adminOnly: true, bottom: true },
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
export const PAGE_SLUGS = ['overview', 'insights', 'bilan', 'planning', 'repos', 'police', 'chatters', 'infos-modeles', 'crm-spenders', 'scripts', 'modeles', 'stats', 'health', 'compta', 'marketing', 'mkt-overview', 'mkt-liens', 'mkt-instagram', 'mkt-twitter', 'mkt-telegram', 'mkt-staff', 'mkt-compta'] as const
export type PageSlug = (typeof PAGE_SLUGS)[number]

/**
 * Pages cochables dans la gestion des membres (= nav non-admin). Dédupliquées par slug :
 * plusieurs sous-pages peuvent partager un droit (ex. le groupe Spenders) → une seule case,
 * libellée par le groupe.
 */
export const PAGE_CHOICES = (() => {
  const slugOf = (n: NavItem) => (n.slug ?? pageSlug(n.href)) as string
  const items = DEFAULT_WORKSPACE.nav.filter(
    (n) => !n.adminOnly && (PAGE_SLUGS as readonly string[]).includes(slugOf(n)),
  )
  const shared = new Map<string, number>()
  for (const n of items) shared.set(slugOf(n), (shared.get(slugOf(n)) ?? 0) + 1)
  const groupOf = new Map((DEFAULT_WORKSPACE.groups ?? []).map((g) => [g.id, g]))
  const seen = new Set<string>()
  const out: { slug: PageSlug; label: string; icon: LucideIcon }[] = []
  for (const n of items) {
    const slug = slugOf(n) as PageSlug
    if (seen.has(slug)) continue
    seen.add(slug)
    // Slug partagé par plusieurs sous-pages → libellé/icône du groupe (ex. « Spenders »).
    const g = (shared.get(slug) ?? 0) > 1 && n.group ? groupOf.get(n.group) : undefined
    out.push({ slug, label: g?.label ?? n.label, icon: g?.icon ?? n.icon })
  }
  return out
})()

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
