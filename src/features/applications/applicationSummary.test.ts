import { describe, expect, it } from "vitest";
import { countApplicationSummary } from "./applicationSummary";

const active = [{ id: "active" }];
const archived = [{ id: "archived" }];
const children = [
  { applicationId: "active" },
  { applicationId: "archived" },
  { applicationId: "archived" },
];

describe("application summary scope", () => {
  it("counts active records and all their child records", () => {
    expect(countApplicationSummary(active, children, children)).toEqual({
      applications: 1,
      interviews: 1,
      assessments: 1,
    });
  });

  it("counts archived records in the archive view", () => {
    expect(countApplicationSummary(archived, children, children)).toEqual({
      applications: 1,
      interviews: 2,
      assessments: 2,
    });
  });

  it("includes active and archived child records in Total", () => {
    expect(
      countApplicationSummary([...active, ...archived], children, children),
    ).toEqual({ applications: 2, interviews: 3, assessments: 3 });
  });

  it("excludes child records outside the selected application scope", () => {
    expect(
      countApplicationSummary(
        active,
        [...children, { applicationId: "missing" }],
        [{ applicationId: "missing" }],
      ),
    ).toEqual({ applications: 1, interviews: 1, assessments: 0 });
  });

  it("returns empty counts and never changes the input records", () => {
    expect(countApplicationSummary([], children, children)).toEqual({
      applications: 0,
      interviews: 0,
      assessments: 0,
    });
    const all = [...active, ...archived];
    const before = structuredClone({ all, children });
    countApplicationSummary(all, children, children);
    countApplicationSummary(active, children, children);
    expect({ all, children }).toEqual(before);
  });
});
