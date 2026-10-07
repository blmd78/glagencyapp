import type { StudioWriter } from '@glagency/scripts'

/**
 * Enveloppe le Studio pour enregistrer l'id du script DÈS sa création (un envoi coupé par la durée
 * Vercel laisse ainsi une trace). Une panne de cette trace est signalée mais n'interrompt PAS l'envoi :
 * le script existe chez MyPuls, et la désactivation qui suit doit avoir lieu.
 */
export function withCreationTrace(
  base: StudioWriter,
  record: (id: number) => Promise<void>,
  report: (e: unknown) => void,
): StudioWriter {
  return {
    ...base,
    createScript: async (fields) => {
      const id = await base.createScript(fields)
      await record(id).catch(report)
      return id
    },
  }
}
