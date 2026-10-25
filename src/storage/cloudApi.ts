import type { StorageSnapshot } from "./StorageAdapter";
import { MUTATION_PROTOCOL_HEADER, MUTATION_PROTOCOL_VERSION } from "./mutationProtocol";
import { CloudSnapshotSizeError, serializeCloudSnapshot } from "./snapshotSize";

export interface CloudAccount {
  id: string;
  email: string;
}

export interface CloudStateEnvelope {
  revision: number;
  snapshot: StorageSnapshot;
  updatedAt: string;
}

export class CloudApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export class CloudRevisionConflictError extends CloudApiError {
  constructor(public readonly current: CloudStateEnvelope | null) {
    super("Cloud data changed in another session.", 409);
  }
}

export interface CloudApiClient {
  deleteResumeFile(storageKey: string, accountId: string): Promise<void>;
  getResumeFile(storageKey: string, accountId: string): Promise<Blob>;
  getSession(): Promise<CloudAccount>;
  getState(accountId: string): Promise<CloudStateEnvelope | null>;
  putResumeFile(storageKey: string, file: Blob, accountId: string): Promise<void>;
  saveState(
    snapshot: StorageSnapshot,
    baseRevision: number | null,
    accountId: string,
  ): Promise<CloudStateEnvelope>;
}

export interface CloudApiClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  retryDelays?: readonly number[];
}

export function createCloudApiClient(
  options: CloudApiClientOptions = {},
): CloudApiClient {
  const baseUrl = options.baseUrl ?? "/api";
  const fetcher = options.fetcher ?? fetch;
  const retryDelays = options.retryDelays ?? [150, 500];

  async function request(path: string, init: RequestInit = {}) {
    let lastError: unknown;
    // A lost response may hide a successful commit followed by another session's
    // deletion. Replaying the request and rebasing a 409 could recreate that ID.
    // Keep transport retries for reads/files; an ambiguous snapshot save requires
    // the user to reload and inspect the outcome instead of replaying intent.
    const stateWrite = path === "/state" && init.method === "PUT";
    const delays = stateWrite ? [] : retryDelays;

    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        const response = await fetcher(`${baseUrl}${path}`, {
          ...init,
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            ...(init.method === "PUT" || init.method === "DELETE"
              ? { [MUTATION_PROTOCOL_HEADER]: MUTATION_PROTOCOL_VERSION } : {}),
            ...init.headers,
          },
        });

        if (
          attempt < delays.length &&
          (response.status === 429 || response.status >= 500)
        ) {
          await delay(delays[attempt]);
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;

        if (attempt >= delays.length) {
          break;
        }

        await delay(delays[attempt]);
      }
    }

    throw new CloudApiError(
      stateWrite
        ? "The save outcome could not be confirmed. Reload the tracker and inspect the current data before retrying."
        : lastError instanceof Error
        ? `Cloud storage is unavailable. ${lastError.message}`
        : "Cloud storage is unavailable.",
      0,
    );
  }

  async function requireSuccess(response: Response) {
    if (response.ok) {
      return response;
    }

    let message = `Cloud storage request failed (${response.status}).`;

    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string") {
        message = body.error;
      }
    } catch {
      // Keep the status-based fallback for non-JSON proxy or platform errors.
    }

    throw new CloudApiError(message, response.status);
  }

  return {
    async getSession() {
      const response = await requireSuccess(await request("/session"));
      const account: unknown = await response.json();
      if (!isRecord(account) || typeof account.id !== "string" ||
        !account.id.trim() || typeof account.email !== "string" ||
        !account.email.trim()) {
        throw new CloudApiError("The signed-in account has no verified identity.", 0);
      }
      return { id: account.id, email: account.email };
    },

    async getState(accountId) {
      const response = await request("/state", {
        headers: { "X-Tracker-Account-Id": accountId },
      });

      if (response.status === 404) {
        return null;
      }

      await requireSuccess(response);
      return (await response.json()) as CloudStateEnvelope;
    },

    async saveState(snapshot, baseRevision, accountId) {
      let snapshotJson: string;
      try {
        snapshotJson = serializeCloudSnapshot(snapshot).json;
      } catch (error) {
        if (error instanceof CloudSnapshotSizeError) throw new CloudApiError(error.message, 413);
        throw error;
      }
      const response = await request("/state", {
        body: `{"baseRevision":${JSON.stringify(baseRevision)},"snapshot":${snapshotJson}}`,
        headers: { "Content-Type": "application/json", "X-Tracker-Account-Id": accountId },
        method: "PUT",
      });

      if (response.status === 409) {
        const body: unknown = await response.json().catch(() => null);
        if (body && typeof body === "object" && "current" in body) {
          const current = body.current;
          if (current === null || isCloudStateEnvelope(current)) {
            throw new CloudRevisionConflictError(current);
          }
        }
        const message =
          body && typeof body === "object" && "error" in body &&
          typeof body.error === "string" && body.error.trim()
            ? body.error
            : "Cloud storage request failed (409). Refresh the tracker and try again.";
        throw new CloudApiError(message, 409);
      }

      await requireSuccess(response);
      return (await response.json()) as CloudStateEnvelope;
    },

    async putResumeFile(storageKey, file, accountId) {
      await requireSuccess(
        await request(`/resume-files/${encodeURIComponent(storageKey)}`, {
          body: file,
          headers: { "Content-Type": file.type, "X-Tracker-Account-Id": accountId },
          method: "PUT",
        }),
      );
    },

    async getResumeFile(storageKey, accountId) {
      const response = await requireSuccess(
        await request(`/resume-files/${encodeURIComponent(storageKey)}`, {
          headers: { Accept: "application/octet-stream", "X-Tracker-Account-Id": accountId },
        }),
      );
      return response.blob();
    },

    async deleteResumeFile(storageKey, accountId) {
      await requireSuccess(
        await request(`/resume-files/${encodeURIComponent(storageKey)}`, {
          headers: { "X-Tracker-Account-Id": accountId },
          method: "DELETE",
        }),
      );
    },
  };
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function isCloudStateEnvelope(value: unknown): value is CloudStateEnvelope {
  if (
    !isRecord(value) || !Number.isInteger(value.revision) ||
    typeof value.revision !== "number" || value.revision < 1 ||
    typeof value.updatedAt !== "string" || !isRecord(value.snapshot)
  ) return false;
  const snapshot = value.snapshot;
  return (
    ["activities", "applications", "contacts", "interviews", "resumes"].every(
      (key) => Array.isArray(snapshot[key]),
    ) &&
    ["settings", "notificationState", "analyticsSettings"].every(
      (key) => isRecord(snapshot[key]),
    ) &&
    ["coverLetters", "assessments"].every(
      (key) => snapshot[key] === undefined || Array.isArray(snapshot[key]),
    ) &&
    (snapshot.tablePreferences == null || isRecord(snapshot.tablePreferences))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export const cloudApiClient = createCloudApiClient();
