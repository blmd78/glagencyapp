'use client'

import { useMemo, type ReactNode } from 'react'
import { SpendersDataCtx } from './spenders-data-context'
import { decodeSpenders, type SpendersWireData } from '../wire'

/**
 * Pont layout (RSC) → contexte client : reçoit le payload en TUPLES compacts (cf. wire.ts)
 * et le redéploie en objets SpenderRow une seule fois (useMemo) pour les 4 vues.
 */
export function SpendersDataProvider({
  wire,
  isAdmin,
  children,
}: {
  wire: SpendersWireData
  isAdmin: boolean
  children: ReactNode
}) {
  const value = useMemo(() => ({ data: decodeSpenders(wire), isAdmin }), [wire, isAdmin])
  return <SpendersDataCtx.Provider value={value}>{children}</SpendersDataCtx.Provider>
}
