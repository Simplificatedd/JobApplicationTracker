import type { JWTPayload } from "jose";
import type { StorageSnapshot } from "../../src/storage/StorageAdapter";

export interface CloudflareEnv {
  DB: D1Database;
  LOCAL_DEV_AUTH_EMAIL?: string;
  POLICY_AUD: string;
  RESUME_FILES: R2Bucket;
  TEAM_DOMAIN: string;
}

export interface AuthenticatedUser {
  email: string;
  id: string;
}

export interface CloudStateEnvelope {
  revision: number;
  snapshot: StorageSnapshot;
  updatedAt: string;
}

export interface SaveStateRequest {
  baseRevision: number | null;
  snapshot: StorageSnapshot;
}

export type AccessTokenVerifier = (
  token: string,
  options: { audience: string; issuer: string },
) => Promise<JWTPayload>;
