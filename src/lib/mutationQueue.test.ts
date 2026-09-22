import { describe, expect, it } from "vitest";
import { createMutationQueue } from "./mutationQueue";

describe("createMutationQueue", () => {
  it("serializes read-modify-write operations against the latest value", async () => {
    const queue = createMutationQueue();
    let persisted = { first: false, second: false };

    const first = queue.run(async () => {
      const current = persisted;
      await Promise.resolve();
      persisted = { ...current, first: true };
    });
    const second = queue.run(async () => {
      const current = persisted;
      persisted = { ...current, second: true };
    });

    await Promise.all([first, second]);
    expect(persisted).toEqual({ first: true, second: true });
  });

  it("continues processing after an operation rejects", async () => {
    const queue = createMutationQueue();
    const failure = queue.run(async () => {
      throw new Error("Injected failure");
    });
    const retry = queue.run(async () => "saved");

    await expect(failure).rejects.toThrow("Injected failure");
    await expect(retry).resolves.toBe("saved");
  });
});
