'use client'

import { createContext } from 'react'

/**
 * Pendant un glisser (#161) : la tâche survolée, et le côté où l'on se posera — `<id>:before` ou
 * `<id>:after`. Un contexte plutôt qu'une prop : la grille le calcule, chaque carte le lit, sans le
 * faire transiter par la journée et la section.
 */
export const DropHintContext = createContext<string | null>(null)
