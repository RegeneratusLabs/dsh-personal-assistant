/**
 * Client half of the Host-control panel.
 *
 * Contributes one Settings section (`settings.section`, id `host-control`) that
 * reads `GET api/host-control/status` and calls `POST api/host-control/restart`
 * on the authenticated `/api` channel. The browser's signed cookie rides along
 * with `credentials: 'same-origin'`; the Host derives which unit to restart from
 * its own process, so the request carries no target and cannot name another one.
 *
 * The section exists to close the loop the Plugins page leaves open: an install
 * that reports `restart required` is only visible as a transient toast, and the
 * restart itself was previously shell-only. Reconnecting after a restart needs no
 * new launch token — the cookie survives, so this page simply re-reads its status.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-host-control',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'dsh-host-control';
    /** Exact routes, resolved against the document base so a mounted deployment keeps working. */
    const STATUS_PATH = 'api/host-control/status';
    const RESTART_PATH = 'api/host-control/restart';

    // ── Dictionaries ────────────────────────────────────────────────────────
    const en = {
      section: 'Host control',
      title: 'Host control',
      subtitle:
        'Restart this DSH process to load plugin changes that could not be hot-applied. The page reconnects on its own and no new token is needed.',
      refresh: 'Refresh',
      restart: 'Restart DSH',
      confirmTitle: 'Restart DSH now?',
      confirmBody:
        'This stops the current turn and starts the same profile again. Streaming replies are lost; the session and its history are kept.',
      restartNow: 'Restart now',
      cancel: 'Cancel',
      restarting: 'Restart scheduled — waiting for the host to come back…',
      backOnline: 'Host is back.',
      stillDown: 'Still unreachable after 90s — reload the page.',
      failed: 'Restart failed:',
      unitLabel: 'Unit',
      stateLabel: 'State',
      pidLabel: 'PID',
      sinceLabel: 'Up since',
      listenerLabel: 'Listener',
      profileLabel: 'Profile',
      active: 'active',
      inactive: 'inactive',
      unknown: 'unknown',
      pendingTitle: 'Waiting for a restart',
      pendingNone: 'Nothing waiting for a restart.',
      pendingUnknown: 'The live client graph is not readable from this composition.',
      pendingHint: 'Installed and selected, but this process never composed it.',
      failedTitle: 'Failed to load',
      failedHint:
        'Installed and selected, but its Host row threw while loading. A restart will not fix this: check the Host log (journald or the unit log), then update or remove the plugin.',
      staleTitle: 'Will unload on restart',
      notUnderSystemd:
        'This process does not run under a systemd --user unit, so there is nothing here to restart it with.',
      loading: 'Reading host state…',
      readError: 'Could not read host state:',
      note: 'Only this host is restarted: the unit comes from the running process, never from the request.',
    };
    const zh = {
      section: '主机控制',
      title: '主机控制',
      subtitle:
        '重启本 DSH 进程，加载无法热更新的插件改动。页面会自动重连，无需新的访问令牌。',
      refresh: '刷新',
      restart: '重启 DSH',
      confirmTitle: '现在重启 DSH？',
      confirmBody: '当前回合会被中断，同一配置随后重新启动。流式回复会丢失，会话与历史保留。',
      restartNow: '立即重启',
      cancel: '取消',
      restarting: '已安排重启 — 正在等待主机恢复…',
      backOnline: '主机已恢复。',
      stillDown: '等待 90 秒后仍未恢复 — 请刷新页面。',
      failed: '重启失败：',
      unitLabel: '单元',
      stateLabel: '状态',
      pidLabel: 'PID',
      sinceLabel: '启动于',
      listenerLabel: '监听',
      profileLabel: '配置',
      active: '运行中',
      inactive: '未运行',
      unknown: '未知',
      pendingTitle: '等待重启',
      pendingNone: '没有等待重启的插件。',
      pendingUnknown: '当前组合无法读取实时客户端图谱。',
      pendingHint: '已安装并已选中，但本进程从未加载它。',
      failedTitle: '加载失败',
      failedHint: '已安装并已选中，但它的 Host 行在加载时抛错。重启无法修复：请查看主机日志（journald 或单元日志），然后更新或移除该插件。',
      staleTitle: '重启后将被卸载',
      notUnderSystemd: '本进程不在 systemd --user 单元下运行，因此无法在此重启。',
      loading: '正在读取主机状态…',
      readError: '无法读取主机状态：',
      note: '只重启本主机：单元来自运行中的进程，绝不来自请求。',
    };

    // ── Styles ──────────────────────────────────────────────────────────────
    const S = {
      page: {
        maxWidth: 760,
        padding: '4px 2px 32px',
        color: 'inherit',
        font: 'inherit',
      },
      header: { marginBottom: 18 },
      title: { margin: 0, fontSize: 18, fontWeight: 650, letterSpacing: '-0.01em' },
      subtitle: { margin: '6px 0 0', fontSize: 13, lineHeight: 1.55, opacity: 0.72 },
      card: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '14px 16px',
        marginBottom: 12,
        borderRadius: 12,
        border: '1px solid rgba(127,127,127,0.28)',
        background: 'rgba(127,127,127,0.06)',
      },
      cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
      cardTitle: { margin: 0, fontSize: 14, fontWeight: 600 },
      row: { display: 'flex', gap: 12, alignItems: 'baseline', fontSize: 13, lineHeight: 1.5 },
      rowLabel: { flex: '0 0 92px', opacity: 0.62 },
      rowValue: { flex: '1 1 auto', minWidth: 0, wordBreak: 'break-word' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 },
      dot: (color) => ({
        width: 8,
        height: 8,
        borderRadius: 4,
        background: color,
        flex: '0 0 8px',
      }),
      tag: {
        display: 'inline-block',
        padding: '1px 7px',
        borderRadius: 999,
        fontSize: 11.5,
        background: 'rgba(127,127,127,0.16)',
        opacity: 0.9,
      },
      list: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 },
      listItem: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 },
      hint: { fontSize: 12.5, lineHeight: 1.5, opacity: 0.68 },
      actions: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
      button: {
        appearance: 'none',
        border: '1px solid rgba(127,127,127,0.35)',
        background: 'transparent',
        color: 'inherit',
        borderRadius: 8,
        padding: '6px 12px',
        fontSize: 13,
        cursor: 'pointer',
      },
      buttonPrimary: {
        appearance: 'none',
        border: '1px solid rgba(217,83,79,0.55)',
        background: 'rgba(217,83,79,0.12)',
        color: 'inherit',
        borderRadius: 8,
        padding: '6px 12px',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
      },
      buttonDisabled: { opacity: 0.55, cursor: 'default' },
      confirm: {
        marginTop: 4,
        padding: '12px 14px',
        borderRadius: 10,
        border: '1px solid rgba(217,83,79,0.45)',
        background: 'rgba(217,83,79,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      },
      confirmTitle: { fontSize: 13.5, fontWeight: 600 },
      notice: (bad) => ({
        fontSize: 12.5,
        color: bad ? '#d9534f' : 'inherit',
        opacity: bad ? 1 : 0.75,
      }),
      footer: { fontSize: 12, opacity: 0.55, marginTop: 4 },
    };

    // ── Host API ────────────────────────────────────────────────────────────

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
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = null;
        }
      }
      if (!response.ok) {
        const detail = (payload && (payload.detail || payload.error)) || response.statusText;
        throw new Error(`${response.status} ${detail}`.trim());
      }
      return payload;
    }

    // ── Components ──────────────────────────────────────────────────────────

    function Row({ label, children }) {
      return h('div', { style: S.row }, h('span', { style: S.rowLabel }, label), h('span', { style: S.rowValue }, children));
    }

    function HostControlSection({ t }) {
      const [state, setState] = React.useState(null);
      const [error, setError] = React.useState('');
      const [loading, setLoading] = React.useState(true);
      const [confirming, setConfirming] = React.useState(false);
      const [restarting, setRestarting] = React.useState(false);
      const [notice, setNotice] = React.useState('');

      const load = React.useCallback(async () => {
        setLoading(true);
        setError('');
        try {
          setState(await call(STATUS_PATH));
        } catch (failure) {
          setError(String((failure && failure.message) || failure));
        } finally {
          setLoading(false);
        }
      }, []);

      React.useEffect(() => {
        load();
      }, [load]);

      // After a restart request the old socket dies; poll until the new process answers.
      React.useEffect(() => {
        if (!restarting) return undefined;
        let alive = true;
        let attempts = 0;
        const timer = setInterval(async () => {
          attempts += 1;
          try {
            const next = await call(STATUS_PATH);
            if (!alive) return;
            setState(next);
            setRestarting(false);
            setError('');
            setNotice(t('backOnline'));
          } catch {
            if (alive && attempts >= 45) {
              setRestarting(false);
              setNotice(t('stillDown'));
            }
          }
        }, 2000);
        return () => {
          alive = false;
          clearInterval(timer);
        };
      }, [restarting, t]);

      const restart = async () => {
        setConfirming(false);
        setNotice('');
        setRestarting(true);
        try {
          await call(RESTART_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          });
        } catch (failure) {
          setRestarting(false);
          setError(t('failed') + ' ' + String((failure && failure.message) || failure));
        }
      };

      const unit = state && state.unit;
      const unitName = state && state.self;
      const active = Boolean(unit && unit.active);
      const pending = state ? state.pending : null;
      const failed = (state && state.failed) || [];
      const stale = (state && state.stale) || [];

      const statusCard = h(
        'div',
        { style: S.card },
        h(
          'div',
          { style: S.cardHead },
          h('span', { style: S.dot(active ? '#3fb27f' : unitName ? '#d9534f' : '#c9a227') }),
          h('h2', { style: S.cardTitle }, unitName || t('unknown')),
        ),
        h(Row, { label: t('stateLabel') }, active ? t('active') : unit ? t('inactive') : t('unknown')),
        unit && unit.pid ? h(Row, { label: t('pidLabel') }, h('span', { style: S.mono }, String(unit.pid))) : null,
        unit && unit.since ? h(Row, { label: t('sinceLabel') }, h('span', { style: S.mono }, unit.since)) : null,
        state && state.origin ? h(Row, { label: t('listenerLabel') }, h('span', { style: S.mono }, state.origin)) : null,
        state && state.profile
          ? h(Row, { label: t('profileLabel') }, h('span', { style: S.mono }, state.profile + '  ' + (state.home || '')))
          : null,
        !unitName ? h('div', { style: S.hint }, t('notUnderSystemd')) : null,
      );

      const pendingCard = h(
        'div',
        { style: S.card },
        h('div', { style: S.cardHead }, h('h2', { style: S.cardTitle }, t('pendingTitle'))),
        pending === null
          ? h('div', { style: S.hint }, t('pendingUnknown'))
          : pending.length === 0
            ? h('div', { style: S.hint }, t('pendingNone'))
            : h(
                'ul',
                { style: S.list },
                pending.map((name) =>
                  h(
                    'li',
                    { key: name, style: S.listItem },
                    h('span', { style: S.mono }, name),
                    h('span', { style: S.tag }, t('pendingHint')),
                  ),
                ),
              ),
        stale.length
          ? h(
              'div',
              null,
              h('div', { style: S.hint }, t('staleTitle')),
              h(
                'ul',
                { style: S.list },
                stale.map((name) => h('li', { key: name, style: S.listItem }, h('span', { style: S.mono }, name))),
              ),
            )
          : null,
      );

      const failedCard = failed.length
        ? h(
            'div',
            { style: S.card },
            h('div', { style: S.cardHead }, h('h2', { style: S.cardTitle }, t('failedTitle'))),
            h(
              'ul',
              { style: S.list },
              failed.map((name) =>
                h('li', { key: name, style: S.listItem }, h('span', { style: S.mono }, name)),
              ),
            ),
            h('div', { style: S.hint }, t('failedHint')),
          )
        : null;

      return h(
        'div',
        { style: S.page },
        h(
          'div',
          { style: S.header },
          h('h2', { style: S.title }, t('title')),
          h('p', { style: S.subtitle }, t('subtitle')),
        ),
        loading && !state ? h('div', { style: S.hint }, t('loading')) : null,
        error ? h('div', { style: S.notice(true) }, t('readError') + ' ' + error) : null,
        statusCard,
        pendingCard,
        failedCard,
        h(
          'div',
          { style: S.actions },
          h(
            'button',
            {
              type: 'button',
              style: { ...S.button, ...(loading || restarting ? S.buttonDisabled : {}) },
              onClick: load,
              disabled: loading || restarting,
            },
            t('refresh'),
          ),
          h(
            'button',
            {
              type: 'button',
              style: {
                ...S.buttonPrimary,
                ...(unitName && !restarting ? {} : S.buttonDisabled),
              },
              disabled: !unitName || restarting,
              onClick: () => setConfirming(true),
            },
            restarting ? t('restarting') : t('restart'),
          ),
        ),
        notice ? h('div', { style: S.notice(false) }, notice) : null,
        confirming
          ? h(
              'div',
              { style: S.confirm },
              h('div', { style: S.confirmTitle }, t('confirmTitle')),
              h('div', { style: S.hint }, t('confirmBody')),
              h(
                'div',
                { style: S.actions },
                h('button', { type: 'button', style: S.buttonPrimary, onClick: restart }, t('restartNow')),
                h('button', { type: 'button', style: S.button, onClick: () => setConfirming(false) }, t('cancel')),
              ),
            )
          : null,
        h('div', { style: S.footer }, t('note')),
      );
    }

    // ── Plugin ──────────────────────────────────────────────────────────────

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-host-control: dictionaries');
      const t = ctx.locale.bind(NS);

      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'host-control',
            order: 90,
            locale: NS,
            label: () => t('section'),
            inject: () => ({ t }),
          },
          HostControlSection,
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    };
  },
});
