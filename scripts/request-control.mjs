import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONTROL_STATUS_SQL, controlTransition, describeControlStatus } from '../functions/lib/requestControl.ts';

// Run with Node 22 --experimental-strip-types. No shell, public admin API or
// browser-controlled authorization. Wrangler supplies the operator's D1 identity.
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    config: { type: 'string' }, local: { type: 'boolean' }, remote: { type: 'boolean' },
    'allow-remote-control': { type: 'boolean' }, 'persist-to': { type: 'string' },
    expect: { type: 'string' }, confirm: { type: 'string' }, evidence: { type: 'string' }, deployment: { type: 'string' },
  } });
  const [action] = positionals;
  if (positionals.length !== 1 || !['status', 'close', 'reopen', 'attest-coverage', 'select-deployment', 'revoke-coverage'].includes(action) ||
    !values.config || Boolean(values.local) === Boolean(values.remote) ||
    (values.remote && !values['allow-remote-control']) || (values['persist-to'] && !values.local)) {
    throw new Error('Specify status|close|reopen|attest-coverage|select-deployment|revoke-coverage, --config, and exactly one of --local or --remote --allow-remote-control.');
  }
  function query(sql) {
    const args = ['d1', 'execute', 'REQUEST_CONTROL_DB', '--config', values.config,
      values.local ? '--local' : '--remote', '--command', sql, '--json'];
    if (values['persist-to']) args.push('--persist-to', values['persist-to']);
    const result = spawnSync(fileURLToPath(new URL('../node_modules/.bin/wrangler', import.meta.url)), args, { encoding: 'utf8' });
    if (result.status !== 0) throw new Error('Control query failed or outcome is unconfirmed. Inspect status; do not blindly repeat a transition.');
    const output = JSON.parse(result.stdout);
    if (!Array.isArray(output) || output.length !== 1 || output[0].success !== true || !Array.isArray(output[0].results)) {
      throw new Error('Control response could not be verified. Drain is UNKNOWN.');
    }
    return output[0].results;
  }
  if (action !== 'status') {
    if (!values.expect || !/^(0|[1-9][0-9]*)$/.test(values.expect) || values.confirm !== `${action.toUpperCase()}:${values.expect}`) {
      throw new Error('Explicit confirmation requires --expect REVISION and --confirm ACTION:REVISION (for example REOPEN:3).');
    }
    let digest;
    if (action === 'attest-coverage') {
      if (!values.evidence) throw new Error('Coverage attestation requires a private evidence JSON file.');
      const bytes = readFileSync(values.evidence);
      const evidence = JSON.parse(bytes.toString('utf8'));
      if (!evidence || typeof evidence !== 'object' || evidence.statement !== 'ALL_PRE_INSTRUMENTATION_OPERATIONS_AND_INGRESS_ACCOUNTED_FOR' ||
        typeof evidence.approvedBy !== 'string' || !evidence.approvedBy.trim() ||
        !Array.isArray(evidence.references) || evidence.references.length === 0 ||
        !evidence.references.every((ref) => typeof ref === 'string' && ref.trim())) {
        throw new Error('Coverage evidence must name an approver and nonempty external evidence references. This is an operator attestation, not automatic drain proof.');
      }
      digest = createHash('sha256').update(bytes).digest('hex');
    }
    const changed = query(controlTransition(action, Number(values.expect), action === 'select-deployment' ? values.deployment : digest));
    if (changed.length !== 1) throw new Error('Transition refused: stale revision, wrong mode, unverified coverage, reused deployment label or outstanding receipts. Inspect status.');
  }
  const status = describeControlStatus(query(CONTROL_STATUS_SQL)[0] ?? null);
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Request control failed; drain is UNKNOWN.'}\n`);
  process.exitCode = 1;
}
