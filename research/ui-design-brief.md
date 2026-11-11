# UI design brief — the assistant's own surfaces

Status: **approved and slice 1 shipped to the coding host 2026-11-11** — direction: hybrid (A bones + B voice); read-only Status/Health at 1440 + 390 in both palettes; one "Assistant" entry with tabs. Implementation lives in `plugins/dsh-status/` and is verified by `scripts/verify-dsh-status-ui.mjs` (16/16 checks, 0 console errors, screenshots `artifacts/ui/status-*`). Not yet installed on `personal` (needs approval).
Track handover: [`ui-handover.md`](ui-handover.md). Verified seams: [`ui-primitives-slots.md`](ui-primitives-slots.md).
Data contracts: [`ui-data-inventory.md`](ui-data-inventory.md). Mockups are local evidence in `artifacts/ui/` (gitignored).

## 1. What this brief decides

1. How the assistant's surfaces fit into DSH's existing Web UI without duplicating it.
2. The visual system: which DSH tokens we consume, which local layer we own, and what we never invent.
3. Three visual directions (A instrument panel, B warm notebook, C minimal extension) with mockups.
4. The component kit every later panel reuses.
5. The **first vertical slice** (read-only Status/Health) scoped to what can ship, test and be rolled back.

Everything below is grounded in the installed 0.2.2-rc.1 shell and our two working client plugins, not in
the docs' aspirational source tree. Where the handover was wrong, §2.4 records the correction.

## 2. Ground truth (verified 2026-11-11)

### 2.1 What the shell already owns

Conversation, sidebar, right panel, terminal, files, settings, approvals, model picker, plugins page.
We **extend** it with client bundles; we do not restyle the shell, fork the web app, or build a second chat client.

### 2.2 Seams we will use (all verified against the live host)

| Seam | Use | Contract |
|---|---|---|
| `sidebar.panellist` | one entry in the left sidebar | list slot; `id` must equal the `main` panel key; the component is the **icon only** and receives `{ size, active }` |
| `main` | the panel page | keyed slot; `main.key = <panel id>`; **not Session-scoped**; pad for `--dsh-frame-top-clearance` (48px) |
| `ctx.layout.selectPanel(id)` | sidebar row → page | throws on an unregistered key; `null` returns to conversation |
| `ctx.slots.inject/register` | registration | `locale: NS` gives `props.t`; `label: () => t(...)` for the row |
| `ctx.connection.fetch.register` | host route | `{ path: '/api/<pkg>/<name>', methods: ['GET'], requestBody: 'buffered', fetch: async (req) => Response }`; auth + Host/Origin fence + owner check run before the handler; the handler owns the status (a throw aborts, it is not a 500) |
| `ctx.locale.register/bind` | copy | `en` + `zh` dictionaries; every visible string goes through `t` |
| `ctx.theme` | palette | read-only for us; light/dark/system already handled by the theme owner |

Client halves are hand-written plain JS (`window.__ModuleLoader__.load`), zero build step. `react` and
`react-dom` come from the host. `require('@deepseek-ai/dsh-client-ui-primitives')` works at runtime because
the shell seeds it — **but it is not installed as a package**, so there are no types for it (§2.4).

### 2.3 What the browser may not do

Never read files, credentials, Hindsight or systemd from the browser. Every datum arrives through one
authenticated `/api` route whose target (unit, bank, home, scripts) is a **constant**, never a request
parameter. The route is read-only; no write verb is added in this slice.

### 2.4 Corrections to the handover (do not design against these)

1. **No `ui-primitives` package is installed.** There is no `Card`, `Panel`, `List`, `Table`, `EmptyState`,
   `Spinner`, `Badge` or `Dialog` export. The kit supplies atoms (`Button`, `Tag`, `Pill`, `StateDot`,
   `SegmentedTabs`, `Modal`, `RiskConfirmation`, `AnimatedRows`, `MarkdownText`, `DetailDocument`, `Tooltip`,
   `Input`, `Switch`, `relativeTime`, icon set). **Cards, rows, empty/error/loading blocks and the page frame
   are ours to build on tokens.**
2. **`host-control`'s status route reports the serving host, not the assistant.** On the coding host it shows
   `dsh-web.service`. The new route must target `dsh-personal` explicitly (`DSH_PERSONAL_HOME || ~/.dsh-personal`,
   unit `dsh-personal.service`, bank `dsh-personal`), or it will silently show the wrong agent.
3. **There is no digest JSON** — the digest is Markdown. Aggregate `check-alerts`, egress summary, curator and
   cost JSON instead of parsing digest text.
4. **Both reference plugins hard-code hex colours**; the handover says don't. The new kit consumes tokens only.
5. **Neither plugin pauses polling when the tab is hidden.** Ours must (single interval, visibility-gated,
   backoff, one request per refresh).
6. **`GET /v1/default/banks` lists other (Hermes-owned) banks.** Never call it, never expose a bank picker.
7. **`dsh-profiles` prints tailnet hostnames into the public repo.** Our panel shows `127.0.0.1:7002` or
   "local host" only.

## 3. Product frame

A single-user, always-on personal agent on a homelab host. The Web UI is the trusted, owner-authenticated
console — the place where the human checks the agent, not a dashboard for an audience.

**Principles**

1. **Honest state over liveliness.** Real timestamps, real ages, explicit "unknown"/"not available". No pulsing
   "AI is thinking" chrome, no fake metrics, no green badge that means "we didn't check".
2. **Calm by default; colour is an event.** Normal operation is monochrome + one accent. Amber means "look at
   this", red means "act", and neither is used for decoration or for a memory-only failure (memory fail-open
   is a *blind spot*, not an outage).
3. **Read-only first.** v1 observes. Every write (delete, toggle, restart) arrives later with its own route,
   confirmation and policy — never bolted onto the status route.
4. **Provenance is visible.** Memory text, session text and script detail are untrusted data. They render as
   text, in their own labelled region, never as instructions, never as HTML.
5. **The panel is a surface, not a product.** It sits inside DSH: same sidebar, same settings material, same
   focus ring, same reduced-motion rules. A reviewer should not be able to tell where DSH ends and we begin
   except for the content.

## 4. Information architecture

### 4.1 Navigation (recommended)

One new sidebar entry, **Assistant**, id `assistant`, icon a pulse glyph. It opens a keyed `main` panel with
internal tabs (DSH's `SegmentedTabs`): **Status · Memory · Activity**. Only implemented tabs render; the slice
ships Status, Memory arrives second, Activity third. Settings surfaces (push, heartbeat, retention, host control)
stay where they already live: `settings.section`.

Why one entry: the sidebar already has eight entries; the assistant's surfaces are one product with one home,
and every later slice is a tab rather than another row. The panel id is fixed on day one (`assistant`) so slice 2
does not re-key it.

Alternative (if you prefer app-like separation): separate `status` and `memory` sidebar entries. Cheaper per
slice, noisier sidebar, and the "one place to look at the agent" idea is lost. **Recommend one entry + tabs.**

Surface roadmap:

| Tab / surface | Slice | Read/write |
|---|---|---|
| Status / Health | 1 (this brief) | read-only |
| Memory (documents, observations, search, curator) | 2 | read-only; delete later, explicit confirm + `forget.sh` policy |
| Activity (sessions, approvals history, heartbeat state, jobs) | 3 | read-only |
| Identity (SOUL viewer/editor, diff preview, restart callout) | 4 | write, confirm + restart |
| Settings sections (push, heartbeat, retention, channel placeholder) | 4–5 | write, confirm |
| Approvals polish | only where it hurts | uses the existing approval seam |
| Channel | parked — no UI | — |

### 4.2 Page anatomy (all tabs)

`PanelPage` = title row (eyebrow path, `h1`, status pill, freshness, refresh) → content → `SourceStrip` footer.
Content width: 1180px (A), 1080px (B), 900px (C). The page is the only scroll container; the shell owns the
sidebar. At <768px the sidebar is a drawer (shell behaviour) and the page drops to a single column.

### 4.3 Status tab content groups

1. **Agent** — unit state, uptime, version, address, pending/failed plugins (the "is it alive" answer).
2. **Needs attention** — alerts from `check-alerts`, grouped by severity; empty state is "No alerts — 11 checks
   ran at 07:00", never a green banner.
3. **Memory** — bank health, document/observation/node/link counts, last write, consolidation, curator cadence.
4. **Safety** — backup age vs limit, egress destinations in 24h (observed, not blocked), retention inventory.
5. **Rhythm** — scheduled jobs (user + system scope) with next/last, token cost today, 7-day memory LLM usage.
6. **Identity** — SOUL presence, size, last modified (metadata only in slice 1).
7. **Footer** — per-source freshness ("9 sources fresh · generated 12:19:53 · read-only") and stale badges.

Groups 1–7 are the same data the route returns; the three directions differ in how much of it is always visible.

## 5. Visual system

### 5.1 Token strategy

Three layers, one owner each:

- **Static palette** (`--dsw-static-*`) — theme-owned, never referenced by us.
- **Semantic aliases** (`--dsw-alias-*`, `--dsw-specific-*`) — what we consume. All colours, borders and
  category fills come from here; no literal hex, no `rgba()` neutrals.
- **Local layout tokens** (`--dsl-*`, our names) — only geometry and motion that DSH does not tokenise
  (spacing steps, page gutter, chart size, durations). Values, not colours.

Theme switching is the theme owner's job (`body` aliases for light, `body[data-ds-dark-theme]` overrides for
dark). We write both palettes once, through tokens, and verify light + dark.

### 5.2 Palette (real values, captured from the running shell)

| Role | Token | Light | Dark |
|---|---|---|---|
| canvas | `--dsw-alias-bg-base` | `#fff` | `#151517` |
| raised surface | `--dsw-alias-bg-layer-2` | `#fff` | `#2c2c2e` |
| inset surface | `--dsw-alias-bg-layer-3` | `#fff` | `#353638` |
| sidebar | `--dsw-specific-sidebar-fill` | `#f9fafb` | `#1b1b1c` |
| sidebar active | `--dsw-specific-sidebar-nav-item-active` | `#ebeef2` | `#43454a` |
| text primary | `--dsw-alias-label-primary` | `#0f1115` | `#f9fafb` |
| text secondary | `--dsw-alias-label-secondary` | `#61666b` | `#cfd3d6` |
| text tertiary | `--dsw-alias-label-tertiary` | `#81858c` | `#adb2b8` |
| caption | `--dsw-alias-label-caption` | `#adb2b8` | `#81858c` |
| hairline | `--dsw-alias-border-l1` | `#0000000a` | `#ffffff0f` |
| divider | `--dsw-alias-border-l2` | `#0000001a` | `#ffffff1f` |
| strong border | `--dsw-alias-border-l4` | `#00000029` | `#fff3` |
| card fill / stroke | `--dsw-alias-settings-card-fill` / `-stroke` | `#fff` / `#00000029` | `#2c2c2e` / `#fff3` |
| accent (link/info) | `--dsw-alias-state-business-primary` | `#4176e6` | `#7aaaff` |
| success | `--dsw-alias-state-success-primary` | `#22c55e` | `#22c55e` |
| warning | `--dsw-alias-state-warn-primary` | `#f59e0b` | `#f59e0b` |
| error | `--dsw-alias-state-error-primary` | `#ec1313` | `#f25a5a` |
| idle | `--dsw-alias-state-idle-primary` | `#d4d4d4` | `#545557` |
| done / distinctive | `--dsw-alias-state-done-primary` | `#7c3aed` | `#a78bfa` |
| hover / active | `--dsw-alias-interactive-bg-hover(-solid)` | `#2631480f` / `#f1f3f5` | `#ffffff14` / `#353638` |

Status tints for chips: `--dsw-alias-state-{success,warn,error}-tertiary` as the fill, the primary as the text.

### 5.3 Type scale (theme-owned)

| Role | Token | Spec |
|---|---|---|
| micro / eyebrow | `--dsw-font-xxxs-11` (500) | 11/14, letter-spacing .08em, uppercase |
| caption | `--dsw-font-xxs-12` | 12/18 |
| dense label | `--dsw-font-xs-13` | 13/20 |
| body | `--dsw-font-s-14` | 14/22 |
| strong body | `--dsw-font-s-strong-14` | 500 14/22 |
| section title | `--dsw-font-base-strong-16` | 500 16/24 |
| panel title | `--dsw-font-l-20` (600 in practice) | 20/28 |
| hero (direction B only) | `--dsw-font-xl-24` / brand face | 24/32–30/38 |
| numbers / IDs | `--dsl-font-mono` = `--ds-font-family-code` | SF Mono / JetBrains Mono, `tabular-nums` |

No new typefaces. Direction B may use the already-shipped brand face (`--dsw-font-family-brand`, Montserrat,
OFL) for the one hero line — no network load, no new dependency.

### 5.4 Spacing, radius, elevation, focus, motion

DSH has **no spacing tokens**; we adopt a 4px grid as local constants: 4, 8, 12, 16, 20, 24, 32, 40.
Page gutter 32 (16 on mobile), section gap 28, card padding 20, row height 32 (dense) / 40 (comfortable).

Radius per the DSH standard: 4 xs (tiny), 8 sm (compact controls ≤28px), 12 md (32–40px controls/rows),
16 lg (grouped content, menus), 20 xl (independent cards), 28 panel (enclosing surface, dialogs). Full-round
only with `corner-shape: round`.

Elevation: cards are **not** elevated — `border: .5px solid var(--dsw-alias-settings-card-stroke)` +
`background: var(--dsw-alias-settings-card-fill)`. Elevation (`--dsw-elevation-panel/prominent`) only for
floating layers (menu, dialog, toast). Never a border plus an elevation shadow on the same neutral surface.

Focus: never restyle. The shell draws `outline: 2px var(--dsw-focus-ring-color, accent)` on `:focus-visible`;
we keep it visible, never `outline: none` without a replacement, and test keyboard order.

Motion: local durations only — 120ms (state change), 180ms (row/card enter), 240ms (page fade). Ease-out.
`@media (prefers-reduced-motion: reduce)` removes all non-essential animation (no stagger, no fade). No looping
animation except the shared `StateDot state="ongoing"` spinner, which is a status, not decoration.

## 6. Three visual directions

All three use the same tokens, the same data and the same component kit; they differ in composition, density,
type hierarchy and motion — which is exactly what should be expensive to change later. Mockups: light and dark
at 1440×1000, plus 390px, in `artifacts/ui/{A,B,C}-*.png` (local evidence, not committed).

### A — Instrument panel (recommended)

**Mockup (light):** `artifacts/ui/A-instrument-1440-light.png` · dark: `A-instrument-1440-dark.png`

- **Mood:** a calm cockpit. Monochrome, hairline-ruled, numbers first. It looks like a tool that tells the truth
  and does not perform. Closest to "trust and calm" without becoming cold.
- **Typography:** dense scale. 13px labels, 14px body, 20/28 numbers with `tabular-nums`, 11px uppercase
  eyebrows. Mono only for units, paths and timers.
- **Density:** highest. Four vitals cells, then a 1.35/1 two-column body of flat sections separated by
  hairlines — no card-on-card stacking. Everything material fits above the fold at 1440×1000.
- **Tokens:** `bg-base` canvas, `border-l1/l2` rules, `label-secondary` for keys, `warn`/`ok` only as 6px dots
  and 24px chips. No card fill; the only fill is the vitals strip (`bg-base` + border).
- **Motion:** 120ms background on row hover, 12ms stagger on first paint (reduced-motion: none).
- **Strength:** scales to Memory/Activity without redesign; a reviewer can scan state in one pass; honesty is
  built into the layout ("checked 07:00", "baseline 2/3", "observed, not blocked").
- **Risk:** at 390px the dense rows need care (resolved: 2×2 vitals, single column, same rows); it is the least
  "friendly" of the three for the identity surface.

### B — Warm notebook

**Mockup (light):** `artifacts/ui/B-notebook-1440-light.png` · dark: `B-notebook-1440-dark.png`

- **Mood:** a written page, not a dashboard. One sentence at the top answers "is everything fine?"; details are
  folded underneath. Human voice ("Your assistant has been running since 07:44…"), generous air.
- **Typography:** larger. 30/38 hero in the brand face, 15/26 lede, 14/22 body, 34/38 card numerals.
- **Density:** low. Three cards, then disclosure rows. Roughly half the facts of A are visible before folding.
- **Tokens:** `settings-card-fill` surfaces at radius-xl, `label-secondary` body, accent dot per card category;
  still no decorative colour. Warmth comes from space, type and copy — not from inventing warm hues (amber is a
  warning in DSH and we will not overload it).
- **Motion:** 220ms fade-up for cards on first paint, 120ms disclosure open; reduced-motion: none.
- **Strength:** best for identity/memory-first reading and for non-technical moments; the sentence layer doubles
  as an accessibility summary.
- **Risk:** hides too much for "is egress still only DeepSeek?"; more vertical space per fact; the brand hero
  competes with the shell's own brand.

### C — Minimal extension

**Mockup (light):** `artifacts/ui/C-minimal-1440-light.png` · dark: `C-minimal-1440-dark.png`

- **Mood:** indistinguishable from a first-party settings page. Zero visual invention: settings cards,
  label/value rows, segmented tabs.
- **Typography:** exactly the shell's 13/20 rows, 20/28 title, no hero, no display face.
- **Density:** medium. Every fact is one 42px row; the page scrolls at 1440×1000 (four groups).
- **Tokens:** only `settings-card-fill/stroke`, `border-l1`, `label-*`, `Tag`, `StateDot`.
- **Motion:** none. Native only.
- **Strength:** lowest risk, fastest to build and review, trivially consistent with Settings; cannot look wrong
  next to DSH's own pages.
- **Risk:** reads as configuration, not as "the agent"; the long scroll buries alerts; least distinctive, and
  Memory later wants richer rows than settings allows.

### Recommendation — chosen (2026-11-11)

**A for the bones, B for the voice, C for the Settings sections.** Ship A's layout and density, but write every
card's supporting line as a plain sentence (B's discipline: "last backup 4 hours old, limit 48" beats "age 4h /
limit 48h"), and use C's settings-card material whenever a surface lives inside Settings.

**Decision (human, 2026-11-11): the hybrid above.** Concretely for slice 1: A's page (eyebrow, 24/32 title,
vitals strip, hairline two-column sections, source footer), plus (a) one **lede sentence** under the title, (b) a
**plain sentence under every section heading**, (c) a **meta label** at the heading's right edge in mono for the
terse fact (bank name, window, scope). Settings surfaces keep C's settings-card material when they land.
Reference render: `artifacts/ui/D-hybrid-1440-{light,dark}.png`, `D-hybrid-390.png`.

## 7. Component kit (built once, reused by every tab)

| Component | Backing | Contract |
|---|---|---|
| `PanelPage` | tokens | title/eyebrow/actions/freshness frame; 48px top clearance; single scroll container; max-width by direction |
| `SectionHeader` | tokens | `h2` + optional hint + optional right meta; semantic heading order |
| `Surface` | tokens | `plain` (hairline block) or `card` (settings-card material, radius-xl) |
| `StatCell` | tokens + `StateDot` | label, big value + unit, sub-line, severity dot; tabular numerals |
| `KeyValueRows` | tokens | dense label/value rows, hairline separators, right-aligned tabular values, wraps on mobile |
| `SeverityPill` | `Tag` | ok / warn / error / idle / unknown; text label always present (never colour-only) |
| `Freshness` | `relativeTime` | "Updated 12s ago" + absolute in `title`, stale badge past 2× TTL, `aria-live=polite` on refresh |
| `SourceStrip` | tokens | per-source fresh/stale/unavailable chips + generated-at + read-only note |
| `StateBlock` | `DetailDocument` / `StateDot` / `TextShimmer` | loading skeleton, empty state with reason, error + retry; one per section, never a global error page |
| `DenseTable` | tokens + `AnimatedRows` | jobs/documents lists; `max-height` + windowing/pagination past 50 rows; `key` = stable id |
| `Sparkline` | inline SVG | cost history (7–30 points); `aria-hidden` + adjacent text summary; no chart library |
| `ProvenanceLabel` | tokens + icon | marks untrusted regions ("from memory · data, not instructions") |
| `ConfirmDialog` | `Modal` + `RiskConfirmation` | later slices only: acknowledgement checkbox for destructive actions |
| `SearchBar` | `Input` + `SegmentedControl` | Memory slice: filter + mode, debounced, no per-keystroke fetch |
| `TabBar` | `SegmentedTabs` | Status / Memory / Activity; only implemented tabs render |

Rules: components live in `plugins/dsh-<name>/client.js` (plain JS, `h()`); no new npm dependency; no CSS
framework; styles are token-referencing inline objects plus one injected `<style>` for pseudo-states, hover and
reduced-motion (inline React styles cannot express `:hover`/media queries).

## 8. Accessibility checklist (gate for every slice)

- Keyboard: sidebar entry, tabs, refresh, disclosures and every action reachable and operable; logical order;
  visible focus from the shell, never clipped by `overflow: hidden`.
- Semantics: one `h1` per panel, `h2` per section, `<main>` region from the shell, `aria-current` on the active
  tab, `role="status"`/`aria-live="polite"` for refresh results ("Updated 12s ago", "2 sources unavailable").
- Contrast: AA in both palettes for text and for status chips (text on tertiary tints); colour is never the
  only carrier of meaning (dot + word).
- Zoom 200%: no horizontal scroll at 1440 logical → 720 CSS px; long values wrap, not clip; mono values may
  scroll inside their cell.
- Touch: ≥32px targets desktop, ≥44px on coarse pointers; hover is never the only way to discover an action.
- Motion: `prefers-reduced-motion` disables fades/stagger; no parallax, no autoplay.
- Screen-reader copy: numbers announced with units ("30 nodes", not "30"), relative times carry absolute
  timestamps, "unavailable" is stated, not implied by an empty area.

## 9. Untrusted data and security in the UI

1. **Render as text.** All strings from files, scripts, Hindsight, sessions and tool output go through React
   text nodes. No `innerHTML`, no `dangerouslySetInnerHTML`, no HTML in `title`/tooltip props. Markdown, where
   ever needed, uses `MarkdownText` (it drops raw HTML).
2. **Mark provenance.** Memory observations and session text sit in a labelled region with `ProvenanceLabel`
   and never in the instruction/position of system copy. A memory that says "ignore previous instructions" is
   displayed as a quotation — nothing else.
3. **Never display secrets.** No credentials, tokens, launch tokens, `/proc/*/environ`, or token-shaped strings.
   Route-side redaction first (allowlist fields), then a client-side masker as defence in depth for anything
   token-shaped (`sk-…`, `ghp_…`, long base64/hex) before it reaches the DOM.
4. **Allowlist, not parameters.** The route reads a fixed unit, bank, home, repo and script set. Nothing in the
   query string selects a path, host, unit or bank. No bank picker, no `GET /v1/default/banks`.
5. **Fail soft, say so.** Every source is `Promise.allSettled` + timeout; a failed source degrades its own
   section to "unavailable (reason)". The page never fake-fills and never turns a memory-only failure into a
   global red state.
6. **No write surface in slice 1.** The route is GET-only; the panel has no destructive control. Later writes
   get their own route, an explicit confirmation with the consequence spelled out, and the existing policy
   (`forget.sh`, host-control restart).

## 10. Responsive behaviour

| Width | Layout |
|---|---|
| ≥1200 | full layout: vitals row, two columns, all sections visible |
| 960–1199 | two columns with tighter gutters; vitals stay 4-up |
| 768–959 | single column; vitals 2×2; cards stack; rows wrap label/value |
| <768 (drawer sidebar, shell) | single column, 16px gutter; 2×2 vitals; page title + actions stack; mono values wrap or scroll in place |
| 390 verified | no horizontal overflow, 44px touch rows, refresh reachable |

## 11. First slice — Status / Health (read-only)

### 11.1 Scope

New bundle `plugins/dsh-status/` (`@local/dsh-status`), zero-build, same shape as `dsh-host-control`:

| File | Content |
|---|---|
| `package.json` | `dsh.bundle.patch` + `dsh.client{platform:'web', immediately:true, inject:[sidebar, layout]}`; exports `./client` |
| `cordis.patch.yml` | one `insert` row `id: dsh-status`, `name: '@local/dsh-status'` |
| `index.js` | host half: `export const inject = ['connection']`; `GET /api/dsh-status/status`; allSettled aggregation; single-flight TTL cache; pinned target; no params; `cache-control: no-store`; disposer via `ctx.effect` |
| `client.js` | panel: `main` keyed `assistant` + `sidebar.panellist` icon + (later tabs); locale `en`/`zh`; one `useStatus` hook; loading/empty/error/degraded; token-only styles; visibility-gated 60s refresh + backoff + manual refresh |
| `README.md` | contract, data fields, degradation matrix, rollback (`remove_bundle` + restart) |

Route response: the v1 shape in [`ui-data-inventory.md`](ui-data-inventory.md) §D.3 — `agent`, `health.{alerts,
backup,egress,cost,jobs,curator}`, `memory`, `retention`, `identity`, `sources[]`, `degraded[]`. Data sources:
systemd (unit/timers), `check-alerts --json`, egress summary, retention report, Hindsight `/health` + bank
`/stats` + `/llm-requests/stats`, telemetry JSON (cost/curate), backup manifests, SOUL metadata. Session search
is **out** (its index is empty today).

### 11.2 Behaviour

- Mount: skeleton, then one fetch. Never blocks the shell; failures render per-section.
- Refresh: manual button + one interval (60s) that runs only while `document.visibilityState === 'visible'`;
  refresh-on-visible if data is older than 15s; backoff 60→120→300s on failure; last good data stays visible
  with a "stale" badge and the error line.
- Freshness is always shown (relative + absolute), and the footer lists source status.
- Every section degrades independently; a missing route (bundle disabled) shows "Status host half not
  installed" rather than an empty page.

### 11.3 Acceptance for the slice

1. Panel loads on the coding host with real assistant data; light + dark; 1440 and 390; no console errors.
2. Keyboard-only pass: sidebar → panel → refresh → back; focus visible throughout.
3. Route returns `ok:true` with partial failures simulated (Hindsight stopped, alerts script missing) and the UI
   shows the degradation, not a crash.
4. No literal colour in the client source (grep gate), every string through `t`, `en` + `zh` complete.
5. Host route is read-only, parameterless, and pinned; `curl` without auth → 401, with owner cookie → JSON.
6. Screenshots captured to `artifacts/ui/`, review note written, `build-progress.md` + `BUILD-LOG.md` updated,
   branch pushed with CI green.

### 11.4 Explicitly out of scope for slice 1

Memory browsing and search, any delete/write, identity editing, activity timeline, approvals changes, settings
toggles, channel, charts beyond a static sparkline, and any change to the `personal` host.

## 12. Build and rollout plan

1. Branch `ui/status-panel`; build the bundle in the workspace; unit-test the pure aggregation helpers with
   `node:test` (no new dependency).
2. Install on the **coding host only**: `DSH_HOME=/home/josh/.dsh dsh plugin --profile web add plugins/dsh-status`.
   A **new** bundle needs one Host restart before the page can load it (that is how DSH composes bundles; the
   page cannot restart itself). I will stage it and ask you to click **Settings → Host control → Restart** (or
   schedule the transient restart between turns) — no restart happens silently.
3. Verify with a Playwright script (auth via the loopback cookie exchange, as `dsh-pending.py` does), capture
   screenshots, post a short review note.
4. After your review: propose the same install on `personal` (needs your approval + one restart) and only then
   treat the slice as shipped.
5. Rollback everywhere: disable/remove the bundle row + restart; no data is touched by the panel.

## 13. Decisions (resolved 2026-11-11)

1. **Direction: hybrid** — A's bones + B's voice + C's settings material. ✅
2. **First slice: read-only Status/Health**, desktop 1440 + mobile 390, light + dark. ✅
3. **Navigation: one sidebar entry "Assistant"** with Status/Memory/Activity tabs; panel id `assistant` fixed
   now, later tabs added without re-keying. ✅
4. **Restart approval: still needed** — after staging on the coding host, one restart of `dsh-web.service`
   (this session's host). The Lead will not restart without the human's go-ahead.

## 14. Evidence

- Live shell reference: `artifacts/ui/shell-1440-{light,dark}.png`, `shell-390.png` (captured with the loopback
  owner cookie; tokens dumped from the live CSS, 415 `--dsw-*` properties).
- Direction mockups: `artifacts/ui/{A-instrument,B-notebook,C-minimal}-1440-{light,dark}.png` and `-390.png`,
  rendered from the real token values in `.tmp/mockups/` (gitignored).
- Seam verification: [`ui-primitives-slots.md`](ui-primitives-slots.md) — slot catalog, 311 primitive exports,
  client-module contract, route recipe, defensive rules.
- Data contracts: [`ui-data-inventory.md`](ui-data-inventory.md) — 15 sources with sanitized live schemas, 22
  handover corrections, recommended route shape, TTLs and degradation matrix.

## 15. Slice 1 review note (implemented 2026-11-11)

**Shipped** `plugins/dsh-status/` (zero-build, `@local/dsh-status`), installed on the **coding host only**:

| Piece | What landed | Notes |
|---|---|---|
| Host half | `GET /api/dsh-status/status`, 14 read-only sources, per-section TTL 5–300 s, single-flight cache, stale fallback, `?fresh=1` only | allowlisted/sanitised envelope (`~` paths, masked tokens, no hostname/owner/cgroup/sha256); never throws; 15/15 `node:test` |
| Client half | Assistant entry → keyed `main` panel: lede, 4 vitals, memory, jobs, safety/retention, alerts, egress, cost, identity, source footer | per-section degradation, one visibility-gated 60 s refresh + backoff (60→120→300 s), 15 s timestamp tick, manual refresh, zero literal colours, `en`+`zh` |
| Verification | `scripts/verify-dsh-status-ui.mjs` | 16/16 checks, 0 console errors, light/dark/390 screenshots in `artifacts/ui/status-*` |
| CI | new `status panel host tests` step | runs the 15 host tests on every push |

**Deviations from the design, and why**

1. **No DSH primitives are imported yet.** `ui-primitives` is runtime-seeded and untyped (§2.4); slice 1 builds
   its own `PanelPage`/`Section`/`StatCell`/`Chip`/`Row` on tokens, which is the component kit the brief asks
   for anyway. `SegmentedTabs` (slice 2 tabs), `Modal`/`RiskConfirmation` (write flows) and `DetailDocument`
   (one-document viewer) get adopted once a real use verifies their props in place.
2. **Tabs are not rendered with a single tab.** The page is the Status tab; the tab bar appears when Memory
   lands. Panel id `assistant` is already fixed, so slice 2 adds a tab without re-keying.
3. **`pendingPlugins` is not shown.** The route deliberately avoids `ctx.get('loader')` to stay fake-ctx
   testable; it reports `selected`/`installed` bundle counts instead, and the live-vs-saved list stays in
   Settings → Host control.
4. **Alert details are humanised for the two known warnings** (`unit-restarts`, `cost-spike`) and fall back to
   the check title + id; raw `key=value` script detail never reaches the DOM.
5. **Install without a restart.** The first activation failed on a missing `inject` export (the host's
   diagnostic caught it); after the fix, disabling and re-enabling the loader entry applied it **hot** — no
   `dsh-web.service` restart was needed. The personal host still needs approval + one restart.

**Accessibility polish (2026-11-11)**

- AA contrast fixed: the theme's caption/tertiary tokens are too light in light mode (2.1:1 / 3.7:1) and
  coloured chip text on status tints fails (1.99–3.68:1). All small text now uses `label-secondary`
  (5.8:1 light, 12.1:1 dark); chips are tinted surfaces with **primary text + a coloured dot** (17.5:1).
- Added the missing `role="main"` landmark (the shell renders none), kept the shell's 2px focus ring, bumped
  the refresh control to 44px on coarse pointers, and made the warning line a tinted bar with primary text.
- `scripts/verify-dsh-status-a11y.mjs`: 10/10 (headings, landmark, live region, 17 contrast samples, keyboard
  focus, 200% zoom at 720 CSS px, reduced motion, touch target).

**Still open**

- Install on `personal` (human approval, one restart) and re-run both verify scripts there.
- A real screen-reader pass (NVDA/Orca/VoiceOver) and a human visual review.
- Slice 2 (chosen order: polish first, then Memory tab): documents/observations list + recall search,
  read-only, reusing `PanelPage`/`Row`.
