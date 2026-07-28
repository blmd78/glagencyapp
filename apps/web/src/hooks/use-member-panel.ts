import { useRef, useState } from 'react'
import type { ActionResult } from '@/lib/actions'

/** Panneau ouvert : une seule ligne à la fois, donc un seul état à porter. */
export interface MemberPanel<T> {
  id: string
  loading: boolean
  data?: T
  error?: string
}

/**
 * Chargement à l'ouverture d'une ligne de `MembersAccordion`, partagé par le Planning, le
 * Dashboard et la To-do. Ces trois piles écrivaient la même machine à états — le jeton de
 * course en particulier, dont l'oubli est invisible en test manuel et se paie en données
 * périmées à l'écran.
 *
 * `open(id)` sert à l'OUVERTURE comme au RECHARGEMENT (après une mutation dans le panneau) :
 * c'est le même geste, relancer la requête pour cette personne.
 */
export function useMemberPanel<T>(
  load: (input: { profileId: string }) => Promise<ActionResult<T>>,
) {
  const [panel, setPanel] = useState<MemberPanel<T> | null>(null)
  const reqRef = useRef(0)

  const open = (id: string) => {
    // Jeton par REQUÊTE, pas par personne : deux appels sur la MÊME personne (rouvrir vite, ou
    // recharger après mutation pendant qu'un chargement vole encore) ne doivent pas laisser
    // gagner le plus ancien. Seule la dernière requête émise a le droit d'écrire.
    const token = ++reqRef.current
    setPanel({ id, loading: true })
    const settle = (next: MemberPanel<T>) =>
      setPanel((p) => (token !== reqRef.current ? p : next))

    void (async () => {
      try {
        const res = await load({ profileId: id })
        settle(
          res.success
            ? { id, loading: false, data: res.data }
            : { id, loading: false, error: res.error },
        )
      } catch {
        // Échec de TRANSPORT : `runAction` n'a pas pu renvoyer d'`ActionResult`. Sans ce
        // catch, la promesse rejette sans être captée et le panneau reste en squelette à vie.
        settle({ id, loading: false, error: 'Chargement impossible — vérifie ta connexion.' })
      }
    })()
  }

  return { panel, open }
}
