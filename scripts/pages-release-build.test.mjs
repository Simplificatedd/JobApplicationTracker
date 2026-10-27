import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { preparePagesRelease, verifyPreparedRelease } from './prepare-pages-release.mjs';
import { CONTROL_STATUS_SQL, controlTransition } from '../functions/lib/requestControl.ts';

const repository = fileURLToPath(new URL('../', import.meta.url));
const sourceSha = 'a'.repeat(40);

test('actual Pages-built releases carry distinct immutable identities across retries and retain admission/routing', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'tracker-release-test-'));
  let mf;
  try {
    for (const name of ['node_modules', 'functions', 'src']) symlinkSync(join(repository, name), join(temporary, name), 'dir');
    const releases = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      const output = join(temporary, `dist-${attempt}`);
      mkdirSync(output); writeFileSync(join(output, 'index.html'), 'synthetic asset');
      const runAttempt = attempt === 3 ? '2' : '1'; // Also rebuild within the same attempt.
      const release = preparePagesRelease({ root: temporary, output, sha: sourceSha, runId: '123', runAttempt });
      const identity = { output, sha: sourceSha, runId: '123', runAttempt };
      assert.equal(verifyPreparedRelease(release, identity), release);
      for (const override of [{ sha: 'b'.repeat(40) }, { runId: '124' }, { runAttempt: '9' }]) {
        assert.throws(() => verifyPreparedRelease(release, { ...identity, ...override }), /does not match/);
      }
      // A different asset build can otherwise retain the same release metadata.
      writeFileSync(join(output, 'index.html'), 'different asset');
      assert.throws(() => verifyPreparedRelease(release, identity), /contents changed/);
      writeFileSync(join(output, 'index.html'), 'synthetic asset');
      const entry = join(output, '_worker.js/index.js'), saved = readFileSync(entry);
      writeFileSync(entry, 'export default { fetch() { return new Response("unwrapped"); } };');
      assert.throws(() => verifyPreparedRelease(release, identity), /contents changed/);
      writeFileSync(entry, saved);
      symlinkSync(join(output, 'index.html'), join(output, 'unexpected-link'));
      assert.throws(() => verifyPreparedRelease(release, identity), /symbolic links/);
      rmSync(join(output, 'unexpected-link'));
      assert.equal(verifyPreparedRelease(release, identity), release);
      assert.match(release.label, /^[A-Za-z0-9._-]{1,80}$/);
      assert.throws(() => preparePagesRelease({ root: temporary, output, sha: sourceSha, runId: '123', runAttempt }), /never upload or reuse/);
      const routes = JSON.parse(readFileSync(join(output, '_routes.json'), 'utf8'));
      assert.ok(routes.include.includes('/api/*'));
      assert.ok(!routes.include.includes('/*'));
      releases.push({ ...release, scriptPath: join(output, '_worker.js/index.js') });
    }
    assert.equal(new Set(releases.map(r => r.label)).size, 3);
    const workers = releases.slice(0, 2).map((release, i) => ({ name: `release-${i}`, modulesRoot: join(release.scriptPath, '..'),
      modules: ['index.js', 'functions.js'].map(name => ({ type: 'ESModule', path: join(release.scriptPath, '..', name) })),
      compatibilityDate: '2026-09-22', bindings: { LOCAL_DEV_AUTH_EMAIL: 'synthetic@example.invalid', REQUEST_CONTROL_DEPLOYMENT: 'stale-dashboard-label' },
      d1Databases: { DB: 'local-only-app', REQUEST_CONTROL_DB: 'local-only-control' }, r2Buckets: ['RESUME_FILES'],
      serviceBindings: { ASSETS: async () => new Response('synthetic asset') } }));
    mf = new Miniflare(convertV4MiniflareOptions({ port: 0, workers }));
    const control = await mf.getD1Database('REQUEST_CONTROL_DB', 'release-0');
    // Native SQLite executes the exact control schema; no application 0003.
    await control.exec(readFileSync(join(repository, 'control-migrations/0001_request_control.sql'), 'utf8').replace(/--[^\n]*/g, '').replace(/\n/g, ' '));
    const state = () => control.prepare(CONTROL_STATUS_SQL).first();
    const transition = async (action, value) => {
      const before = await state();
      assert.ok(await control.prepare(controlTransition(action, before.revision, value)).first());
    };
    const a = await mf.getWorker('release-0'), b = await mf.getWorker('release-1');
    let response = await a.fetch('http://localhost/api/session');
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('X-Tracker-Deployment'), releases[0].label);
    assert.equal((await state()).coverage_hash, null);
    await transition('attest-coverage', 'f'.repeat(64));
    await transition('select-deployment', releases[0].label); await transition('reopen');
    assert.equal((await a.fetch('http://127.0.0.1/api/session')).status, 200);
    assert.equal((await b.fetch('http://localhost/api/session')).status, 503);
    assert.equal((await a.fetch('http://localhost/api/unknown')).status, 404);
    assert.equal(await (await a.fetch('http://localhost/')).text(), 'synthetic asset');
    await transition('close'); await transition('select-deployment', releases[1].label); await transition('reopen');
    assert.equal((await a.fetch('http://localhost/api/session')).status, 503);
    assert.equal((await b.fetch('http://127.0.0.1/api/session')).status, 200);
    assert.equal((await state()).outstanding, 0);
  } finally {
    if (mf) await mf.dispose();
    rmSync(temporary, { recursive: true, force: true });
  }
});
