import type { SpenderRow, SpendersData } from './types'

/**
 * Encodage « fil » du payload spenders : chaque ligne voyage en TUPLE (tableau positionnel)
 * au lieu d'un objet — les 18 noms de champs ne sont plus répétés × N lignes dans le flight
 * RSC (~2,6× de payload en moins, mesuré en revue). Le poids du premier chargement reste
 * ainsi ~constant quand le seuil de tracking élargit la liste (40 € → 6 € ≈ ×2,2 lignes).
 * encode (serveur, layout) et decode (client, provider) sont COLOCALISÉS : l'ordre des
 * champs n'est défini qu'ici — toute évolution de SpenderRow doit modifier les deux côtés
 * dans le même écran.
 */

export type SpenderWire = [
  fanId: number,
  username: string,
  creatorId: string,
  model: string,
  ca: number,
  status: string | null,
  lastMessageAt: string | null,
  lastMessageIsMine: boolean | null,
  hasUnread: boolean,
  assignedLabel: string | null,
  chatterId: string | null,
  chatterName: string | null,
  chatterTeam: 'rouge' | 'bleue' | null,
  compteurR: number,
  derniereRelanceAt: string | null,
  grise: boolean,
  conversionPending: boolean,
  archived: boolean,
]

export interface SpendersWireData {
  spenders: SpenderWire[]
  capturedAt: string | null
  threshold: number
}

export function encodeSpenders(data: SpendersData): SpendersWireData {
  return {
    spenders: data.spenders.map((s): SpenderWire => [
      s.fanId,
      s.username,
      s.creatorId,
      s.model,
      s.ca,
      s.status,
      s.lastMessageAt,
      s.lastMessageIsMine,
      s.hasUnread,
      s.assignedLabel,
      s.chatterId,
      s.chatterName,
      s.chatterTeam,
      s.compteurR,
      s.derniereRelanceAt,
      s.grise,
      s.conversionPending,
      s.archived,
    ]),
    capturedAt: data.capturedAt,
    threshold: data.threshold,
  }
}

export function decodeSpenders(wire: SpendersWireData): SpendersData {
  return {
    spenders: wire.spenders.map(
      (t): SpenderRow => ({
        fanId: t[0],
        username: t[1],
        creatorId: t[2],
        model: t[3],
        ca: t[4],
        status: t[5],
        lastMessageAt: t[6],
        lastMessageIsMine: t[7],
        hasUnread: t[8],
        assignedLabel: t[9],
        chatterId: t[10],
        chatterName: t[11],
        chatterTeam: t[12],
        compteurR: t[13],
        derniereRelanceAt: t[14],
        grise: t[15],
        conversionPending: t[16],
        archived: t[17],
      }),
    ),
    capturedAt: wire.capturedAt,
    threshold: wire.threshold,
  }
}
