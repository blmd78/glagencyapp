import { createClient } from '@/lib/supabase/server'
import { decryptSecret } from '@/lib/snap-crypto'
import { SNAP_STATUTS, type SnapCodesData, type SnapCodeRow, type SnapStatut } from '../types'

/**
 * Codes Snap : UNE ligne par modèle actif (les modèles sans code apparaissent vides —
 * l'upsert de l'action crée la ligne à la première édition). Page ASSIGNABLE : lecture
 * ouverte à `has_page('codes-snap')` (RLS `snap_codes_read`, 0063) ; l'ÉCRITURE reste
 * admin (adminGuard côté action + RLS `snap_codes_admin_all`, 0047).
 * `snap_codes` est dans les types générés (`packages/db/src/types.ts:1810`) → appel typé,
 * aucun cast. Table de config (1 ligne / modèle, pas une table de faits journaliers) →
 * volume borné par le nombre de modèles, bien sous la limite PostgREST de 1000 lignes ;
 * pas de `fetchAll` nécessaire (docs/guidelines-data-loading.md §2), `.order()` sur la PK
 * (`creator_id`, migration 0047) pour un résultat déterministe.
 */
export async function getSnapCodes(): Promise<SnapCodesData> {
  const supabase = await createClient()
  const [creatorsRes, codesRes] = await Promise.all([
    supabase.from('creators').select('id, name, active').order('name'),
    supabase
      .from('snap_codes')
      .select('creator_id, pseudo, mdp, statut, notes')
      .order('creator_id'),
  ])
  // Toute erreur de query destructurée et thrown — jamais avalée (docs/guidelines-standard-feature.md §3).
  if (creatorsRes.error) throw new Error(creatorsRes.error.message)
  if (codesRes.error) throw new Error(codesRes.error.message)

  const byCreator = new Map(codesRes.data.map((c) => [c.creator_id, c]))

  const rows: SnapCodeRow[] = creatorsRes.data
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
