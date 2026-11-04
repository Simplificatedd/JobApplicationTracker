import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertReleaseRequest, assertCheckout, assertDashboardConfiguration, assertProductionProject, assertAutomaticTarget,
  localGit, preflightRelease } from './production-preflight.mjs';

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

const automaticEnv = { ...env, GITHUB_EVENT_NAME: 'workflow_run', GITHUB_SHA: 'd'.repeat(40), RELEASE_SHA: 'a'.repeat(40),
  CI_CONCLUSION: 'success', CI_EVENT: 'push', CI_BRANCH: 'main', CI_REPOSITORY: env.GITHUB_REPOSITORY };

test('only a manual current-main dispatch with explicit matching SHA is accepted', () => {
  assert.equal(assertReleaseRequest(env), 'manual');
  for (const changes of [{ GITHUB_EVENT_NAME: 'push' }, { GITHUB_REF: 'refs/heads/feature' },
    { RELEASE_SHA: 'c'.repeat(40) }, { RELEASE_SHA: '' }, { GITHUB_SHA: 'short' }]) {
    assert.throws(() => assertReleaseRequest({ ...env, ...changes }));
  }
  assertCheckout(env.GITHUB_SHA, '', env.GITHUB_SHA);
  assert.throws(() => assertCheckout(env.GITHUB_SHA, '?? unexpected-source\n', env.GITHUB_SHA));
  assert.throws(() => assertCheckout('c'.repeat(40), '', env.GITHUB_SHA));
});

test('only a successful CI run for a push to main is accepted automatically, for the commit CI tested', () => {
  // GITHUB_SHA (latest main) may differ from the tested commit; RELEASE_SHA is what deploys.
  assert.equal(assertReleaseRequest(automaticEnv), 'automatic');
  for (const changes of [{ CI_CONCLUSION: 'failure' }, { CI_CONCLUSION: 'cancelled' }, { CI_CONCLUSION: undefined },
    { CI_EVENT: 'pull_request' }, { CI_EVENT: 'workflow_dispatch' }, { CI_BRANCH: 'feature' },
    { CI_REPOSITORY: 'fork/tracker' }, { GITHUB_REF: 'refs/heads/feature' }, { RELEASE_SHA: 'short' },
    { GITHUB_EVENT_NAME: 'push' }]) {
    assert.throws(() => assertReleaseRequest({ ...automaticEnv, ...changes }), undefined, JSON.stringify(changes));
  }
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

const deployedSha = 'e'.repeat(40);
const deployedProject = { ...structuredClone(project),
  canonical_deployment: { deployment_trigger: { metadata: { commit_hash: deployedSha } } } };
const forwardGit = { isAncestor: () => true, changed: () => false };

test('automatic deploys only move production forward and never across a migration change', () => {
  assertAutomaticTarget(deployedProject, automaticEnv.RELEASE_SHA, forwardGit);
  assert.throws(() => assertAutomaticTarget(project, automaticEnv.RELEASE_SHA, forwardGit), /unknown/);
  const shortHash = structuredClone(deployedProject);
  shortHash.canonical_deployment.deployment_trigger.metadata.commit_hash = 'abc123';
  assert.throws(() => assertAutomaticTarget(shortHash, automaticEnv.RELEASE_SHA, forwardGit), /unknown/);
  assert.throws(() => assertAutomaticTarget(deployedProject, automaticEnv.RELEASE_SHA,
    { ...forwardGit, isAncestor: () => false }), /not an earlier main commit/);
  const changed = [];
  assert.throws(() => assertAutomaticTarget(deployedProject, automaticEnv.RELEASE_SHA,
    { ...forwardGit, changed: (...args) => { changed.push(args); return true; } }), /Migrations changed/);
  assert.deepEqual(changed, [[deployedSha, automaticEnv.RELEASE_SHA, 'migrations']]);
});

test('automatic preflight checks the tested commit against main and the deployed commit', async () => {
  const fetcher = async url => Response.json(url.startsWith('https://api.github.com/')
    ? { object: { sha: automaticEnv.RELEASE_SHA } } : { success: true, result: deployedProject });
  const result = await preflightRelease(automaticEnv, { fetcher, git: forwardGit });
  assert.deepEqual([result.mode, result.sha], ['automatic', automaticEnv.RELEASE_SHA]);
  // Main has moved past the tested commit: the newer commit's own run deploys.
  const moved = async url => Response.json(url.startsWith('https://api.github.com/')
    ? { object: { sha: automaticEnv.GITHUB_SHA } } : { success: true, result: deployedProject });
  await assert.rejects(preflightRelease(automaticEnv, { fetcher: moved, git: forwardGit }), /Main moved/);
  await assert.rejects(preflightRelease(automaticEnv, { fetcher, git: { ...forwardGit, isAncestor: () => false } }),
    /not an earlier main commit/);
  // Manual dispatches remain the path for migrations and rollbacks.
  const manualFetcher = async url => Response.json(url.startsWith('https://api.github.com/')
    ? { object: { sha: env.RELEASE_SHA } } : { success: true, result: project });
  assert.equal((await preflightRelease(env, { fetcher: manualFetcher, git: { isAncestor: () => false, changed: () => true } })).mode,
    'manual');
});

test('local git comparison reads ancestry and migration changes from real history', () => {
  const repository = mkdtempSync(join(tmpdir(), 'tracker-git-test-'));
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args],
      { cwd: repository, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git('init', '-q');
    mkdirSync(join(repository, 'migrations'));
    writeFileSync(join(repository, 'migrations', '0001.sql'), 'select 1;');
    git('add', '.'); git('commit', '-q', '-m', 'first');
    const first = git('rev-parse', 'HEAD');
    writeFileSync(join(repository, 'app.js'), 'ui');
    git('add', '.'); git('commit', '-q', '-m', 'ui only');
    const uiOnly = git('rev-parse', 'HEAD');
    writeFileSync(join(repository, 'migrations', '0002.sql'), 'select 2;');
    git('add', '.'); git('commit', '-q', '-m', 'migration');
    const migration = git('rev-parse', 'HEAD');
    const local = localGit(repository);
    assert.equal(local.isAncestor(first, uiOnly), true);
    assert.equal(local.isAncestor(uiOnly, first), false);
    assert.equal(local.isAncestor('f'.repeat(40), uiOnly), false);
    assert.equal(local.changed(first, uiOnly, 'migrations'), false);
    assert.equal(local.changed(first, migration, 'migrations'), true);
    assert.throws(() => local.changed('f'.repeat(40), uiOnly, 'migrations'), /Could not compare/);
  } finally { rmSync(repository, { recursive: true, force: true }); }
});

test('workflow deploys code only, uses the existing environment secrets, and never publishes previews', () => {
  const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  const workflow = readFileSync(join(root, '.github/workflows/production.yml'), 'utf8');
  const events = workflow.split('\non:\n')[1].split('\npermissions:')[0];
  assert.deepEqual(events.match(/^ {2}[a-z_]+:/gm), ['  workflow_dispatch:', '  workflow_run:']);
  assert.match(events, /workflows: \[CI\]\n {4}types: \[completed\]\n {4}branches: \[main\]/);
  const condition = workflow.split('if: >-')[1].split('\n    runs-on:')[0].replace(/\s+/g, ' ');
  for (const required of ["github.ref == 'refs/heads/main'", "github.event_name == 'workflow_dispatch'",
    "github.event.workflow_run.conclusion == 'success'", "github.event.workflow_run.event == 'push'",
    "github.event.workflow_run.head_branch == 'main'", 'github.event.workflow_run.head_repository.full_name == github.repository']) {
    assert.ok(condition.includes(required), required);
  }
  // The tested commit, not the latest main, is checked out, verified and labelled.
  assert.match(workflow, /RELEASE_SHA: \$\{\{ inputs.release_sha \|\| github.event.workflow_run.head_sha \}\}/);
  assert.match(workflow, /ref: \$\{\{ env.RELEASE_SHA \}\}\n {10}# [^\n]*\n {10}fetch-depth: 0/);
  assert.match(workflow, /--commit-hash="\$RELEASE_SHA"/);
  assert.doesNotMatch(workflow, /GITHUB_SHA|github\.sha/);
  assert.equal((workflow.match(/node scripts\/production-preflight\.mjs/g) ?? []).length, 2);
  assert.match(workflow, /group: cloudflare-production/);
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
