'use server'

// Réglage des groupes de liens (`mkt_link_groups`, 0167) — écriture ADMIN.
//
// Pourquoi `adminGuard` alors que la RLS ouvre la table à tout le pôle marketing : un motif
// range TOUS les liens neufs et une priorité peut faire basculer un groupe entier. C'est un
// réglage de structure, pas un geste quotidien — le déplacement lien par lien, lui, reste
// ouvert comme avant.

import { revalidatePath } from 'next/cache'
import { detectLinkGroup, type LinkGroupRule } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { runAction, adminGuard, BusinessError, type ActionResult } from '@/lib/actions'
import { createGroupSchema, deleteGroupSchema, updateGroupSchema } from './groups.schema'

const PATHS = ['/marketing/liens', '/marketing/liens/groupes', '/marketing/modeles']
const revalidateAll = () => PATHS.forEach((p) => revalidatePath(p))

type Db = Awaited<ReturnType<typeof createClient>>

/**
 * Range la FILE D'ATTENTE avec les règles du moment — appelé après chaque création ou
 * modification d'un groupe. Sans lui, créer « Reddit » laissait dans « À classer » les trois
 * liens `REDDIT_…` qui l'avaient justifié : la règle ne s'applique qu'aux liens NEUFS.
 *
 * Seule la file d'attente est relue : un lien qu'un humain a rangé dans un groupe ne bouge
 * jamais. Rend le nombre de liens rangés, pour le dire à l'écran.
 */
async function rangerFileDAttente(supabase: Db): Promise<number> {
  const { data: rows, error } = await supabase
    .from('mkt_link_groups')
    .select('key, contains, starts_with, words, priority, is_fallback')
    .is('deleted_at', null)
  if (error) throw new Error(error.message)
  const regles: LinkGroupRule[] = (rows ?? []).map((g) => ({
    key: g.key,
    contains: g.contains,
    startsWith: g.starts_with,
    words: g.words,
    priority: g.priority,
    isFallback: g.is_fallback,
  }))
  const repli = regles.find((r) => r.isFallback)?.key
  if (!repli) return 0

  const { data: liens, error: lErr } = await fetchAll((f, t) =>
    supabase.from('mkt_links').select('id, name').eq('type', repli).order('id').range(f, t),
  )
  if (lErr) throw new Error(lErr.message)
  const parGroupe = new Map<string, string[]>()
  for (const l of liens ?? []) {
    const cible = detectLinkGroup(l.name, regles)
    if (cible !== repli) parGroupe.set(cible, [...(parGroupe.get(cible) ?? []), l.id])
  }
  let ranges = 0
  for (const [cible, ids] of parGroupe) {
    const { error: uErr } = await supabase.from('mkt_links').update({ type: cible }).in('id', ids)
    if (uErr) throw new Error(uErr.message)
    ranges += ids.length
  }
  return ranges
}

export async function createLinkGroup(raw: unknown): Promise<ActionResult<{ ranges: number }>> {
  return runAction({
    schema: createGroupSchema,
    input: raw,
    guard: adminGuard,
    handler: async (values) => {
      const supabase = await createClient()
      // Un groupe SUPPRIMÉ porte la même clé unique : on le ressuscite plutôt que de buter sur
      // la contrainte avec un « existe déjà » incompréhensible (il n'apparaît nulle part).
      const { data: ancien } = await supabase
        .from('mkt_link_groups')
        .select('key, deleted_at')
        .eq('key', values.key)
        .maybeSingle()
      if (ancien && !ancien.deleted_at) throw new BusinessError('Cette clé est déjà prise.')
      const row = {
        label: values.label,
        contains: values.contains,
        starts_with: values.startsWith,
        words: values.words,
        color: values.color,
        priority: values.priority,
        auto: false,
        deleted_at: null,
      }
      const { error } = ancien
        ? await supabase.from('mkt_link_groups').update(row).eq('key', values.key)
        : await supabase.from('mkt_link_groups').insert({ key: values.key, ...row })
      if (error) throw new Error(error.message)
      const ranges = await rangerFileDAttente(supabase)
      revalidateAll()
      return { ranges }
    },
  })
}

export async function updateLinkGroup(raw: unknown): Promise<ActionResult<{ ranges: number }>> {
  return runAction({
    schema: updateGroupSchema,
    input: raw,
    guard: adminGuard,
    handler: async (values) => {
      const supabase = await createClient()
      const { error } = await supabase
        .from('mkt_link_groups')
        .update({
          label: values.label,
          contains: values.contains,
          starts_with: values.startsWith,
          words: values.words,
          color: values.color,
          priority: values.priority,
          // Relu et réglé par un humain : le badge « créé automatiquement » n'a plus lieu d'être.
          auto: false,
        })
        .eq('key', values.key)
      if (error) throw new Error(error.message)
      const ranges = await rangerFileDAttente(supabase)
      revalidateAll()
      return { ranges }
    },
  })
}

/**
 * Suppression DOUCE : la ligne reste, pour que l'ingestion ne recrée pas au prochain scrape un
 * groupe qu'on vient d'écarter. Ses liens repartent dans le repli plutôt que de pointer une clé
 * invisible — la clé étrangère l'exigerait de toute façon.
 */
export async function deleteLinkGroup(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: deleteGroupSchema,
    input: raw,
    guard: adminGuard,
    handler: async ({ key }) => {
      const supabase = await createClient()
      const { data: groupes, error: gErr } = await supabase
        .from('mkt_link_groups')
        .select('key, is_fallback')
        .is('deleted_at', null)
      if (gErr) throw new Error(gErr.message)
      const cible = (groupes ?? []).find((g) => g.key === key)
      if (!cible) throw new BusinessError('Ce groupe n’existe plus.')
      // La file d'attente est le filet de sécurité de tous les autres : la supprimer laisserait
      // les liens sans destination au prochain scrape.
      if (cible.is_fallback) throw new BusinessError('Le groupe « À classer » ne peut pas être supprimé.')
      const repli = (groupes ?? []).find((g) => g.is_fallback)?.key
      if (!repli) throw new BusinessError('Aucun groupe de repli : impossible de déplacer les liens.')

      const { error: mvErr } = await supabase.from('mkt_links').update({ type: repli }).eq('type', key)
      if (mvErr) throw new Error(mvErr.message)
      const { error } = await supabase
        .from('mkt_link_groups')
        .update({ deleted_at: new Date().toISOString() })
        .eq('key', key)
      if (error) throw new Error(error.message)
      revalidateAll()
    },
  })
}
