// Local Miniflare harness only. Not a Functions route or production entry point.
import type { CloudflareEnv } from "../../functions/lib/types";
import { onRequest } from "../../functions/api/[[path]]";
import { withRequestAdmission } from "../../functions/lib/requestAdmission";
import { reserveR2Operation } from "../../functions/lib/usageBudgets";

interface LocalEnv extends CloudflareEnv { HOLD: Fetcher; REPORT: Fetcher }
export default {
  async fetch(request: Request, env: LocalEnv, context: ExecutionContext) {
    const route = new URL(request.url).pathname;
    const pages = { request, env, waitUntil: context.waitUntil.bind(context), params: {}, data: {}, functionPath: "/local-test" } as unknown as Parameters<PagesFunction<CloudflareEnv>>[0];
    if (route.startsWith("/api/")) return onRequest(pages);
    return withRequestAdmission(async (guarded) => {
      if (route === "/normal") {
        await reserveR2Operation(guarded.env.DB, "write");
        await guarded.env.RESUME_FILES.put("normal", "%PDF-local");
        await reserveR2Operation(guarded.env.DB, "read");
        return new Response((await guarded.env.RESUME_FILES.get("normal"))!.body);
      }
      if (route === "/partial") {
        await guarded.env.RESUME_FILES.put("partial", "%PDF-before-D1-failure");
        await guarded.env.DB.prepare("INSERT INTO deliberately_missing_table VALUES (1)").run().catch(() => {});
        return new Response("handled failure");
      }
      const task = async () => {
        await env.HOLD.fetch("http://local-test.invalid/");
        await guarded.env.RESUME_FILES.put(route === "/late" ? "late" : "tracked", "%PDF-local");
        await guarded.env.DB.prepare("INSERT INTO test_effects VALUES (?)").bind(route).run();
      };
      if (route === "/background") guarded.waitUntil(task());
      else if (route === "/late") {
        // Keep a deliberately UNREGISTERED continuation alive to prove that
        // even a surviving late callback cannot use the sealed storage binding.
        context.waitUntil(task().then(
          () => env.REPORT.fetch("http://local-test.invalid/unexpected"),
          (error) => env.REPORT.fetch("http://local-test.invalid/blocked", { method: "POST", body: String(error) }),
        ));
      } else await task();
      return new Response("acknowledged");
    })(pages);
  },
};
