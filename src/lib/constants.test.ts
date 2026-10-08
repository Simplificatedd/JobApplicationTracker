import { describe, expect, it } from "vitest";
import {
  APPLICATION_STATUSES,
  getInterviewTypeLabel,
  STATUS_TONE,
} from "./constants";

describe("STATUS_TONE", () => {
  it("assigns a distinct tone to every application status", () => {
    const tones = APPLICATION_STATUSES.map((status) => STATUS_TONE[status]);

    expect(new Set(tones).size).toBe(APPLICATION_STATUSES.length);
  });
});

describe("getInterviewTypeLabel", () => {
  it("uses concise contextual labels for canonical stage types", () => {
    expect(getInterviewTypeLabel("technical-interview")).toBe("Technical");
    expect(getInterviewTypeLabel("hiring-manager-interview")).toBe(
      "Hiring manager",
    );
  });

  it("keeps legacy stage values readable during migration", () => {
    expect(getInterviewTypeLabel("face-to-face")).toBe("In-person");
    // Provider-only legacy types are ambiguous and must not be relabelled as assessments.
    expect(getInterviewTypeLabel("HackerRank")).toBe("HackerRank");
  });
});
