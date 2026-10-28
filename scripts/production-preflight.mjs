import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { CONTROL_STATUS_SQL, describeControlStatus } from '../functions/lib/requestControl.ts';
import { verifyPreparedRelease } from './prepare-pages-release.mjs';

export const RELEASE_ENVIRONMENT = 'production-admission';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const CONTROL_SCHEMA_SQL = `SELECT name, type, sql FROM sqlite_schema
  WHERE name NOT GLOB 'sqlite_*' AND NOT (type = 'table' AND name IN ('_cf_KV', '_cf_METADATA', 'd1_migrations'))
  ORDER BY type, name`;
export const RELEASE_STATUS_SQL = `SELECT *, (SELECT COUNT(*) FROM request_deployments) AS selection_count FROM (${CONTROL_STATUS_SQL})`;
export const MIGRATION_STATUS_SQL = 'SELECT name FROM d1_migrations ORDER BY id';
function requireCondition(condition, message) { if (!condition) throw new Error(message); }
const identifiableLogin = value => typeof value === 'string' && value.length > 0 && !/\s/.test(value);

export function assertDashboardConfiguration(root, env) {
  requireCondition(!['wrangler.json', 'wrangler.jsonc', 'wrangler.toml', '.wrangler/deploy/config.json'].some(name => existsSync(join(root, name))) &&
    !env.CLOUDFLARE_API_BASE_URL && !env.CLOUDFLARE_API_ENVIRONMENT,
  'This release path requires dashboard bindings and the default Cloudflare API; unexpected configuration requires review.');
}

export function assertCheckout(sha, status, expected) {
  requireCondition(sha.trim() === expected && status === '', 'Checkout must be clean and match the approved source SHA.');
}

function verifyCheckout(expected) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
  requireCondition(head.status === 0 && status.status === 0, 'Checkout could not be verified.');
  assertCheckout(head.stdout, status.stdout, expected);
}

export function assertControlSchema(rows, migrations) {
  const local = new DatabaseSync(':memory:');
  let expected;
  try {
    local.exec(readFileSync(new URL('../control-migrations/0001_request_control.sql', import.meta.url), 'utf8'));
    expected = local.prepare(CONTROL_SCHEMA_SQL).all();
  } finally { local.close(); }
  const normalize = values => JSON.stringify(values.map(({ name, type, sql }) => ({ name, type, sql: sql.replace(/\s+/g, ' ').trim() })));
  requireCondition(Array.isArray(rows) && normalize(rows) === normalize(expected), 'Control schema differs from the reviewed tables/indexes/triggers.');
  requireCondition(Array.isArray(migrations) && migrations.length === 1 && migrations[0].name === '0001_request_control.sql',
    'Control migration provenance could not be verified.');
}

export function assertReleaseRequest(env) {
  requireCondition(env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REF === 'refs/heads/main', 'Only an explicit main workflow dispatch may release.');
  requireCondition(/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? '') && env.RELEASE_SHA === env.GITHUB_SHA &&
    env.RELEASE_CONFIRMATION === `DEPLOY-CLOSED:${env.GITHUB_SHA}`, 'Confirm the exact dispatched source SHA with DEPLOY-CLOSED:SHA.');
  requireCondition(uuid.test(env.EXPECTED_DEPLOYMENT ?? '') && /^(0|[1-9][0-9]*)$/.test(env.CONTROL_REVISION ?? '') &&
    Number.isSafeInteger(Number(env.CONTROL_REVISION)), 'Expected canonical deployment and safe control revision are required.');
  requireCondition(['initial-closed', 'drained'].includes(env.RELEASE_MODE), 'Choose initial-closed or drained release mode.');
  requireCondition(/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? ''), 'Invalid repository.');
  requireCondition(/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') && /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? '') &&
    env.GITHUB_ACTOR && env.GITHUB_TRIGGERING_ACTOR, 'Run/attempt and original/rerun actors are required.');
}

export function assertApprovalEnvironment(environment, branches) {
  const reviewers = Array.isArray(environment?.protection_rules)
    ? environment.protection_rules.find(rule => rule?.type === 'required_reviewers') : undefined;
  requireCondition(environment?.name === RELEASE_ENVIRONMENT && Number.isSafeInteger(environment.id) && environment.id > 0 &&
    reviewers?.prevent_self_review === true && Array.isArray(reviewers.reviewers) && reviewers.reviewers.length > 0 &&
    reviewers.reviewers.every(value => (value?.type === 'User' && identifiableLogin(value.reviewer?.login)) ||
      (value?.type === 'Team' && Number.isSafeInteger(value.reviewer?.id) && value.reviewer.id > 0)),
  'The dedicated production environment must have identifiable required reviewers with self-review disabled.');
  requireCondition(environment.can_admins_bypass === false,
    'Administrator bypass must be explicitly disabled; an unavailable setting is not verified protection.');
  requireCondition(environment.deployment_branch_policy?.protected_branches === false &&
    environment.deployment_branch_policy.custom_branch_policies === true && branches?.total_count === 1 &&
    Array.isArray(branches.branch_policies) && branches.branch_policies.length === 1 &&
    branches.branch_policies[0]?.name === 'main' && branches.branch_policies[0].type === 'branch',
  'Production requires exactly one explicit main branch rule; unrestricted, protected-only, wildcard and tag policies are refused.');
}

export function assertIndependentApproval(history, environment, env) {
  const confirmation = `${env.RELEASE_CONFIRMATION}:${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT}`;
  const actors = [env.GITHUB_ACTOR, env.GITHUB_TRIGGERING_ACTOR].map(name => name.toLowerCase());
  // An incomplete record cannot prove that a rejection concerned another
  // environment. Validate the entire response before accepting any approval.
  requireCondition(Array.isArray(history) && history.every(review => review &&
    ['approved', 'rejected'].includes(review.state) && typeof review.comment === 'string' &&
    identifiableLogin(review.user?.login) && Array.isArray(review.environments) && review.environments.length > 0 &&
    review.environments.every(value => Number.isSafeInteger(value?.id) && value.id > 0)),
  'Approval history is incomplete or ambiguous; readiness UNKNOWN.');
  requireCondition(!history.some(review => review.state === 'rejected' &&
    review.environments.some(value => value.id === environment.id)) && Number.isSafeInteger(environment.id) && history.some(review =>
    review.state === 'approved' && review.comment === confirmation &&
    !actors.includes(review.user.login.toLowerCase()) && review.environments.some(value => value.id === environment.id)),
  'Independent production approval for this exact run attempt is required; bypass/self/stale approvals are insufficient.');
}

export function assertProductionProject(project, env) {
  requireCondition(uuid.test(env.PRODUCTION_PROJECT_ID ?? '') && project.id === env.PRODUCTION_PROJECT_ID &&
    project.production_branch === 'main' && !project.source, 'Wrong project identity, branch or deployment architecture.');
  const production = project.deployment_configs?.production;
  requireCondition(uuid.test(env.PRODUCTION_APP_DATABASE_ID ?? '') && uuid.test(env.PRODUCTION_CONTROL_DATABASE_ID ?? '') &&
    env.PRODUCTION_APP_DATABASE_ID !== env.PRODUCTION_CONTROL_DATABASE_ID &&
    production?.d1_databases?.DB?.id === env.PRODUCTION_APP_DATABASE_ID &&
    production?.d1_databases?.REQUEST_CONTROL_DB?.id === env.PRODUCTION_CONTROL_DATABASE_ID,
  'Application/control D1 identities must match the independently verified, distinct production resources.');
  requireCondition(env.PRODUCTION_R2_BUCKET && production.r2_buckets?.RESUME_FILES?.name === env.PRODUCTION_R2_BUCKET,
    'Wrong production R2 binding.');
  requireCondition(production.env_vars?.TEAM_DOMAIN?.type === 'secret_text' && production.env_vars?.POLICY_AUD?.type === 'secret_text' &&
    !Object.hasOwn(production.env_vars, 'LOCAL_DEV_AUTH_EMAIL'), 'Auth secret bindings are required and local auth is forbidden.');
  requireCondition(production.compatibility_date === '2026-09-22' && !(production.compatibility_flags?.length), 'Runtime compatibility changed; re-review the build.');
}

export function assertControlState(row, env) {
  const state = describeControlStatus(row);
  requireCondition(state.mode === 'closed' && state.revision === Number(env.CONTROL_REVISION), 'Control must remain closed at the approved revision.');
  if (env.RELEASE_MODE === 'initial-closed') {
    requireCondition(state.revision === 0 && state.coverage_hash === null && state.deployment === null &&
      state.outstanding === 0 && row.selection_count === 0 && state.drained === false, 'Initial installation requires genuinely fresh, closed/unverified state.');
  } else requireCondition(state.drained === true, 'An established release requires verified closed/drained state.');
  return state;
}

export function assertSingleCreateAttempt(log, env) {
  // Pinned Wrangler logs every performApiFetchBase call, including create
  // retries. Missing/changed log formats are UNKNOWN, not successful evidence.
  const request = `-- START CF API REQUEST: POST https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${env.CLOUDFLARE_PAGES_PROJECT}/deployments`;
  requireCondition(log.split(/\r?\n/).filter(line => line === request).length === 1,
    'Deployment creation was retried or cannot be verified; quarantine this label and keep closed.');
}

// API failures never include response bodies/tokens in errors. Fixed origins,
// no redirects, no retries. The only POST is the fixed read-only control SELECT.
export async function preflightRelease(env, { after, fetcher = fetch, manifest } = {}) {
  assertReleaseRequest(env);
  requireCondition(/^[0-9a-f]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? '') && /^[a-z0-9][a-z0-9-]*$/.test(env.CLOUDFLARE_PAGES_PROJECT ?? ''), 'Account and Pages project are required.');
  async function api(origin, path, token, body) {
    requireCondition(Boolean(token), 'Missing API credential.');
    const response = await fetcher(`${origin}${path}`, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json',
        ...(origin === 'https://api.github.com' ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    requireCondition(response.ok, `Preflight API denied or unavailable (${response.status}); readiness UNKNOWN.`);
    const data = await response.json();
    requireCondition(data.success !== false, 'Preflight API response failed; readiness UNKNOWN.');
    return data;
  }
  const github = path => api('https://api.github.com', `/repos/${env.GITHUB_REPOSITORY}${path}`, env.GITHUB_TOKEN);
  const environmentPath = `/environments/${RELEASE_ENVIRONMENT}`;
  const environment = await github(environmentPath);
  const branches = await github(`${environmentPath}/deployment-branch-policies?per_page=100&page=1`);
  assertApprovalEnvironment(environment, branches);
  assertIndependentApproval(await github(`/actions/runs/${env.GITHUB_RUN_ID}/approvals`), environment, env);
  const branch = await github('/git/ref/heads/main');
  requireCondition(branch.object?.sha === env.GITHUB_SHA, 'Main moved since dispatch; obtain new approval for a new run.');
  const base = `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}`;
  const cloudflare = (path, body) => api('https://api.cloudflare.com/client/v4', `${base}${path}`, env.CLOUDFLARE_API_TOKEN, body);
  const projectPath = `/pages/projects/${env.CLOUDFLARE_PAGES_PROJECT}`;
  const project = (await cloudflare(projectPath)).result;
  assertProductionProject(project, env);
  const canonical = project.canonical_deployment;
  if (!after) requireCondition(canonical?.id === env.EXPECTED_DEPLOYMENT, 'Canonical deployment changed; stop and re-review.');
  else {
    requireCondition(manifest?.sha === env.GITHUB_SHA && /^gh-[1-9][0-9]*-[1-9][0-9]*-[0-9a-f-]{36}$/.test(manifest?.label ?? ''), 'Missing prepared release manifest.');
    requireCondition(uuid.test(canonical?.id ?? '') && canonical.id !== env.EXPECTED_DEPLOYMENT &&
      canonical.project_id === env.PRODUCTION_PROJECT_ID && canonical.project_name === env.CLOUDFLARE_PAGES_PROJECT &&
      canonical.environment === 'production' && canonical.production_branch === 'main' && canonical.uses_functions === true &&
      canonical.compatibility_date === '2026-09-22' && !(canonical.compatibility_flags?.length),
    'Actual deployment identity or runtime configuration differs from the approved production release.');
    requireCondition(canonical?.deployment_trigger?.metadata?.commit_hash === manifest.sha &&
      canonical.deployment_trigger.metadata.commit_message === `Admission release ${manifest.label}` && canonical.latest_stage?.status === 'success',
    'Actual canonical deployment does not match this successful release.');
    requireCondition(canonical.d1_databases?.DB?.id === env.PRODUCTION_APP_DATABASE_ID &&
      canonical.d1_databases?.REQUEST_CONTROL_DB?.id === env.PRODUCTION_CONTROL_DATABASE_ID &&
      canonical.r2_buckets?.RESUME_FILES?.name === env.PRODUCTION_R2_BUCKET &&
      canonical.env_vars?.TEAM_DOMAIN?.type === 'secret_text' && canonical.env_vars?.POLICY_AUD?.type === 'secret_text' &&
      !Object.hasOwn(canonical.env_vars, 'LOCAL_DEV_AUTH_EMAIL'), 'Actual deployment bindings differ from the approved production resources.');
    // Wrangler can retry a create whose outcome is unknown. A duplicate is not a
    // distinct, safely selectable release, even when its uploaded code is equal.
    let matches = 0;
    for (let page = 1; ; page++) {
      requireCondition(page <= 1000, 'Deployment pagination exceeded safety bound.');
      const data = await cloudflare(`${projectPath}/deployments?page=${page}&per_page=25`);
      requireCondition(Array.isArray(data.result), 'Invalid deployment inventory.');
      matches += data.result.filter(d => d.deployment_trigger?.metadata?.commit_message === `Admission release ${manifest.label}`).length;
      if (data.result.length < 25) break;
    }
    requireCondition(matches === 1, 'Deployment outcome is ambiguous/duplicated; keep closed, inspect all candidates, never select this label.');
  }
  const query = await cloudflare(`/d1/database/${env.PRODUCTION_CONTROL_DATABASE_ID}/query`, {
    sql: `${CONTROL_SCHEMA_SQL}; ${MIGRATION_STATUS_SQL}; ${RELEASE_STATUS_SQL}` });
  requireCondition(query.result?.length === 3 && query.result.every(value => value.success === true && value.meta?.rows_written === 0 &&
    value.meta?.served_by_primary === true),
    'Control read could not be verified.');
  assertControlSchema(query.result[0].results, query.result[1].results);
  const state = assertControlState(query.result[2].results?.[0], env);
  return { sourceSha: env.GITHUB_SHA, mode: state.mode, revision: state.revision, drained: state.drained,
    coverageVerified: state.coverage_hash !== null, ...(after ? { deploymentId: canonical.id, label: manifest.label } : {}) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireCondition(['before', 'ready', 'after'].includes(process.argv[2]), 'Specify before, ready or after.');
    assertDashboardConfiguration(fileURLToPath(new URL('../', import.meta.url)), process.env);
    const after = process.argv[2] === 'after';
    assertReleaseRequest(process.env);
    verifyCheckout(process.env.GITHUB_SHA);
    const manifest = process.argv[2] !== 'before' ? JSON.parse(readFileSync(new URL('../.wrangler/production-release.json', import.meta.url), 'utf8')) : undefined;
    if (manifest) verifyPreparedRelease(manifest, { output: fileURLToPath(new URL('../dist', import.meta.url)),
      sha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT });
    if (after) assertSingleCreateAttempt(readFileSync(new URL('../.wrangler/production-upload.log', import.meta.url), 'utf8'), process.env);
    const result = await preflightRelease(process.env, { after, manifest });
    // Detect drift during the network preflight before handing off to upload.
    assertDashboardConfiguration(fileURLToPath(new URL('../', import.meta.url)), process.env);
    verifyCheckout(process.env.GITHUB_SHA);
    if (manifest) verifyPreparedRelease(manifest, { output: fileURLToPath(new URL('../dist', import.meta.url)),
      sha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
