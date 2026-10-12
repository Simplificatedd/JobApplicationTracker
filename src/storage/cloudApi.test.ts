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
  it.each([
    { error: "This workspace uses a newer data format. Refresh or update the tracker before saving." },
    { current: { revision: 4 }, error: "Invalid conflict response." },
    { current: [], error: "Invalid conflict response." },
    {},
    null,
    "invalid response",
  ])("keeps non-revision conflicts out of retry handling: %j", async (body) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(body, { status: 409 }),
    );
    const client = createCloudApiClient({ fetcher, retryDelays: [0, 0] });
    const error = await client.saveState(snapshot, 3).catch((error: unknown) => error);

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
    await expect(client.saveState(snapshot, 3)).rejects.toMatchObject({
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
    const error = await client.saveState(snapshot, 3).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(CloudRevisionConflictError);
    expect(error).toMatchObject({ current: null, status: 409 });
  });

  it("retries transient failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({ email: "student@example.edu" }),
      );
    const client = createCloudApiClient({ fetcher, retryDelays: [0] });

    await expect(client.getSession()).resolves.toEqual({
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

    await expect(client.saveState(snapshot, 3)).rejects.toMatchObject({
      current,
      status: 409,
    } satisfies Partial<CloudRevisionConflictError>);
  });
});
