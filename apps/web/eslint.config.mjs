import { readdirSync } from 'node:fs'
// DEVIATION vs brief (voir task-3-report.md) : eslint-config-next 16.2.10 exporte des
// configs flat pures ; compat.extends('next/core-web-vitals', 'next/typescript') via
// @eslint/eslintrc crashe ("Converting circular structure to JSON" — vercel/next.js#85244).
// Import direct des sous-chemins flat, pattern documenté par nextjs.org/docs (config ESLint).
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import * as importX from 'eslint-plugin-import-x'

// Une zone par feature : une feature ne peut importer AUCUNE autre feature.
// Liste dérivée du filesystem → zéro drift quand une feature est ajoutée/supprimée.
const features = readdirSync(new URL('./src/features', import.meta.url), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

const eslintConfig = [
  // .open-next/** et .wrangler/** ajoutés au brief : artefacts de build (cf. apps/web/.gitignore),
  // absents de la liste du brief → sans ça, eslint lint des bundles générés (des milliers de
  // faux positifs sur du code minifié).
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '.open-next/**', '.wrangler/**'] },
  ...nextVitals,
  ...nextTypescript,
  {
    plugins: { 'import-x': importX },
    // NON prévu par le brief : sans resolver TypeScript, import-x/no-restricted-paths ne
    // résout aucun import `.ts`/`.tsx` ni l'alias `@/*` → la règle ne signale RIEN, en
    // silence (aucune erreur ESLint, juste 0 violation trouvée). Vérifié par test manuel
    // (import interdit ajouté puis retiré, cf. task-3-report.md).
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true })],
    },
    rules: {
      // Frontières (Bulletproof React) : lib → features → app, unidirectionnel.
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            // Personne n'importe app/
            { target: './src/features', from: './src/app' },
            { target: './src/components', from: './src/app' },
            { target: './src/lib', from: './src/app' },
            // lib et components (partagés) n'importent pas les features
            { target: './src/lib', from: './src/features' },
            { target: './src/components', from: './src/features' },
            // hooks et config (partagés) : mêmes frontières que lib/components
            { target: './src/hooks', from: './src/app' },
            { target: './src/hooks', from: './src/features' },
            { target: './src/config', from: './src/app' },
            { target: './src/config', from: './src/features' },
            // Cross-feature interdit
            ...features.map((f) => ({
              target: `./src/features/${f}`,
              from: './src/features',
              except: [`./${f}`],
            })),
          ],
        },
      ],
    },
  },
]

export default eslintConfig
