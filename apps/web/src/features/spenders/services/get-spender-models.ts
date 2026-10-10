import { fetchAll } from '@glagency/db'
import type { ComboOption } from '@/components/ui/combobox'
import { createClient } from '@/lib/supabase/server'

/**
 * Filtre « modèle » des vues paginées (Liste, À relancer) : TOUTES les modèles actives que l'appelant
 * peut lire — RLS `creators_scoped_read` : admin → toutes, sinon ses modèles assignées. Les lignes
 * chargées n'en portent qu'une partie (100 premiers spenders).
 */
export async function getSpenderModels(): Promise<ComboOption[]> {
  const supabase = await createClient()
  const { data, error } = await fetchAll<{ id: string; name: string }>((from, to) =>
    supabase.from('creators').select('id, name').eq('active', true).order('name').order('id').range(from, to),
  )
  if (error) throw new Error(error.message)
  return data.map((c) => ({ value: c.id, label: c.name }))
}
