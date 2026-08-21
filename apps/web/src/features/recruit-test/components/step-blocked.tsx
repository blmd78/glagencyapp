/**
 * Cul-de-sac d'entrée : test fermé, navigateur déjà passé, ou trop de tentatives depuis ce
 * réseau. Le message vient TEL QUEL du serveur (`BusinessError` française) — le client ne
 * réinterprète rien et, surtout, ne relance pas `startAttempt` en boucle : chaque appel compte
 * dans le plafond par IP.
 */
export function StepBlocked({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex size-11 items-center justify-center rounded-lg border text-lg" aria-hidden>
        ⛔
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Le test ne peut pas démarrer</h1>
      <p role="alert" className="text-sm text-muted-foreground">
        {message}
      </p>
    </div>
  )
}
