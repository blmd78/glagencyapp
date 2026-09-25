#!/usr/bin/env node
// Release — la procédure complète est dans la doc de déploiement du repo.
//   prepare : avant la mise en prod — version suivante, « Non publié » publié, contrôle de la carte, commit.
//   tag     : après — tag annoté de la version publiée la plus haute. Le push du tag est un geste à part.
// Web : CHANGELOG.md, tags vX.Y[.Z], `tag` sur main uniquement.
// Mobile (--mobile) : apps/app/CHANGELOG.md, version de apps/app/app.json, tags mobile-vX.Y.Z.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TARGETS = {
  web: { prefix: 'v', changelog: 'CHANGELOG.md', appJson: null, alwaysPatch: false },
  mobile: { prefix: 'mobile-v', changelog: 'apps/app/CHANGELOG.md', appJson: 'apps/app/app.json', alwaysPatch: true },
};
const UNRELEASED = '## Non publié';

export function parseVersion(text) {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(text ?? '');
  return m ? { major: +m[1], minor: +m[2], patch: m[3] ? +m[3] : 0 } : null;
}

function compare(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export function format(v, alwaysPatch) {
  return v.patch || alwaysPatch ? `${v.major}.${v.minor}.${v.patch}` : `${v.major}.${v.minor}`;
}

/** Plus haute version parmi les tags `${prefix}X.Y[.Z]` ; tout autre tag est ignoré. */
export function lastVersion(tags, prefix) {
  let best = null;
  for (const tag of tags) {
    if (!tag.startsWith(prefix)) continue;
    const v = parseVersion(tag.slice(prefix.length));
    if (v && (!best || compare(v, best) > 0)) best = v;
  }
  return best;
}

export function bump(v, kind) {
  if (kind === 'major') return { major: v.major + 1, minor: 0, patch: 0 };
  if (kind === 'patch') return { ...v, patch: v.patch + 1 };
  return { major: v.major, minor: v.minor + 1, patch: 0 };
}

/** Publie « Non publié » sous `## [version] — date` et rouvre une section vide. */
export function cutChangelog(md, version, date) {
  const start = md.indexOf(UNRELEASED);
  if (start === -1) throw new Error(`section « ${UNRELEASED} » introuvable`);
  const after = start + UNRELEASED.length;
  const next = md.indexOf('\n## ', after);
  const body = md.slice(after, next === -1 ? md.length : next);
  if (!/^\s*[-*] \S/m.test(body)) throw new Error('« Non publié » est vide : rien à publier');
  return `${md.slice(0, start)}${UNRELEASED}\n\n## [${version}] — ${date}${body}${next === -1 ? '' : md.slice(next)}`;
}

/** La section publiée la plus haute. */
export function topRelease(md) {
  const m = /^## \[([^\]]+)\] — (\d{4}-\d{2}-\d{2})$/m.exec(md);
  if (!m) throw new Error('aucune version publiée dans le changelog');
  const start = m.index + m[0].length;
  const next = md.indexOf('\n## ', start);
  return { version: m[1], date: m[2], notes: md.slice(start, next === -1 ? md.length : next).trim() };
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readApp(path) {
  const app = JSON.parse(readFileSync(path, 'utf8'));
  return { app, holder: app.expo ?? app };
}

/** Section publiée la plus haute dont le commit `chore(release)` existe mais pas le tag, sinon null. */
function preparedUntagged(t) {
  let top;
  try {
    top = topRelease(readFileSync(t.changelog, 'utf8'));
  } catch {
    return null; // pas de changelog ou aucune section publiée : la suite le signale
  }
  const name = `${t.prefix}${top.version}`;
  if (git('tag', '--list', name)) return null;
  const subject = `chore(release): ${name}`;
  const pattern = `^${subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
  return git('log', '--format=%s', '-E', `--grep=${pattern}`).split('\n').includes(subject) ? name : null;
}

function prepare(target, kind) {
  const t = TARGETS[target];
  if (git('status', '--porcelain')) fail('arbre de travail sale : commiter ou ranger avant la release');
  let base = lastVersion(git('tag', '--list').split('\n'), t.prefix);
  if (t.appJson) {
    const declared = parseVersion(readApp(t.appJson).holder.version);
    if (declared && (!base || compare(declared, base) > 0)) base = declared;
  }
  if (!base) fail(`aucun tag ${t.prefix}X.Y : poser la version de départ (cf. doc de déploiement)`);
  const version = format(bump(base, kind), t.alwaysPatch);

  const pending = preparedUntagged(t);
  if (pending) {
    const tagCmd = `pnpm release:tag${target === 'mobile' ? ' --mobile' : ''}`;
    fail(`${pending} préparée mais pas encore taguée : ajouter les lignes à sa section, ou taguer d'abord (${tagCmd})`);
  }

  if (existsSync('scripts/check-carte.mjs')) {
    const r = spawnSync('node', ['scripts/check-carte.mjs'], { stdio: 'inherit' });
    if (r.status !== 0) fail('carte désynchronisée : release refusée');
  }

  let changelog;
  try {
    changelog = cutChangelog(readFileSync(t.changelog, 'utf8'), version, today());
  } catch (e) {
    fail(e.message);
  }
  writeFileSync(t.changelog, changelog);
  const files = [t.changelog];
  if (t.appJson) {
    const { app, holder } = readApp(t.appJson);
    holder.version = version;
    writeFileSync(t.appJson, `${JSON.stringify(app, null, 2)}\n`);
    files.push(t.appJson);
  }
  git('add', '--', ...files);
  git('commit', '-m', `chore(release): ${t.prefix}${version}`);
  console.log(`✓ ${t.prefix}${version} préparée. Suite : la mise en prod, puis \`pnpm release:tag${target === 'mobile' ? ' --mobile' : ''}\`.`);
}

function tag(target) {
  const t = TARGETS[target];
  if (target === 'web') {
    const branch = git('branch', '--show-current');
    if (branch !== 'main') fail(`release:tag se lance sur main (branche actuelle : ${branch || 'HEAD détachée'})`);
  }
  let release;
  try {
    release = topRelease(readFileSync(t.changelog, 'utf8'));
  } catch (e) {
    fail(e.message);
  }
  const name = `${t.prefix}${release.version}`;
  if (git('tag', '--list', name)) fail(`le tag ${name} existe déjà`);
  git('tag', '-a', name, '-m', `${name}\n\n${release.notes}`);
  console.log(`✓ tag ${name} posé. Le pousser (sur go) : git push origin ${name}`);
}

function main() {
  const [command, ...flags] = process.argv.slice(2);
  const target = flags.includes('--mobile') ? 'mobile' : 'web';
  const kind = flags.includes('--major') ? 'major' : flags.includes('--patch') ? 'patch' : 'minor';
  if (target === 'mobile' && !existsSync(TARGETS.mobile.appJson)) fail("pas d'app mobile dans ce repo (apps/app/app.json)");
  if (command === 'prepare') prepare(target, kind);
  else if (command === 'tag') tag(target);
  else fail('usage : node scripts/release.mjs prepare|tag [--mobile] [--patch|--major]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
