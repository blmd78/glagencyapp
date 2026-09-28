import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bump, cutChangelog, format, lastVersion, parseVersion, topRelease } from './release.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'release.mjs');

test('lastVersion : tri numérique, 2.10 après 2.9', () => {
  assert.deepEqual(lastVersion(['v2.9', 'v2.10', 'v2.2'], 'v'), { major: 2, minor: 10, patch: 0 });
});

test('lastVersion : ignore les tags mobiles et de sauvegarde', () => {
  const tags = ['v1.0', 'mobile-v3.0.0', 'pre-rebase-2026-08-25', 'sauvegarde-avant-rebase-20260901-1114', 'v1.1.2', ''];
  assert.deepEqual(lastVersion(tags, 'v'), { major: 1, minor: 1, patch: 2 });
  assert.deepEqual(lastVersion(tags, 'mobile-v'), { major: 3, minor: 0, patch: 0 });
  assert.equal(lastVersion(['pre-rebase'], 'v'), null);
});

test('bump + format : mineur par défaut, correctif, majeur', () => {
  const v = parseVersion('2.62');
  assert.equal(format(bump(v, 'minor'), false), '2.63');
  assert.equal(format(bump(v, 'patch'), false), '2.62.1');
  assert.equal(format(bump(v, 'major'), false), '3.0');
  assert.equal(format(bump(parseVersion('1.0.0'), 'minor'), true), '1.1.0');
});

const CL = '# Changelog\n\n## Non publié\n\n### Ajouté\n\n- Onglet Uncove\n\n## [2.62] — 2026-09-25\n\n- Relevé corrigé\n';

test('cutChangelog : publie la section et rouvre « Non publié »', () => {
  assert.equal(
    cutChangelog(CL, '2.63', '2026-09-28'),
    '# Changelog\n\n## Non publié\n\n## [2.63] — 2026-09-28\n\n### Ajouté\n\n- Onglet Uncove\n\n## [2.62] — 2026-09-25\n\n- Relevé corrigé\n',
  );
});

test('cutChangelog : refuse une section vide ou sans puce', () => {
  assert.throws(() => cutChangelog('## Non publié\n\n## [1.0] — 2026-09-25\n', '1.1', '2026-09-28'), /vide/);
  assert.throws(() => cutChangelog('## Non publié\n\n### Ajouté\n\n', '1.1', '2026-09-28'), /vide/);
});

test('cutChangelog : fonctionne quand « Non publié » est la dernière section', () => {
  assert.equal(cutChangelog('## Non publié\n\n- x\n', '1.1', '2026-09-28'), '## Non publié\n\n## [1.1] — 2026-09-28\n\n- x\n');
});

test('topRelease : la plus haute section publiée', () => {
  assert.deepEqual(topRelease(CL), { version: '2.62', date: '2026-09-25', notes: '- Relevé corrigé' });
});

function repo(files, tags = []) {
  const dir = mkdtempSync(join(tmpdir(), 'release-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 'test@example.com');
  g('config', 'user.name', 'test');
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), c);
  }
  g('add', '-A');
  g('commit', '-q', '-m', 'init');
  for (const t of tags) g('tag', t);
  return { dir, g };
}
const run = (dir, ...args) => spawnSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });

test('CLI prepare (web) : version suivante, changelog publié, commit', () => {
  const { dir, g } = repo({ 'CHANGELOG.md': '# Changelog\n\n## Non publié\n\n- Carte des projets\n\n## [1.0] — 2026-09-25\n\n- Référence\n' }, ['v1.0']);
  const r = run(dir, 'prepare');
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), /## Non publié\n\n## \[1\.1\] — \d{4}-\d{2}-\d{2}\n\n- Carte des projets/);
  assert.match(g('log', '-1', '--format=%s'), /chore\(release\): v1\.1/);
});

test('CLI prepare : refuse un « Non publié » vide, sans rien commiter', () => {
  const { dir, g } = repo({ 'CHANGELOG.md': '## Non publié\n\n## [1.0] — 2026-09-25\n\n- R\n' }, ['v1.0']);
  const r = run(dir, 'prepare');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /vide/);
  assert.match(g('log', '-1', '--format=%s'), /init/);
});

test('CLI prepare : refuse un arbre sale', () => {
  const { dir } = repo({ 'CHANGELOG.md': '## Non publié\n\n- x\n' }, ['v1.0']);
  writeFileSync(join(dir, 'wip.txt'), 'wip');
  assert.equal(run(dir, 'prepare').status, 1);
});

test('CLI prepare : refuse une carte désynchronisée, sans rien écrire ni commiter', () => {
  const changelog = '## Non publié\n\n- Carte des projets\n\n## [1.0] — 2026-09-25\n\n- R\n';
  const { dir, g } = repo(
    {
      'CHANGELOG.md': changelog,
      'scripts/check-carte.mjs': "console.error('✗ absent de docs/CARTE.md : apps/web/src/features/zz');\nprocess.exit(1);\n",
    },
    ['v1.0'],
  );
  const r = run(dir, 'prepare');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /carte désynchronisée/);
  assert.equal(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), changelog);
  assert.match(g('log', '-1', '--format=%s'), /init/);
});

test('CLI prepare : refuse un second prepare avant le tag, repart une fois tagué', () => {
  const { dir, g } = repo({ 'CHANGELOG.md': '# Changelog\n\n## Non publié\n\n- Carte des projets\n\n## [1.0] — 2026-09-25\n\n- Référence\n' }, ['v1.0']);
  const cl = () => readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
  assert.equal(run(dir, 'prepare').status, 0);
  writeFileSync(join(dir, 'CHANGELOG.md'), cl().replace('## Non publié\n', '## Non publié\n\n- Relevé corrigé\n'));
  g('commit', '-q', '-am', 'feat: relevé');
  const r = run(dir, 'prepare');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /pas encore taguée/);
  assert.equal(cl().match(/^## \[1\.1\]/gm).length, 1);
  g('tag', 'v1.1');
  const again = run(dir, 'prepare');
  assert.equal(again.status, 0, again.stderr);
  assert.match(cl(), /## \[1\.2\] — \d{4}-\d{2}-\d{2}\n\n- Relevé corrigé/);
});

test('CLI prepare --mobile : part de app.json sans tag mobile, bump app.json', () => {
  const { dir } = repo(
    {
      'apps/app/app.json': JSON.stringify({ expo: { name: 'Holyware', version: '1.0.0' } }, null, 2) + '\n',
      'apps/app/CHANGELOG.md': '## Non publié\n\n- Marché paginé\n\n## [1.0.0] — 2026-09-25\n\n- Référence\n',
    },
    ['v1.0'],
  );
  const r = run(dir, 'prepare', '--mobile');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(readFileSync(join(dir, 'apps/app/app.json'), 'utf8')).expo.version, '1.1.0');
  assert.match(readFileSync(join(dir, 'apps/app/CHANGELOG.md'), 'utf8'), /## \[1\.1\.0\]/);
});

test('CLI tag : pose le tag de la version publiée, refuse un doublon', () => {
  const { dir, g } = repo({ 'CHANGELOG.md': '## Non publié\n\n## [1.1] — 2026-09-28\n\n- Carte\n' }, ['v1.0']);
  assert.equal(run(dir, 'tag').status, 0);
  assert.match(g('tag', '--list', 'v1.1'), /v1\.1/);
  assert.equal(run(dir, 'tag').status, 1);
});

test('CLI tag : le message garde les rubriques « ### » du changelog', () => {
  // Sans `--cleanup=verbatim`, git retire toute ligne qui commence par `#` :
  // les tags mobile-v1.1.0 et mobile-v1.1.1 ont perdu « ### Ajouté / Corrigé ».
  const { dir, g } = repo({ 'CHANGELOG.md': '## Non publié\n\n## [1.1] — 2026-09-28\n\n### Corrigé\n\n- Connexion\n' }, ['v1.0']);
  assert.equal(run(dir, 'tag').status, 0);
  assert.match(g('tag', '-l', '--format=%(contents)', 'v1.1'), /### Corrigé\n\n- Connexion/);
});

test('CLI tag (web) : refuse hors de main', () => {
  const { dir, g } = repo({ 'CHANGELOG.md': '## Non publié\n\n## [1.1] — 2026-09-28\n\n- x\n' }, ['v1.0']);
  g('checkout', '-q', '-b', 'dev');
  assert.equal(run(dir, 'tag').status, 1);
});
