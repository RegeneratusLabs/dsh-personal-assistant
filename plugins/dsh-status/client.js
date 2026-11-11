/**
 * Client half of the Status panel (@local/dsh-status).
 *
 * One left-sidebar entry ("Assistant", id `assistant`) and its keyed `main` page.
 * The page is a read-only view of one authenticated host route,
 * `GET api/dsh-status/status`, which aggregates local assistant state:
 * systemd unit + timers, alerts, egress, backups, retention, Hindsight bank
 * counts, token cost, curator and identity metadata. Nothing here writes, and
 * nothing here reads files or credentials directly.
 *
 * Design: "instrument panel with a human voice" — dense hairline sections and
 * numbers first, but every section leads with one plain sentence. All colours,
 * radii and type sizes come from the DSH theme tokens (--dsw-*); the only local
 * custom properties are geometry (gutter) and the mono stack.
 *
 * Data is untrusted: every string is rendered as a React text node, token-shaped
 * strings are masked before display, and a missing/failed source degrades only
 * its own section.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-status',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Sidebar entry id; the `main` page registers under the same key. */
    const PANEL_ID = 'assistant';
    /** Locale namespace owned by this plugin. */
    const NS = 'dsh-status';
    /** The one host route this page reads (no parameters select a target). */
    const ROUTE = 'api/dsh-status/status';
    /** Refresh cadence while the tab is visible; backoff on failure. */
    const REFRESH_MS = 60000;
    const REFRESH_MIN_MS = 15000;
    const BACKOFF_MAX_MS = 300000;

    // ── Dictionaries ────────────────────────────────────────────────────────
    // `zh` and `en` are the locale service's baseline pair; both carry the same
    // key set and every visible string goes through `t`.
    const en = {
      panel: 'Assistant',
      title: 'Status',
      eyebrow: 'Personal agent · dsh-personal.service',
      eyebrowUnit: 'Personal agent · {unit}',
      tabStatus: 'Status',
      tabMemory: 'Memory',
      tabActivity: 'Activity',
      mainLabel: 'Assistant status',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      updated: 'Updated {age} ago',
      updatedJustNow: 'Updated just now',
      stale: 'stale',
      agent: 'Agent',
      alerts: 'Alerts',
      memory: 'Memory',
      backup: 'Backup',
      running: 'Running',
      stopped: 'Stopped',
      unavailable: 'Unavailable',
      unknown: 'unknown',
      since: 'since {time}',
      uptime: 'up {duration}',
      warnings: '{n} warnings',
      errors: '{n} errors',
      oneWarning: '1 warning',
      nodes: '{n} nodes',
      docsObs: '{documents} documents · {observations} observations',
      backupAge: '{age} ago · limit {limit}h',
      backupLimit: 'limit {limit}h',
      verified: 'verified',
      ledeOk: 'Running since {since}. {warnings} are worth a glance; everything else is steady.',
      ledeQuiet: 'Running since {since}. Nothing needs you right now.',
      ledeDown: 'The assistant is not running. Last known state is shown below.',
      ledeUnknown: 'Live state is unavailable; the last known values are shown below.',
      memorySentence: 'It remembers {nodes} things across {documents} documents; the last write was {ago} ago.',
      memoryEmpty: 'Nothing is stored in this bank yet.',
      bankMeta: 'bank {bank} · {health}',
      healthy: 'healthy',
      scheduledJobs: 'Scheduled jobs',
      jobsSentence: 'The next run is {next}; {count} scheduled jobs are registered.',
      jobsNone: 'No scheduled jobs are registered.',
      safety: 'Safety & retention',
      safetySentence: 'The daily backup is {age} old (limit {limit}h); {files} files are held for retention.',
      safetyNoBackup: 'No backup has been found yet.',
      dailyBackup: 'Daily backup',
      weeklyBackup: 'Weekly backup',
      retainedFiles: 'Retained files',
      telemetryFiles: 'Telemetry',
      sessionsFiles: 'Sessions',
      identity: 'Identity',
      identitySentence: 'SOUL.md is {size}, last edited {ago} ago.',
      identityMissing: 'No SOUL.md is installed for this agent.',
      soul: 'SOUL.md',
      needsAttention: 'Needs attention',
      attentionClear: 'Nothing needs you; {checks} checks ran at {time}.',
      attentionSome: '{warnings} and {errors}; {checks} checks ran at {time}.',
      checksRun: 'Checks run',
      alertRestarts: 'The assistant restarted {starts} times in the last 24h. Expected during setup; investigate if it keeps happening.',
      alertCost: 'Spike detection needs 3 baseline days and has {days}. This warning clears itself.',
      alertFallback: 'Open the digest for the full check output.',
      egress: 'Egress · 24h',
      egressSentence: '{n} destination was contacted in 24h; {unexpected} unexpected.',
      egressSentenceMany: '{n} destinations were contacted in 24h; {unexpected} unexpected.',
      egressUnavailable: 'Egress observation is not active on this host.',
      destinations: 'Destinations',
      unexpected: 'Unexpected',
      events: '{n} events',
      cost: 'Token cost',
      costSentence: '{tokens} tokens today; spike detection is {spike}.',
      tokensToday: 'Tokens today',
      sevenDayMemo: '7-day memory LLM',
      spike: 'Spike detection',
      active: 'active',
      inactive: 'inactive',
      unknownLower: 'unknown',
      sources: '{ok}/{total} sources fresh',
      sourceFailed: '{n} sources unavailable',
      generated: 'generated {time}',
      readOnly: 'read-only',
      notInstalled: 'The status host half is not installed. Enable the dsh-status bundle, then reload.',
      authExpired: 'Session expired. Reload the page and unlock this host again.',
      loadFailed: 'Status is unavailable ({detail}).',
      retry: 'Retry',
      loading: 'Loading status…',
      partial: '{n} sections unavailable',
      none: 'None',
      version: 'Version',
      address: 'Address',
      profile: 'Profile',
      pendingPlugins: 'Plugins',
      pluginsMeta: '{selected} selected · {installed} installed',
      clientModules: 'Client modules',
      failDetail: 'unavailable ({detail})',
      failNoSource: 'not available',
      bank: 'Bank',
      documents: 'Documents',
      observations: 'Observations',
      links: 'Links',
      lastWrite: 'Last write',
      consolidation: 'Consolidation',
      curator: 'Curator',
      userScope: 'user',
      systemScope: 'system',
      tabHint: 'Memory and Activity arrive in the next slices.',
      steady: 'Steady',
      attention: 'Attention',
      warnUnit: 'warnings',
      nodeUnit: 'nodes',
      unitAgo: 'ago',
      nodesLabel: 'Nodes',
      pending: '{n} pending',
      agoLabel: '{ago} ago',
      storePending: '{n} pending',
    };
    const zh = {
      panel: '助手',
      title: '状态',
      eyebrow: '个人代理 · dsh-personal.service',
      eyebrowUnit: '个人代理 · {unit}',
      tabStatus: '状态',
      tabMemory: '记忆',
      tabActivity: '活动',
      mainLabel: '助手状态',
      refresh: '刷新',
      refreshing: '刷新中…',
      updated: '更新于 {age}前',
      updatedJustNow: '刚刚更新',
      stale: '已过期',
      agent: '代理',
      alerts: '告警',
      memory: '记忆',
      backup: '备份',
      running: '运行中',
      stopped: '已停止',
      unavailable: '不可用',
      unknown: '未知',
      since: '自 {time}',
      uptime: '已运行 {duration}',
      warnings: '{n} 条警告',
      errors: '{n} 个错误',
      oneWarning: '1 条警告',
      nodes: '{n} 个节点',
      docsObs: '{documents} 个文档 · {observations} 条观察',
      backupAge: '{age} 前 · 上限 {limit} 小时',
      backupLimit: '上限 {limit} 小时',
      verified: '已验证',
      ledeOk: '自 {since} 起运行。{warnings}值得看一眼，其余一切平稳。',
      ledeQuiet: '自 {since} 起运行。现在没有任何事情需要你处理。',
      ledeDown: '助手当前没有运行。下面显示最后一次已知状态。',
      ledeUnknown: '实时状态不可用，下面显示最后一次已知的值。',
      memorySentence: '它记住了 {nodes} 件事，分布在 {documents} 个文档中；最近一次写入是 {ago} 前。',
      memoryEmpty: '这个记忆库还是空的。',
      bankMeta: '库 {bank} · {health}',
      healthy: '健康',
      scheduledJobs: '定时任务',
      jobsSentence: '下一次运行在 {next}；共注册 {count} 个定时任务。',
      jobsNone: '没有注册定时任务。',
      safety: '安全与保留',
      safetySentence: '每日备份是 {age} 前（上限 {limit} 小时）；保留了 {files} 个文件。',
      safetyNoBackup: '还没有找到任何备份。',
      dailyBackup: '每日备份',
      weeklyBackup: '每周备份',
      retainedFiles: '保留文件',
      telemetryFiles: '遥测',
      sessionsFiles: '会话',
      identity: '身份',
      identitySentence: 'SOUL.md 为 {size}，最近编辑于 {ago} 前。',
      identityMissing: '这个助手还没有安装 SOUL.md。',
      soul: 'SOUL.md',
      needsAttention: '需要关注',
      attentionClear: '没有事情需要你处理；{checks} 项检查在 {time} 运行。',
      attentionSome: '{warnings}和{errors}；{checks} 项检查在 {time} 运行。',
      checksRun: '已运行检查',
      alertRestarts: '助手在过去 24 小时内重启了 {starts} 次。安装期间属正常；若持续发生再看。',
      alertCost: '尖峰检测需要 3 个基线日，目前有 {days} 个。这条警告会自行消失。',
      alertFallback: '完整检查输出见每日摘要。',
      egress: '出网 · 24 小时',
      egressSentence: '24 小时内联系了 {n} 个目的地；意外 {unexpected} 个。',
      egressSentenceMany: '24 小时内联系了 {n} 个目的地；意外 {unexpected} 个。',
      egressUnavailable: '这台主机上的出网观测未启用。',
      destinations: '目的地',
      unexpected: '意外',
      events: '{n} 次',
      cost: 'Token 成本',
      costSentence: '今天用了 {tokens} tokens；尖峰检测状态为 {spike}。',
      tokensToday: '今日 tokens',
      sevenDayMemo: '7 天记忆 LLM',
      spike: '尖峰检测',
      active: '已启用',
      inactive: '未启用',
      unknownLower: '未知',
      sources: '{ok}/{total} 个数据源正常',
      sourceFailed: '{n} 个数据源不可用',
      generated: '生成于 {time}',
      readOnly: '只读',
      notInstalled: '状态主机端未安装。请启用 dsh-status 插件后重新加载。',
      authExpired: '会话已过期。请重新加载页面并重新解锁这台主机。',
      loadFailed: '状态不可用（{detail}）。',
      retry: '重试',
      loading: '正在加载状态…',
      partial: '{n} 个分区不可用',
      none: '无',
      version: '版本',
      address: '地址',
      profile: '配置',
      pendingPlugins: '插件',
      pluginsMeta: '已选 {selected} · 已装 {installed}',
      clientModules: '客户端模块',
      failDetail: '不可用（{detail}）',
      failNoSource: '不可用',
      bank: '记忆库',
      documents: '文档',
      observations: '观察',
      links: '关联',
      lastWrite: '最近写入',
      consolidation: '整合',
      curator: '记忆整理',
      userScope: '用户',
      systemScope: '系统',
      tabHint: '记忆与活动将在后续切片加入。',
      steady: '平稳',
      attention: '需关注',
      warnUnit: '条警告',
      nodeUnit: '个节点',
      unitAgo: '前',
      nodesLabel: '节点',
      pending: '{n} 个待处理',
      agoLabel: '{ago} 前',
      storePending: '{n} 个待处理',
    };

    // ── Small formatters (pure; unit-testable) ──────────────────────────────
    const NUM = new Intl.NumberFormat('en');

    function fill(template, vars) {
      let out = template;
      for (const key of Object.keys(vars || {})) {
        out = out.split('{' + key + '}').join(String(vars[key]));
      }
      return out;
    }

    function num(value) {
      return typeof value === 'number' && isFinite(value) ? NUM.format(value) : '—';
    }

    /** Masks token-shaped strings before anything reaches the DOM. */
    function maskSecrets(text) {
      if (typeof text !== 'string') return '';
      return text
        .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{12,}/g, '***')
        .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '***')
        .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, '***')
        .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, '***');
    }

    function parseTime(value) {
      if (!value) return null;
      const ms = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value);
      return isFinite(ms) ? ms : null;
    }

    function duration(seconds) {
      if (typeof seconds !== 'number' || !isFinite(seconds) || seconds < 0) return null;
      const total = Math.floor(seconds / 60);
      const days = Math.floor(total / 1440);
      const hours = Math.floor((total % 1440) / 60);
      const mins = total % 60;
      if (days > 0) return days + 'd ' + hours + 'h';
      if (hours > 0) return hours + 'h ' + mins + 'm';
      return mins + 'm';
    }

    function ago(value, nowMs) {
      const at = parseTime(value);
      if (at === null) return null;
      const delta = Math.max(0, (nowMs || Date.now()) - at);
      const mins = Math.floor(delta / 60000);
      if (mins < 1) return Math.max(1, Math.round(delta / 1000)) + 's';
      if (mins < 60) return mins + 'm';
      const hours = Math.floor(mins / 60);
      if (hours < 48) return hours + 'h';
      return Math.floor(hours / 24) + 'd';
    }

    function clock(value) {
      const at = parseTime(value);
      if (at === null) return null;
      const d = new Date(at);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    function nextIn(value, nowMs) {
      const at = parseTime(value);
      if (at === null) return null;
      const delta = at - (nowMs || Date.now());
      if (delta <= 0) return 'now';
      return 'in ' + duration(Math.round(delta / 1000));
    }

    function bytes(value) {
      if (typeof value !== 'number' || !isFinite(value)) return null;
      if (value < 1024) return value + ' B';
      if (value < 1024 * 1024) return (value / 1024).toFixed(value < 10240 ? 1 : 0) + ' KB';
      return (value / 1024 / 1024).toFixed(1) + ' MB';
    }

    /** Parse `window=24h starts=6 …` style script detail into a flat object. */
    function parseKv(detail) {
      const out = {};
      for (const token of String(detail || '').split(/\s+/)) {
        const at = token.indexOf('=');
        if (at > 0 && at < token.length - 1) out[token.slice(0, at)] = token.slice(at + 1).replace(/[),;]+$/, '');
      }
      return out;
    }

    /** Human sentence for a known warning check; null when the detail is machine noise. */
    function checkSentence(check, t) {
      const kv = parseKv(check.detail);
      if (check.id === 'unit-restarts' && kv.starts) return fill(t('alertRestarts'), { starts: kv.starts });
      if (check.id === 'cost-spike' && kv['baseline-days']) return fill(t('alertCost'), { days: kv['baseline-days'] });
      const detail = String(check.detail || '');
      if (detail && detail.indexOf('=') === -1) return maskSecrets(detail);
      return null;
    }

    function tone(level) {
      if (level === 'ok') return 'ok';
      if (level === 'warn') return 'warn';
      if (level === 'alert' || level === 'error') return 'error';
      if (level === 'degraded') return 'idle';
      return 'idle';
    }

    /** A section is usable unless it explicitly failed. */
    function live(data, key) {
      const section = data && data[key];
      if (!section || section.ok === false) return null;
      return section;
    }

    function failText(section, t) {
      const detail = section && section.error ? maskSecrets(String(section.error)) : null;
      return detail ? fill(t('failDetail'), { detail }) : t('failNoSource');
    }

    // ── Status store ────────────────────────────────────────────────────────
    function routeUrl() {
      return new URL(ROUTE, document.baseURI).toString();
    }

    async function fetchStatus() {
      const response = await fetch(routeUrl(), {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout
          ? AbortSignal.timeout(9000)
          : undefined,
      });
      const text = await response.text();
      let payload = null;
      if (text) {
        try { payload = JSON.parse(text); } catch { payload = null; }
      }
      if (response.status === 401 || response.status === 403) {
        const failure = new Error('auth');
        failure.kind = 'auth';
        throw failure;
      }
      if (response.status === 404) {
        const failure = new Error('missing');
        failure.kind = 'missing';
        throw failure;
      }
      if (!response.ok) {
        const detail = (payload && (payload.detail || payload.error)) || response.statusText;
        const failure = new Error(String(detail || response.status));
        failure.kind = 'http';
        failure.status = response.status;
        throw failure;
      }
      if (!payload || payload.ok !== true) {
        const failure = new Error('bad-payload');
        failure.kind = 'http';
        throw failure;
      }
      return payload;
    }

    function useStatus() {
      const [state, setState] = React.useState({
        data: null, error: null, loading: true, refreshing: false, fetchedAt: 0,
      });
      const [nonce, setNonce] = React.useState(0);
      const [, setTick] = React.useState(0);
      const alive = React.useRef(true);
      const loadRef = React.useRef(null);

      // Relative timestamps must not freeze while the tab sits open.
      React.useEffect(() => {
        const id = setInterval(() => {
          if (document.visibilityState === 'visible') setTick((value) => value + 1);
        }, 15000);
        return () => clearInterval(id);
      }, []);

      React.useEffect(() => {
        alive.current = true;
        let timer = null;
        let delay = REFRESH_MS;
        let lastAt = 0;
        let busy = false;

        const schedule = (ms) => {
          clearTimeout(timer);
          timer = setTimeout(run, ms);
        };

        const run = async (manual) => {
          if (!alive.current || busy) return;
          if (document.visibilityState === 'hidden' && !manual) { schedule(REFRESH_MS); return; }
          busy = true;
          setState((prev) => ({ ...prev, refreshing: true }));
          try {
            const payload = await fetchStatus();
            if (!alive.current) return;
            delay = REFRESH_MS;
            lastAt = Date.now();
            setState({ data: payload, error: null, loading: false, refreshing: false, fetchedAt: lastAt });
            schedule(delay);
            busy = false;
          } catch (failure) {
            if (!alive.current) return;
            delay = Math.min(Math.max(REFRESH_MS, delay * 2), BACKOFF_MAX_MS);
            setState((prev) => ({
              ...prev,
              error: {
                kind: (failure && failure.kind) || 'unknown',
                detail: maskSecrets(String((failure && failure.message) || failure)),
              },
              loading: false,
              refreshing: false,
            }));
            schedule(delay);
            busy = false;
          }
        };

        loadRef.current = () => {
          clearTimeout(timer);
          return run(true);
        };
        run(false);

        const onVisible = () => {
          if (document.visibilityState !== 'visible') return;
          if (Date.now() - lastAt > REFRESH_MIN_MS) run(true);
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
          alive.current = false;
          clearTimeout(timer);
          document.removeEventListener('visibilitychange', onVisible);
        };
      }, [nonce]);

      return {
        ...state,
        refresh: () => { if (loadRef.current) loadRef.current(); },
        retry: () => setNonce((n) => n + 1),
      };
    }

    // ── Kit primitives (built on tokens; DSH has no Card/List/EmptyState) ───
    function Dot({ tone: dotTone }) {
      return h('span', { className: 'ds-dot ds-dot--' + dotTone, 'aria-hidden': 'true' });
    }

    function Chip({ tone: chipTone, children }) {
      return h('span', { className: 'ds-chip ds-chip--' + chipTone }, children);
    }

    function Row({ label, value, mono }) {
      return h('div', { className: 'ds-row' },
        h('span', { className: 'ds-row__label' }, label),
        h('span', { className: 'ds-row__value' + (mono ? ' ds-mono' : '') }, value));
    }

    function Section({ title, meta, sentence, children, id }) {
      return h('section', { className: 'ds-section', 'aria-labelledby': id },
        h('div', { className: 'ds-section__head' },
          h('h2', { className: 'ds-section__title', id }, title),
          meta ? h('span', { className: 'ds-section__meta' }, meta) : null),
        sentence ? h('p', { className: 'ds-section__sentence' }, sentence) : null,
        children);
    }

    function EmptySection({ title, meta, text }) {
      return h('section', { className: 'ds-section' },
        h('div', { className: 'ds-section__head' }, h('h2', { className: 'ds-section__title' }, title),
          meta ? h('span', { className: 'ds-section__meta' }, meta) : null),
        h('p', { className: 'ds-section__empty' }, text));
    }

    function Vitals({ cells }) {
      return h('div', { className: 'ds-vitals' },
        cells.map((cell, index) => h('div', { className: 'ds-vital', key: index },
          h('div', { className: 'ds-eyebrow' }, cell.label),
          h('div', { className: 'ds-vital__value' },
            cell.dot ? h(Dot, { tone: cell.dot }) : null,
            cell.value,
            cell.unit ? h('span', { className: 'ds-vital__unit' }, cell.unit) : null),
          cell.sub ? h('div', { className: 'ds-vital__sub' }, cell.sub) : null)));
    }

    function Sparkline({ points }) {
      const values = (points || []).map((point) => (typeof point === 'number' ? point : Number(point && point.value)));
      const clean = values.filter((value) => isFinite(value));
      if (clean.length < 3) return null;
      const max = Math.max.apply(null, clean);
      const min = Math.min.apply(null, clean);
      const span = max - min || 1;
      const width = 120;
      const height = 22;
      const coords = clean.map((value, index) => {
        const x = (index / (clean.length - 1)) * width;
        const y = height - 2 - ((value - min) / span) * (height - 4);
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
      return h('svg', {
        className: 'ds-spark', width, height, viewBox: '0 0 ' + width + ' ' + height,
        'aria-hidden': 'true', focusable: 'false',
      }, h('polyline', { points: coords, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' }));
    }

    function SourceStrip({ sources, generatedAt, t, stale }) {
      const list = Array.isArray(sources) ? sources : [];
      const okCount = list.filter((source) => source && source.ok).length;
      const failed = list.length - okCount;
      const generated = clock(generatedAt);
      return h('footer', { className: 'ds-sources' },
        h('span', { className: 'ds-sources__ok' },
          h(Dot, { tone: failed ? 'warn' : 'ok' }),
          fill(t('sources'), { ok: okCount, total: list.length })),
        failed ? h('span', { className: 'ds-sources__fail' }, fill(t('sourceFailed'), { n: failed })) : null,
        generated ? h('span', { className: 'ds-sources__time' }, fill(t('generated'), { time: generated })) : null,
        stale ? h('span', { className: 'ds-sources__stale' }, t('stale')) : null,
        h('span', { className: 'ds-sources__grow' }),
        h('span', { className: 'ds-mono ds-sources__path' }, '/api/dsh-status/status'),
        h('span', { className: 'ds-sources__ro' }, t('readOnly')));
    }

    // ── Page ────────────────────────────────────────────────────────────────
    function PanelPage({ t }) {
      const { data, error, loading, refreshing, fetchedAt, refresh, retry } = useStatus();

      const now = Date.now();
      const agent = live(data, 'agent');
      const health = (data && data.health) || {};
      const alerts = health.alerts && health.alerts.ok !== false ? health.alerts : null;
      const backup = health.backup && health.backup.ok !== false ? health.backup : null;
      const egress = health.egress && health.egress.ok !== false ? health.egress : null;
      const cost = health.cost && health.cost.ok !== false ? health.cost : null;
      const jobs = Array.isArray(health.jobs) ? health.jobs : (health.jobs && health.jobs.ok !== false ? health.jobs : null);
      const curator = health.curator && health.curator.ok !== false ? health.curator : null;
      const memory = live(data, 'memory');
      const retention = live(data, 'retention');
      const identity = live(data, 'identity');
      const stats = (memory && memory.stats) || {};

      const healthTone = data ? tone(health.level) : 'idle';
      const warnings = alerts && typeof alerts.warnings === 'number' ? alerts.warnings : null;
      const errorCount = alerts && typeof alerts.errors === 'number' ? alerts.errors : null;
      const checkCount = alerts && Array.isArray(alerts.checks) ? alerts.checks.length : null;
      const lastCheck = alerts && alerts.asOf ? clock(alerts.asOf) : null;
      const since = agent && agent.since ? clock(agent.since) : null;
      const up = agent ? duration(agent.uptimeSeconds) : null;
      const backupAge = backup ? ago(backup.finishedAt, now) : null;
      const backupLimit = backup && typeof backup.limitHours === 'number' ? backup.limitHours : 48;
      const memoryAge = stats.lastWriteAt ? ago(stats.lastWriteAt, now) : null;
      const memoryCount = typeof stats.nodes === 'number' ? stats.nodes : (curator && curator.nodes);

      const stale = Boolean(data && data.stale === true);

      const lede = (() => {
        if (!data) return t('ledeUnknown');
        if (!agent) return t('ledeUnknown');
        if (agent.active === false) return t('ledeDown');
        if (!since) return t('ledeUnknown');
        if (warnings && warnings > 0) return fill(t('ledeOk'), { since, warnings: fill(t('warnings'), { n: warnings }) });
        return fill(t('ledeQuiet'), { since });
      })();

      const alertSentence = (() => {
        if (!alerts) return null;
        if (warnings === 0 && errorCount === 0) {
          return fill(t('attentionClear'), { checks: checkCount || 0, time: lastCheck || '—' });
        }
        return fill(t('attentionSome'), {
          warnings: fill(t('warnings'), { n: warnings || 0 }),
          errors: fill(t('errors'), { n: errorCount || 0 }),
          checks: checkCount || 0,
          time: lastCheck || '—',
        });
      })();

      const memorySentence = (() => {
        if (!memory) return null;
        if (!memoryCount) return t('memoryEmpty');
        return fill(t('memorySentence'), {
          nodes: num(memoryCount),
          documents: num(stats.documents),
          ago: memoryAge || '—',
        });
      })();

      const jobSentence = (() => {
        if (!jobs) return null;
        if (!jobs.length) return t('jobsNone');
        const upcoming = jobs
          .map((job) => parseTime(job.next))
          .filter((at) => at !== null)
          .sort((a, b) => a - b)[0];
        const next = upcoming === undefined ? null : nextIn(upcoming, now);
        return fill(t('jobsSentence'), { next: next || '—', count: jobs.length });
      })();

      const egressSentence = (() => {
        if (!egress) return null;
        if (egress.status === 'degraded') return t('egressUnavailable');
        const n = typeof egress.destinations === 'number' ? egress.destinations : 0;
        const template = n === 1 ? 'egressSentence' : 'egressSentenceMany';
        return fill(t(template), { n, unexpected: num(egress.unexpected || 0) });
      })();

      const costSentence = cost
        ? fill(t('costSentence'), {
            tokens: num(cost.today),
            spike: cost.spike === 'active' ? t('active') : cost.spike === 'inactive' ? t('inactive') : t('unknownLower'),
          })
        : null;

      const identitySentence = identity
        ? (identity.soulPresent === false
            ? t('identityMissing')
            : fill(t('identitySentence'), { size: bytes(identity.soulBytes) || '—', ago: ago(identity.soulModifiedAt, now) || '—' }))
        : null;

      const safetySentence = (() => {
        if (!backup && !retention) return null;
        if (!backup) return t('safetyNoBackup');
        const files = retention
          ? (typeof retention.telemetryFiles === 'number' ? retention.telemetryFiles : 0)
            + (typeof retention.backupDaily === 'number' ? retention.backupDaily : 0)
          : 0;
        return fill(t('safetySentence'), { age: backupAge || '—', limit: backupLimit, files });
      })();

      if (loading && !data) {
        return h('div', { className: 'ds-root' }, h('div', { className: 'ds-page', role: 'main', 'aria-label': t('mainLabel') },
          h('div', { className: 'ds-head' }, h('div', null,
            h('div', { className: 'ds-eyebrow' }, t('eyebrow')),
            h('h1', { className: 'ds-title' }, t('title')))),
          h('div', { className: 'ds-loading', role: 'status', 'aria-live': 'polite' }, t('loading')),
          h('div', { className: 'ds-vitals ds-vitals--skeleton' },
            [0, 1, 2, 3].map((index) => h('div', { className: 'ds-vital', key: index },
              h('div', { className: 'ds-skel ds-skel--label' }), h('div', { className: 'ds-skel ds-skel--value' }))))));
      }

      if (error && !data) {
        const message = error.kind === 'auth' ? t('authExpired')
          : error.kind === 'missing' ? t('notInstalled')
          : fill(t('loadFailed'), { detail: error.detail || t('unknown') });
        return h('div', { className: 'ds-root' }, h('div', { className: 'ds-page', role: 'main', 'aria-label': t('mainLabel') },
          h('h1', { className: 'ds-title' }, t('title')),
          h('div', { className: 'ds-error', role: 'alert' },
            h('p', { className: 'ds-error__text' }, message),
            h('button', { type: 'button', className: 'ds-btn', onClick: retry }, t('retry')))));
      }

      const degradedCount = Array.isArray(data.degraded) ? data.degraded.length : 0;

      const vitals = [
        {
          label: t('agent'),
          value: agent ? (agent.active === false ? t('stopped') : t('running')) : t('unknown'),
          dot: agent ? (agent.active === false ? 'error' : 'ok') : 'idle',
          sub: agent && since ? h('span', null, fill(t('since'), { time: since }), up ? ' · ' + fill(t('uptime'), { duration: up }) : '') : null,
        },
        {
          label: t('alerts'),
          value: warnings === null ? '—' : num(warnings),
          unit: t('warnUnit'),
          dot: warnings === null ? 'idle' : (warnings > 0 ? 'warn' : 'ok'),
          sub: alerts ? fill(t('errors'), { n: num(errorCount || 0) }) + (lastCheck ? ' · ' + lastCheck : '') : null,
        },
        {
          label: t('memory'),
          value: memoryCount === undefined || memoryCount === null ? '—' : num(memoryCount),
          unit: t('nodeUnit'),
          dot: memory ? (memory.reachable === false ? 'warn' : 'ok') : 'idle',
          sub: stats.documents !== undefined
            ? fill(t('docsObs'), { documents: num(stats.documents), observations: num(stats.observations) })
            : null,
        },
        {
          label: t('backup'),
          value: backupAge || '—',
          unit: backupAge ? t('unitAgo') : '',
          dot: backup ? (typeof backup.ageHours === 'number' && backup.ageHours > backupLimit ? 'warn' : 'ok') : 'idle',
          sub: backup
            ? fill(t('backupLimit'), { limit: backupLimit })
            : t('unknownLower'),
        },
      ];

      return h('div', { className: 'ds-root' },
        h('div', { className: 'ds-page', role: 'main', 'aria-label': t('mainLabel') },
          h('header', { className: 'ds-head' },
            h('div', { className: 'ds-head__text' },
              h('div', { className: 'ds-eyebrow' }, agent && agent.unit ? fill(t('eyebrowUnit'), { unit: maskSecrets(String(agent.unit)) }) : t('eyebrow')),
              h('h1', { className: 'ds-title' }, t('title')),
              h('p', { className: 'ds-lede' }, lede)),
            h('div', { className: 'ds-actions' },
              data ? h(Chip, { tone: healthTone },
                h(Dot, { tone: healthTone }),
                health.level === 'ok' ? t('steady')
                  : health.level === 'warn' ? (warnings ? fill(t('warnings'), { n: warnings }) : t('attention'))
                  : health.level === 'alert' ? (errorCount ? fill(t('errors'), { n: errorCount }) : t('attention'))
                  : fill(t('partial'), { n: degradedCount })) : null,
              data ? h('span', { className: 'ds-fresh', role: 'status', 'aria-live': 'polite' },
                fill(t('updated'), { age: ago((data && data.generatedAt) || fetchedAt || Date.now(), Date.now()) || 'now' }),
                stale ? h('span', { className: 'ds-fresh__stale' }, ' · ' + t('stale')) : null) : null,
              h('button', {
                type: 'button', className: 'ds-btn', onClick: refresh,
                disabled: refreshing, 'aria-busy': refreshing ? 'true' : 'false',
              }, refreshing ? t('refreshing') : t('refresh')))),

          h(Vitals, { cells: vitals }),

          h('div', { className: 'ds-grid' },
            h('div', { className: 'ds-col' },
              memory
                ? h(Section, {
                    id: 'ds-memory', title: t('memory'),
                    meta: fill(t('bankMeta'), { bank: maskSecrets(String(memory.bank || 'dsh-personal')), health: memory.health === 'healthy' || memory.reachable ? t('healthy') : t('unavailable') }),
                    sentence: memorySentence,
                  },
                  h(Row, { key: 'docs', label: t('documents'), value: num(stats.documents) }),
                  h(Row, { key: 'obs', label: t('observations'), value: num(stats.observations) }),
                  h(Row, { key: 'nodes', label: t('nodesLabel'), value: num(stats.nodes) }),
                  h(Row, { key: 'links', label: t('links'), value: num(stats.links) }),
                  h(Row, { key: 'write', label: t('lastWrite'), value: memoryAge ? fill(t('agoLabel'), { ago: memoryAge }) : '—' }),
                  h(Row, {
                    key: 'consolidation',
                    label: t('consolidation'),
                    value: typeof stats.pendingOperations === 'number' ? fill(t('pending'), { n: stats.pendingOperations }) : '—',
                  }),
                  h(Row, {
                    key: 'curator',
                    label: t('curator'),
                    value: curator
                      ? (clock(curator.generatedAt) || '—') + (curator.reportDate ? ' · ' + maskSecrets(String(curator.reportDate)) : '')
                      : '—',
                  }))
                : h(EmptySection, { title: t('memory'), text: t('unavailable') }),

              jobs
                ? h(Section, { id: 'ds-jobs', title: t('scheduledJobs'), meta: t('userScope') + ' + ' + t('systemScope'), sentence: jobSentence },
                    jobs.slice(0, 8).map((job, index) => h(Row, {
                      key: (job.unit || 'job') + index,
                      label: h('span', { className: 'ds-mono' }, maskSecrets(String(job.unit || '—'))),
                      value: (nextIn(job.next, now) || '—') + (job.scope && job.scope !== 'user' ? ' ' + t(job.scope === 'system' ? 'systemScope' : 'userScope') : ''),
                    })))
                : h(EmptySection, { title: t('scheduledJobs'), text: t('unavailable') }),

              (backup || retention || identity)
                ? h(Section, { id: 'ds-safety', title: t('safety'), meta: backup && backup.kind ? maskSecrets(String(backup.kind)) : null, sentence: safetySentence },
                    h(Row, {
                      key: 'backup',
                      label: t('dailyBackup'),
                      value: backup
                        ? (backupAge ? fill(t('agoLabel'), { ago: backupAge }) : '—') + ' · ' + (backup.hindsight === 'exported' ? t('verified') : maskSecrets(String(backup.hindsight || t('unknownLower'))))
                        : '—',
                    }),
                    h(Row, { key: 'retained', label: t('retainedFiles'), value: retention ? num((retention.telemetryFiles || 0) + (retention.backupDaily || 0)) : '—' }),
                    h(Row, { key: 'sessions', label: t('sessionsFiles'), value: retention ? num(retention.sessionsFiles) : '—' }),
                    identity
                      ? h(Row, {
                          key: 'soul',
                          label: t('soul'),
                          value: identity.soulPresent
                            ? (bytes(identity.soulBytes) || '—') + ' · ' + (fill(t('agoLabel'), { ago: ago(identity.soulModifiedAt, now) || '—' }))
                            : t('none'),
                        })
                      : null)
                : null)
            ,
            h('div', { className: 'ds-col' },
              alerts
                ? h(Section, {
                    id: 'ds-alerts', title: t('needsAttention'), meta: '24h',
                    sentence: alertSentence,
                  },
                  (Array.isArray(alerts.checks) ? alerts.checks : [])
                    .filter((check) => check && ['warn', 'error', 'alert'].includes(check.status))
                    .slice(0, 6)
                    .map((check, index) => h('div', { className: 'ds-alert', key: (check.id || 'check') + index },
                      h(Dot, { tone: check.status === 'error' || check.status === 'alert' ? 'error' : 'warn' }),
                      h('div', { className: 'ds-alert__body' },
                        h('div', { className: 'ds-alert__title' }, maskSecrets(String(check.title || check.id || '—'))),
                        h('div', { className: 'ds-alert__detail' },
                          checkSentence(check, t) || t('alertFallback'),
                          check.id ? h('span', { className: 'ds-alert__id' }, ' · ' + maskSecrets(String(check.id))) : null)))),
                  h(Row, { key: 'checks', label: t('checksRun'), value: num(checkCount || 0) + ' · ' + num(errorCount || 0) + ' ' + t('errors').replace('{n}', '').trim() }))
                : h(EmptySection, { title: t('needsAttention'), text: t('unavailable') }),

              egress
                ? h(Section, {
                    id: 'ds-egress', title: t('egress'), meta: egress.window ? maskSecrets(String(egress.window)) : '24h',
                    sentence: egressSentence,
                  },
                  h(Row, { key: 'dest', label: t('destinations'), value: num(egress.destinations) }),
                  h(Row, { key: 'unexpected', label: t('unexpected'), value: num(egress.unexpected) }),
                  (Array.isArray(egress.top) ? egress.top : []).slice(0, 3).map((destination, index) => h(Row, {
                    key: 'egress-' + index,
                    label: h('span', { className: 'ds-mono' }, maskSecrets(String(destination.host || '—'))),
                    value: fill(t('events'), { n: num(destination.events) }),
                  })))
                : h(EmptySection, { title: t('egress'), text: t('unavailable') }),

              cost
                ? h(Section, { id: 'ds-cost', title: t('cost'), meta: cost.date ? maskSecrets(String(cost.date)) : null, sentence: costSentence },
                    h('div', { className: 'ds-cost' },
                      h('div', { className: 'ds-cost__today' },
                        h('span', { className: 'ds-cost__num ds-mono' }, num(cost.today)),
                        h('span', { className: 'ds-cost__unit' }, 'tokens')),
                      h(Sparkline, { points: cost.history })),
                    h(Row, { key: 'memo7d', label: t('sevenDayMemo'), value: num(curator && curator.llmUsage7d ? curator.llmUsage7d.tokens : (memory && memory.llmUsage7d ? memory.llmUsage7d.tokens : null)) }),
                    h(Row, { key: 'spike', label: t('spike'), value: cost.spike === 'active' ? t('active') : cost.spike === 'inactive' ? t('inactive') : t('unknownLower') }))
                : h(EmptySection, { title: t('cost'), text: t('unavailable') }),

              identity
                ? h(Section, { id: 'ds-identity', title: t('identity'), meta: null, sentence: identitySentence },
                    h(Row, { key: 'soul', label: t('soul'), value: identity.soulPresent ? bytes(identity.soulBytes) || '—' : t('none') }),
                    h(Row, { key: 'address', label: t('address'), value: agent && agent.listener ? h('span', { className: 'ds-mono' }, maskSecrets(String(agent.listener))) : '—' }),
                    h(Row, { key: 'version', label: t('version'), value: agent && agent.version ? h('span', { className: 'ds-mono' }, maskSecrets(String(agent.version))) : '—' }),
                    h(Row, {
                      key: 'plugins',
                      label: t('pendingPlugins'),
                      value: agent && agent.bundles && typeof agent.bundles.selected === 'number'
                        ? fill(t('pluginsMeta'), { selected: num(agent.bundles.selected), installed: num(agent.bundles.installed) })
                        : '—',
                    }))
                : null)
          ),

          (error || degradedCount)
            ? h('div', { className: 'ds-warnline', role: 'status', 'aria-live': 'polite' },
                error ? fill(t('loadFailed'), { detail: error.detail || t('unknown') }) : fill(t('partial'), { n: degradedCount }))
            : null,

          h(SourceStrip, { sources: data.sources, generatedAt: data.generatedAt, t, stale })));
    }

    // ── Sidebar glyph (the row itself is rendered by the sidebar) ───────────
    function PanelIcon({ size, active }) {
      const px = typeof size === 'number' && size > 0 ? size : 16;
      return h('svg', {
        width: px, height: px, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true', focusable: 'false', opacity: active ? 1 : 0.9,
      }, h('path', { d: 'M2 8h2.2l1.3-3.2L7.8 12l1.4-5 1 2H14' }));
    }

    // ── Styles: tokens only; classes for the states inline styles cannot do ──
    const CSS = `
.ds-root { min-height: 100%; background: var(--dsw-alias-bg-base, transparent); color: var(--dsw-alias-label-primary, inherit); font-family: var(--dsw-font-family, inherit); font-size: 14px; line-height: 22px; }
.ds-page { max-width: 1180px; margin: 0 auto; padding: 28px 32px 40px; }
.ds-eyebrow { font-size: 11px; line-height: 14px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.ds-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
.ds-head__text { min-width: 0; }
.ds-title { margin: 6px 0 0; font-size: 24px; line-height: 32px; font-weight: 600; letter-spacing: -.01em; color: var(--dsw-alias-label-primary, inherit); }
.ds-lede { margin: 8px 0 0; max-width: 660px; font-size: 15px; line-height: 24px; color: var(--dsw-alias-label-secondary); }
.ds-actions { display: flex; align-items: center; gap: 14px; padding-bottom: 3px; flex-wrap: wrap; }
.ds-btn { height: 32px; padding: 0 12px; border-radius: var(--dsw-radius-md, 12px); border: .5px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary, inherit); font-family: inherit; font-size: 13px; line-height: 20px; font-weight: 500; cursor: pointer; }
.ds-btn:hover { background: var(--dsw-alias-interactive-bg-hover-solid); }
.ds-btn:disabled { opacity: .6; cursor: default; }
.ds-chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px; border-radius: var(--dsw-radius-sm, 8px); font-size: 12px; line-height: 18px; font-weight: 500; }
.ds-chip--ok { background: var(--dsw-alias-state-success-tertiary); color: var(--dsw-alias-label-primary); }
.ds-chip--warn { background: var(--dsw-alias-state-warn-tertiary); color: var(--dsw-alias-label-primary); }
.ds-chip--error { background: var(--dsw-alias-state-error-tertiary); color: var(--dsw-alias-label-primary); }
.ds-chip--idle { border: .5px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); }
.ds-fresh { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.ds-fresh__stale { color: var(--dsw-alias-label-secondary); font-weight: 500; }
.ds-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }
.ds-dot--ok { background: var(--dsw-alias-state-success-primary); }
.ds-dot--warn { background: var(--dsw-alias-state-warn-primary); }
.ds-dot--error { background: var(--dsw-alias-state-error-primary); }
.ds-dot--idle { background: var(--dsw-alias-state-idle-primary); }
.ds-vitals { display: grid; grid-template-columns: repeat(4, 1fr); border: .5px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg, 16px); overflow: hidden; margin-bottom: 26px; }
.ds-vital { padding: 13px 16px 12px; border-left: .5px solid var(--dsw-alias-border-l2); min-width: 0; }
.ds-vital:first-child { border-left: 0; }
.ds-vital__value { display: flex; align-items: baseline; gap: 8px; margin-top: 7px; font-size: 20px; line-height: 28px; font-weight: 600; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
.ds-vital__unit { font-size: 12px; line-height: 18px; font-weight: 400; color: var(--dsw-alias-label-secondary); }
.ds-vital__sub { margin-top: 2px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.ds-grid { display: grid; grid-template-columns: 1.35fr 1fr; gap: 34px; }
.ds-col { min-width: 0; }
.ds-section { padding-top: 14px; border-top: .5px solid var(--dsw-alias-border-l2); margin-bottom: 26px; }
.ds-section__head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.ds-section__title { margin: 0 0 4px; font-size: 12px; line-height: 18px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.ds-section__meta { font-family: var(--ds-font-family-code, "SF Mono", Consolas, monospace); font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); text-align: right; }
.ds-section__sentence { margin: 0 0 10px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.ds-section__empty { margin: 4px 0 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.ds-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: .5px solid var(--dsw-alias-border-l1); font-size: 13px; line-height: 20px; }
.ds-row:last-child { border-bottom: 0; }
.ds-row__label { color: var(--dsw-alias-label-secondary); min-width: 0; overflow-wrap: anywhere; }
.ds-row__value { color: var(--dsw-alias-label-primary, inherit); text-align: right; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.ds-mono { font-family: var(--ds-font-family-code, "SF Mono", "JetBrains Mono", Consolas, monospace); font-size: 12px; }
.ds-alert { display: flex; gap: 9px; padding: 9px 0; border-bottom: .5px solid var(--dsw-alias-border-l1); }
.ds-alert:last-of-type { border-bottom: 0; }
.ds-alert > .ds-dot { margin-top: 7px; }
.ds-alert__body { min-width: 0; }
.ds-alert__title { font-size: 13px; line-height: 20px; overflow-wrap: anywhere; }
.ds-alert__detail { margin-top: 2px; font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.ds-alert__id { font-family: var(--ds-font-family-code, "SF Mono", Consolas, monospace); }
.ds-cost { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin: 4px 0 6px; }
.ds-cost__today { display: flex; align-items: baseline; gap: 8px; }
.ds-cost__num { font-size: 20px; line-height: 28px; font-weight: 600; font-variant-numeric: tabular-nums; }
.ds-cost__unit { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.ds-spark { color: var(--dsw-alias-state-business-primary); flex: 0 0 auto; }
.ds-sources { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 16px; border-top: .5px solid var(--dsw-alias-border-l2); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.ds-sources__ok { display: inline-flex; align-items: center; gap: 6px; }
.ds-sources__fail { color: var(--dsw-alias-label-secondary); }
.ds-sources__grow { flex: 1; }
.ds-sources__path, .ds-sources__ro { font-size: 11px; line-height: 14px; }
.ds-warnline { margin: -8px 0 14px; padding: 8px 10px; border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-state-warn-tertiary); color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 18px; }
.ds-loading { margin: 8px 0 18px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.ds-vitals--skeleton { border-style: dashed; }
.ds-skel { border-radius: var(--dsw-radius-xs, 4px); background: var(--dsw-alias-bg-skeleton); }
.ds-skel--label { width: 60px; height: 10px; }
.ds-skel--value { width: 96px; height: 20px; margin-top: 10px; }
.ds-error { margin-top: 24px; padding: 20px; border-radius: var(--dsw-radius-xl, 20px); border: .5px solid var(--dsw-alias-settings-card-stroke); background: var(--dsw-alias-settings-card-fill); }
.ds-error__text { margin: 0 0 14px; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-secondary); }
@media (max-width: 1199px) { .ds-page { padding-left: 24px; padding-right: 24px; } .ds-grid { gap: 24px; } }
@media (max-width: 959px) { .ds-grid { grid-template-columns: 1fr; gap: 0; } }
@media (max-width: 767px) {
  .ds-page { padding: 18px 16px 32px; }
  .ds-head { flex-direction: column; align-items: flex-start; gap: 12px; }
  .ds-actions { padding-bottom: 0; }
  .ds-title { font-size: 22px; line-height: 30px; }
  .ds-vitals { grid-template-columns: 1fr 1fr; }
  .ds-vital:nth-child(3) { border-left: 0; }
  .ds-vital:nth-child(n+3) { border-top: .5px solid var(--dsw-alias-border-l2); }
  .ds-row { flex-wrap: wrap; gap: 2px; }
  .ds-row__value { text-align: left; }
  .ds-sources__path { display: none; }
}
@media (pointer: coarse) {
  .ds-btn { height: 44px; padding: 0 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .ds-btn, .ds-row, .ds-chip { transition: none !important; }
}
`;

    // ── Plugin ──────────────────────────────────────────────────────────────
    function apply(ctx) {
      const disposers = [];
      const unregister = ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-status: dictionaries');
      disposers.push(unregister);
      const t = ctx.locale.bind(NS);

      const style = document.createElement('style');
      style.setAttribute('data-plugin', NS);
      style.textContent = CSS;
      document.head.appendChild(style);
      disposers.push(() => style.remove());

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          { name: 'sidebar.panellist', id: PANEL_ID, order: 4, locale: NS, label: () => t('panel') },
          PanelIcon,
        ),
      );

      ctx.slots.inject('main', () =>
        ctx.slots.register(
          { name: 'main', key: PANEL_ID, locale: NS, inject: () => ({ t }) },
          PanelPage,
        ),
      );

      return () => {
        for (const dispose of disposers) {
          try { dispose(); } catch { /* already disposed */ }
        }
      };
    }

    return {
      name: 'dsh-status',
      inject: ['slots', 'locale'],
      apply,
    };
  },
});
