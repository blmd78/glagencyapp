/**
 * Contrat de l'onglet Infos modèles (porté de gla-workflow) — fiche « infos clés » par
 * modèle : identité de base + sections libres. Stocké dans creators.infos_cle (JSONB).
 */

export const BASE_FIELDS = [
  { key: 'prenom', label: 'Prénom' },
  { key: 'age', label: 'Âge' },
  { key: 'ville', label: 'Ville' },
  { key: 'statut', label: 'Statut' },
  { key: 'anniversaire', label: 'Anniversaire' },
  { key: 'origine', label: 'Origine' },
  { key: 'metier', label: 'Métier' },
] as const

export const SECTION_TYPES = ['liste', 'fiche', 'recits', 'texte'] as const
export type SectionType = (typeof SECTION_TYPES)[number]

export interface InfosSection {
  titre: string
  contenu: string
  /** Emoji d'en-tête de section (hérité du legacy, optionnel). */
  emoji?: string
  /** Rendu : liste = pastilles, fiche = mini-cartes titre/desc, recits = cartes récit, texte (défaut). */
  type?: SectionType
}

export interface InfosCle {
  base: Record<string, string>
  sections: InfosSection[]
}

export interface ModeleInfos {
  creatorId: string
  model: string
  infos: InfosCle
}

export interface InfosModelesData {
  modeles: ModeleInfos[]
}

/** Rétrocompat legacy : ancien tableau de sections → objet { base, sections }. */
export function normalizeInfosCle(raw: unknown): InfosCle {
  if (!raw || typeof raw !== 'object') return { base: {}, sections: [] }
  const sections = (Array.isArray(raw) ? raw : ((raw as { sections?: unknown }).sections ?? [])) as InfosSection[]
  const base = Array.isArray(raw) ? {} : (((raw as { base?: Record<string, string> }).base) ?? {})
  return {
    base,
    sections: sections.map((s) => ({
      titre: s.titre ?? '',
      contenu: s.contenu ?? '',
      emoji: s.emoji || undefined,
      type: (SECTION_TYPES as readonly string[]).includes(s.type ?? '') ? s.type : undefined,
    })),
  }
}
