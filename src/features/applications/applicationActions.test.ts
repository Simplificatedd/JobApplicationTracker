import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canDeleteApplication,
  confirmApplicationDelete,
} from "./applicationActions";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("canDeleteApplication", () => {
  it("always allows deleting archived applications", () => {
    expect(canDeleteApplication({ archivedAt: "2026-10-01" }, false)).toBe(true);
  });

  it("allows deleting active applications only when enabled", () => {
    expect(canDeleteApplication({}, false)).toBe(false);
    expect(canDeleteApplication({}, true)).toBe(true);
  });
});

describe("confirmApplicationDelete", () => {
  it("asks before permanently deleting and returns the answer", () => {
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("window", { confirm });

    expect(confirmApplicationDelete({ jobTitle: "Data Intern" })).toBe(false);
    expect(confirm).toHaveBeenCalledWith(
      'Delete "Data Intern" permanently? This also removes linked contacts, interviews, and activity.',
    );
  });
});
