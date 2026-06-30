import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Lightbulb,
  MessageSquare,
  Users,
  HeartPulse,
  Target,
  Calculator,
  UserCog,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  adminOnly?: boolean
}

export const NAV: NavItem[] = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/insights', label: 'Insights', icon: Lightbulb },
  { href: '/chatters', label: 'Chatters', icon: MessageSquare },
  { href: '/teams', label: 'Équipes', icon: Users },
  { href: '/health', label: 'Santé (LTV)', icon: HeartPulse },
  { href: '/quotas', label: 'Quotas', icon: Target },
  { href: '/compta', label: 'Compta', icon: Calculator },
  { href: '/members', label: 'Membres', icon: UserCog, adminOnly: true },
]
