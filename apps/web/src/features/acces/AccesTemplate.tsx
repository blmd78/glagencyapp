'use client'

import { useState } from 'react'
import { Check, Copy, ExternalLink, Search, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import type { AccesData, AccesMember } from './types'

/**
 * Annuaire des accès de l'équipe (repris du CRM legacy gla-workflow) : sections par rôle,
 * email copiable en un clic, modèles assignés, lien outil. Pas de mot de passe : la
 * connexion au CRM est par code OTP email — l'email EST l'identifiant complet.
 */

function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
      onClick={() => {
        void navigator.clipboard.writeText(email)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      title="Copier l'email"
    >
      {email}
      {copied ? (
        <Check className="size-3 shrink-0 text-green-600" />
      ) : (
        <Copy className="size-3 shrink-0 opacity-50" />
      )}
    </button>
  )
}

const ROLE_BADGE: Record<AccesMember['role'], { label: string; className: string }> = {
  superadmin: { label: 'Superadmin', className: STATUS_COLORS.info },
  admin: { label: 'Admin', className: STATUS_COLORS.info },
  manager: { label: 'Manager', className: STATUS_COLORS.positive },
  user: { label: 'Membre', className: STATUS_COLORS.neutral },
}

function Section({ title, rows }: { title: string; rows: AccesMember[] }) {
  if (rows.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        {title} <span className="tabular-nums">({rows.length})</span>
      </h2>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Nom</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Modèles</TableHead>
              <TableHead>Outil</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell>
                  <CopyEmail email={m.email} />
                </TableCell>
                <TableCell>
                  <Badge className={cn('gap-1 text-xs', ROLE_BADGE[m.role].className)}>
                    {(m.role === 'superadmin' || m.role === 'admin') && (
                      <ShieldCheck className="size-3" />
                    )}
                    {ROLE_BADGE[m.role].label}
                  </Badge>
                </TableCell>
                <TableCell>
                  {m.models.length ? (
                    <div className="flex max-w-md flex-wrap gap-1">
                      {m.models.map((name) => (
                        <Badge key={name} className={modelColor(name)}>
                          {name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {m.workLink ? (
                    <Button asChild size="sm" variant="ghost" className="gap-1.5 text-xs">
                      <a href={m.workLink} target="_blank" rel="noopener noreferrer" title={m.workLink}>
                        <ExternalLink className="size-3" />
                        {(() => {
                          try {
                            return new URL(m.workLink).hostname.replace(/^www\./, '')
                          } catch {
                            return 'lien'
                          }
                        })()}
                      </a>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

export function AccesTemplate({ data }: { data: AccesData }) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const match = (m: AccesMember) => !q || `${m.name} ${m.email}`.toLowerCase().includes(q)

  const total = data.admins.length + data.managers.length + data.membres.length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accès</h1>
        <p className="text-sm text-muted-foreground">
          {total} compte(s) · connexion au CRM par code email (OTP) — l'email est l'identifiant
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un nom ou un email…"
          className="h-8 w-64 pl-8 text-xs"
        />
      </div>

      <Section title="Admins" rows={data.admins.filter(match)} />
      <Section title="Managers" rows={data.managers.filter(match)} />
      <Section title="Membres" rows={data.membres.filter(match)} />
    </div>
  )
}
