'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
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
import { GROUP_PALETTE, NEUTRAL_COLOR } from '@/lib/mkt-groups'
import { createGroupSchema, type GroupFormValues } from '../groups.schema'
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

export function GroupsAdmin({ groups }: { groups: MktGroupAdminRow[] }) {
  'use no memo'
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState<MktGroupAdminRow | null>(null)

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: { key: '', label: '', pattern: '', color: '', priority: 100 },
  })
  const edit = useForm<GroupFormValues>({ resolver: zodResolver(createGroupSchema) })

  const submit = form.handleSubmit((values) =>
    start(async () => {
      const res = await createLinkGroup(values)
      if (!res.success) return void toast.error(res.error)
      toast.success('Groupe créé — le prochain relevé rangera dedans.')
      form.reset({ key: '', label: '', pattern: '', color: '', priority: 100 })
    }),
  )

  const submitEdit = edit.handleSubmit((values) =>
    start(async () => {
      const res = await updateLinkGroup(values)
      if (!res.success) return void toast.error(res.error)
      toast.success('Groupe enregistré.')
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
      pattern: g.pattern,
      color: g.color === NEUTRAL_COLOR ? '' : g.color,
      priority: g.priority,
    })
  }

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
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="g-pattern">Mot-clé reconnu dans le nom du lien</Label>
                <Input id="g-pattern" placeholder="reddit" {...form.register('pattern')} />
                {form.formState.errors.pattern && (
                  <span className="text-xs text-destructive">{form.formState.errors.pattern.message}</span>
                )}
              </div>
              <div className="flex flex-col gap-1.5 sm:w-28">
                <Label htmlFor="g-priority">Priorité</Label>
                <Input id="g-priority" type="number" min={1} max={998} {...form.register('priority')} />
              </div>
              <ActionButton type="submit" pending={pending}>Ajouter</ActionButton>
            </div>
            <ColorPicker value={form.watch('color') ?? ''} onChange={(c) => form.setValue('color', c)} />
          </form>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Groupe</th>
              <th className="px-4 py-2 text-left font-medium">Mot-clé</th>
              <th className="px-4 py-2 text-right font-medium">Priorité</th>
              <th className="px-4 py-2 text-right font-medium">Liens</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} className="border-t">
                <td className="px-4 py-2">
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
                </td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                  {g.pattern || '—'}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{g.priority}</td>
                <td className="px-4 py-2 text-right tabular-nums">{g.links}</td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(g)} disabled={pending}>
                    Modifier
                  </Button>
                  {!g.isFallback && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => remove(g)}
                      disabled={pending}
                    >
                      Supprimer
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier « {editing?.label} »</DialogTitle>
            <DialogDescription>
              Le mot-clé range les liens À VENIR. Les liens déjà classés ne bougent pas — déplace-les
              depuis l’écran Liens si besoin.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEdit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-label">Nom</Label>
              <Input id="e-label" {...edit.register('label')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-pattern">Mot-clé reconnu</Label>
              <Input id="e-pattern" {...edit.register('pattern')} disabled={editing?.isFallback} />
              {edit.formState.errors.pattern && (
                <span className="text-xs text-destructive">{edit.formState.errors.pattern.message}</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-priority">Priorité</Label>
              <Input id="e-priority" type="number" min={1} max={998} {...edit.register('priority')} />
            </div>
            {!editing?.isFallback && (
              <ColorPicker value={edit.watch('color') ?? ''} onChange={(c) => edit.setValue('color', c)} />
            )}
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

/**
 * Le choix de couleur est FERMÉ à huit teintes : ce sont celles qui passent le contrôle
 * daltonisme côte à côte. Un sélecteur libre laisserait choisir deux bleus indiscernables sans
 * que rien ne prévienne. « Automatique » laisse l'app piocher une teinte libre.
 */
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Couleur</span>
      <button
        type="button"
        onClick={() => onChange('')}
        className={`rounded-md border px-2 py-1 text-xs ${value === '' ? 'border-primary bg-primary/5' : ''}`}
      >
        Automatique
      </button>
      {GROUP_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Couleur ${c}`}
          onClick={() => onChange(c)}
          className={`size-6 rounded-full border-2 ${value === c ? 'border-foreground' : 'border-transparent'}`}
          style={{ background: c }}
        />
      ))}
    </div>
  )
}
