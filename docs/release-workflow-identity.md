# Production workflow identity checks

`scripts/release-workflow-identity.mjs` restricts the existing production preflight
to `Simplificatedd/JobApplicationTracker` (repository ID `1353415059`, owner ID
`110826519`) and `.github/workflows/production.yml` (workflow ID `399529633`).
These are public identity metadata, not credentials. A repository transfer,
rename or workflow recreation requires an explicit policy review and tests.

The context must identify a manual dispatch from `refs/heads/main`, with the
workflow source SHA equal to the dispatched SHA. Before any Cloudflare request,
preflight reads GitHub's current main ref, the exact run attempt and the workflow
definition. It compares the repository/owner IDs, non-fork source repository,
workflow ID/path, event, branch, SHA, run/attempt and original/triggering actors.
Only the exact workflow path, optionally suffixed with `@main` or
`@refs/heads/main`, is accepted. Unexpected reusable workflow references are refused.
Missing, inconsistent or unreadable identity evidence stops the release.

These reads use the existing `contents: read` and `actions: read` permissions.
The workflow requests no OIDC token. The solo-maintainer model requires explicit
manual dispatch and exact SHA confirmation, without an independent reviewer or
approval-history lookup. The environment must match ID `25704782492`, disallow
administrator bypass and have only an explicit main branch rule. Clean checkout,
immutable artifact, resource identity and closed/drained state checks remain.

## Credential placement and limits

These checks run inside the requesting job. A compromised workflow can omit them,
alter the script or access an injected bearer token directly. Environment variables
are assertions from the caller; even a successful GitHub metadata comparison here
does not independently enforce credential issuance. Historical workflow definitions
also do not acquire these checks retroactively. Moving a static secret into an
environment restricts branch/environment access but does not identify the workflow
path or prevent all historical and alternative workflows from requesting it.

Use the two reserved ADMISSION secret names only in `production-admission`, never
repository scope. Ordinary CI/preview jobs have no environment or production secret
reference. Preflight refuses absent credentials before any network call; it cannot
prove which GitHub scope supplied a present token. The maintainer and trusted main
code remain trusted, and historical/direct access needs separate credential
retirement. This residual risk is accepted for the project; no additional service
is required. Follow the [solo deployment guide](solo-production-deployment.md).

Run `npm run test:production-release` for accepted-context and rejection fixtures,
including historical refs, alternative paths, malformed metadata and substituted
caller values. These are local preflight tests, not proof of provider isolation
from compromised trusted code.
