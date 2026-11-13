/**
 * Browser half of the Capabilities panel.
 *
 * One left-sidebar entry (`sidebar.panellist`, id `capabilities`) and the
 * central page that entry selects (`main`, key `capabilities`).
 *
 * The page's primary section is the **Connectors catalog**: a curated set of
 * Western apps with Connect/Disconnect. Connect asks the host for a Composio
 * sign-in link, opens it in a tab, and the card flips to connected when the
 * broker reports the account ACTIVE. The **Advanced** disclosure keeps the
 * technical MCP server list (ping/github) with probe/restart; **Plugins** lists
 * the profile's bundles. Installing, toggling and configuring stay on the
 * official Plugins page and Settings.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-capabilities',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const PANEL_ID = 'capabilities';
    const NS = 'dsh-capabilities';
    const REFRESH_MS = 8000;

    const en = {
      panel: 'Capabilities',
      title: 'Capabilities',
      subtitle:
        'Connect the apps this assistant can use, see each live connection, and check what is composed in this profile.',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      loading: 'Reading capabilities…',
      loadFailed: 'Could not read capabilities',
      retry: 'Retry',
      connectors: 'Connectors',
      appsHint: 'Click Connect to open the provider’s sign-in page. The card turns green when the account is active.',
      plugins: 'Plugins',
      pluginsHint: 'Install, remove and toggle bundles on the Plugins page. This page reports what is live.',
      advanced: 'Advanced — MCP servers',
      advancedHint: 'Raw MCP servers configured in the mcp-manager row. Probe and restart act on the live manager.',
      emptyPlugins: 'No plugin bundles are composed in this profile.',
      emptyServers: 'No MCP servers configured.',
      composioMissing:
        'Composio is not configured. Store COMPOSIO_API_KEY in the credential store to enable the Connect buttons.',
      composioError: 'Composio is not reachable',
      stateConnected: 'connected',
      statePending: 'waiting for sign-in',
      stateNotConnected: 'not connected',
      stateNeedsAttention: 'needs attention',
      stateInactive: 'inactive',
      connect: 'Connect',
      connecting: 'Opening…',
      disconnect: 'Disconnect',
      disconnecting: 'Disconnecting…',
      waiting: 'Waiting for sign-in…',
      reopen: 'Reopen sign-in',
      connectOpened: 'Sign-in page opened. Finish there and this card will update.',
      connectBlocked: 'The browser blocked the sign-in tab. Use this link:',
      connectDone: 'Connected.',
      connectPending: 'Sign-in is still pending.',
      connectFailed: 'Could not start the connection',
      disconnectDone: 'Disconnected.',
      disconnectFailed: 'Could not disconnect',
      disconnectConfirm: 'Disconnect',
      probe: 'Probe',
      restart: 'Restart',
      probing: 'Probing…',
      restarting: 'Restarting…',
      probeOk: 'Probe finished',
      restartOk: 'Connector restarted',
      actionFailed: 'Action failed',
      credentialMissing: 'Credential not configured',
      configured: 'configured',
      removed: 'removed',
      official: 'official',
      on: 'on',
      off: 'off',
      rows: 'rows',
      footer:
        'Connectors refresh every 8 s. Connect and Disconnect act on the broker account, never on profile files.',
    };
    const zh = {
      panel: '能力',
      title: '能力',
      subtitle: '连接助手可用的应用，查看每个连接的状态，以及此配置组合的内容。',
      refresh: '刷新',
      refreshing: '刷新中…',
      loading: '正在读取能力…',
      loadFailed: '无法读取能力',
      retry: '重试',
      connectors: '连接器',
      appsHint: '点击「连接」打开服务商的登录页；账号激活后卡片会变绿。',
      plugins: '插件',
      pluginsHint: '在「插件」页面安装、移除和开关 bundle；本页只报告运行状态。',
      advanced: '高级 — MCP 服务器',
      advancedHint: 'mcp-manager 行里配置的原始 MCP 服务器。探测和重启作用于运行中的 manager。',
      emptyPlugins: '此配置没有组合任何插件 bundle。',
      emptyServers: '没有配置 MCP 服务器。',
      composioMissing: 'Composio 未配置。请在凭据库中保存 COMPOSIO_API_KEY 以启用连接按钮。',
      composioError: 'Composio 不可达',
      stateConnected: '已连接',
      statePending: '等待登录',
      stateNotConnected: '未连接',
      stateNeedsAttention: '需要处理',
      stateInactive: '未激活',
      connect: '连接',
      connecting: '正在打开…',
      disconnect: '断开',
      disconnecting: '正在断开…',
      waiting: '等待登录…',
      reopen: '重新打开登录页',
      connectOpened: '登录页已打开。完成授权后此卡片会自动更新。',
      connectBlocked: '浏览器拦截了登录标签页。请使用此链接：',
      connectDone: '已连接。',
      connectPending: '登录仍在等待中。',
      connectFailed: '无法开始连接',
      disconnectDone: '已断开。',
      disconnectFailed: '无法断开',
      disconnectConfirm: '断开',
      probe: '探测',
      restart: '重启',
      probing: '探测中…',
      restarting: '重启中…',
      probeOk: '探测完成',
      restartOk: '连接器已重启',
      actionFailed: '操作失败',
      credentialMissing: '凭据未配置',
      configured: '已配置',
      removed: '已移除',
      official: '官方',
      on: '开启',
      off: '关闭',
      rows: '行',
      footer: '连接器每 8 秒刷新。连接与断开只作用于 broker 账号，不修改配置文件。',
    };

    function routeUrl(relative) {
      return new URL(relative, document.baseURI).toString();
    }

    async function call(relative, init) {
      const response = await fetch(routeUrl(relative), {
        credentials: 'same-origin',
        cache: 'no-store',
        ...init,
      });
      const text = await response.text();
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        /* non-JSON error body */
      }
      if (!response.ok) {
        const error = new Error(payload?.error || `HTTP ${response.status}`);
        error.code = payload?.code;
        throw error;
      }
      return payload;
    }

    const TONE = {
      ok: 'var(--dsw-alias-state-success-primary, #1a7f37)',
      warn: 'var(--dsw-alias-state-warning-primary, #a15c00)',
      danger: 'var(--dsw-alias-state-error-primary, #c62828)',
      muted: 'var(--dsw-alias-label-secondary, #6b7280)',
      brand: 'var(--dsw-alias-brand-primary, #3b6ef6)',
    };

    const APP_TONE = {
      connected: 'ok',
      pending: 'warn',
      needs_attention: 'danger',
      not_connected: 'muted',
      inactive: 'muted',
    };

    function appStateLabel(t, state) {
      switch (state) {
        case 'connected': return t('stateConnected');
        case 'pending': return t('statePending');
        case 'needs_attention': return t('stateNeedsAttention');
        case 'inactive': return t('stateInactive');
        default: return t('stateNotConnected');
      }
    }

    const S = {
      page: {
        height: '100%',
        overflowY: 'auto',
        padding: 'clamp(20px, 4vw, 40px)',
        boxSizing: 'border-box',
        color: 'inherit',
        font: 'inherit',
      },
      inner: { maxWidth: 1120, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 },
      header: { display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
      headerText: { flex: '1 1 320px', minWidth: 0 },
      title: { margin: 0, fontSize: 28, lineHeight: 1.2, fontWeight: 650, letterSpacing: '-0.01em' },
      subtitle: {
        margin: '8px 0 0',
        color: 'var(--dsw-alias-label-secondary, #6b7280)',
        fontSize: 14,
        lineHeight: 1.5,
        maxWidth: '70ch',
      },
      section: { display: 'flex', flexDirection: 'column', gap: 12 },
      sectionHead: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
      h2: { margin: 0, fontSize: 18, lineHeight: 1.3, fontWeight: 620 },
      count: {
        minWidth: 22,
        padding: '1px 7px',
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.28))',
        color: 'var(--dsw-alias-label-secondary, #6b7280)',
        fontSize: 12,
        textAlign: 'center',
      },
      hint: { margin: 0, color: 'var(--dsw-alias-label-secondary, #6b7280)', fontSize: 13, lineHeight: 1.5 },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
      card: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 0,
        padding: 16,
        borderRadius: 12,
        border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.28))',
        background: 'var(--dsw-alias-bg-raised, rgba(127,127,127,.05))',
      },
      cardHead: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      name: { fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' },
      group: { color: 'var(--dsw-alias-label-secondary, #6b7280)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' },
      badge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '1px 8px',
        borderRadius: 999,
        border: '1px solid currentColor',
        fontSize: 11,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
      },
      dot: { width: 7, height: 7, borderRadius: '50%', background: 'currentColor', flex: 'none' },
      meta: { color: 'var(--dsw-alias-label-secondary, #6b7280)', fontSize: 12, lineHeight: 1.5 },
      err: { color: TONE.danger, fontSize: 12, lineHeight: 1.45, overflowWrap: 'anywhere' },
      actions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' },
      button: {
        font: 'inherit',
        fontSize: 12,
        padding: '5px 11px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.35))',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
      },
      buttonPrimary: {
        font: 'inherit',
        fontSize: 13,
        padding: '7px 14px',
        borderRadius: 8,
        border: '1px solid transparent',
        background: TONE.brand,
        color: '#fff',
        cursor: 'pointer',
      },
      empty: {
        padding: 20,
        borderRadius: 12,
        border: '1px dashed var(--dsw-alias-border-l1, rgba(127,127,127,.35))',
        color: 'var(--dsw-alias-label-secondary, #6b7280)',
        fontSize: 13,
        lineHeight: 1.5,
      },
      banner: {
        padding: '10px 14px',
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.3))',
        fontSize: 13,
        lineHeight: 1.5,
      },
      details: {
        border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.28))',
        borderRadius: 12,
        padding: '10px 14px',
      },
      summary: { cursor: 'pointer', fontSize: 14, fontWeight: 600 },
      footer: { color: 'var(--dsw-alias-label-secondary, #6b7280)', fontSize: 12, lineHeight: 1.5 },
    };

    function Badge({ tone, children }) {
      const color = TONE[tone] || TONE.muted;
      return h('span', { style: { ...S.badge, color } }, h('span', { style: S.dot }), children);
    }

    function CapabilitiesGlyph() {
      return h(
        'svg',
        { width: 18, height: 18, viewBox: '0 0 18 18', fill: 'none', 'aria-hidden': 'true' },
        h('rect', { x: 1.5, y: 1.5, width: 6.5, height: 6.5, rx: 1.6, stroke: 'currentColor', strokeWidth: 1.4 }),
        h('rect', { x: 10, y: 1.5, width: 6.5, height: 6.5, rx: 1.6, stroke: 'currentColor', strokeWidth: 1.4 }),
        h('rect', { x: 1.5, y: 10, width: 6.5, height: 6.5, rx: 1.6, stroke: 'currentColor', strokeWidth: 1.4 }),
        h('rect', { x: 10, y: 10, width: 6.5, height: 6.5, rx: 1.6, stroke: 'currentColor', strokeWidth: 1.4 }),
      );
    }

    function AppCard({ app, t, busy, onConnect, onDisconnect, onReopen, signInUrl }) {
      const state = app.state || 'not_connected';
      const tone = APP_TONE[state] || 'muted';
      const isBusy = busy === app.id;
      const pending = state === 'pending';
      const primaryStyle =
        isBusy || !app.canConnect || pending
          ? { ...S.buttonPrimary, opacity: 0.5, cursor: 'not-allowed' }
          : S.buttonPrimary;
      return h(
        'div',
        { style: S.card },
        h(
          'div',
          { style: S.cardHead },
          h('span', { style: S.name }, app.name),
          h(Badge, { tone }, appStateLabel(t, state)),
        ),
        h('div', { style: S.group }, app.group),
        h('div', { style: S.meta }, app.description),
        app.account?.displayName
          ? h('div', { style: S.meta }, app.account.displayName)
          : null,
        app.reason && state !== 'connected' ? h('div', { style: S.meta }, app.reason) : null,
        h(
          'div',
          { style: S.actions },
          state === 'connected'
            ? h(
                'button',
                {
                  type: 'button',
                  style: S.button,
                  disabled: isBusy,
                  'aria-label': `${t('disconnect')} ${app.name}`,
                  onClick: () => onDisconnect(app),
                },
                isBusy ? t('disconnecting') : t('disconnect'),
              )
            : h(
                'button',
                {
                  type: 'button',
                  style: primaryStyle,
                  disabled: isBusy || !app.canConnect || pending,
                  'aria-label': `${t('connect')} ${app.name}`,
                  onClick: () => onConnect(app),
                },
                isBusy ? t('connecting') : pending ? t('waiting') : t('connect'),
              ),
          pending && signInUrl
            ? h(
                'button',
                { type: 'button', style: S.button, onClick: () => onReopen(signInUrl) },
                t('reopen'),
              )
            : null,
        ),
      );
    }

    function ServerCard({ server, t, busy, onAction }) {
      const state = server.state || 'unknown';
      const tone = state === 'connected' ? 'ok' : state === 'waiting-credentials' ? 'warn' : 'muted';
      const pending = busy === server.name;
      const disabled = pending || !server.configured;
      const waitingRef =
        state === 'waiting-credentials'
          ? (/credential "([^"]+)"/.exec(server.error || '') || [])[1]
          : null;
      return h(
        'div',
        { style: S.card },
        h(
          'div',
          { style: S.cardHead },
          h('span', { style: S.name }, server.name),
          h(Badge, { tone }, state),
        ),
        h('div', { style: S.meta }, server.configured ? t('configured') : t('removed')),
        waitingRef
          ? h('div', { style: S.meta }, `${t('credentialMissing')}: ${waitingRef}`)
          : server.error
            ? h('div', { style: S.err }, server.error)
            : null,
        h(
          'div',
          { style: S.actions },
          h(
            'button',
            { type: 'button', style: S.button, disabled, onClick: () => onAction('probe', server.name) },
            pending ? t('probing') : t('probe'),
          ),
          h(
            'button',
            { type: 'button', style: S.button, disabled, onClick: () => onAction('restart', server.name) },
            pending ? t('restarting') : t('restart'),
          ),
        ),
      );
    }

    function PluginCard({ plugin, t }) {
      const tone = plugin.error ? 'danger' : plugin.enabled ? 'ok' : 'muted';
      return h(
        'div',
        { style: S.card },
        h(
          'div',
          { style: S.cardHead },
          h('span', { style: S.name }, plugin.name),
          h(Badge, { tone }, plugin.enabled ? (plugin.official ? t('official') : t('on')) : t('off')),
        ),
        h(
          'div',
          { style: S.meta },
          [plugin.version ? `v${plugin.version}` : null, `${plugin.rows} ${t('rows')}`].filter(Boolean).join(' · '),
        ),
        plugin.description ? h('div', { style: S.meta }, plugin.description) : null,
        plugin.error ? h('div', { style: S.err }, `${plugin.error.code}: ${plugin.error.message || ''}`) : null,
      );
    }

    function CapabilitiesPanel({ t }) {
      const [data, setData] = React.useState(null);
      const [error, setError] = React.useState('');
      const [loading, setLoading] = React.useState(true);
      const [busy, setBusy] = React.useState('');
      const [notice, setNotice] = React.useState('');
      const [signIn, setSignIn] = React.useState(null); // { app, url }
      const [pendingApp, setPendingApp] = React.useState('');

      const load = React.useCallback(async () => {
        try {
          const payload = await call('api/capabilities');
          setData(payload);
          setError('');
        } catch (cause) {
          setError(cause?.message || String(cause));
        } finally {
          setLoading(false);
        }
      }, []);

      React.useEffect(() => {
        let alive = true;
        const tick = async () => {
          try {
            const payload = await call('api/capabilities');
            if (alive) {
              setData(payload);
              setError('');
            }
          } catch (cause) {
            if (alive) setError(cause?.message || String(cause));
          } finally {
            if (alive) setLoading(false);
          }
        };
        void tick();
        const timer = setInterval(() => void tick(), REFRESH_MS);
        return () => {
          alive = false;
          clearInterval(timer);
        };
      }, []);

      React.useEffect(() => {
        if (!pendingApp || !data) return;
        const app = (data.composio?.apps || []).find((candidate) => candidate.id === pendingApp);
        if (!app) return;
        if (app.state === 'connected') {
          setNotice(t('connectDone'));
          setSignIn(null);
          setPendingApp('');
        } else if (app.state !== 'pending') {
          setNotice(t('connectPending'));
          setPendingApp('');
        }
      }, [data, pendingApp, t]);

      const connect = async (app) => {
        setBusy(app.id);
        setError('');
        setNotice('');
        const tab = window.open('about:blank', '_blank');
        try {
          const result = await call('api/capabilities/connect', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ app: app.id }),
          });
          if (result.url) {
            setSignIn({ app: app.id, url: result.url });
            if (tab) {
              tab.location.href = result.url;
              setNotice(t('connectOpened'));
            } else {
              setNotice(t('connectBlocked'));
            }
            setPendingApp(app.id);
          } else {
            if (tab) tab.close();
            setNotice(t('connectDone'));
          }
          await load();
        } catch (cause) {
          if (tab) tab.close();
          setError(`${t('connectFailed')}: ${cause?.message || String(cause)}`);
        } finally {
          setBusy('');
        }
      };

      const disconnect = async (app) => {
        if (!window.confirm(`${t('disconnectConfirm')} ${app.name}?`)) return;
        setBusy(app.id);
        setError('');
        setNotice('');
        try {
          await call('api/capabilities/disconnect', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ app: app.id }),
          });
          setNotice(t('disconnectDone'));
          setSignIn(null);
          await load();
        } catch (cause) {
          setError(`${t('disconnectFailed')}: ${cause?.message || String(cause)}`);
        } finally {
          setBusy('');
        }
      };

      const mcpAction = async (kind, name) => {
        setBusy(name);
        setNotice('');
        try {
          await call(`api/capabilities/connectors/${kind}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name }),
          });
          setNotice(kind === 'probe' ? t('probeOk') : t('restartOk'));
          await load();
        } catch (cause) {
          setError(`${t('actionFailed')}: ${cause?.message || String(cause)}`);
        } finally {
          setBusy('');
        }
      };

      const composio = data?.composio ?? { configured: false, error: null, apps: [] };
      const apps = composio.apps || [];
      const servers = data?.connectors ?? [];
      const plugins = data?.plugins ?? [];
      const waiting = signIn && pendingApp === signIn.app ? signIn.url : null;

      return h(
        'div',
        { style: S.page },
        h(
          'div',
          { style: S.inner },
          h(
            'div',
            { style: S.header },
            h(
              'div',
              { style: S.headerText },
              h('h1', { style: S.title }, t('title')),
              h('p', { style: S.subtitle }, t('subtitle')),
            ),
            h(
              'button',
              {
                type: 'button',
                style: S.buttonPrimary,
                onClick: () => {
                  setLoading(true);
                  void load();
                },
              },
              loading ? t('refreshing') : t('refresh'),
            ),
          ),

          notice ? h('div', { style: S.banner }, notice) : null,
          !composio.configured
            ? h('div', { style: { ...S.banner, borderColor: TONE.warn, color: TONE.warn } }, t('composioMissing'))
            : null,
          composio.error
            ? h(
                'div',
                { style: { ...S.banner, borderColor: TONE.danger, color: TONE.danger } },
                `${t('composioError')}: ${composio.error.message}`,
              )
            : null,
          error
            ? h(
                'div',
                { style: { ...S.banner, borderColor: TONE.danger, color: TONE.danger } },
                `${t('loadFailed')}: ${error}`,
                h(
                  'button',
                  { type: 'button', style: { ...S.button, marginLeft: 10 }, onClick: () => void load() },
                  t('retry'),
                ),
              )
            : null,
          loading && !data ? h('div', { style: S.empty }, t('loading')) : null,

          h(
            'section',
            { style: S.section },
            h(
              'div',
              { style: S.sectionHead },
              h('h2', { style: S.h2 }, t('connectors')),
              h('span', { style: S.count }, String(apps.length)),
            ),
            h('p', { style: S.hint }, t('appsHint')),
            apps.length
              ? h(
                  'div',
                  { style: S.grid },
                  apps.map((app) =>
                    h(AppCard, {
                      key: app.id,
                      app,
                      t,
                      busy,
                      onConnect: connect,
                      onDisconnect: disconnect,
                      onReopen: (url) => window.open(url, '_blank'),
                      signInUrl: pendingApp === app.id ? waiting : null,
                    }),
                  ),
                )
              : h('div', { style: S.empty }, t('loading')),
          ),

          h(
            'details',
            { style: S.details },
            h(
              'summary',
              { style: S.summary },
              `${t('advanced')} (${servers.length})`,
            ),
            h('p', { style: { ...S.hint, marginTop: 10 } }, t('advancedHint')),
            servers.length
              ? h(
                  'div',
                  { style: { ...S.grid, marginTop: 12 } },
                  servers.map((server) =>
                    h(ServerCard, { key: server.name, server, t, busy, onAction: mcpAction }),
                  ),
                )
              : h('div', { style: { ...S.empty, marginTop: 12 } }, t('emptyServers')),
          ),

          h(
            'section',
            { style: S.section },
            h(
              'div',
              { style: S.sectionHead },
              h('h2', { style: S.h2 }, t('plugins')),
              h('span', { style: S.count }, String(plugins.length)),
            ),
            h('p', { style: S.hint }, t('pluginsHint')),
            plugins.length
              ? h(
                  'div',
                  { style: S.grid },
                  plugins.map((plugin) => h(PluginCard, { key: plugin.name, plugin, t })),
                )
              : h('div', { style: S.empty }, t('emptyPlugins')),
          ),

          h('div', { style: S.footer }, t('footer')),
        ),
      );
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-capabilities: dictionaries');
      const t = ctx.locale.bind(NS);

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 6,
            locale: NS,
            label: () => t('panel'),
          },
          CapabilitiesGlyph,
        ),
      );

      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            locale: NS,
            inject: () => ({ t }),
          },
          CapabilitiesPanel,
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    };
  },
});
