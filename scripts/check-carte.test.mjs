import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCarte, expand, pathsInCarte } from './check-carte.mjs';

function fixture(dirs) {
  const root = mkdtempSync(join(tmpdir(), 'carte-'));
  for (const d of dirs) mkdirSync(join(root, d), { recursive: true });
  return root;
}

test('expand : un niveau par *, ignore cachés, node_modules et fichiers', () => {
  const root = fixture(['apps/web/src/features/booking', 'apps/web/src/features/.cache', 'apps/web/src/features/node_modules']);
  writeFileSync(join(root, 'apps/web/src/features/README.md'), '');
  assert.deepEqual(expand(root, 'apps/web/src/features/*'), ['apps/web/src/features/booking']);
});

test('expand : * au milieu du motif (sites turbotun)', () => {
  const root = fixture(['apps/vitrine/chandra/src/features/home', 'apps/vitrine/moment/src/features/contact', 'apps/vitrine/moment/public']);
  assert.deepEqual(expand(root, 'apps/vitrine/*/src/features/*'), [
    'apps/vitrine/chandra/src/features/home',
    'apps/vitrine/moment/src/features/contact',
  ]);
});

test('carte complète : aucun écart', () => {
  const root = fixture(['apps/web/src/features/booking', 'packages/shared']);
  const carte = '| Réserver | … | `/book` | `apps/web/src/features/booking/` | `slots` |\n| Shared | … | — | `packages/shared` | — |';
  assert.deepEqual(checkCarte({ root, patterns: ['apps/web/src/features/*', 'packages/*'], carte }), { missing: [], stale: [] });
});

test('feature ajoutée sans ligne : signalée manquante', () => {
  const root = fixture(['apps/web/src/features/booking', 'apps/web/src/features/stats']);
  const carte = '`apps/web/src/features/booking/`';
  assert.deepEqual(checkCarte({ root, patterns: ['apps/web/src/features/*'], carte }).missing, ['apps/web/src/features/stats']);
});

test('ligne vers un dossier disparu : signalée périmée', () => {
  const root = fixture(['apps/web/src/features/booking']);
  const carte = '`apps/web/src/features/booking/` `apps/web/src/features/outings/`';
  assert.deepEqual(checkCarte({ root, patterns: ['apps/web/src/features/*'], carte }).stale, ['apps/web/src/features/outings']);
});

test('chemins avec ./ ou / final : normalisés', () => {
  assert.deepEqual([...pathsInCarte('`./apps/web/src/features/booking/` `packages/ui`')], [
    'apps/web/src/features/booking',
    'packages/ui',
  ]);
});

test('racine absente de la branche : ignorée, lignes comprises', () => {
  const root = fixture(['apps/web/src/features/booking']);
  const carte = '`apps/web/src/features/booking/` `apps/app/src/features/marketplace/`';
  assert.deepEqual(
    checkCarte({ root, patterns: ['apps/web/src/features/*', 'apps/app/src/features/*'], carte }),
    { missing: [], stale: [] },
  );
});

test('routes et tables entre backticks : jamais prises pour des dossiers', () => {
  const root = fixture(['apps/web/src/features/booking']);
  const carte = '`/book/:id` `club_invoices` `get_external_slots` `apps/web/src/features/booking/`';
  assert.deepEqual(checkCarte({ root, patterns: ['apps/web/src/features/*'], carte }), { missing: [], stale: [] });
});
