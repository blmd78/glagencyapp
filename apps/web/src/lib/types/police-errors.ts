// Motifs de sanction « Police » — la SOURCE UNIQUE vit désormais dans le DOMAINE
// (`@glagency/core`, domain/police-errors.ts) : `memberEventLabel` y traduit la clé stockée
// par le trigger de suppression d'une sanction (0107), et le domaine ne peut pas importer
// `apps/web`. Ce fichier n'est plus qu'un ré-export pour garder les chemins d'import des
// features (`features/police`, `features/compta`) inchangés.
export { POLICE_ERRORS, ERROR_LABEL } from '@glagency/core'
