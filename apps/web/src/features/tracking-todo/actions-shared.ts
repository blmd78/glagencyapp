// Les gardes vivent en `lib/tracking/todo-guards.ts` — elles sont partagées avec l'écran de suivi
// (clôture d'une tâche « 1:1 »), et la frontière ESLint interdit le cross-feature.
export { assertOwner, assertOwnerOrAdmin, TODO_PATH } from '@/lib/tracking/todo-guards'
