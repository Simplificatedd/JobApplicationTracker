import type { CloudflareEnv } from "./types";
import { ADMIT_REQUEST_SQL, RETIRE_REQUEST_SQL, UNCERTAIN_REQUEST_SQL } from "./requestControl";

const unavailable = () => new Response(JSON.stringify({ error: "Cloud storage is paused or request admission could not be verified. Retry later." }), {
  status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": "60" },
});

// One lifetime per invocation, never a global/process-local active counter.
class StorageLifetime {
  private sealed = false;
  private uncertain = false;
  private pending = new Set<Promise<unknown>>();

  assertOpen() {
    if (this.sealed) throw new Error("This request's storage access has ended.");
  }
  track<T>(start: () => Promise<T>): Promise<T> {
    this.assertOpen();
    // Register synchronously before dispatch; capture synchronous binding errors.
    let resolve!: (value: T | PromiseLike<T>) => void, reject!: (reason: unknown) => void;
    const result = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    const settled = result.then(() => {}, () => { this.uncertain = true; });
    this.pending.add(settled);
    void settled.then(() => { this.pending.delete(settled); });
    try { resolve(start()); } catch (error) { reject(error); }
    return result;
  }
  register(promise: Promise<unknown>) {
    // Track rejections even when the handler catches them or the platform cancels.
    return this.track(() => promise);
  }
  fail() { this.uncertain = true; }
  async seal() {
    while (this.pending.size) await Promise.all([...this.pending]);
    // No await between the empty check and sealing: a late callback cannot race
    // receipt retirement to dispatch another D1/R2 call on this isolate.
    this.sealed = true;
    return !this.uncertain;
  }
  get hasPending() { return this.pending.size > 0; }
}

function guardDatabase(database: D1Database, lifetime: StorageLifetime): D1Database {
  function statement(value: D1PreparedStatement): D1PreparedStatement {
    return new Proxy(Object.create(null), { get: (_, key) => {
      if (key === "bind") return (...args: unknown[]) => { lifetime.assertOpen(); return statement(value.bind(...args)); };
      if (["first", "all", "run", "raw"].includes(String(key))) return (...args: unknown[]) =>
        lifetime.track(() => Reflect.apply(Reflect.get(value, key), value, args) as Promise<unknown>);
      throw new Error(`Unsupported guarded D1 statement API: ${String(key)}`);
    } });
  }
  return new Proxy(Object.create(null), { get: (_, key) => {
    if (key === "prepare") return (sql: string) => { lifetime.assertOpen(); return statement(database.prepare(sql)); };
    // Current application uses prepare/bind/first/all/run only. New APIs must be
    // reviewed and tracked, not accidentally forwarded around the barrier.
    throw new Error(`Unsupported guarded D1 database API: ${String(key)}`);
  } });
}
function guardBucket(bucket: R2Bucket, lifetime: StorageLifetime): R2Bucket {
  return new Proxy(Object.create(null), { get: (_, key) => {
    if (["get", "head", "put", "delete", "list"].includes(String(key))) return (...args: unknown[]) =>
      lifetime.track(() => Reflect.apply(Reflect.get(bucket, key), bucket, args) as Promise<unknown>);
    throw new Error(`Unsupported guarded R2 API: ${String(key)}`);
  } });
}

export function withRequestAdmission(handler: PagesFunction<CloudflareEnv>): PagesFunction<CloudflareEnv> {
  return async (context) => {
    const control = context.env.REQUEST_CONTROL_DB;
    const id = crypto.randomUUID();
    const deployment = context.env.REQUEST_CONTROL_DEPLOYMENT;
    // Required on every enrolled deployment, including aliases and previews.
    if (!control || typeof deployment !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(deployment)) return unavailable();
    try {
      const admitted = await control.prepare(ADMIT_REQUEST_SQL).bind(id, deployment, Date.now(), deployment).first();
      if (!admitted) return unavailable();
    } catch {
      // A lost admission acknowledgement may leave a receipt; never invoke work.
      console.error("request-control: admission unconfirmed", { id });
      return unavailable();
    }
    console.info("request-control: admitted", { id, deployment });
    const lifetime = new StorageLifetime();
    const env = { TEAM_DOMAIN: context.env.TEAM_DOMAIN, POLICY_AUD: context.env.POLICY_AUD,
      LOCAL_DEV_AUTH_EMAIL: context.env.LOCAL_DEV_AUTH_EMAIL, REQUEST_CONTROL_DB: undefined,
      REQUEST_CONTROL_DEPLOYMENT: deployment,
      DB: guardDatabase(context.env.DB, lifetime), RESUME_FILES: guardBucket(context.env.RESUME_FILES, lifetime) };
    const guarded = { request: context.request, params: context.params, data: context.data,
      functionPath: context.functionPath, env,
      waitUntil: (promise: Promise<unknown>) => {
        void lifetime.register(promise).catch(() => {});
      },
      next: () => { throw new Error("Untracked downstream API handlers are not supported."); },
      passThroughOnException: () => { throw new Error("Storage admission cannot fall through to an unguarded handler."); },
    } as unknown as Parameters<typeof handler>[0];
    async function finish() {
      const certain = await lifetime.seal();
      try {
        await control.prepare(certain ? RETIRE_REQUEST_SQL : UNCERTAIN_REQUEST_SQL).bind(id).run();
        if (!certain) console.error("request-control: unresolved storage outcome", { id });
      } catch {
        // Preserve acknowledged application success; a retained receipt blocks drain.
        console.error("request-control: completion unconfirmed", { id });
      }
    }
    let response: Response;
    try { response = await handler(guarded); }
    catch {
      lifetime.fail();
      response = new Response(JSON.stringify({ error: "The cloud storage service could not complete the request." }), {
        status: 500, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    if (lifetime.hasPending) {
      // Register the one supervisor with the real Pages context. If the platform
      // terminates it, the durable receipt remains and drain cannot be claimed.
      try { context.waitUntil(finish()); }
      catch { lifetime.fail(); console.error("request-control: background supervision unavailable", { id }); }
    } else await finish();
    return response;
  };
}
