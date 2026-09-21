import { IDBFactory } from "fake-indexeddb";
import { createIndexedDbStorageAdapter } from "../storage/indexedDbAdapter";

let databaseSequence = 0;

export function createTestStorageAdapter() {
  databaseSequence += 1;

  return createIndexedDbStorageAdapter({
    databaseName: `job-application-tracker-test-${databaseSequence}`,
    indexedDb: new IDBFactory(),
  });
}
