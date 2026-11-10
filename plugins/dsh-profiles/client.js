/**
 * Client half of the Profiles panel (design A: multi-host dashboard).
 *
 * Each profile is an independent DSH host — its own $DSH_HOME, profile bundle
 * stack and port. This page is only a dashboard: it renders one card per host,
 * probes liveness, and opens the host in a new tab. It never proxies traffic,
 * so DSH's per-authority browser cookies keep each host logged in on its own.
 *
 * Contributes one left-sidebar entry (`sidebar.panellist`, id `profiles`) and
 * the central page that entry selects (`main`, key `profiles`).
 *
 * Configuration: edit PROFILES below and reload the Web UI. A client-only
 * plugin cannot read a Loader row config without a Host Remote; adding that is
 * the natural v0.2 step (and then a Settings card can edit it in place).
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-profiles',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Sidebar entry id; the `main` panel registers under the same key. */
    const PANEL_ID = 'profiles';
    /** Locale namespace owned by this plugin. */
    const NS = 'dsh-profiles';
    /** Liveness probe cadence (ms). */
    const PROBE_INTERVAL = 15000;
    /** Per-probe timeout (ms); an authenticated 401 still counts as reachable. */
    const PROBE_TIMEOUT = 2500;

    /**
     * The hosts this panel can open. One entry per independent DSH host:
     * `url` must be the exact browser authority (hostname + port) you open,
     * because DSH binds its session cookie to that authority.
     */
    const PROFILES = [
      {
        id: 'coding',
        name: 'Coding',
        url: 'https://homelab.taildace6c.ts.net/',
        accent: '#4f8cff',
        description:
          'Main harness: coding sessions, terminal, files, repo work, browser and media plugins.',
      },
      {
        id: 'personal',
        name: 'Personal',
        url: 'https://homelab.taildace6c.ts.net:8454/',
        accent: '#3fb27f',
        description:
          'Barebones personal host on its own DSH home. Later: Telegram channel, memory, heartbeat, briefs.',
      },
    ];

    // ── Dictionaries ────────────────────────────────────────────────────────
    // `zh` and `en` are the locale service's baseline pair; both carry the same
    // key set, and every visible string goes through `t`.
    const en = {
      panel: 'Profiles',
      title: 'Profiles',
      subtitle:
        'Each profile is an independent DSH host with its own home, sessions, plugins and schedules. Open one, or copy its address.',
      statusChecking: 'checking',
      statusUp: 'online',
      statusDown: 'unreachable',
      thisHost: 'this host',
      open: 'Open',
      copy: 'Copy URL',
      copied: 'Copied',
      firstVisitTitle: 'First visit needs the startup link once',
      firstVisitBody:
        'If a profile shows a DSH unlock page, open it once through the `dsh web:` URL from that host\'s log (it exchanges the process token for a signed cookie). After that the browser keeps you signed in for this host and port.',
      footer:
        'Liveness is a no-cors fetch every 15s; a reachable host that answers 401 still counts as online.',
      noProfiles: 'No profiles configured. Edit PROFILES in client.js and reload.',
    };
    const zh = {
      panel: '配置',
      title: '配置',
      subtitle:
        '每个配置都是独立的 DSH 主机：独立的 home、会话、插件与定时任务。可以打开其中一个，或复制地址。',
      statusChecking: '检测中',
      statusUp: '在线',
      statusDown: '不可达',
      thisHost: '当前主机',
      open: '打开',
      copy: '复制地址',
      copied: '已复制',
      firstVisitTitle: '首次访问需要打开一次启动链接',
      firstVisitBody:
        '若某个配置显示 DSH 解锁页，请用该主机日志中 `dsh web:` 那一行的地址打开一次（它会用进程 token 换取签名 cookie）。之后浏览器会为该主机和端口保持登录。',
      footer: '每 15 秒用 no-cors fetch 探测一次；返回 401 的在线主机也视为在线。',
      noProfiles: '未配置主机。修改 client.js 中的 PROFILES 并刷新页面。',
    };

    // ── Liveness ────────────────────────────────────────────────────────────

    /** Resolve 'up' when the host answers anything, 'down' on network failure. */
    function probe(url) {
      return new Promise((resolve) => {
        let settled = false;
        const settle = (value) => {
          if (!settled) {
            settled = true;
            resolve(value);
          }
        };
        const controller =
          typeof AbortController === 'function' ? new AbortController() : null;
        const timer = setTimeout(() => {
          if (controller) {
            try {
              controller.abort();
            } catch {
              /* ignore */
            }
          }
          settle('down');
        }, PROBE_TIMEOUT);
        try {
          fetch(url, {
            mode: 'no-cors',
            cache: 'no-store',
            credentials: 'omit',
            signal: controller ? controller.signal : undefined,
          }).then(
            () => {
              clearTimeout(timer);
              settle('up');
            },
            () => {
              clearTimeout(timer);
              settle('down');
            },
          );
        } catch {
          clearTimeout(timer);
          settle('down');
        }
      });
    }

    function useStatuses(profiles) {
      const [statuses, setStatuses] = React.useState(() =>
        Object.fromEntries(profiles.map((p) => [p.id, 'checking'])),
      );
      React.useEffect(() => {
        let alive = true;
        const tick = async () => {
          const pairs = await Promise.all(
            profiles.map(async (p) => [p.id, await probe(p.url)]),
          );
          if (alive) setStatuses(Object.fromEntries(pairs));
        };
        tick();
        const timer = setInterval(tick, PROBE_INTERVAL);
        return () => {
          alive = false;
          clearInterval(timer);
        };
      }, []);
      return statuses;
    }

    // ── Styles ──────────────────────────────────────────────────────────────

    const S = {
      page: {
        height: '100%',
        overflowY: 'auto',
        padding: '28px 34px 40px',
        color: 'inherit',
        font: 'inherit',
      },
      header: { maxWidth: 980, margin: '0 auto 22px' },
      title: { margin: 0, fontSize: 22, fontWeight: 650, letterSpacing: '-0.01em' },
      subtitle: {
        margin: '8px 0 0',
        maxWidth: 720,
        fontSize: 13,
        lineHeight: 1.55,
        opacity: 0.72,
      },
      grid: {
        maxWidth: 980,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 14,
      },
      card: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '16px 18px 14px',
        borderRadius: 12,
        border: '1px solid rgba(127,127,127,0.28)',
        background: 'rgba(127,127,127,0.07)',
      },
      cardHead: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      },
      name: { fontSize: 15, fontWeight: 650 },
      tag: {
        marginLeft: 'auto',
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 999,
        border: '1px solid rgba(127,127,127,0.35)',
        opacity: 0.85,
      },
      url: {
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        fontSize: 12,
        opacity: 0.75,
        wordBreak: 'break-all',
      },
      desc: { fontSize: 12.5, lineHeight: 1.5, opacity: 0.8, minHeight: 38 },
      actions: { display: 'flex', gap: 8, marginTop: 2 },
      button: {
        appearance: 'none',
        border: '1px solid rgba(127,127,127,0.4)',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        fontSize: 12.5,
        padding: '5px 12px',
        borderRadius: 8,
        cursor: 'pointer',
      },
      buttonPrimary: {
        appearance: 'none',
        border: '1px solid transparent',
        background: 'rgba(127,127,127,0.2)',
        color: 'inherit',
        font: 'inherit',
        fontSize: 12.5,
        fontWeight: 600,
        padding: '5px 14px',
        borderRadius: 8,
        cursor: 'pointer',
      },
      hint: {
        maxWidth: 980,
        margin: '18px auto 0',
        padding: '12px 16px',
        borderRadius: 10,
        border: '1px solid rgba(127,127,127,0.22)',
        background: 'rgba(127,127,127,0.05)',
        fontSize: 12.5,
        lineHeight: 1.55,
        opacity: 0.85,
      },
      hintTitle: { fontWeight: 650, marginBottom: 4, opacity: 0.95 },
      footer: { maxWidth: 980, margin: '14px auto 0', fontSize: 11.5, opacity: 0.55 },
    };

    function statusDot(color) {
      return h('span', {
        style: {
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
          flex: '0 0 auto',
          boxShadow: color === '#3fb27f' ? '0 0 0 3px rgba(63,178,127,0.16)' : 'none',
        },
      });
    }

    // ── Components ──────────────────────────────────────────────────────────

    /** Left-sidebar glyph: four rounded tiles, drawn in the inherited color. */
    function ProfilesGlyph({ size = 18 }) {
      const unit = size / 24;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          style: { display: 'block', transform: `scale(${unit})`, transformOrigin: '0 0' },
        },
        h('rect', { x: 3, y: 4, width: 7.5, height: 7, rx: 1.6 }),
        h('rect', { x: 13.5, y: 4, width: 7.5, height: 7, rx: 1.6 }),
        h('rect', { x: 3, y: 13.5, width: 7.5, height: 7, rx: 1.6 }),
        h('rect', { x: 13.5, y: 13.5, width: 7.5, height: 7, rx: 1.6 }),
      );
    }

    function ProfilesPanel({ t }) {
      const statuses = useStatuses(PROFILES);
      const currentHost = typeof location !== 'undefined' ? location.host : '';
      const [copiedId, setCopiedId] = React.useState('');

      const open = (profile) => {
        window.open(profile.url, '_blank', 'noopener,noreferrer');
      };
      const copy = async (profile) => {
        try {
          await navigator.clipboard.writeText(profile.url);
          setCopiedId(profile.id);
          setTimeout(() => setCopiedId(''), 1600);
        } catch {
          /* clipboard may be unavailable; ignore */
        }
      };

      const cards = PROFILES.map((profile) => {
        const status = statuses[profile.id] || 'checking';
        const dot =
          status === 'up' ? '#3fb27f' : status === 'down' ? '#d9534f' : '#c9a227';
        const label =
          status === 'up'
            ? t('statusUp')
            : status === 'down'
              ? t('statusDown')
              : t('statusChecking');
        const isThisHost =
          currentHost &&
          profile.url.replace(/^https?:\/\//, '').replace(/\/$/, '') === currentHost;
        return h(
          'div',
          { key: profile.id, style: S.card },
          h(
            'div',
            { style: S.cardHead },
            statusDot(dot),
            h('span', { style: S.name }, profile.name),
            h('span', { style: { ...S.tag, color: dot } }, label),
            isThisHost ? h('span', { style: S.tag }, t('thisHost')) : null,
          ),
          h('div', { style: S.url }, profile.url),
          h('div', { style: S.desc }, profile.description),
          h(
            'div',
            { style: S.actions },
            h(
              'button',
              {
                type: 'button',
                style: S.buttonPrimary,
                onClick: () => open(profile),
                title: profile.url,
              },
              t('open'),
            ),
            h(
              'button',
              { type: 'button', style: S.button, onClick: () => copy(profile) },
              copiedId === profile.id ? t('copied') : t('copy'),
            ),
          ),
        );
      });

      return h(
        'div',
        { style: S.page },
        h(
          'div',
          { style: S.header },
          h('h1', { style: S.title }, t('title')),
          h('p', { style: S.subtitle }, t('subtitle')),
        ),
        PROFILES.length
          ? h('div', { style: S.grid }, cards)
          : h('div', { style: S.hint }, t('noProfiles')),
        h(
          'div',
          { style: S.hint },
          h('div', { style: S.hintTitle }, t('firstVisitTitle')),
          h('div', null, t('firstVisitBody')),
        ),
        h('div', { style: S.footer }, t('footer')),
      );
    }

    // ── Plugin ──────────────────────────────────────────────────────────────

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-profiles: dictionaries');
      const t = ctx.locale.bind(NS);

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 5,
            locale: NS,
            label: () => t('panel'),
          },
          ProfilesGlyph,
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
          ProfilesPanel,
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    };
  },
});
