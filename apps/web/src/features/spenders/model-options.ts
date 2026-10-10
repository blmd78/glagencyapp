import type { ComboOption } from '@/components/ui/combobox'

/**
 * Options du filtre « modèle » : les modèles connues du serveur (`getSpenderModels`), plus celles des
 * lignes chargées qui n'y seraient pas — rien ne disparaît. Déduire les options des SEULES lignes ne
 * montrait, dans les vues paginées (0104), que les modèles des 100 premiers spenders.
 */
export function mergeModelOptions(
  known: ComboOption[] | undefined,
  rows: ReadonlyArray<{ creatorId: string; model: string }>,
): ComboOption[] {
  const byId = new Map((known ?? []).map((o) => [o.value, o.label]))
  for (const r of rows) if (!byId.has(r.creatorId)) byId.set(r.creatorId, r.model)
  return [...byId.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
}
