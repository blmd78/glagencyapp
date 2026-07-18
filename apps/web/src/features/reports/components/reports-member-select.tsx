'use client'

import { useRouter } from 'next/navigation'
import { Combobox } from '@/components/ui/combobox'
import type { ReportMember } from '../types'

/** Sélecteur de personne à consulter (navigue vers `?membre=`). La liste est déjà scopée par
 *  rôle en amont (RLS de `profiles`) — cf. `getReportMembers`. */
export function ReportsMemberSelect({ value, members }: { value: string; members: ReportMember[] }) {
  const router = useRouter()
  return (
    <Combobox
      value={value}
      onChange={(id) => router.push(`/chatter/dashboard?membre=${id}`)}
      className="w-56"
      placeholder="Choisir une personne…"
      searchPlaceholder="Rechercher une personne…"
      options={members.map((m) => ({
        value: m.id,
        label:
          m.role === 'manager'
            ? `${m.name} · manager`
            : m.role === 'sous-manager'
              ? `${m.name} · sous-manager`
              : m.name,
      }))}
    />
  )
}
