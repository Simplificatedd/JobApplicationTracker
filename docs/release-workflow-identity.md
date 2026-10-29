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
The workflow gains no permissions and requests no OIDC token. Existing independent
environment review, exact run/SHA/attempt approval, clean checkout, immutable
artifact and admission-state requirements still apply. A reviewer-free
`production-admission` environment cannot satisfy preflight.

## Credential issuance remains blocked

These checks run inside the requesting job. A compromised workflow can omit them,
alter the script or access an injected bearer token directly. Environment variables
are assertions from the caller; even a successful GitHub metadata comparison here
does not independently enforce credential issuance. Historical workflow definitions
also do not acquire these checks retroactively. Moving a static secret into an
environment restricts branch/environment access but does not identify the workflow
path or prevent all historical and alternative workflows from requesting it.

Before issuing production credentials, establish an independently operated boundary
that verifies GitHub's signed OIDC token (signature/JWKS, issuer, exact audience,
expiry and replay protection), immutable repository/owner identity, workflow
path/ref/SHA, main ref, environment and exact run/attempt. It must separately verify
current main and independent release approval. Reusable workflow claims need their
own pinned identity policy if that architecture is introduced. See GitHub's
[OIDC reference](https://docs.github.com/en/actions/reference/security/oidc).

OIDC alone cannot make a compromised authorized workflow safe. An external upload
service would also need to retain the provider credential and independently bind
each approved operation to the reviewed artifact digest and exact provider resources;
returning an unrestricted bearer token to the job defeats that protection.
Direct Cloudflare acceptance of these GitHub claims and the necessary project-level
permission restrictions have not been verified. No broker or credential exchange
is implemented here. Credential issuance and production deployment remain NO-GO.

Run `npm run test:production-release` for accepted-context and rejection fixtures,
including historical refs, alternative paths, malformed metadata and substituted
caller values. These are local preflight tests, not evidence that an external
credential issuer enforces the policy.
