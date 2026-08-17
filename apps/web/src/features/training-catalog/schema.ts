import { z } from 'zod'
import { CASE_KINDS, SPEAKERS } from '@/lib/types/training'

// Schémas PARTAGÉS dialogs (RHF + zodResolver) / Server Actions (runAction). Longueurs alignées
// sur les `check` SQL de 0113. Zod v4. Les `code` (slugs) ne sont JAMAIS saisis : générés côté
// action à la création (slugify), immuables ensuite. `id: null` = création (patron scripts).

const text = (max: number) => z.string().trim().max(max, `${max} caractères max`)
const required = (max: number, msg: string) => text(max).min(1, msg)
/** Champ texte facultatif : '' → null (colonne nullable). */
const optionalText = (max: number) => text(max).transform((v) => (v === '' ? null : v)).nullable()
/** Entier saisi dans un <input type="number"> : '' / NaN / null → null quand facultatif. */
const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? null : v),
    z.coerce.number({ error: 'Nombre invalide' }).int('Nombre entier').min(min, `Minimum ${min}`).max(max, `Maximum ${max}`).nullable(),
  )
const requiredInt = (min: number, max: number) =>
  z.coerce.number({ error: 'Nombre requis' }).int('Nombre entier').min(min, `Minimum ${min}`).max(max, `Maximum ${max}`)

// ---------- Module ----------
export const axisInput = z.object({
  existingId: z.uuid().nullable(), // null = nouvel axe (diff par id côté action). Pas `id` : useFieldArray réserve cette clé
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,30}$/, 'Clé : 2 à 30 caractères, minuscules / chiffres / _'),
  name: required(60, 'Nom requis'),
  description: required(2000, 'Description requise'),
})
export const sectionInput = z.object({
  existingId: z.uuid().nullable(), // null = nouvelle section (code généré du titre)
  title: required(80, 'Titre requis'),
  emoji: optionalText(8),
  description: optionalText(500),
})
export const moduleForm = z.object({
  id: z.uuid().nullable(), // null = création
  title: required(80, 'Titre requis'),
  emoji: optionalText(8),
  description: optionalText(500),
  objectiveLabel: required(40, 'Libellé requis'),
  courseMd: optionalText(50_000),
  scoringNotes: optionalText(5_000),
  // Pas de minimum : le module Boss final (GLA) n'a AUCUN axe — il est noté par étape.
  axes: z
    .array(axisInput)
    .max(20, '20 axes max')
    .refine((a) => new Set(a.map((x) => x.key)).size === a.length, 'Deux axes ont la même clé'),
  sections: z.array(sectionInput).max(20, '20 sections max'),
})
export type ModuleFormValues = z.input<typeof moduleForm>
export type ModuleInput = z.infer<typeof moduleForm>

// ---------- Cas ----------
export const messageInput = z.object({
  speaker: z.enum(SPEAKERS),
  body: required(1000, 'Message vide'),
})
export const arenaSlotInput = z.object({
  refCaseId: z.uuid('Choisis un cas'),
  displayName: required(30, 'Prénom requis'),
})
export const bossFanInput = z.object({
  name: required(30, 'Prénom requis'),
  age: optionalInt(18, 99),
  job: optionalText(60),
  city: optionalText(60),
  color: z
    .string()
    .trim()
    .regex(/^(#[0-9a-fA-F]{6})?$/, 'Couleur au format #rrggbb')
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  persona: required(500, 'Caractère requis'),
  openingMessage: required(1000, 'Message d’ouverture requis'),
  budgetCap: optionalInt(0, 100_000),
  negoThreshold: optionalInt(0, 100_000),
  negoWhere: optionalText(500),
  meetWhen: optionalText(500),
  meetWhere: optionalText(500),
  derails: optionalText(1000),
})

/**
 * UN objet PLAT pour les trois sortes (une union discriminée est pénible à typer avec RHF) ; les
 * règles propres à chaque sorte vivent dans le superRefine ci-dessous, avec un `path` par champ.
 * Les champs des autres sortes voyagent vides et sont IGNORÉS côté action (colonnes à null).
 */
const caseFields = z.object({
  id: z.uuid().nullable(), // null = création
  moduleId: z.uuid(),
  kind: z.enum(CASE_KINDS), // choisie à la création, immuable ensuite (vérifié côté action)
  sectionId: z.uuid().nullable(),
  title: required(80, 'Titre requis'),
  phase: text(60),
  difficulty: requiredInt(1, 10),
  maxTurns: requiredInt(1, 50),
  isSale: z.boolean(),
  context: required(4000, 'Contexte requis'),
  objective: required(2000, 'Objectif requis'),
  targetLine: optionalText(1000),
  // solo
  fanName: text(30),
  fanBrief: text(4000),
  expected: text(4000),
  messages: z.array(messageInput).max(30, '30 messages max'),
  // défi / boss
  reactionMaxS: optionalInt(10, 600),
  slots: z.array(arenaSlotInput).max(5, '5 conversations max'),
  fans: z.array(bossFanInput).max(5, '5 fans max'),
})
export const caseForm = caseFields.superRefine((v, ctx) => {
  const need = (path: string, ok: boolean, message: string) => {
    if (!ok) ctx.addIssue({ code: 'custom', path: [path], message })
  }
  if (v.kind === 'solo') {
    need('fanName', v.fanName.length > 0, 'Prénom du fan requis')
    need('fanBrief', v.fanBrief.length > 0, 'Consigne du fan requise')
    need('expected', v.expected.length > 0, '« Attendu » requis')
  } else {
    need('reactionMaxS', v.reactionMaxS !== null, 'Délai de réponse requis')
  }
  if (v.kind === 'arena') need('slots', v.slots.length === 5, 'Exactement 5 conversations')
  if (v.kind === 'boss') need('fans', v.fans.length >= 1, 'Au moins un fan')
})
export type CaseFormValues = z.input<typeof caseForm>
export type CaseInput = z.infer<typeof caseForm>

// ---------- Commandes simples (appelées hors form RHF — schémas partagés quand même : idInput
// sert au dialog de duplication, toggle/move aux boutons de la table) ----------
export const idInput = z.object({ id: z.uuid() })
export const toggleInput = z.object({ id: z.uuid(), active: z.boolean() })
export const moveInput = z.object({ id: z.uuid(), direction: z.enum(['up', 'down']) })
