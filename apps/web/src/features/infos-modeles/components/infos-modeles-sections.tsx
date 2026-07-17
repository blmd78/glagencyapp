import { cn } from '@/lib/utils'
import { BASE_FIELDS, type InfosSection } from '../types'

/**
 * Rendu du contenu d'un modèle : bloc identité + renderers par type de section (liste =
 * pastilles colorées, fiche = mini-cartes, recits = cartes récit avec badge d'âge, texte
 * = paragraphe encadré). Extrait de `infos-modeles-view.tsx` (split > 300 l., même
 * découpe par responsabilité que `chatters-columns.tsx`/`planning-grid-header.tsx`).
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

export function BaseBlock({ base }: { base: Record<string, string> }) {
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

export function SectionBlock({ section }: { section: InfosSection }) {
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
