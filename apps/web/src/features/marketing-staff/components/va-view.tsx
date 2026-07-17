'use client'

import { useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { type ColumnDef } from '@tanstack/react-table'
import { Pencil, Trash2, UserPlus } from 'lucide-react'
import { ActionButton } from '@/components/action-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
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
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur } from '@/lib/format'
import { deleteStaff, saveStaff, saveStaffAssignments } from '../actions'
import { PAYMENT_OPTIONS, staffForm, type StaffForm } from '../schema'
import { MultiPicker } from './multi-picker'
import type { MktStaffData, MktStaffRow } from '../types'

const COLORS = ['#6c63ff', '#00d4aa', '#1d9bf0', '#e1306c', '#f59e0b', '#22c55e', '#ef4444', '#a855f7']

const emptyForm: StaffForm = {
  name: '',
  color: COLORS[0],
  fixedEur: 100,
  rateTw: 0.25,
  rateIg: 0.01,
  bonusEur: 0,
  paymentMethod: 'virement',
  linkIds: [],
  igAccountIds: [],
  twAccountIds: [],
}

const toForm = (s: MktStaffRow): StaffForm => ({
  name: s.name,
  color: s.color,
  fixedEur: s.fixedEur,
  rateTw: s.rateTw,
  rateIg: s.rateIg,
  bonusEur: s.bonusEur,
  paymentMethod: s.paymentMethod,
  linkIds: s.linkIds,
  igAccountIds: s.igAccountIds,
  twAccountIds: s.twAccountIds,
})

/** Résumé lisible des assignations d'un VA (colonne du tableau). */
function assignSummary(s: MktStaffRow): string {
  const parts: string[] = []
  if (s.linkIds.length) parts.push(`${s.linkIds.length} lien(s)`)
  if (s.igAccountIds.length) parts.push(`${s.igAccountIds.length} compte(s) IG`)
  if (s.twAccountIds.length) parts.push(`${s.twAccountIds.length} TW suivi(s)`)
  return parts.length ? parts.join(' · ') : 'Aucune assignation'
}

/**
 * Page « VA » — même patron que « Chatters » côté chatteurs (même DA : DataTable
 * filtrable/triable) : les FICHES vivent ici (création, rémunération, assignations
 * liens/comptes), la Compta ne fait que payer. Les subs Twitter remontent seuls des
 * liens de tracking (aucune API Twitter payante). Dialog en RHF + Zod (schema.ts,
 * partagé avec les server actions) — même patron que member-dialog.
 */
export function VaView({ data, isAdmin }: { data: MktStaffData; isAdmin: boolean }) {
  /** Ligne éditée, `'new'` pour une création, null = dialog fermé. */
  const [editing, setEditing] = useState<MktStaffRow | 'new' | null>(null)

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<StaffForm>({ resolver: zodResolver(staffForm), defaultValues: emptyForm })
  // Que les VA : la fiche manager legacy (paye fixe + % du pôle) vit en Compta.
  const vas = data.staff.filter((s) => s.role === 'va')

  const openEdit = (s: MktStaffRow | null) => {
    reset(s ? toForm(s) : emptyForm)
    setEditing(s ?? 'new')
  }

  const columns = useMemo<ColumnDef<MktStaffRow>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: ({ column }) => <Sortable column={column} label="Membre" />,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {/* Badge teinté de la couleur de la fiche (même esprit que les badges modèle). */}
            <Badge
              className="border-transparent font-medium"
              style={{ backgroundColor: `${row.original.color}24`, color: row.original.color }}
            >
              {row.original.name}
            </Badge>
          </div>
        ),
      },
      {
        id: 'assign',
        header: 'Assignations',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{assignSummary(row.original)}</span>
        ),
      },
      {
        accessorKey: 'fixedEur',
        header: ({ column }) => <Sortable column={column} label="Fixe /mois" className="justify-end" />,
        cell: ({ getValue }) => <span className="tabular-nums">{eur(getValue() as number)}</span>,
        meta: { align: 'right' },
      },
      {
        accessorKey: 'rateTw',
        header: ({ column }) => <Sortable column={column} label="€ / sub" className="justify-end" />,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">{eur(row.original.rateTw)}</span>
        ),
        meta: { align: 'right' },
      },
      {
        accessorKey: 'rateIg',
        header: ({ column }) => <Sortable column={column} label="€ / 1k vues" className="justify-end" />,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">{eur(row.original.rateIg)}</span>
        ),
        meta: { align: 'right' },
      },
      {
        accessorKey: 'paymentMethod',
        header: 'Paiement',
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue() as string}</span>
        ),
      },
      {
        accessorKey: 'active',
        header: 'Statut',
        cell: ({ getValue }) => (
          <Badge className={(getValue() as boolean) ? STATUS_COLORS.positive : STATUS_COLORS.neutral}>
            {(getValue() as boolean) ? 'Actif' : 'Inactif'}
          </Badge>
        ),
        meta: { align: 'center' },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => openEdit(row.original)}
              aria-label={`Modifier ${row.original.name}`}
            >
              <Pencil className="size-3.5" />
            </Button>
            {isAdmin && (
              <ConfirmDialog
                title={`Supprimer ${row.original.name} ?`}
                description="Sa fiche, ses assignations et son historique de paiements sont supprimés définitivement. Les liens et comptes suivis ne sont pas touchés — ils redeviennent simplement non assignés."
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-red-600 hover:text-red-700"
                    aria-label={`Supprimer ${row.original.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                }
                onConfirm={async () => {
                  const res = await deleteStaff(row.original.id)
                  if (!res.success) return res.error
                }}
              />
            )}
          </div>
        ),
        meta: { align: 'center' },
      },
    ],
    // openEdit est stable au sens pratique (setState/reset).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAdmin],
  )

  const submit = handleSubmit(async (values) => {
    const current = editing !== 'new' && editing ? editing : null
    const res = await saveStaff({
      id: current?.id ?? null,
      name: values.name,
      role: 'va', // la page ne liste que des VA (la fiche manager legacy vit en Compta)
      color: values.color,
      fixedEur: values.fixedEur,
      rateTw: values.rateTw,
      rateIg: values.rateIg,
      bonusEur: values.bonusEur,
      paymentMethod: values.paymentMethod,
      // Pas de case dans le dialog : actif par défaut, statut existant préservé.
      active: current?.active ?? true,
    })
    if (!res.success) return setError('root', { message: res.error })
    // Assignations dans la foulée (création comprise) : le manager remplit la fiche +
    // associe liens/comptes en une passe, les données remontent ensuite toutes seules.
    const res2 = await saveStaffAssignments({
      staffId: res.id,
      linkIds: values.linkIds,
      igAccountIds: values.igAccountIds,
      twAccountIds: values.twAccountIds,
    })
    if (!res2.success) {
      // La fiche EST créée/à jour en base : on bascule le dialog en mode édition sur
      // res.id pour qu'un retry mette à jour au lieu de créer un doublon (audit).
      if (!current) {
        setEditing({
          id: res.id,
          name: values.name,
          role: 'va',
          color: values.color,
          fixedEur: values.fixedEur,
          rateTw: values.rateTw,
          rateIg: values.rateIg,
          bonusEur: values.bonusEur,
          pct: 0,
          paymentMethod: values.paymentMethod,
          active: true,
          linkIds: [],
          igAccountIds: [],
          twAccountIds: [],
          pay: { fixed: 0, twConversions: 0, twVariable: 0, igViews: 0, igVariable: 0, bonus: 0, pctAmount: 0, total: 0 },
          paid: 0,
          remaining: 0,
        })
      }
      return setError('root', { message: res2.error })
    }
    setEditing(null)
  })

  const numField = (
    label: string,
    key: 'fixedEur' | 'rateTw' | 'rateIg' | 'bonusEur',
    step = '0.01',
  ) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`f-${key}`}>{label}</Label>
      <Input
        id={`f-${key}`}
        type="number"
        step={step}
        disabled={isSubmitting}
        {...register(key, { valueAsNumber: true })}
      />
      {errors[key] && (
        <p className="text-xs text-red-600 dark:text-red-400">{errors[key]?.message}</p>
      )}
    </div>
  )

  return (
    <>
      <DataTable
        data={vas}
        columns={columns}
        filterColumnId="name"
        filterPlaceholder="Filtrer par membre…"
        initialSorting={[{ id: 'name', desc: false }]}
        getRowId={(s) => s.id}
        countLabel={(n) => `${n} membre(s)`}
        toolbar={
          <Button size="sm" className="gap-1.5" onClick={() => openEdit(null)}>
            <UserPlus className="size-3.5" />
            Ajouter un VA
          </Button>
        }
      />

      {/* ── Dialog fiche VA (identité, rémunération, assignations) */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && !isSubmitting && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing !== 'new' && editing ? `Modifier ${editing.name}` : 'Nouveau VA'}
            </DialogTitle>
            <DialogDescription>
              Associe ses liens MyPuls et ses comptes : subs et vues remontent ensuite tout
              seuls, la paye se calcule en Compta.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4">
            {/* Pas de champ Rôle : tout ce qui se crée ici est un VA — le manager est
                un profil CRM (page Membres) et possède ses fiches via owner_id. */}
            <div className="grid gap-1.5">
              <Label htmlFor="f-name">Prénom / nom</Label>
              <Input id="f-name" disabled={isSubmitting} {...register('name')} />
              {errors.name && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.name.message}</p>
              )}
            </div>
            <Controller
              name="color"
              control={control}
              render={({ field }) => (
                <div className="grid gap-1.5">
                  <Label>Couleur</Label>
                  <div className="flex gap-1.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        disabled={isSubmitting}
                        aria-label={`Couleur ${c}`}
                        className={cn(
                          'size-6 rounded-full border-2',
                          field.value === c ? 'border-foreground' : 'border-transparent',
                        )}
                        style={{ backgroundColor: c }}
                        onClick={() => field.onChange(c)}
                      />
                    ))}
                  </div>
                </div>
              )}
            />
            <div className="grid gap-3">
                <Controller
                  name="linkIds"
                  control={control}
                  render={({ field }) => (
                    <MultiPicker
                      label="Liens MyPuls Twitter — prime subs (prioritaire)"
                      options={data.linkOptions.map((l) => ({
                        id: l.id,
                        label: l.type === 'twitter' ? l.name : `${l.name} · ${l.type}`,
                      }))}
                      selected={field.value}
                      onChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  )}
                />
                <Controller
                  name="igAccountIds"
                  control={control}
                  render={({ field }) => (
                    <MultiPicker
                      label="Comptes Instagram gérés — prime vues reels"
                      options={data.igOptions.map((a) => ({ id: a.id, label: `@${a.handle}` }))}
                      selected={field.value}
                      onChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  )}
                />
                <Controller
                  name="twAccountIds"
                  control={control}
                  render={({ field }) => (
                    <MultiPicker
                      label="Comptes Twitter suivis — affichage uniquement"
                      options={data.twOptions.map((a) => ({ id: a.id, label: `@${a.handle}` }))}
                      selected={field.value}
                      onChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Subs Twitter et vues Instagram remontent seuls des liens/comptes associés. Les
                  comptes Twitter suivis sont indicatifs (aucun impact sur la paye).
                </p>
              </div>
            <div className="grid grid-cols-2 gap-3">
              {numField('Fixe €/mois', 'fixedEur', '1')}
              <Controller
                name="paymentMethod"
                control={control}
                render={({ field }) => (
                  <div className="grid gap-1.5">
                    <Label>Moyen de paiement</Label>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
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
                )}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {numField('€ / sub', 'rateTw')}
              {numField('€ / 1k vues', 'rateIg', '0.001')}
              {numField('Prime exceptionnelle €', 'bonusEur', '1')}
            </div>
            {errors.root && (
              <p className="text-sm text-red-600 dark:text-red-400">{errors.root.message}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={isSubmitting}>
                Annuler
              </Button>
              <ActionButton type="submit" pending={isSubmitting}>
                Enregistrer
              </ActionButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
