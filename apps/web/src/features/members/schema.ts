import { z } from 'zod'
import { PAGE_CHOICES } from '@/config/workspaces'

// Schéma Zod PARTAGÉ client (form RHF) ↔ serveur (actions safeParse) — source unique.
const SLUGS = PAGE_CHOICES.map((p) => p.slug as string)

export const memberInput = z.object({
  email: z.string().email('Email invalide'),
  displayName: z.string().trim().min(1, 'Nom requis').max(60),
  // min(1) : un compte sans aucune page serait inutilisable (atterrit sur /no-access).
  pages: z
    .array(z.string())
    .min(1, 'Coche au moins une page')
    .max(SLUGS.length)
    .refine((xs) => xs.every((x) => SLUGS.includes(x)), { message: 'Page inconnue' }),
  creatorIds: z.array(z.string().uuid()).max(50),
})
export type MemberForm = z.infer<typeof memberInput>

/** Édition : mêmes règles sans l'email (verrouillé), + l'id. */
export const memberUpdateInput = memberInput.omit({ email: true }).extend({ id: z.string().uuid() })
