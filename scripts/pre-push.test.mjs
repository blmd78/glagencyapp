// Tests du hook pre-push : `node --test scripts/*.test.mjs`.
// Chaque cas monte un dépôt temporaire avec un « origin » nu, puis appelle le hook
// comme git le fait : `pre-push <remote> <url>`, lignes « local_ref local_sha remote_ref remote_sha » sur stdin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve(import.meta.dirname, 'hooks/pre-push');
const ZERO = '0'.repeat(40);

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'pre-push-'));
  const bare = mkdtempSync(join(tmpdir(), 'pre-push-origin-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
  execFileSync('git', ['init', '-q', '--bare', bare]);
  git('init', '-q', '-b', 'dev');
  git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  git('remote', 'add', 'origin', bare);
  const commit = (file, msg) => { writeFileSync(join(dir, file), msg + Math.random()); git('add', '--', file); git('commit', '-q', '-m', msg); return git('rev-parse', 'HEAD'); };
  commit('base.ts', 'base'); git('push', '-q', '--no-verify', 'origin', 'dev');
  const stamp = (sha) => writeFileSync(join(git('rev-parse', '--absolute-git-dir'), 'review-stamp'), sha + '\n');
  const push = (lines) => spawnSync('bash', [HOOK, 'origin', 'url'], { cwd: dir, input: lines.map((l) => l.join(' ')).join('\n') + '\n', encoding: 'utf8' });
  return { git, commit, stamp, push };
}
const branch = (sha, name = 'feat/x') => [`refs/heads/${name}`, sha, `refs/heads/${name}`, ZERO];

test('code neuf sans tampon : refusé', () => {
  const r = repo(); const sha = r.commit('a.ts', 'feat: a');
  const out = r.push([branch(sha)]);
  assert.equal(out.status, 1); assert.match(out.stderr, /review-feature/);
});
test('tampon sur le commit poussé : accepté', () => {
  const r = repo(); const sha = r.commit('a.ts', 'feat: a'); r.stamp(sha);
  assert.equal(r.push([branch(sha)]).status, 0);
});
test('code ajouté APRÈS le tampon : refusé', () => {
  const r = repo(); r.stamp(r.commit('a.ts', 'feat: a')); const sha = r.commit('b.ts', 'feat: b');
  assert.equal(r.push([branch(sha)]).status, 1);
});
test('doc seule après le tampon (changelog, carte) : accepté', () => {
  const r = repo(); r.stamp(r.commit('a.ts', 'feat: a')); const sha = r.commit('CHANGELOG.md', 'docs: changelog');
  assert.equal(r.push([branch(sha)]).status, 0);
});
test('commit de release sans tampon : accepté', () => {
  const r = repo(); const sha = r.commit('app.json', 'chore(release): v1.3');
  assert.equal(r.push([branch(sha, 'dev')]).status, 0);
});
test('rien de neuf pour le distant : accepté', () => {
  const r = repo(); const sha = r.git('rev-parse', 'HEAD');
  assert.equal(r.push([branch(sha, 'dev')]).status, 0);
});
test('tag et suppression de branche : acceptés', () => {
  const r = repo(); const sha = r.commit('a.ts', 'feat: a');
  assert.equal(r.push([['refs/tags/v1.3', sha, 'refs/tags/v1.3', ZERO]]).status, 0);
  assert.equal(r.push([['(delete)', ZERO, 'refs/heads/feat/x', sha]]).status, 0);
});
test('push direct sur main : refusé, même avec tampon', () => {
  const r = repo(); const sha = r.commit('a.ts', 'feat: a'); r.stamp(sha);
  const out = r.push([['refs/heads/main', sha, 'refs/heads/main', ZERO]]);
  assert.equal(out.status, 1); assert.match(out.stderr, /main/);
});
