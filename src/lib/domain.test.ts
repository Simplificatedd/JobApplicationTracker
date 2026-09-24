import { describe, expect, it } from "vitest";
import { DEFAULT_USER_SETTINGS } from "./domain";

describe("default user settings", () => {
  it("keeps application column resizing disabled until explicitly enabled", () => {
    expect(DEFAULT_USER_SETTINGS.enableDraggableColumnWidths).toBe(false);
  });
});
