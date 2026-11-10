/**
 * Pure decision layer for the quiet heartbeat.
 *
 * Every function here is deterministic over its arguments: no clock, no
 * timers, no Cordis, no I/O. That is deliberate — the only thing worse than
 * shipping no proactivity is shipping proactivity whose "stay quiet" path was
 * never exercised. The unit tests drive this module directly.
 *
 * Vocabulary
 *  - digest: a short, content-free fingerprint of the actionable state of the
 *    idle agents. Counts and phases only: never todo text, goal objectives,
 *    question text, session titles, or message bodies (so a digest is safe to
 *    log).
 *  - quiet: do not wake anything. Every reason that is not `nudge`.
 *  - nudge: at most one `followup()` on one idle agent.
 */

/** Default check interval: 30 minutes. */
export const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
/** Hard floor for the check interval: 5 minutes. */
export const MIN_INTERVAL_MS = 5 * 60 * 1000;
/** Default quiet hours, local wall clock: 22:00–08:00. */
export const DEFAULT_QUIET_HOURS = Object.freeze({ start: '22:00', end: '08:00' });

const MINUTES_PER_DAY = 24 * 60;
const CLOCK_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Parse an `HH:MM` 24-hour wall-clock string into minutes since local midnight.
 * @param {unknown} value
 * @returns {number|null} null when the value is not a valid clock time.
 */
export function parseClock(value) {
  if (typeof value !== 'string') return null;
  const match = CLOCK_RE.exec(value);
  if (match === null) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Normalize a quiet-hours config value.
 *
 * Accepts `{ start, end }` (default when omitted), `null`/`false` for "never
 * quiet", and rejects malformed windows by falling back to the default window
 * — a typo must not silently disable quiet hours.
 *
 * @param {unknown} value
 * @returns {{start: string, end: string}|null}
 */
export function resolveQuietHours(value) {
  if (value === null || value === false) return null;
  if (value === undefined) return { ...DEFAULT_QUIET_HOURS };
  const start = parseClock(value?.start);
  const end = parseClock(value?.end);
  if (start === null || end === null) return { ...DEFAULT_QUIET_HOURS };
  return { start: value.start, end: value.end };
}

/**
 * Whether a wall-clock minute falls inside a quiet-hours window.
 *
 * Windows may wrap midnight (start > end), which is the normal case for
 * 22:00–08:00. A start equal to end is treated as "never quiet" rather than a
 * 24-hour quiet period.
 *
 * @param {number} minutes - minutes since local midnight.
 * @param {{start: string, end: string}|null} quietHours
 * @returns {boolean}
 */
export function isQuietTime(minutes, quietHours) {
  if (quietHours === null) return false;
  const start = parseClock(quietHours.start);
  const end = parseClock(quietHours.end);
  if (start === null || end === null || start === end) return false;
  const now = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

/**
 * Extract local wall-clock minutes from a Date.
 * @param {{getHours: () => number, getMinutes: () => number}} date
 * @returns {number}
 */
export function localMinutesOf(date) {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Clamp a configured interval into the supported range.
 *
 * - missing/invalid → default 30 min
 * - below the 5 min floor → floor
 * - non-finite → default
 *
 * @param {unknown} value
 * @returns {number} milliseconds
 */
export function clampInterval(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_INTERVAL_MS;
  return Math.max(MIN_INTERVAL_MS, Math.round(value));
}

/** The counters/phase fields one idle agent contributes to the digest. */
const DIGEST_FIELDS = Object.freeze([
  'sessionId',
  'pendingTodos',
  'inProgressTodos',
  'goalPhase',
  'openQuestions',
]);

/**
 * Concatenate a snapshot of `{sessionId, pendingTodos, inProgressTodos,
 * goalPhase, openQuestions}` records into a content-free digest string.
 *
 * Records are sorted by session id so registry order cannot cause spurious
 * "state changed" pulses. Unknown fields are dropped by construction — callers
 * cannot leak todo text or goals into the log through this function.
 *
 * @param {ReadonlyArray<Record<string, unknown>>} entries
 * @returns {string}
 */
export function buildDigest(entries) {
  const rows = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry === null || typeof entry !== 'object') continue;
    const parts = [];
    for (const field of DIGEST_FIELDS) {
      const value = entry[field];
      if (value === null || value === undefined) continue;
      if (typeof value === 'number') parts.push(`${field}=${value}`);
      else if (typeof value === 'string') parts.push(`${field}=${value}`);
    }
    rows.push(parts.join(','));
  }
  rows.sort();
  return rows.join(';');
}

/**
 * Whether a digest describes a state worth waking an idle agent for.
 *
 * Only unfinished human-facing work counts: pending/in-progress todos, an
 * actively-running goal, or an open user question. Empty digests, completed
 * goals, paused/blocked goals, and fully completed todo lists are not
 * actionable.
 *
 * @param {string} digest
 * @returns {boolean}
 */
export function isActionable(digest) {
  if (typeof digest !== 'string' || digest.length === 0) return false;
  for (const row of digest.split(';')) {
    if (row.length === 0) continue;
    if (/pendingTodos=[1-9]/.test(row)) return true;
    if (/inProgressTodos=[1-9]/.test(row)) return true;
    if (/goalPhase=active/.test(row)) return true;
    if (/openQuestions=[1-9]/.test(row)) return true;
  }
  return false;
}

/**
 * The decision table for one pulse.
 *
 * @param {object} input
 * @param {boolean} input.enabled - the loop is enabled (env/config).
 * @param {Date} input.now - current time.
 * @param {string} input.digest - content-free digest of the current idle state.
 * @param {string|null} input.lastDigest - digest of the previous pulse.
 * @param {string|null} input.nudgedDigest - digest that was last acted on.
 * @param {number|null} input.lastNudgeAt - Date.now() of the last successful nudge.
 * @param {number} input.intervalMs - the configured pulse interval.
 * @param {{start: string, end: string}|null} input.quietHours
 * @returns {{action: 'quiet'|'nudge', reason: string}}
 */
export function decidePulse({
  enabled,
  now,
  digest,
  lastDigest,
  nudgedDigest,
  lastNudgeAt,
  intervalMs,
  quietHours,
}) {
  if (enabled !== true) return { action: 'quiet', reason: 'disabled' };
  if (isQuietTime(localMinutesOf(now), quietHours)) return { action: 'quiet', reason: 'quiet-hours' };
  if (isActionable(digest) !== true) return { action: 'quiet', reason: 'not-actionable' };
  if (digest === nudgedDigest) return { action: 'quiet', reason: 'already-nudged' };
  if (digest === lastDigest) return { action: 'quiet', reason: 'no-change' };

  const interval = clampInterval(intervalMs);
  if (typeof lastNudgeAt === 'number' && Number.isFinite(lastNudgeAt)) {
    const elapsed = now.getTime() - lastNudgeAt;
    if (elapsed >= 0 && elapsed < interval) return { action: 'quiet', reason: 'min-interval' };
  }

  return { action: 'nudge', reason: 'actionable-change' };
}
