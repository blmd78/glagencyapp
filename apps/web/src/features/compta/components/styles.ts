/**
 * Titres de bloc et de colonne de la feature compta — module partagé SANS `'use client'`.
 *
 * Ces deux constantes vivaient dans `compta-payslip-calc.tsx` (`'use client'`). Importées
 * depuis un Server Component (`compta-month-view.tsx`), TOUTES les exports d'un module client
 * deviennent des références client (`registerClientReference`) dans le graphe RSC : interpolée
 * dans un template literal, c'est la fonction-référence qui partait dans `className`, pas la
 * classe CSS. Un module neutre est importable des deux côtés sans coercion.
 */

/**
 * Titre de BLOC de la fiche (« Ajustements », « Saisies hebdomadaires »…). Reprise EXACTE de
 * l'échelle que portaient déjà les en-têtes de formulaire de la feature
 * (`compta-entry-form.tsx`, `compta-settings-form.tsx`) — aucune échelle nouvelle introduite.
 */
export const SECTION_HEAD = 'text-xs font-medium uppercase tracking-wide text-muted-foreground'

/**
 * Titre de COLONNE — un cran plus discret que le titre de bloc. C'est cet écart-là qui fait la
 * hiérarchie : deux niveaux, pas six blocs au même volume. Partagé avec l'en-tête des saisies
 * (`compta-entry-form.tsx`), qui doit parler la même langue que la ventilation.
 */
export const COL_HEAD = 'text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'
