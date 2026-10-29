import { test } from 'node:test';
import { RELEASE_WORKFLOW, assertReleaseWorkflowContext, assertReleaseWorkflowRun } from './release-workflow-identity.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { assertReleaseRequest, assertReleaseEnvironment, assertProductionProject, assertControlState, assertSingleCreateAttempt,
  assertCheckout, assertDashboardConfiguration, assertControlSchema, CONTROL_SCHEMA_SQL, MIGRATION_STATUS_SQL, RELEASE_STATUS_SQL, preflightRelease } from './production-preflight.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const appId = '11111111-1111-4111-8111-111111111111', controlId = '22222222-2222-4222-8222-222222222222';
const env = { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40),
  RELEASE_SHA: 'a'.repeat(40), RELEASE_CONFIRMATION: `DEPLOY-CLOSED:${'a'.repeat(40)}`,
  EXPECTED_DEPLOYMENT: '33333333-3333-4333-8333-333333333333', CONTROL_REVISION: '0', RELEASE_MODE: 'initial-closed',
  GITHUB_REPOSITORY: RELEASE_WORKFLOW.repository, GITHUB_REPOSITORY_ID: String(RELEASE_WORKFLOW.repositoryId),
  GITHUB_REPOSITORY_OWNER_ID: String(RELEASE_WORKFLOW.ownerId),
  GITHUB_WORKFLOW_REF: `${RELEASE_WORKFLOW.repository}/${RELEASE_WORKFLOW.path}@${RELEASE_WORKFLOW.ref}`, GITHUB_WORKFLOW_SHA: 'a'.repeat(40), GITHUB_TOKEN: 'synthetic-github', CLOUDFLARE_API_TOKEN: 'synthetic-cloudflare',
  GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_ACTOR: 'initiator', GITHUB_TRIGGERING_ACTOR: 'rerunner',
  CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32), CLOUDFLARE_PAGES_PROJECT: 'test-tracker',
  PRODUCTION_PROJECT_ID: '44444444-4444-4444-8444-444444444444', PRODUCTION_APP_DATABASE_ID: appId,
  PRODUCTION_CONTROL_DATABASE_ID: controlId, PRODUCTION_R2_BUCKET: 'test-resumes' };
const workflowRepository = { id: RELEASE_WORKFLOW.repositoryId, full_name: RELEASE_WORKFLOW.repository, fork: false,
  owner: { id: RELEASE_WORKFLOW.ownerId, login: RELEASE_WORKFLOW.owner } };
const workflowRun = { id: 123, run_attempt: 1, workflow_id: RELEASE_WORKFLOW.workflowId,
  event: 'workflow_dispatch', head_branch: 'main', head_sha: env.GITHUB_SHA, path: RELEASE_WORKFLOW.path,
  repository: workflowRepository, head_repository: workflowRepository,
  actor: { login: env.GITHUB_ACTOR }, triggering_actor: { login: env.GITHUB_TRIGGERING_ACTOR } };
const workflowDefinition = { id: RELEASE_WORKFLOW.workflowId, path: RELEASE_WORKFLOW.path, state: 'active' };
const branches = { total_count: 1, branch_policies: [{ id: 1, name: 'main', type: 'branch' }] };
const environment = { name: 'production-admission', can_admins_bypass: false,
  deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  id: RELEASE_WORKFLOW.environmentId, protection_rules: [{ type: 'branch_policy' }] };
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

test('manual exact-SHA confirmation rejects push, stale SHA, branch and malformed confirmations', () => {
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

test('production resource identities and local-auth exclusion remain enforced', () => {
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

function controlSchema(change) {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(readFileSync(join(repository, 'control-migrations/0001_request_control.sql'), 'utf8'));
    if (change) database.exec(change);
    return database.prepare(CONTROL_SCHEMA_SQL).all();
  } finally { database.close(); }
}

function fakeApi({ promoted = false, duplicate = false, lateDuplicate = false, deny = false, stale = false, primary = true, deploymentOverride = {},
  environment: releaseEnvironment = environment, policies = branches, policyStatus = 200,
  run = workflowRun, workflow = workflowDefinition,
  schema = controlSchema(), migrations = [{ name: '0001_request_control.sql' }] } = {}) {
  const calls = [];
  const canonical = { id: '66666666-6666-4666-8666-666666666666', project_id: env.PRODUCTION_PROJECT_ID,
    project_name: env.CLOUDFLARE_PAGES_PROJECT, environment: 'production', production_branch: 'main', uses_functions: true,
    ...config, latest_stage: { status: 'success' },
    deployment_trigger: { metadata: { commit_hash: manifest.sha, commit_message: `Admission release ${manifest.label}` } }, ...deploymentOverride };
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (deny) return new Response('SENSITIVE RESPONSE MUST NOT BE LOGGED', { status: 403 });
    if (url.endsWith('/environments/production-admission')) return Response.json(releaseEnvironment);
    if (url.endsWith('/deployment-branch-policies?per_page=100&page=1')) return policyStatus === 200 ? Response.json(policies) : new Response('SENSITIVE RESPONSE MUST NOT BE LOGGED', { status: policyStatus });
    if (url.endsWith('/actions/runs/123/attempts/1')) return Response.json(run);
    if (url.endsWith(`/actions/workflows/${RELEASE_WORKFLOW.workflowId}`)) return Response.json(workflow);
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
    if (url.endsWith('/pages/projects/test-tracker')) return Response.json({ success: true, result: { ...project, ...(promoted ? { canonical_deployment: canonical } : {}) } });
    throw new Error('Unexpected URL in local API fixture.');
  };
  return { calls, fetcher };
}

test('preflight performs metadata GETs and only fixed read-only SELECTs; no transitions or retries', async () => {
  const api = fakeApi();
  const result = await preflightRelease(env, api);
  assert.equal(result.coverageVerified, false);
  assert.equal(result.drained, false);
  assert.equal(api.calls.length, 7);
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

test('solo release accepts a reviewer-free environment but rejects missing identity or admin bypass', async () => {
  assert.doesNotThrow(() => assertReleaseEnvironment(environment, branches));
  const api = fakeApi();
  await preflightRelease(env, api);
  assert.ok(api.calls.every(call => !call.url.endsWith('/approvals')), 'Solo dispatch must not depend on review history');
  for (const override of [{ can_admins_bypass: true }, { can_admins_bypass: undefined }, { name: 'production' },
    { name: 'preview' }, { name: undefined }, { id: 0 }, { id: undefined }, { id: environment.id + 1 }]) {
    const badEnvironment = { ...environment, ...override };
    assert.throws(() => assertReleaseEnvironment(badEnvironment, branches));
    const invalid = fakeApi({ environment: badEnvironment });
    await assert.rejects(preflightRelease(env, invalid));
    assert.ok(invalid.calls.every(call => call.url.startsWith('https://api.github.com/')));
  }
  assert.throws(() => assertReleaseEnvironment(null, branches));
});

test('only an explicit complete main-branch rule is accepted; protected-only is not main-only', () => {
  for (const deployment_branch_policy of [null, undefined, {}, { protected_branches: true, custom_branch_policies: false },
    { protected_branches: false, custom_branch_policies: false }]) {
    assert.throws(() => assertReleaseEnvironment({ ...environment, deployment_branch_policy }, branches));
  }
  for (const policies of [undefined, null, {}, { total_count: 0, branch_policies: [] },
    { ...branches, total_count: 101 }, { ...branches, total_count: undefined },
    { total_count: 2, branch_policies: [branches.branch_policies[0], { name: '*', type: 'branch' }] },
    ...[{ name: '*', type: 'branch' }, { name: 'other', type: 'branch' }, { name: 'main', type: 'tag' }, { name: 'main' }, null]
      .map(rule => ({ total_count: 1, branch_policies: [rule] }))]) {
    assert.throws(() => assertReleaseEnvironment(environment, policies));
  }
});

test('unreadable or permissive policy stops before Cloudflare access without leaking responses', async () => {
  for (const policyStatus of [403, 404, 500]) {
    const api = fakeApi({ policyStatus });
    await assert.rejects(preflightRelease(env, api), error => error.message.includes(String(policyStatus)) && !error.message.includes('SENSITIVE'));
    assert.equal(api.calls.length, 2);
    assert.ok(api.calls.every(call => call.options.method === 'GET' && call.url.startsWith('https://api.github.com/')));
  }
  for (const overrides of [{ policies: {} },
    { policies: { total_count: 1, branch_policies: [{ id: 1, name: 'main' }] } }, { environment: { ...environment, can_admins_bypass: true } },
    { environment: { ...environment, deployment_branch_policy: null } }]) {
    const api = fakeApi(overrides);
    await assert.rejects(preflightRelease(env, api));
    assert.ok(api.calls.every(call => call.url.startsWith('https://api.github.com/')));
  }
});

test('preflight reads the fresh environment and policy, never the historical environment', async () => {
  const api = fakeApi();
  await preflightRelease(env, api);
  const github = api.calls.filter(call => call.url.startsWith('https://api.github.com/'));
  assert.ok(github.some(call => call.url.endsWith('/environments/production-admission')));
  assert.ok(github.some(call => call.url.endsWith('/environments/production-admission/deployment-branch-policies?per_page=100&page=1')));
  assert.ok(github.every(call => call.options.headers['X-GitHub-Api-Version'] === '2022-11-28'));
  assert.ok(!github.some(call => /\/environments\/production(?:\/|$)/.test(call.url)));
});

test('the only release workflow reserves fresh secret names instead of resolving historical repository credentials', () => {
  const release = readFileSync(join(repository, '.github/workflows/production.yml'), 'utf8');
  assert.deepEqual(readdirSync(join(repository, '.github/workflows')).filter(name => /\.ya?ml$/.test(name)).sort(), ['ci.yml', 'production.yml']);
  assert.match(release, /^ {4}environment: production-admission$/m);
  const names = [...new Set([...release.matchAll(/secrets\.([A-Z_]+)/g)].map(match => match[1]))].sort();
  assert.deepEqual(names, ['ADMISSION_CLOUDFLARE_ACCOUNT_ID', 'ADMISSION_PAGES_API_TOKEN']);
  // Public credential references from main 1d1382b's historical CI. GitHub reruns
  // retain those references; this models name resolution, not token revocation.
  const historicalNames = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'];
  const freshEnvironment = { ADMISSION_CLOUDFLARE_ACCOUNT_ID: 'synthetic-account', ADMISSION_PAGES_API_TOKEN: 'synthetic-new-token' };
  assert.ok(historicalNames.every(name => !Object.hasOwn(freshEnvironment, name)));
  const legacyRepository = { CLOUDFLARE_ACCOUNT_ID: 'synthetic-old-account', CLOUDFLARE_API_TOKEN: 'synthetic-old-token' };
  assert.ok(names.every(name => !Object.hasOwn(legacyRepository, name)), 'No fallback to old repository names');
  assert.equal(legacyRepository.CLOUDFLARE_API_TOKEN, 'synthetic-old-token', 'Existing historical credentials STILL require external retirement');
});

test('production credentials cannot be exposed by a preview job or workflow-level environment', () => {
  const source = readFileSync(join(repository, '.github/workflows/production.yml'), 'utf8');
  const assertPlacement = text => {
    const [header, jobs, extra] = text.split('\njobs:\n');
    assert.equal(extra, undefined);
    assert.doesNotMatch(header, /\bsecrets\s*[.[]/);
    assert.deepEqual(jobs.match(/^ {2}[\w-]+:/gm), ['  release:']);
    assert.match(jobs, /^ {4}environment: production-admission$/m);
    assert.match(jobs, /^ {4}if: github.ref == 'refs\/heads\/main'$/m);
    assert.deepEqual([...new Set([...jobs.matchAll(/secrets\.([A-Z_]+)/g)].map(match => match[1]))].sort(),
      ['ADMISSION_CLOUDFLARE_ACCOUNT_ID', 'ADMISSION_PAGES_API_TOKEN']);
  };
  assert.doesNotThrow(() => assertPlacement(source));
  for (const unsafe of [
    source.replace('environment: production-admission', 'environment: preview'),
    source.replace("if: github.ref == 'refs/heads/main'", "if: github.ref == 'refs/heads/preview'"),
    source.replaceAll('secrets.ADMISSION_PAGES_API_TOKEN', 'secrets.CLOUDFLARE_API_TOKEN'),
    source.replace('\njobs:\n', '\nenv:\n  TOKEN: ${{ secrets.ADMISSION_PAGES_API_TOKEN }}\njobs:\n'),
    `${source}\n  preview:\n    environment: production-admission\n`,
  ]) assert.throws(() => assertPlacement(unsafe));
});

test('release workflow identity accepts only the designated workflow and documented main path forms', () => {
  assert.doesNotThrow(() => assertReleaseWorkflowContext(env));
  for (const path of [RELEASE_WORKFLOW.path, `${RELEASE_WORKFLOW.path}@main`, `${RELEASE_WORKFLOW.path}@refs/heads/main`]) {
    assert.doesNotThrow(() => assertReleaseWorkflowRun(env, { ...workflowRun, path }, workflowDefinition));
  }
});

test('workflow-provided identity cannot substitute a different repository, workflow ref or source', async () => {
  const overrides = [
    { GITHUB_REPOSITORY: 'untrusted/tracker' }, { GITHUB_REPOSITORY_ID: '42' }, { GITHUB_REPOSITORY_OWNER_ID: '42' },
    { GITHUB_WORKFLOW_REF: `${RELEASE_WORKFLOW.repository}/.github/workflows/alternative.yml@refs/heads/main` },
    { GITHUB_WORKFLOW_REF: `${RELEASE_WORKFLOW.repository}/${RELEASE_WORKFLOW.path}@refs/heads/old-release` },
    { GITHUB_WORKFLOW_REF: `${RELEASE_WORKFLOW.repository}/${RELEASE_WORKFLOW.path}@refs/tags/main` },
    { GITHUB_WORKFLOW_SHA: 'b'.repeat(40) }, { GITHUB_WORKFLOW_SHA: undefined }, { GITHUB_WORKFLOW_REF: undefined },
    { GITHUB_REPOSITORY_ID: 1353415059 }, { GITHUB_RUN_ID: '9007199254740992' }, { GITHUB_RUN_ID: '0123' },
    { GITHUB_RUN_ATTEMPT: '1/traversal' }, { GITHUB_ACTOR: {} }, { GITHUB_TRIGGERING_ACTOR: '  ' },
    { GITHUB_REF: 'refs/pull/123/merge' }, { GITHUB_EVENT_NAME: 'pull_request_target' },
  ];
  for (const override of overrides) {
    const api = fakeApi();
    await assert.rejects(preflightRelease({ ...env, ...override }, api), /workflow identity/);
    assert.equal(api.calls.length, 0, 'Malformed or unexpected context must fail before any API call');
  }
});

test('GitHub attempt metadata rejects historical, alternative, forked or malformed workflow identity before provider access', async () => {
  const repositoryOverrides = [
    { id: 42 }, { full_name: 'other/tracker' }, { fork: true },
    { owner: { id: 42, login: RELEASE_WORKFLOW.owner } },
  ];
  const runs = [
    null, {}, [], 'untrusted metadata', { ...workflowRun, id: 124 }, { ...workflowRun, id: '123' },
    { ...workflowRun, workflow_id: 42 }, { ...workflowRun, run_attempt: 2 },
    { ...workflowRun, head_sha: 'b'.repeat(40) }, { ...workflowRun, head_branch: 'old-release' },
    { ...workflowRun, event: 'pull_request' }, { ...workflowRun, path: '.github/workflows/alternative.yml' },
    { ...workflowRun, path: `${RELEASE_WORKFLOW.path}@refs/tags/main` },
    { ...workflowRun, actor: { login: 'substituted' } }, { ...workflowRun, triggering_actor: undefined },
    ...repositoryOverrides.map(override => ({ ...workflowRun, repository: { ...workflowRepository, ...override } })),
    { ...workflowRun, head_repository: { ...workflowRepository, id: 42 } },
    { ...workflowRun, referenced_workflows: [{ path: 'other/reusable/.github/workflows/deploy.yml@main' }] },
    { ...workflowRun, referenced_workflows: {} },
  ];
  for (const run of runs) {
    const api = fakeApi({ run });
    await assert.rejects(preflightRelease(env, api), /workflow identity/);
    assert.ok(api.calls.every(call => call.url.startsWith('https://api.github.com/')));
  }
  for (const workflow of [null, {}, [], { ...workflowDefinition, id: 42 },
    { ...workflowDefinition, path: '.github/workflows/alternative.yml' }, { ...workflowDefinition, state: 'disabled_manually' }]) {
    const api = fakeApi({ workflow });
    await assert.rejects(preflightRelease(env, api), /workflow identity/);
    assert.ok(api.calls.every(call => call.url.startsWith('https://api.github.com/')));
  }
});

test('changing both workflow-provided SHA strings cannot replace GitHub main and attempt evidence', async () => {
  const substituted = { ...env, GITHUB_SHA: 'b'.repeat(40), GITHUB_WORKFLOW_SHA: 'b'.repeat(40),
    RELEASE_SHA: 'b'.repeat(40), RELEASE_CONFIRMATION: `DEPLOY-CLOSED:${'b'.repeat(40)}` };
  const api = fakeApi();
  await assert.rejects(preflightRelease(substituted, api), /Main moved/);
  assert.ok(api.calls.every(call => call.url.startsWith('https://api.github.com/')));
  const actors = fakeApi();
  await assert.rejects(preflightRelease({ ...env, GITHUB_ACTOR: 'substituted' }, actors), /workflow identity/);
  assert.ok(actors.calls.every(call => call.url.startsWith('https://api.github.com/')));
});

test('missing release environment or credential inputs fail closed without a provider request', async () => {
  const missingEnvironment = fakeApi({ environment: null });
  await assert.rejects(preflightRelease(env, missingEnvironment), /dedicated production environment/);
  assert.ok(missingEnvironment.calls.every(call => call.url.startsWith('https://api.github.com/')));
  for (const name of ['GITHUB_TOKEN', 'CLOUDFLARE_API_TOKEN']) {
    for (const value of [undefined, '', '   ']) {
      const api = fakeApi();
      await assert.rejects(preflightRelease({ ...env, [name]: value }, api), /Missing API credential/);
      assert.equal(api.calls.length, 0);
    }
  }
  // Presence checks do not establish which GitHub secret scope supplied a token.
  // Operator setup must keep the reserved names exclusively in the environment.
});
