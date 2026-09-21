import { IDBFactory } from "fake-indexeddb";
import {
  createIndexedDbStorageAdapter,
  type IndexedDbStorageAdapterOptions,
} from "../storage/indexedDbAdapter";

let databaseSequence = 0;

export function createTestStorageAdapter(
  options: Omit<IndexedDbStorageAdapterOptions, "databaseName" | "indexedDb"> & {
    databaseName?: string;
    indexedDb?: IDBFactory;
  } = {},
) {
  databaseSequence += 1;

  return createIndexedDbStorageAdapter({
    ...options,
    databaseName:
      options.databaseName ?? `job-application-tracker-test-${databaseSequence}`,
    indexedDb: options.indexedDb ?? new IDBFactory(),
  });
}
