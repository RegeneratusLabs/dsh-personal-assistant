#!/usr/bin/env node
/**
 * Update the two live DSH profiles for the 0.2.2-rc.2 upgrade.
 *
 * Why this is a script: the personal profile restates the shipped `standard`
 * agent preset verbatim (SOUL is the prompt opener), and a patch replaces that
 * config wholesale. rc.2 adds `tool-office`, `skill-filesystem.customSkillDirs`
 * and `tool-subagent-control.interrupt:false` to the shipped preset; the old
 * restatement would silently drop them. Deriving the block from the installed
 * rc.2 preset keeps the two in sync and makes the next upgrade a one-liner.
 *
 * What it changes (idempotent, backs up every file it writes):
 *   personal package.json   drop the removed @deepseek-ai/dsh-experimental-agent-team-profile
 *                           bundle row; pin session-search to --version
 *   personal cordis.patch   replace the `- id: preset-standard` block from the
 *                           installed rc.2 preset minus the `persona` row
 *   web package.json        drop the same removed agent-team bundle row
 *   web cordis.patch        drop dead `dsh-status` / `guizang-design` / `media-desk` rows
 *
 * Usage:
 *   node scripts/ops/update-rc2-profiles.mjs --dry-run
 *   node scripts/ops/update-rc2-profiles.mjs --version 0.2.2-rc.2
 *
 * Rollback: restore the `.bak-rc2-<ts>` files printed by the run.
 */

import { copyFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const DSH_PREFIX = '/home/josh/dsh/node';
const DEFAULT_PRESET = path.join(
  DSH_PREFIX,
  'lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml',
);
const REMOVED_BUNDLE = '@deepseek-ai/dsh-experimental-agent-team-profile';
const SESSION_SEARCH = '@deepseek-ai/dsh-experimental-session-search';

function parseArgs(argv) {
  const out = {
    personalHome: path.join(homedir(), '.dsh-personal'),
    webHome: path.join(homedir(), '.dsh'),
    preset: DEFAULT_PRESET,
    version: '0.2.2-rc.2',
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--personal-home') out.personalHome = argv[++i];
    else if (arg === '--web-home') out.webHome = argv[++i];
    else if (arg === '--preset') out.preset = argv[++i];
    else if (arg === '--version') out.version = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: update-rc2-profiles.mjs [--dry-run] [--version V] [--personal-home DIR] [--web-home DIR] [--preset FILE]');
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function read(file) {
  return readFileSync(file, 'utf8');
}

function writeWithBackup(file, text, stamp, dryRun) {
  const mode = statSync(file).mode & 0o777;
  const backup = `${file}.bak-rc2-${stamp}`;
  if (!dryRun) {
    copyFileSync(file, backup);
    writeFileSync(file, text, { mode });
  }
  return { file, backup, mode: mode.toString(8) };
}

/** Build the profile-patch preset block from a shipped `standard.patch.yml`. */
export function buildPresetBlock(presetText) {
  const lines = presetText.split('\n');
  const marker = lines.findIndex((line) => line === '        plugins:');
  if (marker < 0) throw new Error('shipped preset: "        plugins:" marker not found');
  const dedented = [];
  for (const line of lines.slice(marker + 1)) {
    dedented.push(line.startsWith('    ') ? line.slice(4) : line);
  }
  // Drop the `persona` row: personal supplies SOUL via system-prompt + soul loader.
  const kept = [];
  let skip = false;
  for (const line of dedented) {
    if (/^ {6}- id: persona$/.test(line)) {
      skip = true;
      continue;
    }
    if (skip && /^ {6}- id: /.test(line)) skip = false;
    if (!skip) kept.push(line);
  }
  const plugins = kept.join('\n').replace(/\s+$/, '');
  const block = `- id: preset-standard\n  config:\n    id: standard\n    order: 1\n    plugins:\n${plugins}\n`;
  for (const required of ['      - id: agent-instructions', '      - id: tool-office', '      - id: skill-filesystem']) {
    if (!block.includes(required)) throw new Error(`generated preset missing ${required}`);
  }
  if (block.includes('      - id: persona')) throw new Error('generated preset still contains the persona row');
  return block;
}

/** Replace `- id: preset-standard` through the next top-level entry (or EOF). */
export function replacePresetBlock(patchText, block) {
  const lines = patchText.split('\n');
  const start = lines.findIndex((line) => line === '- id: preset-standard');
  if (start < 0) throw new Error('profile patch: "- id: preset-standard" not found');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^- /.test(lines[i])) {
      end = i;
      break;
    }
  }
  const before = lines.slice(0, start);
  const after = lines.slice(end);
  return [...before, ...block.replace(/\n$/, '').split('\n'), ...after].join('\n').replace(/\n*$/, '\n');
}

/** Remove top-level two-line disable blocks for the named row ids. */
export function removeRows(patchText, ids) {
  const lines = patchText.split('\n');
  const out = [];
  let removed = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const id = line.startsWith('- id: ') ? line.slice(6).trim() : '';
    if (ids.includes(id)) {
      // Drop this entry through the next top-level entry (or EOF).
      let j = i + 1;
      while (j < lines.length && !/^- /.test(lines[j])) j += 1;
      i = j - 1;
      removed += 1;
      continue;
    }
    out.push(line);
  }
  return { text: out.join('\n').replace(/\n*$/, '\n'), removed };
}

function updatePackage(pkgPath, version, stamp, dryRun) {
  const pkg = JSON.parse(read(pkgPath));
  const bundles = pkg?.dsh?.profile?.bundles;
  if (!Array.isArray(bundles)) throw new Error(`${pkgPath}: dsh.profile.bundles is not an array`);
  const beforeBundles = bundles.length;
  pkg.dsh.profile.bundles = bundles.filter((name) => name !== REMOVED_BUNDLE);
  const deps = pkg.dependencies ?? {};
  const hadSessionSearch = Object.hasOwn(deps, SESSION_SEARCH);
  if (hadSessionSearch) deps[SESSION_SEARCH] = version;
  const result = writeWithBackup(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, stamp, dryRun);
  return {
    ...result,
    droppedBundles: beforeBundles - pkg.dsh.profile.bundles.length,
    sessionSearch: hadSessionSearch ? version : null,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  const presetText = read(args.preset);
  const block = buildPresetBlock(presetText);
  const personalDir = path.join(args.personalHome, 'profiles/personal');
  const webDir = path.join(args.webHome, 'profiles/web');
  const summary = { version: args.version, dryRun: args.dryRun, files: [] };

  summary.files.push(updatePackage(path.join(personalDir, 'package.json'), args.version, stamp, args.dryRun));

  const personalPatchPath = path.join(personalDir, 'cordis.patch.yml');
  const personalPatch = replacePresetBlock(read(personalPatchPath), block);
  summary.files.push(writeWithBackup(personalPatchPath, personalPatch, stamp, args.dryRun));

  summary.files.push(updatePackage(path.join(webDir, 'package.json'), args.version, stamp, args.dryRun));

  const webPatchPath = path.join(webDir, 'cordis.patch.yml');
  const cleaned = removeRows(read(webPatchPath), ['dsh-status', 'guizang-design', 'media-desk']);
  summary.files.push({ ...writeWithBackup(webPatchPath, cleaned.text, stamp, args.dryRun), removedRows: cleaned.removed });

  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
