'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { modelColor } from '@/lib/model-color'
import { PAGE_CHOICES } from '@/config/workspaces'
import { createMember, updateMember } from '../actions'
import type { Member } from '../types'

/**
 * Dialog Nouveau/Modifier membre : email (verrouillé en édition), nom affiché,
 * pages accessibles et modèles assignés en cases à cocher. Pas de mot de passe :
 * le membre se connecte par code OTP envoyé à son email.
 */
export function MemberDialog({
  member,
  creators,
  trigger,
}: {
  /** Absent = création. */
  member?: Member
  creators: { id: string; name: string }[]
  trigger: ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState(member?.email ?? '')
  const [displayName, setDisplayName] = useState(member?.displayName ?? '')
  const [pages, setPages] = useState<Set<string>>(new Set(member?.pages ?? []))
  const [models, setModels] = useState<Set<string>>(new Set(member?.creatorIds ?? []))

  const toggle = (set: Set<string>, update: (s: Set<string>) => void, key: string) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    update(next)
  }

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const payload = {
        displayName,
        pages: [...pages],
        creatorIds: [...models],
      }
      const res = member
        ? await updateMember({ id: member.id, ...payload })
        : await createMember({ email: email.trim().toLowerCase(), ...payload })
      if (!res.success) {
        setError(res.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{member ? `Modifier ${member.displayName}` : 'Nouveau membre'}</DialogTitle>
          <DialogDescription>
            {member
              ? 'Ajuste les pages et modèles accessibles.'
              : 'Le membre se connectera avec un code reçu par email — aucun mot de passe.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email
            </label>
            <Input
              type="email"
              placeholder="prenom@exemple.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!!member || pending}
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Nom affiché
            </label>
            <Input
              placeholder="Marco"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pages accessibles
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PAGE_CHOICES.map((p) => {
                const Icon = p.icon
                return (
                  <label
                    key={p.slug}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"
                  >
                    <Checkbox
                      checked={pages.has(p.slug)}
                      onCheckedChange={() => toggle(pages, setPages, p.slug)}
                      disabled={pending}
                    />
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="truncate">{p.label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Modèles assignés
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {creators.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"
                >
                  <Checkbox
                    checked={models.has(c.id)}
                    onCheckedChange={() => toggle(models, setModels, c.id)}
                    disabled={pending}
                  />
                  <Badge className={modelColor(c.name)}>{c.name}</Badge>
                </label>
              ))}
            </div>
          </div>

          {pages.size === 0 && (
            <p className="text-xs text-muted-foreground">
              Coche au moins une page — sans page, le compte n&apos;aurait accès à rien.
            </p>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            onClick={submit}
            disabled={
              pending ||
              !displayName.trim() ||
              pages.size === 0 ||
              (!member && !email.includes('@'))
            }
            className="w-full sm:w-auto"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {member ? 'Enregistrer' : 'Créer le membre'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
