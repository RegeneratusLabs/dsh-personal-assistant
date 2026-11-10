# @local/dsh-heartbeat — quiet proactivity (our own, D14)

Default-OFF heartbeat loop. When enabled it polls cheap local projections (todos / goal / user questions)
on an interval and wakes at most one idle agent, only when the state digest changed and is actionable.

- **Default OFF**: without `DSH_HEARTBEAT=1` (or row `config.enabled: true`) `apply()` returns before
  registering a timer — structural inertness.
- Interval default 1800 s (min 300 s, via `config.intervalMs`); quiet hours default 22:00–08:00
  (`config.quietHours`); per-state/interval dedupe; no tools, no network, no shell.
- The nudge is an identified user-role message with `source.kind: "heartbeat"` (never impersonates the
  human) and is capped at 600 chars.
- Decision logic (`decision.js`) and the pulse state machine (`pulse.js`) are pure and unit-tested
  (`cd plugins/dsh-heartbeat && node --test` — 26 tests: quiet over repeated pulses, one nudge per change,
  quiet hours, dedupe, read/nudge failure containment).
- Logs go to stderr (journald sink): `heartbeat disabled …` or `heartbeat enabled: interval=… quiet=…`.
- Install: `DSH_HOME=/home/josh/.dsh-personal /home/josh/dsh/node/bin/dsh plugin --profile personal add /home/josh/projects/DSH-playground/plugins/dsh-heartbeat`
- Enable later with `Environment=DSH_HEARTBEAT=1` in a drop-in; the live nudge path is unit-tested but not
  yet exercised against a real idle agent (M2 acceptance).
- Remove: same `dsh plugin … remove @local/dsh-heartbeat` + restart.
