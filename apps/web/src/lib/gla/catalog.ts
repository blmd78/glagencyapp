import { createAdminClient, fetchAll } from '@glagency/db'
import type { LegacyAxis, LegacyCaseRow, LegacyCatalog } from './types'

/**
 * Le catalogue d'AUJOURD'HUI, lu chez nous, passé au transformateur (qui reste pur, zéro I/O).
 *
 * Trois lectures, trois rôles : les cas (par `code` — la seule clé commune avec GLA), les axes de
 * chaque module (la LISTE BLANCHE du parseur de notes), et les fans du boss (le nom GLA → notre id).
 *
 * PAS de filtre `active = true`, et c'est délibéré : un cas désactivé depuis a quand même été joué
 * sur GLA, et son historique doit être repris. Le filtre ferait disparaître des sessions en
 * silence — elles seraient comptées « écartées » puis feraient échouer le contrôle de comptage.
 *
 * SERVICE-ROLE : l'import écrit déjà en service-role, et le chemin admin (D7) tourne au nom d'un
 * admin qui n'a pas forcément le droit Entraînement. Aucune donnée secrète n'est lue ici — ni
 * `fan_brief`, ni `expected`, ni `scoring_notes` : rien de ce qui sort d'ici ne descend au client,
 * seul `buildCaseSnapshot` en fait un `case_snapshot` (projection publique).
 */
export async function readLegacyCatalog(
  admin: ReturnType<typeof createAdminClient> = createAdminClient(),
): Promise<LegacyCatalog> {
  const [cases, axes, fans] = await Promise.all([
    // Un seul littéral (pas de concaténation `+`) : supabase-js type l'embed depuis le littéral exact.
    fetchAll((f, t) =>
      admin
        .from('training_cases')
        .select(
          'id, module_id, code, kind, title, phase, difficulty, context, objective, max_turns, reaction_max_s, is_sale, fan_name, training_modules(code, title, objective_label)',
        )
        .order('id')
        .range(f, t),
    ),
    fetchAll((f, t) =>
      admin.from('training_module_axes').select('module_id, key, name, position').order('id').range(f, t),
    ),
    fetchAll((f, t) => admin.from('training_case_boss_fans').select('id, name').order('id').range(f, t)),
  ])
  if (cases.error) throw new Error(cases.error.message)
  if (axes.error) throw new Error(axes.error.message)
  if (fans.error) throw new Error(fans.error.message)

  const casesByCode = new Map<string, LegacyCaseRow>()
  for (const c of cases.data) {
    casesByCode.set(c.code, {
      id: c.id,
      module_id: c.module_id,
      // La colonne est un `text` + `check` côté SQL : le type généré est `string`.
      kind: c.kind as LegacyCaseRow['kind'],
      fan_name: c.fan_name,
      code: c.code,
      title: c.title,
      phase: c.phase,
      difficulty: c.difficulty,
      context: c.context,
      objective: c.objective,
      max_turns: c.max_turns,
      reaction_max_s: c.reaction_max_s,
      is_sale: c.is_sale,
      training_modules: c.training_modules,
    })
  }

  // Indexé par MODULE et non par clé d'axe : `progression` et `personnalisation` existent dans
  // deux modules chacun — une jointure sur la seule clé rattacherait la note au mauvais module.
  const axesByModule = new Map<string, LegacyAxis[]>()
  for (const a of [...axes.data].sort((x, y) => x.position - y.position)) {
    const list = axesByModule.get(a.module_id)
    if (list) list.push({ key: a.key, name: a.name })
    else axesByModule.set(a.module_id, [{ key: a.key, name: a.name }])
  }

  // GLA écrit le PRÉNOM du fan (Kevin, Thomas, Julien, Marc, Alex) ; nous stockons un id. Première
  // occurrence gagnante : les prénoms sont uniques sur le seul cas boss du catalogue.
  const bossFanIds = new Map<string, string>()
  for (const f of fans.data) if (!bossFanIds.has(f.name)) bossFanIds.set(f.name, f.id)

  return { casesByCode, axesByModule, bossFanIds }
}
