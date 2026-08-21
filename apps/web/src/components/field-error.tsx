/** Message d'erreur de champ (RHF) — rendu unique partagé par tous les formulaires. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-xs text-red-600 dark:text-red-400">
      {message}
    </p>
  )
}
