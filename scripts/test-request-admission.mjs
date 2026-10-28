import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'vite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIT_REQUEST_SQL, CONTROL_STATUS_SQL, controlTransition, describeControlStatus } from '../functions/lib/requestControl.ts';

// Explicit in-memory resources only; never loads Wrangler/production config.
const temporary = mkdtempSync(join(tmpdir(), 'tracker-admission-local-'));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function assert(value, message) { if (!value) throw new Error(message); }
let entered = deferred(), held = deferred(), reported = deferred(), mf;
try {
  await build({ configFile: false, envDir: false, logLevel: 'silent', build: {
    lib: { entry: fileURLToPath(new URL('../src/test/requestAdmissionWorker.ts', import.meta.url)), formats: ['es'], fileName: () => 'worker.mjs' },
    target: 'es2022', outDir: temporary, emptyOutDir: false, minify: false,
  } });
  const script = readFileSync(join(temporary, 'worker.mjs'), 'utf8');
  const worker = deployment => ({ name: deployment, modules: true, script, compatibilityDate: '2026-09-22',
    bindings: { REQUEST_CONTROL_DEPLOYMENT: deployment, LOCAL_DEV_AUTH_EMAIL: 'student@example.edu' },
    d1Databases: { DB: 'local-only-app', REQUEST_CONTROL_DB: 'local-only-control' }, r2Buckets: ['RESUME_FILES'],
    serviceBindings: {
      HOLD: async () => { entered.resolve(); await held.promise; return new Response('released'); },
      REPORT: async request => { reported.resolve({ path: new URL(request.url).pathname, body: await request.text() }); return new Response('logged'); },
    },
  });
  // Independent releases share native control/application D1 and R2 resources.
  mf = new Miniflare(convertV4MiniflareOptions({ port: 0, workers: [worker('release-a'), worker('release-b')] }));
  const control = await mf.getD1Database('REQUEST_CONTROL_DB', 'release-a'), app = await mf.getD1Database('DB', 'release-a');
  const bucket = await mf.getR2Bucket('RESUME_FILES', 'release-a');
  // Preserve complete trigger bodies; D1 prepare executes one statement.
  const schema = readFileSync(new URL('../control-migrations/0001_request_control.sql', import.meta.url), 'utf8');
  const triggers = [...schema.matchAll(/CREATE TRIGGER[\s\S]*?\nEND;/g)].map(match => match[0]);
  const tables = schema.replace(/CREATE TRIGGER[\s\S]*?\nEND;/g, '');
  for (const sql of tables.split(';').filter(s => s.trim())) await control.prepare(sql).run();
  for (const sql of triggers) await control.prepare(sql).run();
  // Only application 0001/0002: the prerequisite must not require #166's 0003.
  for (const name of ['0001_authenticated_cloud_storage.sql', '0002_free_tier_usage_budgets.sql']) {
    for (const sql of readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8').split(';').filter(s => s.trim())) await app.prepare(sql).run();
  }
  await app.prepare('CREATE TABLE test_effects(value TEXT)').run();
  const status = async () => describeControlStatus(await control.prepare(CONTROL_STATUS_SQL).first());
  const transition = async (action, value) => {
    const before = await status();
    assert(await control.prepare(controlTransition(action, before.revision, value)).first(), `Transition ${action} refused`);
  };
  const request = (path, init) => mf.dispatchFetch(`http://localhost${path}`, init);
  const releaseB = await mf.getWorker('release-b');
  assert((await request('/normal')).status === 503 && !(await status()).drained, 'Fresh bootstrap falsely admitted/drained');
  await transition('attest-coverage', 'a'.repeat(64)); await transition('select-deployment', 'release-a'); await transition('reopen');
  // Exercise the actual main API with no lifecycle columns or migration 0003.
  const headers = { 'X-Tracker-Account-Id': 'local:student@example.edu', 'X-Tracker-Mutation-Protocol': '1', Origin: 'http://localhost' };
  assert((await request('/api/session')).status === 200, 'Main session failed');
  assert((await request('/api/resume-files/synthetic', { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/pdf' }, body: '%PDF-main' })).status === 200, 'Main upload failed');
  const downloaded = await request('/api/resume-files/synthetic', { headers });
  assert(downloaded.status === 200 && await downloaded.text() === '%PDF-main', 'Main download failed');
  const snapshot = { activities: [], applications: [], contacts: [], coverLetters: [], interviews: [], assessments: [], resumes: [],
    analyticsSettings: {}, notificationState: {}, settings: {}, tablePreferences: null, dataVersion: 3 };
  assert((await request('/api/state', { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRevision: null, snapshot }) })).status === 200, 'Main snapshot save failed');
  assert((await request('/api/state', { headers })).status === 200 && (await status()).outstanding === 0, 'Main snapshot read or receipt retirement failed');
  const normal = await request('/normal'); assert(normal.status === 200 && await normal.text() === '%PDF-local', 'Normal D1/R2 calls failed');
  const slow = request('/slow'); await entered.promise; await transition('close');
  assert(!(await status()).drained && (await request('/normal')).status === 503, 'Pre-close request falsely drained');
  held.resolve(); assert((await slow).status === 200 && (await status()).drained, 'Admitted request did not finish safely');
  await transition('reopen'); entered = deferred(); held = deferred();
  assert((await request('/background')).status === 200, 'Background response failed');
  await entered.promise; await transition('close'); assert(!(await status()).drained, 'Background work falsely drained'); held.resolve();
  for (let i = 0; i < 50 && !(await status()).drained; i++) await new Promise(r => setTimeout(r, 20));
  assert((await status()).drained, 'Background completion failed');
  await transition('reopen'); entered = deferred(); held = deferred(); reported = deferred();
  assert((await request('/late')).status === 200, 'Late callback setup failed'); await entered.promise; await transition('close');
  assert((await status()).drained, 'Sealed detached request not retired'); held.resolve();
  const report = await reported.promise;
  assert(report.path === '/blocked' && report.body.includes('storage access has ended') && await bucket.get('late') === null, 'Late storage dispatch bypassed seal');
  await transition('select-deployment', 'release-b'); await transition('reopen');
  assert((await request('/normal')).status === 503, 'Retired deployment admitted');
  assert(await control.prepare(ADMIT_REQUEST_SQL).bind('old-delayed', 'release-a', 0, 'release-a').first() === null, 'Delayed old admission bypassed selection');
  await transition('close');
  const retired = await status();
  assert(await control.prepare(controlTransition('select-deployment', retired.revision, 'release-a')).first() === null, 'Retired release was selectable again');
  await transition('reopen');
  // Damage/repair only these disposable stores. Exercise the actual upload API,
  // not a mocked handler, and verify refusal before application metadata/R2 writes.
  const definition = async name => (await control.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').bind(name).first()).sql;
  const historyDDL = await definition('request_deployments');
  const receiptDDL = await definition('request_receipts');
  const indexDDL = await definition('request_receipts_started_idx');
  const selectionDDL = await definition('request_deployment_selection_guard');
  const schemaFailures = [
    ['missing-history', async () => { await control.prepare('DROP TABLE request_deployments').run(); }, async () => {
      await control.prepare(historyDDL).run();
      for (const label of ['release-a', 'release-b']) await control.prepare('INSERT INTO request_deployments VALUES (?)').bind(label).run();
    }],
    ['missing-selected-history', async () => { await control.prepare("DELETE FROM request_deployments WHERE deployment = 'release-b'").run(); }, async () => {
      await control.prepare("INSERT INTO request_deployments VALUES ('release-b')").run();
    }],
    ['missing-selection-trigger', async () => { await control.prepare('DROP TRIGGER request_deployment_selection_guard').run(); }, async () => {
      await control.prepare(selectionDDL).run();
    }],
    ['missing-index', async () => { await control.prepare('DROP INDEX request_receipts_started_idx').run(); }, async () => {
      await control.prepare(indexDDL).run();
    }],
    ['missing-receipt-uniqueness', async () => {
      await control.prepare('DROP TABLE request_receipts').run();
      await control.prepare(receiptDDL.replace('id TEXT PRIMARY KEY', 'id TEXT')).run();
      await control.prepare(indexDDL).run();
    }, async () => {
      await control.prepare('DROP TABLE request_receipts').run();
      await control.prepare(receiptDDL).run(); await control.prepare(indexDDL).run();
    }],
    ['receipt-erasing-trigger', async () => {
      await control.prepare('CREATE TRIGGER erase_receipt AFTER INSERT ON request_receipts BEGIN DELETE FROM request_receipts WHERE id = NEW.id; END').run();
    }, async () => { await control.prepare('DROP TRIGGER erase_receipt').run(); }],
  ];
  for (const [name, damage, repair] of schemaFailures) {
    const before = await app.prepare('SELECT COUNT(*) AS n FROM resume_objects').first();
    await damage();
    const denied = await releaseB.fetch(`http://localhost/api/resume-files/${name}`, { method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/pdf' }, body: '%PDF-must-not-be-written' });
    assert(denied.status === 503, `${name}: damaged control schema admitted an actual upload`);
    assert((await app.prepare('SELECT COUNT(*) AS n FROM resume_objects').first()).n === before.n &&
      await bucket.get(`local%3Astudent%40example.edu/${name}`) === null, `${name}: application mutation escaped`);
    await control.prepare("UPDATE request_gate SET mode = 'closed', revision = revision + 1").run();
    let unknown = false;
    try { await status(); } catch { unknown = true; }
    assert(unknown, `${name}: incomplete schema produced verified status/drain`);
    await repair();
    assert((await status()).drained, `${name}: synthetic repair did not recover intact status`);
    assert((await releaseB.fetch('http://localhost/api/session')).status === 503, `${name}: repair unexpectedly reopened admission`);
    await transition('reopen');
    assert((await releaseB.fetch('http://localhost/api/session')).status === 200, `${name}: valid schema did not recover`);
  }
  assert((await releaseB.fetch('http://localhost/partial')).status === 200, 'Partial operation setup failed'); await transition('close');
  assert((await status()).uncertain === 1 && !(await status()).drained && await bucket.get('partial') !== null, 'Partial storage failure falsely drained');
  console.log(JSON.stringify({ localOnly: true, applicationMigrations: ['0001', '0002'], normalBindings: true, mainSessionUploadDownloadSnapshot: true, atomicCloseRace: true,
    backgroundTracked: true, lateDispatchBlocked: true, retiredVersionDenied: true, partialFailureRetained: true, retiredLabelReuseDenied: true, damagedSchemaUploadRefused: schemaFailures.length, invalidSchemaDrainUnknown: true, syntheticSchemaRepairPreservesClosure: true }));
} finally {
  held.resolve(); reported.resolve();
  if (mf) await mf.dispose();
  rmSync(temporary, { recursive: true, force: true });
}
