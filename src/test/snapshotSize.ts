import type { StorageSnapshot } from "../storage/StorageAdapter";
import { snapshot } from "./assessmentFixtures";

// ASCII padding gives exact UTF-8 JSON boundaries without giant static fixtures.
export function snapshotWithBytes(bytes: number, source = snapshot()): StorageSnapshot {
  const data = structuredClone(source);
  data.applications[0].notes = "";
  const initial = new TextEncoder().encode(JSON.stringify(data)).byteLength;
  if (bytes < initial) throw new Error("Requested size is below the fixture's minimum.");
  data.applications[0].notes = "x".repeat(bytes - initial);
  return data;
}
