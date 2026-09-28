'use client'

import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import Image from 'next/image'
import { Controller, useController, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ImagePlus, Plus, Trash2 } from 'lucide-react'
import { todayParis } from '@glagency/core'
import { ActionButton } from '@/components/action-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { callAction } from '@/lib/actions-client'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { createImageUpload, deleteEvent, saveEvent } from '../actions'
import type { AgencyEvent } from '../month-layout'
import {
  AGENCY_ROLES,
  AGENCY_ROLE_LABELS,
  EVENT_COLORS,
  eventInput,
  IMAGE_TYPES,
  imageUploadInput,
  type AgencyRole,
  type EventColor,
  type EventInput,
  type Legend,
} from '../schema'
import { DateField } from './date-field.client'

const blank = (): EventInput => {
  const d = todayParis()
  return { title: '', mode: 'jour', startDate: d, endDate: d, remindOnDay: false, audience: [...AGENCY_ROLES], color: null, imagePath: null }
}
const fromEvent = (e: AgencyEvent): EventInput => ({
  id: e.id,
  title: e.title,
  mode: e.startDate === e.endDate ? 'jour' : 'periode',
  startDate: e.startDate,
  endDate: e.endDate,
  remindOnDay: e.remindOnDay,
  audience: e.audience,
  color: e.color,
  imagePath: e.imagePath,
})
const errorCls = 'text-xs text-red-600 dark:text-red-400'

const colorName = (c: EventColor | null, legend: Legend) => (c ? (legend[c] ?? 'Sans nom') : 'Gris (par défaut)')

/**
 * Ajouter (sans `event`) ou modifier un événement — ADMIN seul, `adminGuard` côté serveur.
 * `'use no memo'` : le React Compiler casse `formState` de RHF (cf. `compta-link-dialog.tsx`).
 *
 * Photo : choisie ici, elle n'est ENVOYÉE qu'à l'enregistrement — une fenêtre fermée sans
 * enregistrer ne laisse rien dans le bucket. Envoi direct navigateur → Storage par une URL
 * signée (`createImageUpload`), jamais par le corps d'une Server Action (plafonné par Vercel).
 */
export function EventDialog({ event, legend, trigger }: { event?: AgencyEvent; legend: Legend; trigger?: ReactNode }) {
  'use no memo'
  const [open, setOpen] = useState(false)
  // Fichier choisi et son aperçu local ; l'URL `blob:` est rendue au navigateur dès qu'on la remplace.
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const pick = (next: { file: File; url: string } | null) => {
    if (picked) URL.revokeObjectURL(picked.url)
    setPicked(next)
  }
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EventInput>({ resolver: zodResolver(eventInput), defaultValues: event ? fromEvent(event) : blank() })
  const mode = useWatch({ control, name: 'mode' })
  const color = useWatch({ control, name: 'color' })
  const imagePath = useWatch({ control, name: 'imagePath' })
  const { field: start } = useController({ control, name: 'startDate' })
  const { field: end } = useController({ control, name: 'endDate' })
  // La photo enregistrée, tant qu'elle n'est pas retirée ; l'aperçu = le fichier tout juste choisi,
  // sinon elle. Enregistrée mais sans URL (signature en échec) : « indisponible », retirable quand même.
  const saved = !!imagePath && imagePath === event?.imagePath
  const shown = picked?.url ?? (saved ? event.imageUrl : null)
  const hasPhoto = !!picked || saved

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // re-choisir le même fichier doit re-déclencher `change`
    if (!file) return
    const check = imageUploadInput.safeParse({ contentType: file.type, size: file.size })
    if (!check.success) {
      setFileError(check.error.issues[0]?.message ?? 'Photo invalide')
      return
    }
    setFileError(null)
    pick({ file, url: URL.createObjectURL(file) })
  }

  const fail = (message: string) => {
    setError('root', { message })
    toast.error(message)
  }

  const submit = handleSubmit(async (values) => {
    // Photo non touchée → `undefined` : le serveur n'y écrit rien (cf. `eventInput`).
    let path = values.imagePath === (event?.imagePath ?? null) ? undefined : values.imagePath
    if (picked) {
      const { file } = picked
      const up = await callAction(createImageUpload({ contentType: file.type, size: file.size }))
      if (!up.success) return fail(up.error)
      const { error } = await createClient()
        .storage.from('agency-events')
        .uploadToSignedUrl(up.data.path, up.data.token, file, { contentType: file.type })
      if (error) return fail('Envoi de la photo impossible — réessaie.')
      path = up.data.path
    }
    const res = await callAction(saveEvent({ ...values, imagePath: path }))
    if (!res.success) return fail(res.error)
    toast.success(event ? 'Événement modifié' : 'Événement publié')
    // Pas de `pick(null)` ici : l'aperçu doit rester pendant l'animation de fermeture — la
    // réouverture le libère.
    setOpen(false)
  })

  const remove = async () => {
    if (!event) return
    const res = await callAction(deleteEvent({ id: event.id }))
    if (!res.success) return res.error
    toast.success('Événement supprimé')
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        // Réouverture = données fraîches, jamais le brouillon ou l'erreur d'avant.
        if (o) {
          reset(event ? fromEvent(event) : blank())
          pick(null)
          setFileError(null)
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Plus className="size-4" />
            Ajouter un événement
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? 'Modifier l’événement' : 'Nouvel événement'}</DialogTitle>
          <DialogDescription>
            {event
              ? 'Une modification ne renotifie personne.'
              : 'Les rôles choisis le voient dans Agence et sont notifiés dans la cloche.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="agency-title">Nom</Label>
            <Input id="agency-title" maxLength={120} aria-invalid={!!errors.title} {...register('title')} />
            {errors.title && <p className={errorCls}>{errors.title.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Controller
              control={control}
              name="mode"
              render={({ field }) => (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(v)}
                >
                  <ToggleGroupItem value="jour">Jour</ToggleGroupItem>
                  <ToggleGroupItem value="periode">Période</ToggleGroupItem>
                </ToggleGroup>
              )}
            />
            <DateField
              mode={mode}
              start={start.value}
              end={end.value}
              onChange={(s, e) => {
                start.onChange(s)
                end.onChange(e)
              }}
            />
            {errors.endDate && <p className={errorCls}>{errors.endDate.message}</p>}
          </div>

          {/* Pastilles : le sélecteur de couleur de Planning (`block-dialog.tsx`), + le gris neutre. */}
          <Controller
            control={control}
            name="color"
            render={({ field }) => (
              <div className="grid gap-1.5">
                <Label>
                  Couleur <span className="font-normal text-muted-foreground">— {colorName(color, legend)}</span>
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {[null, ...EVENT_COLORS].map((c) => (
                    <button
                      key={c ?? 'neutre'}
                      type="button"
                      disabled={isSubmitting}
                      title={colorName(c, legend)}
                      aria-label={colorName(c, legend)}
                      aria-pressed={field.value === c}
                      className={cn(
                        'size-6 rounded-full border-2',
                        field.value === c ? 'border-foreground' : 'border-transparent',
                        !c && 'bg-muted-foreground/40',
                      )}
                      style={c ? { backgroundColor: c } : undefined}
                      onClick={() => field.onChange(c)}
                    />
                  ))}
                </div>
              </div>
            )}
          />

          <div className="grid gap-1.5">
            <Label>Photo</Label>
            {hasPhoto ? (
              <div className="grid gap-2">
                {shown ? (
                  <Image unoptimized src={shown} alt="" width={1200} height={800} className="h-auto max-h-48 w-full rounded-md border object-contain" />
                ) : (
                  <p className="text-sm text-muted-foreground">Photo indisponible pour le moment.</p>
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={isSubmitting} onClick={() => fileInput.current?.click()}>
                    Changer
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isSubmitting}
                    onClick={() => {
                      pick(null)
                      setValue('imagePath', null)
                    }}
                  >
                    Retirer
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={isSubmitting} onClick={() => fileInput.current?.click()}>
                <ImagePlus className="size-4" />
                Ajouter une photo
              </Button>
            )}
            <input ref={fileInput} type="file" accept={Object.keys(IMAGE_TYPES).join(',')} className="hidden" onChange={onFile} />
            <p className="text-xs text-muted-foreground">JPEG, PNG ou WebP · 5 Mo maximum</p>
            {fileError && <p className={errorCls}>{fileError}</p>}
          </div>

          <Controller
            control={control}
            name="remindOnDay"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                Rappeler le jour J
              </label>
            )}
          />

          <div className="grid gap-1.5">
            <Label>Visible par</Label>
            <Controller
              control={control}
              name="audience"
              render={({ field }) => (
                <ComboboxMultiple
                  trigger={
                    <Button type="button" variant="outline" className="h-auto min-h-9 justify-start font-normal">
                      {field.value.length === AGENCY_ROLES.length
                        ? 'Tout le monde'
                        : field.value.map((r) => AGENCY_ROLE_LABELS[r]).join(', ') || 'Choisir…'}
                    </Button>
                  }
                  options={AGENCY_ROLES.map((r) => ({ value: r, label: AGENCY_ROLE_LABELS[r] }))}
                  value={field.value}
                  onChange={(next) => field.onChange(next as AgencyRole[])}
                  placeholder="Rechercher un rôle…"
                />
              )}
            />
            {errors.audience && <p className={errorCls}>{errors.audience.message}</p>}
          </div>

          {errors.root && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errors.root.message}
            </p>
          )}

          <DialogFooter className="gap-2">
            {event && (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" size="sm" className="mr-auto text-red-600">
                    <Trash2 className="size-4" />
                    Supprimer
                  </Button>
                }
                title="Supprimer cet événement ?"
                description="Il disparaît du calendrier et de la cloche de tout le monde."
                onConfirm={remove}
              />
            )}
            <ActionButton type="submit" pending={isSubmitting}>
              {event ? 'Enregistrer' : 'Publier'}
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
