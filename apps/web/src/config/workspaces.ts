import type { Route } from 'next'
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
  NotebookPen,
  IdCard,
  ClipboardList,
  Trophy,
} from 'lucide-react'

export interface NavItem {
  /** Slug d'accès explicite (sinon dérivé du dernier segment de l'href). */
  slug?: string
  href: Route
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
      // Catégorie dédiée au tracker sanctions (ex-item direct du groupe Équipe) — slug/route
      // techniques inchangés (`police`, /chatter/police), seul l'affichage devient « Police ».
      { id: 'police', label: 'Police', icon: ShieldAlert },
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
      // Libellé affiché « Tracker » — slug/route/dossier restent `police` (renommer
      // casserait profiles.pages + policies RLS, cf. features/police/).
      { href: '/chatter/police', label: 'Tracker', icon: ShieldAlert, group: 'police' },
      { href: '/chatter/rapport-police', label: 'Rapport', icon: ClipboardList, slug: 'police', group: 'police' },
      { href: '/chatter/chatters', label: 'Chatters', icon: MessageSquare, group: 'equipe' },
      { href: '/chatter/modeles', label: 'Modèles', icon: Users, group: 'equipe' },
      // Groupe Accès (porté de gla-workflow) : identifiants Snapchat + fiches modèles.
      // codes-snap : page ASSIGNABLE (lecture) ; l'écriture reste admin (adminGuard + RLS).
      { href: '/chatter/codes-snap', label: 'Codes Snap', icon: Ghost, group: 'acces' },
      { href: '/chatter/infos-modeles', label: 'Infos modèles', icon: IdCard, group: 'acces' },
      // Sous-catégorie Spenders (CRM closing). Toutes les sous-pages partagent le droit
      // `crm-spenders` (slug explicite, aligné sur la RLS de 0031).
      { href: '/chatter/spenders/liste', label: 'Liste', icon: Banknote, slug: 'crm-spenders', group: 'spenders' },
      { href: '/chatter/spenders/tracker', label: 'À relancer', icon: Send, slug: 'crm-spenders', group: 'spenders' },
      { href: '/chatter/spenders/alertes', label: 'Alertes R10', icon: TriangleAlert, slug: 'crm-spenders', group: 'spenders' },
      { href: '/chatter/spenders/archive', label: 'Archive', icon: Archive, slug: 'crm-spenders', group: 'spenders' },
      { href: '/chatter/stats', label: 'Stats', icon: ChartColumn, group: 'performance' },
      { href: '/chatter/stat-chatteur', label: 'Stat chatteur', icon: Trophy, group: 'performance' },
      { href: '/chatter/health', label: 'Santé (LTV)', icon: HeartPulse, group: 'performance' },
      // adminOnly : la config des seuils/exclusions est admin (écritures requireAdmin,
      // et `teams` est admin-only en RLS — un user y verrait une page vide).
      { href: '/chatter/quotas', label: 'Quotas', icon: Target, adminOnly: true, group: 'performance' },
      // Reconstruit (WIP session parallèle) : scripts de chat par modèle — consultation membres.
      { href: '/chatter/scripts', label: 'Scripts', icon: ScrollText, slug: 'scripts', group: 'equipe' },
      { href: '/chatter/compta', label: 'Compta', icon: Calculator, group: 'gestion' },
      // Comptes rendus journaliers : chacun rédige LE SIEN (auto-rapport), consultation
      // hiérarchique (manager → ses rattachés directs, admin/superadmin → tout). Pas adminOnly
      // → cochable dans Membres via PAGE_CHOICES (feature `reports`, table daily_reports).
      { href: '/chatter/dashboard', label: 'Dashboard', icon: NotebookPen, bottom: true },
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
export const PAGE_SLUGS = ['overview', 'insights', 'bilan', 'planning', 'repos', 'police', 'chatters', 'infos-modeles', 'codes-snap', 'crm-spenders', 'scripts', 'modeles', 'stats', 'stat-chatteur', 'health', 'compta', 'dashboard', 'marketing', 'mkt-overview', 'mkt-liens', 'mkt-instagram', 'mkt-twitter', 'mkt-telegram', 'mkt-staff', 'mkt-compta'] as const
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
export function workspaceHome(w: Workspace): Route {
  // Fallback défensif (basePath seul n'est pas une page réelle) → cast.
  return w.nav[0]?.href ?? (w.basePath as Route)
}

/** Contexte d'accès : booléens de rôle + slugs de pages autorisés (Set pour lookup O(1)). */
export interface NavAccess {
  isAdmin: boolean
  isSuperadmin: boolean
  isManager: boolean
  pages: Set<string>
}

/**
 * Un profil voit-il cet item de nav ? SOURCE UNIQUE de la règle d'accès — appelée par le
 * filtre de la sidebar (app-sidebar.tsx) ET par `landingHref`. Ne pas dupliquer ailleurs.
 */
export function canAccessNav(item: NavItem, a: NavAccess): boolean {
  if (item.superadminOnly && !a.isSuperadmin) return false
  if (a.isAdmin) return true
  if (item.adminOnly) return !!item.managerAccess && a.isManager
  return a.pages.has(navSlug(item))
}

/**
 * URL d'atterrissage RÉELLE d'un profil = href de sa 1ʳᵉ page de nav autorisée (les 2 faces,
 * dans l'ordre). Résout le slug → vraie route (ex. `crm-spenders` → /chatter/spenders/liste),
 * là où un `/chatter/<slug>` naïf 404. Items `bottom` (Membres, Dashboard-TODO) exclus : des
 * utilitaires, pas une home. `/no-access` si aucune page autorisée (jamais /login : rebond).
 */
export function landingHref(p: {
  role: string
  superadmin: boolean
  manager: boolean
  pages: string[]
}): Route {
  const access: NavAccess = {
    isAdmin: p.role === 'admin',
    isSuperadmin: p.superadmin,
    isManager: p.manager,
    pages: new Set(p.pages),
  }
  for (const w of WORKSPACES) {
    for (const item of w.nav) {
      if (item.bottom) continue
      if (canAccessNav(item, access)) return item.href
    }
  }
  return '/no-access' as Route
}
