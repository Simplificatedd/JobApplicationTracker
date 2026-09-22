import type { StorageSnapshot } from "./StorageAdapter";

export interface CloudAccount {
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
  deleteResumeFile(storageKey: string): Promise<void>;
  getResumeFile(storageKey: string): Promise<Blob>;
  getSession(): Promise<CloudAccount>;
  getState(): Promise<CloudStateEnvelope | null>;
  putResumeFile(storageKey: string, file: Blob): Promise<void>;
  saveState(
    snapshot: StorageSnapshot,
    baseRevision: number | null,
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

    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        const response = await fetcher(`${baseUrl}${path}`, {
          ...init,
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            ...init.headers,
          },
        });

        if (
          attempt < retryDelays.length &&
          (response.status === 429 || response.status >= 500)
        ) {
          await delay(retryDelays[attempt]);
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;

        if (attempt >= retryDelays.length) {
          break;
        }

        await delay(retryDelays[attempt]);
      }
    }

    throw new CloudApiError(
      lastError instanceof Error
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
      return (await response.json()) as CloudAccount;
    },

    async getState() {
      const response = await request("/state");

      if (response.status === 404) {
        return null;
      }

      await requireSuccess(response);
      return (await response.json()) as CloudStateEnvelope;
    },

    async saveState(snapshot, baseRevision) {
      const response = await request("/state", {
        body: JSON.stringify({ baseRevision, snapshot }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });

      if (response.status === 409) {
        const body = (await response.json()) as {
          current?: CloudStateEnvelope | null;
        };
        throw new CloudRevisionConflictError(body.current ?? null);
      }

      await requireSuccess(response);
      return (await response.json()) as CloudStateEnvelope;
    },

    async putResumeFile(storageKey, file) {
      await requireSuccess(
        await request(`/resume-files/${encodeURIComponent(storageKey)}`, {
          body: file,
          headers: { "Content-Type": file.type },
          method: "PUT",
        }),
      );
    },

    async getResumeFile(storageKey) {
      const response = await requireSuccess(
        await request(`/resume-files/${encodeURIComponent(storageKey)}`, {
          headers: { Accept: "application/octet-stream" },
        }),
      );
      return response.blob();
    },

    async deleteResumeFile(storageKey) {
      await requireSuccess(
        await request(`/resume-files/${encodeURIComponent(storageKey)}`, {
          method: "DELETE",
        }),
      );
    },
  };
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export const cloudApiClient = createCloudApiClient();
