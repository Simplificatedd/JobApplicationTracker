import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequestControl } from "../../src/test/requestControl";
import type { CloudflareEnv } from "./types";
import { withRequestAdmission } from "./requestAdmission";
import { ADMIT_REQUEST_SQL, CONTROL_STATUS_SQL, controlTransition, describeControlStatus } from "./requestControl";
import { onRequest } from "../api/[[path]]";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
function fixture(handler: PagesFunction<CloudflareEnv>, options: { open?: boolean; control?: ReturnType<typeof createRequestControl>; deployment?: string } = {}) {
  const control = options.control ?? createRequestControl(options.open ?? true);
  const app = createRequestControl();
  app.sqlite.exec("CREATE TABLE effects(value TEXT)");
  const put = vi.fn(async () => ({ key: "file" }));
  const remove = vi.fn(async () => {});
  const env = { REQUEST_CONTROL_DB: control.database, REQUEST_CONTROL_DEPLOYMENT: options.deployment ?? "version-a",
    DB: app.database, RESUME_FILES: { put, delete: remove }, LOCAL_DEV_AUTH_EMAIL: "student@example.edu",
  } as unknown as CloudflareEnv;
  const background: Promise<unknown>[] = [];
  const context = { request: new Request("http://127.0.0.1:8788/api/state"), env,
    waitUntil: (promise: Promise<unknown>) => { background.push(promise); },
  } as unknown as Parameters<PagesFunction<CloudflareEnv>>[0];
  const wrapped = withRequestAdmission(handler);
  const status = () => describeControlStatus(control.sqlite.prepare(CONTROL_STATUS_SQL).get() as never);
  const close = () => control.sqlite.prepare(controlTransition("close", status().revision)).get();
  return { control, app, env, context, background, put, remove, call: () => wrapped(context), status, close };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
afterEach(() => vi.restoreAllMocks());

describe("guarded request lifetimes", () => {
  it("preserves normal storage behavior and retires only after acknowledged work", async () => {
    const f = fixture(async ({ env }) => {
      await env.DB.prepare("INSERT INTO effects VALUES (?)").bind("saved").run();
      await env.RESUME_FILES.put("owner/file", "bytes");
      return new Response("saved");
    });
    expect((await f.call()).status).toBe(200);
    expect(f.app.sqlite.prepare("SELECT * FROM effects").all()).toEqual([{ value: "saved" }]);
    expect(f.put).toHaveBeenCalledOnce();
    f.close(); expect(f.status().drained).toBe(true);
  });
  it("adds only admission and completion calls to the invocation request budget", async () => {
    const f = fixture(async ({ env }) => {
      for (let n = 0; n < 47; n++) await env.DB.prepare("SELECT 1").first();
      return new Response();
    });
    let calls = 0;
    f.app.setBeforeQuery(() => { calls++; });
    f.control.setBeforeQuery(() => { calls++; });
    await f.call(); expect(calls).toBe(49);
  });
  it.each(["DB", "RESUME_FILES"])("cannot pass admission before close then mutate %s after false drain", async (binding) => {
    const entered = deferred(), proceed = deferred();
    const f = fixture(async ({ env }) => {
      entered.resolve(); await proceed.promise;
      if (binding === "DB") await env.DB.prepare("INSERT INTO effects VALUES ('late')").run();
      else await env.RESUME_FILES.delete("owner/file");
      return new Response("done");
    });
    const request = f.call(); await entered.promise; f.close();
    expect(f.status()).toMatchObject({ outstanding: 1, drained: false });
    expect((await f.call()).status).toBe(503);
    proceed.resolve(); await request;
    expect(f.status().drained).toBe(true);
    expect(binding === "DB" ? f.app.sqlite.prepare("SELECT COUNT(*) AS n FROM effects").get()?.n : f.remove.mock.calls.length).toBe(1);
  });
  it.each(["DB", "RESUME_FILES"])("retains an admission committed before close while its acknowledgement is delayed (%s)", async (binding) => {
    const inserted = deferred(), acknowledge = deferred();
    const handler = vi.fn<PagesFunction<CloudflareEnv>>(async ({ env }) => {
      if (binding === "DB") await env.DB.prepare("INSERT INTO effects VALUES ('admitted')").run();
      else await env.RESUME_FILES.put("file", "bytes");
      return new Response("done");
    });
    const f = fixture(handler);
    const prepare = f.control.database.prepare.bind(f.control.database);
    vi.spyOn(f.control.database, "prepare").mockImplementation((sql) => {
      const statement = prepare(sql);
      if (sql === ADMIT_REQUEST_SQL) {
        const first = statement.first.bind(statement);
        statement.first = async () => { const row = await first(); inserted.resolve(); await acknowledge.promise; return row; };
      }
      return statement;
    });
    const request = f.call(); await inserted.promise; f.close();
    expect(handler).not.toHaveBeenCalled();
    expect(f.status()).toMatchObject({ outstanding: 1, drained: false });
    acknowledge.resolve(); expect(await (await request).text()).toBe("done");
    expect(handler).toHaveBeenCalledOnce(); expect(f.status().drained).toBe(true);
  });
  it("coordinates independent handlers/versions through the same durable database", async () => {
    const entered = deferred(), proceed = deferred();
    const a = fixture(async ({ env }) => { entered.resolve(); await proceed.promise; await env.RESUME_FILES.put("file", "bytes"); return new Response(); });
    const b = fixture(async () => new Response(), { control: a.control, deployment: "version-b" });
    const pending = a.call(); await entered.promise; b.close();
    expect((await b.call()).status).toBe(503);
    expect(b.status().drained).toBe(false);
    expect(a.control.sqlite.prepare("SELECT deployment FROM request_receipts").get()?.deployment).toBe("version-a");
    proceed.resolve(); await pending; expect(b.status().drained).toBe(true);
    expect(a.control.sqlite.prepare(controlTransition("select-deployment", 1, "version-b")).get()).toEqual({ revision: 2 });
    expect(a.control.sqlite.prepare(controlTransition("reopen", 2)).get()).toEqual({ revision: 3 });
    expect((await a.call()).status).toBe(503); // Old immutable deployment stays fenced.
    expect((await b.call()).status).toBe(200);
    expect(a.control.sqlite.prepare(ADMIT_REQUEST_SQL).get("delayed-old-admission", "version-a", 0, "version-a")).toBeUndefined();
  });
  it("tracks registered background work after the HTTP response without waiting to return it", async () => {
    const proceed = deferred();
    const f = fixture(async (context) => {
      context.waitUntil(proceed.promise.then(async () => { await context.env.RESUME_FILES.put("file", "bytes"); }));
      return new Response("cloud save acknowledged");
    });
    expect(await (await f.call()).text()).toBe("cloud save acknowledged"); f.close();
    expect(f.status().drained).toBe(false);
    proceed.resolve(); await Promise.all(f.background);
    expect(f.put).toHaveBeenCalledOnce(); expect(f.status().drained).toBe(true);
  });
  it("tracks already-dispatched unawaited storage calls", async () => {
    const putFinished = deferred<{ key: string }>();
    const f = fixture(async ({ env }) => { void env.RESUME_FILES.put("file", "bytes"); return new Response(); });
    f.put.mockImplementation(() => putFinished.promise);
    await f.call(); f.close(); expect(f.status().drained).toBe(false);
    putFinished.resolve({ key: "file" }); await Promise.all(f.background);
    expect(f.status().drained).toBe(true);
  });
  it("never reports drain when the platform rejects background supervision", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const finished = deferred<{ key: string }>();
    const f = fixture(async ({ env }) => { void env.RESUME_FILES.put("file", "bytes"); return new Response("saved"); });
    f.put.mockImplementation(() => finished.promise);
    f.context.waitUntil = () => { throw new Error("Invocation ending"); };
    expect(await (await f.call()).text()).toBe("saved"); f.close();
    expect(f.status().drained).toBe(false);
    finished.resolve({ key: "file" }); await flush();
    expect(f.status()).toMatchObject({ uncertain: 1, drained: false });
  });
  it("continues tracking nested background work registered after the response", async () => {
    const first = deferred(), second = deferred();
    const f = fixture(async (context) => {
      context.waitUntil(first.promise.then(() => {
        context.waitUntil(second.promise.then(async () => { await context.env.RESUME_FILES.delete("file"); }));
      }));
      return new Response();
    });
    await f.call(); f.close(); first.resolve(); await flush();
    expect(f.status().drained).toBe(false);
    second.resolve(); await Promise.all(f.background);
    expect(f.remove).toHaveBeenCalledOnce(); expect(f.status().drained).toBe(true);
  });
  it("seals captured statements and bindings before retirement, rejecting detached late callbacks", async () => {
    const later = deferred(); let callback!: Promise<unknown>;
    const f = fixture(async ({ env }) => {
      const statement = env.DB.prepare("INSERT INTO effects VALUES ('too late')");
      callback = later.promise.then(() => statement.run());
      return new Response();
    });
    await f.call(); f.close(); expect(f.status().drained).toBe(true);
    const rejected = expect(callback).rejects.toThrow("storage access has ended");
    later.resolve(); await rejected;
    expect(f.app.sqlite.prepare("SELECT COUNT(*) AS n FROM effects").get()?.n).toBe(0);
  });
  it("holds a slow download's usage-counter mutation, while settled read-only response streaming may continue", async () => {
    const proceed = deferred(); let stream!: ReadableStreamDefaultController<Uint8Array>;
    const f = fixture(async ({ env }) => {
      await proceed.promise;
      await env.DB.prepare("INSERT INTO effects VALUES ('read counter')").run();
      return new Response(new ReadableStream({ start(controller) { stream = controller; } }));
    });
    const pending = f.call(); await flush(); f.close(); expect(f.status().drained).toBe(false);
    proceed.resolve(); const response = await pending; expect(f.status().drained).toBe(true);
    stream.enqueue(new TextEncoder().encode("read-only bytes")); stream.close();
    expect(await response.text()).toBe("read-only bytes");
  });
  it("retains uncertainty when a rejected R2 operation can still complete remotely", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const remote = deferred(); let bytesStored = false;
    const remoteWork = remote.promise.then(() => { bytesStored = true; });
    const f = fixture(async ({ env }) => { await env.RESUME_FILES.put("file", "bytes").catch(() => {}); return new Response("acknowledged elsewhere"); });
    f.put.mockRejectedValue(new Error("Lost acknowledgement"));
    await f.call(); f.close();
    expect(f.status()).toMatchObject({ outstanding: 1, uncertain: 1, drained: false });
    remote.resolve(); await remoteWork; expect(bytesStored).toBe(true);
    expect(f.status().drained).toBe(false);
    expect(f.control.sqlite.prepare(controlTransition("reopen", 1)).get()).toBeUndefined();
  });
  it("retains caught D1 failures and background rejections", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fixture(async (context) => {
      await context.env.DB.prepare("INSERT INTO missing_table VALUES (1)").run().catch(() => {});
      context.waitUntil(Promise.reject(new Error("background interrupted")));
      return new Response();
    });
    await f.call(); await Promise.all(f.background); f.close();
    expect(f.status()).toMatchObject({ uncertain: 1, drained: false });
  });
  it("retains a handler exception without exposing its private details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fixture(async () => { throw new Error("private account/key details"); });
    const response = await f.call(); expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private"); f.close(); expect(f.status().drained).toBe(false);
  });
  it("does not turn acknowledged storage success into failure when receipt retirement fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fixture(async () => new Response("saved"));
    f.control.setBeforeQuery((sql) => { if (sql.startsWith("DELETE")) throw new Error("Control unavailable"); });
    expect(await (await f.call()).text()).toBe("saved");
    f.control.setBeforeQuery(); f.close(); expect(f.status()).toMatchObject({ outstanding: 1, drained: false });
  });
  it("does not execute a handler after an ambiguous admission acknowledgement", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = vi.fn(async () => new Response()); const f = fixture(handler);
    const original = f.control.database.prepare.bind(f.control.database);
    vi.spyOn(f.control.database, "prepare").mockImplementation((sql) => {
      const statement = original(sql);
      if (sql === ADMIT_REQUEST_SQL) {
        const first = statement.first.bind(statement);
        statement.first = async () => { await first(); throw new Error("Lost admission response"); };
      }
      return statement;
    });
    expect((await f.call()).status).toBe(503); expect(handler).not.toHaveBeenCalled();
    expect(f.status().outstanding).toBe(1);
  });
  it("can drain after a retirement committed but its acknowledgement was lost", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fixture(async ({ env }) => { await env.RESUME_FILES.put("file", "bytes"); return new Response("saved"); });
    const prepare = f.control.database.prepare.bind(f.control.database);
    vi.spyOn(f.control.database, "prepare").mockImplementation((sql) => {
      const statement = prepare(sql);
      if (sql.startsWith("DELETE")) {
        const run = statement.run.bind(statement);
        statement.run = async () => { await run(); throw new Error("Lost retirement acknowledgement"); };
      }
      return statement;
    });
    expect(await (await f.call()).text()).toBe("saved");
    f.close(); expect(f.status().drained).toBe(true);
  });
  it("retains uncertainty from synchronous binding throws even when caught", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fixture(async ({ env }) => { await env.RESUME_FILES.put("file", "bytes").catch(() => {}); return new Response(); });
    f.put.mockImplementation(() => { throw new Error("Binding interrupted during dispatch"); });
    expect((await f.call()).status).toBe(200); f.close();
    expect(f.status()).toMatchObject({ uncertain: 1, drained: false });
  });
  it("cannot escape guarded storage through additional bindings or downstream handlers", async () => {
    const f = fixture(async (context) => {
      expect((context.env as unknown as Record<string, unknown>).OTHER_DB).toBeUndefined();
      expect(() => context.next()).toThrow("Untracked downstream");
      expect(() => context.passThroughOnException()).toThrow("cannot fall through");
      return new Response();
    });
    Object.assign(f.env, { OTHER_DB: f.app.database });
    await f.call(); f.close(); expect(f.status().drained).toBe(true);
  });
  it("rejects missing control configuration instead of silently bypassing the barrier", async () => {
    const handler = vi.fn(async () => new Response()); const f = fixture(handler);
    delete (f.env as Partial<CloudflareEnv>).REQUEST_CONTROL_DB;
    expect((await f.call()).status).toBe(503); expect(handler).not.toHaveBeenCalled();
  });
  it("rejects an unmigrated or damaged control database before invoking application work", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = vi.fn(async () => new Response()); const f = fixture(handler);
    f.control.sqlite.exec("DROP TABLE request_receipts");
    expect((await f.call()).status).toBe(503);
    expect(handler).not.toHaveBeenCalled(); expect(f.put).not.toHaveBeenCalled();
  });
  it("rejects unsupported storage APIs and does not expose the raw control binding", async () => {
    const exec = vi.fn();
    const f = fixture(async ({ env }) => {
      expect(env.REQUEST_CONTROL_DB).toBeUndefined();
      expect(() => env.DB.exec("DELETE FROM effects")).toThrow("Unsupported");
      expect(() => env.RESUME_FILES.createMultipartUpload("key")).toThrow("Unsupported");
      return new Response();
    });
    f.env.DB.exec = exec;
    await f.call(); expect(exec).not.toHaveBeenCalled();
  });
});

describe("production API admission boundary", () => {
  it("does not expose operator controls to an authenticated browser or accept bypass headers", async () => {
    const f = fixture(async () => new Response());
    f.context.request = new Request("http://127.0.0.1:8788/api/maintenance/close", {
      method: "POST", headers: { Origin: "http://127.0.0.1:8788", "X-Maintenance-Operator": "true" },
    } as RequestInit) as typeof f.context.request;
    expect((await onRequest(f.context)).status).toBe(404);
    expect(f.status()).toMatchObject({ mode: "open", revision: 0, outstanding: 0 });
  });
  it.each([["state", "PUT"], ["resume-files/file", "PUT"], ["resume-files/file", "DELETE"],
    ["resume-files/file", "GET"], ["document-cleanup", "POST"], ["session", "GET"], ["maintenance/reopen", "POST"]])(
    "blocks %s %s before application storage, regardless of method/account/bypass headers", async (route, method) => {
      const f = fixture(async () => new Response()); f.close();
      f.context.request = new Request(`http://127.0.0.1:8788/api/${route}`, { method,
        headers: { "X-Tracker-Account-Id": "local:student@example.edu", "X-Tracker-Mutation-Protocol": "1", "X-Maintenance-Bypass": "true", Origin: "http://127.0.0.1:8788" },
      }) as typeof f.context.request;
      const prepare = vi.spyOn(f.app.database, "prepare");
      const response = await onRequest(f.context);
      expect(response.status).toBe(503); expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(prepare).not.toHaveBeenCalled(); expect(f.put).not.toHaveBeenCalled(); expect(f.remove).not.toHaveBeenCalled();
    },
  );
});
