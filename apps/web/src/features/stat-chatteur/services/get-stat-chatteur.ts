import { getChatters } from '@/lib/services/get-chatters'
import type { Period } from '@/lib/period'
import type { StatChatteurData } from '../types'

/**
 * Classement des chatteurs par CA sur la période du datepicker — tous les chatteurs qui ont
 * rapporté quelque chose, sans filtre setter/closer ni d'équipe (refonte du 2026-09-30 : l'ancienne
 * version ne classait que les setters/closers, par nombre de ventes).
 *
 * « Chatteur » = fiche MyPuls liée à un membre au rôle `chatteur` (`isChatter`). Les fiches sans
 * membre lié sortent du classement : c'est là que vivent les comptes managers (« Remi manager
 * chat »), les e-mails et les accès révoqués — aucun manager n'est lié à une fiche. Une vraie
 * chatteuse absente du podium se rattache dans Membres. Le lien est lu AUJOURD'HUI : un membre
 * promu (manager, police…) perd son `chatter_id` et sort aussi des classements passés ; un départ
 * (`left_at`) garde le lien et reste classé.
 *
 * Réutilise `getChatters()` (RPC `chatters_report`, agrégé en base) : en mode restreint, le CA
 * d'un chatteur se limite aux modèles visibles par la RLS — même périmètre que la page Chatters.
 */
export async function getStatChatteur(
  period: Period,
  opts: { restricted?: boolean } = {},
): Promise<StatChatteurData> {
  const { chatters } = await getChatters(period, opts)

  const rows = chatters
    .filter((c) => c.isChatter && c.ca > 0)
    .sort((a, b) => b.ca - a.ca || a.name.localeCompare(b.name, 'fr'))
    .map((c, i) => ({ id: c.id, name: c.name, ca: c.ca, rank: i + 1 }))

  return { period, rows }
}
