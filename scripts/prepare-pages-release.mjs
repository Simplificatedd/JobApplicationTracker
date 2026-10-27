import { randomUUID, createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = fileURLToPath(new URL('../', import.meta.url));
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');

function artifactFiles(directory, prefix = '') {
  return readdirSync(join(directory, prefix)).sort().flatMap(name => {
    const relative = prefix ? `${prefix}/${name}` : name;
    const stat = lstatSync(join(directory, relative));
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error('Release artifacts must be regular files, never symbolic links.');
    return stat.isDirectory() ? artifactFiles(directory, relative) : [relative];
  });
}

export function verifyPreparedRelease(manifest, { output, sha, runId, runAttempt }) {
  const prefix = `gh-${runId}-${runAttempt}-`;
  const nonce = manifest?.label?.slice(prefix.length);
  if (manifest?.sha !== sha || manifest?.runId !== runId || manifest?.runAttempt !== runAttempt ||
      !manifest?.label?.startsWith(prefix) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(nonce ?? '')) {
    throw new Error('Prepared release does not match this source/run/attempt.');
  }
  const paths = artifactFiles(output).sort();
  if (!manifest.files || JSON.stringify(paths) !== JSON.stringify(Object.keys(manifest.files).sort()) ||
      !['index.html', '_routes.json', '_worker.js/index.js', '_worker.js/functions.js'].every(name => paths.includes(name)) ||
      paths.some(name => digest(join(output, name)) !== manifest.files[name])) {
    throw new Error('Release artifact contents changed or could not be verified.');
  }
  return manifest;
}

// Build only. No credentials, configuration upload, remote calls or deployment.
// The label is code in the uploaded Worker, not mutable project configuration.
export function preparePagesRelease({ root = repository, output = join(root, 'dist'), sha, runId, runAttempt }) {
  if (!/^[0-9a-f]{40}$/.test(sha ?? '') || !/^[1-9][0-9]{0,19}$/.test(runId ?? '') ||
      !/^[1-9][0-9]{0,7}$/.test(runAttempt ?? '')) throw new Error('Full source SHA, run ID and run attempt are required.');
  const worker = join(output, '_worker.js');
  if (!existsSync(join(output, 'index.html')) || existsSync(worker)) {
    throw new Error('Build fresh frontend assets first; never upload or reuse a prepared release twice.');
  }
  const label = `gh-${runId}-${runAttempt}-${randomUUID()}`;
  const built = spawnSync(join(root, 'node_modules/.bin/wrangler'), ['pages', 'functions', 'build', join(root, 'functions'),
    '--outdir', worker, '--project-directory', root, '--build-output-directory', output,
    '--output-routes-path', join(output, '_routes.json'), '--compatibility-date', '2026-09-22'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
  if (built.status !== 0) throw new Error(`Local Functions build failed: ${built.stderr || built.stdout}`);
  renameSync(join(worker, 'index.js'), join(worker, 'functions.js'));
  writeFileSync(join(worker, 'index.js'), `import functions from './functions.js';
const deployment = ${JSON.stringify(label)};
export default {
  async fetch(request, env, context) {
    const response = await functions.fetch(request, { ...env, REQUEST_CONTROL_DEPLOYMENT: deployment }, context);
    const headers = new Headers(response.headers);
    headers.set('X-Tracker-Deployment', deployment);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
`);
  const files = Object.fromEntries(artifactFiles(output).map(name => [name, digest(join(output, name))]));
  const manifest = { label, sha, runId, runAttempt, files };
  mkdirSync(join(root, '.wrangler'), { recursive: true });
  writeFileSync(join(root, '.wrangler/production-release.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const manifest = preparePagesRelease({ sha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT });
    if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `label=${manifest.label}\n`, { flag: 'a' });
    console.log(JSON.stringify(manifest, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
