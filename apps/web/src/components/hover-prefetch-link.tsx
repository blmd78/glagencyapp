'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { prefetchFull } from '@/lib/nav'

type HoverPrefetchLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: Route
  children: ReactNode
}

/**
 * `<Link>` qui ne précharge JAMAIS en arrière-plan, et précharge COMPLÈTEMENT au survol.
 *
 * Même patron que la sidebar (`app-sidebar.tsx` : `prefetch={false}` + `prefetchOnHover`), sorti
 * ici parce que la face Formation en a besoin dans trois features que la frontière ESLint empêche
 * de se référencer entre elles.
 *
 * POURQUOI — relevé Vercel du 2026-09-17 : les grilles de modules (Ma formation, Ma roue, la liste)
 * affichent 7 cartes ; en `<Link>` nu, Next préchargeait les 7 routes dès l'entrée dans le viewport,
 * puis les rejouait à l'expiration de la fraîcheur (~300 s) tant que l'onglet restait ouvert.
 * `/formation/modules/[code]` pesait à elle seule 123 626 requêtes/jour sur 177 764, dont deux tiers
 * de 304 « rien n'a changé ». Chacune réveille `proxy.ts` (le skill archi-web le rappelle : le proxy
 * tourne sur TOUTES les requêtes, prefetch compris), donc chacune se facture.
 *
 * Le survol précharge avant le clic : la navigation reste servie depuis le cache client, le ressenti
 * ne change pas. `kind:'full'` (cf. `prefetchFull`) parce que le prefetch natif de Next ne ramène que
 * la coquille d'une route dynamique — le clic repartirait au serveur chercher le contenu.
 * `onFocus` double le survol pour la navigation au clavier.
 */
export function HoverPrefetchLink({
  href,
  onMouseEnter,
  onFocus,
  ...props
}: HoverPrefetchLinkProps) {
  const router = useRouter()
  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onMouseEnter={(e) => {
        prefetchFull(router, href)
        onMouseEnter?.(e)
      }}
      onFocus={(e) => {
        prefetchFull(router, href)
        onFocus?.(e)
      }}
    />
  )
}
