import { createClient } from '@/lib/supabase/server'
import { decryptSecret } from '@/lib/snap-crypto'
import { SNAP_STATUTS, type SnapCodesData, type SnapCodeRow, type SnapStatut } from '../types'

interface SnapCodeDb {
  creator_id: string
  pseudo: string | null
  mdp: string | null
  statut: string | null
  notes: string | null
}

/**
 * Codes Snap : UNE ligne par modèle actif (les modèles sans code apparaissent vides —
 * l'upsert de l'action crée la ligne à la première édition). Page admin : la RLS
 * (snap_codes admin-only, migration 0047) est la garde réelle.
 * `snap_codes` n'est pas dans les types générés (cf. précédent chatters_report) → cast.
 */
export async function getSnapCodes(): Promise<SnapCodesData> {
  const supabase = await createClient()
  const [{ data: creators }, codesRes] = await Promise.all([
    supabase.from('creators').select('id, name, active').order('name'),
    supabase.from('snap_codes' as never).select('creator_id, pseudo, mdp, statut, notes'),
  ])
  const codes = (codesRes.data ?? []) as unknown as SnapCodeDb[]
  const byCreator = new Map(codes.map((c) => [c.creator_id, c]))

  const rows: SnapCodeRow[] = (creators ?? [])
    .filter((c) => c.active)
    .map((c) => {
      const code = byCreator.get(c.id)
      const statut = code?.statut
      return {
        creatorId: c.id,
        model: c.name,
        pseudo: code?.pseudo ?? '',
        // Stocké chiffré (AES-256-GCM) — null = clé absente : état dégradé lisible.
        mdp: decryptSecret(code?.mdp ?? '') ?? '⚠ clé de déchiffrement absente',
        statut: (SNAP_STATUTS as readonly string[]).includes(statut ?? '')
          ? (statut as SnapStatut)
          : 'actif',
        notes: code?.notes ?? '',
      }
    })
  return { rows }
}
