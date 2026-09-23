import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { noteKey, type SourceNotes } from '../types'

/**
 * Les notes des sources de trafic (0170), toutes modèles confondues — indexées pour que chaque
 * ligne réseau retrouve la sienne sans parcourir la liste.
 *
 * `fetchAll` par principe (jamais de `select` nu) : quelques dizaines de lignes aujourd'hui
 * (modèles × réseaux), mais rien ne borne la table. Lecture RLS, même porte que le reste du pôle.
 */
export async function getSourceNotes(): Promise<SourceNotes> {
  const supabase = await createClient()
  const { data, error } = await fetchAll((f, t) =>
    supabase
      .from('mkt_source_notes')
      .select('creator_id, group_key, body, updated_at')
      .order('creator_id')
      .order('group_key')
      .range(f, t),
  )
  if (error) throw new Error(error.message)
  const notes: SourceNotes = {}
  for (const n of data ?? []) notes[noteKey(n.creator_id, n.group_key)] = { body: n.body, updatedAt: n.updated_at }
  return notes
}
