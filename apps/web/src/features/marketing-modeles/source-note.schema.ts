import { z } from 'zod'

// Partagé par la modale (RHF) ET la Server Action — règle archi-web.

/** 20 000 caractères : « un énorme bloc d'info », pas un fichier (même borne que le `check` de 0170). */
export const NOTE_MAX = 20000

export const sourceNoteSchema = z.object({
  creatorId: z.uuid(),
  groupKey: z.string().trim().min(1).max(40),
  // Pas de `.trim()` sur le corps : l'indentation et les lignes vides font partie du bloc.
  body: z.string().max(NOTE_MAX, `${NOTE_MAX.toLocaleString('fr-FR')} caractères au plus`),
})
export type SourceNoteInput = z.infer<typeof sourceNoteSchema>
