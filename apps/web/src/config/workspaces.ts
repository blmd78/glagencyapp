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
  Network,
  UsersRound,
  Activity,
  ListTodo,
  ClipboardCheck,
  ClipboardPen,
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
  GraduationCap,
  BookOpen,
  PlayCircle,
  Gift,
  UserSearch,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Gauge,
} from 'lucide-react'

export interface NavItem {
  /** Slug d'accès explicite (sinon dérivé du dernier segment de l'href). */
  slug?: string
  /**
   * Item visible dès qu'UN de ces slugs est possédé (ex. Modules : Entraînement OU Suivi).
   * Prend le pas sur `slug`/href dans `canAccessNav`. Sans `slug` → l'item n'est PAS une case
   * cochable dans Membres (les droits se cochent via les items qui les portent).
   */
  anyOf?: PageSlug[]
  /** Libellé de la CASE à cocher dans Membres quand il diffère du libellé de nav (ex. « Suivi »). */
  choiceLabel?: string
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

/** Identifiant de face — aussi le `scope` de la page Membres (quelle face gère les droits). */
export type WorkspaceId = 'chatter' | 'marketing' | 'formation'

/** Une « face » du CRM (Chatteurs, Marketing, Formation). Sa nav et son préfixe d'URL lui sont propres. */
export interface Workspace {
  id: WorkspaceId
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
    label: 'Chatters',
    subtitle: 'Performance',
    icon: MessageSquare,
    basePath: '/chatter',
    // Sous-onglets de la sidebar — un item sans `group` (Overview, Insights) reste direct.
    groups: [
      { id: 'performance', label: 'Performance', icon: ChartLine },
      { id: 'equipe', label: 'Équipe', icon: UsersRound },
      // Tracker de présence, repris du tracker GLA. Le libellé « Tracker » n'était pas
      // réutilisable : il désigne déjà `/chatter/police`. D'où « Présence ».
      { id: 'presence', label: 'Présence', icon: Activity },
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
      { href: '/chatter/bilan', label: 'Bilan hebdo', icon: CalendarCheck, group: 'performance' },
      // Planning journalier des sous-managers : chacun voit LE SIEN, seuls les admins éditent.
      { href: '/chatter/planning', label: 'Planning / Todo', icon: CalendarClock, group: 'equipe' },
      { href: '/chatter/repos', label: 'Planning repos', icon: CalendarOff, group: 'equipe' },
      // Tracker de présence — les écrans partagent le slug `presence` : un seul droit à cocher dans
      // Membres, comme `police` couvre déjà Tracker + Rapport.
      //
      // Le RELEVÉ est alimenté depuis le 2026-09-02 : il ne lit plus l'agent Electron (jamais
      // repointé, `tracker_events` toujours vide) mais le scrape MyPuls « Contrôle des shifts »
      // (`mypuls_shift_*`, migrations 0138/0140, cron nocturne dans apps/ingestion). C'est la
      // seule mesure de présence dont l'app dispose réellement.
      //
      // TROIS écrans HORS sidebar, chacun pour sa raison. La vue Managers : les encadrants
      // n'envoient pas de messages, MyPuls ne sait rien d'eux — définitif tant que l'agent ne
      // revient pas. La fiche d'un chatteur : on y arrive depuis le relevé, nominativement.
      // « Créneaux & réglages » : c'est un écran de MAINTENANCE (journal des runs, seuils, gens
      // à rattacher), pas un écran quotidien — le mettre au même niveau que le relevé lui
      // donnait un poids qu'il n'a pas. On y arrive en cliquant la ligne « Relevé MyPuls
      // du … » qui coiffe le relevé, c'est-à-dire au moment précis où l'on se demande d'où
      // sort un chiffre.
      { href: '/chatter/presence', label: 'Relevé d’équipe', icon: Gauge, slug: 'presence', group: 'presence' },
      { href: '/chatter/presence/suivi', label: 'Suivi chatters', icon: ClipboardPen, slug: 'presence', group: 'presence' },
      { href: '/chatter/presence/todo', label: 'To-Do', icon: ListTodo, slug: 'presence', group: 'presence' },
      // Le Récap : COMPTEURS pour tout l'encadrement, VERBATIM des débriefs pour les seuls admins
      // (RPC `tracker_todo_week_recap` en definer, 0137 ; `tracker_todo_daily_read` reste fermée
      // par 0132). D'où `adminOnly` + `managerAccess` : l'item reste invisible d'un chatteur ou
      // d'un policier porteur du slug — la page les rejetterait — mais s'affiche pour les
      // managers ET sous-managers (`isManager` = `profile.manager`, qui couvre les deux), chacun
      // n'y voyant que son périmètre. Un sous-manager n'encadre personne : il y lit SON récap.
      { href: '/chatter/presence/recap', label: 'Récap', icon: ClipboardCheck, slug: 'presence', group: 'presence', adminOnly: true, managerAccess: true },
      // Vue d'orga de l'agence (manager → sous-managers → modèles → chatters par shift),
      // DÉRIVÉE de Membres/Chatters — cf. features/organisation/.
      { href: '/chatter/organisation', label: 'Organisation', icon: Network, group: 'equipe' },
      // Libellé affiché « Tracker » — slug/route/dossier restent `police` (renommer
      // casserait profiles.pages + policies RLS, cf. features/police/).
      { href: '/chatter/police', label: 'Tracker', icon: ShieldAlert, group: 'police' },
      { href: '/chatter/rapport-police', label: 'Rapport', icon: ClipboardList, slug: 'police', group: 'police' },
      { href: '/chatter/chatters', label: 'Chatters', icon: MessageSquare, group: 'equipe' },
      { href: '/chatter/modeles', label: 'Modèles', icon: Users, group: 'equipe' },
      // Groupe Accès (porté de gla-workflow) : identifiants Snapchat + fiches modèles.
      // codes-snap : page ASSIGNABLE (lecture) ; écriture admin, ou encadrant sur SES modèles
      // assignés (`features/snap-codes/access.ts`).
      { href: '/chatter/codes-snap', label: 'Codes Snap', icon: Ghost, group: 'acces' },
      { href: '/chatter/infos-modeles', label: 'Infos modèles', icon: IdCard, group: 'acces' },
      // Sous-catégorie Spenders (CRM closing). Toutes les sous-pages partagent le droit
      // `crm-spenders` (slug explicite, aligné sur la RLS de 0031).
      { href: '/chatter/spenders/liste', label: 'Liste', icon: Banknote, slug: 'crm-spenders', group: 'spenders' },
      { href: '/chatter/spenders/tracker', label: 'À relancer', icon: Send, slug: 'crm-spenders', group: 'spenders' },
      { href: '/chatter/spenders/alertes', label: 'Alertes R10', icon: TriangleAlert, slug: 'crm-spenders', group: 'spenders' },
      { href: '/chatter/spenders/archive', label: 'Archive', icon: Archive, slug: 'crm-spenders', group: 'spenders' },
      { href: '/chatter/stats', label: 'Stats subs', icon: ChartColumn, group: 'performance' },
      { href: '/chatter/stat-chatteur', label: 'Stat chatter', icon: Trophy, group: 'performance' },
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
  {
    id: 'formation',
    label: 'Formation',
    subtitle: 'Entraînement',
    icon: GraduationCap,
    basePath: '/formation',
    // Même patron que Marketing : droit de face UNIQUE `formation` (posé par mergePages dès
    // qu'une page frm-* est cochée depuis /formation/members), slugs préfixés `frm-`.
    // Deux droits : `frm-suivi` (encadrement — Overview) et `frm-entrainement` (chatter — Ma
    // formation). Modules est ouvert aux deux (anyOf). Catalogue = admin (comme Membres).
    // Les deux sont en service : Ma formation (progression, historique, trophées, classement) et
    // Overview (roster de la promo, fiche d'un chatter, signalements, coût IA pour un admin).
    //
    // UN SEUL sous-onglet, « Configuration » : les deux écrans de RÉGLAGE de la face (Catalogue
    // des modules, Config du test de recrutement) sont admin-only et ne se consultent pas au
    // quotidien — les ranger ensemble sort deux entrées du flux de travail (Overview, Ma
    // formation, Roue, Recrutement, Modules) sans les cacher.
    groups: [{ id: 'config', label: 'Configuration', icon: Settings2 }],
    nav: [
      { href: '/formation/overview', label: 'Overview', icon: LayoutDashboard, slug: 'frm-suivi', choiceLabel: 'Suivi' },
      // Placé JUSTE AU-DESSUS de « Ma formation » (demande du 2026-08-25) : le recrutement précède
      // la formation dans le parcours réel — on recrute, puis on forme. Overview reste en tête,
      // c'est le tableau de bord de la face. Dossiers du test public (/postuler) ; `adminOnly` SANS
      // slug : le recrutement ne s'attribue pas page par page (cf. RLS `is_admin()` des tables
      // recruit_*), et un item adminOnly sans slug n'apparaît pas dans les cases de Membres (filtre
      // de `facePageChoices` ci-dessous). Seul item à porter une pastille sur cette face.
      // Ouvert aux porteurs de « Suivi » depuis 0135 : le recrutement précède la formation dans le
      // parcours réel, et c'est l'encadrant qui suit la promo qui voit arriver les dossiers et
      // intègre les gens. `anyOf` sans `slug` : le droit vient de Suivi, l'item n'est donc pas une
      // case à cocher de plus dans Membres. Les gestes SENSIBLES (bloquer, débloquer, supprimer,
      // et toute la config du test) restent admin — ils sont gardés côté Server Action.
      { href: '/formation/recrutement', label: 'Recrutement', icon: UserSearch, anyOf: ['frm-suivi'] },
      { href: '/formation/ma-formation', label: 'Ma formation', icon: PlayCircle, slug: 'frm-entrainement', choiceLabel: 'Entraînement' },
      // Réservée à l'ENCADREMENT depuis la règle du 2026-08-24 : c'est le manager qui fait tourner
      // la roue pour un chatteur, en partage d'écran. Un chatteur n'a plus rien à y faire — il
      // apprend son gain de vive voix. Pas de `slug` propre : le droit vient de Suivi.
      { href: '/formation/roue', label: 'Roue', icon: Gift, anyOf: ['frm-suivi'] },
      // La 2ᵉ roue (0136) : celle du CHATTER. Il gagne un tour en finissant un module et le joue
      // lui-même — d'où la pastille : un chiffre sur lequel on ne peut pas cliquer n'a pas de sens.
      // `anyOf` sans `slug` : le droit vient de « Ma formation », ce n'est pas une case de plus
      // dans Membres. Seul item de la face à porter une pastille avec Recrutement.
      { href: '/formation/ma-roue', label: 'Ma roue', icon: Sparkles, anyOf: ['frm-entrainement'] },
      // PLUS D'ITEM « Modules » (2026-08-25) : on navigue depuis « Ma formation », dont le panneau
      // « Tes modules » liste tout le catalogue — c'est le parcours de l'ancienne plateforme, où la
      // liste des modules EST l'accueil. Les PAGES restent : `/formation/modules` et
      // `/formation/modules/[code]` sont toujours servies aux deux droits, et tous les liens qui y
      // mènent fonctionnent (panneau « Tes modules », bloc Boss, retours depuis un module ou une
      // session). Seule l'entrée de menu disparaît.
      // Sous-onglet « Configuration » : les items de groupe sont rendus dans le CORPS de la
      // sidebar — donc jamais `bottom` (Catalogue l'était quand il était direct).
      { href: '/formation/catalogue', label: 'Catalogue', icon: BookOpen, adminOnly: true, group: 'config' },
      { href: '/formation/recrutement/config', label: 'Config du test', icon: SlidersHorizontal, adminOnly: true, group: 'config' },
      { href: '/formation/members', label: 'Membres', icon: UserCog, adminOnly: true, bottom: true },
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
export const PAGE_SLUGS = ['overview', 'overview:ca', 'overview:courbe', 'insights', 'bilan', 'planning', 'repos', 'organisation', 'presence', 'police', 'chatters', 'infos-modeles', 'codes-snap', 'crm-spenders', 'scripts', 'modeles', 'stats', 'stat-chatteur', 'health', 'compta', 'dashboard', 'marketing', 'mkt-overview', 'mkt-liens', 'mkt-instagram', 'mkt-twitter', 'mkt-telegram', 'mkt-staff', 'mkt-compta', 'formation', 'frm-entrainement', 'frm-suivi'] as const
export type PageSlug = (typeof PAGE_SLUGS)[number]

/**
 * Une case à cocher de Membres. `parent` renseigné = ce n'est pas une page mais un BOUT d'une
 * page (cf. SUB_PAGE_CHOICES).
 */
export type PageChoice = {
  slug: PageSlug
  label: string
  icon: LucideIcon
  parent?: PageSlug
  /** Ce que la case change, en quelques mots — affiché au survol dans Membres. Pas une phrase. */
  description?: string
}

/**
 * BOUTS DE PAGE — un droit PLUS FIN que la page, cochable à part dans Membres (demande Benoit
 * 2026-09-02). Convention de slug : `<page>:<bout>`.
 *
 * POURQUOI À PLAT dans le même `profiles.pages text[]` et pas un jsonb `{ overview: ['ca'] }` :
 * les deux formes portent EXACTEMENT la même information — l'imbriquée se dérive de la plate à
 * l'affichage (`parent`, ci-dessous) — mais la plate ne coûte rien, là où le jsonb obligerait à
 * réécrire les 231 appels `has_page()` et 67 `can_write_page()` répartis sur 44 migrations, qui
 * font tous `slug = any(pages)`. `has_page('overview:ca')` marche donc sans une ligne de SQL.
 *
 * UN BOUT N'A DE SENS QU'AVEC SA PAGE. Trois verrous, du plus faible au plus fort : la case est
 * désactivée tant que la page ne l'est pas (UI), `memberInput` refuse un bout orphelin (form),
 * et la page elle-même fait `requireAccess('overview')` avant de lire quoi que ce soit — sans
 * quoi un `pages: ['overview:ca']` seul mènerait sur /no-access, `landingHref` ne sachant
 * résoudre que des slugs portés par un item de nav.
 */
export const SUB_PAGE_CHOICES: PageChoice[] = [
  // CA global : le KPI « CA total » de l'Overview affiche le CA de L'AGENCE sur la période, et
  // rien d'autre — pas de ventilation par modèle (il n'y en a pas sur cet écran de toute façon :
  // OverviewTemplate ne rend que les KPIs et la courbe). Cf. migration 0139.
  {
    slug: 'overview:ca',
    parent: 'overview',
    label: 'CA global',
    icon: Banknote,
    description: 'Carte « CA total » = CA de l’agence',
  },
  // Idem pour la série quotidienne de la carte « CA quotidien ». Droit SÉPARÉ : les deux se
  // donnent indépendamment (décision Benoit) ; le libellé de chaque bloc dit lequel des deux
  // périmètres il affiche, pour qu'aucune combinaison ne mente.
  {
    slug: 'overview:courbe',
    parent: 'overview',
    label: 'Courbe CA globale',
    icon: ChartLine,
    description: 'Carte « CA quotidien » = CA de l’agence',
  },
]

/** Bouts d'une page donnée (vide si elle n'en a pas) — décocher la page décoche les siens. */
export const subSlugsOf = (parent: string): PageSlug[] =>
  SUB_PAGE_CHOICES.filter((s) => s.parent === parent).map((s) => s.slug)

/**
 * Pages cochables dans la gestion des membres (= nav non-admin). Dédupliquées par slug :
 * plusieurs sous-pages peuvent partager un droit (ex. le groupe Spenders) → une seule case,
 * libellée par le groupe.
 *
 * LES BOUTS N'Y SONT PAS, et c'est délibéré : les fondre dans cette grille la ferait enfler
 * d'une case par bout pour tout le monde, y compris les membres à qui la page n'est pas
 * accordée. Ils sont rendus à part (`subChoicesFor`), et seulement sous les pages cochées.
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
  const out: PageChoice[] = []
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

/** Pages cochables d'une face secondaire (slugs explicites, non-admin) — gérées depuis SA page Membres. */
const facePageChoices = (id: WorkspaceId): PageChoice[] =>
  (WORKSPACES.find((w) => w.id === id)?.nav ?? [])
    .filter((n) => !n.adminOnly && n.slug)
    .map((n) => ({ slug: n.slug as PageSlug, label: n.choiceLabel ?? n.label, icon: n.icon }))

/** Pages cochables de la FACE MARKETING (slugs mkt-* — gérées depuis /marketing/members). */
export const MKT_PAGE_CHOICES = facePageChoices('marketing')
/** Pages cochables de la FACE FORMATION (slugs frm-* — gérées depuis /formation/members). */
export const FRM_PAGE_CHOICES = facePageChoices('formation')

/** Pages cochables d'un scope Membres — SOURCE UNIQUE des ternaires « quelle liste de cases ». */
export function pageChoicesFor(scope: WorkspaceId): PageChoice[] {
  if (scope === 'marketing') return MKT_PAGE_CHOICES
  if (scope === 'formation') return FRM_PAGE_CHOICES
  return PAGE_CHOICES
}

/**
 * Bouts cochables d'un scope Membres — RENDUS À PART de la grille des pages, et seulement sous
 * les pages effectivement cochées (cf. MemberPermissionFields). Un bout n'existe que par sa
 * page : celles de l'autre face n'apparaissent pas ici.
 */
export function subChoicesFor(scope: WorkspaceId): PageChoice[] {
  const pages = new Set<string>(pageChoicesFor(scope).map((c) => c.slug))
  return SUB_PAGE_CHOICES.filter((s) => pages.has(s.parent!))
}

/** Slug d'accès d'un item de nav (slug explicite sinon dérivé de l'href). */
export const navSlug = (n: NavItem) => n.slug ?? pageSlug(n.href)

/** Un slug appartient-il au périmètre marketing ? (droit de face inclus) */
export const isMarketingSlug = (slug: string) => slug === 'marketing' || slug.startsWith('mkt-')
/** Un slug appartient-il au périmètre formation ? (droit de face inclus) */
export const isFormationSlug = (slug: string) => slug === 'formation' || slug.startsWith('frm-')

/**
 * Face à laquelle appartient un slug de page (droit de face inclus). Les faces secondaires se
 * reconnaissent à leur préfixe (mkt-*, frm-*) ; tout le reste est la face chatteurs.
 */
export function slugFace(slug: string): WorkspaceId {
  if (isMarketingSlug(slug)) return 'marketing'
  if (isFormationSlug(slug)) return 'formation'
  return 'chatter'
}

/** Face active déduite de l'URL (fallback : face par défaut). */
export function workspaceForPath(pathname: string): Workspace {
  return (
    WORKSPACES.find(
      (w) => pathname === w.basePath || pathname.startsWith(w.basePath + '/'),
    ) ?? DEFAULT_WORKSPACE
  )
}

/** Contexte d'accès : booléens de rôle + slugs de pages autorisés (Set pour lookup O(1)). */
export interface NavAccess {
  isAdmin: boolean
  isSuperadmin: boolean
  isManager: boolean
  pages: Set<string>
}

/**
 * Home d'une face POUR UN PROFIL = sa 1ʳᵉ entrée de nav accessible (items `bottom` exclus,
 * même règle que `landingHref`), sinon son basePath. Dépend des droits, pas seulement de la face :
 * nav[0] de Formation est Overview (frm-suivi), un chatter avec le seul droit Entraînement y
 * serait rebondi par `requireAccess` vers sa face chatteurs — en boucle depuis le switcher
 * (bug 2026-08-19). Idem Marketing (nav[0] = mkt-overview).
 */
export function workspaceHome(w: Workspace, access: NavAccess): Route {
  const first = w.nav.find((item) => !item.bottom && canAccessNav(item, access))
  // Fallback défensif (basePath seul n'est pas une page réelle, mais l'index de face existe) → cast.
  return first?.href ?? (w.basePath as Route)
}

/**
 * Un profil voit-il cet item de nav ? SOURCE UNIQUE de la règle d'accès — appelée par le
 * filtre de la sidebar (app-sidebar.tsx) ET par `landingHref`. Ne pas dupliquer ailleurs.
 */
export function canAccessNav(item: NavItem, a: NavAccess): boolean {
  if (item.superadminOnly && !a.isSuperadmin) return false
  if (a.isAdmin) return true
  // `adminOnly` + `managerAccess` : visible d'un encadrant — mais SEULEMENT s'il a le droit de la
  // page quand l'item en déclare un explicitement.
  //
  // Sans cette dernière condition, un item `adminOnly + managerAccess + slug` est accessible à
  // tout manager/sous-manager sans aucun droit — et `landingHref` (plus bas) le prend alors comme
  // page d'atterrissage : sa garde `requireAccess(slug)` renvoie vers `landingHref`, qui rend la
  // même URL → boucle de redirection. Membres (`/chatter/members`) n'a pas de `slug` explicite et
  // reste donc inchangé ; il y échappait de toute façon par `bottom: true`, ce que le Récap n'a pas.
  if (item.adminOnly) {
    return !!item.managerAccess && a.isManager && (!item.slug || a.pages.has(item.slug))
  }
  if (item.anyOf) return item.anyOf.some((s) => a.pages.has(s))
  return a.pages.has(navSlug(item))
}

/**
 * URL d'atterrissage RÉELLE d'un profil = href de sa 1ʳᵉ page de nav autorisée (toutes les
 * faces, dans l'ordre). Résout le slug → vraie route (ex. `crm-spenders` → /chatter/spenders/liste),
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
