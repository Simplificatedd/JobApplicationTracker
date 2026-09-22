import { describe, expect, it, vi } from "vitest";
import { authenticateAccessRequest } from "./auth";
import { HttpError } from "./http";

const env = {
  POLICY_AUD: "application-audience",
  TEAM_DOMAIN: "https://students.cloudflareaccess.com",
};

function request(token?: string) {
  return new Request("https://tracker.example/api/session", {
    headers: token ? { "cf-access-jwt-assertion": token } : undefined,
  });
}

describe("authenticateAccessRequest", () => {
  it("requires the Access assertion header", async () => {
    await expect(
      authenticateAccessRequest(request(), env, vi.fn()),
    ).rejects.toMatchObject({ status: 401 } satisfies Partial<HttpError>);
  });

  it("validates the issuer and audience before trusting identity claims", async () => {
    const verify = vi.fn().mockResolvedValue({
      email: "student@example.edu",
      sub: "access-user-123",
    });

    await expect(
      authenticateAccessRequest(request("signed-token"), env, verify),
    ).resolves.toEqual({
      email: "student@example.edu",
      id: "access-user-123",
    });
    expect(verify).toHaveBeenCalledWith("signed-token", {
      audience: env.POLICY_AUD,
      issuer: env.TEAM_DOMAIN,
    });
  });

  it("rejects invalid tokens and incomplete identity claims", async () => {
    await expect(
      authenticateAccessRequest(
        request("invalid"),
        env,
        vi.fn().mockRejectedValue(new Error("bad signature")),
      ),
    ).rejects.toMatchObject({ status: 401 } satisfies Partial<HttpError>);

    await expect(
      authenticateAccessRequest(
        request("missing-email"),
        env,
        vi.fn().mockResolvedValue({ sub: "access-user-123" }),
      ),
    ).rejects.toMatchObject({ status: 401 } satisfies Partial<HttpError>);
  });

  it("fails closed when the Access configuration is invalid", async () => {
    await expect(
      authenticateAccessRequest(
        request("signed-token"),
        { POLICY_AUD: "", TEAM_DOMAIN: "https://example.com" },
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 500 } satisfies Partial<HttpError>);
  });

  it("allows an explicit local identity only on loopback hosts", async () => {
    const localEnv = { ...env, LOCAL_DEV_AUTH_EMAIL: "local@example.edu" };

    await expect(
      authenticateAccessRequest(
        new Request("http://127.0.0.1:8788/api/session"),
        localEnv,
        vi.fn(),
      ),
    ).resolves.toEqual({
      email: "local@example.edu",
      id: "local:local@example.edu",
    });
    await expect(
      authenticateAccessRequest(
        new Request("https://tracker.example/api/session"),
        localEnv,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 401 } satisfies Partial<HttpError>);
  });
});
