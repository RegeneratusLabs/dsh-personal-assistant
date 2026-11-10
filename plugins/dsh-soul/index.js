/**
 * Identity loader: inject a file-based persona (SOUL.md) into the system prompt.
 *
 * The deployment persona is a deployment *content* decision, so it lives in a
 * file the human edits rather than in a profile patch string: `$DSH_HOME/soul/
 * SOUL.md` (override with the row `config.file` or `DSH_SOUL_FILE`). The file's
 * text becomes one prompt section at the deployment-persona order, so it lands
 * in the same slot as `system-prompt`'s `personaPrefix` and ahead of all
 * first-party guidance.
 *
 * Rules that keep this safe:
 *
 *  - the file is *data*, read once at apply time; the plugin never writes,
 *    never touches the network, spawns nothing, and reads no credentials;
 *  - a missing, unreadable or empty file is a no-op (one warning), never a
 *    boot failure — identity is important but not worth an outage;
 *  - the section is registered with `interpolate: false`, because SOUL prose
 *    may legitimately contain `{{…}}` that the prompt renderer would reject;
 *  - the text is capped (`maxBytes`, 16 KiB default) so a runaway file cannot
 *    inflate every request's prompt.
 *
 * Section naming: `dsh-system-prompt` itself registers the global
 * `deployment:persona-prefix` section when its service is constructed, so a
 * plugin registering that exact name would collide (duplicate section → throw
 * at boot). We therefore use a unique name at the same centrally allocated
 * order (`getSectionOrder('DEPLOYMENT_PERSONA_PREFIX')`, 0). Existing
 * `personaPrefix` config keeps working and renders first; an empty
 * `personaPrefix` (the base default) leaves SOUL as the persona opener.
 */
import { readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** This plugin's Loader row id / Cordis plugin name. */
export const name = 'dsh-soul';
/** `systemPrompt` is the one service this plugin needs; it registers no tools. */
export const inject = ['systemPrompt'];

/** Default cap for the SOUL text; a persona is small, prompts repeat per step. */
const DEFAULT_MAX_BYTES = 16 * 1024;
/** Hard ceiling for a configured cap: beyond this a "persona" is a prompt bomb. */
const MAX_BYTES_LIMIT = 256 * 1024;
/** Unique section name at the deployment-persona order (see module doc). */
const SECTION_NAME = 'deployment:soul';
/** Central allocation name for the deployment persona prefix (order 0). */
const PERSONA_ORDER = 'DEPLOYMENT_PERSONA_PREFIX';
/** Warnings are once per process per cause, not once per prompt step. */
const warned = new Set();

/** Emit one warning per key; the Host log (journald) is the local sink. */
function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[dsh-soul] ${message}`);
}

/** This process's DSH home; real units set `DSH_HOME`, local runs may not. */
function dshHome() {
  return process.env.DSH_HOME ? path.resolve(process.env.DSH_HOME) : path.join(os.homedir(), '.dsh-personal');
}

/**
 * A non-empty, trimmed string setting, or `undefined`.
 * @param value - candidate config/env value.
 * @returns the setting, or `undefined` when absent/blank.
 */
function setting(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolve which file to read: row `config.file`, else `$DSH_SOUL_FILE`, else
 * `$DSH_HOME/soul/SOUL.md`. `~/` expands; relative paths resolve under
 * `$DSH_HOME` so the loader never depends on the process working directory.
 * @param config - the Loader row config object.
 * @returns the absolute SOUL file path.
 */
function resolveFile(config) {
  const raw = setting(config && config.file) ?? setting(process.env.DSH_SOUL_FILE);
  if (raw === undefined) return path.join(dshHome(), 'soul', 'SOUL.md');
  const expanded = raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw;
  return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(dshHome(), expanded);
}

/**
 * A positive integer byte cap within {@link MAX_BYTES_LIMIT}, or the default.
 * @param value - configured `maxBytes`.
 * @returns the effective cap.
 */
function byteCap(value) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) return DEFAULT_MAX_BYTES;
  return Math.min(number, MAX_BYTES_LIMIT);
}

/**
 * Read the SOUL file, tolerating absence and cutting only on a UTF-8 boundary.
 *
 * Exported for the test harness (the Loader itself only uses {@link apply}).
 * @param file - absolute path to read.
 * @param maxBytes - byte cap; longer content is truncated.
 * @returns `{ missing: true }`, `{ error: string }`, or the loaded text plus
 *   the original byte length, truncation flag and first-read details.
 */
export function loadSoulFile(file, maxBytes) {
  let stat;
  try {
    stat = statSync(file);
  } catch (error) {
    if (error && error.code === 'ENOENT') return { missing: true };
    return { error: String((error && error.message) || error) };
  }
  if (!stat.isFile()) return { error: 'not a regular file' };
  let buffer;
  try {
    buffer = readFileSync(file);
  } catch (error) {
    return { error: String((error && error.message) || error) };
  }
  const originalBytes = buffer.length;
  const truncated = originalBytes > maxBytes;
  let text;
  if (truncated) {
    // Walk back off a UTF-8 continuation byte so the cut never yields U+FFFD.
    let cut = maxBytes;
    while (cut > 0 && (buffer[cut] & 0xc0) === 0x80) cut -= 1;
    text = buffer.subarray(0, cut).toString('utf8');
  } else {
    text = buffer.toString('utf8');
  }
  return { text, originalBytes, truncated };
}

/**
 * Register the SOUL persona section, or warn once and register nothing.
 * @param ctx - Cordis context carrying the `systemPrompt` service.
 * @param config - the Loader row config (`file`, `maxBytes`).
 */
export function apply(ctx, config) {
  const file = resolveFile(config);
  const maxBytes = byteCap(config && config.maxBytes);
  const loaded = loadSoulFile(file, maxBytes);

  if (loaded.missing) {
    warnOnce(`missing:${file}`, `SOUL file not found at ${file}; no persona section registered (not an error)`);
    return;
  }
  if (loaded.error) {
    warnOnce(`error:${file}`, `cannot read SOUL file ${file}: ${loaded.error}; no persona section registered`);
    return;
  }
  if (loaded.truncated) {
    warnOnce(
      `truncated:${file}:${maxBytes}`,
      `SOUL file ${file} is ${loaded.originalBytes} bytes, above the ${maxBytes}-byte cap; using the first ${maxBytes} bytes`,
    );
  }
  const text = loaded.text.trim();
  if (text.length === 0) {
    warnOnce(`empty:${file}`, `SOUL file ${file} is empty; no persona section registered`);
    return;
  }

  const allocated = typeof ctx.systemPrompt.getSectionOrder === 'function'
    ? ctx.systemPrompt.getSectionOrder(PERSONA_ORDER)
    : undefined;
  const order = Number.isFinite(allocated) ? allocated : 0;

  // Owned by this plugin's fiber, so a reload/uninstall removes the section.
  ctx.effect(() => {
    const dispose = ctx.systemPrompt.section({
      name: SECTION_NAME,
      order,
      text,
      interpolate: false,
    });
    return () => {
      void dispose();
    };
  }, 'dsh-soul: SOUL persona section');

  // Diagnostics go to stderr: in one-shot headless runs stdout is the answer
  // channel, and in the Web Host both streams reach journald.
  console.error(`[dsh-soul] loaded SOUL persona from ${file} (${Buffer.byteLength(text)} bytes, order ${order})`);
}
