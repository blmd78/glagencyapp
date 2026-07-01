import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ModelsData } from '../types'

/**
 * Source de l'onglet Modèles.
 * ⚠️ Temporaire : fixture juin (data.json.teams réorganisé, gitignorée).
 * TODO : RPC Supabase (agrégation creator_daily + chatter_creator_daily). Signature stable.
 */
export async function getModels(): Promise<ModelsData> {
  try {
    const path = join(process.cwd(), 'src/features/models/_data/june-models.json')
    return JSON.parse(readFileSync(path, 'utf-8')) as ModelsData
  } catch {
    return { period: '', models: [] }
  }
}
