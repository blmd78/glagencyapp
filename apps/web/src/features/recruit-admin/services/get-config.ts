import { z } from 'zod'
import type { QiSlot } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import type { RecruitConfigData } from '../types'

/** Emplacement vide prêt à remplir (l'éditeur en exige 5, chacun avec au moins une variante). */
const emptyVariant = () => ({ q: '', opts: ['', '', '', ''], a: 0 })

/**
 * Lecture TOLÉRANTE de `recruit_config.qi_bank` — et c'est délibérément l'inverse du parseur de la
 * feature publique (`recruit-test/shared.ts`, strict, qui THROW sur une banque cassée pour ne
 * jamais servir un QI incohérent à un candidat). Ici, une banque cassée (édition SQL à la main,
 * import raté) doit rester ÉDITABLE : un parseur strict rendrait la page de config inouvrable,
 * donc irréparable depuis l'app. On ramène ce qu'on peut à la forme attendue (5 emplacements,
 * 4 options par variante) et l'admin corrige à l'écran ; c'est `configForm` qui refusera
 * l'enregistrement tant que ce n'est pas propre.
 *
 * (Frontière : `recruit-admin` n'importe RIEN de `recruit-test` — cross-feature interdit par
 * ESLint, et de toute façon les deux parseurs n'ont pas le même contrat.)
 */
const looseBank = z.array(
  z.object({
    slot: z.unknown(),
    variants: z.array(z.object({ q: z.unknown(), opts: z.unknown(), a: z.unknown() })).optional(),
  }),
)

const str = (v: unknown) => (typeof v === 'string' ? v : '')

function toEditableBank(json: unknown): QiSlot[] {
  const parsed = looseBank.safeParse(json)
  const slots = parsed.success ? parsed.data : []
  return Array.from({ length: 5 }, (_, i) => {
    const slot = slots[i]
    const variants = (slot?.variants ?? []).map((v) => {
      const opts = Array.isArray(v.opts) ? v.opts.map(str) : []
      const a = typeof v.a === 'number' && Number.isInteger(v.a) ? Math.min(Math.max(v.a, 0), 3) : 0
      return { q: str(v.q), opts: Array.from({ length: 4 }, (_, k) => opts[k] ?? ''), a }
    })
    return { slot: str(slot?.slot), variants: variants.length > 0 ? variants : [emptyVariant()] }
  })
}

/**
 * Config du test pour l'éditeur admin (ligne unique, `id = 1`). Client SESSION : la RLS
 * `recruit_config_read` est `is_admin()`.
 */
export async function getRecruitConfig(): Promise<RecruitConfigData> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recruit_config')
    .select('open, bot_messages, qi_timer, frappe_min, connexion_min, qi_min, global_threshold, discord_link, typing_text, qi_bank, updated_at')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Configuration du test de recrutement introuvable (ligne 1)')

  return {
    open: data.open,
    botMessages: data.bot_messages,
    qiTimer: data.qi_timer,
    frappeMin: data.frappe_min,
    connexionMin: data.connexion_min,
    qiMin: data.qi_min,
    globalThreshold: data.global_threshold,
    discordLink: data.discord_link,
    typingText: data.typing_text,
    qiBank: toEditableBank(data.qi_bank),
    updatedAt: data.updated_at,
  }
}
