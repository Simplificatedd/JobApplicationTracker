import { describe, expect, it, vi } from "vitest";
import {
  CloudApiError,
  CloudRevisionConflictError,
  createCloudApiClient,
} from "./cloudApi";
import {
  DEFAULT_ANALYTICS_SETTINGS,
  DEFAULT_NOTIFICATION_STATE,
  DEFAULT_USER_SETTINGS,
} from "../lib/domain";
import { snapshotWithBytes } from "../test/snapshotSize";
import { CLOUD_SNAPSHOT_SIZE_MESSAGE, MAX_CLOUD_SNAPSHOT_BYTES } from "./snapshotSize";

const snapshot = {
  activities: [],
  analyticsSettings: DEFAULT_ANALYTICS_SETTINGS,
  applications: [],
  contacts: [],
  coverLetters: [],
  interviews: [],
  notificationState: DEFAULT_NOTIFICATION_STATE,
  resumes: [],
  settings: DEFAULT_USER_SETTINGS,
  tablePreferences: null,
};

describe("cloud API client", () => {
  it.each([-1, 0, 1])("validates stored snapshot bytes before network I/O at limit %+d", async (offset) => {
    const data = snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES + offset);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ revision: 4, snapshot, updatedAt: "now" }));
    const client = createCloudApiClient({ fetcher, retryDelays: [0, 0] });
    if (offset > 0) {
      const error = await client.saveState(data, 3, "owner").catch((error: unknown) => error);
      expect(error).toBeInstanceOf(CloudApiError);
      expect(error).not.toBeInstanceOf(CloudRevisionConflictError);
      expect(error).toMatchObject({ status: 413, message: CLOUD_SNAPSHOT_SIZE_MESSAGE });
      expect(fetcher).not.toHaveBeenCalled();
    } else {
      await client.saveState(data, 3, "owner");
      expect(fetcher).toHaveBeenCalledTimes(1);
      const body = String(fetcher.mock.calls[0][1]?.body);
      const value = JSON.parse(body);
      expect(new TextEncoder().encode(JSON.stringify(value.snapshot)).byteLength).toBe(MAX_CLOUD_SNAPSHOT_BYTES + offset);
      expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(MAX_CLOUD_SNAPSHOT_BYTES);
      expect(value.baseRevision).toBe(3);
    }
  });

  it("surfaces server size rejections as permanent 413 failures without replay", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: CLOUD_SNAPSHOT_SIZE_MESSAGE }, { status: 413 }));
    const client = createCloudApiClient({ fetcher, retryDelays: [0, 0] });
    const error = await client.saveState(snapshot, 1, "owner").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(CloudApiError);
    expect(error).not.toBeInstanceOf(CloudRevisionConflictError);
    expect(error).toMatchObject({ status: 413, message: CLOUD_SNAPSHOT_SIZE_MESSAGE });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("requires a verified stable identity and binds data requests to it", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ email: "student@example.edu" }))
      .mockResolvedValueOnce(Response.json({ id: "student-id", email: "student@example.edu" }))
      .mockResolvedValueOnce(Response.json({ error: "Cloud state has not been created." }, { status: 404 }));
    const client = createCloudApiClient({ fetcher, retryDelays: [] });

    await expect(client.getSession()).rejects.toMatchObject({
      message: "The signed-in account has no verified identity.",
    });
    await expect(client.getSession()).resolves.toEqual({
      id: "student-id", email: "student@example.edu",
    });
    await expect(client.getState("student-id")).resolves.toBeNull();
    expect(fetcher.mock.calls[2][1]?.headers).toMatchObject({
      "X-Tracker-Account-Id": "student-id",
    });
  });

  it.each([
    { error: "This workspace uses a newer data format. Refresh or update the tracker before saving." },
    { current: { revision: 4 }, error: "Invalid conflict response." },
    { current: [], error: "Invalid conflict response." },
    { current: { revision: 4, snapshot: {}, updatedAt: "2026-10-13T00:00:00Z" } },
    { current: { revision: 4, snapshot: { ...snapshot, settings: null }, updatedAt: "2026-10-13T00:00:00Z" } },
    { current: { revision: 4, snapshot: { ...snapshot, applications: null }, updatedAt: "2026-10-13T00:00:00Z" } },
    { current: { revision: 0, snapshot, updatedAt: "2026-10-13T00:00:00Z" } },
    {},
    null,
    "invalid response",
  ])("keeps non-revision conflicts out of retry handling: %j", async (body) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(body, { status: 409 }),
    );
    const client = createCloudApiClient({ fetcher, retryDelays: [0, 0] });
    const error = await client.saveState(snapshot, 3, "student-id").catch((error: unknown) => error);

    expect(error).toBeInstanceOf(CloudApiError);
    expect(error).not.toBeInstanceOf(CloudRevisionConflictError);
    expect(error).toMatchObject({
      status: 409,
      message: body && typeof body === "object" && "error" in body
        ? body.error
        : "Cloud storage request failed (409). Refresh the tracker and try again.",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("provides a useful fallback for non-JSON conflict responses", async () => {
    const client = createCloudApiClient({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response("<html>Conflict</html>", { status: 409 }),
      ),
      retryDelays: [],
    });
    await expect(client.saveState(snapshot, 3, "student-id")).rejects.toMatchObject({
      status: 409,
      message: "Cloud storage request failed (409). Refresh the tracker and try again.",
    });
  });

  it("preserves an explicit null revision-conflict state", async () => {
    const client = createCloudApiClient({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({ current: null }, { status: 409 }),
      ),
      retryDelays: [],
    });
    const error = await client.saveState(snapshot, 3, "student-id").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(CloudRevisionConflictError);
    expect(error).toMatchObject({ current: null, status: 409 });
  });

  it("accepts legacy conflict snapshots and preserves unknown extensions", async () => {
    const current = {
      revision: 4,
      snapshot: { ...snapshot, coverLetters: undefined, assessments: undefined, extension: { keep: true } },
      updatedAt: "2026-10-13T00:00:00Z",
      extension: "keep",
    };
    const client = createCloudApiClient({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ current }, { status: 409 })),
      retryDelays: [],
    });
    const error = await client.saveState(snapshot, 3, "student-id").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(CloudRevisionConflictError);
    expect(error).toMatchObject({ current: JSON.parse(JSON.stringify(current)) });
  });

  it("retries transient failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({ id: "student-id", email: "student@example.edu" }),
      );
    const client = createCloudApiClient({ fetcher, retryDelays: [0] });

    await expect(client.getSession()).resolves.toEqual({
      id: "student-id",
      email: "student@example.edu",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retry authentication failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ error: "Sign in again." }, { status: 401 }),
      );
    const client = createCloudApiClient({ fetcher, retryDelays: [0, 0] });

    await expect(client.getSession()).rejects.toMatchObject({
      message: "Sign in again.",
      status: 401,
    } satisfies Partial<CloudApiError>);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not replay snapshot writes after a server failure with an uncertain commit outcome", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "Service unavailable" }, { status: 503 }));
    const client = createCloudApiClient({ fetcher, retryDelays: [0, 0] });
    await expect(client.saveState(snapshot, 3, "student-id")).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sends the mutation protocol on state and file writes and surfaces upgrade-required failures", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ revision: 4, snapshot, updatedAt: "now" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ error: "Reload the tracker." }, { status: 426 }));
    const client = createCloudApiClient({ fetcher, retryDelays: [0, 0] });
    await client.saveState(snapshot, 3, "student-id");
    await client.putResumeFile("file", new Blob(["resume"]), "student-id");
    await client.deleteResumeFile("file", "student-id");
    await expect(client.saveState(snapshot, 4, "student-id")).rejects.toMatchObject({ status: 426, message: "Reload the tracker." });
    expect(fetcher).toHaveBeenCalledTimes(4);
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.headers).toMatchObject({ "X-Tracker-Account-Id": "student-id", "X-Tracker-Mutation-Protocol": "1" });
    }
  });

  it("returns the server state with a revision conflict", async () => {
    const current = {
      revision: 4,
      snapshot,
      updatedAt: "2026-09-22T00:00:00.000Z",
    };
    const client = createCloudApiClient({
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { current, error: "Cloud data changed in another session." },
            { status: 409 },
          ),
        ),
      retryDelays: [],
    });

    await expect(client.saveState(snapshot, 3, "student-id")).rejects.toMatchObject({
      current,
      status: 409,
    } satisfies Partial<CloudRevisionConflictError>);
  });
});
