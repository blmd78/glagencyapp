'use client'

import { useState } from 'react'
import { Combobox } from '@/components/ui/combobox'
import { ModeleAccordion } from './infos-modeles-accordion'
import { EditDialog } from './infos-modeles-edit-dialog'
import type { InfosModelesData } from '../types'

/**
 * Infos modèles (porté de gla-workflow) : un accordéon par modèle — identité de base +
 * sections typées (liste = pastilles colorées, fiche = mini-cartes, recits = cartes
 * récit avec badge d'âge, texte = paragraphe encadré), même rendu que le legacy.
 * Lecture cloisonnée par la RLS (un membre ne voit que ses modèles) ; édition admin.
 * Orchestration (filtre + liste + dialog) — rendu par type de section dans
 * `infos-modeles-sections.tsx`, accordéon dans `infos-modeles-accordion.tsx`, dialog
 * d'édition dans `infos-modeles-edit-dialog.tsx` (split > 300 l.).
 */
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
