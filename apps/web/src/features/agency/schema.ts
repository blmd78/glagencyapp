import { z } from 'zod'
import { GROUP_PALETTE } from '@/lib/mkt-groups'

/** Les rôles qu'un événement peut viser. Les admins voient toujours tout (RLS `agency_events_read`). */
export const AGENCY_ROLES = ['chatteur', 'sous-manager', 'manager', 'police'] as const
export type AgencyRole = (typeof AGENCY_ROLES)[number]

export const AGENCY_ROLE_LABELS: Record<AgencyRole, string> = {
  chatteur: 'Chatteurs',
  'sous-manager': 'Sous-managers',
  manager: 'Managers',
  police: 'Police',
}

/**
 * Les couleurs d'un événement : la palette validée daltonisme des groupes de liens, recopiée dans
 * le `check` de 0176. `null` = le gris neutre.
 */
export const EVENT_COLORS = GROUP_PALETTE
export type EventColor = (typeof EVENT_COLORS)[number]
/** Le nom de chaque couleur (`agency_legend`) ; une couleur absente n'a pas de nom. */
export type Legend = Partial<Record<EventColor, string>>

/**
 * Photo : 5 Mo maximum, JPEG / PNG / WebP (décision Benoit 2026-09-28) — mêmes limites que le
 * bucket `agency-events` (0176), revérifiées ici avant de délivrer l'URL d'envoi. Pas de SVG : il
 * peut embarquer du script.
 */
export const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024
/** Clé d'objet dans le bucket : `<uuid>.<ext>`, rien d'autre (pas de chemin forgé). */
const imagePath = z.string().regex(/^[0-9a-f-]{36}\.(jpg|png|webp)$/, 'Photo invalide')

export const imageUploadInput = z.object({
  contentType: z.enum(Object.keys(IMAGE_TYPES) as [keyof typeof IMAGE_TYPES], 'Format accepté : JPEG, PNG ou WebP'),
  size: z.number().int().positive().max(IMAGE_MAX_BYTES, 'La photo dépasse 5 Mo'),
})

export const legendInput = z.object({
  items: z
    .array(z.object({ color: z.enum(EVENT_COLORS), label: z.string().trim().max(40, '40 caractères maximum') }))
    .max(EVENT_COLORS.length)
    .refine((items) => new Set(items.map((i) => i.color)).size === items.length, 'Une couleur en double'),
})
export type LegendInput = z.infer<typeof legendInput>

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide')

/** Saisie d'un événement — le MÊME objet pour le formulaire (resolver) et pour `runAction`. */
export const eventInput = z
  .object({
    id: z.uuid().optional(),
    title: z.string().trim().min(1, 'Donne un nom à l\'événement').max(120, '120 caractères maximum'),
    mode: z.enum(['jour', 'periode']),
    startDate: day,
    endDate: day,
    remindOnDay: z.boolean(),
    audience: z.array(z.enum(AGENCY_ROLES)).min(1, 'Choisis au moins un rôle'),
    color: z.enum(EVENT_COLORS).nullable(),
    // `undefined` = la fenêtre n'a PAS touché à la photo : le serveur ne l'écrit pas. Sans ça, une
    // fenêtre ouverte sur une page périmée réécrirait l'ancienne clé — et effacerait la nouvelle.
    imagePath: imagePath.nullable().optional(),
    // Type libre et modèle (2026-10-02) : facultatifs — une réunion n'a ni l'un ni l'autre ; absents,
    // ils s'enregistrent à null (`eventRow`). Le nom reste la vérité affichée ; la fenêtre le compose.
    kind: z.string().trim().max(40, '40 caractères maximum').nullable().optional(),
    creatorId: z.uuid('Modèle invalide').nullable().optional(),
  })
  .refine((v) => v.mode === 'jour' || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'La fin doit suivre le début',
  })
export type EventInput = z.infer<typeof eventInput>

export const eventIdInput = z.object({ id: z.uuid() })

/**
 * La ligne `agency_events` d'une saisie. En mode Jour, la fin EST le début : un admin qui choisit
 * une période puis repasse sur « Jour » ne doit pas enregistrer l'ancienne fin.
 */
export function eventRow(v: EventInput) {
  return {
    title: v.title,
    start_date: v.startDate,
    end_date: v.mode === 'jour' ? v.startDate : v.endDate,
    remind_on_day: v.remindOnDay,
    audience: [...v.audience],
    color: v.color,
    kind: v.kind?.trim() || null,
    creator_id: v.creatorId ?? null,
    ...(v.imagePath !== undefined && { image_path: v.imagePath }),
  }
}

/**
 * Le nom d'un événement composé de son type et de sa modèle : « CAROUSEL ALICE », en majuscules
 * comme l'équipe les écrivait. `''` s'il manque l'un des deux — rien à proposer.
 */
export function composeEventTitle(kind: string | null | undefined, modelName: string | null | undefined): string {
  const k = (kind ?? '').trim().replace(/\s+/g, ' ')
  const m = (modelName ?? '').trim()
  return k && m ? `${k} ${m}`.toUpperCase() : ''
}

/**
 * Le nom après un changement de type ou de modèle. Il suit la composition TANT QU'il n'a pas été
 * retouché (vide, ou encore égal à la dernière composition) — et se vide avec elle, plutôt que de
 * garder « C ALICE » quand on efface le type. Retouché à la main : jamais touché (`title: null`).
 */
export function nextAutoTitle({ title, lastAuto, auto }: { title: string; lastAuto: string; auto: string }): {
  title: string | null
  lastAuto: string
} {
  const managed = title.trim() === '' || title === lastAuto
  if (!managed) return { title: null, lastAuto }
  return { title: auto, lastAuto: auto }
}
