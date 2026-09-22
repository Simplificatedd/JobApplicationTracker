import { describe, expect, it } from "vitest";
import { HttpError } from "./http";
import {
  MAX_TOTAL_RESUME_BYTES,
  MAX_USER_RESUME_BYTES,
  requireAvailableResumeQuota,
  requireAvailableTotalResumeQuota,
} from "./resumeFiles";

describe("resume storage quota", () => {
  it("allows a replacement that remains within the per-user quota", () => {
    expect(() =>
      requireAvailableResumeQuota(
        MAX_USER_RESUME_BYTES - 10 * 1024 * 1024,
        10 * 1024 * 1024,
      ),
    ).not.toThrow();
  });

  it("rejects a write that exceeds the per-user quota", () => {
    expect(() =>
      requireAvailableResumeQuota(MAX_USER_RESUME_BYTES, 1),
    ).toThrowError(
      expect.objectContaining({ status: 413 }) as unknown as HttpError,
    );
  });

  it("rejects a write that exceeds the account storage budget", () => {
    expect(() =>
      requireAvailableTotalResumeQuota(MAX_TOTAL_RESUME_BYTES, 1),
    ).toThrowError(
      expect.objectContaining({ status: 507 }) as unknown as HttpError,
    );
  });
});
