#!/usr/bin/env node
// dsh-pwa-autologin-proxy — tailnet-edge authentication for the DSH Web GUI.
//
// DSH's Web auth mints a random launch token per process and accepts it only at
// `GET /?token=…`, where it sets a signed cookie whose *name* is bound to the
// request authority (sha256 of host[:port]). Clients whose cookie jar is
// isolated from any normal tab (PWA wrappers, WebView apps, the Firefox PWA
// extension, …) can never perform that exchange, and a browser that already
// holds a cookie for a *different* port/authority sends it anyway — cookies are
// not port-scoped — so DSH finds no cookie under the name it expects and
// answers 401. That is the "same auth page" trap this proxy removes.
//
// The proxy runs on loopback in front of a DSH Web listener on the tailnet path
// and, per request, looks for the exact cookie name DSH will accept for the Host
// that arrived. If that cookie is missing, it exchanges the newest launch token
// from the host's log for the real signed cookie and appends it (HTTP and the
// /api/remote.mux WebSocket alike). If the cookie is present but stale, a 401
// triggers one re-mint and a retry. Requests that carry the right cookie are
// forwarded untouched, and DSH itself still requires the token for direct
// loopback access — the proxy binds 127.0.0.1 so only `tailscale serve` reaches
// it.
//
// Usage: node dsh-pwa-autologin-proxy.mjs
//   env DSH_PROXY_PORT      listen port (default 7006)
//   env DSH_UPSTREAM_PORT   DSH Web port (default 7000)
//   env DSH_WEB_LOG         log file with the launch-token URL (default ~/dsh/logs/web.log)
//   env DSH_PROXY_LABEL     name for verbose log lines (default proxy-<port>)
//   env DSH_PROXY_VERBOSE   "1" logs request/upstream lines to stdout (journald)
//   env DSH_AUTOLOGIN_ALLOW optional comma-separated client IPs (X-Forwarded-For)
//                           allowed to auto-authenticate; empty = any tailnet client
import http from 'node:http'
import { createHash } from 'node:crypto'
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LISTEN = Number(process.env.DSH_PROXY_PORT ?? 7006)
const UPSTREAM_HOST = '127.0.0.1'
const UPSTREAM_PORT = Number(process.env.DSH_UPSTREAM_PORT ?? 7000)
const LOG_PATH = process.env.DSH_WEB_LOG ?? join(homedir(), 'dsh', 'logs', 'web.log')
const LABEL = process.env.DSH_PROXY_LABEL ?? `proxy-${LISTEN}`
const VERBOSE = process.env.DSH_PROXY_VERBOSE === '1'
const ALLOW = (process.env.DSH_AUTOLOGIN_ALLOW ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const TOKEN_RE = /token=([A-Za-z0-9_-]{16,})/g
const COOKIE_PREFIX = 'dsh-auth-'

let cachedToken
let cachedTokenAt = 0

/** Newest launch token printed by the running `dsh web` process. */
function latestToken() {
  if (cachedToken !== undefined && Date.now() - cachedTokenAt < 3000) return cachedToken
  cachedTokenAt = Date.now()
  let fd
  try {
    fd = openSync(LOG_PATH, 'r')
    const size = fstatSync(fd).size
    const length = Math.min(size, 256 * 1024)
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, size - length)
    const matches = [...buffer.toString('utf8').matchAll(TOKEN_RE)]
    cachedToken = matches.length > 0 ? matches[matches.length - 1][1] : undefined
  } catch {
    cachedToken = undefined
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
  return cachedToken
}

/** DSH's cookie audience for a plain-HTTP listener: WHATWG host[:port]. */
function authorityFor(host) {
  try {
    return new URL(`http://${host}`).host
  } catch {
    return host
  }
}

/** The exact cookie name DSH's BrowserAuth looks for on this authority. */
function cookieNameFor(authority) {
  return COOKIE_PREFIX + createHash('sha256').update(authority).digest('base64url')
}

/** Cookie names present on the request (values are never logged). */
function cookieNames(header) {
  if (typeof header !== 'string' || header.length === 0) return []
  return header
    .split(';')
    .map((segment) => segment.split('=')[0].trim())
    .filter((name) => name.length > 0)
}

function hasCookieNamed(header, name) {
  return cookieNames(header).includes(name)
}

/** Replace (or append) one cookie in a Cookie header, keeping the rest. */
function withCookie(header, name, value) {
  const segments =
    typeof header === 'string' && header.length > 0
      ? header
          .split(';')
          .map((segment) => segment.trim())
          .filter((segment) => segment.split('=')[0].trim() !== name)
      : []
  segments.push(`${name}=${value}`)
  return segments.join('; ')
}

function clientAllowed(req) {
  if (ALLOW.length === 0) return true
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
  const ip = forwarded || req.socket.remoteAddress || ''
  return ALLOW.includes(ip)
}

/** authority -> Promise<string> where the string is "name=value" for a Cookie header. */
const cookieCache = new Map()

/**
 * Exchange the current launch token for a browser-session cookie bound to
 * `authority` (the exact Host the tailnet client used, e.g. host:8454).
 */
function ensureCookie(authority) {
  const cached = cookieCache.get(authority)
  if (cached !== undefined) return cached
  const pending = new Promise((resolve, reject) => {
    const token = latestToken()
    if (token === undefined) {
      reject(new Error(`no launch token in ${LOG_PATH}`))
      return
    }
    const request = http.request(
      {
        host: UPSTREAM_HOST,
        port: UPSTREAM_PORT,
        method: 'GET',
        path: `/?token=${token}`,
        headers: { host: authority, accept: 'text/html', 'user-agent': 'dsh-pwa-autologin-proxy' },
      },
      (response) => {
        const raw = response.headers['set-cookie']
        const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]
        const auth = cookies
          .map((value) => value.split(';')[0])
          .find((value) => value.startsWith(COOKIE_PREFIX))
        response.resume()
        if (auth === undefined) {
          reject(new Error(`token exchange returned no auth cookie (status ${response.statusCode}) for ${authority}`))
          return
        }
        if (VERBOSE) console.log(`${LABEL}: minted ${auth.split('=')[0]} for ${authority}`)
        resolve(auth)
      },
    )
    request.on('error', reject)
    request.end()
  })
  cookieCache.set(authority, pending)
  pending.catch(() => cookieCache.delete(authority))
  return pending
}

function splitCookie(header) {
  const at = header.indexOf('=')
  return at === -1 ? [header, ''] : [header.slice(0, at), header.slice(at + 1)]
}

function proxy(req, res, attempt = 0, forcedCookie = undefined) {
  const authority = authorityFor(req.headers.host ?? 'homelab.taildace6c.ts.net')
  const expected = cookieNameFor(authority)
  const original = req.headers.cookie
  const headers = { ...req.headers }
  headers.host = req.headers.host ?? 'homelab.taildace6c.ts.net'
  const allowed = clientAllowed(req)
  const alreadyMinted = forcedCookie !== undefined
  const hasOwn = hasCookieNamed(original, expected)
  const inject = !hasOwn && allowed

  if (VERBOSE && attempt === 0) {
    console.log(
      `${LABEL}: ${req.method} ${headers.host} ${String(req.url).slice(0, 70)} ` +
        `ua="${String(req.headers['user-agent'] ?? '-').slice(0, 120)}" dest=${req.headers['sec-fetch-dest'] ?? '-'} ` +
        `cookies=[${cookieNames(original).join(',')}] expected=${hasOwn ? 'ok' : 'missing'} ${inject ? 'inject' : 'pass'}` +
        `${attempt > 0 ? ' retry' : ''}`,
    )
  }

  const send = (cookieHeader) => {
    // Build the header set BEFORE creating the request: Node snapshots it.
    const outbound = { ...headers }
    if (cookieHeader !== undefined) outbound.cookie = cookieHeader
    else delete outbound.cookie
    const upstream = http.request(
      {
        host: UPSTREAM_HOST,
        port: UPSTREAM_PORT,
        method: req.method,
        path: req.url,
        headers: outbound,
      },
      (up) => {
        if (VERBOSE && (req.url === '/' || String(req.url).startsWith('/api') || attempt > 0)) {
          console.log(`${LABEL}: upstream ${up.statusCode} ${req.method} ${String(req.url).slice(0, 60)}`)
        }
        // A 401 after we supplied credentials means the cached cookie is stale
        // (secret rotation) or the client's own cookie was minted elsewhere.
        // Re-mint once and retry; only GET/HEAD are safe to replay.
        if (up.statusCode === 401 && attempt === 0 && allowed && (req.method === 'GET' || req.method === 'HEAD')) {
          up.resume()
          cookieCache.delete(authority)
          ensureCookie(authority)
            .then((minted) => {
              const [name, value] = splitCookie(minted)
              proxy(req, res, 1, withCookie(original, name, value))
            })
            .catch((error) => {
              if (!res.headersSent) {
                res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
                res.end(`dsh-pwa-autologin-proxy: re-auth failed: ${error.message}\n`)
              }
            })
          return
        }
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res)
      },
    )
    upstream.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(`dsh-pwa-autologin-proxy: upstream error: ${err.message}\n`)
      } else {
        res.destroy(err)
      }
    })
    if (attempt === 0) {
      req.pipe(upstream)
    } else {
      // Retry after a 401: the request stream was consumed by the first
      // attempt, and retries are GET/HEAD only.
      req.resume()
      upstream.end()
    }
  }

  if (alreadyMinted) {
    send(forcedCookie)
    return
  }
  if (!inject) {
    // "Pass through" means the client already holds the cookie DSH expects:
    // forward it verbatim. send(undefined) would DELETE the Cookie header
    // (see outbound cleanup below), so every request from an already-logged-in
    // client would reach DSH unauthenticated — 401 on all POSTs, which are the
    // session list/create paths and are never retried.
    send(original)
    return
  }
  ensureCookie(authority).then(
    (minted) => send(withCookie(original, ...splitCookie(minted))),
    (error) => {
      if (VERBOSE) console.log(`${LABEL}: mint failed for ${authority}: ${error.message}`)
      // Fall back to the unauthenticated request: DSH answers 401 and the
      // client shows its normal message instead of a proxy error.
      send(undefined)
    },
  )
}

const server = http.createServer((req, res) => {
  proxy(req, res)
})

// DSH's live channel is a WebSocket (/api/remote.mux); pass the handshake and
// the byte stream through with the edge-authenticated cookie.
server.on('upgrade', (req, socket, head) => {
  const authority = authorityFor(req.headers.host ?? 'homelab.taildace6c.ts.net')
  const expected = cookieNameFor(authority)
  const headers = { ...req.headers, host: req.headers.host ?? 'homelab.taildace6c.ts.net' }
  const original = req.headers.cookie
  const hasOwn = hasCookieNamed(original, expected)
  const inject = !hasOwn && clientAllowed(req)
  if (VERBOSE) {
    console.log(
      `${LABEL}: upgrade ${String(req.url)} ${headers.host} cookies=[${cookieNames(original).join(',')}] ` +
        `expected=${hasOwn ? 'ok' : 'missing'} ${inject ? 'inject' : 'pass'}`,
    )
  }
  const start = (cookieHeader) => {
    if (cookieHeader !== undefined) headers.cookie = cookieHeader
    const upstream = http.request({
      host: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      method: req.method,
      path: req.url,
      headers,
    })
    upstream.on('upgrade', (upRes, upSocket, upHead) => {
      const lines = [`HTTP/1.1 ${upRes.statusCode ?? 101} ${upRes.statusMessage ?? 'Switching Protocols'}`]
      for (let i = 0; i < upRes.rawHeaders.length; i += 2) {
        lines.push(`${upRes.rawHeaders[i]}: ${upRes.rawHeaders[i + 1]}`)
      }
      socket.write(`${lines.join('\r\n')}\r\n\r\n`)
      if (upHead !== undefined && upHead.length > 0) socket.write(upHead)
      if (head !== undefined && head.length > 0) upSocket.write(head)
      upSocket.pipe(socket)
      socket.pipe(upSocket)
    })
    upstream.on('response', (upRes) => {
      const lines = [`HTTP/1.1 ${upRes.statusCode ?? 502} ${upRes.statusMessage ?? 'Error'}`]
      for (let i = 0; i < upRes.rawHeaders.length; i += 2) {
        lines.push(`${upRes.rawHeaders[i]}: ${upRes.rawHeaders[i + 1]}`)
      }
      socket.write(`${lines.join('\r\n')}\r\n\r\n`)
      upRes.pipe(socket)
    })
    upstream.on('error', () => socket.destroy())
    upstream.end()
  }
  if (!inject) {
    start(undefined)
    return
  }
  ensureCookie(authority).then(
    (minted) => start(withCookie(original, ...splitCookie(minted))),
    (error) => {
      if (VERBOSE) console.log(`${LABEL}: upgrade mint failed for ${authority}: ${error.message}`)
      start(undefined)
    },
  )
})

server.listen(LISTEN, '127.0.0.1', () => {
  console.log(
    `${LABEL}: http://127.0.0.1:${LISTEN} -> http://${UPSTREAM_HOST}:${UPSTREAM_PORT}` +
      ` (token from ${LOG_PATH}; allow=${ALLOW.length === 0 ? 'any tailnet client' : ALLOW.join(',')})`,
  )
})
