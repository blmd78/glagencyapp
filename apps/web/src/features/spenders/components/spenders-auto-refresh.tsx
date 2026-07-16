'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Rafraîchit les données de la vue spenders active (toutes les 3 min, onglet visible) :
 * chaque page fetche la sienne au chargement/à la navigation (standard), mais tant qu'un
 * closer reste sur le MÊME onglet sans naviguer, rien ne la rafraîchit spontanément —
 * sans ce tick, les relances des AUTRES closers n'apparaîtraient qu'après une action à
 * soi ou un F5. Monté une seule fois par `layout.tsx` (persiste tel quel aux bascules
 * d'onglet entre /liste, /tracker, /alertes, /archive — Next ne re-exécute pas un layout
 * en naviguant entre ses enfants, donc son timer n'est pas réinitialisé). Garde-fous
 * (revue) : pas de refresh si un dialog est ouvert (une donnée d'autrui pourrait sortir
 * la ligne de la vue et démonter le dialog en pleine saisie), et rattrapage immédiat au
 * retour sur l'onglet. router.refresh() re-fetch la page active en préservant l'état
 * client (filtres, scroll, patchs optimistes en cours). Ne rend rien.
 */
export function SpendersAutoRefresh() {
  const router = useRouter()
  // `Date.now()` est impur (react-hooks/purity l'interdit dans le corps du composant —
  // MÊME derrière une garde `if (ref.current === null)`, testé : toujours une erreur de
  // règle, pas seulement un warning). Le ref démarre à `null` (posé pendant le render,
  // pur) et sa vraie valeur n'est écrite que dans l'effet ci-dessous (phase commit,
  // seul endroit où un appel impur est légitime) — quelques ms après le premier render,
  // sans incidence sur un tick à 3 min / rattrapage à 60 s.
  const lastRefresh = useRef<number | null>(null)

  useEffect(() => {
    if (lastRefresh.current === null) lastRefresh.current = Date.now()
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
      if (document.visibilityState === 'visible' && Date.now() - (lastRefresh.current ?? 0) > 60_000) {
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
