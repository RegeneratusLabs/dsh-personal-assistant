# DSH web client seams — slots, primitives, client-module contract

Verified against **installed 0.2.2-rc.1** at `/home/josh/dsh/node/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/` (`dsh-web-frontend/dist/assets/index-BgUyXZcc.js` = the shell bundle holding the runtime), the docs mirror `.cache/deepseek-harness` (git HEAD = `release-dsh-0.2.2-rc.1-to-master`, same release as the installed tree), and live `ctx.slots.*` / `ctx.connection.fetch.register` call sites in 20+ installed client bundles.
**Structural warning:** `@deepseek-ai/dsh-client-ui-slots` and `…-ui-primitives` are **not installed as packages** — no directory, no `package.json`, no `.d.ts` anywhere on this host. They exist only as build inputs of the shell bundle. You can `require()` them at runtime (§4) but cannot read their types; the READMEs in `.cache/deepseek-harness/packages/client/ui-{slots,primitives}/` are prose-only too.

## 1. Slots catalog

Mechanism (verified, `docs/subsystems/slots.md` + renderer source): a **declaration** = the owning entry's `children: { "<key>": { kind, scope } }` at `ctx.slots.register`. Declaring a child makes the key live, authorizes that entry's `renderSlot`, and records dispatch. `root` is the only built-in declaration; `ui-renderer` calls `renderSlot('root')`. Registering into an undeclared key throws **during plugin activation**. `ctx.slots.inject(key, cb)` is the only legal way for a foreign package to contribute: `cb` re-runs for each declaration lifetime, its effects die when the owner collapses, and it re-runs if the owner remounts.
Cardinality: `single` (one cell, priority winner), `list` (required `id`, ordered by `order` then registration), `keyed` (owner dispatches `entryKey`), `chain` (`select(owner)` elects, result becomes `matched`), `hoc` (nests around `children`, each layer renders it exactly once).

| slot | kind | scope | payload / owner props | rendered by | notes |
|---|---|---|---|---|---|
| `root` | single | root | — | ui-renderer | product layout owner; only `root` is rendered by the service itself |
| `main` | keyed | root | none (standard props only) | ui-layout `MainPanel` | `renderSlot('main', {}, { entryKey: panelId ?? 'conversation' })`; `conversation` reserved, all other keys get **no Session binding** |
| `sidebar.panellist` | list | root | `{ size: number; active: boolean }` | ui-sidebar `PanelRow` | list `id` **is** the `main` panel key; component is the **icon only** — the row, label and click are the sidebar's |
| `sidebar.panellist.actions` | list | root | pin state, `onOpen`, `onPinnedChange`, `onDismiss`, `active` | ui-sidebar More menu | More button appears only while this list is non-empty |
| `settings.section` | list | root | `{ close: () => void }` | ui-settings-general `SettingsRoot` | `renderSlot('settings.section', { close }, { only: active })`; `id` is the nav key and the `only` filter |
| `settings.section.icon` | list | root | `{ size: number; active: boolean }` | settings nav row | `id` must equal the target section's `id`; unmatched ids never render; `label` not displayed |
| `settings.action`, `settings.plugins.tab`, `settings.onboarding` | list | root | list rows | settings shell | `settings.general.item` = General-page rows; `settings.header`/`launcher`/`trigger`/`close` single |
| `shell.leading` | single | root | — | ui-layout | macOS top-left seat; publishes `--dsh-frame-leading-clearance` |
| `shell.bottom` / `shell.overlay` | single / list | root | — | ui-layout | overlay = toasts, drag layers, floating UI |
| `sidebar` | single | root | sidebar inject face | ui-sidebar | owner of the 8 `sidebar.*` children |
| `sidebar.toggle.badge`, `sidebar.footer.action`, `sidebar.brand.mark`, `sidebar.brand.name`, `sidebar.settings`, `sidebar.workspaces` | single / list | root | — | ui-sidebar | `sidebar.toggle.badge` is the **only badge seat**; there is no per-panel-row badge |
| `rightbar` | single | root | width/viewport/`canShow` | ui-layout | right column track; `rightbar.session` is its Session-scoped seat |
| `plugins.detail.actions`, `plugins.detail.badge`, `plugins.detail.section` | list | root | plugin row + callbacks | ui-plugin-manager | additive; `plugins.tab`, `plugins.item`, `plugins.add.actions` likewise; `plugins.bundle.config`/`activation`/`row.config` keyed by package name |
| `sidebar.right.pane.tab`, `.tab.title`, `sidebar.right.tab.document*`, `.files.actions`, `.guide*`, `.menu.item` | keyed / list | session | tab + params | ui-sidebar-right, -files, -documentpreview | the right-pane tab contract; `ctx.sidebarRight.openTab(kind, { params })` |
| `conversation.session.header.actions` / `.utilities` / `.views.actions` / `.corner` / `.lineage` | list / single | session | session + callbacks | ui-conversation | safe additive spots for a Session-scoped action |
| `conversation.chat.turnTail`, `.assistant-actions` | list | session | turn data | ui-chat | per-turn additive rows |
| `conversation.chat.node`, `.text-interaction`, `.commandview`, `conversation.user.text.node` | keyed | session | node + `useTurnData` | ui-chat / conversation | **replacement points** — shadowing risk |
| `conversation.input.dock`, `.left`, `.right`, `.overlay`, `conversation.composer.dock`, `conversation.hero.options`, `conversation.view` | list | session | session input face | ui-conversation | additive composer/view seats |
| `conversation.input.model`, `.permission`, `.plan`, `.activity`, `conversation.composer`, `conversation.chat.user.before`, `shell.quota-notice`, `sidebar.right.tab.guide` | single / chain | session / root | — | conversation, chat, sidebar-right | `single`/`chain` = replacement or election; avoid for additive UI |
| `tool.call.toolview`, `tool.view.cordis` | keyed | session | tool call | ui-tool / ui-cordis | keyed by tool name / view id |
| `workspace.toast`, `contextMenu.content`, `contextMenu.icon` | keyed | root | — | workspace, context-menu | |

Remaining verified keys (kind·scope): `conversation.approval.detail`·single·session, `conversation.chat.flow`/`.message.images`/`.reasoning.body`/`.user.images`/`conversation.session`/`.header`/`.input.attachments`/`.trajectory.images`/`tool.call.images`·single·session, `conversation.plan-review.actions`, `deliverables.file.actions`, `deliverables.review.file.actions`, `sidebar.right.tab.document.actions`/`.unpreviewable`, `sidebar.session.row.{hover,leading,trailing}`, `sidebar.workspaces.session.{menu.item,row.action}`, `main.conversation`·single·session-maybe, `sidebar.chat.conversation`·single·session, `settings.models.*` (`.footer` list, `.provider-card` keyed, `.sign-in` single), `conversation.header`·single·session-maybe, `conversation.hero.workspace(.directoryFlow)`, `sidebar.workspaces(.directoryFlow)`, `conversation.hero.brand.mark`, `conversation.header.leading`·single·root. That is **117 catalog entries** (10 are Cordis service names, 107 real slots) — the live authority is `cordis_inspect what:"client"` or the generated catalog inside `dsh-cordis-client-runner/lib/client.js`.
### Copyable: `sidebar.panellist` (icon component, receives `{size, active}`)
```js
ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
  name: 'sidebar.panellist',
  id: PANEL_ID,                 // MUST equal the main entry's `key`
  order: 10,                    // ascending; ties break by registration order
  locale: NS,                   // gives props.t = t()
  label: () => t('panel'),      // thunk ⇒ follows locale without re-registering
}, PanelIcon))                  // (props) => React element; props: { size, active, t }
```
### Copyable: `main` (the panel page, keyed by panel id)
```js
ctx.slots.inject('main', () => ctx.slots.register({
  name: 'main',
  key: PANEL_ID,                // dispatch key; `conversation` is reserved
  locale: NS,
  inject: () => ({ hooks: { data: dataSource }, refresh }),  // hooks ⇒ useData()
  children: { 'my.panel.action': { kind: 'list', scope: 'root' } },
}, PanelPage))
```
Navigation (all verified): the sidebar row calls `ctx.layout.selectPanel(PANEL_ID)` → `panelInfo.activePanelId` changes → `MainPanel` re-renders `main` with `entryKey: PANEL_ID`. `selectPanel(null)` returns to the Conversation **without changing the Session**; an unregistered key **throws** and leaves the current panel intact. `ctx.layout.beginNavigation()` returns an AbortSignal for async navigation. Below 768px the sidebar is a modal drawer and navigation closes it; `ctx.layout.toggleSidebar()` exists too. A `main` panel is **not** Session-scoped, so do not call `useSession`.
### Copyable: `settings.section`
```js
ctx.slots.inject('settings.section', () => ctx.slots.register({
  name: 'settings.section',
  id: 'my-panel', order: 100, label: () => t('nav'),
  locale: NS,
  inject: () => ({ hooks: { snapshot }, save }),
  children: { 'my.panel.row': { kind: 'list', scope: 'root' } },
}, SectionPage))               // props include `close: () => void`
```

## 2. Primitives inventory — the component kit

**Import path (verified):** the shell seeds a frozen platform table of exactly `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`, `@deepseek-ai/cordis`, `zod`, `@tanstack/react-virtual`, `@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`, `@deepseek-ai/dsh-client-ui-dockkit`. A plain-JS plugin therefore writes `const P = require('@deepseek-ai/dsh-client-ui-primitives')` and `const { resolveSlotLabel } = require('@deepseek-ai/dsh-client-ui-slots')` with **no `dsh.client.external` entry** — these are baseline, not externals. `dsh.client.inject` lists *provider packages* (bundle order), not services; services go in the bundle's exported `inject`.

| export | props | use |
|---|---|---|
| `Button` | `variant:'primary'\|'ghost'\|'outline'\|'toolbar'`(ghost), `size:'md'\|'sm'`(md), `icon`, `className`, `children`, + native; ref→button | every action |
| `Tag` | `tone` (8 palettes, `'outline'`), `className`, `children` | read-only 11px badge — **status chip** |
| `Pill` | `active`(false), `onClick?`, `className`, `children` | selectable capsule / static status pill |
| `StateDot` | `state:'done'\|'warning'\|'error'\|'idle'\|'ongoing'`, `size`, `appearance:'dot'\|'step'` | health dot; `ongoing` is a 14px spinner — **loading** |
| `SegmentedControl` | `id`, `value`, `options`, `onChange`, `label`, `disabled` | 2–4 exclusive modes (tablist) |
| `SegmentedTabs` | `items`, `value`, `onChange`, `label`, `size:'md'\|'sm'` | **tabs** |
| `Menu` | `open, anchor, items, children, selectedId(s), onSelect, onClose, align, side, portal, dense, compact, autoFocus, selection, getAnchorRect, minWidthFromAnchor, footer, listClassName, contextual, exiting, returnFocus` | dropdown; data rows + `MenuItemButton` children |
| `MenuItemButton` | `children, shortcut, icon, current, disabled, disabledReason, danger, separatorBefore, onSelect` | component row inside `Menu` |
| `MenuGroup`, `MenuSurface`, `observeStickyMenuGroups` | `{label, children}` / `{compact, phase}` | grouped menu, card material |
| `Modal` | `open, onClose, title, closeLabel, description, children, footer, onKeyDownCapture, headless, backdropBlur, shortcutModal` | **dialog**; focus trap + Escape |
| `RiskConfirmation` | `open, title, description, acknowledgeLabel, cancelLabel, closeLabel, confirmLabel, acknowledged, disabled, onAcknowledgedChange, onCancel, onConfirm` | **confirmation** gated by a checkbox |
| `Tooltip` | `label, shortcutKeys, side, align, delayMs, focusDelayMs, gap, disabled, portal, maxWidth, openOnClick, onlyWhenClipped, children` | hover/focus hint |
| `HoverCard`(`Group`) | `anchor, content, openDelayMs, disabled, grouped, copyText, copyLabel, copiedLabel, variant, inline, fitContent` | rich preview |
| `Toast` | `text, icon, tone, anchor, holdMs, actions, onDone` | transient banner |
| `DisclosureRow` | `icon, title, open, expandable, onToggle, running, expandOnRowClick, previewChevron, keepContentWhenOpen, collapsedContent, headerAccessory, children, className, rowClassName, contentClassName, contentLayoutClassName, leadingClassName, chevronClassName, titleClassName` | 24px fold row |
| `AnimatedRows` | `rowKeys, role, label, children` (`data-row-key`) | keyed list motion, reduced-motion aware |
| `TextShimmer` | `children`, `data-shimmer-decoration` separators | streaming/loading text |
| `Input` | `icon`, `className`, + native input props; ref→input | search / inline form |
| `InlineEditor` | `value, label, onChange, onSave, onCancel, className` | Enter-saves draft editor |
| `Switch` | `checked, onChange(next), label`(**required**), `disabled, title` | toggle |
| `Checkbox` | `checked, onChange(checked), label, disabled, title, modalAutofocus` | checkbox |
| `ShortcutKeys` | `keys, variant:'plain'\|'tooltip'` | keyboard hint |
| `PathLabel` | `path, className` | file path with dir/filename split |
| `ConnectionIndicator` | `state, disconnectedLabel, connectingLabel, recoveredLabel, reconnectActionLabel, restartActionLabel, onReconnect` | reconnect UI |
| `MarkdownText` | `text, streaming, labels, fileMentions, pathImages, variant:'body'\|'compact', omitHtml, textInteractionSource` | untrusted GFM+TeX, HTML dropped |
| `DetailDocument` | `state, labels, images, onRetry` | **loading skeleton / empty / error+retry** for one doc |
| `JsonTree` / `JsonBlock` | `data, label, collapsedStringLines, wrapping, copyable, expandTopLevel, labels` / `label, payload, defaultOpen, truncatedLabel` | JSON inspect |
| `CodeBlock` | `children, language, lineNumbers, toolbarLabels, showHeader, wrap` | code card |
| `TerminalBlock` / `ReadBlock` / `DiffBlock` / `SearchBlock` / `WebBlock` | full `labels` + `maxLines` (default 16) etc. | agent-output cards; fold past `maxLines` |
| `SettingsForm` / `SettingsValueField` / `SettingsSecretField` | props object (not destructured in the bundle): `state, labels, onDiscard…` / `id, label, hint, invalid, message…` / `id, label, configured, stateLabel…` | staged settings page (PARTIALLY VERIFIED) |
| `useClipboardCopy`, `useModalLayer`, `focusWithoutRing`, `closeTopModal`, `isBehindModal`, `relativeTime`, `fileSizeText`, `classifyFileType`, `formatQuoteText`, `extractMarkdownPlainText`, `rankByName` | — | small helpers you otherwise rewrite |
| 250+ `Icon*OutlineMedium`/`Regular`, `PluginArtwork*`, `GuideArtwork*`, `FileTypeIcon`, `FishLogo`, `BrandWordmark` | `size` (+ `compact` on `IconAppsAdd*`) | glyphs; sprite ids live in `ICON_SYMBOLS` |

**Not present — do not look for them:** there is no `Card`, `Panel`, `Page`, `Grid`, `Stack`, `SectionHeader`, `EmptyState`, `Spinner`, `Table`, `List`, `DataTable`, `Tabs` (only `SegmentedTabs`), `Dialog` (only `Modal`), `Badge` (only `Tag`/`Pill`), `Banner`, or `Skeleton` export among the 311 names. Loading/empty/error is *your component's* job; the kit supplies the atoms (`StateDot state="ongoing"`, `DisclosureRow running`, `DetailDocument` for one document, `AnimatedRows`, `TextShimmer`). Lists/tables: build rows in your package (`AnimatedRows` only animates them; `JsonTree` is JSON-only). Cards: `MenuSurface` gives the shared material, otherwise a CSS Module on `--dsw-*` tokens — the defensive doc states explicitly that a card stacking name over description "belongs in the feature package".

## 3. Layout / typography helpers

`ui-layout` is the shell, not a container kit: `AppFrame` (root occupant) = sidebar column (264–420px, 280 default, 56px rail ≥768px, **modal drawer <768px**), centre column (`main`), right track (`rightbar`), `shell.leading`, `shell.bottom`, `shell.overlay`. `CenterColumn`, `RightbarColumn`, drag handles and the column solve are package-internal — a plugin gets no page container, grid or section header from it. It publishes `--dsh-frame-top-clearance` (48px, pad entry pages by it) and `--dsh-frame-leading-clearance` (macOS). Typography/size/colour come from `--dsw-*` tokens (`docs/web-styling.md`), `MarkdownText variant="compact"` for secondary copy, `Pill`/`Tag` for 24px/11px capsules. `ctx.layout` surface: `selectPanel(id|null)`, `toggleSidebar()`, `openRightbar(track, fullscreen)`, `closeRightbar()`, `panelInfo` (snapshot source), `beginNavigation()`. `ctx.theme`: read snapshots (`ctx.theme.getTheme()`, `ctx.on('theme/change')`); `ctx.theme.register(definition)` adds a third-party theme id with alias-token overrides and optional `icons` (ICON_SYMBOLS-id → SVG; `<style>`/`<script>`/non-`<symbol id>-` ids rejected). It is **not** a component-theming API — no per-plugin style injection.

## 4. Client-module contract

```js
// lib/client.js — the whole file, hand-written; no build step needed.
window.__ModuleLoader__.load({
  id: 'dsh-my-panel',                 // MUST equal the package name / graph row; '/client' suffix stripped
  factory: (require) => {             // runs once, at first materialization
    const React = require('react')
    const UI = require('@deepseek-ai/dsh-client-ui-primitives')
    const NS = 'my-panel'
    const en = { panel: 'My panel', empty: 'Nothing here yet' }
    const zh = { panel: '我的面板', empty: '暂无内容' }
    let t = (k) => en[k] ?? k        // fallback; upgraded in apply() once the dictionary is live

    function PanelIcon({ size, active }) {
      return React.createElement(UI.StateDot, { state: active ? 'done' : 'idle', size })
    }
    function PanelPage({ useData, t }) {
      const data = useData()
      return React.createElement('div', { style: { padding: 24 } },
        data.length === 0
          ? React.createElement('p', null, t('empty'))
          : React.createElement('ul', null, data.map((r) => React.createElement('li', { key: r.id }, r.title))))
    }

    const inject = ['slots', 'layout', 'locale']   // Cordis services, NOT packages
    function apply(ctx) {
      const disposeDict = ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'my-panel: dictionaries')
      t = (k) => (typeof ctx.locale.t === 'function' ? ctx.locale.t(NS)(k) : (en[k] ?? k))   // §7
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: NS, locale: NS,
        inject: () => ({ hooks: { data: ctx.get('myStore').source } }) }, PanelPage))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
        { name: 'sidebar.panellist', id: NS, order: 100, locale: NS, label: () => t('panel') }, PanelIcon))
      return () => { disposeDict() }
    }
    return { name: 'dsh-my-panel', inject, apply }
  },
})
```
Rules (verified): `id` must match the graph row — a second `load()` with the same id throws `duplicate factory registration`; a script that loads without registering its id fails the arrival. `require` resolves, in order, the platform seed table → memoized records → boot-graph rows → registered factories; anything else throws, and require **cycles throw** (factory-form CJS cannot deliver partial exports). `require.async('./client.<name>.js')` loads a compiler-emitted chunk; `require.asset('plugins/<pkg>/assets/<file>-<rev>.<ext>')` resolves package assets. `apply` may be `async`; disposers come from `ctx.effect(fn, label)` or the disposer returned by `register`. `package.json` needs `dsh.client: { platform: 'web', inject: [<provider package ids>] }` plus a `./client` export. **Unmount/disable:** removing the Loader entry disposes the fiber → every `slots.inject` callback's registrations collapse recursively (children included), the row's `<style data-plugin>` tags are evicted, and unused modules are pruned; re-enabling loads one fresh instance. Nothing of yours survives the fiber.

## 5. Host route recipe

Two paths. **Typed Remote** (`adding-a-remote-api.md`) needs the Typert generation pipeline — `@Remote` on a `TypertRemoteService` subclass, `RemoteErrorDetailsMap` declaration merging for `'domain/reason'` codes, generated `./typert` + `./remote` exports, `pnpm run build:lib` after any signature change, and client-side `ctx.remote.<ns>.<method>()` returning `RemoteResult<T>` (`if (!result.ok)` branch on `code`; `isRemoteFailure` to separate a Remote failure from a defect). Codes land as `gateway/bad-request|cancelled|internal` when unclassified. **That pipeline is unavailable to a plain-JS package** — use the exact-Fetch seam:

```js
// Host (node half of your package, a normal Cordis plugin)
const dispose = ctx.connection.fetch.register({
  path: '/api/my.panel.fetch',            // must resolve below /api, else throws
  methods: ['GET', 'POST'],               // GET|HEAD|POST, no duplicates, non-empty
  requestBody: 'buffered',                // 'buffered' obeys the body cap; 'streaming' has backpressure, no cap
  fetch: async (request) => Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } }),
})
// Browser
const res = await fetch('/api/my.panel.fetch')   // same-origin HttpOnly cookie; absolute /api path, as shipped code does
```
Status/error mapping (verified in `dsh-client-connection`): **your handler owns the status** — exact routes are *not* wrapped in a try/catch, so an uncaught throw aborts the request instead of producing a 500. Always return a `Response`. Around the handler: duplicate path → throws at register; non-owner Peer → `403`; unknown route / wrong method → `404`; the shared RPC path (not `fetch.register`) returns `415` for non-`application/json`, `400` for bad JSON, and `500 "handler failure: …"` on a throw. Fence: every request passes `src/api-request-trust.ts` before auth — `Host` must be loopback, the bind-IP literal, or a `trustedHosts` entry; `Origin` must name the same authority; `sec-fetch-site: cross-site` → **403**; trusted-but-unauthenticated → **401**. Auth is a signed `HttpOnly; SameSite=Strict; Path=/` cookie minted from `?token=` at `GET /` (30-day default, bound to hostname+port, `Secure` only when the listener serves TLS). Body cap: `maxRequestBodyBytes`, default **300 MiB** (sized for the 200 MiB image aggregate + envelope), enforced only for `buffered` → `413` + socket close. Disposer is async: `ctx.effect(() => …)` it. Cookie/`token` handling is the shell's; never mint your own.

## 6. Defensive rules for client components (`docs/defensive-patterns/client-components.md`)

The page's actual rule list — the requested topics (innerHTML, payload caps, windowing, polling, reduced motion) are **not** in it; they live in `docs/defensive-patterns/general.md` and the primitives' own behaviour.
1. **State arrives through injection** — plain data, a narrow action set, and the reserved `hooks` compartment; never one top-level global store read handed down.
2. **Props carry data and callbacks, not React nodes** — a node travels through a declared child slot; new node-valued props are never added.
3. **A slot registration is a stable function component** — module scope; an inline arrow is a new component type each render and remounts the subtree.
4. **Components never receive a Cordis context** — no `ctx`, no `subscribe`, no `useSyncExternalStore`, no service import in a `.tsx`.
5. **Context comes from the current scope** — no new global `current`/`active`/`viewId`.
6. **Resource consumers go through `useResource`** — no bespoke fetch/cache/subscribe.
7. **Store usage is narrow and explicit** — spec-declared `init`/`actions`/`persist`; no module-level handle.
8. **Identity and initial state are deliberate** — no remount on state change; state built in the first flow, not filled by an effect.
9. **`useLayoutEffect` is not a default** — justify the measurement, move it into an injected hook.
10. **Effects never push render-derived data to a parent** — no setter-from-props in an effect.
11. **Build and style follow their owners** — CSS Modules, `--dsw-*` tokens, no Tailwind/literal colours, no large text in TSX.
12. **A key states what it identifies** — never `key={index}` over a mutable list.
13. **Each shared layer keeps its own isolation level** — consume `ui-primitives`, adapt `ui-layout`, never import another feature plugin's runtime values.
Runtime facts that back these: every slot entry sits in a per-entry `SlotErrorBoundary` — a crash renders `<div data-slot-error="<key>">`, reports via `ctx.slots.onEntryError`, and for shadowing kinds the entry is **abdicated** so the next survivor renders; assembly errors (missing provider/hook source) rethrow on purpose. `hoc` layers nest by `order`→`priority`→registration, and adding/removing one remounts its content.

## 7. Gotchas

- **`ui-slots` / `ui-primitives` are runtime-only here.** `require()` works (platform seed), but there is no installed package to import types from, no `node_modules` copy, and their props can only be read off the minified bundle. Anything below marked PARTIALLY/UNVERIFIED is from the bundle's destructuring or prose, not a `.d.ts`.
- **`t` and dictionaries:** `ctx.locale.register(NS, { en, zh, … })` was verified as a call, but the exact `t` accessor and whether `label: () => t('x')` may be built before `apply` are **UNVERIFIED for a bare plugin** — the shipped pattern captures `t` from the module's own locale factory. Safest: put all copy in the component's props `t` (delivered by `locale: NS` on the registration) and use `label: () => t('…')` only after a dictionary is registered.
- **`priority`** is documented in `slots.md` (shadowing rank / chain election order) but did **not** appear in the generated per-slot `registerOptions` — PARTIALLY VERIFIED. Prefer a fresh `id`/`key` over shadowing.
- **`main` panels are not Session-scoped.** `conversation` is the only key with a Session binding; `useSession`/`useConversation`/`useChat` are absent in your panel.
- **Sidebar panel rows have no badge.** The icon component receives only `{ size, active }`; draw a dot/badge yourself inside it (`StateDot`), and remember `label` is the row's only text channel.
- **Panel id coupling is silent.** `sidebar.panellist.id` and `main.key` must be equal, but nothing validates it — a mismatch yields a clickable row that throws in `selectPanel` (which throws for any unregistered key, and the drawer closes on navigation).
- **Restart vs hot-reload:** a *new* package (or a changed `package.json` `dsh.client`) needs a Host restart — the Host reads the manifest when the Loader entry starts, and `dsh-client-modules` calls manifest edits invisible until then. Editing an already-loaded `lib/client.js` reaches an open page through HMR (mtime/ctime/size revision) with `pnpm run dev:web` running; the **modules bootstrap itself** and the static platform table can only change with a page reload. A Host serving a different release makes the page apply nothing until reload.
- **Bundle must be built/served:** the Host serves `lib/client.js` from `/plugins`; a missing bundle fails activation loudly, and there is no in-page evaluation path for a plain-JS plugin.
- **`requestBody: 'streaming'` reads no cap** but the bridge then forces `connection: close` — do not use it for small JSON; and fetch-route throws are not 500s (§5), so a missing `return` yields a broken request, not a diagnosable error.
- **`docs/` claims to trust:** the `docs/subsystems/slots.md` hierarchy lists `conversation.header` and `conversation.composer.bar`, which exist in the catalog but not in the plugin-manager/index snapshot of `children` — treat the **catalog + live `cordis_inspect`** as authority, the doc tree as navigation.
