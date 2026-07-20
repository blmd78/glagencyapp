'use server'

// Server Actions de la to-do personnelle. `requireCanWriteTodo` = miroir EXACT de la fonction
// RLS `can_write_todo_of` (0067) : cible encadrante, et soit les règles du planning
// (can_edit_planning_of), soit sa propre liste. La RLS reste l'enforcement réel ; cette garde
// évite un aller-retour DB inutile et donne un message français au lieu du refus RLS brut.
//
// Vérifiée UNE SEULE FOIS, en tête de chaque handler — PAS dans `guard` : `cache()` (React) ne
// mémoïse que dans le rendu d'un Server Component (react.dev/reference/react/cache, « cache is
// for use in Server Components only » — appelée hors composant, la fonction s'exécute mais ne
// lit ni n'alimente jamais le cache). Un `guard` qui vérifiait le droit puis un handler qui le
// revérifiait payaient donc deux fois la requête Supabase — et le refus du `guard` court-
// circuitait `runAction` AVANT le `schema.safeParse` officiel, donc avec son propre parsing
// dupliqué. `runAction` exige quand même un `guard` : `noGuard` ci-dessous le satisfait sans
// rien vérifier, tout le contrôle vit dans le handler (`BusinessError` = message métier affiché
// tel quel, jamais l'« Erreur inattendue » d'un throw générique).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile, type Profile } from '@/lib/auth'
import { runAction, BusinessError, type ActionResult } from '@/lib/actions'
import { todoCreateInput, todoDeleteInput, todoStatusInput, todoUpdateInput } from './schema'

const ENCADRANTS = ['superadmin', 'admin', 'manager', 'sous-manager']

const loadTargetProfile = async (id: string) => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('role, manager_id')
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  return data
}

/** Miroir de `can_write_todo_of`. Appelée une seule fois par action, en tête du handler. */
const requireCanWriteTodo = async (targetId: string): Promise<{ profile: Profile } | { error: string }> => {
  const profile = await getProfile()
  if (!profile) return { error: 'Accès réservé' }
  // Sa propre liste : ouverte à tout encadrant (un chatteur n'a pas de to-do).
  if (targetId === profile.id) {
    return ENCADRANTS.includes(profile.baseRole) ? { profile } : { error: 'Accès réservé' }
  }
  const target = await loadTargetProfile(targetId)
  // La RLS de `profiles` masque les profils hors périmètre : ce `null` peut donc autant
  // signifier « n'existe pas » que « existe mais tu n'y as pas accès ». Le refus est correct
  // dans les deux cas — message volontairement neutre pour ne pas mentir sur lequel.
  if (!target) return { error: 'Accès réservé' }
  if (!ENCADRANTS.includes(target.role)) return { error: 'Cette personne n’a pas de to-do' }
  if (profile.superadmin) return { profile }
  if (profile.role === 'admin') {
    if (target.role === 'admin' || target.role === 'superadmin') {
      return { error: 'La to-do d’un admin est gérée par un propriétaire' }
    }
    return { profile }
  }
  if (profile.baseRole === 'manager' && target.role === 'sous-manager' && target.manager_id === profile.id) {
    return { profile }
  }
  return { error: 'Accès réservé' }
}

/** `runAction` exige un `guard` ; le contrôle réel vit dans le handler (voir en tête de fichier). */
const noGuard = async () => ({ ok: true as const })

const revalidateTodos = () => revalidatePath('/chatter/planning')

/** Crée une tâche dans la liste de `profileId`. */
export async function createTodo(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: todoCreateInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      const res = await requireCanWriteTodo(values.profileId)
      if ('error' in res) throw new BusinessError(res.error)
      const supabase = await createClient()
      const { error } = await supabase.from('todos').insert({
        profile_id: values.profileId,
        title: values.title,
        description: values.description,
        type: values.type,
        priority: values.priority,
        release: values.release,
        status: values.status,
        created_by: res.profile.id,
        // Dénormalisé : la RLS de profiles empêcherait un manager de résoudre ce nom.
        created_by_name: res.profile.displayName ?? res.profile.email ?? null,
      })
      if (error) throw new Error(error.message)
      revalidateTodos()
    },
  })
}

export async function updateTodo(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: todoUpdateInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      const res = await requireCanWriteTodo(values.profileId)
      if ('error' in res) throw new BusinessError(res.error)
      const supabase = await createClient()
      // .eq('profile_id') en plus de l'id : un id d'une AUTRE liste ne peut pas être détourné
      // via un profileId complaisant (la RLS le bloquerait déjà, ceinture + bretelles).
      // .select().maybeSingle() : rien ici ne vérifie que CETTE tâche existe encore — un 0-row
      // est donc un cas métier normal (tâche supprimée entretemps par quelqu'un d'autre, carte
      // affichée périmée), pas une simple race technique → BusinessError, message affiché tel
      // quel à l'écran.
      const { data, error } = await supabase
        .from('todos')
        .update({
          title: values.title,
          description: values.description,
          type: values.type,
          priority: values.priority,
          release: values.release,
        })
        .eq('id', values.id)
        .eq('profile_id', values.profileId)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new BusinessError('Cette tâche n’existe plus ou n’a pas pu être modifiée.')
      revalidateTodos()
    },
  })
}

/** Change le statut — valeur ABSOLUE, jamais un déplacement relatif. */
export async function setTodoStatus(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: todoStatusInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      const res = await requireCanWriteTodo(values.profileId)
      if ('error' in res) throw new BusinessError(res.error)
      const supabase = await createClient()
      // done_at et updated_at sont posés par le trigger todos_touch (0067).
      // Même raisonnement que updateTodo : 0-row = cas métier (tâche déjà supprimée / carte
      // périmée), pas une race technique → BusinessError.
      const { data, error } = await supabase
        .from('todos')
        .update({ status: values.status })
        .eq('id', values.id)
        .eq('profile_id', values.profileId)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new BusinessError('Cette tâche n’existe plus ou n’a pas pu être modifiée.')
      revalidateTodos()
    },
  })
}

export async function deleteTodo(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: todoDeleteInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      const res = await requireCanWriteTodo(values.profileId)
      if ('error' in res) throw new BusinessError(res.error)
      const supabase = await createClient()
      // Idem : une tâche déjà supprimée (par quelqu'un d'autre, ou double-clic) n'est pas une
      // erreur technique → BusinessError, message clair plutôt que « Erreur inattendue ».
      const { data, error } = await supabase
        .from('todos')
        .delete()
        .eq('id', values.id)
        .eq('profile_id', values.profileId)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new BusinessError('Cette tâche n’existe plus — elle a peut-être déjà été supprimée.')
      revalidateTodos()
    },
  })
}
