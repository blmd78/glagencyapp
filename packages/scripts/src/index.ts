// Briques partagées par la commande `script-mypuls` et l'import du CRM — point d'entrée du package
// (à part, sans SDK IA : `@glagency/scripts/session` pour le Worker, `@glagency/scripts/notion` pour le navigateur).
export {
  NotionError,
  blocksToText,
  fetchNotionPage,
  listNotionScripts,
  listSharedTopPages,
  notionPageId,
  type NotionBlock,
  type NotionFolder,
} from './notion'
export {
  CONVERT_EXAMPLE,
  CONVERT_MODEL,
  CONVERT_SYSTEM,
  ConversionError,
  SCRIPT_DRAFT_SCHEMA,
  convertToDraft,
  type ConvertClient,
} from './convert'
export { RATE_LIMIT_DELAYS_MS, sendScript, studioWriter, type Cleanup, type SendResult, type StudioWriter } from './send'
export { describeFailure, formatReport } from './report'
