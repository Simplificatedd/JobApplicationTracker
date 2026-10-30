import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = fileURLToPath(new URL('../', import.meta.url));

test('real Pages Functions retain existing records/resumes and reject stale writes with one D1 and one R2', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'tracker-pages-test-'));
  let mf;
  try {
    const assets = join(temporary, 'assets'), output = join(temporary, 'functions');
    mkdirSync(assets); writeFileSync(join(assets, 'index.html'), 'synthetic frontend');
    const build = spawnSync(join(root, 'node_modules/.bin/wrangler'), ['pages', 'functions', 'build', join(root, 'functions'),
      '--outdir', output, '--project-directory', root, '--build-output-directory', assets, '--compatibility-date', '2026-09-22'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
    assert.equal(build.status, 0, build.stderr || build.stdout);
    const worker = { modulesRoot: output, modules: [{ type: 'ESModule', path: join(output, 'index.js') }], compatibilityDate: '2026-09-22',
      serviceBindings: { ASSETS: async () => new Response('synthetic frontend') } };
    const production = { ...worker, bindings: { LOCAL_DEV_AUTH_EMAIL: 'synthetic@example.invalid',
      TEAM_DOMAIN: 'https://synthetic.cloudflareaccess.com', POLICY_AUD: 'synthetic-audience' },
    d1Databases: { DB: 'existing-app' }, r2Buckets: { RESUME_FILES: 'existing-resumes' } };
    mf = new Miniflare(convertV4MiniflareOptions({ port: 0, workers: [
      { ...production, name: 'previous' }, { ...production, name: 'next' }, { ...worker, name: 'unconfigured-preview' },
    ] }));
    const db = await mf.getD1Database('DB', 'previous');
    for (const name of ['0001_authenticated_cloud_storage.sql', '0002_free_tier_usage_budgets.sql']) {
      await db.exec(readFileSync(join(root, 'migrations', name), 'utf8').replace(/\n/g, ' '));
    }
    const owner = 'local:synthetic@example.invalid';
    const snapshot = { dataVersion: 2, applications: [{ id: 'existing-application', company: 'Retained company' }],
      interviews: [], activities: [], contacts: [], coverLetters: [], resumes: [], settings: {},
      notificationState: {}, analyticsSettings: {}, tablePreferences: null };
    await db.prepare('INSERT INTO tracker_state VALUES (?, ?, 7, ?, ?, ?)')
      .bind(owner, 'synthetic@example.invalid', JSON.stringify(snapshot), 'existing-created', 'existing-updated').run();
    const bucket = await mf.getR2Bucket('RESUME_FILES', 'previous');
    const bytes = '%PDF-1.7\nexisting synthetic resume';
    await bucket.put(`${encodeURIComponent(owner)}/existing-file`, bytes);
    await db.prepare('INSERT INTO resume_objects VALUES (?, ?, ?, ?, ?)')
      .bind(owner, 'existing-file', 'application/pdf', bytes.length, 'existing-updated').run();
    const previous = await mf.getWorker('previous'), next = await mf.getWorker('next');
    function request(path, method = 'GET', body) {
      return new Request(`http://localhost/api/${path}`, { method,
        headers: { Origin: 'http://localhost', 'X-Tracker-Account-Id': owner, 'X-Tracker-Mutation-Protocol': '1' },
        ...(body ? { body: JSON.stringify(body) } : {}) });
    }
    for (const version of [previous, next]) {
      assert.equal((await version.fetch(request('session'))).status, 200);
      assert.deepEqual((await (await version.fetch(request('state'))).json()).snapshot, snapshot);
      assert.equal(await (await version.fetch(request('resume-files/existing-file'))).text(), bytes);
    }
    const updated = { ...snapshot, applications: [...snapshot.applications, { id: 'new-application' }] };
    assert.equal((await next.fetch(request('state', 'PUT', { baseRevision: 7, snapshot: updated }))).status, 200);
    assert.equal((await previous.fetch(request('state', 'PUT', { baseRevision: 7, snapshot }))).status, 409);
    assert.deepEqual((await (await next.fetch(request('state'))).json()).snapshot, updated);
    assert.equal(await (await next.fetch(request('resume-files/existing-file'))).text(), bytes);
    assert.equal((await next.fetch('https://production.invalid/api/session')).status, 401);
    assert.equal((await (await mf.getWorker('unconfigured-preview')).fetch('https://preview.invalid/api/state')).status, 500);
    assert.equal(await (await next.fetch('http://localhost/')).text(), 'synthetic frontend');
  } finally {
    if (mf) await mf.dispose();
    rmSync(temporary, { recursive: true, force: true });
  }
});
