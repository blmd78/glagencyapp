// Motifs de sanction « Police » — SOURCE UNIQUE, montée dans le DOMAINE (2026-08-06) parce que
// trois surfaces la consomment désormais : `features/police` (formulaires + journal),
// `features/compta` (libellé des sanctions sur la fiche de paie) — via le ré-export
// `apps/web/src/lib/types/police-errors.ts`, chemins d'import inchangés — et
// `memberEventLabel` (ci-contre), qui traduit la clé stockée par le trigger de suppression
// d'une sanction (0107) : `apps/web` n'est pas importable depuis le domaine, l'inverse oui.

/** 14 types d'erreurs contrôlés — les 11 repris de l'outil HTML source (setters/closers),
 *  plus 3 ajoutés le 2026-07-29 (relances et horaires). Ajouter une entrée ici suffit :
 *  le formulaire du Tracker, la validation Zod, la fiche de paie et l'historique membre en
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
