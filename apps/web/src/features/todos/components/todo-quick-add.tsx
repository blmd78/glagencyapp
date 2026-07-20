'use client'

import { startTransition, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import type { ActionResult } from '@/lib/actions'
import { statusLabel, type TodoStatus } from '../types'

/**
 * Ajout rapide en bas de CHAQUE section (À faire / En cours / Terminé) : un champ, un titre,
 * Entrée, la tâche est créée avec les défauts (priorité moyenne, sans type ni release — ces
 * champs restent dans le dialog complet) et le STATUT `status` de la section qui porte ce
 * champ (une tâche créée depuis « En cours » ne doit pas atterrir dans « À faire »).
 * `onQuickAdd` appelle `createTodo` côté `TodosView` : ce composant n'appelle lui-même aucune
 * Server Action, juste ce callback.
 */
export function TodoQuickAdd({
  status,
  onQuickAdd,
}: {
  /** Statut ciblé par CE champ — celui de la section qui le contient. */
  status: TodoStatus
  onQuickAdd: (title: string, status: TodoStatus) => Promise<ActionResult>
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
      const res = await onQuickAdd(title, status)
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
        // Libellé distinct par section : 3 champs « Ajouter une tâche » identiques sur la même
        // page seraient indiscernables au lecteur d'écran (navigation par nom de champ).
        aria-label={`Créer une tâche — ${statusLabel(status)}`}
        className="h-8 text-sm"
      />
    </div>
  )
}
