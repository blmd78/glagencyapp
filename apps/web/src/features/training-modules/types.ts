// La projection publique du catalogue vit dans `lib/` (partagée avec `training-me` — une
// feature n'importe jamais une autre feature). Ré-export ici pour ne pas casser les appels
// de la feature.
export type { ModuleDetail, ModuleSummary, PublicBossFan, PublicCase } from '@/lib/types/training-public'
