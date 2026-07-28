'use client'

import { startTransition, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import type { ActionResult } from '@/lib/actions'

/**
 * Ajout rapide — dans la SEULE section « À faire » depuis la spec 2026-07-28-todos-dates :
 * une tâche naît toujours en « À faire » (le chrono ne démarre qu'au passage en « En cours »,
 * et une création directe ailleurs le fausserait). Un champ, un titre, Entrée. `onQuickAdd`
 * appelle `createTodo` côté `TodosView` : ce composant n'appelle lui-même aucune Server Action.
 */
export function TodoQuickAdd({
  onQuickAdd,
}: {
  onQuickAdd: (title: string) => Promise<ActionResult>
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    const title = value.trim()
    if (!title) return
    // Vidé + refocus IMMÉDIATEMENT, avant la réponse serveur : condition de la saisie en
    // rafale (plusieurs tâches créées coup sur coup sans attendre).
    setValue('')
    inputRef.current?.focus()
    startTransition(async () => {
      const res = await onQuickAdd(title)
      if (res.success) return
      toast.error(res.error)
      // Restaure la saisie perdue : sans ça, un échec (ex. titre trop long) vide le champ ET
      // perd ce que l'utilisateur avait tapé, le toast ne suffit pas à retrouver le texte.
      // Setter FONCTIONNEL : lit la valeur ACTUELLE du champ (pas `value`, figé dans la
      // fermeture au moment du submit) — si l'utilisateur a déjà retapé quelque chose pendant
      // l'aller-retour serveur, le champ n'est plus vide et on ne l'écrase pas.
      setValue((current) => (current === '' ? title : current))
    })
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          submit()
        }}
        placeholder="Créer…"
        // Un seul champ sur la page (SEULE section « À faire ») : le libellé reste explicite
        // plutôt qu'un générique « Créer une tâche ».
        aria-label="Créer une tâche — À faire"
        className="h-8 text-sm"
      />
    </div>
  )
}
