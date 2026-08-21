import { z } from 'zod'

// Schémas d'entrée des Server Actions PUBLIQUES du test de recrutement (`/postuler`). Zod v4.
//
// Particularité de cette feature : ces schémas sont la PREMIÈRE ligne de défense, pas un confort
// de formulaire. Le candidat n'a aucune session — `runAction` ne peut donc pas s'appuyer sur une
// garde d'auth, et tout ce qui descend du navigateur est hostile par défaut. Les bornes reprennent
// les `check` SQL de 0125/0126 (longueurs, plages) pour échouer ICI avec un message français
// plutôt qu'en 23514 illisible côté base.

/**
 * Identifiant de navigateur (UUID posé dans le localStorage par `TestFlow`) — sert la blocklist
 * « un seul essai » et rien d'autre. Charset restreint VOLONTAIREMENT : ce device est réinjecté
 * dans des filtres PostgREST côté serveur ; interdire `,` `.` `(` `)` retire toute possibilité
 * d'y glisser un fragment de filtre. Bornes larges (8-64) : on ne veut pas casser le test si le
 * front change de générateur d'identifiant.
 */
const device = z
  .string()
  .trim()
  .min(8, 'Identifiant de navigateur invalide')
  .max(64, 'Identifiant de navigateur invalide')
  .regex(/^[A-Za-z0-9_-]+$/, 'Identifiant de navigateur invalide')

const attemptId = z.uuid('Tentative introuvable')

export const startAttemptInput = z.object({ device })

/**
 * QI : une réponse par emplacement de la banque, `null` = non répondu (le temps est écoulé) et
 * compte faux, comme GLA. Le nombre de questions est LIBRE (1 à 20, réglé par la config) : ce
 * schéma ne borne donc que la plage — l'égalité exacte est vérifiée CÔTÉ SERVEUR contre la clé de
 * correction de LA tentative (`actions.ts`), la seule source de vérité si la banque a changé entre
 * le tirage et l'envoi. Chaque réponse est l'INDEX de l'option choisie (4 options → 0..3).
 */
export const saveQiInput = z.object({
  attemptId,
  answers: z
    .array(z.number().int('Réponse invalide').min(0, 'Réponse invalide').max(3, 'Réponse invalide').nullable())
    .min(1, 'Réponses invalides')
    .max(20, 'Réponses invalides'),
})

/**
 * Frappe : déclaratif client (gate caché, fidèle à GLA — cf. spec §2). `wpm` est un ENTIER car il
 * finit en `smallint` (`recruit_candidates.typing_wpm`) ; `accuracy` reste décimal (il ne vit que
 * dans le jsonb `recruit_attempts.typing`). 250 wpm = plafond mondial largement dépassé : au-delà,
 * c'est une valeur forgée, on refuse.
 */
export const saveTypingInput = z.object({
  attemptId,
  wpm: z.number().int('Vitesse invalide').min(0, 'Vitesse invalide').max(250, 'Vitesse invalide'),
  accuracy: z.number().min(0, 'Précision invalide').max(100, 'Précision invalide'),
  seconds: z.number().int('Durée invalide').min(1, 'Durée invalide').max(3600, 'Durée invalide'),
})

/** Connexion : Mbps mesurés côté client (`speed.cloudflare.com/__down`), `numeric(7,1)` en base. */
export const saveConnectionInput = z.object({
  attemptId,
  mbps: z.number().min(0, 'Débit invalide').max(10000, 'Débit invalide'),
})

/**
 * Bot : soit un message texte, soit un média verrouillé à prix — JAMAIS les deux, jamais aucun
 * (mécanique GLA : le média est un message à part entière, dont le corps est
 * `[MEDIA VERROUILLE - X€]`). Le refine porte le message ; sans `path`, `runAction` le remonte tel
 * quel comme erreur globale.
 */
export const sendToBotInput = z
  .object({
    attemptId,
    body: z.string().trim().min(1, 'Message vide').max(500, '500 caractères max').optional(),
    mediaPrice: z.number().int('Prix invalide').min(1, 'Prix invalide').max(10000, 'Prix invalide').optional(),
  })
  .refine((d) => (d.body != null) !== (d.mediaPrice != null), {
    message: 'Envoie un message OU un média verrouillé.',
  })

export const scoreAttemptInput = z.object({ attemptId })

/**
 * Bornes de l'identité, SANS normalisation : c'est ce que le formulaire (`components/step-identity`)
 * valide côté client via `zodResolver`, et la base commune du schéma d'action ci-dessous. Une seule
 * déclaration pour les deux — un resolver client qui diverge des bornes serveur laisse passer une
 * saisie que l'action refuse ensuite, sans que le candidat sache pourquoi.
 */
/**
 * Shifts proposés au candidat — libellés GLA repris tels quels (stockés en clair dans
 * `recruit_candidates.shifts`, la liste fermée est validée ici, pas en SQL).
 */
export const RECRUIT_SHIFTS = ['Matin (5h–13h)', 'Après-midi (13h–21h)', 'Nuit (21h–5h)'] as const

export const identityForm = z.object({
  firstName: z.string().trim().min(1, 'Prénom requis').max(60, '60 caractères max'),
  lastName: z.string().trim().min(1, 'Nom requis').max(60, '60 caractères max'),
  // `.trim()` AVANT le format : `z.email()` refuse les espaces de bord (ils font partie de la
  // chaîne validée), et un candidat qui colle son adresse en amène presque toujours un.
  email: z.string('Email invalide').trim().pipe(z.email('Email invalide').max(160, '160 caractères max')),
  discord: z.string().trim().max(60, '60 caractères max'),
  // L'âge reste une CHAÎNE ici (RHF ne rend que du texte) — la conversion en nombre vit dans
  // `submitCandidateInput`. Message du minimum = celui de GLA, mot pour mot.
  age: z
    .string()
    .trim()
    .min(1, 'Âge requis')
    .regex(/^\d{1,3}$/, 'Âge invalide')
    .refine((v) => Number(v) >= 18, 'Tu dois être majeur (18 ans ou plus) pour postuler.')
    .refine((v) => Number(v) <= 99, 'Âge invalide'),
  location: z.string().trim().min(2, 'Localisation requise').max(120, '120 caractères max'),
  phone: z
    .string()
    .trim()
    .min(6, 'Numéro requis')
    .max(30, '30 caractères max')
    .regex(/^[+0-9 ().-]+$/, 'Numéro invalide'),
  shifts: z.array(z.enum(RECRUIT_SHIFTS)).min(1, 'Choisis au moins un shift').max(RECRUIT_SHIFTS.length, 'Trop de shifts'),
  source: z.string().trim().min(2, 'Dis-nous comment tu as connu l’agence').max(500, '500 caractères max'),
})

/** Valeurs du formulaire d'identité (RHF) — Discord optionnel arrive en chaîne vide, pas en null. */
export type IdentityFormValues = z.infer<typeof identityForm>

/**
 * Identité — demandée À LA FIN (différence voulue vs GLA, cf. spec §1). E-mail et Discord sont
 * NORMALISÉS ICI (trim + minuscules) : c'est le point de passage unique avant la base, qui refuse
 * désormais toute casse (`check (email = lower(email))`, migration 0126). Discord vide → `null`
 * (le `check` SQL veut 1..60 ou NULL, pas la chaîne vide).
 */
export const submitCandidateInput = identityForm.extend({
  attemptId,
  email: identityForm.shape.email.transform((v) => v.toLowerCase()),
  discord: identityForm.shape.discord.optional().transform((v) => (v ? v.toLowerCase() : null)),
  // La chaîne validée du formulaire devient l'entier de la colonne `age` (check 18..99, 0127).
  age: identityForm.shape.age.transform(Number),
})
