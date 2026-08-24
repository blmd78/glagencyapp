import { createClient } from '@/lib/supabase/server'
import { toPrizes, toSectors } from '../mappers'
import type { MySpin, WheelData } from '../types'

/**
 * Page Roue : la config, et les gains du visiteur. Deux lectures parallèles sous RLS (client
 * utilisateur) — `training_wheel_spins` est lisible « moi ou encadrant frm-suivi », la config par
 * toute la face Formation.
 *
 * Il n'y a plus ni ticket ni éligibilité à calculer depuis la règle du 2026-08-24 : le tour n'est
 * plus gagné, il est lancé par un encadrant. La liste des chatteurs pour qui lancer est chargée à
 * part (`getSpinnableChatters`), et seulement pour un encadrant.
 */
export async function getWheel(profileId: string): Promise<WheelData> {
  const supabase = await createClient()
  const [cfg, spins] = await Promise.all([
    supabase.from('training_wheel_config').select('title, sectors, prizes').eq('id', 1).single(),
    supabase
      .from('training_wheel_spins')
      .select('id, week, spun_at, sector_label, won, prize_label, amount_eur, paid_at')
      .eq('profile_id', profileId)
      .order('spun_at', { ascending: false })
      .limit(50),
  ])
  // Un `if` par résultat (et pas une boucle) : c'est ce qui NARROW `cfg.data` en non-null pour
  // TypeScript — le type de `.single()` est une union { data, error: null } | { data: null, error }.
  if (cfg.error) throw new Error(cfg.error.message)
  if (spins.error) throw new Error(spins.error.message)

  const mySpins: MySpin[] = (spins.data ?? []).map((s) => ({
    id: s.id,
    week: s.week,
    spunAt: s.spun_at,
    sectorLabel: s.sector_label,
    won: s.won,
    prizeLabel: s.prize_label,
    // `numeric` Postgres : supabase-js peut le rendre en chaîne selon la version → Number().
    amountEur: s.amount_eur == null ? null : Number(s.amount_eur),
    paidAt: s.paid_at,
  }))

  return {
    config: { title: cfg.data.title, sectors: toSectors(cfg.data.sectors), prizes: toPrizes(cfg.data.prizes) },
    mySpins,
  }
}
