import { createClient } from '@/lib/supabase/server'
import { toPrizes, toSectors } from '../mappers'
import type { WheelData } from '../types'

/**
 * Page Roue : la configuration de la roue, rien d'autre.
 *
 * Ni ticket ni éligibilité depuis la règle du 2026-08-24 (le tour est lancé par un encadrant), ni
 * « Mes gains » depuis que la page est réservée à l'encadrement : les tirages se lisent dans
 * l'historique, qui les montre tous. Lecture sous RLS — la config est ouverte à toute la face.
 */
export async function getWheel(): Promise<WheelData> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('training_wheel_config').select('title, sectors, prizes').eq('id', 1).single()
  if (error) throw new Error(error.message)
  return { config: { title: data.title, sectors: toSectors(data.sectors), prizes: toPrizes(data.prizes) } }
}
