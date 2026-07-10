import { z } from 'zod'
import { MKT_PAGE_CHOICES, PAGE_CHOICES } from '@/config/workspaces'

// Schéma Zod PARTAGÉ client (form RHF) ↔ serveur (actions safeParse) — source unique.
// `scope` : quelle face gère les droits — chaque page Membres ne touche QUE ses slugs,
// ceux de l'autre face sont préservés côté serveur.
const CHATTER_SLUGS = PAGE_CHOICES.map((p) => p.slug as string)
const MKT_SLUGS = MKT_PAGE_CHOICES.map((p) => p.slug as string)

// Lien « outil de travail » (optionnel) : vide ou une URL http(s) — le membre le
// retrouve dans son menu utilisateur en bas de sidebar.
const workLink = z
  .string()
  .trim()
  .max(300, 'Lien trop long')
  .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Lien invalide (http/https)')

export const memberInput = z
  .object({
    scope: z.enum(['chatter', 'marketing']),
    email: z.string().email('Email invalide'),
    displayName: z.string().trim().min(1, 'Nom requis').max(60),
    // `admin` reste piloté par l'allowlist (trigger handle_new_user), jamais posé ici.
    role: z.enum(['user', 'manager']),
    // min(1) : un compte sans aucune page serait inutilisable (atterrit sur /no-access).
    pages: z.array(z.string()).min(1, 'Coche au moins une page'),
    creatorIds: z.array(z.string().uuid()).max(50),
    workLink,
  })
  .refine(
    (d) => d.pages.every((x) => (d.scope === 'marketing' ? MKT_SLUGS : CHATTER_SLUGS).includes(x)),
    { message: 'Page inconnue', path: ['pages'] },
  )
export type MemberForm = z.infer<typeof memberInput>

/** Édition : mêmes règles sans l'email (verrouillé), + l'id. */
export const memberUpdateInput = z
  .object({
    scope: z.enum(['chatter', 'marketing']),
    id: z.string().uuid(),
    displayName: z.string().trim().min(1, 'Nom requis').max(60),
    role: z.enum(['user', 'manager']),
    pages: z.array(z.string()).min(1, 'Coche au moins une page'),
    creatorIds: z.array(z.string().uuid()).max(50),
    workLink,
  })
  .refine(
    (d) => d.pages.every((x) => (d.scope === 'marketing' ? MKT_SLUGS : CHATTER_SLUGS).includes(x)),
    { message: 'Page inconnue', path: ['pages'] },
  )
