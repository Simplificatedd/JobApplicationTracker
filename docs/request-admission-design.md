# Request admission and drain prerequisite

## Decision before implementation

The invariant is: after admission is closed and status reports drained, no enrolled
request can still start or complete a conflicting D1/R2 operation. This includes
requests admitted just before closure, registered background work, and requests
with lost storage acknowledgements. A response, timeout, expired lease, client
cancellation or empty process-local counter is not sufficient evidence.

| Candidate | Admission | Drain / limitation | Decision |
| --- | --- | --- | --- |
| Access restriction and token revocation | Can deny new requests at covered ingress | Cannot account for already executing work or uncovered deployment URLs | Bootstrap/defence in depth, not a drain oracle |
| Durable maintenance flag | Shared state can reject new requests | A request can pass the check before closure and mutate afterward | Insufficient alone |
| D1 atomic admission and durable request ledger | INSERT ... SELECT and close serialize on one primary | Non-expiring rows retain crashes/unknown outcomes; request-local storage sealing prevents late calls after retirement | Selected, with a separate control database |
| Durable Object coordinator | Durable serialized admission possible | Still needs persistent receipts and ambiguous R2 handling after crashes; adds a separate Worker deployment/binding | Unnecessary for this application |
| Route to a maintenance deployment / block frontend | Can redirect new traffic | Old invocations and immutable deployment URLs can remain active | Insufficient alone |

One additional D1 database/binding is the smallest supported independent control
plane. It keeps admission/status/completion writes away from the application D1
being migrated. No new queue, scheduler, public administration route or dashboard
is needed. Operator controls use the existing Wrangler/D1 account authorization.
This is implementable against merged main; it does not depend on document
lifecycle records or application migration 0003.

## Safety argument

1. Before invoking any API handler, atomically insert a random receipt only if
   the shared gate is open, its selected deployment label matches, the schema/protocol matches and bootstrap coverage has
   been attested. Closure and insertion execute on the same D1 primary. Either
   admission wins and its row exists, or closure wins and the handler cannot run.
2. Invoke the handler with guarded application DB/R2 bindings. Track every issued
   asynchronous binding call before dispatch and all context.waitUntil promises.
   Reject unsupported binding APIs rather than exposing an unguarded reference.
3. After the handler, background promises and outstanding storage calls finish,
   synchronously seal those bindings. Future delayed callbacks cannot dispatch
   storage calls. Only then retire the receipt if all tracked work was certain.
4. Any binding rejection/uncertain outcome, handler/background exception, crash,
   termination retains an active/uncertain receipt. A failed control retirement
   can leave a receipt or already have committed after sealing; both are safe.
   There are no leases, expiry, force-drain, automatic resets or timeout cleanup.
   Lack of progress is reported as not drained, not converted into certainty.
5. A single primary status query reports drained only for a closed gate with
   attested ingress/version coverage and no receipts. Uncertain receipts count.
   Operator changes use an expected revision; reopening additionally requires an
   explicit confirmation and the same zero-receipt/coverage condition atomically.
   Selecting a distinct release label also requires closure/zero receipts. A durable
   selection history prevents selecting any previously used label again, so a
   delayed admission from an old deployment stays fenced in later cycles too.

Successful read-only response streaming may continue after sealing: its already
settled D1 usage increment and R2 GET cannot issue a new storage mutation. Any
stream callback attempting a later binding call is rejected by the seal. Long
uploads and delayed download counters retain their receipt while the handler or
storage call remains pending. Detached delayed work cannot start storage after
sealing; work that must finish must use the guarded context.waitUntil.

All API paths/methods are enrolled, including session/state reads and unknown
routes. This conservative scope automatically covers #166's cleanup route and
startup/restore sequences. Static assets remain available. Account, origin,
mutation protocol, conflict, snapshot-size and cache/backup semantics are retained.
There are no scheduled/queued/storage-writing background handlers in this repo.
Future handlers/bindings must join this boundary or remain forbidden.

## Bootstrap and scope limits

No code installed now can retroactively track pre-prerequisite invocations.
The initial control state is closed with coverage unverified, and can never report
unqualified drain until an authorized operator records an external coverage/drain
evidence digest. This is an explicit attestation, not a technical proof of old
request termination. Access/provider evidence must cover every old production,
custom, pages.dev and immutable deployment ingress, direct writer and previously
admitted storage operation. A fresh ledger, deployment age or quiet metrics graph
is not proof. If that evidence is unavailable, bootstrap remains NO-GO.

Once all possible writers are enrolled and share this control database, the
ledger/seal argument establishes drain for maintenance cycles without fixed waits.
It cannot protect an intentionally uninstrumented deployment, privileged direct
D1/R2 edits, a replaced/restored control database, bindings obtained outside the
wrapper, or a dishonest coverage attestation. These are explicit deployment and
operator trust preconditions, not claims of global platform instrumentation.

A crash or ambiguous storage failure can block maintenance indefinitely. The
operator gets anonymous receipt IDs/version/timestamps/state, never account IDs,
keys or bodies. No built-in command clears unresolved receipts. Recovery needs
provider/operation-specific evidence and a separately reviewed repair; creating a
new database or deleting rows to make status green is prohibited.

## Platform basis

- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): HTTP
  requests have no fixed duration while connected; background lifetime is bounded.
- [Pages context](https://developers.cloudflare.com/pages/functions/api-reference/)
  and [waitUntil](https://developers.cloudflare.com/workers/runtime-apis/context/):
  background tasks can outlive the response; termination must retain uncertainty.
- [D1 consistency](https://developers.cloudflare.com/d1/best-practices/read-replication/):
  without Sessions API queries go to the primary. Control queries deliberately do
  not opt into replicas; status is one statement, not separately cached counts.
- [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/):
  statements/batches are serialized transactionally; admission uses one statement.
- [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/):
  acknowledged writes are consistent; this does not create a D1/R2 transaction.
- [Durable Object gates](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/):
  R2 awaits permit interleaving and in-memory state can be lost; a DO alone does
  not remove the need for durable uncertainty tracking.
- [Access sessions](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/):
  policy restriction must also account for existing application tokens.

The original baseline example had DB/RESUME_FILES only; merged #167 added the
separate control binding example and its P2 schema/history validation. #170
removed automatic uploads from current CI. Merged #168, including #171's approval
correction, supplies the [manual release safeguards](request-admission-release-safeguards.md)
and compiles a unique label into each production release. A historical CI rerun
still retains its old uploader; removing current automatic deployment does not
retire those credentials.

The 2026-10-28 read-only audit confirmed production still serves older source
`1d1382b`, without the control database/binding. The new protected environment is
also absent. These source merges performed no production rollout; deployment,
bootstrap, reopening, safe drain and #166 remain NO-GO.
Independent deployment requires separate resource/schema/binding and traffic-impact
preflight, and leaves admission closed/unverified. Old-work coverage proof and
approved reopening are later operational gates, not inferred from that deployment.

Implementation and operator commands: [Operations](request-admission-operations.md).
Main-based commit series: [Commit plan](request-admission-commit-plan.md).
