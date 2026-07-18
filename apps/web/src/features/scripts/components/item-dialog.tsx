'use client'

import { useForm, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
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
import { Textarea } from '@/components/ui/textarea'
import { saveScriptItem } from '../actions'
import { itemForm, type ItemForm } from '../schema'
import type { ScriptItem, ScriptKind } from '../types'

const KIND_LABELS: Record<ScriptKind, string> = {
  message: 'Message (copiable)',
  note: 'Note d’attente (grise)',
  warn: 'Avertissement (ambre)',
  section: 'Titre de section',
}

const emptyForm: ItemForm = { kind: 'message', label: '', body: '' }

const toForm = (i: ScriptItem): ItemForm => ({ kind: i.kind, label: i.label, body: i.body })

/** Dialog admin : création/édition d'un item du script (RHF + zod, schéma partagé). */
export function ItemDialog({
  creatorId,
  item,
  open,
  onClose,
}: {
  creatorId: string
  /** null = création (ajouté en fin de script). */
  item: ScriptItem | null
  open: boolean
  onClose: () => void
}) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ItemForm>({
    resolver: zodResolver(itemForm),
    values: item ? toForm(item) : emptyForm,
  })
  // useWatch (pas watch) : compatible React Compiler.
  const kind = useWatch({ control, name: 'kind' })

  const submit = handleSubmit(async (values) => {
    const res = await saveScriptItem({ id: item?.id ?? null, creatorId, ...values })
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success(item ? 'Item modifié' : 'Item ajouté')
    onClose()
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{item ? 'Modifier l’item' : 'Nouvel item'}</DialogTitle>
          <DialogDescription>
            Un élément du funnel : message à copier, note d’attente, avertissement ou titre
            de section. {item ? '' : 'Ajouté en fin de script (réordonnable ensuite).'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Controller
              name="kind"
              control={control}
              render={({ field }) => (
                <div className="grid gap-1.5">
                  <Label>Type</Label>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(KIND_LABELS) as ScriptKind[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {KIND_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="s-label">{kind === 'section' ? 'Titre' : 'Badge (étiquette)'}</Label>
              <Input
                id="s-label"
                placeholder={kind === 'section' ? 'Messages sur Snap' : 'MESSAGE 8 • 10€'}
                disabled={isSubmitting}
                {...register('label')}
              />
              {errors.label && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.label.message}</p>
              )}
            </div>
          </div>
          {kind !== 'section' && (
            <div className="grid gap-1.5">
              <Label htmlFor="s-body">{kind === 'message' ? 'Message' : 'Texte'}</Label>
              <Textarea id="s-body" rows={6} disabled={isSubmitting} {...register('body')} />
              {errors.body && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.body.message}</p>
              )}
            </div>
          )}
          {errors.root && (
            <p className="text-sm text-red-600 dark:text-red-400">{errors.root.message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Annuler
            </Button>
            <ActionButton type="submit" pending={isSubmitting}>
              Enregistrer
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
