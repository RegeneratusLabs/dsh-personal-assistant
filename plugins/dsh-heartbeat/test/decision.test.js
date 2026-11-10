import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_QUIET_HOURS,
  MIN_INTERVAL_MS,
  buildDigest,
  clampInterval,
  decidePulse,
  isActionable,
  isQuietTime,
  localMinutesOf,
  parseClock,
  resolveQuietHours,
} from '../decision.js';

// Every decision test pins the clock through `localMinutesOf`-derived inputs so
// it is independent of the machine time zone.

test('parseClock accepts 24-hour HH:MM only', () => {
  assert.equal(parseClock('00:00'), 0);
  assert.equal(parseClock('22:00'), 22 * 60);
  assert.equal(parseClock('23:59'), 23 * 60 + 59);
  for (const bad of ['24:00', '7:00', '08:60', '0800', '', null, 800, ' 08:00']) {
    assert.equal(parseClock(bad), null, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test('resolveQuietHours: default window, explicit off, malformed falls back to default', () => {
  assert.deepEqual(resolveQuietHours(undefined), { ...DEFAULT_QUIET_HOURS });
  assert.deepEqual(resolveQuietHours({ start: '21:30', end: '07:15' }), { start: '21:30', end: '07:15' });
  assert.equal(resolveQuietHours(null), null);
  assert.equal(resolveQuietHours(false), null);
  // A typo must never silently disable quiet hours.
  assert.deepEqual(resolveQuietHours({ start: '22:0', end: '08:00' }), { ...DEFAULT_QUIET_HOURS });
  assert.deepEqual(resolveQuietHours({ start: 'oops', end: '08:00' }), { ...DEFAULT_QUIET_HOURS });
});

test('isQuietTime: overnight 22:00–08:00 window', () => {
  const quiet = { start: '22:00', end: '08:00' };
  assert.equal(isQuietTime(22 * 60, quiet), true);
  assert.equal(isQuietTime(23 * 60 + 59, quiet), true);
  assert.equal(isQuietTime(0, quiet), true);
  assert.equal(isQuietTime(7 * 60 + 59, quiet), true);
  assert.equal(isQuietTime(8 * 60, quiet), false);
  assert.equal(isQuietTime(21 * 60 + 59, quiet), false);
  assert.equal(isQuietTime(12 * 60, quiet), false);
});

test('isQuietTime: same-day window and the never-quiet escape hatches', () => {
  assert.equal(isQuietTime(12 * 60 + 30, { start: '12:00', end: '13:00' }), true);
  assert.equal(isQuietTime(13 * 60, { start: '12:00', end: '13:00' }), false);
  assert.equal(isQuietTime(12 * 60, { start: '12:00', end: '12:00' }), false);
  assert.equal(isQuietTime(12 * 60, null), false);
});

test('localMinutesOf reads the local wall clock', () => {
  const date = new Date(2026, 10, 10, 22, 5, 0);
  assert.equal(localMinutesOf(date), 22 * 60 + 5);
});

test('clampInterval enforces the 5 minute floor and the 30 minute default', () => {
  assert.equal(clampInterval(undefined), DEFAULT_INTERVAL_MS);
  assert.equal(clampInterval(Number.NaN), DEFAULT_INTERVAL_MS);
  assert.equal(clampInterval('60000'), DEFAULT_INTERVAL_MS);
  assert.equal(clampInterval(1000), MIN_INTERVAL_MS);
  assert.equal(clampInterval(MIN_INTERVAL_MS - 1), MIN_INTERVAL_MS);
  assert.equal(clampInterval(MIN_INTERVAL_MS), MIN_INTERVAL_MS);
  assert.equal(clampInterval(30 * 60 * 1000), DEFAULT_INTERVAL_MS);
  assert.equal(clampInterval(60 * 60 * 1000), 60 * 60 * 1000);
});

test('buildDigest is order-independent and content-free', () => {
  const a = { sessionId: 's1', pendingTodos: 2, inProgressTodos: 1, goalPhase: 'active', openQuestions: 0 };
  const b = { sessionId: 's2', pendingTodos: 0, inProgressTodos: 0, goalPhase: 'complete', openQuestions: 1 };
  const digestForward = buildDigest([a, b]);
  const digestBackward = buildDigest([b, a]);
  assert.equal(digestForward, digestBackward, 'registry order must not produce spurious changes');
  assert.equal(buildDigest([]), '');
  // Free text supplied by a caller must never reach the digest/log.
  const leaky = {
    ...a,
    todoText: 'buy milk',
    objective: 'secret objective',
    question: 'private question?',
    title: 'private title',
  };
  const digest = buildDigest([leaky]);
  assert.equal(digest.includes('milk'), false);
  assert.equal(digest.includes('secret'), false);
  assert.equal(digest.includes('private'), false);
  assert.match(digest, /sessionId=s1/);
});

test('isActionable: unfinished work only', () => {
  assert.equal(isActionable(''), false);
  assert.equal(isActionable('sessionId=s1'), false);
  assert.equal(isActionable('sessionId=s1,pendingTodos=1'), true);
  assert.equal(isActionable('sessionId=s1,inProgressTodos=2'), true);
  assert.equal(isActionable('sessionId=s1,goalPhase=active'), true);
  assert.equal(isActionable('sessionId=s1,openQuestions=1'), true);
  assert.equal(isActionable('sessionId=s1,goalPhase=complete,pendingTodos=0'), false);
  assert.equal(isActionable('sessionId=s1,goalPhase=paused'), false);
  assert.equal(isActionable(42), false);
});

/** A fixed local time (10:00) and a quiet window that cannot contain it. */
const NOW = new Date(2026, 10, 10, 10, 0, 0);
const NOT_QUIET = { start: '22:00', end: '08:00' };
const ALWAYS_QUIET = { start: '00:00', end: '23:59' };
const BASE = {
  enabled: true,
  now: NOW,
  digest: 'sessionId=s1,pendingTodos=1',
  lastDigest: 'sessionId=s1',
  nudgedDigest: null,
  lastNudgeAt: null,
  intervalMs: MIN_INTERVAL_MS,
  quietHours: NOT_QUIET,
};

test('decidePulse: disabled wins over everything', () => {
  assert.deepEqual(decidePulse({ ...BASE, enabled: false, quietHours: ALWAYS_QUIET }), {
    action: 'quiet',
    reason: 'disabled',
  });
});

test('decidePulse: quiet hours stay silent even with actionable change', () => {
  assert.deepEqual(decidePulse({ ...BASE, quietHours: ALWAYS_QUIET }), { action: 'quiet', reason: 'quiet-hours' });
});

test('decidePulse: unchanged state stays silent', () => {
  assert.deepEqual(decidePulse({ ...BASE, lastDigest: BASE.digest }), { action: 'quiet', reason: 'no-change' });
});

test('decidePulse: not-actionable state stays silent', () => {
  assert.deepEqual(
    decidePulse({ ...BASE, digest: 'sessionId=s1,goalPhase=complete' }),
    { action: 'quiet', reason: 'not-actionable' },
  );
  assert.deepEqual(decidePulse({ ...BASE, digest: '' }), { action: 'quiet', reason: 'not-actionable' });
});

test('decidePulse: the same digest never nudges twice', () => {
  assert.deepEqual(
    decidePulse({ ...BASE, nudgedDigest: BASE.digest, lastNudgeAt: NOW.getTime() - 10 * 60 * 1000 }),
    { action: 'quiet', reason: 'already-nudged' },
  );
});

test('decidePulse: at most one nudge per interval', () => {
  assert.deepEqual(
    decidePulse({ ...BASE, nudgedDigest: null, lastNudgeAt: NOW.getTime() - 4 * 60 * 1000 }),
    { action: 'quiet', reason: 'min-interval' },
  );
  assert.deepEqual(
    decidePulse({ ...BASE, nudgedDigest: null, lastNudgeAt: NOW.getTime() - 5 * 60 * 1000 }),
    { action: 'nudge', reason: 'actionable-change' },
  );
});

test('decidePulse: a real actionable change is the nudge case', () => {
  assert.deepEqual(decidePulse({ ...BASE }), { action: 'nudge', reason: 'actionable-change' });
});

test('decidePulse: invalid lastNudgeAt is ignored rather than suppressing', () => {
  assert.deepEqual(decidePulse({ ...BASE, lastNudgeAt: 'nope' }), { action: 'nudge', reason: 'actionable-change' });
});
