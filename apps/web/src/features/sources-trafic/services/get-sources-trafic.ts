import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getMktGroups } from '@/lib/services/get-mkt-groups'
import { NEUTRAL_COLOR } from '@/lib/mkt-groups'
import type { ModeleSources, SourceNoteView, SourcesTraficData } from '../types'

const DATE_PARIS = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/**
 * Toutes les modèles visibles, toutes leurs sources, et les notes qui existent.
 *
 * Le CLOISONNEMENT est celui de la base, jamais refait ici : `creators` (RLS : ses modèles,
 * admin toutes), `mkt_model_sources()` (0172, même règle, sans rien livrer des liens eux-mêmes)
 * et `mkt_source_notes` (0171). Refiltrer côté app ferait croire que c'est l'app qui protège.
 *
 * Une source = un réseau où la modèle a au moins un lien, OU une note sans lien (réseau
 * abandonné dont la note reste utile). Ordre des réseaux = celui des groupes (l'écran Liens).
 */
export async function getSourcesTrafic(): Promise<SourcesTraficData> {
  const supabase = await createClient()
  const [creatorsRes, couplesRes, notesRes, groups] = await Promise.all([
    supabase.from('creators').select('id, name').order('name'),
    supabase.rpc('mkt_model_sources'),
    fetchAll((f, t) =>
      supabase
        .from('mkt_source_notes')
        .select('creator_id, group_key, body, updated_at')
        .order('creator_id')
        .order('group_key')
        .range(f, t),
    ),
    getMktGroups(),
  ])
  if (creatorsRes.error) throw new Error(creatorsRes.error.message)
  if (couplesRes.error) throw new Error(couplesRes.error.message)
  if (notesRes.error) throw new Error(notesRes.error.message)

  const cle = (creatorId: string, groupKey: string) => `${creatorId}:${groupKey}`
  const notes = new Map<string, SourceNoteView>()
  for (const n of notesRes.data ?? []) {
    notes.set(cle(n.creator_id, n.group_key), { body: n.body, updatedLabel: DATE_PARIS.format(new Date(n.updated_at)) })
  }

  const reseauxDe = new Map<string, Set<string>>()
  const ajoute = (creatorId: string, groupKey: string) =>
    reseauxDe.set(creatorId, (reseauxDe.get(creatorId) ?? new Set()).add(groupKey))
  for (const c of couplesRes.data ?? []) ajoute(c.creator_id, c.group_key)
  for (const n of notesRes.data ?? []) ajoute(n.creator_id, n.group_key)

  const rang = (key: string) => groups.find((g) => g.key === key)?.priority ?? 999
  const modeles: ModeleSources[] = (creatorsRes.data ?? []).map((c) => ({
    creatorId: c.id,
    name: c.name,
    sources: [...(reseauxDe.get(c.id) ?? [])]
      .sort((a, b) => rang(a) - rang(b))
      .map((key) => {
        const g = groups.find((x) => x.key === key)
        return {
          groupKey: key,
          reseau: g?.label ?? key,
          color: g?.color || NEUTRAL_COLOR,
          note: notes.get(cle(c.id, key)) ?? null,
        }
      }),
  }))
  return { modeles, notes: notes.size }
}
