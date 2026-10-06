// Tests du hook pre-push : `node --test scripts/*.test.mjs`.
// Chaque cas monte un dépôt temporaire avec un « origin » nu, puis appelle le hook comme git
// le fait (`pre-push <remote> <url>`, lignes « local_ref local_sha remote_ref remote_sha »
// sur stdin) — et un cas de bout en bout passe par un vrai `git push`, hook installé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOKS = resolve(dirname(fileURLToPath(import.meta.url)), 'hooks');
const HOOK = join(HOOKS, 'pre-push');
const ZERO = '0'.repeat(40);

// Environnement git isolé : ni config globale (signature, hooks perso), ni GIT_DIR hérité
// (tests lancés depuis un hook).
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
Object.assign(ENV, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });

function repo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'pre-push-'));
  const bare = mkdtempSync(join(tmpdir(), 'pre-push-origin-'));
  t.after(() => { rmSync(dir, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); });
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', env: ENV }).trim();
  const tryGit = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8', env: ENV });
  execFileSync('git', ['init', '-q', '--bare', bare], { env: ENV });
  git('init', '-q', '-b', 'dev');
  git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  git('remote', 'add', 'origin', bare);
  const commit = (file, msg, body = msg + Math.random()) => {
    writeFileSync(join(dir, file), body); git('add', '--', file); git('commit', '-q', '-m', msg); return git('rev-parse', 'HEAD');
  };
  commit('base.ts', 'base'); git('push', '-q', 'origin', 'dev');
  const stamp = (sha) => writeFileSync(join(git('rev-parse', '--absolute-git-dir'), 'review-stamp'), sha + '\n');
  const push = (lines, remote = 'origin') => spawnSync('bash', [HOOK, remote, bare], {
    cwd: dir, env: ENV, encoding: 'utf8', input: lines.map((l) => l.join(' ')).join('\n') + '\n',
  });
  return { dir, bare, git, tryGit, commit, stamp, push };
}
const branch = (sha, name = 'feat/x', remoteSha = ZERO) => [`refs/heads/${name}`, sha, `refs/heads/${name}`, remoteSha];

test('code neuf sans tampon : refusé', (t) => {
  const r = repo(t); const sha = r.commit('a.ts', 'feat: a');
  const out = r.push([branch(sha)]);
  assert.equal(out.status, 1); assert.match(out.stderr, /review-feature/);
});
test('tampon sur le commit poussé : accepté', (t) => {
  const r = repo(t); const sha = r.commit('a.ts', 'feat: a'); r.stamp(sha);
  assert.equal(r.push([branch(sha)]).status, 0);
});
test('code ajouté APRÈS le tampon : refusé', (t) => {
  const r = repo(t); r.stamp(r.commit('a.ts', 'feat: a')); const sha = r.commit('b.ts', 'feat: b');
  assert.equal(r.push([branch(sha)]).status, 1);
});
test('doc seule après le tampon, accents compris : accepté', (t) => {
  const r = repo(t); r.stamp(r.commit('a.ts', 'feat: a'));
  r.commit('CHANGELOG.md', 'docs: changelog'); const sha = r.commit('résumé été.md', 'docs: bilan');
  assert.equal(r.push([branch(sha)]).status, 0);
});
test('commit de release sans tampon : accepté', (t) => {
  const r = repo(t); const sha = r.commit('app.json', 'chore(release): v1.3');
  assert.equal(r.push([branch(sha, 'dev')]).status, 0);
});
test('rien de neuf pour le distant, y compris poussé par URL : accepté', (t) => {
  const r = repo(t); const sha = r.git('rev-parse', 'HEAD');
  assert.equal(r.push([branch(sha, 'dev')]).status, 0);
  assert.equal(r.push([branch(sha, 'dev', sha)], r.bare).status, 0);
});
test('branche de suivi absente : le SHA distant fourni par git suffit', (t) => {
  const r = repo(t); const old = r.commit('a.ts', 'feat: a'); r.stamp(old);
  r.git('push', '-q', 'origin', 'dev:feat/x'); r.git('update-ref', '-d', 'refs/remotes/origin/feat/x');
  r.stamp(''); const sha = r.commit('NOTES.md', 'docs: notes');
  assert.equal(r.push([branch(sha, 'feat/x', old)]).status, 0);
});
test('rebase propre ou amend de message après la revue : accepté', (t) => {
  const r = repo(t); r.git('switch', '-q', '-c', 'feat/x');
  r.stamp(r.commit('a.ts', 'feat: a'));
  r.git('switch', '-q', 'dev'); r.commit('other.ts', 'feat: autre'); r.git('push', '-q', 'origin', 'dev');
  r.git('switch', '-q', 'feat/x'); r.git('rebase', '-q', 'dev');
  r.git('commit', '-q', '--amend', '-m', 'feat: a, message revu');
  assert.equal(r.push([branch(r.git('rev-parse', 'HEAD'))]).status, 0);
});
test('merge propre après la revue : accepté ; résolution de conflit non relue : refusée', (t) => {
  const r = repo(t); r.git('switch', '-q', '-c', 'feat/x');
  r.stamp(r.commit('f.ts', 'feat: f', 'feature'));
  r.git('switch', '-q', 'dev'); r.commit('g.ts', 'feat: g'); r.git('push', '-q', 'origin', 'dev');
  r.git('switch', '-q', 'feat/x'); r.git('merge', '-q', '--no-edit', 'dev');
  assert.equal(r.push([branch(r.git('rev-parse', 'HEAD'))]).status, 0);

  r.git('switch', '-q', 'dev'); r.commit('f.ts', 'feat: f côté dev', 'dev'); r.git('push', '-q', 'origin', 'dev');
  r.git('switch', '-q', 'feat/x'); r.tryGit('merge', '-q', 'dev');
  writeFileSync(join(r.dir, 'f.ts'), 'résolution écrite à la main'); r.git('add', '--', 'f.ts'); r.git('commit', '-q', '--no-edit');
  assert.equal(r.push([branch(r.git('rev-parse', 'HEAD'))]).status, 1);
});
test('commit racine (branche orpheline) avec du code : refusé', (t) => {
  const r = repo(t); r.git('switch', '-q', '--orphan', 'feat/orphan'); // index déjà vide
  const sha = r.commit('evil.ts', 'feat: orphelin');
  assert.equal(r.push([branch(sha, 'feat/orphan')]).status, 1);
});
test('tag et suppression de branche : acceptés', (t) => {
  const r = repo(t); const sha = r.commit('a.ts', 'feat: a');
  assert.equal(r.push([['refs/tags/v1.3', sha, 'refs/tags/v1.3', ZERO]]).status, 0);
  assert.equal(r.push([['(delete)', ZERO, 'refs/heads/feat/x', sha]]).status, 0);
});
test('main : push direct et suppression refusés, même avec tampon', (t) => {
  const r = repo(t); const sha = r.commit('a.ts', 'feat: a'); r.stamp(sha);
  const out = r.push([['refs/heads/main', sha, 'refs/heads/main', ZERO]]);
  assert.equal(out.status, 1); assert.match(out.stderr, /main/);
  assert.equal(r.push([['(delete)', ZERO, 'refs/heads/main', sha]]).status, 1);
});
test('bout en bout : vrai git push, hook installé par core.hooksPath', (t) => {
  const r = repo(t); r.git('config', 'core.hooksPath', HOOKS);
  r.git('switch', '-q', '-c', 'feat/x'); const sha = r.commit('a.ts', 'feat: a');
  assert.notEqual(r.tryGit('push', '-q', 'origin', 'feat/x').status, 0);
  r.stamp(sha);
  assert.equal(r.tryGit('push', '-q', 'origin', 'feat/x').status, 0);
});
