'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { saveModule } from '../actions'
import { moduleForm, type ModuleFormValues, type ModuleInput } from '../schema'
import type { CatalogModule } from '../types'
import { FieldError } from './field-error'
import { ModuleFormAxes } from './module-form-axes'
import { ModuleFormCourse } from './module-form-course'
import { ModuleFormSections } from './module-form-sections'

const emptyModule: ModuleFormValues = {
  id: null, title: '', emoji: '', description: '', objectiveLabel: 'Objectif', courseMd: '', scoringNotes: '', axes: [], sections: [],
}
const toForm = (m: CatalogModule): ModuleFormValues => ({
  id: m.id,
  title: m.title,
  emoji: m.emoji ?? '',
  description: m.description ?? '',
  objectiveLabel: m.objectiveLabel,
  courseMd: m.courseMd ?? '',
  scoringNotes: m.scoringNotes ?? '',
  axes: m.axes.map((a) => ({ existingId: a.id, key: a.key, name: a.name, description: a.description })),
  sections: m.sections.map((s) => ({ existingId: s.id, title: s.title, emoji: s.emoji ?? '', description: s.description ?? '' })),
})

/**
 * Dialog Nouveau / Modifier module (RHF + Zod partagé avec `saveModule`). Quatre onglets dans UN
 * seul <form> : Général (identité, libellé objectif, consigne de notation), Cours (Markdown +
 * aperçu), Axes, Sections. Un onglet dont un champ est en erreur porte un « • » rouge. Reset à
 * chaque OUVERTURE (piège des dialogs, guidelines §5). Le `code` n'est pas saisi (généré).
 */
export function ModuleDialog({
  open,
  module,
  onClose,
  onCreated,
}: {
  open: boolean
  /** null = création. */
  module: CatalogModule | null
  onClose: () => void
  /** Après création : le parent navigue sur `?module=<code>`. */
  onCreated: (code: string) => void
}) {
  'use no memo'
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ModuleFormValues, unknown, ModuleInput>({
    resolver: zodResolver(moduleForm),
    defaultValues: module ? toForm(module) : emptyModule,
  })
  useEffect(() => {
    if (open) reset(module ? toForm(module) : emptyModule)
  }, [open, module, reset])

  const submit = handleSubmit(async (values) => {
    const res = await saveModule(values)
    if (!res.success) {
      // fieldErrors serveur (ex. clé d'axe en double) → champ si affichable, sinon global.
      for (const [field, messages] of Object.entries(res.fieldErrors ?? {})) {
        if (field === 'axes' && messages?.[0]) setError('axes', { message: messages[0] })
      }
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success(module ? 'Module modifié' : 'Module créé')
    onClose()
    if (!module) onCreated(res.data.code)
  })

  const dot = (bad: boolean) => (bad ? <span aria-hidden className="ml-1 text-red-600">•</span> : null)
  const generalBad = !!(errors.title || errors.emoji || errors.description || errors.objectiveLabel || errors.scoringNotes)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{module ? `Modifier ${module.title}` : 'Nouveau module'}</DialogTitle>
          <DialogDescription>
            Un module = un cours + des cas d’entraînement notés sur ses axes. {module ? '' : 'Ajouté en fin de liste (réordonnable ensuite), sans cas — ajoute-les depuis le panneau.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Tabs defaultValue="general" className="flex flex-col gap-4">
            <TabsList className="self-start">
              <TabsTrigger value="general">Général{dot(generalBad)}</TabsTrigger>
              <TabsTrigger value="course">Cours{dot(!!errors.courseMd)}</TabsTrigger>
              <TabsTrigger value="axes">Axes{dot(!!errors.axes)}</TabsTrigger>
              <TabsTrigger value="sections">Sections{dot(!!errors.sections)}</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-[4rem_1fr]">
                <div className="grid gap-1.5">
                  <Label htmlFor="mod-emoji">Emoji</Label>
                  <Input id="mod-emoji" placeholder="🧲" disabled={isSubmitting} {...register('emoji')} />
                  <FieldError message={errors.emoji?.message} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="mod-title">Titre</Label>
                  <Input id="mod-title" placeholder="Setting & Qualification" disabled={isSubmitting} aria-invalid={!!errors.title} {...register('title')} />
                  <FieldError message={errors.title?.message} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mod-desc">Description (une phrase, sur la carte du module)</Label>
                <Textarea id="mod-desc" rows={2} disabled={isSubmitting} {...register('description')} />
                <FieldError message={errors.description?.message} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mod-obj">Libellé du champ « objectif » des cas</Label>
                <Input id="mod-obj" placeholder="Ce que tu dois obtenir" disabled={isSubmitting} aria-invalid={!!errors.objectiveLabel} {...register('objectiveLabel')} />
                <p className="text-xs text-muted-foreground">Ex. « Ce que tu dois obtenir », « Étape de script à amener », « Ta relance ».</p>
                <FieldError message={errors.objectiveLabel?.message} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mod-scoring">Consigne de notation (transmise à l’IA)</Label>
                <Textarea id="mod-scoring" rows={6} disabled={isSubmitting} {...register('scoringNotes')} />
                <p className="text-xs text-muted-foreground">Pilote l’IA qui note — jamais montrée au chatter.</p>
                <FieldError message={errors.scoringNotes?.message} />
              </div>
            </TabsContent>

            <TabsContent value="course">
              <ModuleFormCourse control={control} register={register} disabled={isSubmitting} />
              <FieldError message={errors.courseMd?.message} />
            </TabsContent>

            <TabsContent value="axes">
              <ModuleFormAxes control={control} register={register} errors={errors} disabled={isSubmitting} />
            </TabsContent>

            <TabsContent value="sections">
              <ModuleFormSections control={control} register={register} errors={errors} disabled={isSubmitting} />
            </TabsContent>
          </Tabs>

          {errors.root && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{errors.root.message}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Annuler</Button>
            <ActionButton type="submit" pending={isSubmitting}>{module ? 'Enregistrer' : 'Créer le module'}</ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
