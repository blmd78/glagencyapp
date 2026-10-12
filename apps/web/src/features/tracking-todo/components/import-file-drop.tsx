'use client'

import { useRef, useState } from 'react'
import { FileText, FileUp } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/*
 * La ZONE D'ENVOI de l'import d'une to-do (#163) : le champ fichier natif est CACHÉ, déclenché par une
 * zone visible (clic ou glisser-déposer) — même principe que la photo d'un événement Agence
 * (`event-dialog.client.tsx`). Rendu brut, le champ du navigateur se lisait comme du texte : on ne
 * savait pas qu'il fallait cliquer (recette du 2026-10-12).
 */

/** La zone d'envoi : un clic ouvre le sélecteur de fichiers, un fichier glissé dessus est pris tel quel. */
export function FileDrop({ onPick }: { onPick: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const file = e.dataTransfer.files[0]
          if (file) onPick(file)
        }}
        className={cn(
          'flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/25 px-6 py-8 text-center transition-colors',
          'hover:border-muted-foreground/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          over && 'border-primary bg-muted/60',
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-muted">
          <FileUp className="size-5 text-muted-foreground" />
        </span>
        <span className="grid gap-1">
          <span className="text-sm font-medium">Glisse ton fichier .txt ici</span>
          <span className="text-sm text-muted-foreground">ou</span>
        </span>
        <span className={buttonVariants({ variant: 'outline', size: 'sm' })}>Choisir un fichier</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ''
        }}
      />
    </>
  )
}

/** Le fichier choisi, et de quoi en prendre un autre. */
export function PickedFile({ name, onPick }: { name: string; onPick: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      <Button type="button" variant="ghost" size="sm" onClick={() => input.current?.click()}>
        Changer
      </Button>
      <input
        ref={input}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** Le format attendu, replié : ceux qui ont déjà le fichier n'en ont pas besoin. */
export function FormatHint() {
  const [open, setOpen] = useState(false)
  return (
    <div className="grid gap-2">
      <button
        type="button"
        className="justify-self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Masquer le format' : 'Voir le format attendu'}
      </button>
      {open ? (
        <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {[
            'TO-DO DE PRÉNOM · MODÈLES · 12 → 31 OCTOBRE 2026',
            '=== À CRÉER UNE SEULE FOIS : SECTION RÉCURRENTE « ROUTINE » ===',
            'Matin · Contrôler la nuit',
            '=== LUNDI 12 OCTOBRE ===',
            '[Modèle] Répondre aux messages en attente (1 h)',
          ].join('\n')}
        </pre>
      ) : null}
    </div>
  )
}
