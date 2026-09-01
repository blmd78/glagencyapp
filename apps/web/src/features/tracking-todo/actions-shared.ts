// Les gardes vivent en `lib/tracking/todo-guards.ts` — elles sont partagées avec l'écran de suivi
// (clôture d'une tâche « 1:1 ») et avec la page de la To-Do (validation de `?owner=`), et la
// frontière ESLint interdit le cross-feature.
export { assertOwner, assertCanAssign, assertCanUnassign, revalidateTodo } from '@/lib/tracking/todo-guards'
