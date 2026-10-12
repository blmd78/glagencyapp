/**
 * Catégorie d'une tâche ajoutée depuis le « + Tâche » d'une journée — par le titulaire comme par
 * son encadrement. Volontairement neutre : une tâche déposée porte déjà son badge « déposée », l'en-tête
 * du groupe n'a pas à le répéter — et si le titulaire a déjà une section de ce nom, la tâche s'y range.
 *
 * Aucune section n'est créée pour autant : `category` est du TEXTE LIBRE et non une clé étrangère
 * vers les sections (0127:44-45), et `getTodoWeek` reconstruit les groupes du jour à partir des
 * sections ET des catégories déjà portées par une tâche.
 *
 * Partagée avec l'import d'un fichier (#163), qui range les tâches du jour au même endroit — d'où
 * ce module à part : un composant client ne peut pas prêter une constante à une action serveur.
 */
export const DAY_TASK_CATEGORY = 'À faire'
