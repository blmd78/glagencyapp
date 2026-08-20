'use server'

// Server Action de la CONFIG du test (`/formation/recrutement/config`, admin) — séparée des
// actions de dossiers pour garder les deux fichiers courts. Même modèle d'écriture : garde
// explicite (`requireRecruitAdmin`) puis service-role, cf. l'en-tête d'`actions.ts`.

import { createAdminClient } from '@glagency/db'
import { noGuard, runAction, type ActionResult } from '@/lib/actions'
import { requireRecruitAdmin, revalidateRecruit } from './actions-shared'
import { configForm } from './schema'

/**
 * Enregistre la ligne unique `recruit_config` (id = 1). Tout est validé/normalisé par `configForm`
 * (le MÊME schéma que le resolver du formulaire) : 5 emplacements de QI, 4 options par variante,
 * bonne réponse dans [0,3], seuils bornés, texte de frappe minusculé et espaces compactés.
 *
 * `upsert` plutôt qu'`update` : la ligne est seedée par 0125, mais un `update` sur une base où
 * elle manquerait échouerait en silence (0 ligne touchée, aucune erreur).
 *
 * Aucune tentative en cours n'est protégée du changement : `readConfig` est relue à CHAQUE action
 * du test (spec §2), donc fermer le test ou baisser `bot_messages` prend effet immédiatement,
 * y compris au milieu d'un parcours. C'est voulu — c'est le bouton d'arrêt d'urgence du coût IA.
 */
export async function saveRecruitConfig(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: configForm,
    input: raw,
    guard: noGuard,
    handler: async (c) => {
      const profile = await requireRecruitAdmin()
      const admin = createAdminClient()
      const { error } = await admin.from('recruit_config').upsert({
        id: 1,
        open: c.open,
        bot_messages: c.botMessages,
        qi_timer: c.qiTimer,
        frappe_min: c.frappeMin,
        connexion_min: c.connexionMin,
        qi_min: c.qiMin,
        global_threshold: c.globalThreshold,
        discord_link: c.discordLink,
        typing_text: c.typingText,
        // Frontière TS → jsonb : la colonne est typée `Json`, la banque est déjà validée par
        // `configForm` (forme exacte attendue par le tirage public `toQiBank`).
        qi_bank: c.qiBank,
        updated_at: new Date().toISOString(),
        updated_by: profile.id,
      })
      if (error) throw new Error(error.message)
      revalidateRecruit()
    },
  })
}
