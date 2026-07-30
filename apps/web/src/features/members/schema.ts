import { z } from 'zod'
import { MKT_PAGE_CHOICES, PAGE_CHOICES } from '@/config/workspaces'
import { CRM_ROLES, CRM_SHIFTS, CRM_TEAMS } from '@/lib/types/chatters'

// Désignation « closing » portée par le membre (setter/closer + équipe rouge/bleue) — n'a de sens
// que pour un chatteur ; le serveur la force à null pour les autres rôles. null = aucune.
const closingRole = z.enum(CRM_ROLES).nullable()
const closingTeam = z.enum(CRM_TEAMS).nullable()

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

// Champs COMMUNS création/édition — UNE seule définition (la shape était dupliquée champ à
// champ entre les deux schémas). La création ajoute `email` ; l'édition ajoute `id` (email
// verrouillé). Mêmes règles, mêmes messages. `scope` est déclaré à part : il se place AVANT
// email/id dans chaque schéma (ordre des clés = ordre de validation Zod, inchangé).
const scope = z.enum(['chatter', 'marketing'])
const memberFields = {
  displayName: z.string().trim().min(1, 'Nom requis').max(60),
  // `admin` n'est posable que par un SUPERADMIN (vérif serveur) ; `superadmin` reste
  // piloté par l'allowlist (trigger handle_new_user), jamais posé ici. `police` = rôle
  // fonctionnel non hiérarchique (tracker « Police »), pas d'encadrement.
  role: z.enum(['chatteur', 'police', 'sous-manager', 'manager', 'admin']),
  pages: z.array(z.string()),
  creatorIds: z.array(z.uuid()).max(50),
  // Rattachements managers (vide = aucun, MULTIPLE depuis 0092) — forcé au créateur si
  // l'appelant est manager.
  managerIds: z.array(z.uuid()).max(10),
  workLink,
  closingRole,
  closingTeam,
  // Shift (matin/aprem/soir) — écrit sur la FICHE CHATTEUR liée (chatters.shift) au save.
  shift: z.enum(CRM_SHIFTS).nullable(),
  // Lien vers le chatteur MyPuls (''=aucun) — posé uniquement par un admin/superadmin (garde action).
  chatterId: z.uuid().or(z.literal('')),
}

// Refines partagés (mêmes prédicats, mêmes messages, même path pour les deux schémas).
const pagesOfScope = (d: { scope: 'chatter' | 'marketing'; pages: string[] }) =>
  d.pages.every((x) => (d.scope === 'marketing' ? MKT_SLUGS : CHATTER_SLUGS).includes(x))
// min 1 page SAUF pour un admin (accès à tout) : un compte chatteur/manager sans page
// serait inutilisable (atterrit sur /no-access).
const atLeastOnePage = (d: { role: string; pages: string[] }) =>
  d.role === 'admin' || d.pages.length > 0

export const memberInput = z
  .object({
    scope,
    email: z.email('Email invalide'),
    ...memberFields,
  })
  .refine(pagesOfScope, { message: 'Page inconnue', path: ['pages'] })
  .refine(atLeastOnePage, { message: 'Coche au moins une page', path: ['pages'] })
export type MemberForm = z.infer<typeof memberInput>

/** Édition : mêmes règles sans l'email (verrouillé), + l'id. */
export const memberUpdateInput = z
  .object({
    scope,
    id: z.uuid(),
    ...memberFields,
  })
  .refine(pagesOfScope, { message: 'Page inconnue', path: ['pages'] })
  .refine(atLeastOnePage, { message: 'Coche au moins une page', path: ['pages'] })
