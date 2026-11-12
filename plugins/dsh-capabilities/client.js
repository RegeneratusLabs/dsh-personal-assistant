/**
 * Browser half of the Capabilities panel.
 *
 * One left-sidebar entry (`sidebar.panellist`, id `capabilities`) and the
 * central page that entry selects (`main`, key `capabilities`). The page joins
 * the two planes rc.2 already owns: **Connectors** from the MCP manager
 * (`ctx.mcpManager`) and **Plugins** from the profile's bundle list
 * (`ctx.pluginManager`). It is a read-only hub: connector probe/restart are
 * safe runtime operations; installing, toggling and configuring stay on the
 * official Plugins page and Settings.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-capabilities',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Sidebar entry id; the `main` panel registers under the same key. */
    const PANEL_ID = 'capabilities';
    /** Locale namespace owned by this plugin. */
    const NS = 'dsh-capabilities';
    /** Status refresh cadence (ms). */
    const REFRESH_MS = 15000;

    // ── Dictionaries ────────────────────────────────────────────────────────
    const en = {
      panel: 'Capabilities',
      title: 'Capabilities',
      subtitle:
        'Everything this profile can do, in two planes: connectors (MCP servers) and the plugins that compose this host.',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      loading: 'Reading capabilities…',
      loadFailed: 'Could not read capabilities',
      retry: 'Retry',
      connectors: 'Connectors',
      plugins: 'Plugins',
      connectorsHint: 'MCP servers from the mcp-manager row. Add or edit them in Settings → Plugins (MCP).',
      pluginsHint: 'Install, remove and toggle bundles on the Plugins page. This page reports what is live.',
      emptyConnectors: 'No connectors yet. Configure an MCP server in Settings → Plugins (MCP).',
      emptyPlugins: 'No plugin bundles are composed in this profile.',
      configured: 'configured',
      removed: 'removed',
      official: 'official',
      on: 'on',
      off: 'off',
      rows: 'rows',
      probe: 'Probe',
      restart: 'Restart',
      probing: 'Probing…',
      restarting: 'Restarting…',
      probeOk: 'Probe finished',
      restartOk: 'Connector restarted',
      actionFailed: 'Action failed',
      statusConnected: 'connected',
      statusConnecting: 'connecting',
      statusDisabled: 'disabled',
      statusFailed: 'failed',
      statusDisconnected: 'disconnected',
      statusUnknown: 'unknown',
      footer: 'Connector status refreshes every 15 s. Probe and restart act on the live manager, never on the profile files.',
    };
    const zh = {
      panel: '能力',
      title: '能力',
      subtitle: '此配置的全部能力：连接器（MCP 服务器）与组成此主机的插件。',
      refresh: '刷新',
      refreshing: '刷新中…',
      loading: '正在读取能力…',
      loadFailed: '无法读取能力',
      retry: '重试',
      connectors: '连接器',
      plugins: '插件',
      connectorsHint: '来自 mcp-manager 的 MCP 服务器。请在「设置 → 插件（MCP）」中添加或编辑。',
      pluginsHint: '在「插件」页面安装、移除和开关 bundle；本页只报告运行状态。',
      emptyConnectors: '还没有连接器。请在「设置 → 插件（MCP）」中配置 MCP 服务器。',
      emptyPlugins: '此配置没有组合任何插件 bundle。',
      configured: '已配置',
      removed: '已移除',
      official: '官方',
      on: '开启',
      off: '关闭',
      rows: '行',
      probe: '探测',
      restart: '重启',
      probing: '探测中…',
      restarting: '重启中…',
      probeOk: '探测完成',
      restartOk: '连接器已重启',
      actionFailed: '操作失败',
      statusConnected: '已连接',
      statusConnecting: '连接中',
      statusDisabled: '已禁用',
      statusFailed: '失败',
      statusDisconnected: '已断开',
      statusUnknown: '未知',
      footer: '连接器状态每 15 秒刷新。探测和重启只作用于运行中的 manager，不修改配置文件。',
    };

    // ── Data ────────────────────────────────────────────────────────────────

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
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      return payload;
    }

    const STATE_TONE = {
      connected: 'ok',
      connecting: 'warn',
      disabled: 'muted',
      failed: 'danger',
      error: 'danger',
      disconnected: 'muted',
      unknown: 'muted',
    };

    function stateLabel(t, state) {
      switch (state) {
        case 'connected': return t('statusConnected');
        case 'connecting': return t('statusConnecting');
        case 'disabled': return t('statusDisabled');
        case 'failed': return t('statusFailed');
        case 'disconnected': return t('statusDisconnected');
        default: return t('statusUnknown');
      }
    }

    // ── Styles ──────────────────────────────────────────────────────────────
    // Token-driven with neutral fallbacks, so the page follows the active theme.
    const TONE = {
      ok: 'var(--dsw-alias-state-success-primary, #1a7f37)',
      warn: 'var(--dsw-alias-state-warning-primary, #a15c00)',
      danger: 'var(--dsw-alias-state-error-primary, #c62828)',
      muted: 'var(--dsw-alias-label-secondary, #6b7280)',
      brand: 'var(--dsw-alias-brand-primary, #3b6ef6)',
    };
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

    function ConnectorCard({ connector, t, busy, onAction }) {
      const state = connector.state || 'unknown';
      const tone = STATE_TONE[state] || 'muted';
      const pending = busy === connector.name;
      const disabled = pending || !connector.configured;
      return h(
        'div',
        { style: S.card },
        h(
          'div',
          { style: S.cardHead },
          h('span', { style: S.name }, connector.name),
          h(Badge, { tone }, stateLabel(t, state)),
        ),
        h(
          'div',
          { style: S.meta },
          connector.configured ? t('configured') : t('removed'),
        ),
        connector.error ? h('div', { style: S.err }, connector.error) : null,
        h(
          'div',
          { style: S.actions },
          h(
            'button',
            {
              type: 'button',
              style: S.button,
              disabled,
              'aria-label': `${t('probe')} ${connector.name}`,
              onClick: () => onAction('probe', connector.name),
            },
            pending ? t('probing') : t('probe'),
          ),
          h(
            'button',
            {
              type: 'button',
              style: S.button,
              disabled,
              'aria-label': `${t('restart')} ${connector.name}`,
              onClick: () => onAction('restart', connector.name),
            },
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
          [plugin.version ? `v${plugin.version}` : null, `${plugin.rows} ${t('rows')}`]
            .filter(Boolean)
            .join(' · '),
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
        const timer = setInterval(() => {
          void tick();
        }, REFRESH_MS);
        return () => {
          alive = false;
          clearInterval(timer);
        };
      }, []);

      const act = async (kind, name) => {
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

      const connectors = data?.connectors ?? [];
      const plugins = data?.plugins ?? [];

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
              h('span', { style: S.count }, String(connectors.length)),
            ),
            h('p', { style: S.hint }, t('connectorsHint')),
            connectors.length
              ? h(
                  'div',
                  { style: S.grid },
                  connectors.map((connector) =>
                    h(ConnectorCard, {
                      key: connector.name,
                      connector,
                      t,
                      busy,
                      onAction: act,
                    }),
                  ),
                )
              : h('div', { style: S.empty }, t('emptyConnectors')),
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

    // ── Plugin ──────────────────────────────────────────────────────────────

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
