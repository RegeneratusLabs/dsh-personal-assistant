/**
 * dsh-memory-personal — a personal-agent memory layer over Hindsight.
 *
 * WHY THIS EXISTS
 * `@vectorize-io/hindsight-coding-agents` is a *coding-agent* integration: per-repo
 * banks, git-history ingest, knowledge pages about a codebase, and a ~12 KB
 * tool-usage manual injected on the first prompt (which then rides in every
 * request). Measured on this host: 3,175 tokens/step, ~75% of it the manual, for a
 * question that never touched a repository. A personal assistant has no repo, no
 * git history and no codebase pages — so the manual is pure overhead and the
 * knowledge-page tier stays empty.
 *
 * What the field (Hermes / OpenClaw / Letta) actually converged on is three tiers:
 *
 *   1. a SMALL always-in-prompt curated block (~1-1.5k tokens, inspectable,
 *      agent-editable, hard character budgets) — this module;
 *   2. an UNBOUNDED on-demand search tier with no LLM cost — session search,
 *      already installed as @deepseek-ai/dsh-experimental-session-search;
 *   3. an OPTIONAL semantic tier — Hindsight itself, reached here as three
 *      ordinary tools instead of an injected manual.
 *
 * So this plugin is deliberately small: it owns tier 1 (a bounded profile file)
 * and exposes tier 3 (retain / recall / forget over the Hindsight REST API). It
 * injects a short profile section plus three tool schemas, and nothing else. It
 * makes no LLM calls of its own and never writes outside $DSH_HOME/memory.
 *
 * DESIGN RULES
 *  - Bounded: per-track character budgets, enforced BEFORE a write, with the
 *    overflow error carrying the current entries and the exact number of
 *    characters to free so the model can consolidate in one batch (the Hermes
 *    mechanism — limits force curation instead of silent truncation).
 *  - Cache-safe: one static section rendered from a file, not a per-turn dynamic
 *    block. The text only changes when the model edits it.
 *  - Fail-open: Hindsight down/unreachable degrades recall to an explanatory
 *    error; it never blocks a turn and never breaks boot.
 *  - No deps: node builtins + global fetch only, so the bundle resolves from any
 *    profile without a package install.
 *
 * @module @local/dsh-memory-personal
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** This plugin's Loader row id / Cordis plugin name. */
export const name = 'dsh-memory-personal';

/** The two services this plugin needs: the prompt registry and the tool registry. */
export const inject = ['systemPrompt', 'tools'];

/** Prompt section id; unique so a reload replaces rather than duplicates it. */
const SECTION_NAME = 'memory:personal-profile';

/** Defaults; every value is overridable from the Loader row config. */
const DEFAULTS = {
  userBudget: 2200,
  agentBudget: 4000,
  timeoutMs: 4000,
  recallMaxTokens: 800,
};

/** Hindsight fact kinds this plugin writes. */
const TARGETS = ['user', 'agent', 'fact'];

/** Warnings are once per process per cause (the Host log is the local sink). */
const warned = new Set();

/**
 * Emit one warning per key. stderr, because in one-shot headless runs stdout is
 * the answer channel.
 * @param key - dedupe key.
 * @param message - text to log once.
 */
function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[dsh-memory-personal] ${message}`);
}

/** This process's DSH home; real units set `DSH_HOME`, local runs may not. */
function dshHome() {
  return process.env.DSH_HOME ? path.resolve(process.env.DSH_HOME) : path.join(os.homedir(), '.dsh-personal');
}

/**
 * A non-empty trimmed string, or undefined.
 * @param value - candidate config/env value.
 * @returns the setting, or undefined when absent/blank.
 */
function setting(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * A positive integer within a ceiling, else the fallback.
 * @param value - configured value.
 * @param fallback - default when unusable.
 * @param ceiling - hard upper bound.
 * @returns the effective integer.
 */
function positiveInt(value, fallback, ceiling) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) return fallback;
  return Math.min(number, ceiling);
}

/**
 * Resolve the profile file: row `config.profilePath`, else
 * `$DSH_MEMORY_PROFILE`, else `$DSH_HOME/memory/profile.json`. `~/` expands and
 * relative paths resolve under `$DSH_HOME`, so the loader never depends on cwd.
 * @param config - Loader row config.
 * @returns absolute profile path.
 */
function resolveProfilePath(config) {
  const raw = setting(config && config.profilePath) ?? setting(process.env.DSH_MEMORY_PROFILE);
  if (raw === undefined) return path.join(dshHome(), 'memory', 'profile.json');
  const expanded = raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw;
  return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(dshHome(), expanded);
}

/** An empty profile: both curated tracks present, so callers never special-case. */
function emptyProfile() {
  return { user: [], agent: [] };
}

/**
 * Read the profile file, tolerating absence and malformed content.
 * @param file - absolute path.
 * @returns the profile (empty when missing/unreadable) plus a status.
 */
export function readProfile(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return { profile: emptyProfile(), missing: true };
    return { profile: emptyProfile(), error: String((error && error.message) || error) };
  }
  try {
    const parsed = JSON.parse(raw);
    const profile = emptyProfile();
    for (const track of ['user', 'agent']) {
      const list = Array.isArray(parsed && parsed[track]) ? parsed[track] : [];
      profile[track] = list.filter((entry) => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim());
    }
    return { profile };
  } catch (error) {
    return { profile: emptyProfile(), error: `not valid JSON: ${String((error && error.message) || error)}` };
  }
}

/**
 * Persist the profile atomically (write-then-rename) with 0600 permissions.
 * @param file - absolute path.
 * @param profile - the two curated tracks.
 * @returns nothing; throws on an unwritable path.
 */
export function writeProfile(file, profile) {
  const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify({ user: profile.user, agent: profile.agent }, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, file);
}

/** Character count of one entry list, matching how the budget is described to the model. */
function trackChars(entries) {
  return entries.reduce((total, entry) => total + entry.length + 3, 0); // 3 = "- " + newline
}

/**
 * Render the bounded prompt block.
 *
 * The block is intentionally small: a heading, the two tracks, and one line of
 * usage guidance. Empty tracks are omitted so a fresh install costs ~40 tokens
 * rather than a header pair with nothing under it.
 * @param profile - the two curated tracks.
 * @returns the section text (never empty; always carries the usage line).
 */
export function renderProfile(profile) {
  const lines = ['<memory_profile>'];
  if (profile.user.length > 0) {
    lines.push('## About the user');
    for (const entry of profile.user) lines.push(`- ${entry}`);
  }
  if (profile.agent.length > 0) {
    lines.push('## Notes to self');
    for (const entry of profile.agent) lines.push(`- ${entry}`);
  }
  lines.push(
    'Curated memory you maintain with `memory_remember` / `memory_forget`. Keep entries short and current; delete what stopped being true.',
    'Anything not in this block: call `memory_recall` before guessing, and `memory_remember` when the user states a durable preference, decision or fact.',
    '</memory_profile>',
  );
  return lines.join('\n');
}

/**
 * Check a proposed write against a track budget before touching the file.
 * @param entries - current entries for the track.
 * @param budget - character budget for the track.
 * @param incoming - the entry the model wants to add.
 * @returns null when it fits, else the overflow report (Hermes-shaped).
 */
function budgetOverflow(entries, budget, incoming) {
  const used = trackChars(entries);
  const after = used + incoming.length + 3;
  if (after <= budget) return null;
  return {
    used,
    budget,
    overflow: after - budget,
    entries: entries.slice(),
  };
}

/**
 * Format the overflow report the model must act on: it has to free characters by
 * consolidating or removing entries, in one batch, before retrying.
 * @param track - 'user' | 'agent'.
 * @param report - result of {@link budgetOverflow}.
 * @returns model-facing text.
 */
function overflowMessage(track, report) {
  const list = report.entries.map((entry) => `- ${entry}`).join('\n');
  return [
    `The ${track} memory track is full: ${report.used}/${report.budget} chars used, this entry needs ${report.overflow} more chars freed.`,
    `Current entries:\n${list || '(none)'}`,
    `Consolidate or remove entries to free at least ${report.overflow} chars, then retry. Do not pad — merge related entries.`,
  ].join('\n\n');
}

/**
 * Call the Hindsight REST API with a timeout.
 * @param config - resolved plugin config.
 * @param pathname - API path beginning with `/v1/`.
 * @param init - fetch init (method/body).
 * @returns parsed JSON body.
 */
async function hindsightFetch(config, pathname, init) {
  const url = `${config.apiUrl.replace(/\/+$/, '')}${pathname}`;
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init && init.headers) },
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Hindsight ${response.status} on ${pathname}: ${text.slice(0, 300)}`);
  return text.length > 0 ? JSON.parse(text) : {};
}

/**
 * Store one fact in the configured bank. Fire-and-forget: a memory write must
 * never fail a turn, so errors are logged and swallowed.
 * @param config - resolved plugin config.
 * @param content - the fact text.
 * @param tags - Hindsight tags (the curated tracks double as tags).
 */
async function retainFact(config, content, tags) {
  try {
    await hindsightFetch(config, `/v1/default/banks/${encodeURIComponent(config.bankId)}/memories`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ content, tags }], async: true }),
    });
  } catch (error) {
    warnOnce(`retain:${String(error && error.message).slice(0, 80)}`, `retain failed (memory still saved locally): ${String(error && error.message)}`);
  }
}

/**
 * Recall facts by meaning.
 * @param config - resolved plugin config.
 * @param query - natural-language query.
 * @returns the result list (may be empty).
 */
async function recallFacts(config, query) {
  const body = await hindsightFetch(config, `/v1/default/banks/${encodeURIComponent(config.bankId)}/memories/recall`, {
    method: 'POST',
    body: JSON.stringify({ query, max_tokens: config.recallMaxTokens }),
  });
  return Array.isArray(body.results) ? body.results : [];
}

/**
 * Resolve the Loader row config into the values the plugin uses.
 * @param config - raw row config.
 * @returns resolved config.
 */
function resolveConfig(config) {
  const raw = config || {};
  return {
    apiUrl: setting(raw.apiUrl) ?? setting(process.env.HINDSIGHT_API_URL) ?? 'http://127.0.0.1:9177',
    bankId: setting(raw.bankId) ?? setting(process.env.HINDSIGHT_BANK) ?? 'dsh-personal',
    profilePath: resolveProfilePath(raw),
    userBudget: positiveInt(raw.userBudget, DEFAULTS.userBudget, 20000),
    agentBudget: positiveInt(raw.agentBudget, DEFAULTS.agentBudget, 20000),
    timeoutMs: positiveInt(raw.timeoutMs, DEFAULTS.timeoutMs, 30000),
    recallMaxTokens: positiveInt(raw.recallMaxTokens, DEFAULTS.recallMaxTokens, 4000),
    inject: raw.inject !== false,
  };
}

/** Model-facing text render for a tool result. */
function textResult(text) {
  return [{ type: 'text', text }];
}

/**
 * Build the three tool definitions.
 *
 * Schemas are plain JSON Schema (the shape the registry projects to the model);
 * descriptions stay one or two sentences because every character here is paid on
 * every request.
 * @param ctx - Cordis context.
 * @param config - resolved plugin config.
 * @returns the tool definitions.
 */
function buildTools(ctx, config) {
  const outputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: { message: { type: 'string' } },
    required: ['message'],
  };

  const remember = {
    name: 'memory_remember',
    description:
      'Store a durable fact about the user or a note to yourself. Use for stated preferences, decisions, people, ongoing projects and corrections. Do not store transient task state or anything already in the memory_profile block.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string', description: 'One short, self-contained sentence. No dates needed — Hindsight timestamps it.' },
        target: {
          type: 'string',
          enum: TARGETS,
          description: 'user = about the person; agent = a note to yourself; fact = background knowledge, Hindsight only (not in the prompt block).',
        },
      },
      required: ['text', 'target'],
    },
    output: { schema: outputSchema, render: (_args, value) => textResult(value.message) },
    async execute(args) {
      const text = String(args.text || '').trim();
      if (text.length === 0) return { message: 'Nothing to store: `text` was empty.' };
      const target = TARGETS.includes(args.target) ? args.target : 'fact';

      if (target !== 'fact') {
        const { profile, error } = readProfile(config.profilePath);
        if (error) return { message: `Memory profile is unreadable (${error}); nothing was stored. Fix ${config.profilePath} first.` };
        const budget = target === 'user' ? config.userBudget : config.agentBudget;
        const overflow = budgetOverflow(profile[target], budget, text);
        if (overflow) return { message: overflowMessage(target, overflow) };
        profile[target].push(text);
        writeProfile(config.profilePath, profile);
      }

      void retainFact(config, text, [target]);
      return {
        message:
          target === 'fact'
            ? `Stored in Hindsight (recall it with memory_recall).`
            : `Stored in the ${target} track and in Hindsight; it is in the prompt block from the next request.`,
      };
    },
  };

  const recall = {
    name: 'memory_recall',
    description:
      'Search long-term memory (Hindsight) by meaning. Use before answering questions about the user, past decisions or earlier work when the memory_profile block does not already cover it.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: 'What you are trying to remember, in natural language.' },
      },
      required: ['query'],
    },
    output: { schema: outputSchema, render: (_args, value) => textResult(value.message) },
    async execute(args) {
      const query = String(args.query || '').trim();
      if (query.length === 0) return { message: 'Nothing to search: `query` was empty.' };
      try {
        const results = await recallFacts(config, query);
        if (results.length === 0) return { message: `No memories matched "${query}".` };
        const lines = results.slice(0, 8).map((result, index) => {
          const when = result.occurred_start ? String(result.occurred_start).slice(0, 10) : '';
          const score = result.scores && typeof result.scores.final === 'number' ? ` [${result.scores.final.toFixed(2)}]` : '';
          return `${index + 1}. ${when ? `${when} — ` : ''}${String(result.text || '').trim()}${score}`;
        });
        return { message: `Recalled ${results.length} memories for "${query}":\n${lines.join('\n')}` };
      } catch (error) {
        return {
          message: `Memory recall failed (${String((error && error.message) || error)}). Continue without it and say so if the answer depends on memory.`,
        };
      }
    },
  };

  const forget = {
    name: 'memory_forget',
    description:
      'Remove an entry from the curated memory_profile (user or agent track). Use when a fact stopped being true or the user asks you to forget it. Hindsight keeps a historical record; this removes it from the always-on block.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string', description: 'The entry to remove — a distinctive prefix is enough.' },
        target: { type: 'string', enum: ['user', 'agent'], description: 'Which curated track to remove it from.' },
      },
      required: ['text', 'target'],
    },
    output: { schema: outputSchema, render: (_args, value) => textResult(value.message) },
    async execute(args) {
      const needle = String(args.text || '').trim().toLowerCase();
      const target = args.target === 'user' ? 'user' : 'agent';
      if (needle.length === 0) return { message: 'Nothing to forget: `text` was empty.' };
      const { profile, error } = readProfile(config.profilePath);
      if (error) return { message: `Memory profile is unreadable (${error}); nothing was removed.` };
      const before = profile[target].length;
      profile[target] = profile[target].filter((entry) => !entry.toLowerCase().includes(needle));
      const removed = before - profile[target].length;
      if (removed === 0) return { message: `No ${target} entry matched "${args.text}".` };
      writeProfile(config.profilePath, profile);
      return { message: `Removed ${removed} ${target} entr${removed === 1 ? 'y' : 'ies'} from the prompt block.` };
    },
  };

  return [remember, recall, forget];
}

/**
 * Register the profile section and the three memory tools.
 * @param ctx - Cordis context carrying `systemPrompt` and `tools`.
 * @param config - Loader row config.
 */
export function apply(ctx, config) {
  const resolved = resolveConfig(config);
  const loaded = readProfile(resolved.profilePath);
  if (loaded.error) {
    warnOnce(`profile:${resolved.profilePath}`, `cannot read ${resolved.profilePath} (${loaded.error}); starting from an empty profile`);
  }

  if (resolved.inject) {
    const text = renderProfile(loaded.profile);
    const allocated = typeof ctx.systemPrompt.getSectionOrder === 'function'
      ? ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX')
      : undefined;
    const order = Number.isFinite(allocated) ? allocated + 1 : 1;
    ctx.effect(() => {
      const dispose = ctx.systemPrompt.section({ name: SECTION_NAME, order, text, interpolate: false });
      return () => void dispose();
    }, 'dsh-memory-personal: profile section');
  }

  for (const tool of buildTools(ctx, resolved)) ctx.tools.register(tool);

  console.error(
    `[dsh-memory-personal] bank=${resolved.bankId} api=${resolved.apiUrl} profile=${resolved.profilePath} ` +
      `entries=${loaded.profile.user.length}user/${loaded.profile.agent.length}agent budgets=${resolved.userBudget}/${resolved.agentBudget}`,
  );
}
