import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { assertReleaseRequest, assertApprovalEnvironment, assertIndependentApproval, assertProductionProject, assertControlState, assertSingleCreateAttempt,
  assertCheckout, assertDashboardConfiguration, assertControlSchema, CONTROL_SCHEMA_SQL, MIGRATION_STATUS_SQL, RELEASE_STATUS_SQL, preflightRelease } from './production-preflight.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const appId = '11111111-1111-4111-8111-111111111111', controlId = '22222222-2222-4222-8222-222222222222';
const env = { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40),
  RELEASE_SHA: 'a'.repeat(40), RELEASE_CONFIRMATION: `DEPLOY-CLOSED:${'a'.repeat(40)}`,
  EXPECTED_DEPLOYMENT: '33333333-3333-4333-8333-333333333333', CONTROL_REVISION: '0', RELEASE_MODE: 'initial-closed',
  GITHUB_REPOSITORY: 'example/tracker', GITHUB_TOKEN: 'synthetic-github', CLOUDFLARE_API_TOKEN: 'synthetic-cloudflare',
  GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_ACTOR: 'initiator', GITHUB_TRIGGERING_ACTOR: 'rerunner',
  CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32), CLOUDFLARE_PAGES_PROJECT: 'test-tracker',
  PRODUCTION_PROJECT_ID: '44444444-4444-4444-8444-444444444444', PRODUCTION_APP_DATABASE_ID: appId,
  PRODUCTION_CONTROL_DATABASE_ID: controlId, PRODUCTION_R2_BUCKET: 'test-resumes' };
const approval = { id: 1234, protection_rules: [{ type: 'required_reviewers', prevent_self_review: true, reviewers: [{ type: 'User', reviewer: { login: 'reviewer' } }] }] };
const approved = { state: 'approved', comment: `${env.RELEASE_CONFIRMATION}:123:1`, user: { login: 'reviewer' }, environments: [{ id: approval.id }] };
const config = { d1_databases: { DB: { id: appId }, REQUEST_CONTROL_DB: { id: controlId } },
  r2_buckets: { RESUME_FILES: { name: 'test-resumes' } }, env_vars: { TEAM_DOMAIN: { type: 'secret_text' }, POLICY_AUD: { type: 'secret_text' } },
  compatibility_date: '2026-09-22', compatibility_flags: [] };
const project = { id: env.PRODUCTION_PROJECT_ID, production_branch: 'main', source: null, deployment_configs: { production: config },
  canonical_deployment: { id: env.EXPECTED_DEPLOYMENT } };
const fresh = { schema_version: 1, revision: 0, mode: 'closed', deployment: null, coverage_hash: null, outstanding: 0, uncertain: 0, receipt_sample: '[]', selection_count: 0 };
const manifest = { label: 'gh-123-1-55555555-5555-4555-8555-555555555555', sha: env.GITHUB_SHA };

test('ordinary CI cannot deploy; production has only manual dispatch and never cancels an active release', () => {
  const ci = readFileSync(join(repository, '.github/workflows/ci.yml'), 'utf8');
  const release = readFileSync(join(repository, '.github/workflows/production.yml'), 'utf8');
  assert.doesNotMatch(ci, /pages deploy|wrangler-action|CLOUDFLARE_API_TOKEN|environment:/);
  const events = release.match(/^on:\n([\s\S]*?)(?=^\S)/m)?.[1];
  assert.ok(events, 'Explicit event mapping required for security review.');
  assert.deepEqual(events.match(/^ {2}[a-z_]+:/gm), ['  workflow_dispatch:']);
  assert.match(release, /cancel-in-progress: false/);
  assert.doesNotMatch(release, /cancel-in-progress: true/);
});

test('manual exact-SHA approval rejects push, stale SHA, branch and malformed confirmations', () => {
  assert.doesNotThrow(() => assertReleaseRequest(env));
  for (const override of [{ GITHUB_EVENT_NAME: 'push' }, { GITHUB_REF: 'refs/heads/other' }, { RELEASE_SHA: 'c'.repeat(40) },
    { RELEASE_CONFIRMATION: 'yes' }, { EXPECTED_DEPLOYMENT: '' }, { CONTROL_REVISION: '9007199254740992' }, { RELEASE_MODE: 'open' }]) {
    assert.throws(() => assertReleaseRequest({ ...env, ...override }));
  }
});

test('clean checkout identity includes tracked changes and untracked source', () => {
  assert.doesNotThrow(() => assertCheckout(`${env.GITHUB_SHA}\n`, '', env.GITHUB_SHA));
  assert.throws(() => assertCheckout('b'.repeat(40), '', env.GITHUB_SHA), /Checkout/);
  for (const status of [' M functions/api/[[path]].ts\n', '?? functions/api/extra.ts\n']) {
    assert.throws(() => assertCheckout(env.GITHUB_SHA, status, env.GITHUB_SHA), /Checkout/);
  }
});

test('Wrangler redirects and API overrides cannot silently change the production configuration', () => {
  const root = mkdtempSync(join(tmpdir(), 'release-config-test-'));
  try {
    assert.doesNotThrow(() => assertDashboardConfiguration(root, {}));
    mkdirSync(join(root, '.wrangler/deploy'), { recursive: true });
    writeFileSync(join(root, '.wrangler/deploy/config.json'), '{}');
    assert.throws(() => assertDashboardConfiguration(root, {}), /unexpected configuration/);
    rmSync(join(root, '.wrangler/deploy/config.json'));
    assert.throws(() => assertDashboardConfiguration(root, { CLOUDFLARE_API_BASE_URL: 'https://wrong.invalid' }), /unexpected configuration/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an unprotected environment, self approval and production binding drift fail closed', () => {
  assert.doesNotThrow(() => assertApprovalEnvironment(approval));
  for (const value of [{}, { protection_rules: [] }, { protection_rules: [{ type: 'required_reviewers', reviewers: [] }] },
    { protection_rules: [{ type: 'required_reviewers', reviewers: [{}], prevent_self_review: false }] }]) {
    assert.throws(() => assertApprovalEnvironment(value));
  }
  assert.doesNotThrow(() => assertProductionProject(project, env));
  for (const override of [{ PRODUCTION_CONTROL_DATABASE_ID: appId }, { PRODUCTION_CONTROL_DATABASE_ID: 'bad' },
    { PRODUCTION_PROJECT_ID: controlId }, { PRODUCTION_R2_BUCKET: 'wrong' }]) {
    assert.throws(() => assertProductionProject(project, { ...env, ...override }));
  }
  const unsafe = structuredClone(project);
  unsafe.deployment_configs.production.env_vars.LOCAL_DEV_AUTH_EMAIL = { type: 'plain_text', value: 'synthetic@example.invalid' };
  assert.throws(() => assertProductionProject(unsafe, env));
});

test('fresh empty ledger stays unverified; open/stale/uncertain established releases cannot deploy', () => {
  assert.equal(assertControlState(fresh, env).drained, false);
  assert.throws(() => assertControlState(fresh, { ...env, RELEASE_MODE: 'drained' }));
  assert.throws(() => assertControlState({ ...fresh, selection_count: 1 }, env), /genuinely fresh/);
  const drained = { ...fresh, revision: 3, deployment: 'old-release', coverage_hash: 'd'.repeat(64) };
  const established = { ...env, CONTROL_REVISION: '3', RELEASE_MODE: 'drained' };
  assert.equal(assertControlState(drained, established).drained, true);
  assert.throws(() => assertControlState({ ...drained, mode: 'open' }, established));
  assert.throws(() => assertControlState(drained, { ...established, CONTROL_REVISION: '2' }));
  assert.throws(() => assertControlState({ ...drained, outstanding: 1, uncertain: 1,
    receipt_sample: JSON.stringify([{ id: 'uncertain' }]) }, established));
});

test('approval history must independently approve this exact attempt, not bypass or an older rerun', () => {
  assert.doesNotThrow(() => assertIndependentApproval([approved], approval, env));
  for (const history of [[], [{ ...approved, state: 'rejected' }], [{ ...approved, comment: 'Ship it!' }],
    [{ ...approved, user: { login: 'INITIATOR' } }], [{ ...approved, user: { login: 'rerunner' } }],
    [{ ...approved, environments: [{ id: 9999 }] }]]) {
    assert.throws(() => assertIndependentApproval(history, approval, env));
  }
  assert.throws(() => assertIndependentApproval([approved], approval, { ...env, GITHUB_RUN_ATTEMPT: '2' }));
  assert.throws(() => assertIndependentApproval([approved, { ...approved, state: 'rejected', comment: 'Stop release' }], approval, env));
});

function controlSchema(change) {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(readFileSync(join(repository, 'control-migrations/0001_request_control.sql'), 'utf8'));
    if (change) database.exec(change);
    return database.prepare(CONTROL_SCHEMA_SQL).all();
  } finally { database.close(); }
}

function fakeApi({ promoted = false, duplicate = false, lateDuplicate = false, deny = false, stale = false, primary = true, deploymentOverride = {},
  schema = controlSchema(), migrations = [{ name: '0001_request_control.sql' }] } = {}) {
  const calls = [];
  const canonical = { id: '66666666-6666-4666-8666-666666666666', project_id: env.PRODUCTION_PROJECT_ID,
    project_name: env.CLOUDFLARE_PAGES_PROJECT, environment: 'production', production_branch: 'main', uses_functions: true,
    ...config, latest_stage: { status: 'success' },
    deployment_trigger: { metadata: { commit_hash: manifest.sha, commit_message: `Admission release ${manifest.label}` } }, ...deploymentOverride };
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (deny) return new Response('SENSITIVE RESPONSE MUST NOT BE LOGGED', { status: 403 });
    if (url.endsWith('/environments/production')) return Response.json(approval);
    if (url.endsWith('/approvals')) return Response.json([approved]);
    if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: stale ? 'e'.repeat(40) : env.GITHUB_SHA } });
    if (url.includes('/deployments?')) {
      const firstPage = [canonical, ...Array.from({ length: 24 }, () => ({ deployment_trigger: { metadata: { commit_message: 'another release' } } }))];
      return Response.json({ success: true, result: lateDuplicate && url.includes('page=1&') ? firstPage : duplicate ? [canonical, canonical] : [canonical] });
    }
    if (url.endsWith('/query')) {
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { sql: `${CONTROL_SCHEMA_SQL}; ${MIGRATION_STATUS_SQL}; ${RELEASE_STATUS_SQL}` });
      return Response.json({ success: true, result: [schema, migrations, [fresh]].map(results =>
        ({ success: true, results, meta: { rows_written: 0, served_by_primary: primary } })) });
    }
    return Response.json({ success: true, result: { ...project, ...(promoted ? { canonical_deployment: canonical } : {}) } });
  };
  return { calls, fetcher };
}

test('preflight performs metadata GETs and only fixed read-only SELECTs; no transitions or retries', async () => {
  const api = fakeApi();
  const result = await preflightRelease(env, api);
  assert.equal(result.coverageVerified, false);
  assert.equal(result.drained, false);
  assert.equal(api.calls.length, 5);
  assert.equal(api.calls.filter(c => c.options.method === 'POST').length, 1);
  assert.ok(api.calls.every(c => c.options.redirect === 'error'));
  const denied = fakeApi({ deny: true });
  await assert.rejects(preflightRelease(env, denied), error => error.message.includes('403') && !error.message.includes('SENSITIVE'));
  assert.equal(denied.calls.length, 1);
  await assert.rejects(preflightRelease(env, fakeApi({ stale: true })), /Main moved/);
  await assert.rejects(preflightRelease(env, fakeApi({ primary: false })), /Control read could not be verified/);
});

test('version 1 and an empty ledger cannot hide a missing fence, extra trigger or untracked migration', async () => {
  for (const change of ['DROP TRIGGER request_deployment_selection_guard', 'DROP INDEX request_receipts_started_idx',
    "CREATE TRIGGER rogue AFTER INSERT ON request_receipts BEGIN DELETE FROM request_receipts; END",
    "CREATE TRIGGER sqliteXrogue AFTER INSERT ON request_receipts BEGIN DELETE FROM request_receipts; END",
    "CREATE TRIGGER _cf_METADATA AFTER INSERT ON request_receipts BEGIN DELETE FROM request_receipts; END",
    "CREATE TRIGGER _cf_KV AFTER INSERT ON request_receipts BEGIN DELETE FROM request_receipts; END"]) {
    await assert.rejects(preflightRelease(env, fakeApi({ schema: controlSchema(change) })), /Control schema differs/);
  }
  await assert.rejects(preflightRelease(env, fakeApi({ migrations: [] })), /migration provenance/);
  await assert.rejects(preflightRelease(env, fakeApi({ migrations: [{ name: '0001_experimental.sql' }] })), /migration provenance/);
});

test('reviewed schema, migration marker and fresh-state checks work against native local D1', async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ port: 0, workers: [{ name: 'schema-test', modules: true,
    script: 'export default { fetch() { return new Response("local only"); } };', compatibilityDate: '2026-09-22',
    d1Databases: { REQUEST_CONTROL_DB: 'local-schema-only' } }] }));
  try {
    const database = await mf.getD1Database('REQUEST_CONTROL_DB', 'schema-test');
    await database.exec(readFileSync(join(repository, 'control-migrations/0001_request_control.sql'), 'utf8').replace(/--[^\n]*/g, '').replace(/\n/g, ' '));
    await database.exec("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT); INSERT INTO d1_migrations VALUES(1, '0001_request_control.sql');");
    const read = async () => {
      const results = await database.batch([CONTROL_SCHEMA_SQL, MIGRATION_STATUS_SQL, RELEASE_STATUS_SQL].map(sql => database.prepare(sql)));
      assertControlSchema(results[0].results, results[1].results);
      return assertControlState(results[2].results[0], env);
    };
    assert.equal((await read()).drained, false);
    await database.exec('DROP TRIGGER request_deployment_selection_guard');
    await assert.rejects(read(), /Control schema differs/);
  } finally { await mf.dispose(); }
});

test('post-upload verification quarantines duplicate creates and requires exact promotion', async () => {
  await preflightRelease(env, { ...fakeApi({ promoted: true }), after: true, manifest });
  await assert.rejects(preflightRelease(env, { ...fakeApi({ promoted: true, duplicate: true }), after: true, manifest }), /ambiguous\/duplicated/);
  await assert.rejects(preflightRelease(env, { ...fakeApi({ promoted: true, lateDuplicate: true }), after: true, manifest }), /ambiguous\/duplicated/);
  await assert.rejects(preflightRelease(env, { ...fakeApi(), after: true, manifest }), /Actual deployment/);
});

test('actual promoted snapshot must be a fresh production Functions deployment with the reviewed runtime', async () => {
  for (const deploymentOverride of [{ id: env.EXPECTED_DEPLOYMENT }, { project_id: appId }, { project_name: 'wrong' },
    { environment: 'preview' }, { production_branch: 'other' }, { uses_functions: false },
    { compatibility_date: '2026-01-01' }, { compatibility_flags: ['nodejs_compat'] }]) {
    await assert.rejects(preflightRelease(env, { ...fakeApi({ promoted: true, deploymentOverride }), after: true, manifest }), /identity or runtime configuration/);
  }
});

test('unknown or repeated create attempts are quarantined even before duplicate records appear', () => {
  const request = `-- START CF API REQUEST: POST https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${env.CLOUDFLARE_PAGES_PROJECT}/deployments`;
  assert.doesNotThrow(() => assertSingleCreateAttempt(`--- timestamp debug\n${request}\n---\n`, env));
  for (const log of ['', 'unrecognized log format', `${request}\n${request}\n`, `${request}/wrong-project\n`]) {
    assert.throws(() => assertSingleCreateAttempt(log, env), /quarantine/);
  }
});
