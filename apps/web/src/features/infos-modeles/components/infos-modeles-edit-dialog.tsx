'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { saveInfosModele } from '../actions'
import { BASE_FIELDS, type InfosSection, type ModeleInfos } from '../types'

/**
 * Dialog d'édition (admin) de la fiche d'un modèle — identité de base + sections libres.
 * Extrait de `infos-modeles-view.tsx` (split > 300 l.).
 */
export function EditDialog({
  m,
  open,
  onClose,
}: {
  m: ModeleInfos
  open: boolean
  onClose: () => void
}) {
  const [base, setBase] = useState<Record<string, string>>(m.infos.base)
  const [sections, setSections] = useState<InfosSection[]>(m.infos.sections)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const res = await saveInfosModele({ creatorId: m.creatorId, base, sections })
      if (!res.success) {
        // Erreur métier/technique : message de l'action (jamais un message Supabase brut).
        setError(res.error)
        toast.error(res.error)
        return
      }
      setError(null)
      toast.success(`Infos enregistrées pour ${m.model}`)
      onClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Infos clés — {m.model}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            {BASE_FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{f.label}</label>
                <Input
                  className="h-8 text-sm"
                  value={base[f.key] ?? ''}
                  onChange={(e) => setBase((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sections</p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setSections((prev) => [...prev, { titre: '', contenu: '' }])}
            >
              <Plus className="size-3.5" /> Ajouter
            </Button>
          </div>
          {sections.map((s, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 text-sm"
                  placeholder="Titre de la section…"
                  value={s.titre}
                  onChange={(e) =>
                    setSections((prev) => prev.map((x, j) => (j === i ? { ...x, titre: e.target.value } : x)))
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0 text-muted-foreground"
                  onClick={() => setSections((prev) => prev.filter((_, j) => j !== i))}
                  title="Supprimer la section"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <Textarea
                rows={4}
                className="text-sm"
                placeholder={'Une info par ligne :\n- répond vite le soir\n- adore les compliments'}
                value={s.contenu}
                onChange={(e) =>
                  setSections((prev) => prev.map((x, j) => (j === i ? { ...x, contenu: e.target.value } : x)))
                }
              />
            </div>
          ))}

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <ActionButton pending={pending} onClick={save} className="self-end">
            Enregistrer
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
