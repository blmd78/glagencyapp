'use client'

import type { ReactNode } from 'react'
import { SpendersDataCtx, type SpendersShared } from './spenders-data-context'

/** Pont layout (RSC) → contexte client : porte les données spenders vers les 4 vues. */
export function SpendersDataProvider({
  value,
  children,
}: {
  value: SpendersShared
  children: ReactNode
}) {
  return <SpendersDataCtx.Provider value={value}>{children}</SpendersDataCtx.Provider>
}
