'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Rafraîchit les données du layout spenders (toutes les 3 min, onglet visible) : depuis
 * le fetch unique au layout, naviguer entre les vues ne recharge plus rien — sans ce
 * tick, les relances des AUTRES closers n'apparaîtraient qu'après une action à soi ou un
 * F5. Garde-fous (revue) : pas de refresh si un dialog est ouvert (une donnée d'autrui
 * pourrait sortir la ligne de la vue et démonter le dialog en pleine saisie), et
 * rattrapage immédiat au retour sur l'onglet. router.refresh() préserve l'état client
 * (filtres, scroll, patchs optimistes en cours). Ne rend rien.
 */
export function SpendersAutoRefresh() {
  const router = useRouter()
  // eslint-disable-next-line react-hooks/purity -- timestamp d'init au premier render ; refactor prévu au batch spenders
  const lastRefresh = useRef(Date.now())

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      // Uniquement les dialogs VISIBLES : sous Cache Components, des pages cachées
      // peuvent rester montées (display:none) avec leur dialog dans le DOM — un simple
      // querySelector suspendrait le refresh indéfiniment (revue PPR).
      const dialogOuvert = [...document.querySelectorAll('[role="dialog"]')].some((el) =>
        (el as HTMLElement).checkVisibility?.() ?? true,
      )
      if (dialogOuvert) return
      lastRefresh.current = Date.now()
      router.refresh()
    }
    const id = setInterval(refresh, 180_000)
    const onVisible = () => {
      // Retour après une absence : rattrapage tout de suite plutôt que d'afficher
      // jusqu'à 3 min de données périmées.
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current > 60_000) {
        refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router])
  return null
}
