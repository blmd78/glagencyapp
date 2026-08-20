import { z } from 'zod'

/**
 * Schéma de notation du test de recrutement (output_config.format = json_schema) — transposition
 * fidèle de CAND_SCORE_SCHEMA (GLA serveur.py ~338 : 4 axes entiers 0-25 + un commentaire, requis =
 * les 4 axes seulement, commentaire optionnel). Chez GLA, ce schéma sert un `input_schema` d'outil
 * classique (min/max exprimables). Notre `output_config.format = json_schema` (structured output)
 * ne les exprime pas (même contrainte déjà documentée dans lib/ai/schema.ts) → les bornes passent en
 * `description`, revalidées par le Zod jumeau ci-dessous. `additionalProperties: false` est un AJOUT
 * (absent chez GLA) pour fiabiliser le structured output, comme dans lib/ai/schema.ts.
 * `total` n'est PAS dans le contrat de sortie (absent aussi de CAND_SCORE_SCHEMA) : recalculé
 * côté serveur dans recruit-score.ts (somme des 4 axes clampés).
 *
 * Note : la dernière ligne de RECRUIT_SCORE_SYSTEM (recruit-prompts.ts, verbatim GLA) demande
 * encore au modèle un JSON avec `total`/`commentaire` — c'est le texte SCORE_SYSTEM original de
 * GLA, gardé fidèle. Ce schéma structuré (sans `total`, `additionalProperties: false`) est ce qui
 * contraint réellement la sortie en decoding contraint : le schéma gagne toujours sur la consigne
 * en prose, `total` du modèle est ignoré même s'il est produit.
 */
export const recruitScoreJsonSchema = {
  type: 'object' as const,
  properties: {
    orthographe: { type: 'integer', description: 'Orthographe — lisibilité, naturel du style SMS (0 à 25)' },
    coherence: { type: 'integer', description: 'Cohérence — fluidité et logique de la conversation (0 à 25)' },
    relance: { type: 'integer', description: 'Relance — questions, maintien du client accroché (0 à 25)' },
    vente: { type: 'integer', description: 'Vente — construction du désir et de la relation vers du payant (0 à 25)' },
    commentaire: { type: 'string' },
  },
  required: ['orthographe', 'coherence', 'relance', 'vente'],
  additionalProperties: false as const,
}

// Une note d'axe hors [0, 25] est CLAMPÉE (pas rejetée) : seul un type non-numérique fait échouer —
// même règle que lib/ai/schema.ts (clampedAxisScore) : une notation payante ne doit pas rater sur un
// simple débordement/arrondi du modèle (dérive numérique tolérée).
const clampedAxisScore = z.number().transform((n) => Math.max(0, Math.min(25, Math.round(n))))

export const recruitScoreZod = z.object({
  orthographe: clampedAxisScore,
  coherence: clampedAxisScore,
  relance: clampedAxisScore,
  vente: clampedAxisScore,
  // Optionnel comme dans CAND_SCORE_SCHEMA (absent de `required`) ; non repris par
  // scoreRecruitTranscript (pas de champ commentaire dans son contrat de retour).
  commentaire: z.string().optional(),
})
export type RecruitScoreParsed = z.infer<typeof recruitScoreZod>
