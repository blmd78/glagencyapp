import { createClient } from '@/lib/supabase/server'
import type { ScriptItem, ScriptKind, ScriptsData } from '../types'

/**
 * Script d'UN modèle + modèles accessibles pour le sélecteur. Le RLS fait le
 * cloisonnement : un membre ne voit que les creators de `profile_creators`, l'admin
 * tout — aucune garde applicative nécessaire ici (lecture seule).
 */
export async function getScripts(creatorId?: string): Promise<ScriptsData> {
  const supabase = await createClient()
  const { data: creators } = await supabase.from('creators').select('id, name').order('name')

  const list = creators ?? []
  const target = (creatorId && list.find((c) => c.id === creatorId)) || list[0] || null
  if (!target) return { creatorId: null, creatorName: null, items: [], creators: [] }

  const { data: items } = await supabase
    .from('script_items')
    .select('id, creator_id, position, kind, label, body')
    .eq('creator_id', target.id)
    .order('position')

  const rows: ScriptItem[] = (items ?? []).map((i) => ({
    id: i.id,
    creatorId: i.creator_id,
    position: i.position,
    kind: i.kind as ScriptKind,
    label: i.label,
    body: i.body,
  }))
  return { creatorId: target.id, creatorName: target.name, items: rows, creators: list }
}
