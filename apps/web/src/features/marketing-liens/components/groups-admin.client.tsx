'use client'

import { useState, useTransition } from 'react'
import { Controller, useForm, type Control, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ActionButton } from '@/components/action-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { describeRule, GROUP_PALETTE, NEUTRAL_COLOR } from '@/lib/mkt-groups'
import { createGroupSchema, type GroupFormOutput, type GroupFormValues } from '../groups.schema'
import { createLinkGroup, deleteLinkGroup, updateLinkGroup } from '../actions-groups'
import type { MktGroupAdminRow } from '../services/get-groups-admin'

/** La clé se déduit du nom : « TikTok Ads » → « tiktok_ads ». Modifiable avant création. */
function keyOf(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

type GroupForm = UseFormReturn<GroupFormValues, unknown, GroupFormOutput>

// Priorité 5 par défaut : AVANT les groupes d'origine (10 à 90). Un groupe créé à la main est
// presque toujours un affinage — « SNAP + DA » découpé dans Snapchat (10) — et à 100 il perdait
// face au groupe qu'il voulait découper, même pour les liens à venir.
const EMPTY: GroupFormValues = { key: '', label: '', contains: '', startsWith: '', words: '', color: '', priority: 5 }

/** Ce que le rejeu des règles vient de faire — dit, pour qu'un groupe vide ne passe pas pour raté. */
const rangesMsg = (n: number, creation: boolean) =>
  n > 0
    ? ` ${n} lien${n > 1 ? 's' : ''} déplacé${n > 1 ? 's' : ''}.`
    : creation
      ? ' Aucun lien ne correspond pour l’instant : il apparaîtra dans l’écran Liens dès qu’un lien le rejoindra.'
      : ''

export function GroupsAdmin({ groups }: { groups: MktGroupAdminRow[] }) {
  'use no memo'
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState<MktGroupAdminRow | null>(null)

  const form: GroupForm = useForm<GroupFormValues, unknown, GroupFormOutput>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: EMPTY,
  })
  const edit: GroupForm = useForm<GroupFormValues, unknown, GroupFormOutput>({
    resolver: zodResolver(createGroupSchema),
  })

  // Le resolver valide (et affiche les erreurs), mais le serveur REPARSE avec le même schéma :
  // on lui envoie donc la saisie BRUTE (chaînes), pas la sortie transformée (tableaux), que son
  // schéma refuserait.
  const submit = form.handleSubmit(() =>
    start(async () => {
      const res = await createLinkGroup(form.getValues())
      if (!res.success) return void toast.error(res.error)
      toast.success(`Groupe créé.${rangesMsg(res.data.ranges, true)}`)
      form.reset(EMPTY)
    }),
  )

  const submitEdit = edit.handleSubmit(() =>
    start(async () => {
      const res = await updateLinkGroup(edit.getValues())
      if (!res.success) return void toast.error(res.error)
      toast.success(`Groupe enregistré.${rangesMsg(res.data.ranges, false)}`)
      setEditing(null)
    }),
  )

  const remove = (g: MktGroupAdminRow) =>
    start(async () => {
      if (!window.confirm(`Supprimer « ${g.label} » ? Ses ${g.links} lien(s) repartent dans « À classer ».`)) return
      const res = await deleteLinkGroup({ key: g.key })
      if (!res.success) return void toast.error(res.error)
      toast.success('Groupe supprimé.')
    })

  const openEdit = (g: MktGroupAdminRow) => {
    setEditing(g)
    edit.reset({
      key: g.key,
      label: g.label,
      contains: g.contains.join(', '),
      startsWith: g.startsWith.join(', '),
      words: g.words.join(', '),
      color: g.color === NEUTRAL_COLOR ? '' : g.color,
      priority: g.priority,
    })
  }

  const columns: ColumnDef<MktGroupAdminRow>[] = [
    {
      accessorKey: 'label',
      header: ({ column }) => <Sortable column={column} label="Groupe" />,
      cell: ({ row }) => {
        const g = row.original
        return (
          <span className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
            <span className="font-medium">{g.label}</span>
            {g.auto && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                créé automatiquement
              </Badge>
            )}
            {g.isFallback && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                file d’attente
              </Badge>
            )}
          </span>
        )
      },
    },
    {
      id: 'rule',
      header: 'Reconnaît',
      cell: ({ row }) => <span className="text-muted-foreground">{describeRule(row.original)}</span>,
    },
    {
      accessorKey: 'priority',
      header: ({ column }) => <Sortable column={column} label="Priorité" />,
      meta: { align: 'right' },
      cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.priority}</span>,
    },
    {
      accessorKey: 'links',
      header: ({ column }) => <Sortable column={column} label="Liens" />,
      meta: { align: 'right' },
      cell: ({ row }) => <span className="tabular-nums">{row.original.links}</span>,
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => openEdit(row.original)} disabled={pending}>
            Modifier
          </Button>
          {!row.original.isFallback && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => remove(row.original)}
              disabled={pending}
            >
              Supprimer
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ajouter un groupe</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex flex-col gap-1.5 sm:w-48">
                <Label htmlFor="g-label">Nom</Label>
                <Input
                  id="g-label"
                  placeholder="Reddit"
                  {...form.register('label', {
                    onChange: (e) => {
                      // La clé suit le nom tant que personne ne l'a touchée à la main.
                      if (!form.formState.dirtyFields.key) form.setValue('key', keyOf(e.target.value))
                    },
                  })}
                />
                {form.formState.errors.label && (
                  <span className="text-xs text-destructive">{form.formState.errors.label.message}</span>
                )}
              </div>
              <div className="flex flex-col gap-1.5 sm:w-40">
                <Label htmlFor="g-key">Clé</Label>
                <Input id="g-key" placeholder="reddit" {...form.register('key')} />
                {form.formState.errors.key && (
                  <span className="text-xs text-destructive">{form.formState.errors.key.message}</span>
                )}
              </div>
              <div className="flex flex-col gap-1.5 sm:w-28">
                <Label htmlFor="g-priority">Priorité</Label>
                <Input id="g-priority" type="number" min={1} max={998} {...form.register('priority')} />
              </div>
              <ActionButton type="submit" pending={pending}>Ajouter</ActionButton>
            </div>
            <KeywordFields form={form} idPrefix="g" />
            <ColorField control={form.control} disabled={pending} />
          </form>
        </CardContent>
      </Card>

      <DataTable
        data={groups}
        columns={columns}
        getRowId={(g) => g.key}
        filterColumnId="label"
        filterPlaceholder="Filtrer par groupe…"
        initialSorting={[{ id: 'priority', desc: false }]}
        countLabel={(n) => `${n} groupe${n > 1 ? 's' : ''}`}
      />

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier « {editing?.label} »</DialogTitle>
            <DialogDescription>
              Enregistrer rejoue aussitôt les règles : les liens que ce groupe reconnaît le
              rejoignent, sauf ceux qu’on a rangés à la main — ceux-là ne bougent jamais.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEdit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-label">Nom</Label>
              <Input id="e-label" {...edit.register('label')} />
            </div>
            {!editing?.isFallback && <KeywordFields form={edit} idPrefix="e" stacked />}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-priority">Priorité</Label>
              <Input id="e-priority" type="number" min={1} max={998} {...edit.register('priority')} />
            </div>
            {!editing?.isFallback && <ColorField control={edit.control} disabled={pending} />}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Annuler
              </Button>
              <ActionButton type="submit" pending={pending}>Enregistrer</ActionButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const KEYWORD_FIELDS = [
  { name: 'contains', label: 'Le nom contient', placeholder: 'reddit, rdt' },
  { name: 'startsWith', label: 'Le nom commence par', placeholder: 'rd' },
  { name: 'words', label: 'Le nom contient le mot', placeholder: 'ig, tg' },
] as const

/**
 * Les trois façons de reconnaître un lien (0168) — des listes de mots, plus des expressions
 * régulières que personne au pôle marketing ne pouvait relire. « Commence par » et « mot »
 * existent pour les cas où « contient » se trompe : « ara » attraperait Sarah, « ig » attraperait
 * « hotgirl ».
 */
function KeywordFields({ form, idPrefix, stacked }: { form: GroupForm; idPrefix: string; stacked?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className={cn('grid gap-4', !stacked && 'sm:grid-cols-3')}>
        {KEYWORD_FIELDS.map((f) => (
          <div key={f.name} className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-${f.name}`}>{f.label}</Label>
            <Input id={`${idPrefix}-${f.name}`} placeholder={f.placeholder} {...form.register(f.name)} />
            {form.formState.errors[f.name] && (
              <span className="text-xs text-destructive">{form.formState.errors[f.name]?.message}</span>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Mots séparés par des virgules. Majuscules, accents, espaces, tirets et points ne comptent
        pas : « fb ads » reconnaît aussi « Malik_FB_Ads ».
      </p>
    </div>
  )
}

/**
 * Le choix de couleur est FERMÉ à huit teintes : ce sont celles qui passent le contrôle
 * daltonisme côte à côte. Un sélecteur libre laisserait choisir deux bleus indiscernables sans
 * que rien ne prévienne.
 *
 * Même composition que la couleur d'un VA (marketing-staff/va-dialog.tsx) : Label, pastilles
 * rondes. La pastille VIDE veut dire « automatique » — l'app pioche alors une teinte libre.
 */
function ColorField({
  control,
  disabled,
}: {
  control: Control<GroupFormValues, unknown, GroupFormOutput>
  disabled: boolean
}) {
  return (
    <Controller
      name="color"
      control={control}
      render={({ field }) => (
        <div className="grid gap-1.5">
          <Label>Couleur</Label>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={disabled}
              aria-label="Couleur automatique"
              title="Automatique"
              className={cn(
                'size-6 rounded-full border-2 border-dashed',
                !field.value ? 'border-foreground' : 'border-muted-foreground/40',
              )}
              onClick={() => field.onChange('')}
            />
            {GROUP_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                disabled={disabled}
                aria-label={`Couleur ${c}`}
                className={cn('size-6 rounded-full border-2', field.value === c ? 'border-foreground' : 'border-transparent')}
                style={{ backgroundColor: c }}
                onClick={() => field.onChange(c)}
              />
            ))}
          </div>
        </div>
      )}
    />
  )
}
