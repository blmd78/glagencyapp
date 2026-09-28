#!/usr/bin/env node
// Contrôle de la carte : chaque dossier de feature du code a sa ligne dans
// docs/CARTE.md, et chaque dossier cité par la carte existe encore.
// Racines : scripts/carte.config.json — motifs de dossiers, `*` = un niveau.
// Une racine absente de la branche courante est ignorée, lignes comprises.
// Les descriptions ne sont pas contrôlées : seule la structure l'est.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const IGNORES = new Set(['node_modules']);

/** Dossiers réels correspondant au motif, relatifs à `root`, triés. */
export function expand(root, pattern) {
  let current = [''];
  for (const segment of pattern.split('/').filter(Boolean)) {
    const next = [];
    for (const base of current) {
      if (segment === '*') {
        const dir = join(root, base);
        if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory() && !entry.name.startsWith('.') && !IGNORES.has(entry.name)) {
            next.push(base ? `${base}/${entry.name}` : entry.name);
          }
        }
      } else {
        const candidate = base ? `${base}/${segment}` : segment;
        if (existsSync(join(root, candidate))) next.push(candidate);
      }
    }
    current = next;
  }
  return current.filter(Boolean).sort();
}

/** Ce qui précède le premier `*` : la racine dont l'absence fait ignorer le motif. */
function staticPrefix(pattern) {
  const i = pattern.indexOf('*');
  return (i === -1 ? pattern : pattern.slice(0, i)).replace(/\/+$/, '');
}

function toRegex(pattern) {
  const body = pattern
    .split('/')
    .filter(Boolean)
    .map((s) => (s === '*' ? '[^/]+' : s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${body}$`);
}

/** Tout `code` entre backticks, sans `./` initial ni `/` final. */
export function pathsInCarte(markdown) {
  const out = new Set();
  for (const m of markdown.matchAll(/`([^`\s]+)`/g)) out.add(m[1].replace(/^\.\//, '').replace(/\/+$/, ''));
  return out;
}

export function checkCarte({ root, patterns, carte }) {
  const cited = pathsInCarte(carte);
  const missing = new Set();
  const stale = new Set();
  for (const pattern of patterns) {
    const prefix = staticPrefix(pattern);
    if (prefix && !existsSync(join(root, prefix))) continue;
    const re = toRegex(pattern);
    const real = new Set(expand(root, pattern));
    for (const dir of real) if (!cited.has(dir)) missing.add(dir);
    for (const path of cited) if (re.test(path) && !real.has(path)) stale.add(path);
  }
  return { missing: [...missing].sort(), stale: [...stale].sort() };
}

function main() {
  const root = process.cwd();
  const { racines } = JSON.parse(readFileSync(join(root, 'scripts/carte.config.json'), 'utf8'));
  const carte = readFileSync(join(root, 'docs/CARTE.md'), 'utf8');
  const { missing, stale } = checkCarte({ root, patterns: racines, carte });
  for (const d of missing) console.error(`✗ absent de docs/CARTE.md : ${d}`);
  for (const p of stale) console.error(`✗ cité dans docs/CARTE.md mais introuvable : ${p}`);
  if (missing.length || stale.length) {
    console.error(`\nCarte désynchronisée : ${missing.length} manquant(s), ${stale.length} périmé(s) — mettre docs/CARTE.md à jour.`);
    process.exit(1);
  }
  console.log(`✓ carte à jour (${racines.length} racine(s))`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
