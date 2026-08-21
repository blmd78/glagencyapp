import { z } from 'zod'

/**
 * Briques Zod PARTAGÉES par les formulaires (RHF + zodResolver) et les Server Actions qui
 * revalident la même saisie. Rien de métier ici : uniquement les pièges de la frontière
 * `<input>` → Zod → Server Action, qui se reproduisaient d'une feature à l'autre.
 */

/**
 * Entier BORNÉ saisi dans un `<input type="number">` (ou porté par un radio) — donc une CHAÎNE
 * côté formulaire. Deux pièges, et c'est ce qui justifie de ne pas écrire `z.coerce.number()` :
 *
 * 1. **`z.coerce.number()` parse `''` en `0`.** Un champ VIDÉ s'enregistrait donc à 0 sans la
 *    moindre erreur. Sur un champ dont le minimum légitime EST 0 (« Score global minimum » du
 *    recrutement, un poids de roue), personne ne voyait rien : vider « Score global minimum »
 *    désactivait silencieusement tout refus au global, vider un poids sortait le secteur du
 *    tirage. Le `trim().min(1)` sur la CHAÎNE, avant toute conversion, est ce qui refuse le vide
 *    (« Nombre requis ») — un `'   '` compris.
 *
 * 2. **Le schéma est parsé DEUX fois, sur deux formes différentes.** `zodResolver` rend à
 *    `handleSubmit` les valeurs TRANSFORMÉES (des nombres), et c'est cet objet-là que le client
 *    envoie à la Server Action, qui revalide avec LE MÊME schéma. Un validateur qui n'accepterait
 *    que des chaînes rejetterait donc sa propre sortie côté serveur (« Saisie invalide » à
 *    l'enregistrement, sans rien dire de plus). D'où l'union : une chaîne non vide (le
 *    formulaire) OU un nombre déjà converti (le second passage).
 *
 * Les messages sont identiques dans les deux branches : `''`/`'   '`/`null` → « Nombre requis »,
 * une saisie non numérique → « Nombre invalide » (`z.number()` rejette `NaN`), puis
 * « Nombre entier » / « Minimum n » / « Maximum n ». Le 3e paramètre permet de garder un libellé
 * MÉTIER (« Poids requis », « Minimum 1 € ») sans redéclarer la mécanique.
 */
export const requiredInt = (
  min: number,
  max: number,
  messages: { required?: string; invalid?: string; integer?: string; min?: string; max?: string } = {},
) => {
  const required = messages.required ?? 'Nombre requis'
  return z
    .union(
      [
        z
          .string({ error: required })
          .trim()
          .min(1, required)
          .transform((v) => Number(v)),
        z.number(),
      ],
      { error: required },
    )
    .pipe(
      z
        .number({ error: messages.invalid ?? 'Nombre invalide' })
        .int(messages.integer ?? 'Nombre entier')
        .min(min, messages.min ?? `Minimum ${min}`)
        .max(max, messages.max ?? `Maximum ${max}`),
    )
}
