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

  it("derives competing contact counts from the latest aggregate", async () => {
    const queue = createMutationQueue();
    let persisted = {
      contacts: ["contact-1", "contact-2"],
      contactsCount: 2,
    };
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });

    const deleteContact = (id: string, pause = false) =>
      queue.run(async () => {
        const remainingContacts = persisted.contacts.filter(
          (contactId) => contactId !== id,
        );

        if (pause) {
          markFirstStarted();
          await firstCanFinish;
        }

        persisted = {
          contacts: remainingContacts,
          contactsCount: remainingContacts.length,
        };
      });

    const first = deleteContact("contact-1", true);
    const second = deleteContact("contact-2");
    await firstStarted;
    releaseFirst();

    await Promise.all([first, second]);
    expect(persisted).toEqual({ contacts: [], contactsCount: 0 });
  });

  it("does not recreate an aggregate when an update follows its deletion", async () => {
    const queue = createMutationQueue();
    let persisted: { id: string; title: string } | undefined = {
      id: "app-1",
      title: "Initial",
    };

    const deletion = queue.run(async () => {
      persisted = undefined;
    });
    const update = queue.run(async () => {
      if (!persisted) {
        return false;
      }

      persisted = { ...persisted, title: "Updated" };
      return true;
    });

    await expect(deletion).resolves.toBeUndefined();
    await expect(update).resolves.toBe(false);
    expect(persisted).toBeUndefined();
  });
});
