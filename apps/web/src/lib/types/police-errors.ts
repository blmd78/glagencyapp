// Motifs de sanction « Police » — SOURCE UNIQUE, promue en lib/ parce que DEUX features la
// consomment (`features/police` : formulaires + journal ; `features/compta` : libellé des
// sanctions sur la fiche de paie) et que l'import cross-feature est interdit (ESLint
// `import-x/no-restricted-paths`, guidelines §1). Remplace la copie locale « à garder
// aligné » qui vivait dans `features/compta/services/compta-rows.ts`.

/** 14 types d'erreurs contrôlés — les 11 repris de l'outil HTML source (setters/closers),
 *  plus 3 ajoutés le 2026-07-29 (relances et horaires). Ajouter une entrée ici suffit :
 *  le formulaire du Tracker, la validation Zod et le libellé sur la fiche de paie en
 *  dérivent tous. `police_entries.error_key` est un `text` SANS contrainte de valeurs en
 *  base (vérifié sur `pg_constraint`) — donc aucune migration, et les sanctions déjà
 *  enregistrées ne bougent pas. */
export const POLICE_ERRORS = [
  { key: 'media_argent', label: 'Parle de média/argent directement' },
  { key: 'reactivite', label: 'Réponse > 45 s par sub' },
  { key: 'media_rapide', label: 'Envoi de média trop rapide' },
  { key: 'fautes', label: "Fautes d'orthographe" },
  { key: 'setter_lent', label: 'Ne récupère pas vite les nouveaux (setter)' },
  { key: 'hors_script', label: "Ne suit pas l'histoire du script" },
  { key: 'sexu_faible', label: 'Sexualisation faible (ne fait pas baver)' },
  { key: 'promesse', label: 'Promesse non tenue (setter)' },
  { key: 'temps_media', label: "N'attend pas le temps du média" },
  { key: 'infos_non_transmises', label: 'Ne transmet pas les infos' },
  { key: 'infos_non_notees', label: 'Ne note pas les infos' },
  { key: 'relance_spendeur', label: 'Aucune relance au spendeur' },
  { key: 'relance_ppv', label: 'Aucune relance après PPV' },
  { key: 'horaires', label: 'Non respect des horaires de travail' },
] as const

/** Libellé par clé — pour afficher une sanction stockée (`error_key`). Dérivé, jamais copié. */
export const ERROR_LABEL: Record<string, string> = Object.fromEntries(
  POLICE_ERRORS.map((e) => [e.key, e.label]),
)
