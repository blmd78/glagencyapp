/** Message d'erreur de champ (RHF) — même rendu que les dialogs Membres / Catalogue / Roue.
 *  Local à la feature : le cross-feature est interdit (ESLint), et le composant tient en 5 lignes. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-xs text-red-600 dark:text-red-400">
      {message}
    </p>
  )
}
