// Self-test for the dsh-soul loader — no DSH process, no profile, no network.
//
//   node plugins/dsh-soul/selftest.mjs
//
// Exercises `apply()` against a fake `systemPrompt` registry: missing / empty /
// normal / config precedence / env override / UTF-8 truncation / relative path.
// Exits nonzero on the first failed assertion; leaves nothing behind.
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = path.join(os.tmpdir(), 'dsh-soul-selftest-home');
rmSync(HOME, { recursive: true, force: true });
mkdirSync(path.join(HOME, 'soul'), { recursive: true, mode: 0o700 });
process.env.DSH_HOME = HOME;
delete process.env.DSH_SOUL_FILE;

const { apply, loadSoulFile } = await import('./index.js');

const logs = [];
const origWarn = console.warn;
const origError = console.error;
const pass = (message) => process.stdout.write(`PASS ${message}\n`);
console.warn = (...args) => logs.push(['warn', args.join(' ')]);
console.error = (...args) => logs.push(['error', args.join(' ')]);

/** A fake Cordis context exposing only what the loader uses. */
function fakeCtx() {
  const captured = [];
  return {
    captured,
    ctx: {
      systemPrompt: {
        getSectionOrder: (name) => {
          assert.equal(name, 'DEPLOYMENT_PERSONA_PREFIX');
          return 0;
        },
        section: (section) => {
          captured.push(section);
          return () => {};
        },
      },
      effect: (callback) => callback(),
    },
  };
}

try {
  // 1. Missing default file -> no-op, one warning, no throw.
  {
    const { ctx, captured } = fakeCtx();
    apply(ctx, {});
    assert.equal(captured.length, 0, 'missing file must register no section');
    assert.ok(logs.some(([kind, text]) => kind === 'warn' && text.includes('not found')));
    pass('missing default file -> warning, no section, no throw');
  }

  // 2. Empty file -> no-op plus warning.
  {
    writeFileSync(path.join(HOME, 'soul', 'SOUL.md'), '  \n\t\n', { mode: 0o600 });
    const { ctx, captured } = fakeCtx();
    apply(ctx, {});
    assert.equal(captured.length, 0);
    assert.ok(logs.some(([kind, text]) => kind === 'warn' && text.includes('empty')));
    pass('empty file -> warning, no section');
  }

  // 3. Normal file with brace prose -> literal section at the persona order.
  {
    const persona = 'Your name is Mochi. Keep this literal: {{model}} and {{ cwd }}.\n';
    writeFileSync(path.join(HOME, 'soul', 'SOUL.md'), persona, { mode: 0o600 });
    const { ctx, captured } = fakeCtx();
    apply(ctx, {});
    assert.equal(captured.length, 1);
    const section = captured[0];
    assert.equal(section.name, 'deployment:soul');
    assert.equal(section.order, 0);
    assert.equal(section.interpolate, false, 'SOUL text must never interpolate');
    assert.equal(section.text, persona.trim());
    assert.ok(section.text.includes('{{model}}'), 'braces must survive verbatim');
    assert.ok(logs.some(([kind, text]) => kind === 'error' && text.includes('loaded SOUL persona')));
    pass('normal file -> literal interpolate:false section at order 0');
  }

  // 4. config.file wins over DSH_SOUL_FILE.
  {
    const fromConfig = path.join(HOME, 'config-soul.md');
    writeFileSync(fromConfig, 'From config file.\n', { mode: 0o600 });
    process.env.DSH_SOUL_FILE = path.join(HOME, 'env-soul.md');
    writeFileSync(process.env.DSH_SOUL_FILE, 'From env file.\n', { mode: 0o600 });
    const { ctx, captured } = fakeCtx();
    apply(ctx, { file: fromConfig });
    assert.equal(captured[0].text, 'From config file.');
    pass('config.file precedence over DSH_SOUL_FILE');
  }

  // 5. DSH_SOUL_FILE used when the row config has no file.
  {
    const { ctx, captured } = fakeCtx();
    apply(ctx, {});
    assert.equal(captured[0].text, 'From env file.');
    delete process.env.DSH_SOUL_FILE;
    pass('DSH_SOUL_FILE env override');
  }

  // 6. Truncation honors the cap and cuts on a UTF-8 boundary.
  {
    const heavy = 'é'.repeat(60); // 120 bytes
    writeFileSync(path.join(HOME, 'soul', 'SOUL.md'), heavy);
    const loaded = loadSoulFile(path.join(HOME, 'soul', 'SOUL.md'), 11);
    assert.equal(loaded.truncated, true);
    assert.equal(loaded.originalBytes, 120);
    assert.ok(!loaded.text.includes('\uFFFD'), 'cut must land on a UTF-8 boundary');
    assert.equal(loaded.text, 'é'.repeat(5));
    const { ctx, captured } = fakeCtx();
    apply(ctx, { maxBytes: 11 });
    assert.equal(captured[0].text, 'é'.repeat(5));
    assert.ok(logs.some(([kind, text]) => kind === 'warn' && text.includes('cap')));
    pass('truncation 11 of 120 bytes, UTF-8 boundary safe, warning');
  }

  // 7. A relative override resolves under DSH_HOME and stays a no-op when absent.
  {
    const { ctx, captured } = fakeCtx();
    apply(ctx, { file: 'relative/soul.txt' });
    assert.equal(captured.length, 0);
    pass('relative override resolves under DSH_HOME, absent -> no-op');
  }

  pass('ALL SELFTESTS PASSED');
} finally {
  console.warn = origWarn;
  console.error = origError;
  rmSync(HOME, { recursive: true, force: true });
}
