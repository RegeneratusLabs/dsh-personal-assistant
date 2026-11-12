#!/usr/bin/env node
// Bilingual documentation checker for this repository.
//
// English `*.md` is the source of truth; a translation lives beside it as `*.zh.md`.
// This script verifies, for every pair:
//   - both files exist and carry the language-switch line,
//   - heading structure (count/order/levels) matches,
//   - every fenced code block is byte-identical,
//   - every relative link/image in the translation resolves to a real file,
//   - the per-section prose hashes in `.i18n.json` still match both sides.
//
// Usage:
//   node scripts/docs/i18n-check.mjs             # check (what CI runs)
//   node scripts/docs/i18n-check.mjs --write     # re-record .i18n.json after syncing both sides
//   node scripts/docs/i18n-check.mjs --coverage  # print the translation coverage table
//
// Exit code 1 on any drift/structure/link error, 0 otherwise. No dependencies.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RECORD_PATH = path.join(ROOT, '.i18n.json');
const LANGUAGES = { zh: { suffix: '.zh.md', label: 'Simplified Chinese (zh-CN)', switchWord: '中文' } };
const SKIP_DIRS = new Set(['.git', 'node_modules', '.cache', 'artifacts', 'design-systems', '.tmp', '.tmp-render', 'plugins']);
const COVERAGE_ROOTS = ['.', 'docs', 'agents', 'research'];

const args = new Set(process.argv.slice(2));
const mode = args.has('--write') ? 'write' : args.has('--coverage') ? 'coverage' : 'check';

const errors = [];
const warnings = [];
const rel = (p) => path.relative(ROOT, p) || '.';
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (st.isFile() && name.endsWith('.md')) out.push(full);
  }
  return out;
}

// Parse a doc into headings, fences and prose lines (outside fences).
function parseDoc(text) {
  const lines = text.split('\n');
  const headings = [];
  const fences = [];
  const prose = []; // { line, text } outside fences
  let inFence = false;
  let fenceInfo = '';
  let block = [];

  for (const line of lines) {
    if (!inFence) {
      const open = /^\s*```(.*)$/.exec(line);
      if (open) {
        inFence = true;
        fenceInfo = open[1].trim();
        block = [];
        continue;
      }
      const h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) headings.push({ level: h[1].length, text: h[2].trim() });
      prose.push({ line, text: line });
    } else if (/^\s*```\s*$/.test(line)) {
      fences.push({ info: fenceInfo, body: block.join('\n') });
      inFence = false;
    } else {
      block.push(line);
    }
  }
  if (inFence) errors.push(`${rel(curFile)}: unterminated code fence`);
  return { headings, fences, prose };
}

let curFile = '';

function slug(text, seen) {
  const base = text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n === 0 ? base : `${base}-${n + 1}`;
}

// Per-section prose hashes, in document order: [preamble, ...H2 sections]. Both sides are compared by
// position (the Chinese heading text differs, so translated slugs cannot be used as keys).
function sectionHashes(parsed) {
  const firstH2 = parsed.prose.findIndex(({ text }) => /^##\s+/.test(text));
  const switchLine = /^\s*(\[English\]\([^)]+\)\s*\|\s*中文|English\s*\|\s*\[中文\]\([^)]+\))\s*$/;
  const h1Line = /^#\s+/;

  const collect = (slice) => {
    const kept = [];
    for (const { text } of slice) {
      if (switchLine.test(text) || h1Line.test(text)) continue;
      const t = text.replace(/\s+$/, '');
      if (t.length === 0) continue;
      kept.push(t);
    }
    return kept.join('\n');
  };

  const hashes = [];
  const preambleEnd = firstH2 === -1 ? parsed.prose.length : firstH2;
  hashes.push(sha(collect(parsed.prose.slice(0, preambleEnd))));

  if (firstH2 !== -1) {
    let buffer = [];
    for (let i = firstH2 + 1; i < parsed.prose.length; i += 1) {
      const text = parsed.prose[i].text;
      if (/^##\s+/.test(text)) {
        hashes.push(sha(collect(buffer)));
        buffer = [];
      } else {
        buffer.push(parsed.prose[i]);
      }
    }
    hashes.push(sha(collect(buffer)));
  }
  return hashes;
}

// Stable record keys: "(preamble)" + slug of each English H2 heading.
function sectionKeys(parsed) {
  const keys = ['(preamble)'];
  const seen = new Map();
  for (const h of parsed.headings) {
    if (h.level === 2) keys.push(slug(h.text, seen));
  }
  return keys;
}

function checkSwitchLines(basePath, zhPath, baseText, zhText) {
  const baseName = path.basename(basePath);
  const zhName = path.basename(zhPath);
  const enLine = `English | [中文](${zhName})`;
  const zhLine = `[English](${baseName}) | 中文`;
  const head = (text) => text.split('\n').slice(0, 12);
  if (!head(baseText).some((l) => l.trim() === enLine)) {
    errors.push(`${rel(basePath)}: missing language-switch line (expected "${enLine}" near the top)`);
  }
  if (!head(zhText).some((l) => l.trim() === zhLine)) {
    errors.push(`${rel(zhPath)}: missing language-switch line (expected "${zhLine}" near the top)`);
  }
}

function checkHeadings(basePath, zhPath, en, zh) {
  if (en.headings.length !== zh.headings.length) {
    errors.push(`${rel(zhPath)}: heading count ${zh.headings.length} != English ${en.headings.length}`);
    return;
  }
  for (let i = 0; i < en.headings.length; i += 1) {
    if (en.headings[i].level !== zh.headings[i].level) {
      errors.push(
        `${rel(zhPath)}: heading #${i + 1} level ${zh.headings[i].level} != English level ${en.headings[i].level} ("${en.headings[i].text}")`,
      );
      return;
    }
  }
}

function checkFences(basePath, zhPath, en, zh) {
  if (en.fences.length !== zh.fences.length) {
    errors.push(`${rel(zhPath)}: ${zh.fences.length} code fences != English ${en.fences.length}`);
    return;
  }
  for (let i = 0; i < en.fences.length; i += 1) {
    if (en.fences[i].info !== zh.fences[i].info) {
      errors.push(`${rel(zhPath)}: fence #${i + 1} info "${zh.fences[i].info}" != English "${en.fences[i].info}"`);
    } else if (en.fences[i].body !== zh.fences[i].body) {
      errors.push(`${rel(zhPath)}: fence #${i + 1} (${en.fences[i].info || 'plain'}) differs from English — code blocks must be byte-identical`);
    }
  }
}

const LINK_RE = /!?\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;

function checkLinks(zhPath, zhText) {
  const dir = path.dirname(zhPath);
  // Prose only (fences excluded by the caller), and never the language-switch line itself.
  const lines = zhText
    .split('\n')
    .filter((l) => !/^\s*\[English\]\([^)]+\)\s*\|\s*中文\s*$/.test(l))
    // Inline code is literal text, not a link (e.g. the switch-line examples in docs/i18n.md).
    .map((l) => l.replace(/`[^`]*`/g, ''));
  for (const line of lines) {
    for (const m of line.matchAll(LINK_RE)) {
      const target = m[1];
      if (/^(https?:|mailto:|#|\/)/.test(target)) continue;
      const clean = target.split('#')[0];
      if (!clean) continue;
      const resolved = path.resolve(dir, clean);
      if (!existsSync(resolved)) {
        errors.push(`${rel(zhPath)}: broken relative link "${target}"`);
      } else if (
        clean.endsWith('.md') &&
        !clean.endsWith('.zh.md') &&
        existsSync(resolved.replace(/\.md$/, '.zh.md')) &&
        !line.includes(clean.replace(/\.md$/, '.zh.md'))
      ) {
        warnings.push(`${rel(zhPath)}: links to English "${target}" though a Chinese sibling exists`);
      }
    }
  }
}

function findPairs() {
  const files = walk(ROOT);
  const pairs = [];
  for (const file of files) {
    if (!file.endsWith('.zh.md')) continue;
    const base = file.slice(0, -'.zh.md'.length) + '.md';
    if (!existsSync(base)) {
      errors.push(`${rel(file)}: translation without English source ${rel(base)}`);
      continue;
    }
    pairs.push({ base, zh: file });
  }
  return pairs.sort((a, b) => a.base.localeCompare(b.base));
}

function readRecord() {
  if (!existsSync(RECORD_PATH)) return { version: 1, pairs: {} };
  try {
    const parsed = JSON.parse(readFileSync(RECORD_PATH, 'utf8'));
    if (!parsed.pairs || typeof parsed.pairs !== 'object') throw new Error('missing "pairs"');
    return parsed;
  } catch (e) {
    errors.push(`.i18n.json: unreadable (${e.message}) — run with --write`);
    return { version: 1, pairs: {} };
  }
}

function coverage() {
  const rows = [];
  const seen = new Set();
  for (const rootRel of COVERAGE_ROOTS) {
    const root = path.join(ROOT, rootRel);
    if (!existsSync(root)) continue;
    let files;
    if (rootRel === '.') {
      // Repository root: top-level docs only; subtree docs are covered by their own roots.
      files = readdirSync(root).filter((n) => n.endsWith('.md')).map((n) => path.join(root, n));
    } else {
      files = walk(root);
    }
    for (const f of files) {
      if (f.endsWith('.zh.md')) continue;
      const r = rel(f);
      if (seen.has(r)) continue;
      seen.add(r);
      const zh = f.replace(/\.md$/, '.zh.md');
      rows.push({ doc: r, translated: existsSync(zh) });
    }
  }
  rows.sort((a, b) => a.doc.localeCompare(b.doc));
  const done = rows.filter((r) => r.translated);
  console.log('| Doc | Chinese |');
  console.log('|---|---|');
  for (const r of rows) console.log(`| \`${r.doc}\` | ${r.translated ? `[\`${r.doc.replace(/\.md$/, '.zh.md')}\`](${r.doc.replace(/\.md$/, '.zh.md')})` : '— (English only)'} |`);
  console.log(`\n${done.length}/${rows.length} docs translated (zh-CN).`);
  return 0;
}

function main() {
  const pairs = findPairs();
  if (mode === 'coverage') return coverage();

  const record = readRecord();
  const nextRecord = { version: 1, generatedBy: 'scripts/docs/i18n-check.mjs --write', languages: { zh: 'Simplified Chinese (zh-CN)' }, pairs: {} };

  for (const { base, zh } of pairs) {
    curFile = zh;
    const baseText = readFileSync(base, 'utf8');
    const zhText = readFileSync(zh, 'utf8');
    checkSwitchLines(base, zh, baseText, zhText);
    const en = parseDoc(baseText);
    const zhd = parseDoc(zhText);
    checkHeadings(base, zh, en, zhd);
    checkFences(base, zh, en, zhd);
    checkLinks(zh, zhd.prose.map((p) => p.text).join('\n'));

    const enHashes = sectionHashes(en);
    const zhHashes = sectionHashes(zhd);
    if (enHashes.length !== zhHashes.length) {
      errors.push(`${rel(zh)}: ${zhHashes.length - 1} H2 section(s) != English ${enHashes.length - 1}`);
      continue;
    }
    const keys = sectionKeys(en);
    const entry = { zh: path.basename(zh), sections: {} };
    for (let i = 0; i < keys.length; i += 1) {
      entry.sections[keys[i]] = { en: enHashes[i], zh: zhHashes[i] };
    }
    nextRecord.pairs[rel(base)] = entry;

    if (mode === 'check') {
      const prev = record.pairs[rel(base)];
      if (!prev) {
        errors.push(`${rel(base)}: no pairing record — run "node scripts/docs/i18n-check.mjs --write"`);
        continue;
      }
      for (const [key, { en: h, zh: zhHash }] of Object.entries(entry.sections)) {
        const saved = prev.sections?.[key];
        if (!saved) {
          errors.push(`${rel(base)}: section "${key}" is not in .i18n.json — run --write after translating it`);
        } else if (saved.en !== h || saved.zh !== zhHash) {
          errors.push(`${rel(base)}: section "${key}" changed on one side — sync both sides, then run --write`);
        }
      }
      for (const key of Object.keys(prev.sections ?? {})) {
        if (!(key in entry.sections)) errors.push(`${rel(base)}: recorded section "${key}" no longer exists — run --write`);
      }
    }
  }

  const recorded = Object.keys(record.pairs);
  for (const base of recorded) {
    if (!(base in nextRecord.pairs)) errors.push(`.i18n.json: recorded pair "${base}" has no translation on disk — run --write`);
  }

  if (mode === 'write') {
    if (errors.length) {
      console.error('Refusing to re-record: fix the errors below first.\n');
      for (const e of errors) console.error(`  ✗ ${e}`);
      process.exit(1);
    }
    writeFileSync(RECORD_PATH, JSON.stringify(nextRecord, null, 2) + '\n');
    console.log(`.i18n.json: recorded ${pairs.length} pair(s), ${Object.values(nextRecord.pairs).reduce((n, p) => n + Object.keys(p.sections).length, 0)} section(s)`);
  } else {
    for (const e of errors) console.error(`✗ ${e}`);
    for (const w of warnings) console.warn(`! ${w}`);
    if (errors.length) {
      console.error(`\ni18n check FAILED: ${errors.length} error(s), ${warnings.length} warning(s).`);
      process.exit(1);
    }
    console.log(`i18n check OK: ${pairs.length} pair(s), ${warnings.length} warning(s).`);
  }
}

main();
