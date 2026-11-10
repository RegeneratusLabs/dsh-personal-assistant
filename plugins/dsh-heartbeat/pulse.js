/**
 * Impure-but-injected pulse loop for the quiet heartbeat.
 *
 * `createPulse()` takes every side effect as a dependency (`readState`,
 * `nudge`, `log`, `now`) so the loop can be unit-tested with fakes: the tests
 * prove "quiet" behaviour without a live host. `index.js` is the only place
 * that binds these to Cordis services.
 *
 * Contract of one pulse:
 *  - read the cheap local state (never throw outward; a read failure is quiet),
 *  - build a content-free digest and apply `decidePulse()`,
 *  - on `nudge`, call `nudge()` exactly once, then record the nudge time and
 *    the digest so the same state cannot nag again.
 *  - a change suppressed by quiet hours or the per-interval rate limit is
 *    *deferred*, not lost: `lastDigest` keeps the older value so the change can
 *    nudge once the gate opens.
 */
import { buildDigest, decidePulse } from './decision.js';

/** An entry is actionable when it holds unfinished human-facing work. */
export function entryIsActionable(entry) {
  if (entry === null || typeof entry !== 'object') return false;
  const pending = Number(entry.pendingTodos);
  const inProgress = Number(entry.inProgressTodos);
  const questions = Number(entry.openQuestions);
  return (Number.isFinite(pending) && pending > 0)
    || (Number.isFinite(inProgress) && inProgress > 0)
    || entry.goalPhase === 'active'
    || (Number.isFinite(questions) && questions > 0);
}

/** A short, log-safe error code — never the error message (which may carry state). */
function codeOf(error) {
  const code = error?.code;
  return typeof code === 'string' && code.length <= 40 ? code : 'error';
}

/**
 * @param {object} deps
 * @param {boolean} deps.enabled
 * @param {number} deps.intervalMs
 * @param {{start: string, end: string}|null} deps.quietHours
 * @param {() => Date} deps.now
 * @param {() => ReadonlyArray<Record<string, unknown>>} deps.readState
 * @param {(entry: Record<string, unknown>, decision: {action: string, reason: string}) => unknown} deps.nudge
 * @param {(level: 'debug'|'info'|'warn', message: string) => void} deps.log
 * @returns {() => Promise<{action: 'quiet'|'nudge', reason: string}>}
 */
export function createPulse({ enabled, intervalMs, quietHours, now, readState, nudge, log }) {
  /** Digest of the previous successful read; null before the first pulse. */
  let lastDigest = null;
  /** Digest that was last acted on; null before any nudge. */
  let nudgedDigest = null;
  /** Date.now() of the last successful nudge; null before any nudge. */
  let lastNudgeAt = null;

  return async function pulse() {
    if (enabled !== true) {
      log('debug', 'pulse skipped: disabled');
      return { action: 'quiet', reason: 'disabled' };
    }

    let entries;
    try {
      entries = readState();
      if (!Array.isArray(entries)) entries = [];
    } catch (error) {
      // Fail-open: a state read error must never surface or wake anything.
      log('warn', `pulse skipped: state-unavailable (${codeOf(error)})`);
      return { action: 'quiet', reason: 'state-unavailable' };
    }

    const digest = buildDigest(entries);
    if (lastDigest === null) {
      // First pulse after load only records a baseline: a restart must not nag
      // about state that was already there before the process started.
      lastDigest = digest;
      log('info', `pulse baseline idle-agents=${entries.length}`);
      return { action: 'quiet', reason: 'baseline' };
    }

    const decision = decidePulse({
      enabled,
      now: now(),
      digest,
      lastDigest,
      nudgedDigest,
      lastNudgeAt,
      intervalMs,
      quietHours,
    });

    if (decision.action !== 'nudge') {
      // Quiet-hours and per-interval suppression keep the OLD digest, so the
      // change is retried once the gate opens. Every other quiet reason means
      // the current state is settled and becomes the new baseline.
      if (decision.reason !== 'quiet-hours' && decision.reason !== 'min-interval') lastDigest = digest;
      log('info', `pulse quiet (${decision.reason}) idle-agents=${entries.length}`);
      return decision;
    }

    const target = entries
      .filter((entry) => entryIsActionable(entry))
      .sort((a, b) => String(a.sessionId ?? '').localeCompare(String(b.sessionId ?? '')))[0];
    if (target === undefined) {
      log('info', `pulse quiet (target-vanished) idle-agents=${entries.length}`);
      return { action: 'quiet', reason: 'target-vanished' };
    }

    try {
      await nudge(target, decision);
    } catch (error) {
      // Failed delivery keeps the old digest: the next interval may retry.
      log('warn', `pulse nudge failed (${codeOf(error)})`);
      return { action: 'quiet', reason: 'nudge-failed' };
    }

    lastNudgeAt = now().getTime();
    nudgedDigest = digest;
    lastDigest = digest;
    log('info', `pulse nudge session=${String(target.sessionId ?? 'unknown')} reason=${decision.reason}`);
    return decision;
  };
}
