import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Tests unitaires des modules PURS de apps/web (config, lib/slug…). Rien qui touche
// next/headers ou Supabase — ces modules-là se testent en intégration (UAT).
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // cf. vitest.server-only.stub.ts — le marqueur `server-only` lève à l'import hors RSC.
      'server-only': fileURLToPath(new URL('./vitest.server-only.stub.ts', import.meta.url)),
    },
  },
})
