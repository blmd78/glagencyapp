/**
 * Types de base de données Supabase — PLACEHOLDER.
 *
 * Régénère depuis le schéma réel avec :
 *   pnpm db:types   (→ supabase gen types typescript --local > packages/db/src/types.ts)
 *
 * Tant que ce n'est pas régénéré, `Database` est un type minimal pour compiler.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
