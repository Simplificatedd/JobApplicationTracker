import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const requireCondition = (condition, message) => { if (!condition) throw new Error(message); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function assertReleaseRequest(env) {
  requireCondition(env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REF === 'refs/heads/main',
    'Production requires a manual dispatch from main.');
  requireCondition(/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? '') && env.RELEASE_SHA === env.GITHUB_SHA,
    'Confirm the full SHA selected by this main dispatch.');
}

export function assertCheckout(sha, status, expected) {
  requireCondition(sha.trim() === expected && status === '', 'Checkout must be clean and match the selected SHA.');
}

export function assertDashboardConfiguration(root, env) {
  requireCondition(!['wrangler.json', 'wrangler.jsonc', 'wrangler.toml', '.wrangler/deploy/config.json']
    .some(name => existsSync(join(root, name))) && !env.CLOUDFLARE_API_BASE_URL && !env.CLOUDFLARE_API_ENVIRONMENT,
  'Production uses existing dashboard bindings; unexpected Wrangler configuration or API overrides require review.');
}

export function assertProductionProject(project, env) {
  requireCondition(uuid.test(project?.id ?? '') && project.name === env.CLOUDFLARE_PAGES_PROJECT &&
    project.production_branch === 'main' && !project.source,
  'Expected the existing main-only Direct Upload Pages project.');
  const production = project.deployment_configs?.production;
  requireCondition(uuid.test(env.PRODUCTION_APP_DATABASE_ID ?? '') &&
    production?.d1_databases?.DB?.id === env.PRODUCTION_APP_DATABASE_ID,
  'Production must bind DB to the existing application D1.');
  requireCondition(env.PRODUCTION_R2_BUCKET && production.r2_buckets?.RESUME_FILES?.name === env.PRODUCTION_R2_BUCKET,
  'Production must bind RESUME_FILES to the existing private R2 bucket.');
  // Issuer and audience identify the Access application; neither is a credential.
  // Cloudflare omits encrypted values, so only validate plaintext when available.
  for (const name of ['TEAM_DOMAIN', 'POLICY_AUD']) {
    const setting = production.env_vars?.[name];
    requireCondition(setting && ['plain_text', 'secret_text'].includes(setting.type),
      `Production Access configuration is missing ${name}.`);
    if (setting.type === 'plain_text') {
      const value = typeof setting.value === 'string' ? setting.value.trim() : '';
      requireCondition(name === 'TEAM_DOMAIN'
        ? /^https:\/\/[a-z0-9.-]+\.cloudflareaccess\.com$/i.test(value.replace(/\/$/, ''))
        : Boolean(value), `Production Access configuration has an invalid ${name}.`);
    }
  }
  requireCondition(!Object.hasOwn(production.env_vars, 'LOCAL_DEV_AUTH_EMAIL'),
    'Keep local authentication overrides out of production.');
  requireCondition(production.compatibility_date === '2026-09-22' && !production.compatibility_flags?.length,
    'Runtime compatibility changed; review before deploying.');
  const preview = project.deployment_configs?.preview;
  requireCondition(preview && !Object.keys(preview.d1_databases ?? {}).length &&
    !Object.keys(preview.r2_buckets ?? {}).length,
  'Previews are unused: remove their D1/R2 bindings; do not create preview resources.');
  const deploymentCredentials = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CF_API_TOKEN', 'CF_API_KEY',
    'ADMISSION_PAGES_API_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN', 'LOCAL_DEV_AUTH_EMAIL'];
  requireCondition(!deploymentCredentials.some(name => Object.hasOwn(preview.env_vars ?? {}, name)),
    'Keep deployment credentials and local authentication overrides out of unused previews.');
}

// Only GET requests: no SQL, migrations, uploads, restore, or storage changes.
export async function preflightRelease(env, { fetcher = fetch } = {}) {
  assertReleaseRequest(env);
  requireCondition([env.GITHUB_TOKEN, env.CLOUDFLARE_API_TOKEN].every(value => typeof value === 'string' && value.trim()),
    'Missing deployment credential.');
  requireCondition(/^[0-9a-f]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? '') &&
    /^[a-z0-9][a-z0-9-]*$/.test(env.CLOUDFLARE_PAGES_PROJECT ?? '') &&
    /^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? ''), 'Invalid account, project, or repository identifier.');
  async function get(url, token) {
    const response = await fetcher(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    requireCondition(response.ok, `Read-only deployment check unavailable (HTTP ${response.status}).`);
    const data = await response.json();
    requireCondition(data?.success !== false, 'Provider identity check failed.');
    return data;
  }
  const branch = await get(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/git/ref/heads/main`, env.GITHUB_TOKEN);
  requireCondition(branch.object?.sha === env.GITHUB_SHA, 'Main moved; select the current main SHA in a new dispatch.');
  const data = await get(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${env.CLOUDFLARE_PAGES_PROJECT}`,
    env.CLOUDFLARE_API_TOKEN);
  assertProductionProject(data.result, env);
  return { sha: env.GITHUB_SHA, project: data.result.name, databaseId: env.PRODUCTION_APP_DATABASE_ID, bucket: env.PRODUCTION_R2_BUCKET };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    assertDashboardConfiguration(root, process.env);
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
    const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
    requireCondition(head.status === 0 && status.status === 0, 'Checkout could not be verified.');
    assertCheckout(head.stdout, status.stdout, process.env.GITHUB_SHA);
    console.log(JSON.stringify(await preflightRelease(process.env), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
