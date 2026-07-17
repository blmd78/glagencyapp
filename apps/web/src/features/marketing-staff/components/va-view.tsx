'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/data-table/data-table'
import { saveStaff, saveStaffAssignments } from '../actions'
import { staffForm, type StaffForm } from '../schema'
import { makeVaColumns } from './va-columns'
import { VaFormDialog } from './va-dialog'
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

/**
 * Page « VA » — même patron que « Chatters » côté chatteurs (même DA : DataTable
 * filtrable/triable) : les FICHES vivent ici (création, rémunération, assignations
 * liens/comptes), la Compta ne fait que payer. Les subs Twitter remontent seuls des
 * liens de tracking (aucune API Twitter payante). Dialog en RHF + Zod (schema.ts,
 * partagé avec les server actions) — même patron que member-dialog. Colonnes
 * (`va-columns.tsx`) et dialog (`va-dialog.tsx`) extraits en fichiers dédiés (> 300 l.).
 */
export function VaView({
  data,
  isAdmin,
  canWrite,
}: {
  data: MktStaffData
  isAdmin: boolean
  canWrite: boolean
}) {
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

  const columns = makeVaColumns({ isAdmin, canWrite, onEdit: openEdit })

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
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    // Assignations dans la foulée (création comprise) : le manager remplit la fiche +
    // associe liens/comptes en une passe, les données remontent ensuite toutes seules.
    const res2 = await saveStaffAssignments({
      staffId: res.data.id,
      linkIds: values.linkIds,
      igAccountIds: values.igAccountIds,
      twAccountIds: values.twAccountIds,
    })
    if (!res2.success) {
      // La fiche EST créée/à jour en base : on bascule le dialog en mode édition sur
      // res.data.id pour qu'un retry mette à jour au lieu de créer un doublon (audit).
      if (!current) {
        setEditing({
          id: res.data.id,
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
      setError('root', { message: res2.error })
      toast.error(res2.error)
      return
    }
    toast.success(current ? `${values.name} modifié` : `${values.name} créé`)
    setEditing(null)
  })

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
          // Création masquée pour un chatteur (lecture seule) — écriture réservée admin/manager.
          canWrite ? (
            <Button size="sm" className="gap-1.5" onClick={() => openEdit(null)}>
              <UserPlus className="size-3.5" />
              Ajouter un VA
            </Button>
          ) : null
        }
      />

      <VaFormDialog
        editing={editing}
        colors={COLORS}
        linkOptions={data.linkOptions}
        igOptions={data.igOptions}
        twOptions={data.twOptions}
        register={register}
        control={control}
        errors={errors}
        isSubmitting={isSubmitting}
        onSubmit={submit}
        onClose={() => setEditing(null)}
      />
    </>
  )
}
