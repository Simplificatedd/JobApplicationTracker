import { createRemoteJWKSet, jwtVerify } from "jose";
import { HttpError } from "./http";
import type {
  AccessTokenVerifier,
  AuthenticatedUser,
  CloudflareEnv,
} from "./types";

const jwksByTeamDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizeTeamDomain(value: string) {
  const normalized = value.trim().replace(/\/$/, "");

  if (!/^https:\/\/[a-z0-9.-]+\.cloudflareaccess\.com$/i.test(normalized)) {
    throw new HttpError(500, "Cloudflare Access is not configured correctly.");
  }

  return normalized;
}

async function verifyAccessToken(
  token: string,
  options: { audience: string; issuer: string },
) {
  let jwks = jwksByTeamDomain.get(options.issuer);

  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${options.issuer}/cdn-cgi/access/certs`),
    );
    jwksByTeamDomain.set(options.issuer, jwks);
  }

  const result = await jwtVerify(token, jwks, options);
  return result.payload;
}

export async function authenticateAccessRequest(
  request: Request,
  env: Pick<CloudflareEnv, "POLICY_AUD" | "TEAM_DOMAIN">,
  verify: AccessTokenVerifier = verifyAccessToken,
): Promise<AuthenticatedUser> {
  const audience = env.POLICY_AUD?.trim();
  const issuer = normalizeTeamDomain(env.TEAM_DOMAIN ?? "");

  if (!audience) {
    throw new HttpError(500, "Cloudflare Access is not configured correctly.");
  }

  const token = request.headers.get("cf-access-jwt-assertion");

  if (!token) {
    throw new HttpError(401, "Sign in through Cloudflare Access to continue.");
  }

  try {
    const payload = await verify(token, { audience, issuer });
    const id = payload.sub?.trim();
    const email = typeof payload.email === "string" ? payload.email.trim() : "";

    if (!id || !email) {
      throw new Error("Required identity claims are missing.");
    }

    return { email, id };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(401, "The Cloudflare Access session is invalid.");
  }
}
