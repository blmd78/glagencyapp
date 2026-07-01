import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChattersData } from '../types'

/**
 * Source de données de l'onglet Chatteurs.
 *
 * ⚠️ Temporaire : lit la fixture juin (vraie donnée MyPuls réorganisée, gitignorée).
 * TODO : remplacer par le RPC Supabase (agrégation période sur `chatter_daily` +
 * `chatter_creator_daily`) une fois la base alimentée. La signature ne change pas.
 */
export async function getChatters(): Promise<ChattersData> {
  try {
    const path = join(
      process.cwd(),
      'src/features/chatters/_data/june-chatters.json',
    )
    return JSON.parse(readFileSync(path, 'utf-8')) as ChattersData
  } catch {
    return { period: '', chatters: [] }
  }
}
