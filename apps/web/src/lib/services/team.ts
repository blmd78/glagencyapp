import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'

export interface VisibleProfile {
  id: string
  displayName: string | null
  /** Rôle EXACT en base (`chatteur`, `sous-manager`, `manager`, `police`, `admin`, `superadmin`). */
  role: string
}

/**
 * LA source « qui est dans mon périmètre » — profils visibles par l'utilisateur courant
 * sous RLS (0097) : admin ET tout encadrant (manager/sous-manager) → TOUT LE MONDE ;
 * chatteur → soi seul.
 *
 * Tout sélecteur de personnes (options d'un picker) doit partir d'ici, PAS du client admin :
 * la profondeur hiérarchique est définie UNE fois en SQL et héritée partout. Le client admin
 * reste réservé à la RÉSOLUTION de noms (afficher l'existant hors périmètre).
 * `cache()` : dédupliqué par requête si plusieurs features l'appellent.
 */
export const getVisibleProfiles = cache(async (): Promise<VisibleProfile[]> => {
  const supabase = await createClient()
  const { data, error } = await fetchAll((f, t) =>
    supabase.from('profiles').select('id, display_name, role').order('id').range(f, t),
  )
  if (error) throw new Error(error.message)
  return data.map((p) => ({ id: p.id, displayName: p.display_name, role: p.role }))
})
