'use client'

import { useState, useTransition } from 'react'
import { Search, Wallet } from 'lucide-react'
import { ActionButton } from '@/components/action-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { KpiGrid } from '@/components/kpi-card'
import { cn } from '@/lib/utils'
import { eur, num } from '@/lib/format'
import { recordStaffPayment } from './actions'
import { PAYMENT_OPTIONS } from './schema'
import type { MktStaffData, MktStaffRow } from './types'

/** Détail lisible du calcul (sous le nom, comme les hints de la compta chatteurs). */
function payDetail(s: MktStaffRow): string {
  const parts = [`fixe ${eur(s.pay.fixed)}`]
  if (s.role === 'manager') parts.push(`${s.pct.toLocaleString('fr-FR')} % du pôle ${eur(s.pay.pctAmount)}`)
  else {
    if (s.linkIds.length) parts.push(`${num(s.pay.twConversions)} subs → ${eur(s.pay.twVariable)}`)
    if (s.igAccountIds.length) parts.push(`${num(s.pay.igViews)} vues → ${eur(s.pay.igVariable)}`)
    if (s.pay.bonus > 0) parts.push(`prime ${eur(s.pay.bonus)}`)
  }
  return parts.join(' · ')
}

export function MktStaffTemplate({ data, isAdmin }: { data: MktStaffData; isAdmin: boolean }) {
  const [search, setSearch] = useState('')
  const [paying, setPaying] = useState<MktStaffRow | null>(null)
  const [payAmount, setPayAmount] = useState(0)
  const [payMethod, setPayMethod] = useState('virement')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const payable = data.staff.filter((s) => s.active && s.pay.total > 0)
  const fullyPaid = payable.filter((s) => s.remaining <= 0)
  const kpis = [
    {
      key: 'rev',
      label: 'Revenus du pôle',
      value: eur(data.periodRevenue),
      deltaPct: null,
      trendLabel: '',
      hint: `${data.period} · liens de tracking`,
    },
    {
      key: 'theory',
      label: 'Coût théorique',
      value: eur(data.totalBudget),
      deltaPct: null,
      trendLabel: '',
      hint: 'payes calculées, payées ou non',
    },
    { key: 'paid', label: 'Déjà payé', value: eur(data.totalPaid), deltaPct: null, trendLabel: '', hint: '' },
    {
      key: 'rest',
      label: 'Reste à payer',
      value: eur(data.totalRemaining),
      deltaPct: null,
      trendLabel: '',
      hint: `${fullyPaid.length}/${payable.length} membres payés`,
    },
  ]

  const needle = search.trim().toLowerCase()
  const rows = needle ? data.staff.filter((s) => s.name.toLowerCase().includes(needle)) : data.staff

  const openPay = (s: MktStaffRow) => {
    setPaying(s)
    setPayAmount(s.remaining || s.pay.total)
    setPayMethod(s.paymentMethod)
    setError('')
  }

  const submitPay = () =>
    startTransition(async () => {
      if (!paying) return
      const res = await recordStaffPayment({
        staffId: paying.id,
        month: data.monthStart,
        amountEur: payAmount,
        method: payMethod,
        note: '',
      })
      if (!res.success) return setError(res.error)
      setPaying(null)
    })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compta</h1>
          <p className="text-sm text-muted-foreground">
            Paie du staff marketing · payes automatiques (fixe + variable), paiements suivis
          </p>
        </div>
      </div>

      <KpiGrid kpis={kpis} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un membre…"
            className="h-9 w-56 pl-8 text-sm"
          />
        </div>
        <span className="ml-auto text-sm text-muted-foreground">{data.period}</span>
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Membre</TableHead>
              <TableHead>Méthode</TableHead>
              <TableHead className="text-right">Théorique</TableHead>
              <TableHead className="text-right">Payé</TableHead>
              <TableHead className="text-right">Reste</TableHead>
              <TableHead className="w-24 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id} className={cn(!s.active && 'opacity-50')}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="font-medium">{s.name}</span>
                    {s.role === 'manager' && <Badge variant="secondary">Manager</Badge>}
                    {!s.active && <Badge variant="secondary">Inactif</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{payDetail(s)}</div>
                </TableCell>
                <TableCell className="text-muted-foreground">{s.paymentMethod}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{eur(s.pay.total)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {s.paid > 0 ? eur(s.paid) : '—'}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-medium tabular-nums',
                    s.remaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400',
                  )}
                >
                  {s.pay.total > 0 ? (s.remaining > 0 ? eur(s.remaining) : 'Payé ✓') : '—'}
                </TableCell>
                <TableCell className="text-center">
                  {/* La fiche s'édite sur la page VA. Payer = admin (l'action est
                      requireAdmin — sans ce garde un manager cliquait vers une erreur). */}
                  {isAdmin && s.remaining > 0 && s.active && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      onClick={() => openPay(s)}
                      aria-label={`Payer ${s.name}`}
                    >
                      <Wallet className="size-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Aucun membre.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Dialog paiement */}
      <Dialog open={paying !== null} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Payer {paying?.name}</DialogTitle>
            <DialogDescription>
              Le paiement est rattaché au mois affiché et vient réduire le « reste à payer ».
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="pay-amount">Montant (€)</Label>
              <Input
                id="pay-amount"
                type="number"
                step="0.01"
                value={String(payAmount)}
                onChange={(e) => setPayAmount(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Reste à payer : {eur(paying?.remaining ?? 0)} · rattaché au mois{' '}
                {data.monthStart.slice(0, 7)}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label>Méthode</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPaying(null)}>
              Annuler
            </Button>
            <ActionButton onClick={submitPay} pending={pending} disabled={payAmount <= 0}>
              Enregistrer le paiement
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
