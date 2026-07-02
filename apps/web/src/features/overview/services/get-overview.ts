import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { OverviewData } from '../types'

/**
 * Source de l'Overview.
 * ⚠️ Temporaire : fixture juin (agrégats réels, gitignorée).
 * TODO : agrégat Supabase sur creator_daily / chatter_daily (+ moteur d'insights de
 * @glagency/core) pour la période choisie. Signature stable → l'UI ne change pas.
 */
export async function getOverview(): Promise<OverviewData> {
  try {
    const path = join(process.cwd(), 'src/features/overview/_data/june-overview.json')
    return JSON.parse(readFileSync(path, 'utf-8')) as OverviewData
  } catch {
    return { periodLabel: '', kpis: [], caByModel: [], subsByModel: [], insights: [] }
  }
}
