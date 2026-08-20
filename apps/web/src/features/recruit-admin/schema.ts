import { z } from 'zod'

// Schémas des Server Actions ADMIN du recrutement. Zod v4.
//
// Deux familles :
// - commandes de dossier (valider/refuser/bloquer/débloquer/supprimer) : un `id`, pas de form ;
// - `configForm` : PARTAGÉ par le formulaire (RHF + zodResolver) et `saveRecruitConfig`
//   (`runAction`). Les bornes reprennent les `check` SQL de 0125 en les RESSERRANT là où une
//   valeur techniquement acceptable serait absurde à l'usage (ex. `qi_timer` autorise 300 s en
//   base, on s'arrête à 120 : une question de QI qui laisse 5 minutes ne mesure plus rien).

/**
 * Entier saisi dans un `<input type="number">` (ou porté par un radio) — donc une CHAÎNE côté
 * formulaire. Le `min(1)` sur la chaîne AVANT la coercition n'est pas une précaution de style :
 * `z.coerce.number()` parse `''` en `0`, si bien qu'un champ vidé s'enregistrait en 0 sans la
 * moindre erreur. Sur `qiMin` et `globalThreshold` (dont le minimum légitime EST 0), un admin qui
 * vidait « Score global minimum » désactivait silencieusement tout refus au global. Vide = refus.
 */
const requiredInt = (min: number, max: number) =>
  z
    .string({ error: 'Nombre requis' })
    .trim()
    .min(1, 'Nombre requis')
    // `transform` + `pipe(z.number())` plutôt que `pipe(z.coerce.number())` : l'entrée d'un
    // schéma coercitif est `unknown`, que Zod v4 refuse de chaîner derrière une sortie `string`.
    // `z.number()` rejette `NaN` — une saisie non numérique tombe donc sur « Nombre invalide ».
    .transform((v) => Number(v))
    .pipe(
      z
        .number({ error: 'Nombre invalide' })
        .int('Nombre entier')
        .min(min, `Minimum ${min}`)
        .max(max, `Maximum ${max}`),
    )

// ---------- Commandes de dossier ----------

export const candidateIdInput = z.object({ id: z.uuid() })

/** Verdict de l'agence — `nouveau` n'est jamais reposé à la main (c'est l'état initial). */
export const reviewInput = z.object({
  id: z.uuid(),
  status: z.enum(['valide', 'refuse']),
})

// ---------- Config du test ----------

/**
 * Une variante de question : EXACTEMENT 4 options non vides et une bonne réponse dans [0,3].
 * Ces cardinalités ne sont pas un confort de formulaire, ce sont les invariants du test :
 * `saveQiInput` (feature publique) borne les réponses envoyées à 0..3, et une option vide
 * afficherait un bouton radio sans texte au candidat.
 */
const qiVariantForm = z.object({
  q: z.string().trim().min(1, 'Question requise').max(300, '300 caractères max'),
  opts: z
    .array(z.string().trim().min(1, 'Option vide').max(200, '200 caractères max'))
    .length(4, '4 options par question'),
  // Le radio « bonne réponse » rend une CHAÎNE ('0'..'3'), et `null` si aucune option n'est
  // cochée — d'où le refus de la valeur vide (avant, un `null` coercé en 0 désignait
  // silencieusement la première option comme bonne réponse).
  a: requiredInt(0, 3),
})

const qiSlotForm = z.object({
  slot: z.string().trim().min(1, 'Nom de l’emplacement requis').max(60, '60 caractères max'),
  variants: z.array(qiVariantForm).min(1, 'Au moins une variante').max(10, '10 variantes max'),
})

/**
 * Lien Discord : URL valide OU vide (défaut `''` en base — non renseigné, l'écran final du test
 * n'affiche alors aucun lien). `z.url()` refuserait la chaîne vide, d'où le refine.
 */
const discordLink = z
  .string()
  .trim()
  .max(300, '300 caractères max')
  .refine((v) => v === '' || z.url().safeParse(v).success, 'Lien invalide (https://…) ou vide')

export const configForm = z.object({
  open: z.boolean(),
  botMessages: requiredInt(1, 50),
  qiTimer: requiredInt(5, 120),
  frappeMin: requiredInt(1, 200),
  connexionMin: requiredInt(1, 1000),
  qiMin: requiredInt(0, 5),
  globalThreshold: requiredInt(0, 100),
  discordLink,
  /**
   * Texte de l'épreuve de frappe, NORMALISÉ à l'enregistrement (minuscules, espaces compactés) :
   * l'écran de frappe affiche et compare le texte normalisé — stocker une majuscule ou un double
   * espace ferait diverger l'affichage de la mesure. Le minimum de 50 caractères est mesuré APRÈS
   * normalisation (un texte de 3 mots ne donne aucune mesure de wpm exploitable).
   */
  typingText: z
    .string()
    .max(2000, '2000 caractères max')
    .transform((v) => v.trim().toLowerCase().replace(/\s+/g, ' '))
    .pipe(z.string().min(50, 'Texte trop court (50 caractères minimum)')),
  /** EXACTEMENT 5 emplacements : le verdict calcule `qi/5×30` et la base contraint `qi_score` 0..5. */
  qiBank: z.array(qiSlotForm).length(5, 'Exactement 5 emplacements de question'),
})

/** Entrée du formulaire (les inputs HTML rendent des chaînes) — type de `useForm`. */
export type ConfigFormValues = z.input<typeof configForm>
/** Sortie validée + normalisée (ce que reçoit l'action). */
export type ConfigInput = z.infer<typeof configForm>
