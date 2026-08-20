'use server'

import { z } from 'zod'
import { createAdminClient } from '@glagency/db'
import { noGuard, requireAdminProfile, runAction, type ActionResult } from '@/lib/actions'
import { findRecruitByEmail } from './recruit-link'
import type { RecruitCheck } from './types'

/**
 * LECTURE seule, appelée au blur du champ e-mail du dialog « Nouveau membre » : cet e-mail
 * a-t-il déjà un dossier au test de recrutement ? Sert l'encart informatif ; le RATTACHEMENT,
 * lui, est fait côté serveur par `createMember` (cf. `recruit-link.ts`) — l'encart ne le
 * déclenche pas et son échec n'empêche rien.
 *
 * ADMIN UNIQUEMENT (patron §4 : garde en tête de handler avec `noGuard`), alors que le dialog
 * lui-même est ouvert aux managers : cette action lit `recruit_candidates` en service-role, dont
 * la RLS ne s'ouvre qu'à `is_admin()`. Le gate applicatif reproduit donc exactement la RLS qu'on
 * contourne. Côté client, l'appel n'est même pas émis hors admin.
 */
export async function checkRecruitByEmail(raw: unknown): Promise<ActionResult<RecruitCheck | null>> {
  return runAction({
    schema: z.object({ email: z.email() }),
    input: raw,
    guard: noGuard,
    handler: async ({ email }) => {
      await requireAdminProfile()
      return findRecruitByEmail(createAdminClient(), email)
    },
  })
}
