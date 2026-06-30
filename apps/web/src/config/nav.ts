export interface NavItem {
  href: string
  label: string
  adminOnly?: boolean
}

export const NAV: NavItem[] = [
  { href: '/overview', label: 'Overview' },
  { href: '/insights', label: 'Insights' },
  { href: '/chatters', label: 'Chatters' },
  { href: '/teams', label: 'Équipes' },
  { href: '/health', label: 'Santé (LTV)' },
  { href: '/quotas', label: 'Quotas' },
  { href: '/compta', label: 'Compta' },
  { href: '/members', label: 'Membres', adminOnly: true },
]
