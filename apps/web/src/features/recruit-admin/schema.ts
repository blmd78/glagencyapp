import { z } from 'zod'
import { requiredInt } from '@/lib/form-fields'

// Schémas des Server Actions ADMIN du recrutement. Zod v4.
//
// Deux familles :
// - commandes de dossier (valider/refuser/bloquer/débloquer/supprimer) : un `id`, pas de form ;
// - `configForm` : PARTAGÉ par le formulaire (RHF + zodResolver) et `saveRecruitConfig`
//   (`runAction`). Les bornes reprennent les `check` SQL de 0125 en les RESSERRANT là où une
//   valeur techniquement acceptable serait absurde à l'usage (ex. `qi_timer` autorise 300 s en
//   base, on s'arrête à 120 : une question de QI qui laisse 5 minutes ne mesure plus rien).

// `requiredInt` (vide = refus, cf. `@/lib/form-fields`) partout où un entier est saisi : sur
// `qiMin` et `globalThreshold`, dont le minimum légitime EST 0, un champ vidé s'enregistrait
// sinon à 0 — « Score global minimum » vidé désactivait tout refus au global, en silence.

// ---------- Commandes de dossier ----------

export const candidateIdInput = z.object({ id: z.uuid() })

/**
 * « Intégrer » : créer le compte du candidat ET le rattacher à une modèle (reprise GLA
 * `doIntegrate`, index.html:2322). `creatorId` reste OPTIONNEL — le dialog laisse créer le compte
 * sans rattacher, ce que faisait l'ancien bouton « Ajouter » et qui sert quand la modèle n'est pas
 * encore décidée. Sans modèle, pas de date d'intégration : la personne reste « en formation ».
 */
export const integrateCandidateInput = z.object({ id: z.uuid(), creatorId: z.uuid().optional() })

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
 * Lien Discord : URL **http(s)** OU vide (défaut `''` en base — non renseigné, l'écran final du
 * test n'affiche alors aucun lien). Le refine porte deux choses que `z.url()` seul ne fait pas :
 * accepter la chaîne vide, et RESTREINDRE LE PROTOCOLE. `z.url()` valide `javascript:alert(1)` et
 * `data:text/html,…` — or cette valeur part telle quelle en `href` sur `/postuler`
 * (`recruit-test/components/step-done.tsx`), page publique servie au candidat reçu. Le champ n'est
 * éditable que par un admin, mais un `href` exécutable n'a aucune raison de pouvoir exister ici.
 */
const discordLink = z
  .string()
  .trim()
  .max(300, '300 caractères max')
  .refine((v) => v === '' || z.url({ protocol: /^https?$/ }).safeParse(v).success, 'Lien invalide (https://…) ou vide')

/** Plafond d'emplacements de la banque QI — repris par le `check (qi_total between 1 and 20)` de 0114. */
export const QI_BANK_MAX = 20

const configFields = z.object({
  open: z.boolean(),
  botMessages: requiredInt(1, 50),
  qiTimer: requiredInt(5, 120),
  frappeMin: requiredInt(1, 200),
  connexionMin: requiredInt(1, 1000),
  // Le maximum RÉEL de `qiMin` est le nombre d'emplacements de la banque — un seuil au-dessus
  // refuserait tout le monde. Il ne peut pas s'écrire ici (le champ ne connaît pas `qiBank`) :
  // c'est le `superRefine` en bas de ce module qui le porte. 20 = plafond absolu de la banque.
  qiMin: requiredInt(0, 20),
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
  /**
   * De 1 à 20 emplacements — l'admin en ajoute et en retire librement. Le nombre N n'est PAS une
   * constante du test : le verdict pondère `qi/N×30` avec le N de la tentative (longueur de sa clé
   * de correction, `recruit_attempts.qi_answers`), et la base contraint `qi_score between 0 and 20`
   * (0114). Le plancher de 1 est réel : une banque vide ferait un tirage sans question.
   */
  qiBank: z
    .array(qiSlotForm)
    .min(1, 'Au moins une question')
    .max(QI_BANK_MAX, `${QI_BANK_MAX} questions max`),
})

/**
 * Validation CROISÉE : le seuil de logique est un NOMBRE de bonnes réponses, pas une proportion —
 * un `qiMin` supérieur au nombre de questions refuserait mécaniquement tous les candidats, sans
 * que rien ne l'explique côté agence. L'erreur est posée sur `qiMin` (c'est lui qu'on corrige :
 * retirer une question ne doit pas rendre la banque fautive).
 */
export const configForm = configFields.superRefine((v, ctx) => {
  if (v.qiMin > v.qiBank.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['qiMin'],
      message: `Le minimum ne peut pas dépasser le nombre de questions (${v.qiBank.length}).`,
    })
  }
})

/** Entrée du formulaire (les inputs HTML rendent des chaînes) — type de `useForm`. */
export type ConfigFormValues = z.input<typeof configForm>
/** Sortie validée + normalisée (ce que reçoit l'action). */
export type ConfigInput = z.infer<typeof configForm>
