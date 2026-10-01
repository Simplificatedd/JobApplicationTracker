import { describe, expect, it } from "vitest";
import { APPLICATION_STATUSES, STATUS_TONE } from "./constants";

describe("STATUS_TONE", () => {
  it("assigns a distinct tone to every application status", () => {
    const tones = APPLICATION_STATUSES.map((status) => STATUS_TONE[status]);

    expect(new Set(tones).size).toBe(APPLICATION_STATUSES.length);
  });
});
