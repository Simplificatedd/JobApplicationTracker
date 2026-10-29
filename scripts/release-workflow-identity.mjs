// Defense in depth inside the release process; this is NOT credential issuance
// enforcement. A modified approved workflow could omit these checks entirely.
export const RELEASE_WORKFLOW = Object.freeze({
  repository: 'Simplificatedd/JobApplicationTracker', repositoryId: 1353415059,
  owner: 'Simplificatedd', ownerId: 110826519,
  path: '.github/workflows/production.yml', workflowId: 399529633,
  ref: 'refs/heads/main', environment: 'production-admission',
});
const requireIdentity = condition => {
  if (!condition) throw new Error('Release workflow identity is missing, mismatched or unverified.');
};
const decimalId = value => typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value));
const login = value => typeof value === 'string' && value.length > 0 && !/\s/.test(value);
const sameLogin = (left, right) => login(left) && login(right) && left.toLowerCase() === right.toLowerCase();

export function assertReleaseWorkflowContext(env) {
  requireIdentity(env?.GITHUB_REPOSITORY === RELEASE_WORKFLOW.repository &&
    env.GITHUB_REPOSITORY_ID === String(RELEASE_WORKFLOW.repositoryId) &&
    env.GITHUB_REPOSITORY_OWNER_ID === String(RELEASE_WORKFLOW.ownerId) &&
    env.GITHUB_WORKFLOW_REF === `${RELEASE_WORKFLOW.repository}/${RELEASE_WORKFLOW.path}@${RELEASE_WORKFLOW.ref}` &&
    /^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? '') && env.GITHUB_WORKFLOW_SHA === env.GITHUB_SHA &&
    env.GITHUB_REF === RELEASE_WORKFLOW.ref && env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
    decimalId(env.GITHUB_RUN_ID) && decimalId(env.GITHUB_RUN_ATTEMPT) &&
    login(env.GITHUB_ACTOR) && login(env.GITHUB_TRIGGERING_ACTOR));
}

export function assertReleaseWorkflowRun(env, run, workflow) {
  assertReleaseWorkflowContext(env);
  const repositoryMatches = repo => repo?.id === RELEASE_WORKFLOW.repositoryId &&
    repo.full_name === RELEASE_WORKFLOW.repository && repo.fork === false &&
    repo.owner?.id === RELEASE_WORKFLOW.ownerId && sameLogin(repo.owner.login, RELEASE_WORKFLOW.owner);
  // GitHub returns a plain path or a path with the workflow ref appended.
  // Only the exact reviewed path and main forms are accepted; no prefix match.
  const paths = [RELEASE_WORKFLOW.path, `${RELEASE_WORKFLOW.path}@main`,
    `${RELEASE_WORKFLOW.path}@${RELEASE_WORKFLOW.ref}`];
  requireIdentity(run?.id === Number(env.GITHUB_RUN_ID) && run.run_attempt === Number(env.GITHUB_RUN_ATTEMPT) &&
    run.workflow_id === RELEASE_WORKFLOW.workflowId && run.event === 'workflow_dispatch' &&
    run.head_branch === 'main' && run.head_sha === env.GITHUB_SHA && paths.includes(run.path) &&
    (run.referenced_workflows === undefined || (Array.isArray(run.referenced_workflows) && run.referenced_workflows.length === 0)) &&
    repositoryMatches(run.repository) && repositoryMatches(run.head_repository) &&
    sameLogin(run.actor?.login, env.GITHUB_ACTOR) && sameLogin(run.triggering_actor?.login, env.GITHUB_TRIGGERING_ACTOR) &&
    workflow?.id === RELEASE_WORKFLOW.workflowId && workflow.path === RELEASE_WORKFLOW.path && workflow.state === 'active');
}
