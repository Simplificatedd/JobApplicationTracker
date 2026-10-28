/// <reference types="node" />
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../../scripts/request-control.mjs", import.meta.url));
describe("operator CLI safety boundary", () => {
  it.each([
    [[], "Specify"],
    [["status", "--config", "unused", "--remote"], "Specify"],
    [["status", "--config", "unused", "--local", "--remote"], "Specify"],
    [["force-drain", "--config", "unused", "--local"], "Specify"],
    [["reopen", "--config", "unused", "--local", "--expect", "1"], "confirmation"],
    [["close", "--config", "unused", "--local", "--expect", "1", "--confirm", "CLOSE:0"], "confirmation"],
    [["attest-coverage", "--config", "unused", "--local", "--expect", "0", "--confirm", "ATTEST-COVERAGE:0"], "evidence"],
  ])("rejects invalid or unconfirmed operator invocation before launching Wrangler (%j)", (args, message) => {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", script, ...args], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    // These inputs fail validation without reaching any local/remote database.
    expect(result.stderr.toLowerCase()).toContain(message.toLowerCase());
    expect(result.stderr).not.toContain("Control query failed");
  });
});
