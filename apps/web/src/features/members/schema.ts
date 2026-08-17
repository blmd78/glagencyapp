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
  // Shift PRINCIPAL (matin/aprem/soir) du chatteur — `profiles.shift`. Les PLACEMENTS sur le board
  // (`profile_creators.shifts`, 0110) sont indépendants : changer le principal n'en déplace aucun.
  shift: z.enum(CRM_SHIFTS).nullable(),
  // Nouvel arrivant : drapeau MANUEL + date d'arrivée réelle (0101). La date est EXIGÉE quand le
  // drapeau est posé (refine `arrivalWhenNew` plus bas, miroir du check SQL).
  isNew: z.boolean(),
  arrivedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide')
    .nullable(),
  // Lien vers le chatteur MyPuls (''=aucun) — posé uniquement par un admin/superadmin (garde action).
  chatterId: z.uuid().or(z.literal('')),
  // Exclu de l'AFFICHAGE du board Organisation (0112) : manager transverse qui a tous les modèles
  // pour tout voir sur le CRM (ex. Jam) — sans ça, une ligne par modèle. Affichage pur : le serveur
  // le force à false hors manager/admin, et ni creator-scope ni authz ne le lisent.
  orgExcluded: z.boolean(),
  // Le membre a-t-il des pages sur L'AUTRE face ? Posé par memberDefaults depuis `member.pages`
  // (la colonne complète), JAMAIS écrit en base — `mergePages` relit la vérité en base. Ne sert
  // qu'au refine `atLeastOnePage` : un membre 100 % Marketing édité depuis Chatteurs a un form
  // `pages: []` (filtré au scope) et se faisait refuser « Coche au moins une page » (bug
  // 2026-08-17). Garde UX, pas une autorisation : un client menteur ne fabrique qu'un compte
  // sans page qui atterrit sur /no-access — réparable dans ce même dialog.
  hasOtherFacePages: z.boolean(),
}

// Refines partagés (mêmes prédicats, mêmes messages, même path pour les deux schémas).
const pagesOfScope = (d: { scope: 'chatter' | 'marketing'; pages: string[] }) =>
  d.pages.every((x) => (d.scope === 'marketing' ? MKT_SLUGS : CHATTER_SLUGS).includes(x))
// min 1 page SAUF pour un admin (accès à tout) : un compte chatteur/manager sans page
// serait inutilisable (atterrit sur /no-access). « Une page » = sur N'IMPORTE quelle face :
// le form ne voit que les pages de son scope, `hasOtherFacePages` porte le reste.
const atLeastOnePage = (d: { role: string; pages: string[]; hasOtherFacePages: boolean }) =>
  d.role === 'admin' || d.pages.length > 0 || d.hasOtherFacePages
// Miroir applicatif du check SQL `profiles_is_new_needs_arrived_at` (0101) : un drapeau sans date
// s'afficherait « nouveau depuis on ne sait quand », donc nouveau pour toujours — et le rappel de
// retrait à 30 jours ne pourrait jamais se déclencher.
const arrivalWhenNew = (d: { isNew: boolean; arrivedAt: string | null }) =>
  !d.isNew || d.arrivedAt !== null

export const memberInput = z
  .object({
    scope,
    email: z.email('Email invalide'),
    ...memberFields,
  })
  .refine(pagesOfScope, { message: 'Page inconnue', path: ['pages'] })
  .refine(atLeastOnePage, { message: 'Coche au moins une page', path: ['pages'] })
  .refine(arrivalWhenNew, { message: 'Renseigne la date d’arrivée', path: ['arrivedAt'] })
export type MemberForm = z.infer<typeof memberInput>

/**
 * Départ d'un membre (0101). Le motif est REQUIS — c'est lui qui rend le turnover interprétable
 * (subi ou choisi), et le check SQL `profiles_left_needs_reason` en est le miroir en base.
 *
 * `leftBy` n'est PAS dans ce schéma : l'acteur est posé côté serveur (`caller.id`), jamais envoyé
 * par le client — même règle que `created_by` (0098).
 */
export const departureInput = z.object({
  id: z.uuid(),
  leftAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
  leftReason: z.enum(['vire', 'demission', 'fin_essai', 'abandon', 'autre'], {
    message: 'Choisis un motif',
  }),
  leftNote: z.string().trim().max(500, 'Commentaire trop long'),
})
export type DepartureForm = z.infer<typeof departureInput>

/** Édition : mêmes règles sans l'email (verrouillé), + l'id. */
export const memberUpdateInput = z
  .object({
    scope,
    id: z.uuid(),
    ...memberFields,
  })
  .refine(pagesOfScope, { message: 'Page inconnue', path: ['pages'] })
  .refine(atLeastOnePage, { message: 'Coche au moins une page', path: ['pages'] })
  .refine(arrivalWhenNew, { message: 'Renseigne la date d’arrivée', path: ['arrivedAt'] })
