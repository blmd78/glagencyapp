'use client'

import { useState } from 'react'
import { CollapsibleSection } from '@/components/collapsible-section'
import { Combobox } from '@/components/ui/combobox'
import type { ModeleSources, SourcesTraficData } from '../types'
import { SourceNoteReadDialog } from './source-note-read-dialog.client'

const TOUS = 'all'

/**
 * Toutes les modèles, toutes leurs sources (demande Benoit 2026-09-23), une modèle par
 * accordéon REPLIÉ — le panneau repliable partagé de l'app (`CollapsibleSection`), comme les
 * fiches Infos modèles. Replié, il dit déjà quels réseaux et combien de notes ; choisir une
 * modèle au sélecteur la déplie d'elle-même (la `key` change, `defaultOpen` rejoue).
 *
 * Les notes ne s'affichent PAS en ligne — l'œil les ouvre en fenêtre, sans quoi 20 000
 * caractères noieraient la page. Sélecteur = celui de toujours (`chatters-table.tsx`).
 */
export function SourcesTraficView({ data }: { data: SourcesTraficData }) {
  const [modelId, setModelId] = useState(TOUS)

  if (data.modeles.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Aucune modèle ne t’est rattachée pour l’instant.
      </p>
    )
  }

  const visibles = modelId === TOUS ? data.modeles : data.modeles.filter((m) => m.creatorId === modelId)

  return (
    <div className="flex flex-col gap-3">
      <Combobox
        value={modelId}
        onChange={(v) => setModelId(v || TOUS)}
        className="w-44"
        searchPlaceholder="Rechercher un modèle…"
        options={[
          { value: TOUS, label: 'Tous les modèles' },
          ...data.modeles.map((m) => ({ value: m.creatorId, label: m.name })),
        ]}
      />
      {visibles.map((m) => (
        <ModeleCard key={`${m.creatorId}:${modelId}`} m={m} defaultOpen={modelId !== TOUS} />
      ))}
    </div>
  )
}

function ModeleCard({ m, defaultOpen }: { m: ModeleSources; defaultOpen: boolean }) {
  const nbNotes = m.sources.filter((s) => s.note).length
  return (
    <CollapsibleSection
      defaultOpen={defaultOpen}
      density="confortable"
      trigger={
        <>
          {/* `span` et non `div` : le trigger est un `<button>`, qui n'accepte que du phrasé. */}
          <span className="block min-w-0 flex-1">
            <span className="block text-base font-semibold leading-tight">{m.name}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-normal text-muted-foreground">
              {m.sources.length === 0
                ? 'Aucune source de trafic'
                : m.sources.map((s) => (
                    <span key={s.groupKey} className="inline-flex items-center gap-1.5">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                      {s.reseau}
                    </span>
                  ))}
            </span>
          </span>
          {nbNotes > 0 && (
            <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
              {nbNotes} note{nbNotes > 1 ? 's' : ''}
            </span>
          )}
        </>
      }
    >
      {m.sources.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm italic text-muted-foreground">Aucune source de trafic.</p>
      ) : (
        <div className="divide-y">
          {m.sources.map((s) => (
            <div key={s.groupKey} className="flex items-center gap-3 px-5 py-2 hover:bg-accent/30">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="text-sm font-medium">{s.reseau}</span>
              <span className="ml-auto flex items-center gap-2">
                {s.note ? (
                  <>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      mise à jour le {s.note.updatedLabel}
                    </span>
                    <SourceNoteReadDialog modele={m.name} reseau={s.reseau} note={s.note} />
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">pas de note</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  )
}
