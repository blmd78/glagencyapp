import { z } from 'zod'

/** Entrées des deux actions de l'Overview : marquer un signalement résolu, re-noter une session. */
export const resolveInput = z.object({ reportId: z.uuid() })
export type ResolveInput = z.infer<typeof resolveInput>

export const rescoreInput = z.object({ sessionId: z.uuid() })
export type RescoreInput = z.infer<typeof rescoreInput>
