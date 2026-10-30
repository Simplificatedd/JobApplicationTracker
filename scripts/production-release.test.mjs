import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertReleaseRequest, assertCheckout, assertDashboardConfiguration, assertProductionProject, preflightRelease } from './production-preflight.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40),
  RELEASE_SHA: 'a'.repeat(40), GITHUB_REPOSITORY: 'owner/tracker', GITHUB_TOKEN: 'synthetic-github',
  CLOUDFLARE_API_TOKEN: 'synthetic-cloudflare', CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32), CLOUDFLARE_PAGES_PROJECT: 'test-tracker',
  PRODUCTION_APP_DATABASE_ID: '11111111-1111-4111-8111-111111111111', PRODUCTION_R2_BUCKET: 'test-resumes' };
const project = { id: '22222222-2222-4222-8222-222222222222', name: 'test-tracker', production_branch: 'main', source: null,
  deployment_configs: { production: {
    d1_databases: { DB: { id: env.PRODUCTION_APP_DATABASE_ID } }, r2_buckets: { RESUME_FILES: { name: env.PRODUCTION_R2_BUCKET } },
    env_vars: { TEAM_DOMAIN: { type: 'secret_text' }, POLICY_AUD: { type: 'secret_text' } },
    compatibility_date: '2026-09-22', compatibility_flags: [],
  }, preview: { d1_databases: {}, r2_buckets: {}, env_vars: {} } } };

test('only a manual current-main dispatch with explicit matching SHA is accepted', () => {
  assert.doesNotThrow(() => assertReleaseRequest(env));
  for (const changes of [{ GITHUB_EVENT_NAME: 'push' }, { GITHUB_REF: 'refs/heads/feature' },
    { RELEASE_SHA: 'c'.repeat(40) }, { RELEASE_SHA: '' }, { GITHUB_SHA: 'short' }]) {
    assert.throws(() => assertReleaseRequest({ ...env, ...changes }));
  }
  assertCheckout(env.GITHUB_SHA, '', env.GITHUB_SHA);
  assert.throws(() => assertCheckout(env.GITHUB_SHA, '?? unexpected-source\n', env.GITHUB_SHA));
  assert.throws(() => assertCheckout('c'.repeat(40), '', env.GITHUB_SHA));
});

test('an unexpected local config cannot override production dashboard bindings', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'tracker-config-test-'));
  try {
    assertDashboardConfiguration(temporary, {});
    for (const name of ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml', '.wrangler/deploy/config.json']) {
      mkdirSync(join(temporary, name, '..'), { recursive: true });
      writeFileSync(join(temporary, name), '{}');
      assert.throws(() => assertDashboardConfiguration(temporary, {}));
      rmSync(join(temporary, name));
    }
    assert.throws(() => assertDashboardConfiguration(temporary, { CLOUDFLARE_API_BASE_URL: 'https://other.invalid' }));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test('existing production identities, Access and unused previews are checked without a control DB', () => {
  assertProductionProject(project, env);
  for (const modify of [
    p => { p.name = 'wrong-project'; },
    p => { p.production_branch = 'other'; },
    p => { p.source = { type: 'github' }; },
    p => { p.deployment_configs.production.d1_databases.DB.id = '33333333-3333-4333-8333-333333333333'; },
    p => { p.deployment_configs.production.r2_buckets.RESUME_FILES.name = 'wrong-bucket'; },
    p => { p.deployment_configs.production.env_vars.LOCAL_DEV_AUTH_EMAIL = { type: 'plain_text' }; },
    p => { delete p.deployment_configs.production.env_vars.POLICY_AUD; },
    p => { p.deployment_configs.production.env_vars.POLICY_AUD = { type: 'plain_text', value: '  ' }; },
    p => { p.deployment_configs.production.env_vars.TEAM_DOMAIN = { type: 'plain_text', value: 'https://attacker.invalid' }; },
    p => { p.deployment_configs.production.env_vars.TEAM_DOMAIN.type = 'unknown'; },
    p => { p.deployment_configs.production.compatibility_flags = ['nodejs_compat']; },
    p => { p.deployment_configs.preview.d1_databases.DB = { id: env.PRODUCTION_APP_DATABASE_ID }; },
    p => { p.deployment_configs.preview.r2_buckets.RESUME_FILES = { name: env.PRODUCTION_R2_BUCKET }; },
  ]) {
    const unsafe = structuredClone(project); modify(unsafe);
    assert.throws(() => assertProductionProject(unsafe, env));
  }
});

test('public Access identifiers and harmless preview variables do not block deployment', () => {
  const configured = structuredClone(project);
  configured.deployment_configs.production.env_vars = {
    TEAM_DOMAIN: { type: 'plain_text', value: ' https://test-team.cloudflareaccess.com/ ' },
    POLICY_AUD: { type: 'plain_text', value: 'test-audience' },
    REQUEST_CONTROL_DEPLOYMENT: { type: 'plain_text', value: 'unused-legacy-label' },
  };
  configured.deployment_configs.preview.env_vars = {
    LOG_LEVEL: { type: 'plain_text', value: 'info' },
    POLICY_AUD: { type: 'plain_text', value: 'public-identifier' },
  };
  assertProductionProject(configured, env);
  configured.deployment_configs.production.env_vars.TEAM_DOMAIN = { type: 'secret_text' };
  assertProductionProject(configured, env);
});

test('unused previews cannot receive deployment credentials or local auth overrides', () => {
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CF_API_TOKEN', 'CF_API_KEY',
    'ADMISSION_PAGES_API_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN', 'LOCAL_DEV_AUTH_EMAIL']) {
    const unsafe = structuredClone(project);
    unsafe.deployment_configs.preview.env_vars[name] = { type: 'secret_text' };
    assert.throws(() => assertProductionProject(unsafe, env), /credentials|overrides/);
  }
});

test('preflight uses only fixed-origin GETs and rejects moved main or unavailable provider reads', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.startsWith('https://api.github.com/')
      ? { object: { sha: env.GITHUB_SHA } } : { success: true, result: project });
  };
  assert.equal((await preflightRelease(env, { fetcher })).databaseId, env.PRODUCTION_APP_DATABASE_ID);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ options }) => options.method === 'GET' && options.redirect === 'error' && !options.body));
  assert.equal(calls[1].url, `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/test-tracker`);
  await assert.rejects(preflightRelease(env, { fetcher: async () => Response.json({ object: { sha: 'c'.repeat(40) } }) }), /Main moved/);
  await assert.rejects(preflightRelease(env, { fetcher: async () => new Response('private details', { status: 403 }) }),
    error => /HTTP 403/.test(error.message) && !error.message.includes('private details'));
});

test('workflow deploys code only, uses the existing environment secrets, and never publishes previews', () => {
  const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  const workflow = readFileSync(join(root, '.github/workflows/production.yml'), 'utf8');
  const events = workflow.split('\non:\n')[1].split('\npermissions:')[0];
  assert.deepEqual(events.match(/^ {2}[a-z_]+:/gm), ['  workflow_dispatch:']);
  assert.match(workflow, /if: github.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /environment: production-admission/);
  assert.deepEqual([...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i).sort(),
    ['ADMISSION_CLOUDFLARE_ACCOUNT_ID', 'ADMISSION_PAGES_API_TOKEN']);
  assert.deepEqual([...workflow.matchAll(/vars\.([A-Z0-9_]+)/g)].map(m => m[1]).sort(),
    ['CLOUDFLARE_PAGES_PROJECT', 'PRODUCTION_APP_DATABASE_ID', 'PRODUCTION_R2_BUCKET']);
  assert.equal((workflow.match(/wrangler pages deploy/g) ?? []).length, 1);
  assert.match(workflow, /--branch=main/);
  assert.doesNotMatch(workflow, /migrations|d1 execute|r2 object|request-control|REQUEST_CONTROL|production-preflight\.mjs (before|ready)/);
  assert.doesNotMatch(ci, /secrets(?:\.|\[)|environment:|pages deploy/);
});
