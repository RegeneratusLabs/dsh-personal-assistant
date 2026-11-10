import test from 'node:test';
import assert from 'node:assert/strict';

import { createPulse, entryIsActionable } from '../pulse.js';
import { MIN_INTERVAL_MS } from '../decision.js';

const NOT_QUIET = { start: '22:00', end: '08:00' };
const ALWAYS_QUIET = { start: '00:00', end: '23:59' };

/** Build a pulse with fakes, a controllable clock, and a recorder. */
function harness({ enabled = true, quietHours = NOT_QUIET, state = [], now = new Date(2026, 10, 10, 10, 0, 0), failRead = false, failNudge = false } = {}) {
  const nudges = [];
  const logs = [];
  let currentNow = now;
  let currentState = state;
  let readFails = failRead;
  let nudgeFails = failNudge;

  const pulse = createPulse({
    enabled,
    intervalMs: MIN_INTERVAL_MS,
    quietHours,
    now: () => currentNow,
    readState: () => {
      if (readFails) throw Object.assign(new Error('read exploded with secret content'), { code: 'read-failed' });
      return currentState;
    },
    nudge: (entry, decision) => {
      if (nudgeFails) throw Object.assign(new Error('nudge exploded'), { code: 'delivery-failed' });
      nudges.push({ entry, decision });
    },
    log: (level, message) => logs.push({ level, message }),
  });

  return {
    pulse,
    nudges,
    logs,
    advance: (ms) => { currentNow = new Date(currentNow.getTime() + ms); },
    setState: (next) => { currentState = next; },
    setReadFails: (value) => { readFails = value; },
    setNudgeFails: (value) => { nudgeFails = value; },
    logText: () => logs.map((entry) => entry.message).join('\n'),
  };
}

const ACTIONABLE = { sessionId: 's1', pendingTodos: 1, inProgressTodos: 0, goalPhase: 'none', openQuestions: 0 };
const MORE_ACTIONABLE = { sessionId: 's1', pendingTodos: 2, inProgressTodos: 0, goalPhase: 'none', openQuestions: 0 };
const QUIET_STATE = { sessionId: 's1', pendingTodos: 0, inProgressTodos: 0, goalPhase: 'none', openQuestions: 0 };

test('entryIsActionable covers todos, goals and questions only', () => {
  assert.equal(entryIsActionable(ACTIONABLE), true);
  assert.equal(entryIsActionable(QUIET_STATE), false);
  assert.equal(entryIsActionable({ sessionId: 's1', goalPhase: 'active' }), true);
  assert.equal(entryIsActionable({ sessionId: 's1', goalPhase: 'complete' }), false);
  assert.equal(entryIsActionable({ sessionId: 's1', openQuestions: 2 }), true);
  assert.equal(entryIsActionable(null), false);
});

test('disabled: no state read, no nudge, debug only', async () => {
  const h = harness({ enabled: false, state: [ACTIONABLE] });
  const result = await h.pulse();
  assert.deepEqual(result, { action: 'quiet', reason: 'disabled' });
  assert.equal(h.nudges.length, 0);
  assert.equal(h.logText(), 'pulse skipped: disabled');
});

test('first pulse only baselines; repeating actionable state never nudges', async () => {
  const h = harness({ state: [ACTIONABLE] });
  assert.deepEqual(await h.pulse(), { action: 'quiet', reason: 'baseline' });
  assert.deepEqual(await h.pulse(), { action: 'quiet', reason: 'no-change' });
  h.advance(MIN_INTERVAL_MS);
  assert.deepEqual(await h.pulse(), { action: 'quiet', reason: 'no-change' });
  assert.equal(h.nudges.length, 0, 'pre-existing state must not nag, even after an interval');
});

test('a state change from baseline nudges exactly once and logs no content', async () => {
  const h = harness({ state: [QUIET_STATE] });
  await h.pulse(); // baseline
  h.setState([ACTIONABLE]);
  const result = await h.pulse();
  assert.deepEqual(result, { action: 'nudge', reason: 'actionable-change' });
  assert.equal(h.nudges.length, 1);
  assert.equal(h.nudges[0].entry.sessionId, 's1');

  // Same digest again: no second nudge, even after the interval elapses.
  h.advance(MIN_INTERVAL_MS * 3);
  assert.deepEqual(await h.pulse(), { action: 'quiet', reason: 'already-nudged' });
  assert.equal(h.nudges.length, 1);

  const text = h.logText();
  assert.equal(text.includes('buy milk'), false);
  assert.equal(text.includes('secret'), false);
  assert.match(text, /pulse baseline/);
  assert.match(text, /pulse nudge session=s1 reason=actionable-change/);
});

test('quiet hours suppress a changed, actionable state', async () => {
  const h = harness({ state: [QUIET_STATE], quietHours: ALWAYS_QUIET });
  await h.pulse();
  h.setState([ACTIONABLE]);
  assert.deepEqual(await h.pulse(), { action: 'quiet', reason: 'quiet-hours' });
  assert.equal(h.nudges.length, 0);
});

test('at most one nudge per interval when the state changes again', async () => {
  const h = harness({ state: [QUIET_STATE] });
  await h.pulse();
  h.setState([ACTIONABLE]);
  await h.pulse();
  assert.equal(h.nudges.length, 1);

  // Digest changes again immediately: per-interval rate limit holds.
  h.setState([MORE_ACTIONABLE]);
  assert.deepEqual(await h.pulse(), { action: 'quiet', reason: 'min-interval' });
  assert.equal(h.nudges.length, 1);

  // After one interval it may nudge once more for the new state.
  h.advance(MIN_INTERVAL_MS);
  assert.deepEqual(await h.pulse(), { action: 'nudge', reason: 'actionable-change' });
  assert.equal(h.nudges.length, 2);
});

test('read failure is quiet, logged as a code, and does not poison later pulses', async () => {
  const h = harness({ state: [QUIET_STATE], failRead: true });
  assert.deepEqual(await h.pulse(), { action: 'quiet', reason: 'state-unavailable' });
  assert.equal(h.logText().includes('secret content'), false, 'error messages must not be logged');
  assert.match(h.logText(), /state-unavailable \(read-failed\)/);

  h.setReadFails(false);
  await h.pulse(); // baseline works again
  h.setState([ACTIONABLE]);
  assert.deepEqual(await h.pulse(), { action: 'nudge', reason: 'actionable-change' });
});

test('nudge failure is swallowed and retried at the next pulse', async () => {
  const h = harness({ state: [QUIET_STATE], failNudge: true });
  await h.pulse();
  h.setState([ACTIONABLE]);
  assert.deepEqual(await h.pulse(), { action: 'quiet', reason: 'nudge-failed' });
  assert.equal(h.nudges.length, 0);

  h.setNudgeFails(false);
  assert.deepEqual(await h.pulse(), { action: 'nudge', reason: 'actionable-change' });
  assert.equal(h.nudges.length, 1);
});

test('five pulses of unchanged quiet state produce zero nudges', async () => {
  const h = harness({ state: [QUIET_STATE] });
  for (let i = 0; i < 5; i += 1) {
    await h.pulse();
    h.advance(MIN_INTERVAL_MS);
  }
  assert.equal(h.nudges.length, 0);
  assert.equal(h.logs.filter((entry) => entry.level === 'info').length, 5);
});

test('multiple idle agents: nudges exactly one, deterministically', async () => {
  const h = harness({
    state: [
      { sessionId: 's2', pendingTodos: 1, inProgressTodos: 0, goalPhase: 'none', openQuestions: 0 },
      { sessionId: 's1', pendingTodos: 1, inProgressTodos: 0, goalPhase: 'none', openQuestions: 0 },
    ],
  });
  await h.pulse();
  h.setState([
    { sessionId: 's2', pendingTodos: 2, inProgressTodos: 0, goalPhase: 'none', openQuestions: 0 },
    { sessionId: 's1', pendingTodos: 2, inProgressTodos: 0, goalPhase: 'none', openQuestions: 0 },
  ]);
  await h.pulse();
  assert.equal(h.nudges.length, 1);
  assert.equal(h.nudges[0].entry.sessionId, 's1', 'lowest session id wins deterministically');
});
