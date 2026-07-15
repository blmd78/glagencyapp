'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { saveInfosModele } from '../actions'
import { BASE_FIELDS, type InfosSection, type ModeleInfos, type InfosModelesData } from '../types'

/**
 * Infos modèles (porté de gla-workflow) : un accordéon par modèle — identité de base +
 * sections typées (liste = pastilles colorées, fiche = mini-cartes, recits = cartes
 * récit avec badge d'âge, texte = paragraphe encadré), même rendu que le legacy.
 * Lecture cloisonnée par la RLS (un membre ne voit que ses modèles) ; édition admin.
 */

const TAG_PALETTES = [
  'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
]

// ─── Bloc identité (grille de champs étiquetés) ──────────────────────────────

function BaseBlock({ base }: { base: Record<string, string> }) {
  const nonMetier = BASE_FIELDS.filter((f) => f.key !== 'metier' && base[f.key])
  if (nonMetier.length === 0 && !base.metier && !base.extra) return null

  return (
    <div className="rounded-xl border bg-muted/40 p-4">
      {nonMetier.length > 0 && (
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
          {nonMetier.map((f) => (
            <div key={f.key}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</p>
              <p className="text-sm font-semibold leading-snug">{base[f.key]}</p>
            </div>
          ))}
        </div>
      )}
      {base.metier && (
        <div className={nonMetier.length > 0 ? 'mt-3 border-t pt-3' : ''}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Métier</p>
          <p className="text-sm font-semibold leading-snug">{base.metier}</p>
        </div>
      )}
      {base.extra && (
        <p className="mt-2.5 whitespace-pre-line border-t pt-2.5 text-xs leading-relaxed text-muted-foreground">
          {base.extra}
        </p>
      )}
    </div>
  )
}

// ─── Renderers par type de section ───────────────────────────────────────────

/** liste → nuage de pastilles colorées (une par ligne). */
function ListeContent({ contenu }: { contenu: string }) {
  const items = contenu
    .split('\n')
    .map((l) => l.replace(/^[-•*·]\s*/, '').trim())
    .filter(Boolean)
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <span key={i} className={cn('rounded-full border px-3 py-1 text-sm font-medium', TAG_PALETTES[i % TAG_PALETTES.length])}>
          {item}
        </span>
      ))}
    </div>
  )
}

/** fiche → lignes « Titre : … » suivies de leur description, en mini-cartes. */
function parseFicheMembers(contenu: string) {
  const members: Array<{ header: string; desc: string[] }> = []
  let current: { header: string; desc: string[] } | null = null
  for (const line of contenu.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const isHeader = /^[^:]{1,35}:[^:].{0,70}$/.test(t) && t.length < 85
    if (isHeader) {
      if (current) members.push(current)
      current = { header: t, desc: [] }
    } else if (current) {
      current.desc.push(t)
    }
  }
  if (current) members.push(current)
  return members
}

function FicheContent({ contenu }: { contenu: string }) {
  const members = parseFicheMembers(contenu)
  if (members.length === 0) {
    return <p className="whitespace-pre-line text-sm leading-relaxed">{contenu}</p>
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {members.map((m, i) => (
        <div key={i} className="rounded-lg border bg-muted/40 p-3.5">
          <p className="text-sm font-semibold leading-snug">{m.header}</p>
          {m.desc.map((d, j) => (
            <p key={j} className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{d}</p>
          ))}
        </div>
      ))}
    </div>
  )
}

/** recits → blocs séparés par ligne vide, en cartes titre + badge d'âge + extrait. */
function parseRecitsStories(contenu: string) {
  const blocks = contenu.split(/\n[ \t]*\n/).map((b) => b.trim()).filter(Boolean)
  if (blocks.length >= 2) {
    return blocks.flatMap((block) => {
      const bl = block.split('\n').map((l) => l.trim()).filter(Boolean)
      if (!bl.length) return []
      if (bl.length === 1) return [{ titre: bl[0], content: '' }]
      return bl[0].length < 100
        ? [{ titre: bl[0], content: bl.slice(1).join('\n') }]
        : [{ titre: '', content: block }]
    })
  }
  const lines = contenu.split('\n').filter((l) => l.trim())
  if (!lines.length) return []
  return [{ titre: lines[0], content: lines.slice(1).join('\n').trim() }]
}

function RecitsContent({ contenu }: { contenu: string }) {
  const stories = parseRecitsStories(contenu)
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {stories.map((story, i) => {
        const ageM = story.titre.match(/(?:À|à|A|a)\s+(\d{1,2})\s*ans?|\((\d{1,2})\s*ans?\)/i)
        const ageBadge = ageM ? `${ageM[1] || ageM[2]} ans` : null
        const titreBase = story.titre
          .replace(/(?:À|à|A|a)\s+\d{1,2}\s*ans?\s*[-–—]?\s*/i, '')
          .replace(/\(\d{1,2}\s*ans?\)/i, '')
          .replace(/^[-–—]\s*/, '')
          .trim()

        return (
          <div key={i} className="rounded-lg border bg-muted/40 p-3.5">
            <div className="mb-2 flex items-start justify-between gap-2">
              {(titreBase || story.titre) && (
                <p className="text-sm font-semibold leading-snug">{titreBase || story.titre}</p>
              )}
              {ageBadge && (
                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold', TAG_PALETTES[0])}>
                  {ageBadge}
                </span>
              )}
            </div>
            {story.content && (
              <p className="line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {story.content}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** texte (défaut) → paragraphe dans un panneau discret. */
function TexteContent({ contenu }: { contenu: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <p className="whitespace-pre-line text-sm leading-relaxed">{contenu}</p>
    </div>
  )
}

function SectionBlock({ section }: { section: InfosSection }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {section.emoji && <span className="select-none text-xl leading-none">{section.emoji}</span>}
        <h3 className="text-sm font-bold uppercase tracking-wide">{section.titre || 'Section'}</h3>
      </div>
      {section.type === 'liste' && <ListeContent contenu={section.contenu} />}
      {section.type === 'fiche' && <FicheContent contenu={section.contenu} />}
      {section.type === 'recits' && <RecitsContent contenu={section.contenu} />}
      {(!section.type || section.type === 'texte') && <TexteContent contenu={section.contenu} />}
    </div>
  )
}

// ─── Accordéon par modèle ────────────────────────────────────────────────────

function ModeleAccordion({ m, isAdmin, onEdit }: { m: ModeleInfos; isAdmin: boolean; onEdit: () => void }) {
  const [open, setOpen] = useState(false)
  const { base, sections } = m.infos

  const summary =
    [base.age ? `${base.age} ans` : '', base.ville || '', base.statut || ''].filter(Boolean).join(' · ') || null
  const hasContent = Object.values(base).some(Boolean) || sections.length > 0

  return (
    <div className="overflow-hidden rounded-xl border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/50"
      >
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-tight">{m.model}</p>
          {!open && summary && <p className="mt-0.5 truncate text-xs text-muted-foreground">{summary}</p>}
        </div>
        {sections.length > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {sections.length} section{sections.length > 1 ? 's' : ''}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t">
          {!hasContent ? (
            <p className="px-5 py-10 text-center text-sm italic text-muted-foreground">
              Aucune information renseignée{isAdmin ? ' — clique Modifier pour remplir la fiche.' : '.'}
            </p>
          ) : (
            <div className="px-5 py-5">
              <BaseBlock base={base} />
              {sections.map((s, i) => (
                <div key={i} className={cn('pt-5', (i > 0 || Object.values(base).some(Boolean)) && 'mt-1 border-t')}>
                  <SectionBlock section={s} />
                </div>
              ))}
            </div>
          )}
          {isAdmin && (
            <div className="flex justify-end border-t px-5 py-3">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onEdit}>
                <Pencil className="size-3.5" /> Modifier
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EditDialog({
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
      if (!res.success) return setError(res.error)
      setError(null)
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

export function InfosModelesView({ data, isAdmin }: { data: InfosModelesData; isAdmin: boolean }) {
  const [model, setModel] = useState('all')
  const [editing, setEditing] = useState<string | null>(null)

  const shown = model === 'all' ? data.modeles : data.modeles.filter((m) => m.creatorId === model)
  const editingModele = data.modeles.find((m) => m.creatorId === editing)

  return (
    <>
      <Combobox
        value={model}
        onChange={setModel}
        className="h-8 w-44 text-xs"
        searchPlaceholder="Rechercher un modèle…"
        options={[
          { value: 'all', label: 'Tous les modèles' },
          ...data.modeles.map((m) => ({ value: m.creatorId, label: m.model })),
        ]}
      />

      {shown.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucun modèle visible.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((m) => (
            <ModeleAccordion key={m.creatorId} m={m} isAdmin={isAdmin} onEdit={() => setEditing(m.creatorId)} />
          ))}
        </div>
      )}

      {editingModele && (
        <EditDialog
          key={editingModele.creatorId}
          m={editingModele}
          open
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
