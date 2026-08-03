'use client'

import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CRM_SHIFTS } from '@/lib/types/chatters'
import { saveOrgRow } from '../actions'
import type { OrganisationData } from '../types'
import { CHIP_GREEN, CHIP_VIOLET, ChipSelect, COLS, DIRECT } from './org-table-cells'

/**
 * Pied du tableau, RÉSERVÉ À L'ADMIN : la ligne de création alignée sur les colonnes, ou le
 * bouton qui l'ouvre. Extrait d'`org-table.tsx` (split > 300 lignes,
 * docs/guidelines-standard-feature.md §1) — rendu inchangé.
 *
 * La garde `isAdmin` reste chez l'appelant : ce composant n'est monté que pour lui.
 */
export function OrgTableDraftRow({
  data,
  draft,
  setDraft,
  pending,
  run,
}: {
  data: OrganisationData
  /** Ligne en cours de création : `null` = on affiche le bouton « Ajouter une ligne ». */
  draft: { manager: string; owner: string } | null
  setDraft: (next: { manager: string; owner: string } | null) => void
  pending: boolean
  run: (fn: () => Promise<{ success: boolean; error?: string }>) => void
}) {
  return (
    <>
    {draft && (
      // Ligne d'ajout ALIGNÉE sur les colonnes : on choisit dans l'ordre du tableau
      // (manager → sous-manager → modèle), et le choix du modèle valide la ligne.
      <tr className="border-t-2 bg-muted/30 align-top">
        <td className="px-3 py-2">
          <ChipSelect
            value={draft.manager || null}
            label={data.managerOptions.find((m) => m.id === draft.manager)?.name ?? null}
            options={data.managerOptions}
            chipClass={CHIP_GREEN}
            editable
            defaultOpen={!draft.manager}
            placeholder="Rechercher un manager…"
            onSelect={(m) => setDraft({ manager: m, owner: draft.owner })}
          />
        </td>
        <td className="px-3 py-2">
          <ChipSelect
            value={draft.owner}
            label={
              draft.owner === 'direct'
                ? 'porté par le manager'
                : (data.sousManagerOptions.find((o) => o.id === draft.owner)?.name ?? null)
            }
            options={[DIRECT, ...data.sousManagerOptions]}
            chipClass={draft.owner === 'direct' ? 'bg-muted text-muted-foreground' : CHIP_GREEN}
            editable
            placeholder="Rechercher un sous-manager…"
            onSelect={(v) => setDraft({ manager: draft.manager, owner: v })}
          />
        </td>
        <td className="px-3 py-2">
          <ChipSelect
            value={null}
            label={null}
            options={data.modelOptions}
            chipClass={CHIP_VIOLET}
            editable
            disabled={!draft.manager || pending}
            placeholder="Rechercher un modèle…"
            onSelect={(creator) => {
              const d = draft
              setDraft(null)
              run(() =>
                saveOrgRow({
                  ownerId: d.owner === 'direct' ? d.manager : d.owner,
                  creatorId: creator,
                  prevOwnerId: null,
                  prevCreatorId: null,
                  sectionManagerId: d.owner === 'direct' ? null : d.manager,
                }),
              )
            }}
          />
        </td>
        <td colSpan={CRM_SHIFTS.length} className="px-3 py-2 text-xs text-muted-foreground">
          {draft.manager ? 'Choisis le modèle pour créer la ligne.' : 'Choisis d’abord le manager.'}
        </td>
        <td className="px-1 py-2 text-right">
          <Button variant="ghost" size="icon" className="size-6" aria-label="Annuler" onClick={() => setDraft(null)}>
            <X className="size-3.5" />
          </Button>
        </td>
      </tr>
    )}
    {!draft && (
      <tr className="border-t-2">
        <td colSpan={COLS} className="p-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            disabled={pending}
            onClick={() =>
              setDraft({ manager: '', owner: 'direct' })
            }
          >
            <Plus className="size-3.5" />
            Ajouter une ligne
          </Button>
        </td>
      </tr>
    )}
    </>
  )
}
