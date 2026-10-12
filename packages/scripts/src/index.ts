// Briques partagées par la commande `script-mypuls` et l'import du CRM — point d'entrée du package
// (à part, sans SDK IA : `@glagency/scripts/session` pour le Worker, `@glagency/scripts/notion` pour le navigateur).
export {
  NotionError,
  blocksToText,
  fetchNotionPage,
  isPromptTitle,
  listSharedPages,
  notionPageId,
  type NotionBlock,
  type SharedPage,
} from './notion'
export { SOURCE_LIMITS, gatherScript, type GatheredScript, type PdfDocument, type ScriptSource, type SourceKind } from './sources'
export {
  CONVERT_EXAMPLE,
  CONVERT_MODEL,
  CONVERT_SYSTEM,
  ConversionError,
  SCRIPT_DRAFT_SCHEMA,
  convertContent,
  convertToDraft,
  type ConvertClient,
} from './convert'
export { looksLikeScript } from './shape'
export { RATE_LIMIT_DELAYS_MS, sendScript, studioWriter, type Cleanup, type MediaReport, type SendResult, type StudioWriter } from './send'
export { describeFailure, describeMedia, formatReport } from './report'
