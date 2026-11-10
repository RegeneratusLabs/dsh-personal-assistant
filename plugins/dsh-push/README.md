# @local/dsh-push — ntfy push notifications (our own, D14)

Fire-and-forget ntfy notifications for a personal DSH host. Zero dependencies; inert unless `NTFY_URL`
is set.

- Observes the documented `session/event` feed: `turn/end` → `turn-complete`/`turn-error`/`turn-aborted`,
  `approval/asked` → `approval-requested`, and an `ask_user_question` tool call → `question-asked`.
- Payload: title, kind, session id/short title, timestamp, ntfy topic. **No message bodies, tool arguments,
  approval reasons or credentials.**
- Env only: `NTFY_URL` (e.g. `https://ntfy.sh/<topic>`), optional `NTFY_TOKEN`,
  `NTFY_MIN_INTERVAL_MS` (dedupe, default 15000). Never logged.
- 5 s timeout, no retries, max 4 in flight, fail-open (a dead endpoint never affects a turn).
- Install: `DSH_HOME=/home/josh/.dsh-personal /home/josh/dsh/node/bin/dsh plugin --profile personal add /home/josh/projects/DSH-playground/plugins/dsh-push`
- Enable: add `Environment=NTFY_URL=…` to a unit drop-in (0600 env file preferred), restart.
- Remove: `DSH_HOME=/home/josh/.dsh-personal /home/josh/dsh/node/bin/dsh plugin --profile personal remove @local/dsh-push` + restart.
