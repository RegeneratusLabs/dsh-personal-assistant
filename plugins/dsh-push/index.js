/**
 * dsh-push — fire-and-forget ntfy notifications for a personal DSH host.
 *
 * What it does
 * ------------
 * Observes the documented `session/event` feed (dsh-session) and publishes ONE
 * small JSON notification to an ntfy topic when:
 *
 *   - a turn closes            -> kind `turn-complete` (or `turn-error`,
 *                                 `turn-aborted`, `turn-max-tokens`,
 *                                 `turn-other` for a plugin-extended reason)
 *   - an approval is raised    -> kind `approval-requested` (`approval/asked`)
 *   - the model asks the user  -> kind `question-asked` (logged
 *                                 `ask_user_question` tool call)
 *
 * Why `session/event` and not `agent/turn-stopping`
 * ------------------------------------------------
 * `agent/turn-stopping` is a `serial` hook awaited on the turn's critical
 * path, *before* the turn boundary commits: a slow listener delays the turn,
 * the payload carries no completion reason, and the turn can still fail after
 * the listener ran. `session/event` is a post-commit, fire-and-forget observer
 * feed with documented per-listener error containment, so it can never block
 * or fail a turn, and `turn/end` carries the authoritative reason.
 * `approval/asked` is the documented log-only audit event for a pending
 * approval. The question signal is the logged `ask_user_question` tool call;
 * the plugin reads only the tool *name*, never its arguments.
 *
 * Privacy
 * -------
 * The payload is built only from the event type, the session id, the session
 * title when one has been logged, the tool *name* for approvals, and the
 * event time. Message bodies, tool arguments, approval reasons and credentials
 * are never read. `NTFY_URL` / `NTFY_TOKEN` come from the environment only and
 * are never logged (not even the host).
 *
 * Safety
 * ------
 * No dependencies (global fetch). One activation log line; inert when
 * `NTFY_URL` is unset or unusable. 5 s timeout, no retries, at most four
 * in-flight requests, a per-kind/per-session dedupe window. Every failure is
 * contained: a notification can never fail or block a turn (fail-open).
 */

export const name = 'dsh-push'

const FETCH_TIMEOUT_MS = 5_000
const DEFAULT_MIN_INTERVAL_MS = 15_000
const MAX_IN_FLIGHT = 4
const MAX_TRACKED = 512
const TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/
const TOOL_RE = /^[A-Za-z0-9_.:-]{1,64}$/

/** `turn/end` reason kind -> notification kind. */
const TURN_KINDS = new Map([
  ['completed', 'turn-complete'],
  ['error', 'turn-error'],
  ['aborted', 'turn-aborted'],
  ['max-tokens', 'turn-max-tokens'],
])

/** Notification kind -> human label used in the ntfy title. */
const LABELS = new Map([
  ['turn-complete', 'turn complete'],
  ['turn-error', 'turn failed'],
  ['turn-aborted', 'turn stopped'],
  ['turn-max-tokens', 'turn hit token limit'],
  ['turn-other', 'turn finished'],
  ['approval-requested', 'approval needed'],
  ['question-asked', 'question waiting'],
])

/** Read a trimmed environment variable; never throws. */
function env(name) {
  const value = process.env[name]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Write one diagnostic line to STDERR.
 *
 * `ctx.logger` has no console exporter in this DSH build, so a `ctx.logger`
 * record would never reach an operator; `stderr` is what the systemd unit's
 * journald sink captures. STDOUT is deliberately never touched: headless
 * `--json` owns it, and a stray line there would corrupt machine-readable run
 * output. Logging is best-effort and never throws.
 */
function logLine(message) {
  try {
    process.stderr.write(`${message}\n`)
  } catch {
    /* a closed stderr must not affect the turn */
  }
}

/** Parse `NTFY_MIN_INTERVAL_MS`; invalid/absent uses the default. */
function intervalFrom(raw) {
  if (raw === '') return DEFAULT_MIN_INTERVAL_MS
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 0) return DEFAULT_MIN_INTERVAL_MS
  return value
}

/** The ntfy topic named by the URL's last path segment, or null. */
function topicFrom(url) {
  const parts = url.pathname.split('/').filter((part) => part !== '')
  if (parts.length === 0) return null
  let decoded
  try {
    decoded = decodeURIComponent(parts[parts.length - 1])
  } catch {
    return null
  }
  return TOPIC_RE.test(decoded) ? decoded : null
}

/** A tool name safe to echo, or '' when it is not one. */
function cleanTool(value) {
  return typeof value === 'string' && TOOL_RE.test(value) ? value : ''
}

/** Short stable handle for a session id (`session-92a7028e…` -> `92a7028e`). */
function shortSessionId(id) {
  const bare = id.startsWith('session-') ? id.slice('session-'.length) : id
  return bare.slice(0, 8)
}

/** ISO-8601 timestamp from the event's epoch-millisecond time. */
function isoTimestamp(timeMs) {
  const value = Number.isFinite(timeMs) ? timeMs : Date.now()
  try {
    return new Date(value).toISOString()
  } catch {
    return new Date().toISOString()
  }
}

/**
 * Register the notifier. The plugin is inert (one log line, no network) when
 * `NTFY_URL` is unset, unparsable, not http(s), or does not name a topic.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 */
export function apply(ctx) {
  const endpoint = env('NTFY_URL')
  const token = env('NTFY_TOKEN')
  const minIntervalMs = intervalFrom(env('NTFY_MIN_INTERVAL_MS'))

  if (endpoint === '') {
    logLine('[dsh-push] inert: NTFY_URL is not set — no push notifications will be sent')
    return
  }

  let url = null
  try {
    url = new URL(endpoint)
  } catch {
    url = null
  }
  if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    logLine('[dsh-push] inert: NTFY_URL is not a valid http(s) URL — no push notifications will be sent')
    return
  }
  const topic = topicFrom(url)
  if (topic === null) {
    logLine('[dsh-push] inert: NTFY_URL does not name an ntfy topic path — no push notifications will be sent')
    return
  }

  /** Dedupe watermark per `${kind}\0${sessionId}` (bounded). */
  const lastSent = new Map()
  let inFlight = 0

  logLine(`[dsh-push] active: ntfy notifications enabled (min interval ${minIntervalMs} ms)`)

  function warn(error) {
    const name = error instanceof Error ? error.name : 'error'
    const code = error?.cause?.code
    logLine(`[dsh-push] send failed: ${name}${typeof code === 'string' ? ` (${code})` : ''}`)
  }

  /** Best-effort POST; never throws, never awaited by the caller. */
  function send(payload) {
    inFlight += 1
    const headers = { 'content-type': 'application/json; charset=utf-8' }
    if (token !== '') headers.authorization = `Bearer ${token}`
    let pending
    try {
      pending = fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
    } catch (error) {
      inFlight -= 1
      warn(error)
      return
    }
    void Promise.resolve(pending)
      .then(async (response) => {
        if (!response.ok) {
          logLine(`[dsh-push] send failed: HTTP ${response.status}`)
        }
        try {
          await response.body?.cancel()
        } catch {
          /* the body is not needed */
        }
      })
      .catch((error) => warn(error))
      .finally(() => {
        inFlight -= 1
      })
  }

  function notify(kind, session, timeMs, extra) {
    const sessionId = typeof session?.id === 'string' ? session.id : ''
    if (sessionId === '') return
    const now = Date.now()
    const key = `${kind}\u0000${sessionId}`
    const previous = lastSent.get(key)
    if (previous !== undefined && now - previous < minIntervalMs) return
    lastSent.set(key, now)
    while (lastSent.size > MAX_TRACKED) lastSent.delete(lastSent.keys().next().value)
    if (inFlight >= MAX_IN_FLIGHT) return

    const shortId = shortSessionId(sessionId)
    // Notification text never carries the session title: DSH derives that title
    // from the first user message, so forwarding it would leak prompt content to
    // the push provider — exactly what "no message bodies" promises not to do.
    const payload = {
      title: `DSH: ${LABELS.get(kind) ?? 'event'}`,
      message: `session ${shortId}`,
      kind,
      sessionId,
      ...(extra === undefined ? {} : extra),
      timestamp: isoTimestamp(timeMs),
      topic,
    }
    send(payload)
  }

  ctx.on('session/event', (session, event) => {
    try {
      if (event === null || typeof event !== 'object') return
      switch (event.type) {
        case 'turn/end': {
          const reason = event.data?.reason?.kind
          notify(TURN_KINDS.get(reason) ?? 'turn-other', session, event.time)
          return
        }
        case 'approval/asked': {
          const tool = cleanTool(event.data?.toolName)
          notify('approval-requested', session, event.time, tool === '' ? undefined : { tool })
          return
        }
        case 'tool/call':
          if (event.data?.name === 'ask_user_question') notify('question-asked', session, event.time)
          return
        default:
          return
      }
    } catch (error) {
      const kind = error instanceof Error ? error.name : 'error'
      logLine(`[dsh-push] observer failed: ${kind}`)
    }
  })
}
