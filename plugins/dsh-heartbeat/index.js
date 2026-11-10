/**
 * Quiet heartbeat / proactivity loop (host half).
 *
 * This is the D14 replacement for the 1★ `dsh-plugin-heartbeat`: ~200 lines of
 * our own code with no tools, no shell, no network and no credential access.
 * Its only capability is `agent.followup()` on a live, idle, top-level agent.
 *
 * Safety posture
 *  - **Default OFF.** `apply()` returns unless `DSH_HEARTBEAT=1` or the row
 *    config sets `enabled: true`. A default-off plugin registers no timer, so
 *    inertness is structural, not a runtime check.
 *  - **Quiet by construction.** First pulse only records a baseline; later
 *    pulses read cheap local projections (todos/goal/userQuestions), build a
 *    content-free digest, and wake at most one idle agent when that digest
 *    changed and is actionable. Unchanged state, quiet hours, and recently
 *    nudged state stay silent.
 *  - **Fail-open.** Every pulse is wrapped: read/nudge errors are logged as a
 *    short code and swallowed.
 *  - **No data in logs.** Digests carry counts/phases only; log lines carry a
 *    reason and session id.
 */
import { randomUUID } from 'node:crypto';
import { clampInterval, resolveQuietHours } from './decision.js';
import { createPulse } from './pulse.js';

/** This bundle's package name; also the Loader row id it is installed under. */
const PKG = '@local/dsh-heartbeat';

/**
 * Only load once the services the loop needs exist:
 *  - `agents` — the live agent registry (dsh-agent)
 *  - `sessionProjections` — todos/goal/userQuestions projections
 *  - `timer` — disposal-aware `ctx.interval`
 * A profile without any of these simply does not mount the plugin.
 */
export const inject = ['agents', 'sessionProjections', 'timer'];

/** The system-authored nudge. Short, explicit that it is not the human. */
const DEFAULT_TEMPLATE = [
  'Heartbeat (system-generated, not a message from the user): this session has been idle with',
  'unfinished tracked work — {pending} pending todo(s), {inProgress} in progress, {openQuestions} open question(s)',
  'and goal phase "{goalPhase}". If the work is still wanted, continue it; otherwise briefly say it is no',
  'longer needed or update the todo list so the next heartbeat stays quiet.',
].join(' ');

const MAX_NUDGE_CHARS = 600;

/** Read `DSH_HEARTBEAT=1` (or an explicit row-config override). */
function isEnabled(config, env) {
  if (config?.enabled === true) return true;
  return env?.DSH_HEARTBEAT === '1';
}

/**
 * Cheap local state: live top-level agents that are idle, with counts from the
 * session projections. Runs in-process; no model calls, no disk reads.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @returns {Array<Record<string, unknown>>}
 */
function collectState(ctx) {
  const entries = [];
  const agents = typeof ctx.agents?.roots === 'function' ? ctx.agents.roots() : [];
  const projections = ctx.get('sessionProjections');
  for (const agent of agents) {
    // Active agents are left alone: a running turn is already doing work.
    if (agent?.status !== 'idle') continue;
    const session = agent?.session;
    if (!session) continue;

    let values = {};
    try {
      values = projections?.snapshot(session, ['todos', 'goal', 'userQuestions'])?.values ?? {};
    } catch {
      values = {}; // projection read failures mean "nothing known", not a nudge
    }

    const todos = Array.isArray(values.todos) ? values.todos : [];
    let pendingTodos = 0;
    let inProgressTodos = 0;
    for (const todo of todos) {
      if (todo?.status === 'pending') pendingTodos += 1;
      else if (todo?.status === 'in_progress') inProgressTodos += 1;
    }

    const goal = values.goal;
    const goalPhase = typeof goal?.goal?.phase === 'string' ? goal.goal.phase : 'none';

    const questions = values.userQuestions;
    const openQuestions = Array.isArray(questions?.active) ? questions.active.length : 0;

    entries.push({
      sessionId: String(session.id ?? 'unknown'),
      pendingTodos,
      inProgressTodos,
      goalPhase,
      openQuestions,
    });
  }
  return entries;
}

/** Build the identified user-role message that wakes the idle agent. */
function nudgeMessage(template, entry) {
  const text = String(template)
    .replaceAll('{pending}', String(entry.pendingTodos ?? 0))
    .replaceAll('{inProgress}', String(entry.inProgressTodos ?? 0))
    .replaceAll('{openQuestions}', String(entry.openQuestions ?? 0))
    .replaceAll('{goalPhase}', String(entry.goalPhase ?? 'none'))
    .replaceAll('{sessionId}', String(entry.sessionId ?? 'unknown'))
    .slice(0, MAX_NUDGE_CHARS);
  // Mirrors @deepseek-ai/dsh-llm's createUserMessage: an identified, frozen
  // user-role message. `heartbeat` is this plugin's own source kind, so the
  // message is attributable to the plugin, never impersonating the human.
  return Object.freeze({
    id: randomUUID(),
    role: 'user',
    content: Object.freeze([{ type: 'text', text }]),
    source: Object.freeze({ kind: 'heartbeat' }),
  });
}

/**
 * Mount the heartbeat loop.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} [config] - row config from the profile patch.
 */
/** Stderr logger: this DSH build has no console exporter for ctx.logger, and the
 * systemd unit's journald sink captures stderr, so activation/quiet decisions stay
 * observable. Best-effort; never throws into a pulse. */
function logLine(level, message) {
  try {
    process.stderr.write(`[dsh-heartbeat] ${level}: ${message}\n`);
  } catch {
    /* a closed stderr must not affect the host */
  }
}

export function apply(ctx, config = {}) {
  const log = {
    info: (message) => logLine('info', message),
    warn: (message) => logLine('warn', message),
    debug: (message) => logLine('debug', message),
    error: (message) => logLine('error', message),
  };

  if (!isEnabled(config, process.env)) {
    // Structural inertness: no timer, no state reads, one line for the log.
    log.info('heartbeat disabled (set DSH_HEARTBEAT=1 to enable)');
    return;
  }

  const intervalMs = clampInterval(config.intervalMs);
  const quietHours = resolveQuietHours(config.quietHours);
  const template = typeof config.template === 'string' && config.template.trim().length > 0
    ? config.template
    : DEFAULT_TEMPLATE;

  const pulse = createPulse({
    enabled: true,
    intervalMs,
    quietHours,
    now: () => new Date(),
    readState: () => collectState(ctx),
    nudge: (entry) => {
      const agent = ctx.agents.list().find((candidate) => String(candidate?.session?.id ?? '') === String(entry.sessionId));
      if (!agent) throw Object.assign(new Error('agent-gone'), { code: 'agent-gone' });
      agent.followup(nudgeMessage(template, entry));
    },
    log: (level, message) => log[level](message),
  });

  log.info(
    `heartbeat enabled: interval=${Math.round(intervalMs / 1000)}s quiet=${quietHours === null ? 'off' : `${quietHours.start}-${quietHours.end}`}`,
  );

  // Ticks are effect-owned: unload the plugin (or disable the row) and the
  // interval is unwound with the fiber.
  ctx.interval(() => {
    void pulse();
  }, intervalMs);
}
