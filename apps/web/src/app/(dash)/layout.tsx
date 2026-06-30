import type { ReactNode } from 'react'
import { requireUser } from '@/lib/auth'
import { AppShell } from '@/components/layout/AppShell'

export default async function DashLayout({ children }: { children: ReactNode }) {
  await requireUser()
  return <AppShell>{children}</AppShell>
}
