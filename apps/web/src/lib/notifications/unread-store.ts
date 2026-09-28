import { useSyncExternalStore } from 'react'

/**
 * Le non-lu de la cloche, partagé avec la pastille « Agence » de la sidebar (demande Benoit
 * 2026-09-28). Les deux vivent dans le layout `(dash)`, qui ne se re-rend pas aux navigations
 * `Link` : sans état commun, la cloche ouverte retomberait à 0 pendant que la pastille resterait
 * allumée jusqu'au prochain F5.
 *
 * La cloche est la SEULE à écrire — elle porte le refresh et le « vu ». `null` = pas de donnée
 * (cloche pas encore montée, ou absente après un échec) : pas de pastille non plus.
 */
let unread: number | null = null
const listeners = new Set<() => void>()

export function setUnread(next: number | null) {
  if (next === unread) return
  unread = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useUnread(): number | null {
  return useSyncExternalStore(subscribe, () => unread, () => null)
}
