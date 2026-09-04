import { z } from 'zod'
import { requiredInt } from '@/lib/form-fields'

/**
 * Réglages du relevé MyPuls. Schéma PARTAGÉ par le formulaire (RHF + zodResolver) et la Server
 * Action qui revalide la même saisie — le patron de `configForm` (recrutement).
 *
 * Les bornes ne sont pas décoratives : `idle` est LE paramètre qui décide du temps mesuré (le
 * passer de 3 à 10 min ajoute ~115 minutes médianes par chatteur et par jour, maximum relevé
 * +402), et le seuil décide de qui apparaît « sous le poste ». Les deux ont un prix en euros,
 * puisqu'ils alimentent des signalements.
 *
 * `idle` est borné à 1..30 : au-delà, on ne mesure plus une présence mais une journée entière —
 * une pause déjeuner d'une heure resterait comptée comme du chatting actif. Le seuil s'arrête à
 * 100 (au-dessus, plus personne ne tient jamais son poste) et démarre à 1 : un seuil à 0
 * validerait tout le monde en silence, ce qui est pire qu'un écran désactivé.
 */
export const shiftSettingsForm = z.object({
  idleMinutes: requiredInt(1, 30, {
    required: 'Pause requise',
    min: 'Minimum 1 min',
    max: 'Maximum 30 min',
  }),
  breakMinutes: requiredInt(1, 480, {
    required: 'Regroupement requis',
    min: 'Minimum 1 min',
    max: 'Maximum 480 min',
  }),
  coverageThreshold: requiredInt(1, 100, {
    required: 'Seuil requis',
    min: 'Minimum 1 %',
    max: 'Maximum 100 %',
  }),
})

/** Sortie du schéma — ce que la Server Action reçoit (des nombres). */
export type ShiftSettingsInput = z.infer<typeof shiftSettingsForm>

/**
 * Entrée côté formulaire. Dérivée du schéma (`z.input`) et NON réécrite à la main : le champ
 * accepte `string | number` parce que le schéma est parsé deux fois — une fois sur la saisie du
 * `<input>` (des chaînes), une fois côté serveur sur sa propre sortie (des nombres). La
 * redéclarer en `string` pur casse le resolver, qui rend le type d'entrée du schéma.
 */
export type ShiftSettingsFormValues = z.input<typeof shiftSettingsForm>
