'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Check, Copy, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { deleteScriptItem, moveScriptItem } from './actions'
import { ItemDialog } from './components/item-dialog'
import type { ScriptItem, ScriptsData } from './types'

/** Bouton copier d'un message — feedback « Copié ! » 1,8 s (comme le doc d'origine). */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }}
    >
      {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
      {copied ? 'Copié !' : 'Copier'}
    </Button>
  )
}

/** Actions admin d'un item (éditer / monter / descendre / supprimer). */
function AdminActions({
  item,
  onEdit,
}: {
  item: ScriptItem
  onEdit: (i: ScriptItem) => void
}) {
  return (
    <div className="flex shrink-0 gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Monter"
        onClick={() => moveScriptItem({ id: item.id, direction: 'up' })}
      >
        <ArrowUp className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Descendre"
        onClick={() => moveScriptItem({ id: item.id, direction: 'down' })}
      >
        <ArrowDown className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Modifier"
        onClick={() => onEdit(item)}
      >
        <Pencil className="size-3.5" />
      </Button>
      <ConfirmDialog
        title="Supprimer cet item ?"
        description="Il est retiré du script de ce modèle."
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-red-600 hover:text-red-700"
            aria-label="Supprimer"
          >
            <Trash2 className="size-3.5" />
          </Button>
        }
        onConfirm={async () => {
          const res = await deleteScriptItem(item.id)
          if (!res.success) return res.error
        }}
      />
    </div>
  )
}

/**
 * Funnel de messages d'un modèle : les membres consultent/copient (toujours la dernière
 * version — l'admin édite, revalidation immédiate), l'admin fait évoluer le script.
 */
export function ScriptsTemplate({ data, isAdmin }: { data: ScriptsData; isAdmin?: boolean }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<ScriptItem | 'new' | null>(null)

  const messagesCount = data.items.filter((i) => i.kind === 'message').length
  const items = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return data.items
    return data.items.filter(
      (i) => i.label.toLowerCase().includes(term) || i.body.toLowerCase().includes(term),
    )
  }, [data.items, search])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scripts</h1>
          <p className="text-sm text-muted-foreground">
            {data.creatorName
              ? `${data.creatorName} · ${messagesCount} message${messagesCount > 1 ? 's' : ''} — clique « Copier » puis colle dans la conversation`
              : 'Aucun modèle accessible'}
          </p>
        </div>
        {isAdmin && data.creatorId && (
          <Button size="sm" className="ml-auto gap-1.5" onClick={() => setEditing('new')}>
            <Plus className="size-3.5" />
            Ajouter un item
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Rechercher un message…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Combobox
          value={data.creatorId ?? ''}
          onChange={(id) => router.push(`/chatter/scripts?modele=${id}`)}
          className="w-52"
          placeholder="Choisir un modèle…"
          searchPlaceholder="Rechercher un modèle…"
          options={data.creators.map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>

      {items.length > 0 ? (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {items.map((item) => {
            if (item.kind === 'section')
              return (
                <div key={item.id} className="mt-4 flex items-center gap-2">
                  <h2 className="text-lg font-semibold uppercase tracking-wide">{item.label}</h2>
                  {isAdmin && <AdminActions item={item} onEdit={setEditing} />}
                </div>
              )
            if (item.kind === 'note')
              return (
                <div key={item.id} className="flex items-center justify-center gap-2 py-1">
                  <p className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    {item.body}
                  </p>
                  {isAdmin && <AdminActions item={item} onEdit={setEditing} />}
                </div>
              )
            if (item.kind === 'warn')
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <p className="whitespace-pre-line">{item.body}</p>
                  {isAdmin && (
                    <div className="ml-auto">
                      <AdminActions item={item} onEdit={setEditing} />
                    </div>
                  )}
                </div>
              )
            return (
              <div key={item.id} className="rounded-xl border p-4">
                <div className="flex items-center gap-2">
                  {item.label && (
                    <Badge className="bg-violet-100 text-[10px] font-semibold tracking-wider text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                      {item.label}
                    </Badge>
                  )}
                  <div className={cn('ml-auto flex items-center gap-1.5')}>
                    {isAdmin && <AdminActions item={item} onEdit={setEditing} />}
                    <CopyButton text={item.body} />
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{item.body}</p>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">
            {search ? 'Aucun message ne correspond' : 'Aucun script pour ce modèle'}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {search
              ? 'Essaie un autre terme de recherche.'
              : isAdmin
                ? 'Ajoute un premier item pour construire le funnel de ce modèle.'
                : 'Le script n’a pas encore été défini — vois avec un admin.'}
          </p>
        </div>
      )}

      {isAdmin && data.creatorId && (
        <ItemDialog
          creatorId={data.creatorId}
          item={editing !== 'new' ? editing : null}
          open={editing !== null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
