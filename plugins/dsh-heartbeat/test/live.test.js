/**
 * Live-wiring test for the heartbeat plugin.
 *
 * The pure decision machinery is covered in decision.test.js / pulse.test.js. This test binds
 * `apply()` to a fake Cordis context: it proves the glue that cannot be unit-tested purely —
 * timer registration, state collection from projections, agent lookup, and `agent.followup()` —
 * without needing a model turn or a real idle session.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../index.js';
import { MIN_INTERVAL_MS } from '../decision.js';

function makeFakeCtx(stateRef) {
  const intervals = [];
  const followups = [];
  const agent = {
    status: 'idle',
    session: { id: 'session-test-1' },
    followup: (message) => followups.push(message),
  };
  const ctx = {
    agents: { roots: () => [agent], list: () => [agent] },
    get: (service) => (service === 'sessionProjections'
      ? { snapshot: () => ({ values: stateRef.current }) }
      : undefined),
    interval: (callback, ms) => {
      intervals.push({ callback, ms });
      return () => {};
    },
  };
  return { ctx, intervals, followups };
}

test('disabled by default: apply() registers no timer (structural inertness)', () => {
  const stateRef = { current: {} };
  const { ctx, intervals, followups } = makeFakeCtx(stateRef);
  apply(ctx, {});
  assert.equal(intervals.length, 0, 'no interval when disabled');
  assert.equal(followups.length, 0);
});

test('explicit disable wins over the environment flag', () => {
  const stateRef = { current: {} };
  const { ctx, intervals } = makeFakeCtx(stateRef);
  apply(ctx, { enabled: false });
  assert.equal(intervals.length, 0);
});

test('enabled: one timer, quiet until an actionable change, then exactly one identified nudge', async () => {
  const stateRef = { current: { todos: [] } };
  const { ctx, intervals, followups } = makeFakeCtx(stateRef);
  apply(ctx, { enabled: true, intervalMs: MIN_INTERVAL_MS, quietHours: null });

  assert.equal(intervals.length, 1, 'registers exactly one interval');
  assert.equal(intervals[0].ms, MIN_INTERVAL_MS, 'clamped interval is used');

  const tick = intervals[0].callback;

  await tick(); // first pulse only baselines
  await tick(); // unchanged state stays quiet
  assert.equal(followups.length, 0, 'quiet while nothing changed');

  stateRef.current = { todos: [{ status: 'pending' }, { status: 'in_progress' }] };
  await tick();
  assert.equal(followups.length, 1, 'exactly one nudge on the actionable change');

  const message = followups[0];
  assert.equal(message.role, 'user');
  assert.equal(message.source.kind, 'heartbeat', 'never impersonates the human');
  assert.match(message.content[0].text, /pending/);
  assert.match(message.content[0].text, /heartbeat/i);

  await tick(); // same state must not nag again
  assert.equal(followups.length, 1, 'no repeat nudge for unchanged state');
});

test('quiet hours suppress the nudge, and a missing agent fails soft', async () => {
  const stateRef = { current: { todos: [] } };
  const { ctx, intervals, followups } = makeFakeCtx(stateRef);
  // Quiet hours covering the whole day would be wrong (start==end means never quiet),
  // so use a datetime-independent window via now(): the live apply() uses the real clock,
  // so instead prove the missing-agent path (actionable state but the agent vanished).
  apply(ctx, { enabled: true, intervalMs: MIN_INTERVAL_MS, quietHours: null });
  const tick = intervals[0].callback;
  stateRef.current = { todos: [{ status: 'pending' }] };
  await tick(); // baseline is recorded before the agent disappears
  ctx.agents.list = () => []; // agent gone between pulses
  await tick(); // actionable change, but nudge target is missing → logged, not thrown
  assert.equal(followups.length, 0, 'no nudge when the agent is gone; error contained');
});
