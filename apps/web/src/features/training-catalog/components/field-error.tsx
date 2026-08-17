/** Message d'erreur de champ (RHF) — même rendu que les dialogs Membres / Scripts. */
export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="text-xs text-red-600 dark:text-red-400">
      {message}
    </p>
  )
}
