import { CloudRevisionConflictError, type CloudApiClient, type CloudStateEnvelope } from "../storage/cloudApi";
import type { StorageSnapshot } from "../storage/StorageAdapter";
import { snapshot, timestamp } from "./assessmentFixtures";

// One revision-aware server shared by otherwise independent browser adapters.
export class RevisionApi implements CloudApiClient {
  async reconcileDocuments() { return { removed: 0, failed: 0, pending: 0 }; }
  state: CloudStateEnvelope;
  conflicts = 0;
  files = new Map<string, Blob>();
  beforeSave?: () => void;
  constructor(data = snapshot()) {
    this.state = { revision: 1, snapshot: structuredClone(data), updatedAt: timestamp };
  }
  async getSession() { return { id: "owner", email: "owner@example.edu" }; }
  async getState() { return structuredClone(this.state); }
  async saveState(data: StorageSnapshot, revision: number | null) {
    this.beforeSave?.();
    if (revision !== this.state.revision) {
      this.conflicts++;
      throw new CloudRevisionConflictError(structuredClone(this.state));
    }
    this.state = { revision: revision + 1, snapshot: structuredClone(data), updatedAt: timestamp };
    return structuredClone(this.state);
  }
  async putResumeFile(key: string, file: Blob) { this.files.set(key, file); }
  async getResumeFile(key: string) { return this.files.get(key)!; }
  async deleteResumeFile(key: string) { this.files.delete(key); }
}
